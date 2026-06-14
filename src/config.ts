export interface Config {
  baseUrl: string;
  apiToken: string;
  verifyTls: boolean;
  timeoutMs: number;
  enableWrites: boolean;
  enableBackup: boolean;
  maxRatePerSec: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(
      `hortusfox-mcp: missing required env var ${name}. ` +
        `Set it in your MCP client config.`
    );
    process.exit(1);
  }
  return v.trim();
}

function bool(name: string, def: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

export function loadConfig(): Config {
  let baseUrl = required("HORTUSFOX_BASE_URL");
  baseUrl = baseUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) {
    console.error(
      `hortusfox-mcp: HORTUSFOX_BASE_URL must include http(s):// (got "${baseUrl}")`
    );
    process.exit(1);
  }
  const apiToken = required("HORTUSFOX_API_TOKEN");
  return {
    baseUrl,
    apiToken,
    verifyTls: bool("HORTUSFOX_VERIFY_TLS", true),
    timeoutMs: int("HORTUSFOX_TIMEOUT_MS", 10_000),
    enableWrites: bool("HORTUSFOX_ENABLE_WRITES", true),
    enableBackup: bool("HORTUSFOX_ENABLE_BACKUP", false),
    maxRatePerSec: int("HORTUSFOX_MAX_RATE_PER_SEC", 10),
  };
}
