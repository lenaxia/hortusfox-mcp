import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, main } from "../../src/index.js";
import type { Config } from "../../src/config.js";
import { HortusFoxError } from "../../src/errors.js";
import { mockFetch } from "../helpers/mock-fetch.js";

function validConfig(overrides: Partial<Config> = {}): Config {
  return {
    baseUrl: "http://mock.test",
    apiToken: "testtoken1234567890",
    verifyTls: true,
    timeoutMs: 5_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 100,
    ...overrides,
  };
}

async function driveHandshake(
  server: ReturnType<typeof createServer>["server"],
) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0.0.0" });
  await client.connect(b);
  return client;
}

describe("entry / createServer", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  it("H-entry-001: createServer returns server with documented identity", () => {
    const { server, client, config } = createServer(validConfig());
    expect(server).toBeDefined();
    expect(client).toBeDefined();
    expect(config).toBeDefined();
  });

  it("H-entry-002: assembled server reports name=hortusfox, version=0.1.0", async () => {
    const { server } = createServer(validConfig());
    const client = await driveHandshake(server);
    try {
      const info = client.getServerVersion();
      expect(info).toEqual({ name: "hortusfox", version: "0.1.0" });
    } finally {
      await client.close();
    }
  });

  it("H-entry-003: assembled server has all 37 tools registered", async () => {
    const { server } = createServer(validConfig());
    const client = await driveHandshake(server);
    try {
      const list = await client.listTools();
      expect(list.tools).toHaveLength(37);
    } finally {
      await client.close();
    }
  });

  it("H-entry-004: assembled server's tools are callable end-to-end", async () => {
    fetcher.setDefault({ status: 200, body: { code: 200, list: [{ id: 1 }] } });
    const { server } = createServer(validConfig());
    const client = await driveHandshake(server);
    try {
      const result = await client.callTool({
        name: "plants_list",
        arguments: {},
      });
      expect(result.isError).toBeFalsy();
    } finally {
      await client.close();
    }
  });

  it("H-entry-005: createServer respects enableWrites=false (11 tools)", async () => {
    const { server } = createServer(validConfig({ enableWrites: false }));
    const client = await driveHandshake(server);
    try {
      const list = await client.listTools();
      expect(list.tools).toHaveLength(11);
    } finally {
      await client.close();
    }
  });

  it("H-entry-006: server.onerror handler logs HortusFoxError by kind", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server } = createServer(validConfig());
    const handler = server.server.onerror;
    expect(typeof handler).toBe("function");
    handler?.call(server.server, new HortusFoxError("auth boom", "auth"));
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((s) => s.includes("auth"))).toBe(true);
    errSpy.mockRestore();
  });

  it("H-entry-007: server.onerror handler logs non-HortusFoxError generically", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server } = createServer(validConfig());
    const handler = server.server.onerror;
    handler?.call(server.server, new TypeError("unexpected"));
    expect(errSpy).toHaveBeenCalled();
    const logged = errSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.some((s) => s.includes("hortusfox-mcp"))).toBe(true);
    errSpy.mockRestore();
  });

  it("U-entry-008: main() rejects when config invalid (missing env)", async () => {
    const envStash = { ...process.env };
    delete process.env.HORTUSFOX_BASE_URL;
    delete process.env.HORTUSFOX_API_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`EXIT_${code ?? 0}`);
    });
    await expect(main()).rejects.toThrow(/EXIT_1/);
    process.env = envStash;
    vi.restoreAllMocks();
  });
});
