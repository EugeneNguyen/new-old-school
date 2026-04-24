# Test Plan / Test Strategy

> Last updated: 2026-04-24

---

## Testing Levels

### Unit Tests
- **Runner**: Node.js built-in test runner (`node --test`)
- **Command**: `npm test` u2192 `node --test lib/**/*.test.ts`
- **Convention**: Test files colocated with source using `.test.ts` suffix
- **Current coverage**:
  - `lib/hooks/use-workflow-items.test.ts` (5 tests)
  - `lib/scaffolding.test.ts` (15 tests covering resolveWorkspacePath, initWorkspace, updateWorkspace, and integration scenarios)
  - `lib/system-prompt.test.ts` (9 tests covering system prompt parsing/building)
  - `lib/workflow-view-mode.test.ts` (view mode toggle logic)

### Integration Tests
- **Status**: Not yet implemented (GAP-08)
- **Target**: API route handlers with real filesystem operations
- **Approach**: Spin up test workflows in temp directories; exercise CRUD through route handlers

### End-to-End Tests
- **Status**: Not yet implemented (GAP-08)
- **Target**: Dashboard user journeys (create workflow, add items, drag between stages)
- **Approach**: Playwright or Cypress against dev server

---

## Coverage Targets

| Level | Current | Target | Notes |
|-------|---------|--------|-------|
| Unit (lib/) | ~8% | 60% | Priority: workflow-store, auto-advance, stage-pipeline; scaffolding tests added (11 cases) but store functions still lack dedicated tests |
| Integration (API) | 0% | 40% | Priority: item CRUD, stage pipeline trigger, activity logging |
| E2E (UI) | 0% | Key journeys | Priority: item creation, Kanban drag, settings |

---

## Tooling

| Tool | Purpose | Version |
|------|---------|--------|
| `node --test` | Test runner | Built-in (Node 18+) |
| `node:assert` | Assertions | Built-in |
| `node:test` | Test structure (describe, it, mock) | Built-in |
| TypeScript | Test compilation | Via `--loader` or `tsx` |

### Why Node.js Built-in Test Runner?
- Zero dependencies; ships with Node.js
- Native TypeScript support via `--experimental-strip-types` or tsx loader
- Compatible with strict TypeScript mode
- Sufficient for local-only tool testing needs

---

## Test Data Strategy

### Unit Tests
- In-memory fixtures; mock filesystem calls where needed
- Use `node:test` mock capabilities for store functions

### Integration Tests
- Create temporary `.nos/` directory structure per test suite
- Seed with known workflows/items/agents via store functions
- Clean up temp directories in `afterEach`/`after`

### E2E Tests
- Dedicated test workspace with pre-seeded workflow data
- Test server started on a random port
- Reset state between test suites

---

## Test Organization

```
lib/
  hooks/
    use-workflow-items.ts
    use-workflow-items.test.ts    # Colocated unit test
  system-prompt.ts
  system-prompt.test.ts           # System prompt parsing/building (9 tests)
  workflow-view-mode.test.ts      # View mode toggle logic
  scaffolding.test.ts             # Scaffolding init/update (15 tests)
  workflow-store.ts
  workflow-store.test.ts          # (Target) Store unit tests
  auto-advance.test.ts            # (Target) Auto-advance logic tests
  stage-pipeline.test.ts          # (Target) Pipeline trigger tests
```

---

## Explicit Exclusions

| Area | Reason |
|------|--------|
| Claude CLI adapter | External dependency; requires Claude Code authentication |
| Chokidar file watching | Platform-specific behavior; tested implicitly via integration |
| UI component rendering | No React testing library configured; validated via E2E |
| Middleware logging | Trivial pass-through; no business logic |
| Third-party Radix/MDXEditor | Covered by upstream library tests |

---

## Test Execution

```bash
# Run all tests
npm test

# Run specific test file
node --test lib/hooks/use-workflow-items.test.ts

# Run with verbose output
node --test --test-reporter=spec lib/**/*.test.ts
```

---

## Known Gaps (from GAP-08)

- 4 test files exist: `lib/hooks/use-workflow-items.test.ts` (5 tests), `lib/scaffolding.test.ts` (15 tests), `lib/system-prompt.test.ts` (9 tests), `lib/workflow-view-mode.test.ts` u2014 ~10% coverage
- Store functions (`workflow-store.ts`, `agents-store.ts`, `workspace-store.ts`) still lack dedicated test files
- No integration tests for API routes
- No E2E tests for dashboard UI
- No test coverage reporting configured
- No CI pipeline to run tests automatically

## Remediation Plan

1. **Short term**: Add unit tests for `workflow-store.ts` (CRUD operations, validation, atomic writes)
2. **Medium term**: Add integration tests for critical API routes (items CRUD, stage pipeline)
3. **Long term**: Add E2E tests for primary user journeys; configure coverage reporting
