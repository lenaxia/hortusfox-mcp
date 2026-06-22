import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../../src/client.js";
import { registerAllResources } from "../../src/resources/index.js";
import { registerAllTools } from "../../src/tools/index.js";
import { startMockHortusFox } from "../helpers/hortusfox-mock.js";

const TOKEN = "real-token-1234567890";

function bodyText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

function resourceText(result: { contents?: unknown[] }): string {
  const contents = result.contents ?? [];
  const entry = contents[0] as { text?: string } | undefined;
  return entry?.text ?? "";
}

async function buildMcpClient(baseUrl: string) {
  const config = {
    baseUrl,
    apiToken: TOKEN,
    verifyTls: true,
    timeoutMs: 5_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 100,
  };
  const hortusfox = new HortusFoxClient(config as never);
  const server = new McpServer({ name: "hortusfox-e2e", version: "0.0.0" });
  registerAllResources(server, hortusfox);
  registerAllTools(server, hortusfox, config as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "e2e", version: "0.0.0" });
  await mcp.connect(b);
  return { mcp, close: () => mcp.close() };
}

describe("e2e: browse and search", () => {
  let mock: Awaited<ReturnType<typeof startMockHortusFox>>;
  let mcp: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    mock = await startMockHortusFox(
      {
        "GET /api/plants/list": (_r, _s, ctx) => {
          const loc = ctx.query.get("location");
          const all = [
            { id: 1, name: "Desert Rose", location: 4 },
            { id: 2, name: "Moon Cactus", location: 4 },
            { id: 3, name: "Pothos", location: 4 },
          ];
          const list = loc
            ? all.filter((p) => String(p.location) === loc)
            : all;
          return { status: 200, body: { code: 200, list } };
        },
        "GET /api/plants/search": (_r, _s, ctx) => {
          const expr = (ctx.query.get("expression") ?? "").toLowerCase();
          const all = [{ id: 1, name: "Desert Rose" }];
          return {
            status: 200,
            body: {
              code: 200,
              list: all.filter((p) => p.name.toLowerCase().includes(expr)),
            },
          };
        },
        "GET /api/plants/log/fetch": () => ({
          status: 200,
          body: { code: 200, log: [{ id: 1, content: "watered" }] },
        }),
      },
      { token: TOKEN },
    );
    const built = await buildMcpClient(mock.url);
    mcp = built.mcp;
    close = built.close;
  });

  afterAll(async () => {
    await close();
    await mock.close();
  });

  it("H-e2e-016: plants_search returns matches", async () => {
    const result = await mcp.callTool({
      name: "plants_search",
      arguments: { expression: "rose" },
    });
    const list = JSON.parse(bodyText(result)).list;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Desert Rose");
  });

  it("H-e2e-017: plants_list with location filter is forwarded", async () => {
    await mcp.callTool({
      name: "plants_list",
      arguments: { location: 4 },
    });
    const listCalls = mock.requests.filter(
      (r) => r.path === "/api/plants/list",
    );
    expect(listCalls.at(-1)?.query.location).toBe("4");
  });

  it("H-e2e-018: resources/read hortusfox://plants returns same shape as tool", async () => {
    const toolResult = await mcp.callTool({
      name: "plants_list",
      arguments: { location: 4 },
    });
    const resourceResult = await mcp.readResource({
      uri: "hortusfox://plants",
    });
    expect(JSON.parse(resourceText(resourceResult))).toEqual(
      JSON.parse(bodyText(toolResult)),
    );
  });

  it("H-e2e-019: resources/read hortusfox://plants/3/log forwards plant=3", async () => {
    await mcp.readResource({ uri: "hortusfox://plants/3/log" });
    const logCalls = mock.requests.filter(
      (r) => r.path === "/api/plants/log/fetch",
    );
    expect(logCalls.at(-1)?.query.plant).toBe("3");
  });

  it("E-e2e-020: empty result set is returned cleanly", async () => {
    const result = await mcp.callTool({
      name: "plants_search",
      arguments: { expression: "zzznomatch" },
    });
    expect(JSON.parse(bodyText(result))).toEqual({ list: [] });
  });

  it("E-e2e-021: rate limiter throttles a burst of calls (timestamp-precise)", async () => {
    const arrivalTimes: number[] = [];
    const throttledMock = await startMockHortusFox(
      {
        "GET /api/plants/list": () => {
          arrivalTimes.push(Date.now());
          return { status: 200, body: { code: 200, list: [] } };
        },
      },
      { token: TOKEN },
    );
    const config = {
      baseUrl: throttledMock.url,
      apiToken: TOKEN,
      verifyTls: true,
      timeoutMs: 5_000,
      enableWrites: true,
      enableBackup: false,
      maxRatePerSec: 5,
    };
    const hortusfox = new HortusFoxClient(config as never);
    const server = new McpServer({ name: "throttle-e2e", version: "0.0.0" });
    registerAllTools(server, hortusfox, config as never);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "e2e-throttle", version: "0.0.0" });
    await client.connect(b);
    try {
      await Promise.all(
        Array.from({ length: 12 }, () =>
          client.callTool({ name: "plants_list", arguments: { location: 1 } }),
        ),
      );
      expect(arrivalTimes).toHaveLength(12);
      const firstBatch = arrivalTimes.slice(0, 5);
      const firstWindow = Math.max(...firstBatch) - Math.min(...firstBatch);
      expect(firstWindow).toBeLessThan(200);
      const spread = Math.max(...arrivalTimes) - Math.min(...arrivalTimes);
      expect(spread).toBeGreaterThanOrEqual(500);
    } finally {
      await client.close();
      await throttledMock.close();
    }
  });
});
