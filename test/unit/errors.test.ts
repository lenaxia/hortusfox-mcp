import { describe, expect, it } from "vitest";
import {
  HortusFoxError,
  authError,
  networkError,
  upstreamError,
} from "../../src/errors.js";

describe("errors", () => {
  it("H-err-001: HortusFoxError carries all fields", () => {
    const detail = { foo: 1 };
    const err = new HortusFoxError("boom", "auth", detail);
    expect(err.message).toBe("boom");
    expect(err.kind).toBe("auth");
    expect(err.detail).toBe(detail);
    expect(err.name).toBe("HortusFoxError");
    expect(err instanceof Error).toBe(true);
  });

  it("H-err-002: authError masks token in message", () => {
    const err = authError("abcdefghijklmnop");
    expect(err.kind).toBe("auth");
    expect(err.message).toMatch(/abcd.*op/);
    expect(err.message).not.toContain("abcdefghijklmnop");
  });

  it("E-err-003: short token preview uses first-2-chars form", () => {
    const err = authError("ab");
    expect(err.message).toContain("ab…");
  });

  it("H-err-004: networkError includes base url and cause", () => {
    const cause = new Error("fetch failed");
    const err = networkError("http://x.test", cause);
    expect(err.kind).toBe("network");
    expect(err.message).toContain("http://x.test");
    expect(err.message).toContain("fetch failed");
    expect(err.detail).toBe(cause);
  });

  it("H-err-005: upstreamError prefixes and forwards detail", () => {
    const err = upstreamError("DB down", { extra: 1 });
    expect(err.kind).toBe("upstream");
    expect(err.message).toBe("HortusFox API error: DB down");
    expect(err.detail).toEqual({ extra: 1 });
  });
});
