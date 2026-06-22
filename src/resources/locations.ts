import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";
import { toResource } from "./shared.js";

export function registerLocationResources(
  server: McpServer,
  client: HortusFoxClient,
): void {
  server.resource(
    "locations",
    "hortusfox://locations",
    {
      mimeType: "application/json",
      description: "All locations with plant counts.",
    },
    async () => {
      const data = await client.get("/locations/list", {
        include_plants: true,
      });
      return toResource("hortusfox://locations", data);
    },
  );

  const locationTemplate = new ResourceTemplate("hortusfox://locations/{id}", {
    list: undefined,
  });
  server.resource(
    "location",
    locationTemplate,
    {
      mimeType: "application/json",
      description: "A single location with its plants.",
    },
    async (uri, { id }) => {
      const data = await client.get("/locations/info", {
        location: id,
        include_plants: true,
      });
      return toResource(uri.href, data);
    },
  );
}
