# HortusFox MCP — Test Plan

Framework: **vitest** (ESM-native, TS-native, lightweight mocking).

Layers:
- **Unit** — pure-function modules in isolation; no I/O.
- **Integration** — exercise real `McpServer` + real `HortusFoxClient` against a
  fake `fetch` (no network). Validates the MCP wiring (tool registration,
  schemas, confirm-before-delete gating, flag effects).
- **E2E** — real `HortusFoxClient` ↔ real Node HTTP server impersonating
  HortusFox. Validates HTTP encoding, auth header, response parsing, full
  multi-step workflows.

Directory layout:
```
test/
  helpers/
    mock-fetch.ts        fetch interceptor used by unit + integration
    mock-server.ts       in-memory MCP transport pair for integration
    hortusfox-mock.ts    real HTTP server impersonating HortusFox for e2e
  unit/
    config.test.ts
    rate-limiter.test.ts
    errors.test.ts
    client.test.ts
    result.test.ts
  integration/
    plants-tools.test.ts
    plants-resources.test.ts
    server-gating.test.ts
  e2e/
    plant-lifecycle.test.ts
    auth-and-errors.test.ts
    browse-and-search.test.ts
```

Test case ID convention: `<layer>-<module>-<nnn>`. `H` = happy, `U` = unhappy,
`E` = edge, `W` = workflow.

---

## 1. Unit tests

### 1.1 `src/config.ts` — `config.test.ts`

| ID | Type | Scenario |
|---|---|---|
| U-config-001 | U | Missing `HORTUSFOX_BASE_URL` → process exits 1 with stderr mentioning the var |
| U-config-002 | U | `HORTUSFOX_BASE_URL` is empty/whitespace → exit 1 |
| U-config-003 | U | Missing `HORTUSFOX_API_TOKEN` → exit 1 |
| U-config-004 | U | Base URL without `http://`/`https://` scheme → exit 1 |
| E-config-005 | E | Base URL with multiple trailing slashes → stripped to single bare host |
| E-config-006 | E | Base URL with whitespace → trimmed |
| H-config-007 | H | All required env set, no optionals → returns object with documented defaults (verifyTls=true, timeoutMs=10000, enableWrites=true, enableBackup=false, maxRatePerSec=10) |
| H-config-008 | H | Bool variants `1`/`true`/`TRUE`/`yes`/`on` → true; `0`/`false`/`no`/anything-else/empty → false |
| E-config-009 | E | Int env garbage (`abc`, `-5`, `0`, `Infinity`) → falls back to default |
| E-config-010 | E | Int env valid (`"5"`, `"  7 "`) → parsed positive int |

Notes: tests that assert `process.exit(1)` need `vi.spyOn(process, "exit")` +
`vi.spyOn(console, "error")`, restoring between cases. Reset `process.env` in
`beforeEach` via a saved snapshot.

### 1.2 `src/rate-limiter.ts` — `rate-limiter.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-rate-001 | H | Fresh limiter (cap=3) → first 3 synchronous `acquire()`s resolve instantly |
| E-rate-002 | E | 4th `acquire()` after exhausting 3 tokens → does NOT resolve until time passes (use fake timers, advance <refill window, assert pending; advance past, assert resolved) |
| H-rate-003 | H | After depletion, advancing virtual time by `1/perSec * 1000` ms releases exactly one pending acquire |
| E-rate-004 | E | Capacity never exceeds configured ceiling even after long sleep (no overflow) |

Notes: use `vi.useFakeTimers()` and `Date.now` mocking (the limiter reads
`Date.now()` directly — fake timers handle that).

### 1.3 `src/errors.ts` — `errors.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-err-001 | H | `HortusFoxError` carries `kind`, `message`, optional `detail`, and the right `name` |
| H-err-002 | H | `authError("abcd1234")` produces kind=`auth` and message contains the token preview `abcd…34` |
| E-err-003 | E | `authError` with a token shorter than 8 chars → preview is `xx…` form (first 2 chars + ellipsis) |
| H-err-004 | H | `networkError(baseUrl, cause)` → kind=`network`, message includes the base URL and `cause.message` |
| H-err-005 | H | `upstreamError(msg, detail)` → kind=`upstream`, message prefixed with `HortusFox API error:`, detail passed through |

### 1.4 `src/client.ts` — `client.test.ts`

Mock global `fetch` per test. No real network.

