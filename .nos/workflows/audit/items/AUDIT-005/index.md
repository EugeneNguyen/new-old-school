# AUDIT-005: Standards Audit — 2026-04-23

Created by routine at 2026-04-23 00:00

## Stage: Update Technology Standard

### Tech Stack Review

Tech stack is unchanged from AUDIT-004. Key versions:
- Next.js 16.2.1-canary.45 (canary)
- React 19.2.5 (stable)
- TypeScript ^5.0 (strict: true)
- Tailwind CSS ^3.0
- Node.js v25.2.1 runtime
- `@types/react@18.3.28` still installed (mismatch with React 19)
- `next-themes@0.4.6` still a phantom dependency

### Standards Document Updated

`docs/standards/project-standards.md` updated with:
- AUDIT-005 summary section
- GAP-16: Remaining reuse opportunities
- GAP-17: Null-safety issue in `createItem`
- Key Files Reference updated with new shared modules

### All Prior Gaps Status (unchanged)

| Gap | Description | Status |
|-----|-------------|--------|
| GAP-01 | TypeScript strict: false | RESOLVED |
| GAP-02 | Tailwind CSS v3 (v4.2 current) | OPEN |
| GAP-03 | No ESLint/Biome/Prettier | OPEN (high) |
| GAP-04 | Incomplete Suspense boundaries | RESOLVED |
| GAP-05 | Synchronous fs in API routes | OPEN (low) |
| GAP-06 | Incomplete error boundaries | RESOLVED |
| GAP-07 | Mixed config file formats | OPEN (low) |
| GAP-08 | Limited test coverage | OPEN |
| GAP-09 | React.forwardRef deprecation | RESOLVED |
| GAP-10 | Canary dependency pinning | PARTIAL |
| GAP-11 | @types/react v18 with React 19 | OPEN |
| GAP-12 | Logo.tsx naming inconsistency | RESOLVED |
| GAP-13 | Broken npm run lint script | OPEN (high) |
| GAP-14 | React Compiler not enabled | OPEN (medium) |
| GAP-15 | next-themes phantom dependency | OPEN |
| GAP-16 | Remaining reuse opportunities | **NEW** — OPEN |
| GAP-17 | Null-safety in createItem | **NEW** — OPEN |

## Stage: Audit with Technology Standard — Reuse Scan

### Reuse Extractions Implemented

#### 1. `lib/fs-utils.ts` — File System Utilities

**Created** `lib/fs-utils.ts` exporting:
- `atomicWriteFile(filePath, contents)` — write-to-tmp-then-rename pattern
- `atomicWriteFileWithDir(filePath, contents)` — same, with `mkdirSync` for parent dir
- `readYamlFile<T>(filePath)` — `fs.readFileSync` + `yaml.load` + null-check + cast
- `META_FILE` / `CONTENT_FILE` constants

**Updated call sites:**
- `lib/workflow-store.ts` — removed local `atomicWriteFile`, `META_FILE`, `CONTENT_FILE`; imports from `fs-utils`
- `lib/agents-store.ts` — removed local `atomicWriteFile`, `META_FILE`, `CONTENT_FILE`; imports from `fs-utils`
- `lib/routine-scheduler.ts` — removed local `atomicWriteFile`; imports from `fs-utils`
- `lib/settings.ts` — removed local `atomicWrite`; uses `atomicWriteFileWithDir` from `fs-utils`
- `lib/workspace-store.ts` — removed local `atomicWrite`; uses `atomicWriteFileWithDir` from `fs-utils`

#### 2. `lib/validators.ts` — Shared Validation Constants

**Created** `lib/validators.ts` exporting:
- `WORKFLOW_ID_REGEX` — `/^[a-z0-9][a-z0-9_-]{0,63}$/`
- `WORKFLOW_PREFIX_REGEX` — `/^[A-Z0-9][A-Z0-9_-]{0,15}$/`

**Updated call sites:**
- `app/api/workflows/route.ts` — removed local `ID_REGEX`/`PREFIX_REGEX`; imports from `validators`
- `app/dashboard/workflows/page.tsx` — removed local `ID_REGEX`/`PREFIX_REGEX`; imports from `validators`

### Reuse Opportunities Flagged (not implemented)

See GAP-16 in `docs/standards/project-standards.md` for the full list:
- Sidebar `NavLink` component (7 duplicates in `Sidebar.tsx`)
- `EmptyState` component (duplicated in `KanbanBoard.tsx` + `ListView.tsx`)
- `useApiList<T>` hook (4 dashboard pages)
- `mapStageError` utility (3 stage route files)
- `withErrorHandler` HOF (~15 API route handlers)
- `parseBody<T>` utility (~10 API routes)

## Verification

- TypeScript: `npx tsc --noEmit` — no new errors (only pre-existing `scaffolding.test.ts` issues)
- Tests: `node --test lib/system-prompt.test.ts` — 9/9 pass
- All 5 updated store/lib files compile cleanly

---

## Audit Findings (Fix Stage)

The "Audit with the technology standard" stage completed reuse extractions but did not produce a formal `## Audit Findings` section. The fix stage performed a retroactive audit of all modified/new files against `docs/standards/project-standards.md`.

### Finding F-01: `import` instead of `import type` for type-only imports
- **File**: `lib/workflow-store.ts`, line 4
- **Standard**: Section 4 — "Import types with `import type` when only using the type."
- **Current pattern**: `import { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession } from '@/types/workflow'`
- **Expected pattern**: `import type { ... }`
- **Severity**: Low
- **Note**: All five symbols are used only as type annotations/assertions, never as runtime values. Other store files (`agents-store.ts`, `workspace-store.ts`) already use `import type` correctly.

### Finding F-02: Exported but unused `readYamlFile()` utility
- **File**: `lib/fs-utils.ts`, lines 16–26
- **Standard**: Dead code; project convention avoids unused exports
- **Current pattern**: `readYamlFile()` is exported but no module imports it.
- **Expected pattern**: Either adopt at call sites or remove.
- **Severity**: Low
- **Note**: Created during AUDIT-005 reuse extraction but call-site adoption was incomplete.

### Finding F-03: Null-safety gap in `createItem()` — `config` possibly null
- **File**: `lib/workflow-store.ts`, line 798 (pre-fix)
- **Standard**: Section 4 — TypeScript `strict: true`; GAP-17 in project-standards.md
- **Current pattern**: `readWorkflowConfig()` returns `WorkflowConfig | null` but result accessed without null guard.
- **Expected pattern**: Null guard before property access.
- **Severity**: Medium (correctness — runtime crash if `config.json` missing or malformed)

---

## Fix Log

| # | Finding | Result |
|---|---------|--------|
| F-01 | `import` → `import type` in `workflow-store.ts` | ✅ Fixed — changed to `import type { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession }` |
| F-02 | Unused `readYamlFile()` export in `fs-utils.ts` | ⏸ Deferred — removing undoes intentional reuse extraction; adopting at all call sites is scope creep. Address in future refactor. |
| F-03 | Null-safety gap in `createItem()` | ✅ Fixed — added `if (!config) return null;` guard after `readWorkflowConfig()` call. Resolves GAP-17. |
