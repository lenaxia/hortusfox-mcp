import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";
import { expectMcpError } from "../helpers/matchers.js";

async function callExpectingError(
  mcp: Awaited<ReturnType<typeof startServer>>["mcp"],
  name: string,
  arguments_: Record<string, unknown>,
): Promise<McpToolResultShape> {
  try {
    const r = (await mcp.callTool({
      name,
      arguments: arguments_,
    })) as McpToolResultShape;
    return r;
  } catch (e) {
    return {
      isError: true,
      content: [
        { type: "text", text: e instanceof Error ? e.message : String(e) },
      ],
    };
  }
}

interface McpToolResultShape {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

function bodyText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

function lastCall(fetcher: ReturnType<typeof mockFetch>) {
  return fetcher.calls[fetcher.calls.length - 1];
}

describe("domain tools (integration)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  // ──────────────────── LOCATIONS ────────────────────

  describe("locations", () => {
    it("H-loc-001: locations_list default path and minimal params", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, list: [{ id: 1, name: "Living Room" }] },
      });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const result = await mcp.callTool({
          name: "locations_list",
          arguments: {},
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/locations/list");
        expect(query.has("only_active")).toBe(true);
        expect(query.get("only_active")).toBe("0");
        expect(query.has("include_plants")).toBe(true);
        expect(JSON.parse(bodyText(result))).toEqual({
          list: [{ id: 1, name: "Living Room" }],
        });
      } finally {
        await close();
      }
    });

