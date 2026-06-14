# Contributing to hortusfox-mcp

Thank you for your interest in contributing! This guide covers the basics.

## Development Setup

```bash
git clone https://github.com/lenaxia/hortusfox-mcp.git
cd hortusfox-mcp
npm install
npm run build
```

## Pre-commit Hooks

Install git hooks that run gitleaks, eslint, prettier, and typecheck before each commit:

```bash
bash scripts/install-hooks.sh
```

To bypass in emergencies: `git commit --no-verify`.

## Development Workflow

```bash
npm run dev          # watch-mode TypeScript compilation
npm run typecheck    # type check without emitting
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier format
npm test             # run all tests (unit + integration + e2e)
npm run test:live    # run live tests (requires HortusFox running locally)
npm run coverage     # generate coverage report
```

## Testing Standards

- Every new tool or behavior change must include tests.
- Write both happy-path and unhappy-path tests.
- Integration tests should verify the tool forwards the right parameters to the right API path.
- If the tool count changes, update `test/integration/contract-snapshot.test.ts` and `test/unit/entry.test.ts`.

## Code Style

- TypeScript strict mode — no `any`, use proper types.
- Use `zod` schemas for all tool inputs.
- Follow the existing domain-module pattern in `src/tools/`.
- No comments unless strictly necessary.
- Run `npm run lint && npm run format` before committing.

## Pull Requests

1. Create a feature branch (`feat/`, `fix/`, `test/`, `docs/`).
2. Make your changes following TDD.
3. Ensure all checks pass: `npm run typecheck && npm run lint && npm test`.
4. Open a PR with a clear description referencing any related issues.
5. Address review feedback.

## AI Commands

This repository supports AI-assisted development via issue/PR comments:

- `/review` — request a code review
- `/fix <description>` — fix a bug
- `/implement <description>` — implement a feature
- `/test <target>` — write tests
- `/analyze` — deep analysis
- `/security` — security review
- `/help` — full command reference

See `.github/prompts/help.md` for the full list.
