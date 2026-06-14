import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

interface McpToolResultShape {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

async function call(
  mcp: Awaited<ReturnType<typeof startServer>>["mcp"],
  name: string,
  args: Record<string, unknown>,
): Promise<McpToolResultShape> {
  try {
    return (await mcp.callTool({
      name,
      arguments: args,
    })) as McpToolResultShape;
  } catch (e) {
    return {
      isError: true,
      content: [
        { type: "text", text: e instanceof Error ? e.message : String(e) },
      ],
    };
  }
}

function isError(r: McpToolResultShape): boolean {
  return r.isError === true;
}

describe("zod schema corner cases (#12)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("rejects plant id 0 (positive only)", async () => {
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_get", { plant: 0 });
      expect(isError(r)).toBe(true);
      expect(fetcher.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("rejects plant id as negative number", async () => {
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_get", { plant: -5 });
      expect(isError(r)).toBe(true);
      expect(fetcher.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("rejects confirm as string 'true' (must be boolean)", async () => {
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_remove", {
        plant: 1,
        confirm: "true" as unknown as boolean,
      });
      expect(isError(r)).toBe(true);
      expect(fetcher.calls).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("rejects plants_list with negative limit", async () => {
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_list", { limit: -1 });
      expect(isError(r)).toBe(true);
    } finally {
      await close();
    }
  });

  it("rejects plants_list with limit exceeding max (500)", async () => {
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_list", { limit: 501 });
      expect(isError(r)).toBe(true);
    } finally {
      await close();
    }
  });

  it("accepts plant id as numeric string '5'", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_get", { plant: "5" });
      expect(isError(r)).toBe(false);
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("plant")).toBe("5");
    } finally {
      await close();
    }
  });

  it("extra/unknown args are ignored (not forwarded)", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_list", {
        limit: 5,
        malicious: "DROP TABLE",
      } as Record<string, unknown>);
      expect(isError(r)).toBe(false);
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.has("malicious")).toBe(false);
    } finally {
      await close();
    }
  });

  it("accepts very long string values (no length cap)", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      const long = "y".repeat(10_000);
      const r = await call(mcp, "plants_update_attribute", {
        plant: 1,
        attribute: "name",
        value: long,
      });
      expect(isError(r)).toBe(false);
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("value")).toBe(long);
    } finally {
      await close();
    }
  });

  it("accepts whitespace-only expression (length-based validation, not trimmed)", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
    const { mcp, close } = await startServer();
    try {
      const r = await call(mcp, "plants_search", { expression: "   " });
      expect(isError(r)).toBe(false);
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("expression")).toBe("   ");
    } finally {
      await close();
    }
  });
});

describe("param forwarding (#13)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("plants_search forwards limit param", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await call(mcp, "plants_search", { expression: "x", limit: 25 });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("limit")).toBe("25");
    } finally {
      await close();
    }
  });

  it("plants_log_fetch forwards paginate param", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await call(mcp, "plants_log_fetch", { plant: 1, paginate: 30, limit: 5 });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("paginate")).toBe("30");
      expect(query.get("limit")).toBe("5");
    } finally {
      await close();
    }
  });

  it("plants_log_fetch default limit is 10 when omitted", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await call(mcp, "plants_log_fetch", { plant: 1 });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("limit")).toBe("10");
    } finally {
      await close();
    }
  });

  it("plants_list forwards all four optional params", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200 } });
    const { mcp, close } = await startServer();
    try {
      await call(mcp, "plants_list", {
        location: "2",
        limit: 10,
        from: 5,
        sort: "name",
      });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("location")).toBe("2");
      expect(query.get("limit")).toBe("10");
      expect(query.get("from")).toBe("5");
      expect(query.get("sort")).toBe("name");
    } finally {
      await close();
    }
  });
});
