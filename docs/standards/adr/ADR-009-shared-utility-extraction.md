# ADR-009: Shared Utility Extraction

> Date: 2026-04-23
> Status: Accepted

---

## Context

AUDIT-005 identified duplicated utility code across multiple store modules:

- `atomicWriteFile` was independently implemented in `workflow-store.ts`, `agents-store.ts`, `routine-scheduler.ts`, `settings.ts`, and `workspace-store.ts` (5 copies).
- `META_FILE` / `CONTENT_FILE` constants were duplicated in `workflow-store.ts` and `agents-store.ts`.
- `WORKFLOW_ID_REGEX` / `WORKFLOW_PREFIX_REGEX` were duplicated in `app/api/workflows/route.ts` and `app/dashboard/workflows/page.tsx`.

This duplication meant bug fixes or behavior changes had to be applied in multiple places, risking drift.

## Decision

Extract shared utilities into dedicated modules:

1. **`lib/fs-utils.ts`** — exports `atomicWriteFile`, `atomicWriteFileWithDir`, `readYamlFile<T>`, and `META_FILE` / `CONTENT_FILE` constants.
2. **`lib/validators.ts`** — exports `WORKFLOW_ID_REGEX` and `WORKFLOW_PREFIX_REGEX`.

All original call sites were updated to import from these shared modules, and the local implementations were removed.

## Consequences

### Positive
- Single source of truth for atomic write behavior and validation patterns.
- Future changes (e.g., switching to async writes for GAP-05) only need one modification.
- Reduced total code volume across store modules.

### Negative
- Introduces a dependency: store modules now depend on `lib/fs-utils.ts`. If this module has a bug, it affects all stores simultaneously.
- Minor import churn in a single commit touching 5+ files.

## Alternatives Considered

1. **Leave duplicated**: Lower risk per change but higher maintenance burden and drift risk. Rejected because the duplication was already causing GAP-16 to grow.
2. **Monorepo package**: Extract into a separate internal package. Rejected as over-engineering for a single-project tool.
3. **Base class / mixin pattern**: Create a `BaseStore` class with shared methods. Rejected because the stores are plain function modules, not classes, and adding inheritance would be an architectural change.
