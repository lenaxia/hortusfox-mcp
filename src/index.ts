#!/usr/bin/env node
import {
  createServer as createHttpServer,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig, type Config } from "./config.js";
import { HortusFoxClient } from "./client.js";
import { HortusFoxError } from "./errors.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

export interface AssembledServer {
  server: McpServer;
  client: HortusFoxClient;
  config: Config;
}

export function createServer(config: Config): AssembledServer {
  const client = new HortusFoxClient(config);
  const server = new McpServer({
    name: "hortusfox",
    version: "0.4.0",
  });
  registerAllResources(server, client);
  registerAllTools(server, client, config);
  server.server.onerror = (err) => {
    if (err instanceof HortusFoxError) {
      console.error(`[hortusfox-mcp] ${err.kind}: ${err.message}`);
    } else {
      console.error(`[hortusfox-mcp] error:`, err);
    }
  };
  return { server, client, config };
}

async function runStdio(config: Config): Promise<void> {
  const { server } = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[hortusfox-mcp] stdio transport ready");
}

async function runHttp(config: Config): Promise<void> {
  // Map of sessionId -> transport for stateful sessions.
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createHttpServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost`);

      // Health endpoint for liveness/readiness probes.
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // All MCP traffic goes to /mcp.
      if (url.pathname !== "/mcp") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // DELETE: client closing a session.
      if (req.method === "DELETE") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (sessionId && sessions.has(sessionId)) {
          const t = sessions.get(sessionId)!;
          await t.close();
          sessions.delete(sessionId);
          console.error(`[hortusfox-mcp] session closed: ${sessionId}`);
        }
        res.writeHead(200);
        res.end();
        return;
      }

      // POST / GET: MCP protocol messages.
      if (req.method === "POST" || req.method === "GET") {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        let transport: StreamableHTTPServerTransport;

        if (sessionId && sessions.has(sessionId)) {
          // Resume existing session.
          transport = sessions.get(sessionId)!;
        } else if (!sessionId && req.method === "POST") {
          // New session — only allowed on POST (initialize request).
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              sessions.set(id, transport);
              console.error(`[hortusfox-mcp] session opened: ${id}`);
            },
          });
          transport.onclose = () => {
            const id = transport.sessionId;
            if (id) {
              sessions.delete(id);
              console.error(`[hortusfox-mcp] session evicted: ${id}`);
            }
          };
          // Each session gets its own McpServer instance.
          const { server } = createServer(config);
          await server.connect(transport);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Bad request: missing or unknown session ID",
            }),
          );
          return;
        }

        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(405);
      res.end("Method not allowed");
    },
  );

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.httpPort, () => {
      console.error(
        `[hortusfox-mcp] streamable HTTP transport ready on :${config.httpPort}/mcp`,
      );
      resolve();
    });
  });

  // Graceful shutdown.
  const shutdown = async () => {
    console.error("[hortusfox-mcp] shutting down…");
    for (const [id, t] of sessions) {
      await t.close().catch(() => {});
      sessions.delete(id);
    }
    httpServer.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

export async function main(): Promise<void> {
  const config = loadConfig();
  if (config.transport === "http") {
    await runHttp(config);
  } else {
    await runStdio(config);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("[hortusfox-mcp] fatal:", err);
    process.exit(1);
  });
}
