import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "../helpers/mock-server.js";
import { mockFetch, parseUrl } from "../helpers/mock-fetch.js";
import { expectMcpError } from "../helpers/matchers.js";

async function callExpectingError(
  mcp: Awaited<ReturnType<typeof startServer>>["mcp"],
  name: string,
  arguments_: Record<string, unknown>,
): Promise<McpToolResultShape> {
  try {
    const r = (await mcp.callTool({
      name,
      arguments: arguments_,
    })) as McpToolResultShape;
    return r;
  } catch (e) {
    return {
      isError: true,
      content: [
        { type: "text", text: e instanceof Error ? e.message : String(e) },
      ],
    };
  }
}

interface McpToolResultShape {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

interface Call {
  url: string;
  init: RequestInit;
}

function bodyText(result: { content: unknown[] }): string {
  const entry = result.content.find(
    (c) => (c as { type: string }).type === "text",
  ) as { text?: string } | undefined;
  return entry?.text ?? "";
}

function lastCall(fetcher: ReturnType<typeof mockFetch>): Call {
  return fetcher.calls[fetcher.calls.length - 1];
}

describe("plants tools (integration)", () => {
  let fetcher: ReturnType<typeof mockFetch>;
  beforeEach(() => {
    fetcher = mockFetch();
    fetcher.install();
  });
  afterEach(() => fetcher.restore());

  describe("read tools", () => {
    it("H-int-001: plants_list default returns list, no params besides token", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, list: [{ id: 1 }] },
      });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_list",
          arguments: {},
        });
        const { path, query } = parseUrl(fetcher.calls[0].url);
        expect(path).toBe("/api/plants/list");
        expect(query.has("location")).toBe(false);
        expect(query.has("limit")).toBe(false);
        expect(JSON.parse(bodyText(result))).toEqual({ list: [{ id: 1 }] });
      } finally {
        await close();
      }
    });

    it("E-int-002: plants_list with limit:0 rejected by zod (no fetch)", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_list", { limit: 0 });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-int-003: plants_list forwards all filter params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_list",
          arguments: { location: "3", limit: 10, from: 20, sort: "name" },
        });
        const { query } = parseUrl(fetcher.calls[0].url);
        expect(query.get("location")).toBe("3");
        expect(query.get("limit")).toBe("10");
        expect(query.get("from")).toBe("20");
        expect(query.get("sort")).toBe("name");
      } finally {
        await close();
      }
    });

    it("H-int-004: plants_search forwards expression", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, list: [] } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_search",
          arguments: { expression: "rose" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/search");
        expect(query.get("expression")).toBe("rose");
      } finally {
        await close();
      }
    });

    it("U-int-005: plants_search rejects empty expression", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_search", {
          expression: "",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-int-006: plants_get accepts numeric id", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: { default: { id: 5 } } },
      });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({ name: "plants_get", arguments: { plant: 5 } });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("plant")).toBe("5");
      } finally {
        await close();
      }
    });

    it("H-int-007: plants_get accepts string id", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({ name: "plants_get", arguments: { plant: "5" } });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("plant")).toBe("5");
      } finally {
        await close();
      }
    });

    it("H-int-008: plants_log_fetch applies default limit=10", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, log: [] } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_log_fetch",
          arguments: { plant: 3 },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("plant")).toBe("3");
        expect(query.get("limit")).toBe("10");
      } finally {
        await close();
      }
    });

    it("H-int-009: plants_gallery_list forwards plant", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: { gallery: [] } },
      });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_gallery_list",
          arguments: { plant: 8 },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/gallery/list");
        expect(query.get("plant")).toBe("8");
      } finally {
        await close();
      }
    });
  });

  describe("write tools (writes enabled)", () => {
    it("H-int-010: plants_add returns new id", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, plant: 99 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_add",
          arguments: { name: "Monstera", location: 2 },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/add");
        expect(query.get("name")).toBe("Monstera");
        expect(query.get("location")).toBe("2");
        expect(JSON.parse(bodyText(result))).toEqual({ plant: 99 });
      } finally {
        await close();
      }
    });

    it("U-int-011: plants_add rejects missing name", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_add", { location: 2 });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("H-int-012: plants_update_attribute forwards", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_update_attribute",
          arguments: { plant: 1, attribute: "name", value: "Mike" },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("attribute")).toBe("name");
        expect(query.get("value")).toBe("Mike");
      } finally {
        await close();
      }
    });

    it("H-int-013: plants_update_attribute passes '#null' sentinel verbatim", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_update_attribute",
          arguments: { plant: 1, attribute: "notes", value: "#null" },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("value")).toBe("#null");
      } finally {
        await close();
      }
    });

    it("H-int-014: plants_photo_set URL mode forwards", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_photo_set",
          arguments: {
            plant: 1,
            photo: "https://x.test/a.jpg",
            external: true,
          },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/photo/update");
        expect(query.get("photo")).toBe("https://x.test/a.jpg");
        expect(query.get("external")).toBe("1");
      } finally {
        await close();
      }
    });

    it("U-int-015: plants_photo_set external:false returns isError result, no fetch", async () => {
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_photo_set",
          arguments: {
            plant: 1,
            photo: "https://x.test/a.jpg",
            external: false,
          },
        });
        expect(result.isError).toBe(true);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("U-int-016: plants_photo_set rejects missing photo", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_photo_set", {
          plant: 1,
        });
        expectMcpError(r);
      } finally {
        await close();
      }
    });

    it("H-int-017: plants_gallery_add URL mode happy path", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, item: 7 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_gallery_add",
          arguments: {
            plant: 1,
            label: "spring",
            photo: "https://x.test/p.jpg",
          },
        });
        const { path } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/gallery/add");
        expect(JSON.parse(bodyText(result))).toEqual({ item: 7 });
      } finally {
        await close();
      }
    });

    it("U-int-018: plants_gallery_add external:false returns isError result", async () => {
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_gallery_add",
          arguments: {
            plant: 1,
            label: "x",
            photo: "https://x.test/p.jpg",
            external: false,
          },
        });
        expect(result.isError).toBe(true);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-int-019: plants_gallery_edit forwards plant/item/label", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_gallery_edit",
          arguments: { plant: 1, item: 5, label: "summer" },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("item")).toBe("5");
        expect(query.get("label")).toBe("summer");
      } finally {
        await close();
      }
    });

    it("H-int-020: plants_attributes_add forwards all four params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_attributes_add",
          arguments: {
            plant: 1,
            label: "height",
            datatype: "number",
            content: "12",
          },
        });
        const { query } = parseUrl(lastCall(fetcher).url);
        expect(query.get("label")).toBe("height");
        expect(query.get("datatype")).toBe("number");
        expect(query.get("content")).toBe("12");
      } finally {
        await close();
      }
    });

    it("H-int-021: plants_attributes_edit forwards all four params", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_attributes_edit",
          arguments: {
            plant: 1,
            label: "height",
            datatype: "number",
            content: "15",
          },
        });
        const { path } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/attributes/edit");
      } finally {
        await close();
      }
    });

    it("U-int-022: plants_attributes_edit rejects missing datatype (audit requirement)", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_attributes_edit", {
          plant: 1,
          label: "x",
          content: "y",
        });
        expectMcpError(r);
        expect(fetcher.calls).toHaveLength(0);
      } finally {
        await close();
      }
    });

    it("H-int-023: plants_log_add returns logid", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200, logid: 5 } });
      const { mcp, close } = await startServer();
      try {
        const result = await mcp.callTool({
          name: "plants_log_add",
          arguments: { plant: 1, content: "Watered" },
        });
        expect(JSON.parse(bodyText(result))).toEqual({ logid: 5 });
      } finally {
        await close();
      }
    });

    it("H-int-024: plants_log_edit forwards logid + content", async () => {
      fetcher.setDefault({ status: 200, body: { code: 200 } });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_log_edit",
          arguments: { logid: 5, content: "Watered heavily" },
        });
        const { path, query } = parseUrl(lastCall(fetcher).url);
        expect(path).toBe("/api/plants/log/edit");
        expect(query.get("logid")).toBe("5");
      } finally {
        await close();
      }
    });
  });

  describe("confirm-before-delete matrix", () => {
    const removeTools: Array<{
      name: string;
      idParam: string;
      idValue: string | number;
      endpoint: string;
      extraArgs?: Record<string, unknown>;
      previewEndpoint?: string;
    }> = [
      {
        name: "plants_remove",
        idParam: "plant",
        idValue: 1,
        endpoint: "/api/plants/remove",
        previewEndpoint: "/api/plants/get",
      },
      {
        name: "plants_gallery_remove",
        idParam: "item",
        idValue: 5,
        endpoint: "/api/plants/gallery/remove",
      },
      {
        name: "plants_log_remove",
        idParam: "logid",
        idValue: 7,
        endpoint: "/api/plants/log/remove",
      },
      {
        name: "plants_attributes_remove",
        idParam: "label",
        idValue: "height",
        endpoint: "/api/plants/attributes/remove",
        extraArgs: { plant: 1 },
        previewEndpoint: "/api/plants/get",
      },
    ];

    for (const tc of removeTools) {
      describe(`${tc.name}`, () => {
        it(`-a: confirm:false returns preview, no delete fetch`, async () => {
          fetcher.setDefault({ status: 200, body: { code: 200, data: {} } });
          const { mcp, close } = await startServer();
          try {
            const result = await mcp.callTool({
              name: tc.name,
              arguments: {
                [tc.idParam]: tc.idValue,
                confirm: false,
                ...tc.extraArgs,
              },
            });
            const text = bodyText(result);
            expect(text.startsWith("Not deleted.")).toBe(true);
            const deleteCalls = fetcher.calls.filter((c) =>
              c.url.includes(tc.endpoint),
            );
            expect(deleteCalls).toHaveLength(0);
          } finally {
            await close();
          }
        });

        it(`-b: confirm:true performs delete`, async () => {
          fetcher.setDefault({ status: 200, body: { code: 200 } });
          const { mcp, close } = await startServer();
          try {
            await mcp.callTool({
              name: tc.name,
              arguments: {
                [tc.idParam]: tc.idValue,
                confirm: true,
                ...tc.extraArgs,
              },
            });
            const deleteCalls = fetcher.calls.filter((c) =>
              c.url.includes(tc.endpoint),
            );
            expect(deleteCalls).toHaveLength(1);
            const { query } = parseUrl(deleteCalls[0].url);
            expect(query.get(tc.idParam)).toBe(String(tc.idValue));
          } finally {
            await close();
          }
        });

        it(`-c: delete endpoint returns 500 -> isError result with upstream msg`, async () => {
          fetcher.setDefault({
            status: 200,
            body: { code: 500, msg: "not found" },
          });
          const { mcp, close } = await startServer();
          try {
            const result = await mcp.callTool({
              name: tc.name,
              arguments: {
                [tc.idParam]: tc.idValue,
                confirm: true,
                ...tc.extraArgs,
              },
            });
            expect(result.isError).toBe(true);
            expect(bodyText(result)).toContain("not found");
          } finally {
            await close();
          }
        });
      });
    }

    it("plants_remove preview issues a plants/get fetch", async () => {
      fetcher.setDefault({
        status: 200,
        body: { code: 200, data: { default: { id: 1, name: "Monstera" } } },
      });
      const { mcp, close } = await startServer();
      try {
        await mcp.callTool({
          name: "plants_remove",
          arguments: { plant: 1, confirm: false },
        });
        const getCalls = fetcher.calls.filter((c) =>
          c.url.includes("/plants/get"),
        );
        expect(getCalls).toHaveLength(1);
      } finally {
        await close();
      }
    });

    it("plants_attributes_remove requires plant param", async () => {
      const { mcp, close } = await startServer();
      try {
        const r = await callExpectingError(mcp, "plants_attributes_remove", {
          label: "height",
          confirm: true,
        });
        expectMcpError(r);
      } finally {
        await close();
      }
    });
  });
});
