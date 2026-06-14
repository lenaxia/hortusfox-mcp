import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/rate-limiter.js";

describe("rate-limiter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("H-rate-001: capacity=3 burst resolves instantly", async () => {
    const limiter = new RateLimiter(3, 3);
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);
  });

  it("E-rate-002: 4th acquire blocks then resolves after time passes", async () => {
    const nowMs = { v: 1_000_000 };
    vi.spyOn(Date, "now").mockImplementation(() => nowMs.v);
    const realSetTimeout = setTimeout;
    const sleepReal = (_ms: number) =>
      new Promise<void>((r) => realSetTimeout(() => r(), 0));

    const limiter = new RateLimiter(3, 3);
    await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);

    let resolved = false;
    const p = limiter.acquire().then(() => {
      resolved = true;
    });

    await sleepReal(0);
    await sleepReal(0);
    expect(resolved).toBe(false);

    nowMs.v += 400;
    await sleepReal(0);
    await sleepReal(0);
    await p;
    expect(resolved).toBe(true);
  });

  it("H-rate-003: refill rate matches perSec", async () => {
    const nowMs = { v: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => nowMs.v);
    const realSetTimeout = setTimeout;
    const sleepReal = () =>
      new Promise<void>((r) => realSetTimeout(() => r(), 0));

    const limiter = new RateLimiter(1, 10);
    await limiter.acquire();

    let resolved = false;
    const p = limiter.acquire().then(() => {
      resolved = true;
    });

    nowMs.v += 50;
    await sleepReal();
    await sleepReal();
    expect(resolved).toBe(false);

    nowMs.v += 60;
    await sleepReal();
    await sleepReal();
    await p;
    expect(resolved).toBe(true);
  });

  it("E-rate-004: capacity ceiling holds after long idle", async () => {
    const nowMs = { v: 1_000_000 };
    vi.spyOn(Date, "now").mockImplementation(() => nowMs.v);
    const realSetTimeout = setTimeout;
    const sleepReal = () =>
      new Promise<void>((r) => realSetTimeout(() => r(), 0));

    const limiter = new RateLimiter(2, 100);
    nowMs.v += 10_000;
    await limiter.acquire();
    await limiter.acquire();

    let extra = false;
    limiter.acquire().then(() => {
      extra = true;
    });
    await sleepReal();
    await sleepReal();
    await sleepReal();
    expect(extra).toBe(false);
  });

  describe("constructor validation", () => {
    it.each([
      [0, 10, "capacity 0"],
      [-1, 10, "capacity negative"],
      [NaN, 10, "capacity NaN"],
      [Infinity, 10, "capacity Infinity"],
    ])("rejects capacity=%i perSec=%i (%s)", (capacity, perSec) => {
      expect(() => new RateLimiter(capacity, perSec)).toThrow(/capacity/);
    });

    it.each([
      [10, 0, "perSec 0"],
      [10, -1, "perSec negative"],
      [10, NaN, "perSec NaN"],
      [10, Infinity, "perSec Infinity"],
    ])("rejects capacity=%i perSec=%i (%s)", (capacity, perSec) => {
      expect(() => new RateLimiter(capacity, perSec)).toThrow(/perSec/);
    });

    it("accepts minimal valid values capacity=1 perSec=1", async () => {
      const limiter = new RateLimiter(1, 1);
      await limiter.acquire();
    });

    it("accepts fractional capacity >= 1 (token bucket math tolerates it)", () => {
      expect(() => new RateLimiter(1.5, 1)).not.toThrow();
    });
  });

  it("E-rate-005: acquire() throws after exhausting attempts (not silent return)", async () => {
    const nowMs = { v: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => nowMs.v);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((cb: () => void) => {
      cb();
      return {} as NodeJS.Timeout;
    });

    const limiter = new RateLimiter(1, 1);
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toThrow(/exhausted/);
  });
});
