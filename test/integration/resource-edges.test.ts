import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

describe("resource URI edge cases (#14)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("non-numeric plant id in template URI is forwarded as-is (template doesn't type-check)", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://plants/abc" });
      expect(fetcher.calls).toHaveLength(1);
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("plant")).toBe("abc");
    } finally {
      await close();
    }
  });

  it("rejects extra path segments beyond template", async () => {
    const { mcp, close } = await startServer();
    try {
      await expect(
        mcp.readResource({ uri: "hortusfox://plants/7/log/extra" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("handles URL-encoded id in URI", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await mcp.readResource({ uri: "hortusfox://plants/7" });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("plant")).toBe("7");
    } finally {
      await close();
    }
  });

  it("rejects malformed URI (wrong scheme)", async () => {
    const { mcp, close } = await startServer();
    try {
      await expect(
        mcp.readResource({ uri: "http://plants/7" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects empty id segment", async () => {
    const { mcp, close } = await startServer();
    try {
      await expect(
        mcp.readResource({ uri: "hortusfox://plants/" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });

  it("rejects negative plant id in URI", async () => {
    const { mcp, close } = await startServer();
    try {
      await expect(
        mcp.readResource({ uri: "hortusfox://plants/-5" }),
      ).rejects.toThrow();
    } finally {
      await close();
    }
  });
});
