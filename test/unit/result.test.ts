import { describe, expect, it } from "vitest";
import { jsonResult, textResult, errorResult } from "../../src/result.js";

describe("result helpers", () => {
  it("H-res-001: jsonResult wraps JSON text and isError falsy", () => {
    const r = jsonResult({ a: 1 });
    expect(r.content).toHaveLength(1);
    expect(r.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((r.content[0] as { text: string }).text)).toEqual({
      a: 1,
    });
    expect(r.isError).toBeFalsy();
  });

  it("H-res-002: textResult returns plain text", () => {
    const r = textResult("hello");
    expect((r.content[0] as { text: string }).text).toBe("hello");
    expect(r.isError).toBeFalsy();
  });

  it("H-res-003: errorResult sets isError and Error: prefix", () => {
    const r = errorResult("boom");
    expect((r.content[0] as { text: string }).text).toBe("Error: boom");
    expect(r.isError).toBe(true);
  });
});
