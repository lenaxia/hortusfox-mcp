## Core Rules

These rules apply to every response. They are non-negotiable.

### 1. Test-Driven Development (TDD)

Write tests BEFORE writing functional code. Always.

1. Write test
2. Run test (must fail)
3. Write minimal code to pass
4. Run test (must pass)
5. Refactor if needed

Every code change must include: multiple happy-path tests, multiple unhappy-path tests, edge cases, and integration tests. The project has 257 tests across unit, integration, e2e, and live layers — maintain that standard.

### 2. Assumptions: State, Then Validate

Every non-trivial claim rests on assumptions. Unstated, unvalidated assumptions cause most bugs.

**Mandatory protocol:**

- State every assumption explicitly before relying on it.
- Validate every assumption — read the source code, run a test, check the API controller. Do not proceed on an assumption you have not verified.
- If you cannot validate an assumption, do not rely on it. Redesign so it is unnecessary, or ask the user.
- Record what proved each assumption (file path, test name, command output).

**Red flag words — these signal an unvalidated assumption. When you catch yourself using them, stop and verify:**

- "probably", "likely", "should be", "should work", "I believe", "I assume", "appears to", "seems like", "I think", "presumably", "in theory", "ought to", "most likely", "chances are", "it's safe to assume", "I'm fairly confident", "as expected", "the expectation is", "normally", "typically", "by convention", "standard practice is", "the intent is", "this is meant to", "designed to", "supposed to"

When any of these appear in your reasoning or output, replace them with verified evidence or explicitly flag them as unvalidated.

**Never claim what the code does without reading it.** Read the actual source, trace the actual path, confirm the actual behavior.

### 3. SOLID

Every change must follow:

- **Single Responsibility** — every function/module has one reason to change
- **Open/Closed** — add behavior by adding code, not by modifying existing types
- **Liskov Substitution** — subtypes are substitutable for their base types
- **Interface Segregation** — interfaces are small, shaped for the caller
- **Dependency Inversion** — high-level modules never import low-level details

### 4. Quality Assessment

Assess every code change against ALL of these dimensions:

- **Robust** — handles failures, partial states, and adversarial inputs
- **Reliable** — deterministic, repeatable, race-free, no flaky behavior
- **Maintainable** — clear naming, small functions, obvious data flow
- **Performant** — no unnecessary allocations, no blocking on hot paths
- **Secure** — input validated via zod, secrets never logged
- **Idiomatic** — follows TypeScript conventions and existing codebase patterns
- **Right-Sized Complexity** — exactly as complex as needed

### 5. Type Safety

- Use `zod` schemas for all tool inputs — never accept untyped `any`
- Prefer `unknown` over `any` when the type is truly unknown
- No `as` casts unless strictly necessary and documented

### 6. Explicit Over Implicit

- Explicit error handling — no swallowed errors
- No magic or hidden behavior
- No comments unless strictly necessary and timeless

### 7. Zero Technical Debt

- No TODOs, FIXMEs, or commented-out code
- No adapters for backwards compatibility — implement the final solution
- Never hack tests to pass — fix the root cause
