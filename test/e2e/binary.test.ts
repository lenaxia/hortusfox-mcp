import { spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

const ENV = {
  HORTUSFOX_BASE_URL: "http://127.0.0.1:9",
  HORTUSFOX_API_TOKEN: "binary-test-token-1234567890",
};

function ensureBuilt(): void {
  if (!existsSync("dist/index.js")) {
    execSync("npm run build", { stdio: "inherit" });
  }
}

interface JsonRpcResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function spawnBinary(): {
  child: ReturnType<typeof spawn>;
  send: (obj: unknown) => void;
  nextResponse: () => Promise<JsonRpcResponse>;
  close: () => void;
} {
  const child = spawn("node", ["dist/index.js"], {
    env: { ...process.env, ...ENV },
    stdio: ["pipe", "pipe", "inherit"],
  });

  let buffer = "";
  const pending: Array<(r: JsonRpcResponse) => void> = [];

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        const parsed = JSON.parse(line) as JsonRpcResponse;
        const resolver = pending.shift();
        if (resolver) resolver(parsed);
      }
    }
  });

  return {
    child,
    send(obj) {
      child.stdin.write(JSON.stringify(obj) + "\n");
    },
    nextResponse() {
      return new Promise<JsonRpcResponse>((resolve) => {
        pending.push(resolve);
      });
    },
    close() {
      child.kill("SIGTERM");
    },
  };
}

describe(
  "e2e: binary entry point",
  () => {
    const cleanup: Array<() => void> = [];

    beforeAll(() => {
      ensureBuilt();
    });

    afterAll(() => {
      for (const fn of cleanup) fn();
    });

    it("H-bin-001: binary completes MCP initialize handshake", async () => {
      const session = spawnBinary();
      cleanup.push(session.close);
      session.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "binary-test", version: "0.0.1" },
        },
      });
      const res = await session.nextResponse();
      expect(res.result).toMatchObject({
        serverInfo: { name: "hortusfox", version: "0.4.0" },
      });
    }, 15_000);

    it("H-bin-002: binary exposes 37 tools after initialized notification", async () => {
      const session = spawnBinary();
      cleanup.push(session.close);
      session.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "binary-test", version: "0.0.1" },
        },
      });
      await session.nextResponse();
      session.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      session.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const res = await session.nextResponse();
      const tools = (res.result as { tools: Array<{ name: string }> }).tools;
      expect(tools).toHaveLength(37);
      expect(tools.map((t) => t.name)).toContain("plants_list");
    }, 15_000);

    it("U-bin-003: binary exits 1 when HORTUSFOX_BASE_URL missing", async () => {
      const child = spawn("node", ["dist/index.js"], {
        env: {
          ...process.env,
          HORTUSFOX_BASE_URL: "",
          HORTUSFOX_API_TOKEN: "x",
        },
        stdio: ["pipe", "pipe", "inherit"],
      });
      const code = await new Promise<number | null>((resolve) => {
        child.on("close", resolve);
      });
      expect(code).toBe(1);
    }, 10_000);

    it("U-bin-004: binary exits 1 when HORTUSFOX_API_TOKEN missing", async () => {
      const child = spawn("node", ["dist/index.js"], {
        env: {
          ...process.env,
          HORTUSFOX_BASE_URL: "http://localhost",
          HORTUSFOX_API_TOKEN: "",
        },
        stdio: ["pipe", "pipe", "inherit"],
      });
      const code = await new Promise<number | null>((resolve) => {
        child.on("close", resolve);
      });
      expect(code).toBe(1);
    }, 10_000);

    it("H-bin-005: binary shuts down cleanly on SIGTERM", async () => {
      const session = spawnBinary();
      session.send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "binary-test", version: "0.0.1" },
        },
      });
      await session.nextResponse();
      const outcome = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve) => {
        session.child.on("close", (code, signal) => resolve({ code, signal }));
        session.child.kill("SIGTERM");
      });
      expect(outcome.signal ?? outcome.code).not.toBe(null);
      session.child.stdin?.destroy();
    }, 10_000);
  },
  { timeout: 60_000 },
);
