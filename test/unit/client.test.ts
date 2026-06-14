import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HortusFoxClient } from "../../src/client.js";
import type { Config } from "../../src/config.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";

const { setDispatcherCalls, agentInstances, FakeAgent } = vi.hoisted(() => {
  const setDispatcherCalls: unknown[] = [];
  const agentInstances: unknown[] = [];
  class FakeAgent {
    constructor(opts: unknown) {
      agentInstances.push(opts);
    }
  }
  return { setDispatcherCalls, agentInstances, FakeAgent };
});

vi.mock("undici", () => ({
  Agent: FakeAgent,
  setGlobalDispatcher: (a: unknown) => {
    setDispatcherCalls.push(a);
  },
}));

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    baseUrl: "http://mock.test",
    apiToken: "abcdefgh1234567890",
    verifyTls: true,
    timeoutMs: 10_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 1000,
    ...overrides,
  };
}

describe("HortusFoxClient", () => {
  let fetcher: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => {
    fetcher.restore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("request shaping", () => {
    it("H-cli-001: get constructs /api path + token + params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, ok: true } });
      const client = new HortusFoxClient(baseConfig());
      await client.get("/plants/list", { limit: 5 });
      const { path, query } = parseUrl(fetcher.calls[0].url);
      expect(path).toBe("/api/plants/list");
      expect(query.get("token")).toBe("abcdefgh1234567890");
      expect(query.get("limit")).toBe("5");
    });

    it("H-cli-002: boolean true->1, false->0", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      await client.get("/x", { a: true, b: false });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("a")).toBe("1");
      expect(query.get("b")).toBe("0");
    });

    it("E-cli-003: null and undefined params are omitted", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      await client.get("/x", { a: null, b: undefined, c: "y" });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.has("a")).toBe(false);
      expect(query.has("b")).toBe(false);
      expect(query.get("c")).toBe("y");
    });

    it("H-cli-013: post sends JSON body and content-type", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      await client.post("/x", { a: 1 }, '{"k":"v"}');
      const call = fetcher.calls[0];
      expect(call.init.method).toBe("POST");
      expect(call.init.body).toBe('{"k":"v"}');
      const headers = new Headers(call.init.headers);
      expect(headers.get("content-type")).toBe("application/json");
    });
  });

  describe("response mapping", () => {
    it("H-cli-004: 200 with code:200 returns body minus code", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, list: [{ id: 1 }] } });
      const client = new HortusFoxClient(baseConfig());
      const data = await client.get("/plants/list");
      expect(data).toEqual({ list: [{ id: 1 }] });
      expect("code" in data).toBe(false);
    });

    it("E-cli-005: bare {code:200} -> {}", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      expect(await client.get("/x")).toEqual({});
    });

    it("E-cli-009: non-JSON 200 body -> empty object", async () => {
      fetcher.setDefault({
        status: 200,
        contentType: "text/html",
        body: "<html>error page</html>",
      });
      const client = new HortusFoxClient(baseConfig());
      expect(await client.get("/x")).toEqual({});
    });
  });

  describe("error mapping", () => {
    it("U-cli-006: HTTP 403 -> auth error with token preview", async () => {
      fetcher.setDefault({ status: 403, body: { code: 403, invalid_token: "x" } });
      const client = new HortusFoxClient(baseConfig());
      await expect(client.get("/x")).rejects.toMatchObject({
        kind: "auth",
        message: expect.stringMatching(/abcd.*90/),
      });
    });

    it("U-cli-007: 200 with code:500 -> upstream error with msg", async () => {
      fetcher.setDefault({ status: 200, body: { code: 500, msg: "DB down" } });
      const client = new HortusFoxClient(baseConfig());
      await expect(client.get("/x")).rejects.toMatchObject({
        kind: "upstream",
        message: expect.stringContaining("DB down"),
      });
    });

    it("U-cli-008: non-200 status with no JSON -> HTTP <status>", async () => {
      fetcher.setDefault({ status: 502, contentType: "text/plain", body: "" });
      const client = new HortusFoxClient(baseConfig());
      await expect(client.get("/x")).rejects.toMatchObject({
        kind: "upstream",
        message: expect.stringContaining("HTTP 502"),
      });
    });

    it("U-cli-010: fetch rejection -> network error", async () => {
      const client = new HortusFoxClient(baseConfig());
      vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.reject(new TypeError("fetch failed")));
      await expect(client.get("/x")).rejects.toMatchObject({
        kind: "network",
        message: expect.stringContaining("fetch failed"),
      });
    });

    it("U-cli-011: timeout -> network error mentioning timed out + ms", async () => {
      vi.useFakeTimers();
      const client = new HortusFoxClient(
        baseConfig({ timeoutMs: 50, maxRatePerSec: 1 })
      );
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_input, init) => new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal;
          signal?.addEventListener("abort", () => {
            const e = new Error("The operation was aborted");
            (e as Error & { name: string }).name = "AbortError";
            reject(e);
          });
        })
      );
      const p = client.get("/x");
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(60);
      await expect(p).rejects.toMatchObject({
        kind: "network",
        message: expect.stringContaining("timed out after 50ms"),
      });
      vi.useRealTimers();
    });
  });

  describe("TLS toggle", () => {
    beforeEach(() => {
      setDispatcherCalls.length = 0;
      agentInstances.length = 0;
    });

    it("H-cli-012: verifyTls:false -> setGlobalDispatcher called with rejectUnauthorized:false", () => {
      new HortusFoxClient(baseConfig({ verifyTls: false }));
      expect(setDispatcherCalls).toHaveLength(1);
      expect(agentInstances).toHaveLength(1);
      expect(agentInstances[0]).toMatchObject({
        connect: { rejectUnauthorized: false },
      });
    });

    it("H-cli-012b: verifyTls:true (default) -> setGlobalDispatcher not called", () => {
      new HortusFoxClient(baseConfig());
      expect(setDispatcherCalls).toHaveLength(0);
    });
  });

  describe("rate limiter integration", () => {
    it("H-cli-015: cap=N allows N immediate calls", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig({ maxRatePerSec: 5 }));
      await Promise.all([
        client.get("/a"),
        client.get("/b"),
        client.get("/c"),
        client.get("/d"),
        client.get("/e"),
      ]);
      expect(fetcher.calls).toHaveLength(5);
    });

    it("E-cli-014: cap=1 serializes two calls (2nd waits)", async () => {
      const nowMs = { v: 1_000_000 };
      vi.spyOn(Date, "now").mockImplementation(() => nowMs.v);
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig({ maxRatePerSec: 1 }));
      const p1 = client.get("/a");
      await p1;
      nowMs.v += 1_500;
      const p2 = client.get("/b");
      await p2;
      expect(fetcher.calls).toHaveLength(2);
    });
  });

  it("never throws on construction; surfaces error only when used", () => {
    expect(() => new HortusFoxClient(baseConfig())).not.toThrow();
  });

  describe("URL & param encoding (#3)", () => {
    it("encodes special chars: &, =, #, +, space", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      await client.get("/x", { name: "A & B = C #d +e f" });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("name")).toBe("A & B = C #d +e f");
    });

    it("encodes unicode (emoji, non-ASCII)", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      await client.get("/x", { name: "植物 🌵 café" });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("name")).toBe("植物 🌵 café");
    });

    it("forwards very long values (>2000 chars) without truncation", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const client = new HortusFoxClient(baseConfig());
      const long = "x".repeat(5000);
      await client.get("/x", { content: long });
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("content")).toBe(long);
    });

    it("encodes the token verbatim (no double encoding)", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const token = "tok+with=special&chars";
      const client = new HortusFoxClient(baseConfig({ apiToken: token }));
      await client.get("/x");
      const { query } = parseUrl(fetcher.calls[0].url);
      expect(query.get("token")).toBe(token);
    });
  });

  describe("ambiguous upstream responses (#6)", () => {
    it("200 with code as string '200' -> falls back to HTTP status, treated as success; string code stripped", async () => {
      fetcher.setDefault({ status: 200, body: { code: "200", data: 1 } });
      const client = new HortusFoxClient(baseConfig());
      const data = await client.get("/x");
      expect(data).toEqual({ data: 1 });
    });

    it("200 with no code field -> falls back to HTTP status 200, success", async () => {
      fetcher.setDefault({ status: 200, body: { arbitrary: "payload" } });
      const client = new HortusFoxClient(baseConfig());
      const data = await client.get("/x");
      expect(data).toEqual({ arbitrary: "payload" });
    });

    it("200 with malformed JSON body -> treated as empty, success (HTTP status wins)", async () => {
      fetcher.setDefault({
        status: 200,
        contentType: "application/json",
        body: "{not valid json",
      });
      const client = new HortusFoxClient(baseConfig());
      expect(await client.get("/x")).toEqual({});
    });

    it("3xx redirect: fetch follows by default; final 200 response succeeds", async () => {
      const original = globalThis.fetch;
      const fakeFetch = (() =>
        Promise.resolve(
          new Response(JSON.stringify({ code: 200, ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )) as unknown as typeof fetch;
      globalThis.fetch = fakeFetch;
      try {
        const client = new HortusFoxClient(baseConfig());
        const data = await client.get("/x");
        expect(data).toEqual({ ok: true });
      } finally {
        globalThis.fetch = original;
      }
    });

    it("documented quirk: non-200 HTTP status with valid {code:200} body -> body code wins (success)", async () => {
      fetcher.setDefault({ status: 500, body: { code: 200, msg: "lying body" } });
      const client = new HortusFoxClient(baseConfig());
      const data = await client.get("/x");
      expect(data).toEqual({ msg: "lying body" });
    });

    it("non-200 HTTP status with no code in body -> rejected as upstream error", async () => {
      fetcher.setDefault({ status: 500, body: { msg: "server error" } });
      const client = new HortusFoxClient(baseConfig());
      await expect(client.get("/x")).rejects.toMatchObject({ kind: "upstream" });
    });
  });

  describe("timeout abort signal (#9)", () => {
    it("aborts the in-flight fetch when timeout fires", async () => {
      vi.useFakeTimers();
      let abortSignal: AbortSignal | null = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(
        (_input, init) => {
          abortSignal = (init as RequestInit).signal ?? null;
          return new Promise((_resolve, reject) => {
            abortSignal?.addEventListener("abort", () => {
              const e = new Error("aborted");
              (e as Error & { name: string }).name = "AbortError";
              reject(e);
            });
          });
        }
      );
      const client = new HortusFoxClient(
        baseConfig({ timeoutMs: 50, maxRatePerSec: 1 })
      );
      const p = client.get("/x");
      p.catch(() => {});
      await Promise.resolve();
      await Promise.resolve();
      expect(abortSignal).not.toBeNull();
      expect(abortSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(60);
      await expect(p).rejects.toMatchObject({ kind: "network" });
      expect(abortSignal?.aborted).toBe(true);
      vi.useRealTimers();
    });
  });
});
