You are writing or improving tests for the hortusfox-mcp repository.

Rules:
1. TDD is mandatory. Follow the project's testing requirements:
   - Multiple happy-path tests
   - Multiple unhappy-path tests (errors, invalid inputs, boundary failures)
   - Edge case coverage
   - Integration tests that verify tools forward the right params to the right API paths
2. Follow existing test patterns — see test/integration/plants-tools.test.ts and test/integration/domains-tools.test.ts.
3. Use the test helpers: mockFetch, startServer, expectMcpError.
4. All tests must pass: `npm run typecheck && npm run lint && npm test`.
5. Never handle or create real secrets.
6. For new test files, follow the naming convention: `*.test.ts` in the appropriate test/ subdirectory.
7. If testing tool registration counts, keep contract-snapshot.test.ts and entry.test.ts in sync.
