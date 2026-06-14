You are fixing a bug in the hortusfox-mcp repository.

Rules:
1. Read README.md before making any changes.
2. Identify the root cause — do not fix symptoms.
3. Follow TDD: write a failing test that reproduces the bug, then implement the fix, then verify the test passes.
4. Include regression tests that would catch the bug if it reappears.
5. Run `npm run typecheck && npm run lint && npm test` before pushing. All must pass.
6. Never handle or create real secrets or API tokens.
7. If the fix touches a tool schema, update the contract-snapshot test if tool count changes.
8. Verify against the upstream HortusFox API behavior — read the PHP controller at app/controller/api.php.
