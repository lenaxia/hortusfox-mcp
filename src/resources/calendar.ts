import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { toResource } from "./shared.js";

export function registerCalendarResource(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.resource(
    "calendar",
    "hortusfox://calendar",
    {
      mimeType: "application/json",
      description: "Calendar entries (defaults to next 30 days).",
    },
    async () => {
      const data = await client.get("/calendar/fetch");
      return toResource("hortusfox://calendar", data);
    },
  );
}
