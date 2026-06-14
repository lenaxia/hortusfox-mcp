import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../../src/client.js";
import { registerAllResources } from "../../src/resources/index.js";
import { registerAllTools } from "../../src/tools/index.js";
import { startMockHortusFox } from "../helpers/hortusfox-mock.js";

const TOKEN = "real-token-1234567890";

interface MockState {
  plants: Array<Record<string, unknown>>;
  nextId: number;
  logs: Array<Record<string, unknown>>;
  gallery: Array<Record<string, unknown>>;
  logId: number;
}

function freshState(): MockState {
  return {
    plants: [
      { id: 1, name: "Monstera", location: 2 },
      { id: 2, name: "Pothos", location: 2 },
      { id: 3, name: "Snake plant", location: 3 },
    ],
    nextId: 100,
    logs: [],
    gallery: [],
    logId: 100,
  };
}

function routes(state: MockState) {
  return {
    "GET /api/plants/list": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const location = ctx.query.get("location");
      const list = location
        ? state.plants.filter((p) => String(p.location) === String(location))
        : state.plants;
      return { status: 200, body: { code: 200, list } };
    },
    "GET /api/plants/get": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const id = Number(ctx.query.get("plant"));
      const plant = state.plants.find((p) => Number(p.id) === id);
      if (!plant) return { status: 200, body: { code: 500, msg: "not found" } };
      return {
        status: 200,
        body: { code: 200, data: { default: plant, custom: [] } },
      };
    },
    "GET /api/plants/add": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const name = ctx.query.get("name") ?? "unnamed";
      const location = Number(ctx.query.get("location") ?? 0);
      const id = state.nextId++;
      state.plants.push({ id, name, location });
      return { status: 200, body: { code: 200, plant: id } };
    },
    "GET /api/plants/update": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const id = Number(ctx.query.get("plant"));
      const attr = ctx.query.get("attribute") ?? "";
      const value = ctx.query.get("value") ?? "";
      const plant = state.plants.find((p) => Number(p.id) === id);
      if (!plant) return { status: 200, body: { code: 500, msg: "not found" } };
      plant[attr] = value === "#null" ? null : value;
      return { status: 200, body: { code: 200, attribute: attr, value } };
    },
    "GET /api/plants/remove": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const id = Number(ctx.query.get("plant"));
      const idx = state.plants.findIndex((p) => Number(p.id) === id);
      if (idx < 0)
        return { status: 200, body: { code: 500, msg: "not found" } };
      state.plants.splice(idx, 1);
      return { status: 200, body: { code: 200, plant: id } };
    },
    "GET /api/plants/log/add": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const plant = Number(ctx.query.get("plant"));
      const content = ctx.query.get("content") ?? "";
      const logid = state.logId++;
      state.logs.push({ id: logid, plant, content });
      return { status: 200, body: { code: 200, logid } };
    },
    "GET /api/plants/log/fetch": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const plant = Number(ctx.query.get("plant"));
      const logs = state.logs.filter((l) => Number(l.plant) === plant);
      return { status: 200, body: { code: 200, log: logs } };
    },
    "GET /api/plants/gallery/add": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const plant = Number(ctx.query.get("plant"));
      const label = ctx.query.get("label") ?? "";
      const item = state.nextId++;
      state.gallery.push({ id: item, plant, label });
      return { status: 200, body: { code: 200, item } };
    },
    "GET /api/plants/gallery/list": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const plant = Number(ctx.query.get("plant"));
      const gallery = state.gallery.filter((g) => Number(g.plant) === plant);
      return { status: 200, body: { code: 200, data: { plant, gallery } } };
    },
    "GET /api/plants/search": (
      _req: unknown,
      _res: unknown,
      ctx: { query: URLSearchParams },
    ) => {
      const expr = (ctx.query.get("expression") ?? "").toLowerCase();
      const matches = state.plants.filter((p) =>
        String(p.name).toLowerCase().includes(expr),
      );
      return { status: 200, body: { code: 200, list: matches } };
    },
  };
}

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
  registerAllResources(server, hortusfox);
  registerAllTools(server, hortusfox, config as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "e2e", version: "0.0.0" });
  await mcp.connect(b);
  return { mcp, close: () => mcp.close() };
}

