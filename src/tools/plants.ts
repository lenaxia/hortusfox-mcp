import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { errorResult, jsonResult } from "../result.js";
import { registerConfirmableRemove } from "./shared.js";

export function registerPlantTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config
): void {
  registerReads(server, client);
  if (config.enableWrites) {
    registerWrites(server, client);
  }
}

function registerReads(server: McpServer, client: HortusFoxClient): void {
  server.tool(
    "plants_list",
    "List plants, optionally filtered by location and paginated.",
    {
      location: z.string().optional().describe("Location id to filter by."),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Max number of plants to return."),
      from: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination offset."),
      sort: z
        .string()
        .optional()
        .describe("Sort order as expected by the upstream API."),
    },
    async (args) => {
      const data = await client.get("/plants/list", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_search",
    "Full-text search across plant names and attributes.",
    {
      expression: z.string().min(1).describe("Search expression."),
      limit: z.number().int().positive().max(500).optional(),
    },
    async (args) => {
      const data = await client.get("/plants/search", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_get",
    "Get full details for a single plant, including custom attributes.",
    {
      plant: z
        .string()
        .or(z.number().int().positive())
        .describe("Plant id."),
    },
    async (args) => {
      const data = await client.get("/plants/get", { plant: args.plant });
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_log_fetch",
    "Fetch log entries for a plant.",
    {
      plant: z.string().or(z.number().int().positive()),
      limit: z.number().int().positive().max(500).optional().default(10),
      paginate: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination cursor as expected by the upstream API."),
    },
    async (args) => {
      const data = await client.get("/plants/log/fetch", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_gallery_list",
    "List gallery photos for a plant.",
    {
      plant: z.string().or(z.number().int().positive()),
    },
    async (args) => {
      const data = await client.get("/plants/gallery/list", { plant: args.plant });
      return jsonResult(data);
    }
  );
}

function registerWrites(
  server: McpServer,
  client: HortusFoxClient
): void {
  server.tool(
    "plants_add",
    "Add a new plant. Returns the new plant id.",
    {
      name: z.string().min(1).describe("Plant name."),
      location: z
        .string()
        .or(z.number().int().positive())
        .describe("Location id for the new plant."),
    },
    async (args) => {
      const data = await client.get("/plants/add", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_update_attribute",
    "Update a single attribute on a plant. Pass value '#null' to clear it.",
    {
      plant: z.string().or(z.number().int().positive()),
      attribute: z
        .string()
        .min(1)
        .describe("Column name to set (validated against allow-list server-side)."),
      value: z.string().describe("New value. Use the literal '#null' to clear."),
    },
    async (args) => {
      const data = await client.get("/plants/update", args);
      return jsonResult(data);
    }
  );

  registerConfirmableRemove(
    server,
    "plants_remove",
    "Permanently remove a plant and its associated data.",
    "plant",
    async (plant) => {
      const data = await client.get("/plants/remove", { plant });
      return data;
    },
    async (plant) => {
      const preview = await client.get("/plants/get", { plant });
      return preview;
    }
  );

  server.tool(
    "plants_photo_set",
    "Set the main photo for a plant. By default uses the URL path (external=1).",
    {
      plant: z.string().or(z.number().int().positive()),
      photo: z
        .string()
        .url()
        .describe("Absolute URL of the photo to use."),
      external: z
        .boolean()
        .optional()
        .default(true)
        .describe("Must stay true in v0.1 (multipart upload unsupported)."),
      move_to_gallery: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, move the current photo into the gallery first."),
    },
    async (args) => {
      if (args.external === false) {
        return errorResult(
          "Multipart photo upload is not supported in v0.1. Use a photo URL (external=true)."
        );
      }
      const data = await client.get("/plants/photo/update", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_gallery_add",
    "Add a photo to a plant's gallery via URL.",
    {
      plant: z.string().or(z.number().int().positive()),
      label: z.string().min(1).describe("Caption for the gallery photo."),
      photo: z.string().url().describe("Absolute URL of the photo."),
      external: z
        .boolean()
        .optional()
        .default(true)
        .describe("Must stay true in v0.1 (multipart upload unsupported)."),
    },
    async (args) => {
      if (args.external === false) {
        return errorResult(
          "Multipart photo upload is not supported in v0.1. Use a photo URL (external=true)."
        );
      }
      const data = await client.get("/plants/gallery/add", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_gallery_edit",
    "Rename (edit label of) a gallery photo.",
    {
      plant: z.string().or(z.number().int().positive()),
      item: z.string().or(z.number().int().positive()).describe("Gallery item id."),
      label: z.string().min(1).describe("New caption."),
    },
    async (args) => {
      const data = await client.get("/plants/gallery/edit", args);
      return jsonResult(data);
    }
  );

  registerConfirmableRemove(
    server,
    "plants_gallery_remove",
    "Remove a gallery photo.",
    "item",
    async (item) => {
      const data = await client.get("/plants/gallery/remove", { item });
      return data;
    },
    async () => ({ note: "Gallery photo will be permanently deleted." })
  );

  server.tool(
    "plants_attributes_add",
    "Add a custom attribute to a plant.",
    {
      plant: z.string().or(z.number().int().positive()),
      label: z.string().min(1),
      datatype: z.string().min(1).describe("Attribute datatype."),
      content: z.string().describe("Attribute value."),
    },
    async (args) => {
      const data = await client.get("/plants/attributes/add", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_attributes_edit",
    "Edit a custom attribute on a plant. " +
      "WARNING: the upstream API overwrites all fields, so label, datatype AND " +
      "content are all required (see audit in design doc).",
    {
      plant: z.string().or(z.number().int().positive()),
      label: z.string().min(1),
      datatype: z.string().min(1),
      content: z.string(),
    },
    async (args) => {
      const data = await client.get("/plants/attributes/edit", args);
      return jsonResult(data);
    }
  );

  registerConfirmableRemove(
    server,
    "plants_attributes_remove",
    "Remove a custom attribute from a plant.",
    "label",
    async (label, extra) => {
      const data = await client.get("/plants/attributes/remove", {
        plant: extra?.plant,
        label,
      });
      return data;
    },
    async (label, extra) => {
      const plant = extra?.plant;
      if (plant === undefined) return { note: `Attribute "${label}" will be removed.` };
      const details = await client.get("/plants/get", { plant });
      return {
        plant,
        label,
        current: (details as { data?: { custom?: unknown[] } }).data?.custom ?? [],
      };
    },
    ["plant"]
  );

  server.tool(
    "plants_log_add",
    "Add a log entry to a plant. Returns the new log id.",
    {
      plant: z.string().or(z.number().int().positive()),
      content: z.string().min(1),
    },
    async (args) => {
      const data = await client.get("/plants/log/add", args);
      return jsonResult(data);
    }
  );

  server.tool(
    "plants_log_edit",
    "Edit the content of an existing log entry.",
    {
      logid: z.string().or(z.number().int().positive()),
      content: z.string().min(1),
    },
    async (args) => {
      const data = await client.get("/plants/log/edit", args);
      return jsonResult(data);
    }
  );

  registerConfirmableRemove(
    server,
    "plants_log_remove",
    "Remove a log entry.",
    "logid",
    async (logid) => {
      const data = await client.get("/plants/log/remove", { logid });
      return data;
    },
    async () => ({ note: "Log entry will be permanently deleted." })
  );
}