| ID | Type | Scenario |
|---|---|---|
| H-cli-001 | H | `get("/plants/list", {limit:5})` issues GET to `${baseUrl}/api/plants/list?token=…&limit=5` |
| H-cli-002 | H | Boolean param `true` → encoded as `1`; `false` → `0` |
| E-cli-003 | E | `undefined` and `null` params → omitted from query entirely (not sent as literal "null"/"undefined") |
| H-cli-004 | H | Successful response `{code:200, list:[…]}` → returns `{list:[…]}` (the `code` key stripped) |
| E-cli-005 | E | Response body `{code:200}` only → returns `{}` (no leftover keys) |
| U-cli-006 | U | HTTP 403 → throws `HortusFoxError` kind=`auth` with token-preview in message; never parses body further |
| U-cli-007 | U | 200 with `{code:500, msg:"DB down"}` → throws kind=`upstream` with that msg |
| U-cli-008 | U | Non-200 HTTP status (e.g. 502) with no JSON body → throws kind=`upstream` with `HTTP 502` msg |
| E-cli-009 | E | 200 with non-JSON body (e.g. HTML error page) → still inspects status; if 200 → returns `{}` (treats as empty) |
| U-cli-010 | U | `fetch` rejects with generic `TypeError("fetch failed")` → throws kind=`network` containing base URL + "fetch failed" |
| U-cli-011 | U | `fetch` aborts due to timeout (controller.signal.aborted true) → throws kind=`network` with message containing "timed out after <ms>ms" |
| H-cli-012 | H | `verifyTls:false` → `setGlobalDispatcher` invoked with `rejectUnauthorized:false` (spy on undici export) |
| H-cli-013 | H | `post("/x", {a:1}, "body-string")` → request method POST, body forwarded, content-type `application/json` set |
| E-cli-014 | E | Two concurrent `get()` calls share the rate limiter — second waits (use cap=1 + fake timers, assert ordering) |
| H-cli-015 | H | Rate limiter respected: with cap=10, 10 immediate calls all go through; verify call count against fetch spy |

### 1.5 `src/result.ts` — `result.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-res-001 | H | `jsonResult({a:1})` → single text content, `JSON.parse(content) deep-equals {a:1}`, isError absent/falsey |
| H-res-002 | H | `textResult("hi")` → single text content "hi", no isError |
| H-res-003 | H | `errorResult("boom")` → text "Error: boom", `isError:true` |

---

## 2. Integration tests

These spin up a real `McpServer`, register the plants tools/resources against a
real `HortusFoxClient` whose `fetch` is intercepted, and drive the server over
the SDK's `InMemoryTransport` pair (so `tools/call`, `tools/list`,
`resources/list`, `resources/templates/list` go through the real MCP pipeline
including zod schema validation).

Helper `mock-fetch.ts` exposes a `installMockFetch(routes)` where `routes` maps
`METHOD path` → `{status, body}` or a spy function `(url, opts) => response`.
All routes auto-include the `?token=…` assertion.

### 2.1 Plants tools — `plants-tools.test.ts`

For each tool, test happy + at least one unhappy/edge. Confirm-before-delete
tools get the full three-case matrix.

**Read tools**

| ID | Tool | Type | Scenario |
|---|---|---|---|
| H-int-001 | `plants_list` | H | Returns list; client called with no params besides token |
| E-int-002 | `plants_list` | E | Pass `limit:0` → zod rejects (positive only) before any HTTP call |
| H-int-003 | `plants_list` | H | Pass `{location:"3", limit:10, from:20, sort:"name"}` → all four forwarded in query |
| H-int-004 | `plants_search` | H | `{expression:"rose"}` → request path `/plants/search` with that param; returns list |
| U-int-005 | `plants_search` | U | Empty `expression:""` → zod rejects (min(1)) |
| H-int-006 | `plants_get` | H | Plant id as number `5` → forwarded as `plant=5` |
| H-int-007 | `plants_get` | H | Plant id as string `"5"` → forwarded as `plant=5` (string accepted) |
| H-int-008 | `plants_log_fetch` | H | Default `limit` of 10 applied; passes `plant` through |
| H-int-009 | `plants_gallery_list` | H | Forwards plant, returns gallery data |

**Write tools (writes enabled)**

