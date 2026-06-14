import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../client.js";

export function registerPlantResources(
  server: McpServer,
  client: HortusFoxClient
): void {
  server.resource(
    "plants",
    "hortusfox://plants",
    { mimeType: "application/json", description: "All plants." },
    async () => {
      const data = await client.get("/plants/list");
      return toResource("hortusfox://plants", data);
    }
  );

  const plantTemplate = new ResourceTemplate("hortusfox://plants/{id}", {
    list: undefined,
  });
  server.resource(
    "plant",
    plantTemplate,
    { mimeType: "application/json", description: "A single plant with attributes." },
    async (uri, { id }) => {
      const data = await client.get("/plants/get", { plant: id });
      return toResource(uri.href, data);
    }
  );

  const logTemplate = new ResourceTemplate("hortusfox://plants/{id}/log", {
    list: undefined,
  });
  server.resource(
    "plant-log",
    logTemplate,
    { mimeType: "application/json", description: "Log entries for a plant." },
    async (uri, { id }) => {
      const data = await client.get("/plants/log/fetch", { plant: id });
      return toResource(uri.href, data);
    }
  );

  const galleryTemplate = new ResourceTemplate(
    "hortusfox://plants/{id}/gallery",
    { list: undefined }
  );
  server.resource(
    "plant-gallery",
    galleryTemplate,
    { mimeType: "application/json", description: "Gallery photos for a plant." },
    async (uri, { id }) => {
      const data = await client.get("/plants/gallery/list", { plant: id });
      return toResource(uri.href, data);
    }
  );
}

function toResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
