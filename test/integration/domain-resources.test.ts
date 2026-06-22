import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

describe("non-plants resources (integration)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("H-res-101: resources/list includes the 5 static non-plant resources", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listResources();
      const uris = list.resources.map((r) => r.uri);
      expect(uris).toEqual(
        expect.arrayContaining([
          "hortusfox://locations",
          "hortusfox://inventory",
          "hortusfox://tasks",
          "hortusfox://calendar",
        ]),
      );
      for (const uri of uris) {
        const r = list.resources.find((x) => x.uri === uri);
        expect(r?.mimeType).toBe("application/json");
      }
    } finally {
      await close();
    }
  });

  it("H-res-102: resources/templates/list includes locations/{id}", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listResourceTemplates();
      const uris = list.resourceTemplates.map((r) => r.uriTemplate);
      expect(uris).toContain("hortusfox://locations/{id}");
    } finally {
      await close();
    }
  });

  it("H-res-103: resources/read hortusfox://locations -> /locations/list?include_plants=1", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://locations" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/locations/list");
      expect(query.get("include_plants")).toBe("1");
    } finally {
      await close();
    }
  });

  it("H-res-104: resources/read hortusfox://locations/3 -> /locations/info", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://locations/3" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/locations/info");
      expect(query.get("location")).toBe("3");
      expect(query.get("include_plants")).toBe("1");
    } finally {
      await close();
    }
  });

  it("H-res-105: resources/read hortusfox://inventory -> /inventory/fetch", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://inventory" });
      const { path } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/inventory/fetch");
    } finally {
      await close();
    }
  });

  it("H-res-106: resources/read hortusfox://tasks -> /tasks/fetch?done=0", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://tasks" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/tasks/fetch");
      expect(query.get("done")).toBe("0");
    } finally {
      await close();
    }
  });

  it("H-res-107: resources/read hortusfox://calendar -> /calendar/fetch", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, data: [] } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://calendar" });
      const { path } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/calendar/fetch");
    } finally {
      await close();
    }
  });
});
