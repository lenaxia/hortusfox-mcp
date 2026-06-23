import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";

// Valid plant columns for locations_list include_info.
// Sourced from PlantsModel::$allowed_attributes + $sorting_list + id.
// Upstream concatenates this raw into SELECT (PlantsModel::getSpecificInfo),
// so we must validate it here to prevent SQL injection.
const PLANT_COLUMNS = [
  "id",
  "name",
  "scientific_name",
  "knowledge_link",
  "location",
  "tags",
  "photo",
  "last_watered",
  "last_repotted",
  "last_fertilised",
  "last_edited_date",
  "lifespan",
  "hardy",
  "cutting_month",
  "date_of_purchase",
  "humidity",
  "light_level",
  "health_state",
  "notes",
  "history",
  "history_date",
] as const;

const includeInfoSchema = z
  .string()
  .optional()
  .default("id")
  .refine(
    (val) =>
      val
        .split(",")
        .map((s) => s.trim())
        .every((col) =>
          PLANT_COLUMNS.includes(col as (typeof PLANT_COLUMNS)[number]),
        ),
    {
      message: `include_info must be comma-separated values from: ${PLANT_COLUMNS.join(", ")}`,
    },
  )
  .describe(
    `Comma-separated plant columns when include_plants=true. ` +
      `Valid: ${PLANT_COLUMNS.join(", ")}.`,
  );

export function registerLocationTools(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.tool(
    "locations_list",
    "List all locations, optionally with plants and counts.",
    {
      only_active: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, only return active locations."),
      include_plants: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, include plant counts and lists per location."),
      include_info: includeInfoSchema,
      paginate: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Pagination cursor as expected by the upstream API."),
      limit: z.number().int().positive().max(500).optional(),
    },
    async (args) => {
      const data = await client.get("/locations/list", args);
      return jsonResult(data);
    },
  );

  server.tool(
    "locations_info",
    "Get details for a single location, optionally including its plants.",
    {
      location: z.string().or(z.number().int().positive()),
      include_plants: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, include the list of plants at this location."),
    },
    async (args) => {
      const data = await client.get("/locations/info", args);
      return jsonResult(data);
    },
  );
}