    it("H-loc-002: locations_list forwards only_active and include_plants", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "locations_list",
          arguments: {
            only_active: true,
            include_plants: true,
            include_info: "id,name",
          },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("only_active")).toBe("1");
        expect(query.get("include_plants")).toBe("1");
        expect(query.get("include_info")).toBe("id,name");
      } finally {
        await close();
      }
    });

    it("U-loc-004: locations_list rejects SQL injection in include_info", async () => {
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const r = await callExpectingError(mcp, "locations_list", {
          include_plants: true,
          include_info: "1; DROP TABLE plants",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("U-loc-005: locations_list rejects unknown column in include_info", async () => {
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const r = await callExpectingError(mcp, "locations_list", {
          include_info: "password",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-loc-006: locations_list accepts multiple valid columns", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "locations_list",
          arguments: {
            include_plants: true,
            include_info: "id,name,photo,scientific_name",
          },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("include_info")).toBe("id,name,photo,scientific_name");
      } finally {
        await close();
      }
    });

    it("H-loc-003: locations_info forwards location and include_plants", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, data: { id: 3 } } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "locations_info",
          arguments: { location: 3, include_plants: true },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/locations/info");
        expect(query.get("location")).toBe("3");
        expect(query.get("include_plants")).toBe("1");
      } finally {
        await close();
      }
    });

    it("H-loc-004: locations_info accepts string id", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, data: {} } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "locations_info",
          arguments: { location: "7" },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("location")).toBe("7");
      } finally {
        await close();
      }
    });
  });

  // ──────────────────── TASKS ────────────────────

  describe("tasks", () => {
    it("H-task-001: tasks_list default (done=false, limit=100)", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: [{ id: 1 }] },
      });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({ name: "tasks_list", arguments: {} });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/tasks/fetch");
        expect(query.get("done")).toBe("0");
        expect(query.get("limit")).toBe("100");
      } finally {
        await close();
      }
    });

    it("H-task-002: tasks_list with done=true returns completed", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "tasks_list",
          arguments: { done: true, limit: 50 },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("done")).toBe("1");
        expect(query.get("limit")).toBe("50");
      } finally {
        await close();
      }
    });

    it("H-task-003: tasks_add forwards title and optional params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, item: 42 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "tasks_add",
          arguments: { title: "Water plants", description: "Morning routine" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/tasks/add");
        expect(query.get("title")).toBe("Water plants");
        expect(query.get("description")).toBe("Morning routine");
        expect(JSON.parse(bodyText(result))).toEqual({ item: 42 });
        expect(result.structuredContent).toEqual({ item: 42 });
      } finally {
        await close();
      }
    });

    it("H-task-004: tasks_add with recurring params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, item: 1 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "tasks_add",
          arguments: {
            title: "Fertilize",
            due_date: "2025-01-15",
            recurring_time: 2,
            recurring_scope: "weeks",
          },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("due_date")).toBe("2025-01-15");
        expect(query.get("recurring_time")).toBe("2");
        expect(query.get("recurring_scope")).toBe("weeks");
      } finally {
        await close();
      }
    });

    it("U-task-005: tasks_add rejects missing title", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "tasks_add", {
          description: "x",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-task-006: tasks_edit partial update (only title)", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "tasks_edit",
          arguments: { task: 5, title: "Updated title" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/tasks/edit");
        expect(query.get("task")).toBe("5");
        expect(query.get("title")).toBe("Updated title");
      } finally {
        await close();
      }
    });

    it("H-task-007: tasks_complete sets done=true", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({ name: "tasks_complete", arguments: { task: 7 } });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/tasks/edit");
        expect(query.get("task")).toBe("7");
        expect(query.get("done")).toBe("1");
      } finally {
        await close();
      }
    });

    it("H-task-008: tasks_remove confirm=false returns preview, no delete", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "tasks_remove",
          arguments: { task: 9, confirm: false },
        });
        const text = bodyText(result);
        expect(text.startsWith("Not deleted.")).toBe(true);
        const deleteCalls = fetcher.calls.filter((c) =>
          c.url.includes("/tasks/remove"),
        );
        expect(deleteCalls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-task-009: tasks_remove confirm=true performs delete", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "tasks_remove",
          arguments: { task: 9, confirm: true },
        });
        const deleteCalls = fetcher.calls.filter((c) =>
          c.url.includes("/tasks/remove"),
        );
        expect(deleteCalls).toHaveLength(1);
        const { query } = parseUrl(deleteCalls[0].url);
        expect(query.get("task")).toBe("9");
      } finally {
        await close();
      }
    });
  });

  // ──────────────────── INVENTORY ────────────────────

  describe("inventory", () => {
    it("H-inv-001: inventory_list default", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: [{ id: 1 }] },
      });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const result = await mcp.callTool({
          name: "inventory_list",
          arguments: {},
        });
        const { path } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/inventory/fetch");
        expect(JSON.parse(bodyText(result))).toEqual({ data: [{ id: 1 }] });
      } finally {
        await close();
      }
    });

    it("H-inv-002: inventory_add forwards all params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, item: 3 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "inventory_add",
          arguments: {
            name: "Fertilizer",
            description: "All-purpose",
            tags: "organic",
            location: 2,
            amount: 5,
            group: "supplies",
          },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/inventory/add");
        expect(query.get("name")).toBe("Fertilizer");
        expect(query.get("amount")).toBe("5");
        expect(JSON.parse(bodyText(result))).toEqual({ item: 3 });
        expect(result.structuredContent).toEqual({ item: 3 });
      } finally {
        await close();
      }
    });

    it("U-inv-003: inventory_add rejects missing name", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "inventory_add", {
          amount: 1,
          group: "general",
        });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("U-inv-003b: inventory_add rejects missing group", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "inventory_add", {
          name: "Fertilizer",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-inv-004: inventory_edit requires all fields (full-field)", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "inventory_edit",
          arguments: {
            item: 1,
            name: "Fertilizer Pro",
            description: "Updated",
            tags: "organic,powder",
            location: 3,
            amount: 10,
            group: "supplies",
          },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/inventory/edit");
        expect(query.get("item")).toBe("1");
        expect(query.get("name")).toBe("Fertilizer Pro");
        expect(query.get("amount")).toBe("10");
      } finally {
        await close();
      }
    });

    it("U-inv-005: inventory_edit rejects missing name (audit requirement)", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "inventory_edit", {
          item: 1,
          description: "x",
          tags: "",
          location: 1,
          amount: 0,
          group: "",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-inv-006: inventory_increment", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, amount: 6 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "inventory_increment",
          arguments: { item: 1 },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/inventory/amount/inc");
        expect(query.get("item")).toBe("1");
        expect(JSON.parse(bodyText(result))).toEqual({ amount: 6 });
        expect(result.structuredContent).toEqual({ amount: 6 });
      } finally {
        await close();
      }
    });

    it("H-inv-007: inventory_decrement", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, amount: 4 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "inventory_decrement",
          arguments: { item: 1 },
        });
        const { path } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/inventory/amount/dec");
        expect(result.structuredContent).toEqual({ amount: 4 });
      } finally {
        await close();
      }
    });

    it("H-inv-008: inventory_remove confirm=true", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "inventory_remove",
          arguments: { item: 5, confirm: true },
        });
        const deleteCalls = fetcher.calls.filter((c) =>
          c.url.includes("/inventory/remove"),
        );
        expect(deleteCalls).toHaveLength(1);
      } finally {
        await close();
      }
    });
  });

  // ──────────────────── CALENDAR ────────────────────

  describe("calendar", () => {
    it("H-cal-001: calendar_list default (server applies date defaults)", async () => {
      fetcher.setDefault({
        status: 200,
        body: {
          code: 200,
          data: [],
          date_from: "2025-01-01",
          date_till: "2025-01-31",
        },
      });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const result = await mcp.callTool({
          name: "calendar_list",
          arguments: {},
        });
        const { path } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/calendar/fetch");
        const parsed = JSON.parse(bodyText(result));
        expect(parsed).toHaveProperty("data");
        expect(parsed).toHaveProperty("date_from");
        expect(parsed).toHaveProperty("date_till");
      } finally {
        await close();
      }
    });

    it("H-cal-002: calendar_list forwards date_from/date_till", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({
          name: "calendar_list",
          arguments: { date_from: "2025-06-01", date_till: "2025-06-30" },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("date_from")).toBe("2025-06-01");
        expect(query.get("date_till")).toBe("2025-06-30");
      } finally {
        await close();
      }
    });

    it("H-cal-003: calendar_add forwards name and dates", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, item: 7 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "calendar_add",
          arguments: { name: "Repot day", date_from: "2025-03-15" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/calendar/add");
        expect(query.get("name")).toBe("Repot day");
        expect(query.get("date_from")).toBe("2025-03-15");
        expect(JSON.parse(bodyText(result))).toEqual({ item: 7 });
        expect(result.structuredContent).toEqual({ item: 7 });
      } finally {
        await close();
      }
    });

    it("U-cal-004: calendar_add rejects missing name", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "calendar_add", {
          date_from: "2025-01-01",
        });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("U-cal-005: calendar_add rejects missing date_from", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "calendar_add", { name: "x" });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("H-cal-006: calendar_edit requires name and date_from (full-field)", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "calendar_edit",
          arguments: {
            ident: 3,
            name: "Updated event",
            date_from: "2025-04-01",
          },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/calendar/edit");
        expect(query.get("ident")).toBe("3");
        expect(query.get("name")).toBe("Updated event");
      } finally {
        await close();
      }
    });

    it("U-cal-007: calendar_edit rejects missing name (audit requirement)", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "calendar_edit", {
          ident: 1,
          date_from: "2025-01-01",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-cal-008: calendar_remove confirm=true", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "calendar_remove",
          arguments: { ident: 5, confirm: true },
        });
        const deleteCalls = fetcher.calls.filter((c) =>
          c.url.includes("/calendar/remove"),
        );
        expect(deleteCalls).toHaveLength(1);
      } finally {
        await close();
      }
    });
  });

  // ──────────────────── CHAT ────────────────────

  describe("chat", () => {
    it("H-chat-001: chat_list default limit=50", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: [{ id: 1 }] },
      });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const result = await mcp.callTool({ name: "chat_list", arguments: {} });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/chat/fetch");
        expect(query.get("limit")).toBe("50");
        expect(JSON.parse(bodyText(result))).toEqual({ data: [{ id: 1 }] });
      } finally {
        await close();
      }
    });

    it("H-chat-002: chat_list custom limit", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        await mcp.callTool({ name: "chat_list", arguments: { limit: 25 } });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("limit")).toBe("25");
      } finally {
        await close();
      }
    });

    it("H-chat-003: chat_post forwards message", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "chat_post",
          arguments: { message: "Hello from MCP!" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/chat/message/add");
        expect(query.get("message")).toBe("Hello from MCP!");
        expect(result.isError).toBeFalsy();
      } finally {
        await close();
      }
    });

    it("U-chat-004: chat_post rejects empty message", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "chat_post", { message: "" });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("H-chat-005: chat_post not registered when enableWrites=false", async () => {
      const { mcp, close } = await startServer({ enableWrites: false });
      try {
        const list = await mcp.listTools();
        expect(list.tools.find((t) => t.name === "chat_post")).toBeUndefined();
        expect(list.tools.find((t) => t.name === "chat_list")).toBeDefined();
      } finally {
        await close();
      }
    });
  });

  // ──────────────────── BACKUP ────────────────────

  describe("backup (enableBackup=true)", () => {
    it("H-bak-001: backup_export forwards selected types", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, file: "http://mock.test/backup/dump.zip" },
      });
      const { mcp, close } = await startServer({ enableBackup: true });
      try {
        const result = await mcp.callTool({
          name: "backup_export",
          arguments: { plants: true, tasks: true },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/backup/export");
        expect(query.get("plants")).toBe("1");
        expect(query.get("tasks")).toBe("1");
        expect(query.get("locations")).toBe("0");
        expect(JSON.parse(bodyText(result))).toEqual({
          file: "http://mock.test/backup/dump.zip",
        });
      } finally {
        await close();
      }
    });

    it("H-bak-002: backup_import confirm=false returns isError, no fetch", async () => {
      const { mcp, close } = await startServer({ enableBackup: true });
      try {
        const result = await mcp.callTool({
          name: "backup_import",
          arguments: { confirm: false, plants: true },
        });
        expect(result.isError).toBe(true);
        expect(bodyText(result)).toContain("confirm=true");
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-bak-003: backup_import confirm=true performs import", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer({ enableBackup: true });
      try {
        const result = await mcp.callTool({
          name: "backup_import",
          arguments: { confirm: true, plants: true, inventory: true },
        });
        expect(result.isError).toBeFalsy();
        const importCalls = fetcher.calls.filter((c) =>
          c.url.includes("/backup/import"),
        );
        expect(importCalls).toHaveLength(1);
      } finally {
        await close();
      }
    });

    it("H-bak-004: backup tools not registered when enableBackup=false", async () => {
      const { mcp, close } = await startServer({ enableBackup: false });
      try {
        const list = await mcp.listTools();
        expect(
          list.tools.find((t) => t.name === "backup_export"),
        ).toBeUndefined();
        expect(
          list.tools.find((t) => t.name === "backup_import"),
        ).toBeUndefined();
      } finally {
        await close();
      }
    });
  });
});
