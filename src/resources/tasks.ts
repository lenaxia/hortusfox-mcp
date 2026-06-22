import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { toResource } from "./shared.js";

export function registerTasksResource(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.resource(
    "tasks",
    "hortusfox://tasks",
    { mimeType: "application/json", description: "Open tasks." },
    async () => {
      const data = await client.get("/tasks/fetch", { done: false });
      return toResource("hortusfox://tasks", data);
    },
  );
}
