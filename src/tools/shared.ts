import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, textResult } from "../result.js";

export type RemoveHandler = (
  id: string | number,
  extra?: Record<string, unknown>
) => Promise<Record<string, unknown>>;
export type PreviewHandler = (
  id: string | number,
  extra?: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export function registerConfirmableRemove(
  server: McpServer,
  name: string,
  description: string,
  idParam: string,
  doRemove: RemoveHandler,
  doPreview: PreviewHandler,
  extraParams: string[] = []
): void {
  const baseShape: Record<string, z.ZodTypeAny> = {
    [idParam]: z.string().or(z.number().int().positive()),
    confirm: z
      .boolean()
      .optional()
      .default(false)
      .describe("Set to true to actually delete. Omit/false returns a preview."),
  };
  for (const p of extraParams) {
    baseShape[p] = z.string().or(z.number().int().positive());
  }

  server.tool(name, description, baseShape, async (args) => {
    const confirmed = Boolean(args.confirm);
    const id = args[idParam] as string | number;
    const extra: Record<string, unknown> = {};
    for (const p of extraParams) {
      extra[p] = args[p];
    }
    if (!confirmed) {
      const preview = await doPreview(id, extra);
      return textResult(
        "Not deleted. Re-call with confirm=true to proceed.\n\n" +
          JSON.stringify(preview, null, 2)
      );
    }
    const result = await doRemove(id, extra);
    return jsonResult(result);
  });
}
