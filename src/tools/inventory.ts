import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";
import { registerConfirmableRemove } from "./shared.js";

export function registerInventoryTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config
): void {
  server.tool(
    "inventory_list",
    "List all inventory items.",
    {},
    async () => {
      const data = await client.get("/inventory/fetch");
      return jsonResult(data);
    }
  );

  if (!config.enableWrites) return;

  server.tool(
    "inventory_add",
    "Add a new inventory item. Returns the new item id. " +
      "The group must be an existing inventory group token.",
    {
      name: z.string().min(1),
      description: z.string().optional().default(""),
      tags: z.string().optional().default(""),
      location: z.string().or(z.number().int().positive()).optional(),
      amount: z.number().int().min(0).optional().default(0),
      group: z
        .string()
        .min(1)
        .describe(
          "Inventory group token (must already exist in the workspace)."
        ),
      photo: z.string().url().optional().describe("Optional photo URL."),
    },
    async (args) => {
      const data = await client.get("/inventory/add", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "inventory_edit",
    "Edit an inventory item. WARNING: the upstream API overwrites all SQL " +
      "fields, so name, description, tags, location, amount AND group are all " +
      "required (see audit in design doc). photo is URL-only.",
    {
      item: z.string().or(z.number().int().positive()),
      name: z.string().min(1),
      description: z.string(),
      tags: z.string(),
      location: z.string().or(z.number().int().positive()),
      amount: z.number().int().min(0),
      group: z.string(),
      photo: z.string().url().optional().describe("Optional photo URL."),
    },
    async (args) => {
      const data = await client.get("/inventory/edit", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "inventory_increment",
    "Increment an inventory item's amount by 1. Returns the new amount.",
    {
      item: z.string().or(z.number().int().positive()),
    },
    async (args) => {
      const data = await client.get("/inventory/amount/inc", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "inventory_decrement",
    "Decrement an inventory item's amount by 1. Returns the new amount.",
    {
      item: z.string().or(z.number().int().positive()),
    },
    async (args) => {
      const data = await client.get("/inventory/amount/dec", args);
      return jsonResult(data);
    }
  );

  registerConfirmableRemove(
    server,
    "inventory_remove",
    "Remove an inventory item.",
    "item",
    async (item) => {
      const data = await client.get("/inventory/remove", { item });
      return data;
    },
    async () => ({ note: "Inventory item will be permanently deleted." })
  );
}
