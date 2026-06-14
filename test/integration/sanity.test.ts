import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

describe("sanity: in-memory server + mock fetch wiring", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("tools/list returns a non-empty set", async () => {
    const { mcp, close } = await startServer();
    try {
      const list = await mcp.listTools();
      expect(list.tools.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it("calling plants_list hits the mocked fetch", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, list: [{ id: 7 }] } });
    const { mcp, close } = await startServer();
    try {
      const result = await mcp.callTool({ name: "plants_list", arguments: {} });
      expect(fetcher.calls).toHaveLength(1);
      const { path } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/list");
      const text = (result.content as Array<{ type: string; text?: string }>).find(
        (c) => c.type === "text"
      )?.text;
      expect(JSON.parse(text ?? "{}")).toEqual({ list: [{ id: 7 }] });
    } finally {
      await close();
    }
  });
});
