import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";

export function registerLocationTools(
  server: McpServer,
  client: HortusFoxClient
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
      include_info: z
        .string()
        .optional()
        .default("id")
        .describe("Comma-separated plant info columns to include when include_plants=true."),
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
    }
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
    }
  );
}
