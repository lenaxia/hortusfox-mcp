import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";

export function registerChatTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config
): void {
  server.tool(
    "chat_list",
    "Fetch recent chat messages.",
    {
      limit: z.number().int().positive().max(500).optional().default(50),
    },
    async (args) => {
      const data = await client.get("/chat/fetch", args);
      return jsonResult(data);
    }
  );

  if (!config.enableWrites) return;

  server.tool(
    "chat_post",
    "Post a message to the workspace chat.",
    {
      message: z.string().min(1),
    },
    async (args) => {
      const data = await client.get("/chat/message/add", args);
      return jsonResult(data);
    }
  );
}
