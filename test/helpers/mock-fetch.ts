type ResponseSpec =
  | { status: number; body?: unknown; contentType?: string }
  | ((url: string, init: RequestInit) => ResponseSpec | Promise<ResponseSpec>);

interface FetchInterceptor {
  calls: Array<{ url: string; init: RequestInit }>;
  install(): void;
  restore(): void;
  setRoute(matcher: string | RegExp, spec: ResponseSpec): void;
  setDefault(spec: ResponseSpec): void;
}

export function mockFetch(): FetchInterceptor {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const routes: Array<{ matcher: string | RegExp; spec: ResponseSpec }> = [];
  let defaultSpec: ResponseSpec | null = null;
  const original = globalThis.fetch;

  async function dispatcher(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString();
    const mergedInit = init ?? { method: "GET" };
    calls.push({ url, init: mergedInit });

    let spec: ResponseSpec | null = null;
    for (const route of routes) {
      const matches =
        typeof route.matcher === "string"
          ? url.includes(route.matcher)
          : route.matcher.test(url);
      if (matches) {
        spec = route.spec;
        break;
      }
    }
    if (!spec)
      spec = defaultSpec ?? {
        status: 404,
        body: { code: 404, msg: "no route" },
      };

    const resolved =
      typeof spec === "function" ? await spec(url, mergedInit) : spec;
    const status = resolved.status ?? 200;
    const contentType = resolved.contentType ?? "application/json";
    const body = resolved.body ?? {};
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { "Content-Type": contentType },
    });
  }

  return {
    calls,
    install() {
      globalThis.fetch = dispatcher as typeof fetch;
    },
    restore() {
      globalThis.fetch = original;
    },
    setRoute(matcher, spec) {
      routes.push({ matcher, spec });
    },
    setDefault(spec) {
      defaultSpec = spec;
    },
  };
}

export function parseUrl(url: string): {
  path: string;
  query: URLSearchParams;
} {
  const u = new URL(url);
  return { path: u.pathname, query: u.searchParams };
}
