import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";
import { registerConfirmableRemove } from "./shared.js";

export function registerCalendarTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config,
): void {
  server.tool(
    "calendar_list",
    "List calendar entries in a date range. Defaults to today through +30 days.",
    {
      date_from: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Defaults to today."),
      date_till: z
        .string()
        .optional()
        .describe(
          "ISO date (YYYY-MM-DD). Defaults to +30 days from date_from.",
        ),
    },
    async (args) => {
      const data = await client.get("/calendar/fetch", args);
      return jsonResult(data);
    },
  );

  if (!config.enableWrites) return;

  server.tool(
    "calendar_add",
    "Add a calendar entry. If date_till is omitted, defaults to date_from + 1 day.",
    {
      name: z.string().min(1),
      date_from: z.string().describe("ISO date (YYYY-MM-DD)."),
      date_till: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Defaults to date_from + 1 day."),
      class: z
        .string()
        .optional()
        .describe("Calendar class name. Unknown classes get a fallback color."),
    },
    async (args) => {
      const data = await client.get("/calendar/add", args);
      return jsonResult(data);
    },
  );

  server.tool(
    "calendar_edit",
    "Edit a calendar entry. WARNING: upstream overwrites name, date_from, " +
      "date_till and class unconditionally (see audit). name and date_from " +
      "are required; date_till defaults to next day if omitted; class is " +
      "optional but an unknown class will overwrite class_name.",
    {
      ident: z.string().or(z.number().int().positive()),
      name: z.string().min(1),
      date_from: z.string(),
      date_till: z.string().optional(),
      class: z.string().optional(),
    },
    async (args) => {
      const data = await client.get("/calendar/edit", args);
      return jsonResult(data);
    },
  );

  registerConfirmableRemove(
    server,
    "calendar_remove",
    "Remove a calendar entry.",
    "ident",
    async (ident) => {
      const data = await client.get("/calendar/remove", { ident });
      return data;
    },
    async () => ({ note: "Calendar entry will be permanently deleted." }),
  );
}
