export class HortusFoxError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "auth"
      | "upstream"
      | "network"
      | "not_found"
      | "forbidden_op",
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "HortusFoxError";
  }
}

export function authError(tokenOrPreview: string): HortusFoxError {
  const preview = formatTokenPreview(tokenOrPreview);
  return new HortusFoxError(
    `Invalid or disabled API token (sent: ${preview}). ` +
      `Regenerate one in HortusFox admin → API.`,
    "auth",
  );
}

function formatTokenPreview(token: string): string {
  if (token.includes("…")) return token;
  if (token.length <= 8) return `${token.slice(0, 2)}…`;
  return `${token.slice(0, 4)}…${token.slice(-2)}`;
}

export function networkError(baseUrl: string, cause: unknown): HortusFoxError {
  return new HortusFoxError(
    `HortusFox unreachable at ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
    "network",
    cause,
  );
}

export function upstreamError(msg: string, detail?: unknown): HortusFoxError {
  return new HortusFoxError(`HortusFox API error: ${msg}`, "upstream", detail);
}
