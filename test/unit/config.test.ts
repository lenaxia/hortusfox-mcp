import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";

const ENV_STASH = { ...process.env };

describe("config / loadConfig", () => {
  beforeEach(() => {
    process.env = { ...ENV_STASH };
    delete process.env.HORTUSFOX_BASE_URL;
    delete process.env.HORTUSFOX_API_TOKEN;
    delete process.env.HORTUSFOX_VERIFY_TLS;
    delete process.env.HORTUSFOX_TIMEOUT_MS;
    delete process.env.HORTUSFOX_ENABLE_WRITES;
    delete process.env.HORTUSFOX_ENABLE_BACKUP;
    delete process.env.HORTUSFOX_MAX_RATE_PER_SEC;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubExit(): { spy: ReturnType<typeof vi.spyOn>; stderr: string[] } {
    const stderr: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      stderr.push(args.map(String).join(" "));
    });
    const spy = vi
      .spyOn(process, "exit")
      .mockImplementation((code?: number) => {
        throw new Error(`EXIT_${code ?? 0}`);
      });
    return { spy, stderr };
  }

  it("U-config-001: missing HORTUSFOX_BASE_URL exits 1", () => {
    process.env.HORTUSFOX_API_TOKEN = "x";
    const { stderr } = stubExit();
    expect(() => loadConfig()).toThrow(/EXIT_1/);
    expect(stderr.some((s) => s.includes("HORTUSFOX_BASE_URL"))).toBe(true);
  });

  it("U-config-002: empty/whitespace base url exits 1", () => {
    process.env.HORTUSFOX_BASE_URL = "   ";
    process.env.HORTUSFOX_API_TOKEN = "x";
    stubExit();
    expect(() => loadConfig()).toThrow(/EXIT_1/);
  });

  it("U-config-003: missing HORTUSFOX_API_TOKEN exits 1", () => {
    process.env.HORTUSFOX_BASE_URL = "http://localhost";
    const { stderr } = stubExit();
    expect(() => loadConfig()).toThrow(/EXIT_1/);
    expect(stderr.some((s) => s.includes("HORTUSFOX_API_TOKEN"))).toBe(true);
  });

  it("U-config-004: scheme-less url exits 1", () => {
    process.env.HORTUSFOX_BASE_URL = "localhost";
    process.env.HORTUSFOX_API_TOKEN = "x";
    const { stderr } = stubExit();
    expect(() => loadConfig()).toThrow(/EXIT_1/);
    expect(stderr.some((s) => s.includes("http(s)://"))).toBe(true);
  });

  it("E-config-005: multiple trailing slashes are stripped", () => {
    process.env.HORTUSFOX_BASE_URL = "http://localhost:8080///";
    process.env.HORTUSFOX_API_TOKEN = "x";
    expect(loadConfig().baseUrl).toBe("http://localhost:8080");
  });

  it("E-config-006: surrounding whitespace on base url is trimmed", () => {
    process.env.HORTUSFOX_BASE_URL = "  https://plants.example.com  ";
    process.env.HORTUSFOX_API_TOKEN = "tok";
    expect(loadConfig().baseUrl).toBe("https://plants.example.com");
  });

  it("H-config-007: documented defaults are applied", () => {
    process.env.HORTUSFOX_BASE_URL = "http://x";
    process.env.HORTUSFOX_API_TOKEN = "tok";
    const cfg = loadConfig();
    expect(cfg).toMatchObject({
      baseUrl: "http://x",
      apiToken: "tok",
      verifyTls: true,
      timeoutMs: 10_000,
      enableWrites: true,
      enableBackup: false,
      maxRatePerSec: 10,
    });
  });

  it.each([
    ["1", true],
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["on", true],
    ["0", false],
    ["false", false],
    ["no", false],
    ["", false],
    ["maybe", false],
  ])("H-config-008: bool parsing of %s -> %s", (raw, expected) => {
    process.env.HORTUSFOX_BASE_URL = "http://x";
    process.env.HORTUSFOX_API_TOKEN = "tok";
    process.env.HORTUSFOX_ENABLE_WRITES = raw;
    expect(loadConfig().enableWrites).toBe(expected);
  });

  it.each([
    ["abc", 10],
    ["-5", 10],
    ["0", 10],
    ["Infinity", 10],
    ["", 10],
    ["5", 5],
    ["  7 ", 7],
  ])("E-config-009/010: int parsing of %r -> %v", (raw, expected) => {
    process.env.HORTUSFOX_BASE_URL = "http://x";
    process.env.HORTUSFOX_API_TOKEN = "tok";
    process.env.HORTUSFOX_MAX_RATE_PER_SEC = raw;
    expect(loadConfig().maxRatePerSec).toBe(expected);
  });
});