describe("e2e: plant lifecycle", () => {
  let mock: Awaited<ReturnType<typeof startMockHortusFox>>;
  let state: MockState;
  let mcp: Client;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    state = freshState();
    mock = await startMockHortusFox(routes(state), { token: TOKEN });
    const built = await buildMcpClient(mock.url);
    mcp = built.mcp;
    closeServer = built.close;
  });

  afterAll(async () => {
    await closeServer();
    await mock.close();
  });

  it("W-e2e-001: browse returns seeded plants", async () => {
    const result = await mcp.callTool({ name: "plants_list", arguments: {} });
    const data = JSON.parse(bodyText(result));
    expect(data.list).toHaveLength(3);
    expect(data.list.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(["Monstera", "Pothos", "Snake plant"]),
    );
  });

  it("W-e2e-002: get details for plant 1", async () => {
    const result = await mcp.callTool({
      name: "plants_get",
      arguments: { plant: 1 },
    });
    const data = JSON.parse(bodyText(result));
    expect(data.data.default.name).toBe("Monstera");
  });

  it("W-e2e-003: create new plant and see it in subsequent list", async () => {
    const addResult = await mcp.callTool({
      name: "plants_add",
      arguments: { name: "Pilea", location: 2 },
    });
    const newId = JSON.parse(bodyText(addResult)).plant;
    expect(newId).toBe(100);

    const listResult = await mcp.callTool({
      name: "plants_list",
      arguments: {},
    });
    const list = JSON.parse(bodyText(listResult)).list as Array<{ id: number }>;
    expect(list.some((p) => p.id === 100)).toBe(true);
  });

  it("W-e2e-004: update plant name and verify via get", async () => {
    await mcp.callTool({
      name: "plants_update_attribute",
      arguments: {
        plant: 100,
        attribute: "name",
        value: "Pilea peperomioides",
      },
    });
    const getResult = await mcp.callTool({
      name: "plants_get",
      arguments: { plant: 100 },
    });
    const data = JSON.parse(bodyText(getResult));
    expect(data.data.default.name).toBe("Pilea peperomioides");
  });

  it("W-e2e-005: add and fetch a log entry", async () => {
    const addResult = await mcp.callTool({
      name: "plants_log_add",
      arguments: { plant: 100, content: "Watered" },
    });
    expect(JSON.parse(bodyText(addResult)).logid).toBe(100);

    const fetchResult = await mcp.callTool({
      name: "plants_log_fetch",
      arguments: { plant: 100 },
    });
    const logs = JSON.parse(bodyText(fetchResult)).log;
    expect(logs).toHaveLength(1);
    expect(logs[0].content).toBe("Watered");
  });

  it("W-e2e-006: add gallery photo and list it", async () => {
    const addResult = await mcp.callTool({
      name: "plants_gallery_add",
      arguments: {
        plant: 100,
        label: "spring shoot",
        photo: "https://example.test/x.jpg",
      },
    });
    const itemId = JSON.parse(bodyText(addResult)).item;

    const listResult = await mcp.callTool({
      name: "plants_gallery_list",
      arguments: { plant: 100 },
    });
    const gallery = JSON.parse(bodyText(listResult)).data.gallery;
    expect(gallery).toHaveLength(1);
    expect(gallery[0].id).toBe(itemId);
  });

  it("W-e2e-007: delete with confirm:false is a no-op (plant still present)", async () => {
    const previewResult = await mcp.callTool({
      name: "plants_remove",
      arguments: { plant: 100, confirm: false },
    });
    expect(bodyText(previewResult).startsWith("Not deleted.")).toBe(true);

    const removeCalls = mock.requests.filter(
      (r) => r.path === "/api/plants/remove",
    );
    expect(removeCalls).toHaveLength(0);

    const getResult = await mcp.callTool({
      name: "plants_get",
      arguments: { plant: 100 },
    });
    const data = JSON.parse(bodyText(getResult));
    expect(data.data.default.name).toBe("Pilea peperomioides");
  });

  it("W-e2e-008: delete with confirm:true removes plant; subsequent get fails", async () => {
    await mcp.callTool({
      name: "plants_remove",
      arguments: { plant: 100, confirm: true },
    });

    const removeCalls = mock.requests.filter(
      (r) => r.path === "/api/plants/remove",
    );
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0].query.plant).toBe("100");
    expect(removeCalls[0].query.token).toBe(TOKEN);

    const getResult = await mcp.callTool({
      name: "plants_get",
      arguments: { plant: 100 },
    });
    expect(getResult.isError).toBe(true);
    expect(bodyText(getResult)).toContain("not found");
  });

  it("W-e2e-009: every request carried the token query param", () => {
    const withoutToken = mock.requests.filter(
      (r) => r.query.token !== TOKEN && r.path.startsWith("/api/"),
    );
    expect(withoutToken).toEqual([]);
  });
});
