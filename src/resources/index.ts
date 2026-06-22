import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { registerCalendarResource } from "./calendar.js";
import { registerInventoryResource } from "./inventory.js";
import { registerLocationResources } from "./locations.js";
import { registerPlantResources } from "./plants.js";
import { registerTasksResource } from "./tasks.js";

export function registerAllResources(
  server: McpServer,
  client: HortusFoxClient,
): void {
  registerPlantResources(server, client);
  registerLocationResources(server, client);
  registerInventoryResource(server, client);
  registerTasksResource(server, client);
  registerCalendarResource(server, client);
}
