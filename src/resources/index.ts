import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { registerPlantResources } from "./plants.js";

export function registerAllResources(
  server: McpServer,
  client: HortusFoxClient,
): void {
  registerPlantResources(server, client);
  // Remaining domain resources wired here as they land.
}
