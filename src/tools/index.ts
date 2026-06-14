import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { registerBackupTools } from "./backup.js";
import { registerCalendarTools } from "./calendar.js";
import { registerChatTools } from "./chat.js";
import { registerInventoryTools } from "./inventory.js";
import { registerLocationTools } from "./locations.js";
import { registerPlantTools } from "./plants.js";
import { registerTaskTools } from "./tasks.js";

export function registerAllTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config,
): void {
  registerPlantTools(server, client, config);
  registerLocationTools(server, client);
  registerTaskTools(server, client, config);
  registerInventoryTools(server, client, config);
  registerCalendarTools(server, client, config);
  registerChatTools(server, client, config);
  if (config.enableBackup) {
    registerBackupTools(server, client);
  }
}
