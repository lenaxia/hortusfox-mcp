# hortusfox-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes the [HortusFox](https://github.com/danielbrendel/hortusfox-web) REST API to LLM clients.

## Features

- **37 tools** across 7 domains: plants, locations, tasks, inventory, calendar, chat, backup
- **9 resources** (plants, locations, inventory, tasks, calendar) via `hortusfox://` URIs
- **8 tools return typed structured output** (new ids / amounts) for reliable chaining
- Read-only mode by default; writes gated behind `HORTUSFOX_ENABLE_WRITES`
- Backup tools gated behind `HORTUSFOX_ENABLE_BACKUP`
- Confirm-before-delete pattern on all remove operations
- Token-bucket rate limiter to protect the upstream API
- 257 tests (unit + integration + e2e + live), 99%+ statement coverage

## Quick Start

```bash
npm install
npm run build
```

Configure your MCP client (e.g. Claude Desktop) with:

```json
{
  "mcpServers": {
    "hortusfox": {
      "command": "node",
      "args": ["/path/to/hortusfox-mcp/dist/index.js"],
      "env": {
        "HORTUSFOX_BASE_URL": "http://your-hortusfox-install",
        "HORTUSFOX_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Configuration

All settings are via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `HORTUSFOX_BASE_URL` | yes | — | Base URL of your HortusFox instance (e.g. `http://localhost:8080`) |
| `HORTUSFOX_API_TOKEN` | yes | — | API token generated in HortusFox admin panel |
| `HORTUSFOX_ENABLE_WRITES` | no | `true` | Set `false` for read-only mode (11 tools) |
| `HORTUSFOX_ENABLE_BACKUP` | no | `false` | Set `true` to enable backup export/import tools |
| `HORTUSFOX_VERIFY_TLS` | no | `true` | Set `false` to skip TLS certificate verification |
| `HORTUSFOX_TIMEOUT_MS` | no | `10000` | Request timeout in milliseconds |
| `HORTUSFOX_MAX_RATE_PER_SEC` | no | `10` | Max requests per second to the upstream API |

## Tool Reference

### Plants (18 tools)

| Tool | Mode | Description |
|---|---|---|
| `plants_list` | read | List plants with optional filters (location, limit, sort) |
| `plants_search` | read | Search plants by expression |
| `plants_get` | read | Get full plant detail |
| `plants_log_fetch` | read | Fetch plant log entries |
| `plants_gallery_list` | read | List gallery photos for a plant |
| `plants_add` | write | Add a new plant |
| `plants_update_attribute` | write | Update a single attribute (partial update) |
| `plants_remove` | write | Remove a plant (confirm required) |
| `plants_photo_set` | write | Set plant photo from URL |
| `plants_gallery_add` | write | Add gallery photo from URL |
| `plants_gallery_edit` | write | Edit gallery item label (partial update) |
| `plants_gallery_remove` | write | Remove gallery item (confirm required) |
| `plants_attributes_add` | write | Add custom attribute to a plant |
| `plants_attributes_edit` | write | Edit custom attribute (full-field — see audit note) |
| `plants_attributes_remove` | write | Remove custom attribute (confirm required) |
| `plants_log_add` | write | Add a log entry |
| `plants_log_edit` | write | Edit a log entry (partial update) |
| `plants_log_remove` | write | Remove a log entry (confirm required) |

### Locations (2 tools, read-only)

| Tool | Description |
|---|---|
| `locations_list` | List all locations |
| `locations_info` | Get details for a single location |

### Tasks (5 tools)

| Tool | Mode | Description |
|---|---|---|
| `tasks_list` | read | List open or completed tasks |
| `tasks_add` | write | Add a new task |
| `tasks_edit` | write | Edit a task (partial update; set `recurring_scope` with `recurring_time`) |
| `tasks_complete` | write | Mark a task done |
| `tasks_remove` | write | Remove a task (confirm required) |

### Inventory (6 tools)

| Tool | Mode | Description |
|---|---|---|
| `inventory_list` | read | List all inventory items |
| `inventory_add` | write | Add an item (`group` token required) |
| `inventory_edit` | write | Edit an item (full-field — see audit note) |
| `inventory_increment` | write | Increment amount by 1 |
| `inventory_decrement` | write | Decrement amount by 1 |
| `inventory_remove` | write | Remove an item (confirm required) |

### Calendar (4 tools)

| Tool | Mode | Description |
|---|---|---|
| `calendar_list` | read | List calendar entries in a date range |
| `calendar_add` | write | Add a calendar entry |
| `calendar_edit` | write | Edit an entry (full-field — see audit note) |
| `calendar_remove` | write | Remove an entry (confirm required) |

### Chat (2 tools)

| Tool | Mode | Description |
|---|---|---|
| `chat_list` | read | Fetch recent chat messages |
| `chat_post` | write | Post a message |

### Backup (2 tools, `HORTUSFOX_ENABLE_BACKUP=true`)

| Tool | Description |
|---|---|
| `backup_export` | Export selected data types to a backup file |
| `backup_import` | Import from backup (confirm required, destructive) |

## Resources

| URI | Description |
|---|---|
| `hortusfox://plants` | All plants |
| `hortusfox://plants/{id}` | A single plant with attributes |
| `hortusfox://plants/{id}/log` | Log entries for a plant |
| `hortusfox://plants/{id}/gallery` | Gallery photos for a plant |
| `hortusfox://locations` | All locations with plant counts |
| `hortusfox://locations/{id}` | A single location with its plants |
| `hortusfox://inventory` | All inventory items |
| `hortusfox://tasks` | Open tasks |
| `hortusfox://calendar` | Calendar entries (next 30 days) |

## Upstream API Quirks

Some HortusFox edit endpoints clobber null fields — they UPDATE all columns unconditionally rather than skipping omitted parameters. This server mitigates by making all affected fields **required** on the corresponding MCP tools:

- `plants_attributes_edit` — requires `datatype` + `content` + `label`
- `inventory_edit` — requires `name`, `description`, `tags`, `location`, `amount`, `group`
- `calendar_edit` — requires `name`, `date_from`

Additionally, `tasks_edit` has a subtle issue: omitting `recurring_scope` defaults it to `"hours"` server-side, silently overwriting an existing scope. Always set `recurring_scope` when passing `recurring_time`.

## Structured Outputs

Eight tools that return a scalar (a new id or an amount) publish a typed `outputSchema` and return `structuredContent` alongside the text body, so LLM clients can read the result without parsing JSON:

| Tool | Returned field |
|---|---|
| `plants_add` | `plant` (new plant id) |
| `plants_gallery_add` | `item` (new gallery item id) |
| `plants_log_add` | `logid` (new log entry id) |
| `tasks_add` | `item` (new task id) |
| `inventory_add` | `item` (new inventory item id) |
| `inventory_increment` | `amount` (new amount) |
| `inventory_decrement` | `amount` (new amount) |
| `calendar_add` | `item` (new calendar entry id) |

All other tools return JSON as text only.

## Development

```bash
npm run typecheck     # type-check without emitting
npm test              # run all unit + integration + e2e tests
npm run test:live     # run live tests (requires HortusFox running locally)
npm run coverage      # generate coverage report
```

## License

MIT
