import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HortusFoxClient } from "../client.js";
import { errorResult, jsonResult } from "../result.js";

export function registerBackupTools(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.tool(
    "backup_export",
    "Export selected data types to a backup file. Returns a URL to download the backup.",
    {
      locations: z.boolean().optional().default(false),
      plants: z.boolean().optional().default(false),
      gallery: z.boolean().optional().default(false),
      tasks: z.boolean().optional().default(false),
      inventory: z.boolean().optional().default(false),
      calendar: z.boolean().optional().default(false),
    },
    async (args) => {
      const data = await client.get("/backup/export", args);
      return jsonResult(data);
    },
  );

  server.tool(
    "backup_import",
    "Import data from a backup file. DESTRUCTIVE: overwrites the selected data " +
      "types. Requires an explicit confirm flag to proceed.",
    {
      confirm: z
        .boolean()
        .describe(
          'Must be true to proceed. Set to the literal boolean true, not the string "true".',
        ),
      locations: z.boolean().optional().default(false),
      plants: z.boolean().optional().default(false),
      gallery: z.boolean().optional().default(false),
      tasks: z.boolean().optional().default(false),
      inventory: z.boolean().optional().default(false),
      calendar: z.boolean().optional().default(false),
    },
    async (args) => {
      if (!args.confirm) {
        return errorResult(
          "backup_import is destructive and requires confirm=true. " +
            "Re-call with confirm=true and the data types you want to overwrite.",
        );
      }
      const { confirm: _confirm, ...params } = args;
      const data = await client.post(
        "/backup/import",
        params,
        JSON.stringify(params),
      );
      return jsonResult(data);
    },
  );
}
