import { afterAll, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch } from "../helpers/mock-fetch.js";

const EXPECTED_TOOLS_WITH_WRITES = [
  "plants_list",
  "plants_search",
  "plants_get",
  "plants_log_fetch",
  "plants_gallery_list",
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
  "locations_list",
  "locations_info",
  "tasks_list",
  "tasks_add",
  "tasks_edit",
  "tasks_complete",
  "tasks_remove",
  "inventory_list",
  "inventory_add",
  "inventory_edit",
  "inventory_increment",
  "inventory_decrement",
  "inventory_remove",
  "calendar_list",
  "calendar_add",
  "calendar_edit",
  "calendar_remove",
  "chat_list",
  "chat_post",
];

const EXPECTED_TOOLS_READ_ONLY = [
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

describe("tool roster contract (snapshot)", () => {
  const fetcher = mockFetch();
  fetcher.install();
  afterAll(() => fetcher.restore());

  it("H-contract-001: exact tool names with writes enabled (alphabetical)", async () => {
    const { mcp, close } = await startServer({ enableWrites: true });
    try {
      const list = await mcp.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS_WITH_WRITES].sort());
    } finally {
      await close();
    }
  });

  it("H-contract-002: exact tool names with writes disabled", async () => {
    const { mcp, close } = await startServer({ enableWrites: false });
    try {
      const list = await mcp.listTools();
      const names = list.tools.map((t) => t.name).sort();
      expect(names).toEqual([...EXPECTED_TOOLS_READ_ONLY].sort());
    } finally {
      await close();
    }
  });

  it("H-contract-003: every tool has name + non-empty description + inputSchema", async () => {
    const { mcp, close } = await startServer({ enableWrites: true });
    try {
      const list = await mcp.listTools();
      for (const tool of list.tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(typeof tool.description).toBe("string");
        expect((tool.description ?? "").length).toBeGreaterThanOrEqual(10);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    } finally {
      await close();
    }
  });

  it("H-contract-004: confirm param exists on all remove tools only", async () => {
    const { mcp, close } = await startServer({ enableWrites: true });
    try {
      const list = await mcp.listTools();
      const removeTools = list.tools.filter((t) => /_remove$/.test(t.name));
      expect(removeTools.map((t) => t.name).sort()).toEqual(
        [
          "plants_attributes_remove",
          "plants_gallery_remove",
          "plants_log_remove",
          "plants_remove",
          "tasks_remove",
          "inventory_remove",
          "calendar_remove",
        ].sort(),
      );
      for (const t of removeTools) {
        const props = (t.inputSchema as { properties: Record<string, unknown> })
          .properties;
        expect(props).toHaveProperty("confirm");
      }
      const nonRemoveTools = list.tools.filter((t) => !/_remove$/.test(t.name));
      for (const t of nonRemoveTools) {
        const props = (
          t.inputSchema as { properties?: Record<string, unknown> }
        ).properties;
        if (props) {
          expect(props).not.toHaveProperty("confirm");
        }
      }
    } finally {
      await close();
    }
  });

  it("H-contract-005: resource URI scheme is hortusfox://", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listResources();
      for (const r of list.resources) {
        expect(r.uri).toMatch(/^hortusfox:\/\//);
      }
      const templates = await mcp.listResourceTemplates();
      for (const t of templates.resourceTemplates) {
        expect(t.uriTemplate).toMatch(/^hortusfox:\/\//);
      }
    } finally {
      await close();
    }
  });
});
