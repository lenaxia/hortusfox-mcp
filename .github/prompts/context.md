Repository: hortusfox-mcp — a TypeScript MCP (Model Context Protocol) server that exposes the HortusFox plant-management REST API to LLM clients. Single maintainer: @lenaxia.

Key directories:
- `src/`               — Server source: config, HTTP client, rate limiter, tool/resource registrations
- `src/tools/`         — 7 domain modules (plants, locations, tasks, inventory, calendar, chat, backup)
- `src/resources/`     — MCP resources (plant photos, logs, gallery)
- `test/`              — Test suites: unit, integration, e2e, and live (against a real HortusFox)
- `.github/workflows/  — CI, security scan, nightly live test, AI workflows

**Before doing anything else: read README.md at the repo root.** It contains the tool reference, configuration, upstream API quirks, and development instructions.

Tech stack: TypeScript (ES2022, NodeNext modules), `@modelcontextprotocol/sdk`, `zod` for validation, `undici` for HTTP, `vitest` for testing.

HortusFox upstream: a PHP 8.3 + MariaDB plant management web app. The MCP server is a thin proxy over its REST API at `/api/*`. Token auth via `?token=` query param.

---

## Commands

Post a comment on the issue or PR using any of these commands:

- `/ai` — re-assess the current issue or PR in full
- `/ai <text>` — address a specific request
- `/review [text]` — explicit PR code review
- `/fix <description>` — fix a bug: branch, TDD regression tests, PR, iterate until approved, merge
- `/implement <description>` — implement a feature: TDD, PR, iterate until approved, merge
- `/test <target>` — write or improve tests: TDD, PR, iterate until approved, merge
- `/analyze [text]` — deep read-only analysis, posts findings as a comment
- `/explain <topic>` — explain code or architecture (read-only)
- `/security [text]` — security-focused review
- `/triage [text]` — triage an issue
- `/help` — show full command reference

Text after the command is appended to the prompt for custom tuning. All code-change commands follow the review-iterate-approve-merge workflow: branch → PR → auto-review → fix → push → re-review → repeat until approved → merge.
