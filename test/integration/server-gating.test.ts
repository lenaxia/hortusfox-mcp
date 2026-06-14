import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch } from "../helpers/mock-fetch.js";
import { expectMcpError } from "../helpers/matchers.js";

interface McpToolResultShape {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

const WRITE_TOOLS = [
  "plants_add",
  "plants_update_attribute",
  "plants_remove",
  "plants_photo_set",
  "plants_gallery_add",
  "plants_gallery_edit",
  "plants_gallery_remove",
  "plants_attributes_add",
  "plants_attributes_edit",
  "plants_attributes_remove",
  "plants_log_add",
  "plants_log_edit",
  "plants_log_remove",
  "tasks_add",
  "tasks_edit",
  "tasks_complete",
  "tasks_remove",
  "inventory_add",
  "inventory_edit",
  "inventory_increment",
  "inventory_decrement",
  "inventory_remove",
  "calendar_add",
  "calendar_edit",
  "calendar_remove",
  "chat_post",
];
const READ_TOOLS = [
  "plants_list",
  "plants_search",
  "plants_get",
  "plants_log_fetch",
  "plants_gallery_list",
  "locations_list",
  "locations_info",
  "tasks_list",
  "inventory_list",
  "calendar_list",
  "chat_list",
];

describe("server gating (integration)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("H-gate-001: enableWrites=true (default) -> 37 tools (read + write)", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listTools();
      expect(list.tools).toHaveLength(37);
      for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
        expect(list.tools.some((t) => t.name === name)).toBe(true);
      }
    } finally {
      await close();
    }
  });

  it("H-gate-002: enableWrites=false -> exactly 11 read-only tools", async () => {
    const { mcp, close } = await startServer({ enableWrites: false });
    try {
      const list = await mcp.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toEqual([...READ_TOOLS].sort());
      for (const w of WRITE_TOOLS) {
        expect(names).not.toContain(w);
      }
    } finally {
      await close();
    }
  });

  it("H-gate-003: calling write tool when writes disabled -> error result, no fetch", async () => {
    const { mcp, close } = await startServer({ enableWrites: false });
    try {
      let result: McpToolResultShape;
      try {
        result = (await mcp.callTool({
          name: "plants_add",
          arguments: { name: "x", location: 1 },
        })) as McpToolResultShape;
      } catch (e) {
        result = {
          isError: true,
          content: [
            { type: "text", text: e instanceof Error ? e.message : String(e) },
          ],
        };
      }
      expectMcpError(result);
      expect(fetcher.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("H-gate-004: every registered tool has a non-empty description", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listTools();
      for (const t of list.tools) {
        expect(typeof t.description).toBe("string");
        expect((t.description ?? "").length).toBeGreaterThan(0);
      }
    } finally {
      await close();
    }
  });

  it("H-gate-005: resource count constant regardless of write flag", async () => {
    const onServer = await startServer({ enableWrites: true });
    const offServer = await startServer({ enableWrites: false });
    try {
      const [on, off] = await Promise.all([
        onServer.mcp.listResources(),
        offServer.mcp.listResources(),
      ]);
      expect(on.resources).toHaveLength(off.resources.length);
    } finally {
      await onServer.close();
      await offServer.close();
    }
  });
});
