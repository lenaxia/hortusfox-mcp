import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { toResource } from "./shared.js";

export function registerInventoryResource(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.resource(
    "inventory",
    "hortusfox://inventory",
    { mimeType: "application/json", description: "All inventory items." },
    async () => {
      const data = await client.get("/inventory/fetch");
      return toResource("hortusfox://inventory", data);
    },
  );
}