| ID | Tool | Type | Scenario |
|---|---|---|---|
| H-int-010 | `plants_add` | H | `{name:"Monstera", location:2}` → calls `/plants/add`, returns `{plant: <id>}` |
| U-int-011 | `plants_add` | U | Missing `name` → zod rejects |
| H-int-012 | `plants_update_attribute` | H | `{plant:1, attribute:"name", value:"Mike"}` → forwarded; returns echoed ack |
| H-int-013 | `plants_update_attribute` | H | `{value:"#null"}` sent through verbatim (the sentinel is meaningful upstream) |
| H-int-014 | `plants_photo_set` | H | `{plant:1, photo:"https://x/a.jpg", external:true}` → forwarded |
| U-int-015 | `plants_photo_set` | U | `external:false` → returns `isError:true` result with the v0.1 unsupported message; **no HTTP call made** |
| U-int-016 | `plants_photo_set` | U | Missing `photo` → zod rejects |
| H-int-017 | `plants_gallery_add` | H | URL mode happy path |
| U-int-018 | `plants_gallery_add` | U | `external:false` → unsupported error result, no fetch |
| H-int-019 | `plants_gallery_edit` | H | Forwards `{plant, item, label}` |
| H-int-020 | `plants_attributes_add` | H | All four params forwarded |
| H-int-021 | `plants_attributes_edit` | H | All four params forwarded (this tool requires all — verify schema marks each required) |
| U-int-022 | `plants_attributes_edit` | U | Omit `datatype` → zod rejects (audit-driven requirement) |
| H-int-023 | `plants_log_add` | H | Returns `{logid:…}` |
| H-int-024 | `plants_log_edit` | H | Forwards `{logid, content}` |

**Confirm-before-delete matrix (applies to `plants_remove`, `plants_gallery_remove`, `plants_log_remove`, `plants_attributes_remove`)**

For each of the four remove tools:

| ID suffix | Type | Scenario |
|---|---|---|
| `-a` | H | `confirm:false` (or omitted) → fetch spy is **NOT** called for the delete path; result text starts with `"Not deleted."` and includes preview data |
| `-b` | H | `confirm:true` → fetch spy IS called against the delete endpoint; result reflects upstream `{code:200,…}` body |
| `-c` | U | Delete endpoint returns `{code:500,msg:"not found"}` → result `isError:true` with the upstream msg |

Specific tool-scoped expectations:
- `plants_remove` preview path issues a `/plants/get` call and embeds plant data.
- `plants_attributes_remove` requires `plant` extra param; without it, schema rejects. With it, preview fetches plant details.
- `plants_gallery_remove` and `plants_log_remove` previews are static notes (no extra fetch).

### 2.2 Plants resources — `plants-resources.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-res-001 | H | `resources/list` returns the static `hortusfox://plants` resource with mimeType `application/json` |
| H-res-002 | H | `resources/templates/list` returns 3 URI templates: `plants/{id}`, `plants/{id}/log`, `plants/{id}/gallery` |
| H-res-003 | H | `resources/read` with `hortusfox://plants` → calls `/plants/list`, returns JSON text |
| H-res-004 | H | `resources/read` with `hortusfox://plants/7` → calls `/plants/get?plant=7` |
| H-res-005 | H | `resources/read` with `hortusfox://plants/7/log` → calls `/plants/log/fetch?plant=7` |
| H-res-006 | H | `resources/read` with `hortusfox://plants/7/gallery` → calls `/plants/gallery/list?plant=7` |
| U-res-007 | U | `resources/read` for unknown URI → MCP error |

