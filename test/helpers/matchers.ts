import { expect } from "vitest";

export interface McpToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

export function expectMcpError(
  received: McpToolResult,
  options: { textContains?: string } = {},
): void {
  expect(received.isError).toBe(true);
  if (options.textContains !== undefined) {
    const texts = received.content.map((c) => c.text ?? "").join("\n");
    expect(texts).toContain(options.textContains);
  }
}
