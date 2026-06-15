import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { errorResult, jsonResult } from "../result.js";
import { registerConfirmableRemove } from "./shared.js";

export function registerPlantTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config,
): void {
  registerReads(server, client);
  if (config.enableWrites) {
    registerWrites(server, client);
  }
}

function registerReads(server: McpServer, client: HortusFoxClient): void {
  server.tool(
    "plants_list",
    // NOTE: location is required (not optional) as a workaround for upstream bug
    // danielbrendel/hortusfox-web#532 — omitting location causes the API to
    // silently return an empty list due to a PDO null-binding issue in
    // PlantsModel::getPlantList(). Remove the workaround once the upstream fix
    // is released.
    // NOTE: sort is restricted to 'asc'|'desc' as a workaround for upstream bug
    // danielbrendel/hortusfox-web#533 — any other value is concatenated raw into
    // the SQL query, producing a syntax error. Remove the enum restriction once
    // the upstream fix is released.
    "List plants for a given location, paginated.",
    {
      location: z.string().describe("Location id to filter by."),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Max number of plants to return."),
      from: z.number().int().min(0).optional().describe("Pagination offset."),
      sort: z
        .enum(["asc", "desc"])
        .optional()
        .describe("Sort order by id."),
    },
    async (args) => {
      const data = await client.get("/plants/list", args);
      return jsonResult(data);
    },
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
    },
  );

  server.tool(
    "plants_get",
    "Get full details for a single plant, including custom attributes.",
    {
      plant: z.string().or(z.number().int().positive()).describe("Plant id."),
    },
    async (args) => {
      const data = await client.get("/plants/get", { plant: args.plant });
      return jsonResult(data);
    },
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
    },
  );

  server.tool(
    "plants_gallery_list",
    "List gallery photos for a plant.",
    {
      plant: z.string().or(z.number().int().positive()),
    },
    async (args) => {
      const data = await client.get("/plants/gallery/list", {
        plant: args.plant,
      });
      return jsonResult(data);
    },
  );
}

function registerWrites(server: McpServer, client: HortusFoxClient): void {
  server.tool(
    "plants_add",
    `Add a new plant. Returns the new plant id.

IMPORTANT — photo workflow (always run after adding):
After successfully adding the plant, immediately call plants_photo_set with a
high-quality photo URL found using the following strategy (in order of preference):

1. Wikimedia Commons (best quality, stable URLs, freely licensed):
   Search https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srsearch=<scientific_name>&format=json
   Pick the first result whose title ends in .jpg or .png, then resolve to a
   full-resolution URL via:
   https://commons.wikimedia.org/w/api.php?action=query&titles=File:<filename>&prop=imageinfo&iiprop=url&format=json
   Use the "url" field from imageinfo as the photo URL.

2. If Wikimedia returns no usable result, fall back to a web image search using
   the query "<scientific_name> plant high resolution" and select a direct .jpg
   or .png URL from a reputable source (botanical garden, university, iNaturalist,
   or Wikipedia infobox image).

Always prefer the scientific name over the common name for photo searches.
If scientific name is unknown, use "<common_name> plant".
Log the source URL used so the user can verify or replace it later.`,
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
    },
  );

  server.tool(
    "plants_update_attribute",
    "Update a single attribute on a plant. Pass value '#null' to clear it. NOTE: the 'cutting_month' attribute is zero-indexed (0=January, 1=February, ..., 11=December).",
    {
      plant: z.string().or(z.number().int().positive()),
      attribute: z
        .string()
        .min(1)
        .describe(
          "Column name to set (validated against allow-list server-side). For 'cutting_month': use 0=January, 1=February, ..., 11=December.",
        ),
      value: z
        .string()
        .describe("New value. Use the literal '#null' to clear. For 'cutting_month', provide a zero-indexed integer (0=January … 11=December)."),
    },
    async (args) => {
      const data = await client.get("/plants/update", args);
      return jsonResult(data);
    },
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
    },
  );

  server.tool(
    "plants_photo_set",
    "Set the main photo for a plant. By default uses the URL path (external=1).",
    {
      plant: z.string().or(z.number().int().positive()),
      photo: z.string().url().describe("Absolute URL of the photo to use."),
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
          "Multipart photo upload is not supported in v0.1. Use a photo URL (external=true).",
        );
      }
      const data = await client.get("/plants/photo/update", args);
      return jsonResult(data);
    },
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
          "Multipart photo upload is not supported in v0.1. Use a photo URL (external=true).",
        );
      }
      const data = await client.get("/plants/gallery/add", args);
      return jsonResult(data);
    },
  );

  server.tool(
    "plants_gallery_edit",
    "Rename (edit label of) a gallery photo.",
    {
      plant: z.string().or(z.number().int().positive()),
      item: z
        .string()
        .or(z.number().int().positive())
        .describe("Gallery item id."),
      label: z.string().min(1).describe("New caption."),
    },
    async (args) => {
      const data = await client.get("/plants/gallery/edit", args);
      return jsonResult(data);
    },
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
    async () => ({ note: "Gallery photo will be permanently deleted." }),
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
    },
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
    },
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
      if (plant === undefined)
        return { note: `Attribute "${label}" will be removed.` };
      const details = await client.get("/plants/get", { plant });
      return {
        plant,
        label,
        current:
          (details as { data?: { custom?: unknown[] } }).data?.custom ?? [],
      };
    },
    ["plant"],
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
    },
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
    },
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
    async () => ({ note: "Log entry will be permanently deleted." }),
  );
}