### 2.3 Server gating — `server-gating.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-gate-001 | H | `enableWrites:true` (default) → `tools/list` returns 18 tools; write tool names present (`plants_add`, `plants_remove`, etc.) |
| H-gate-002 | H | `enableWrites:false` → `tools/list` returns exactly 5 read tools; no write tool registered |
| H-gate-003 | H | Calling a write tool by name when `enableWrites:false` → MCP error "unknown tool" (the tool genuinely isn't registered) |
| H-gate-004 | H | Tool descriptions populated for every registered tool (non-empty) |
| H-gate-005 | H | Resources count is constant regardless of write flag (resources are read-only by design) |

---

## 3. E2E tests

Real HTTP server (Node `http`) impersonating HortusFox: parses query string,
validates `token`, returns canned JSON per route. The MCP server's
`HortusFoxClient` talks to it over real TCP.

Helper `hortusfox-mock.ts`:
- `startMockHortusFox({port?, token, routes})` → `{url, close(), requests}`
- `routes`: map of `METHOD /path` → handler `(req, query) => {status, body}` or
  static `{status, body}`
- Records every incoming request (`method`, `path`, `query`, `headers`) for
  assertions
- Default `/api/*` 404 returns `{code:500,msg:"unknown endpoint"}` to surface
  routing bugs

### 3.1 Plant lifecycle — `plant-lifecycle.test.ts`

Realistic multi-step workflow exercising CRUD end-to-end.

| ID | Type | Workflow step |
|---|---|---|
| W-e2e-001 | W | **Browse:** `plants_list` → returns seeded list of 3 plants |
| W-e2e-002 | W | **Locate:** `plants_get` for plant id=1 → returns full details with custom attrs |
| W-e2e-003 | W | **Create:** `plants_add` `{name:"Pilea", location:2}` → mock returns `{plant:99}`; verify subsequent `plants_list` includes id 99 (mock statefulness) |
| W-e2e-004 | W | **Update:** `plants_update_attribute` `{plant:99, attribute:"name", value:"Pilea peperomioides"}` → 200 ack; verify `plants_get` for 99 returns the new name |
| W-e2e-005 | W | **Log:** `plants_log_add` `{plant:99, content:"Watered"}` returns `{logid:5}`; `plants_log_fetch` for 99 returns entry |
| W-e2e-006 | W | **Gallery:** `plants_gallery_add` URL mode returns `{item:7}`; `plants_gallery_list` for 99 returns the photo |
| W-e2e-007 | W | **Delete (safe):** `plants_remove` `{plant:99, confirm:false}` → response text starts `"Not deleted."`; verify mock did NOT receive `/plants/remove`; subsequent `plants_get` for 99 still 200 |
| W-e2e-008 | W | **Delete (confirm):** `plants_remove` `{plant:99, confirm:true}` → 200; mock received `/plants/remove?plant=99&token=…`; subsequent `plants_get` for 99 returns 500 "not found" |
| W-e2e-009 | W | **Full request log assertion:** every request the mock received carried the `token` query param exactly once, with the expected value |

### 3.2 Auth & errors — `auth-and-errors.test.ts`

| ID | Type | Scenario |
|---|---|---|
| U-e2e-010 | U | Mock configured with a different token than client → every call returns HTTP 403 `{code:403,invalid_token:"…"}` → MCP result `isError:true`, message mentions regenerating in admin |
| U-e2e-011 | U | Mock returns `{code:500, msg:"DB connection refused"}` for `/plants/list` → MCP result `isError:true` with that msg |
| U-e2e-012 | U | Mock returns 502 Bad Gateway HTML (non-JSON) → MCP result `isError:true`, message includes `HTTP 502` |
| U-e2e-013 | U | Mock TCP server killed mid-test (port closed) → `plants_list` result `isError:true` with "unreachable at <url>" |
| E-e2e-014 | E | Server slow: mock delays `/plants/list` 200ms; client `timeoutMs:50` → result `isError:true` with "timed out after 50ms" |
| H-e2e-015 | H | Token-preview format: short token in 403 message is masked (first 4 + … + last 2) — assert the literal string in the MCP error content |

### 3.3 Browse & search — `browse-and-search.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-e2e-016 | H | `plants_search` `{expression:"rose"}` → mock returns matching plants; result JSON includes those matches |
| H-e2e-017 | H | `plants_list` with `location` filter → mock asserts it received `location=2` in the query |
| H-e2e-018 | H | `resources/read hortusfox://plants` → issues real GET to mock, returns the same data `plants_list` would |
| H-e2e-019 | H | `resources/read hortusfox://plants/3/log` → mock asserts `plant=3` was sent to `/plants/log/fetch` |
| E-e2e-020 | E | Empty result set: mock returns `{code:200, list:[]}` for search → tool result is `{list: []}` (no crash, no false error) |
| E-e2e-021 | E | Rate limiter under load: fire 12 parallel `plants_list` calls against mock with cap=5 — record per-request arrival timestamps; assert first 5 arrive within a 200ms window and total spread ≥500ms (timestamp-precise, not wall-clock flaky) |

### 3.4 Concurrency & resilience — `concurrency-and-resilience.test.ts`

| ID | Type | Scenario |
|---|---|---|
| W-e2e-022 | W | 5 parallel `plants_add` produce 5 distinct ids (no client-side collision) |
| W-e2e-023 | W | 5 parallel `plants_update_attribute` on the same plant all reach upstream (no client-side lock; last-writer-wins is upstream's problem) |
| W-e2e-024 | E | Idempotency gap — duplicate parallel `plants_add` with same args creates duplicates upstream (documented limitation; MCP layer does not deduplicate) |
| (photo) | H | `plants_photo_set` with `external:true` and a URL → upstream receives `external=1`, `photo=<url>` |
| (photo) | H | `plants_gallery_add` URL mode → returns item id; subsequent `plants_gallery_list` includes it |
| (photo) | U | `plants_photo_set` with `external:false` → client returns isError result, no HTTP call (v0.1 limitation enforced client-side) |
| U-e2e-025 | U | Invalid DNS host (`.invalid` TLD) → network error result with "unreachable" |
| U-e2e-026 | U | Connection refused (port 9) → network error result with "unreachable" |
| U-e2e-027 | U | Low port (1) → network error result |

### 3.5 Binary entry point — `binary.test.ts`

Spawns the actual built `node dist/index.js` as a child process and drives JSON-RPC over stdio.

| ID | Type | Scenario |
|---|---|---|
| H-bin-001 | H | Initialize handshake → `serverInfo` reports `name:hortusfox, version:0.1.0` |
| H-bin-002 | H | `tools/list` after `notifications/initialized` returns 18 tools |
| U-bin-003 | U | Missing `HORTUSFOX_BASE_URL` → process exits with code 1 |
| U-bin-004 | U | Missing `HORTUSFOX_API_TOKEN` → process exits with code 1 |
| H-bin-005 | H | SIGTERM → process exits (signal or code, not null) |

---

## 4. Cross-cutting conventions

- **Isolation:** every test file restores `process.env`, `Date.now`, `fetch`,
  and any `setGlobalDispatcher` mock in `afterEach`. Shared helper
  `test/helpers/reset.ts`.
- **No real network in unit/integration** — only e2e touches localhost TCP.
- **No real HortusFox PHP instance** — out of scope; that's manual / CI smoke.
- **Fake timers** used liberally for rate-limiter and client timeout tests;
  restored after each test.
- **Snapshot policy:** none — all assertions explicit. JSON-shape checks via
  `expect.objectContaining` / `expect.arrayContaining` to keep tests resilient.
  The tool-roster contract is locked by exact-name array comparison
  (`contract-snapshot.test.ts`).
- **Coverage target:** every exported symbol in `src/` exercised; every error
  branch in `client.ts` hit; every tool registered with at least one happy-path
  call. Reported via `vitest --coverage`. The only uncovered lines are
  `index.ts`'s `main()` body and the binary auto-run `if` block — these execute
  inside a spawned child process during `binary.test.ts`, which the parent's
  coverage instrumentation cannot observe. They are covered functionally by the
  spawn tests, not by line coverage.
- **CI command:** `npm test` runs all three layers; `npm run test:unit`,
  `:integration`, `:e2e` available for selective runs. `npm run build` is
  required once before `:e2e` (the binary test spawns `dist/index.js`).

## 5. Gap-closure addendum (round 2)

Cases added after the initial pass to address gaps found in self-review.

### Unit — `client.test.ts` (encoding + ambiguous responses + abort)

| ID | Type | Scenario |
|---|---|---|
| #3-a..d | E | URL/param encoding: special chars `&=# + space`, unicode emoji, 5KB value, token with special chars |
| #6-a | E | 200 with `code:"200"` (string) → falls back to HTTP status, treated as success; `code` key stripped regardless of type |
| #6-b | E | 200 with no `code` field → falls back to HTTP status |
| #6-c | E | 200 with malformed JSON body → empty result, success |
| #6-d | H | 3xx redirect: fetch follows by default, final 200 succeeds |
| #6-e | E | Documented quirk: HTTP 500 with valid `{code:200}` body → **body code wins** (success); body code is authoritative when numeric |
| #6-f | U | HTTP 500 with no code in body → upstream error |
| #9 | E | Timeout actually fires the fetch's `AbortSignal` (verified via `signal.aborted === true` after timeout) |

### Unit — `rate-limiter.test.ts` (degenerate inputs)

| ID | Type | Scenario |
|---|---|---|
| #2-a | U | Constructor rejects `capacity` of 0, negative, NaN, Infinity |
| #2-b | U | Constructor rejects `perSec` of 0, negative, NaN, Infinity |
| #2-c | H | Accepts minimal valid (capacity=1, perSec=1) and fractional capacity ≥1 |
| E-rate-005 | U | `acquire()` rejects (throws) after 1000 attempts instead of silently returning undefined |

### Unit — `entry.test.ts` (createServer factory + main)

| ID | Type | Scenario |
|---|---|---|
| H-entry-001 | H | `createServer` returns `{server, client, config}` |
| H-entry-002 | H | Server reports `name:hortusfox, version:0.1.0` via `getServerVersion()` |
| H-entry-003 | H | 18 tools registered through the real factory |
| H-entry-004 | H | `plants_list` callable end-to-end through the assembled server |
| H-entry-005 | H | `enableWrites=false` propagated through factory → 5 tools |
| H-entry-006 | H | `server.onerror` logs `HortusFoxError` with its kind |
| H-entry-007 | H | `server.onerror` logs non-HortusFoxError generically |
| U-entry-008 | U | `main()` rejects with EXIT_1 when env missing |

### Integration — `edge-cases.test.ts` (zod + param forwarding)

| ID | Type | Scenario |
|---|---|---|
| #12-a..c | U | Rejects `plant:0`, `plant:-5`, `confirm:"true"` (string) |
| #12-d..e | U | Rejects negative or >500 limit |
| #12-f | H | Accepts plant id as numeric string `"5"` |
| #12-g | E | Extra/unknown args silently dropped (not forwarded to upstream) |
| #12-h | E | Very long string values (10KB) accepted and forwarded |
| #12-i | E | Whitespace-only expression accepted (length-based validation, not trimmed) |
| #13-a..d | H | Param forwarding for `plants_search.limit`, `plants_log_fetch.paginate`/`.limit`, default limit=10, all four `plants_list` optionals |

### Integration — `resource-edges.test.ts`

| ID | Type | Scenario |
|---|---|---|
| #14-a | E | Non-numeric plant id in URI (`/plants/abc`) is forwarded as-is — URI templates don't type-check |
| #14-b | U | Extra path segments (`/plants/7/log/extra`) rejected |
| #14-c | H | URL-encoded id forwarded correctly |
| #14-d | U | Wrong scheme (`http://`) rejected |
| #14-e | U | Empty id segment rejected |
| #14-f | U | Negative plant id rejected |

### Integration — `contract-snapshot.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-contract-001 | H | Exact tool names with writes enabled (alphabetical compare, 18 tools) |
| H-contract-002 | H | Exact tool names with writes disabled (5 tools) |
| H-contract-003 | H | Every tool has snake_case name, ≥10-char description, object inputSchema |
| H-contract-004 | H | `confirm` param present on exactly the 4 remove tools, absent elsewhere |
| H-contract-005 | H | All resource URIs use `hortusfox://` scheme |

### Integration — `backup-flag.test.ts`

| ID | Type | Scenario |
|---|---|---|
| H-backup-001..003 | H | `enableBackup` flag plumbing: no backup tools registered regardless of flag, plant tool count invariant |

### Code fixes prompted by the gap review

| Fix | File | What changed |
|---|---|---|
| #5 | `src/tools/plants.ts` | Removed the `try/catch` in `registerConfirmableRemove` that was swallowing non-HortusFoxError instances into `errorResult`, hiding real bugs. All errors now propagate to the MCP layer (which surfaces them as `isError` results). |
| #2 | `src/rate-limiter.ts` | Constructor now throws on `capacity`/`perSec` < 1, NaN, or non-finite. `acquire()` throws after 1000 attempts instead of silently returning `undefined`. |
| #1 | `src/index.ts` | Extracted `createServer(config)` factory so the assembly is testable without binding stdio. The binary auto-run guard now uses `fileURLToPath(import.meta.url)` for cross-platform correctness. |

## 6. Out of scope (v0.1)

- Tests for not-yet-implemented domains (locations, tasks, inventory, calendar,
  chat, backup tools). Each will get its own test file mirroring plants when
  built. The `enableBackup` plumbing test verifies the flag is honored today.
- Performance/load testing beyond the single rate-limiter burst test
  (`E-e2e-021`) and the parallel-add concurrency tests.
- Real TLS cert verification tests (would need mkcert); the `verifyTls:false`
  spy assertion is sufficient for v0.1.
- Upstream 429 rate-limiting / backoff / retry — the HortusFox API does not
  emit 429 today (see design doc open question #5). Will revisit if upstream
  adds rate limiting.
- GET-vs-POST mutation coupling (design doc OQ #2) — the upstream API accepts
  `ANY` method on mutating endpoints. We use GET because that's what
  `$request->params()->query()` reads. If upstream tightens to POST-only,
  every tool breaks; this is documented but not test-pinned.
- Token-in-POST-body alternative (design doc OQ #1) — the upstream constructor
  supports `$_POST['token']`, but we use the query-string path exclusively.
  Documented; not exercised.
- Memory-leak / sustained-load testing of the rate-limiter wait queue.
