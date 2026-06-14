import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: { method: string; path: string; query: URLSearchParams; body: unknown }
) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

export interface MockHortusFox {
  url: string;
  close(): Promise<void>;
  requests: Array<{ method: string; path: string; query: Record<string, string>; body: unknown }>;
  setState(state: Record<string, unknown>): void;
  state: Record<string, unknown>;
}

interface StartOptions {
  token: string;
  port?: number;
  latencyMs?: number;
}

export async function startMockHortusFox(
  routes: Record<string, RouteHandler>,
  opts: StartOptions
): Promise<MockHortusFox> {
  const requests: MockHortusFox["requests"] = [];
  const state: Record<string, unknown> = {};
  const server: Server = createServer(async (req, res) => {
    const method = (req.method ?? "GET").toUpperCase();
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    const query = url.searchParams;

    const bodyText = await readBody(req);
    let parsedBody: unknown = undefined;
    if (bodyText) {
      try { parsedBody = JSON.parse(bodyText); } catch { parsedBody = bodyText; }
    }

    requests.push({
      method,
      path,
      query: Object.fromEntries(query.entries()),
      body: parsedBody,
    });

    if (opts.latencyMs) await delay(opts.latencyMs);

    if (query.get("token") !== opts.token) {
      sendJson(res, 403, { code: 403, invalid_token: query.get("token") ?? "" });
      return;
    }

    const key = `${method} ${path}`;
    const handler = routes[key] ?? routes[path];
    if (!handler) {
      sendJson(res, 500, { code: 500, msg: `unknown endpoint ${key}` });
      return;
    }
    try {
      const result = await handler(req, res, { method, path, query, body: parsedBody });
      if (!res.writableEnded) {
        sendJson(res, result.status, result.body ?? { code: 200 });
      }
    } catch (err) {
      if (!res.writableEnded) {
        sendJson(res, 500, { code: 500, msg: err instanceof Error ? err.message : String(err) });
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    requests,
    state,
    setState(s) {
      Object.assign(state, s);
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(text);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk.toString()));
    req.on("end", () => resolve(data));
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
