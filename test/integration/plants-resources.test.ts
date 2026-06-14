import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

function bodyText(result: { contents?: unknown[] }): string {
  const contents = result.contents ?? [];
  const entry = contents.find(
    (c) => (c as { mimeType?: string }).mimeType === "application/json",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

describe("plants resources (integration)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("H-res-001: resources/list includes static hortusfox://plants", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listResources();
      const uris = list.resources.map((r) => r.uri);
      expect(uris).toContain("hortusfox://plants");
      const plants = list.resources.find((r) => r.uri === "hortusfox://plants");
      expect(plants?.mimeType).toBe("application/json");
    } finally {
      await close();
    }
  });

  it("H-res-002: resources/templates/list returns the 3 templates", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listResourceTemplates();
      const uris = list.resourceTemplates.map((r) => r.uriTemplate);
      expect(uris).toEqual(
        expect.arrayContaining([
          "hortusfox://plants/{id}",
          "hortusfox://plants/{id}/log",
          "hortusfox://plants/{id}/gallery",
        ]),
      );
    } finally {
      await close();
    }
  });

  it("H-res-003: resources/read hortusfox://plants -> /plants/list", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, list: [{ id: 1 }] } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://plants" });
      const { path } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/list");
    } finally {
      await close();
    }
  });

  it("H-res-004: resources/read hortusfox://plants/7 -> /plants/get?plant=7", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      const out = await mcp.readResource({ uri: "hortusfox://plants/7" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/get");
      expect(query.get("plant")).toBe("7");
      const text = bodyText(out);
      expect(text.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it("H-res-005: resources/read hortusfox://plants/7/log", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://plants/7/log" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/log/fetch");
      expect(query.get("plant")).toBe("7");
    } finally {
      await close();
    }
  });

  it("H-res-006: resources/read hortusfox://plants/7/gallery", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://plants/7/gallery" });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/gallery/list");
      expect(query.get("plant")).toBe("7");
    } finally {
      await close();
    }
  });

  it("U-res-007: resources/read unknown URI -> error", async () => {
    const { mcp, close } = await startServer();
    try {
      await expect(
        mcp.readResource({ uri: "hortusfox://nonexistent" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });
});
