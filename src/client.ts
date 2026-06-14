import { Agent, setGlobalDispatcher } from "undici";
import type { Config } from "./config.js";
import { authError, networkError, upstreamError } from "./errors.js";
import { RateLimiter } from "./rate-limiter.js";

export interface ApiResponse {
  [key: string]: unknown;
}

export class HortusFoxClient {
  private readonly limiter: RateLimiter;

  constructor(private readonly config: Config) {
    this.limiter = new RateLimiter(
      config.maxRatePerSec,
      config.maxRatePerSec
    );
    if (!config.verifyTls) {
      setGlobalDispatcher(
        new Agent({ connect: { rejectUnauthorized: false } })
      );
    }
  }

  async get(path: string, params?: Record<string, unknown>): Promise<ApiResponse> {
    return this.request("GET", path, params);
  }

  async post(
    path: string,
    params?: Record<string, unknown>,
    body?: string
  ): Promise<ApiResponse> {
    return this.request("POST", path, params, body);
  }

  private async request(
    method: string,
    path: string,
    params?: Record<string, unknown>,
    body?: string
  ): Promise<ApiResponse> {
    await this.limiter.acquire();

    const url = this.buildUrl(path, params);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        signal: controller.signal,
        ...(body !== undefined ? { body, headers: { "Content-Type": "application/json" } } : {}),
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw networkError(
          this.config.baseUrl,
          new Error(`request timed out after ${this.config.timeoutMs}ms`)
        );
      }
      throw networkError(this.config.baseUrl, cause);
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown = undefined;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body; surface raw text on error.
      }
    }

    if (res.status === 403) {
      const preview = this.tokenPreview();
      throw authError(preview);
    }

    const bodyObj = (parsed ?? {}) as Record<string, unknown>;
    const code = typeof bodyObj.code === "number" ? bodyObj.code : res.status;

    if (code === 200) {
      const { code: _omit, ...rest } = bodyObj;
      return rest;
    }

    const msg =
      typeof bodyObj.msg === "string" ? bodyObj.msg : `HTTP ${res.status}`;
    throw upstreamError(msg, bodyObj);
  }

  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const search = new URLSearchParams();
    search.set("token", this.config.apiToken);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "boolean") {
          search.set(key, value ? "1" : "0");
        } else {
          search.set(key, String(value));
        }
      }
    }
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.config.baseUrl}/api${cleanPath}?${search.toString()}`;
  }

  private tokenPreview(): string {
    const t = this.config.apiToken;
    return t.length <= 8 ? `${t.slice(0, 2)}…` : `${t.slice(0, 4)}…${t.slice(-2)}`;
  }
}
