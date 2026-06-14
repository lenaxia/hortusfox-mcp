import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../../src/client.js";
import { registerAllTools } from "../../src/tools/index.js";
import { startMockHortusFox } from "../helpers/hortusfox-mock.js";

const TOKEN = "real-token-1234567890";

function bodyText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

async function buildMcpClient(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
) {
  const config = {
    baseUrl,
    apiToken: TOKEN,
    verifyTls: true,
    timeoutMs: 5_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 100,
    ...overrides,
  };
  const hortusfox = new HortusFoxClient(config as never);
  const server = new McpServer({ name: "hortusfox-e2e", version: "0.0.0" });
  registerAllTools(server, hortusfox, config as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "e2e", version: "0.0.0" });
  await mcp.connect(b);
  return { mcp, close: () => mcp.close() };
}

describe("e2e: auth and error propagation", () => {
  it("U-e2e-010: wrong token -> 403 surfaces as auth error in MCP result", async () => {
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/list": () => ({
          status: 200,
          body: { code: 200, list: [] },
        }),
      },
      { token: "different-token" },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toMatch(/regenerate/i);
    } finally {
      await close();
      await mock.close();
    }
  });

  it("U-e2e-011: {code:500,msg} surfaces upstream msg in MCP result", async () => {
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/list": () => ({
          status: 200,
          body: { code: 500, msg: "DB connection refused" },
        }),
      },
      { token: TOKEN },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("DB connection refused");
    } finally {
      await close();
      await mock.close();
    }
  });

  it("U-e2e-012: HTTP 502 with HTML body surfaces HTTP status", async () => {
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/list": () =>
          ({
            status: 502,
            body: "<html>Bad Gateway</html>",
          }) as never,
      },
      { token: TOKEN },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("HTTP 502");
    } finally {
      await close();
      await mock.close();
    }
  });

  it("U-e2e-013: TCP unreachable -> network error result", async () => {
    const { mcp, close } = await buildMcpClient("http://127.0.0.1:9");
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("unreachable");
    } finally {
      await close();
    }
  });

  it("E-e2e-014: timeout -> network error mentioning timed out", async () => {
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/list": () => ({
          status: 200,
          body: { code: 200, list: [] },
        }),
      },
      { token: TOKEN, latencyMs: 500 },
    );
    const { mcp, close } = await buildMcpClient(mock.url, { timeoutMs: 50 });
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("timed out after 50ms");
    } finally {
      await close();
      await mock.close();
    }
  });

  it("H-e2e-015: 403 error message includes masked token preview", async () => {
    const mock = await startMockHortusFox(
      { "GET /api/plants/list": () => ({ status: 200, body: { code: 200 } }) },
      { token: "different-token" },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      const text = bodyText(result);
      expect(text).toMatch(/real.*90/);
      expect(text).not.toContain(TOKEN);
    } finally {
      await close();
      await mock.close();
    }
  });
});
