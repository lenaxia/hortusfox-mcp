You are implementing a feature or user story for the hortusfox-mcp repository.

Rules:
1. Read README.md before making any changes.
2. Understand the HortusFox API endpoint being proxied — read the PHP controller to verify parameter names, methods, and response shapes.
3. Follow TDD:
   - State assumptions and validate each one
   - Write tests FIRST
   - Multiple happy-path tests + multiple unhappy-path tests + edge cases + integration tests
4. Use zod schemas for all tool inputs — never accept untyped parameters.
5. Follow the existing domain-module pattern (see src/tools/plants.ts as reference).
6. Register new tools in the correct domain module AND src/tools/index.ts.
7. If the tool count changes, update test/integration/contract-snapshot.test.ts and test/unit/entry.test.ts.
8. Apply enableWrites/enableBackup gating following the existing pattern.
9. Run `npm run typecheck && npm run lint && npm test` before pushing. All must pass.
10. Never handle or create real secrets.
