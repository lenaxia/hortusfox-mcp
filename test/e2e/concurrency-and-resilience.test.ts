import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HortusFoxClient } from "../../src/client.js";
import { registerAllResources } from "../../src/resources/index.js";
import { registerAllTools } from "../../src/tools/index.js";
import { startMockHortusFox } from "../helpers/hortusfox-mock.js";

const TOKEN = "real-token-1234567890";

function bodyText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

async function buildMcpClient(
  baseUrl: string,
  overrides: Record<string, unknown> = {},
) {
  const config = {
    baseUrl,
    apiToken: TOKEN,
    verifyTls: true,
    timeoutMs: 5_000,
    enableWrites: true,
    enableBackup: false,
    maxRatePerSec: 100,
    ...overrides,
  };
  const hortusfox = new HortusFoxClient(config as never);
  const server = new McpServer({ name: "hortusfox-e2e", version: "0.0.0" });
  registerAllResources(server, hortusfox);
  registerAllTools(server, hortusfox, config as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const mcp = new Client({ name: "e2e", version: "0.0.0" });
  await mcp.connect(b);
  return { mcp, close: () => mcp.close() };
}

describe("e2e: concurrency & resilience", () => {
  it("W-e2e-022: parallel plants_add creates distinct plants", async () => {
    let nextId = 100;
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/add": (_r, _s, _ctx) => {
          const id = nextId++;
          return { status: 200, body: { code: 200, plant: id } };
        },
      },
      { token: TOKEN },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          mcp.callTool({
            name: "plants_add",
            arguments: { name: `Plant${i}`, location: 1 },
          }),
        ),
      );
      const ids = results.map((r) => JSON.parse(bodyText(r)).plant);
      expect(new Set(ids).size).toBe(5);
      expect(ids).toEqual([100, 101, 102, 103, 104]);
    } finally {
      await close();
      await mock.close();
    }
  });

  it("W-e2e-023: parallel updates on same plant all succeed (no client-side lock)", async () => {
    const seenValues: string[] = [];
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/update": (_r, _s, ctx) => {
          seenValues.push(ctx.query.get("value") ?? "");
          return { status: 200, body: { code: 200 } };
        },
      },
      { token: TOKEN },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          mcp.callTool({
            name: "plants_update_attribute",
            arguments: { plant: 1, attribute: "notes", value: `note-${i}` },
          }),
        ),
      );
      expect(seenValues).toHaveLength(5);
      expect(new Set(seenValues).size).toBe(5);
    } finally {
      await close();
      await mock.close();
    }
  });

  it("W-e2e-024: idempotency gap — duplicate add creates duplicates (documented limitation)", async () => {
    let nextId = 200;
    let callCount = 0;
    const mock = await startMockHortusFox(
      {
        "GET /api/plants/add": (_r, _s, _ctx) => {
          callCount++;
          return { status: 200, body: { code: 200, plant: nextId++ } };
        },
      },
      { token: TOKEN },
    );
    const { mcp, close } = await buildMcpClient(mock.url);
    try {
      await Promise.all([
        mcp.callTool({
          name: "plants_add",
          arguments: { name: "Same", location: 1 },
        }),
        mcp.callTool({
          name: "plants_add",
          arguments: { name: "Same", location: 1 },
        }),
      ]);
      expect(callCount).toBe(2);
    } finally {
      await close();
      await mock.close();
    }
  });
});

describe("e2e: photo URL workflow (#17)", () => {
  let mock: Awaited<ReturnType<typeof startMockHortusFox>>;
  let mcp: Client;
  let close: () => Promise<void>;

  beforeAll(async () => {
    mock = await startMockHortusFox(
      {
        "GET /api/plants/photo/update": (_r, _s, ctx) => {
          if (ctx.query.get("external") !== "1") {
            return {
              status: 200,
              body: { code: 500, msg: "external required" },
            };
          }
          return { status: 200, body: { code: 200 } };
        },
        "GET /api/plants/gallery/add": (_r, _s, ctx) => {
          if (ctx.query.get("external") !== "1") {
            return {
              status: 200,
              body: { code: 500, msg: "external required" },
            };
          }
          return { status: 200, body: { code: 200, item: 50 } };
        },
        "GET /api/plants/gallery/list": (_r, _s, ctx) => ({
          status: 200,
          body: {
            code: 200,
            data: {
              plant: Number(ctx.query.get("plant")),
              gallery: [{ id: 50 }],
            },
          },
        }),
      },
      { token: TOKEN },
    );
    const built = await buildMcpClient(mock.url);
    mcp = built.mcp;
    close = built.close;
  });

  afterAll(async () => {
    await close();
    await mock.close();
  });

  it("sets main photo via URL, verifies external=1 was sent", async () => {
    const result = await mcp.callTool({
      name: "plants_photo_set",
      arguments: {
        plant: 1,
        photo: "https://example.test/photo.jpg",
        external: true,
      },
    });
    expect(result.isError).toBeFalsy();
    const call = mock.requests
      .filter((r) => r.path === "/api/plants/photo/update")
      .at(-1);
    expect(call?.query.external).toBe("1");
    expect(call?.query.photo).toBe("https://example.test/photo.jpg");
  });

  it("adds gallery photo via URL, then lists it", async () => {
    const addResult = await mcp.callTool({
      name: "plants_gallery_add",
      arguments: {
        plant: 1,
        label: "spring",
        photo: "https://example.test/gallery.jpg",
      },
    });
    expect(JSON.parse(bodyText(addResult)).item).toBe(50);

    const listResult = await mcp.callTool({
      name: "plants_gallery_list",
      arguments: { plant: 1 },
    });
    const data = JSON.parse(bodyText(listResult)).data;
    expect(data.gallery).toHaveLength(1);
  });

  it("rejects multipart mode (external:false) client-side with no fetch", async () => {
    const beforeCalls = mock.requests.length;
    const result = await mcp.callTool({
      name: "plants_photo_set",
      arguments: {
        plant: 1,
        photo: "https://example.test/x.jpg",
        external: false,
      },
    });
    expect(result.isError).toBe(true);
    expect(mock.requests.length).toBe(beforeCalls);
  });
});

describe("e2e: DNS / unreachable hosts (#7)", () => {
  it("U-e2e-025: invalid DNS host -> network error result", async () => {
    const { mcp, close } = await buildMcpClient(
      "http://nonexistent.invalid.domain.example",
    );
    try {
      const result = await mcp.callTool({
        name: "plants_list",
        arguments: { location: 1 },
      });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("unreachable");
    } finally {
      await close();
    }
  });

  it("U-e2e-026: connection refused (closed port) -> network error result", async () => {
    const { mcp, close } = await buildMcpClient("http://127.0.0.1:9");
    try {
      const result = await mcp.callTool({
        name: "plants_list",
        arguments: { location: 1 },
      });
      expect(result.isError).toBe(true);
      expect(bodyText(result)).toContain("unreachable");
    } finally {
      await close();
    }
  });

  it("U-e2e-027: malformed base URL (later) -> network error result", async () => {
    const { mcp, close } = await buildMcpClient("http://localhost:1");
    try {
      const result = await mcp.callTool({
        name: "plants_list",
        arguments: { location: 1 },
      });
      expect(result.isError).toBe(true);
    } finally {
      await close();
    }
  });
});
