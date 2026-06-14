import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/index.js";

const BASE_URL = process.env.HORTUSFOX_BASE_URL ?? "http://127.0.0.1:8080";
const API_TOKEN = process.env.HORTUSFOX_API_TOKEN ?? "test-token";

function parseText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text"
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

describe("live hortusfox integration", () => {
  let client: Client;
  let server: ReturnType<typeof createServer>;
  let cleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    server = createServer({
      baseUrl: BASE_URL,
      apiToken: API_TOKEN,
      verifyTls: true,
      timeoutMs: 10_000,
      enableWrites: true,
      enableBackup: false,
      maxRatePerSec: 100,
    });

    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.server.connect(a);
    client = new Client({ name: "live-test", version: "0.0.0" });
    await client.connect(b);
    cleanup = async () => {
      await client.close();
    };
  });

  afterAll(async () => {
    if (cleanup) await cleanup();
  });

  // ── LOCATIONS ──

  it("lists locations from live server", async () => {
    const result = await client.callTool({
      name: "locations_list",
      arguments: {},
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.list).toBeInstanceOf(Array);
    expect(data.list.length).toBeGreaterThanOrEqual(2);
    expect(data.list.map((l: { name: string }) => l.name)).toContain("Living Room");
    expect(data.list.map((l: { name: string }) => l.name)).toContain("Balcony");
  });

  it("gets location info from live server", async () => {
    const result = await client.callTool({
      name: "locations_info",
      arguments: { location: 1 },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data.name).toBe("Living Room");
  });

  // ── PLANTS ──

  it("adds a plant via MCP", async () => {
    const result = await client.callTool({
      name: "plants_add",
      arguments: { name: "Snake Plant", location: 1 },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.plant).toBeGreaterThan(0);
  });

  it("searches plants", async () => {
    const result = await client.callTool({
      name: "plants_search",
      arguments: { expression: "Snake" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.list.length).toBeGreaterThanOrEqual(1);
  });

  it("gets a plant detail", async () => {
    const result = await client.callTool({
      name: "plants_get",
      arguments: { plant: 1 },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data.default.id).toBe(1);
    expect(data.data.default.name).toMatch(/Monstera/);
  });

  it("updates a plant attribute", async () => {
    const result = await client.callTool({
      name: "plants_update_attribute",
      arguments: { plant: 1, attribute: "name", value: "Monstera Updated" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data).toBeDefined();
    expect(result.isError).toBeFalsy();
  });

  it("adds a plant log entry", async () => {
    const result = await client.callTool({
      name: "plants_log_add",
      arguments: { plant: 1, content: "Watered thoroughly today" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.logid).toBeGreaterThan(0);
  });

  it("fetches plant logs", async () => {
    const result = await client.callTool({
      name: "plants_log_fetch",
      arguments: { plant: 1, limit: 10 },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.log).toBeInstanceOf(Array);
    expect(data.log.length).toBeGreaterThanOrEqual(1);
  });

  // ── TASKS ──

  it("adds a task", async () => {
    const result = await client.callTool({
      name: "tasks_add",
      arguments: { title: "Water the plants", description: "Weekly watering" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.item).toBeGreaterThan(0);
  });

  it("lists tasks", async () => {
    const result = await client.callTool({
      name: "tasks_list",
      arguments: {},
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data).toBeInstanceOf(Array);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("completes a task", async () => {
    // First add a task, then complete it
    const addResult = await client.callTool({
      name: "tasks_add",
      arguments: { title: "Complete me" },
    });
    const taskItem = JSON.parse(parseText(addResult as { content: unknown[] })).item;

    const result = await client.callTool({
      name: "tasks_complete",
      arguments: { task: taskItem },
    });
    expect(result.isError).toBeFalsy();
  });

  // ── INVENTORY ──

  it("adds an inventory item", async () => {
    const result = await client.callTool({
      name: "inventory_add",
      arguments: { name: "Fertilizer", amount: 3, location: 1, group: "general" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.item).toBeGreaterThan(0);
  });

  it("lists inventory", async () => {
    const result = await client.callTool({
      name: "inventory_list",
      arguments: {},
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data).toBeInstanceOf(Array);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("increments inventory amount", async () => {
    // Add item first
    const addResult = await client.callTool({
      name: "inventory_add",
      arguments: { name: "Pots", amount: 5, location: 2, group: "supplies" },
    });
    const itemId = JSON.parse(parseText(addResult as { content: unknown[] })).item;

    const result = await client.callTool({
      name: "inventory_increment",
      arguments: { item: itemId },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.amount).toBe(6);
  });

  // ── CALENDAR ──

  it("adds a calendar entry", async () => {
    const result = await client.callTool({
      name: "calendar_add",
      arguments: { name: "Repot day", date_from: "2026-07-01", class: "repot" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.item).toBeGreaterThan(0);
  });

  it("lists calendar entries", async () => {
    const result = await client.callTool({
      name: "calendar_list",
      arguments: { date_from: "2026-06-01", date_till: "2026-12-31" },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data).toBeInstanceOf(Array);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  // ── CHAT ──

  it("posts a chat message", async () => {
    const result = await client.callTool({
      name: "chat_post",
      arguments: { message: "Hello from MCP!" },
    });
    expect(result.isError).toBeFalsy();
  });

  it("lists chat messages", async () => {
    const result = await client.callTool({
      name: "chat_list",
      arguments: { limit: 10 },
    });
    const data = JSON.parse(parseText(result as { content: unknown[] }));
    expect(data.data).toBeInstanceOf(Array);
  });

  // ── CONFIRM-BEFORE-DELETE ──

  it("plants_remove with confirm=false returns preview (no delete)", async () => {
    const result = await client.callTool({
      name: "plants_remove",
      arguments: { plant: 1, confirm: false },
    });
    const text = parseText(result as { content: unknown[] });
    expect(text.startsWith("Not deleted.")).toBe(true);
  });

  it("tasks_remove with confirm=false returns preview (no delete)", async () => {
    const result = await client.callTool({
      name: "tasks_remove",
      arguments: { task: 1, confirm: false },
    });
    const text = parseText(result as { content: unknown[] });
    expect(text.startsWith("Not deleted.")).toBe(true);
  });

  // ── AUTH ERROR ──

  it("rejects invalid token with error", async () => {
    const badServer = createServer({
      baseUrl: BASE_URL,
      apiToken: "invalid-token-xxxxx",
      verifyTls: true,
      timeoutMs: 5_000,
      enableWrites: true,
      enableBackup: false,
      maxRatePerSec: 100,
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await badServer.server.connect(a);
    const badClient = new Client({ name: "bad-token-test", version: "0.0.0" });
    await badClient.connect(b);
    try {
      const result = await badClient.callTool({
        name: "plants_get",
        arguments: { plant: 1 },
      });
      expect(result.isError).toBe(true);
    } finally {
      await badClient.close();
    }
  });
});
