export class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly perSec: number
  ) {
    if (!Number.isFinite(capacity) || capacity < 1) {
      throw new Error(
        `RateLimiter capacity must be a positive finite number (got ${capacity})`
      );
    }
    if (!Number.isFinite(perSec) || perSec < 1) {
      throw new Error(
        `RateLimiter perSec must be a positive finite number (got ${perSec})`
      );
    }
    this.tokens = capacity;
  }

  async acquire(): Promise<void> {
    const maxAttempts = 1000;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.max(10, (1 / this.perSec) * 1000);
      await sleep(waitMs);
    }
    throw new Error(
      `RateLimiter.acquire() exhausted after ${maxAttempts} attempts; capacity=${this.capacity}, perSec=${this.perSec}`
    );
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const refilled = elapsed * this.perSec;
    if (refilled > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refilled);
      this.lastRefill = now;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
