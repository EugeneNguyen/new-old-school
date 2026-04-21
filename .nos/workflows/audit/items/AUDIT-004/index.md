# AUDIT-004: Naming Convention Audit

**Auditor**: NOS stage agent
**Date**: 2026-04-22
**Scope**: Naming conventions for files, variables, functions, components, and types across the codebase. Focus on `lib/scaffolding.*` files added since AUDIT-003.

---

## Audit Findings

### Finding 1: Test file naming for `lib/scaffolding.test.ts`
- **File**: `lib/scaffolding.test.ts`
- **Standard**: Section 8, Table — Test files colocation as `*.test.ts`
- **Current pattern**: `lib/scaffolding.test.ts`
- **Expected pattern**: `lib/scaffolding.test.ts`
- **Severity**: Low
- **Status**: Compliant — follows project convention correctly.

---

### Finding 2: Type definition file naming (`types/*.ts`)
- **File**: `types/skill.ts`, `types/question.ts`, `types/workspace.ts`, `types/session.ts`, `types/workflow.ts`, `types/tool.ts`
- **Standard**: Section 8, Table — Type definition files use `kebab-case`
- **Current pattern**: All type files follow `kebab-case` (`workflow.ts`, not `Workflow.ts`)
- **Expected pattern**: `kebab-case`
- **Severity**: Low
- **Status**: Compliant — all 6 type files correctly named in kebab-case.

---

### Finding 3: Utility module naming
- **File**: `lib/scaffolding.ts`, `lib/scaffolding.mjs`, `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/workspace-store.ts`, `lib/activity-log.ts`, `lib/markdown-preview.ts`
- **Standard**: Section 8, Table — Utility modules use `kebab-case`
- **Current pattern**: All utility modules follow kebab-case naming
- **Expected pattern**: `kebab-case`
- **Severity**: Low
- **Status**: Compliant — `scaffolding.ts` follows convention.

---

### Finding 4: Custom hooks naming
- **Files**: `lib/hooks/use-toast.ts`, `lib/hooks/use-item-done-sound.ts`, `lib/hooks/use-workflow-items.ts`
- **Standard**: Section 8, Table — Custom hooks use `use-` prefix, kebab-case
- **Current pattern**: All hooks follow `use-*.ts` convention
- **Expected pattern**: `use-*.ts`
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 5: UI primitive naming (`components/ui/`)
- **Files**: `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/dialog.tsx`, `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/toast.tsx`, `components/ui/scroll-area.tsx`, `components/ui/label.tsx`, `components/ui/logo.tsx`
- **Standard**: Section 8, Table — UI primitives use lowercase
- **Current pattern**: All components use lowercase kebab-case
- **Expected pattern**: lowercase
- **Severity**: Low
- **Status**: Compliant — `logo.tsx` (from GAP-12 fix) uses lowercase correctly.

---

### Finding 6: Feature component naming (`components/dashboard/`, `components/terminal/`)
- **Files**: `components/dashboard/ChatWidget.tsx`, `components/dashboard/KanbanBoard.tsx`, `components/terminal/SessionPanel.tsx`, `components/terminal/SlashPopup.tsx`
- **Standard**: Section 8, Table — Feature components use PascalCase
- **Current pattern**: All feature components use PascalCase
- **Expected pattern**: PascalCase
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 7: API route naming
- **Files**: `app/api/workflows/[id]/route.ts`, `app/api/agents/route.ts`, `app/api/workspaces/route.ts`, etc.
- **Standard**: Section 8, Table — API routes use `route.ts` in kebab-case directories
- **Current pattern**: All API routes use `route.ts` in kebab-case directories
- **Expected pattern**: `route.ts` in kebab-case directories
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 8: Function/variable naming in `lib/scaffolding.ts`
- **File**: `lib/scaffolding.ts`, lines 8–158
- **Standard**: camelCase for functions/variables; PascalCase for types/interfaces
- **Current pattern**:
  - Functions: `getTemplatesRoot`, `getNosTemplatesRoot`, `resolveWorkspacePath`, `initWorkspace`, `updateWorkspace`, `listTemplateFiles` — all camelCase
  - Interfaces: `InitResult`, `InitError`, `UpdateResult`, `UpdateError`, `UpdateWorkspaceOptions` — all PascalCase
- **Expected pattern**: camelCase for functions, PascalCase for types
- **Severity**: Low
- **Status**: Compliant — all function and type names follow conventions.

---

### Finding 9: No `enum` usage found
- **Scope**: `lib/`, `types/`, `components/`
- **Standard**: Section 4 (Anti-Patterns) — Avoid `enum`; use `as const` objects or union literal types
- **Current pattern**: No `enum` declarations found across the codebase
- **Expected pattern**: Union types or `as const` objects
- **Severity**: Low
- **Status**: Compliant — project uses union types (e.g., `ItemStatus` in `types/workflow.ts`).

---

### Finding 10: No `forwardRef` found
- **Scope**: `lib/`, `types/`, `components/`
- **Standard**: Section 3 (Anti-Patterns) — Don't wrap new components in `React.forwardRef`; pass `ref` as a regular prop
- **Current pattern**: No `forwardRef` declarations found (verified GAP-09 resolution)
- **Expected pattern**: Ref as regular prop
- **Severity**: Low
- **Status**: Compliant — GAP-09 confirmed resolved.

---

### Finding 11: No `any` type usage found
- **Scope**: `lib/`, `types/`, `bin/`
- **Standard**: Section 4 (Anti-Patterns) — Avoid `any`; use `unknown` with type narrowing
- **Current pattern**: No bare `any` types found in scanned files (verified via grep)
- **Expected pattern**: `unknown` at system boundaries
- **Severity**: Low
- **Status**: Compliant — `bin/cli.mjs` uses JavaScript and has no TypeScript `any` type issues.

---

### Finding 12: No `@ts-ignore` found in source code
- **Scope**: `lib/`, `types/`, `components/`, `app/`, `bin/`
- **Standard**: Section 4 (Anti-Patterns) — Avoid `@ts-ignore` without tracking comment
- **Current pattern**: `@ts-ignore` found only in standards and audit documentation, not in source code
- **Expected pattern**: No `@ts-ignore` in source files
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 13: No `getServerSideProps` / `getStaticProps` found
- **Scope**: `app/`
- **Standard**: Section 2 (Anti-Patterns) — Avoid `getServerSideProps` / `getStaticProps` (Pages Router patterns)
- **Current pattern**: No Pages Router patterns found; all routes use App Router
- **Expected pattern**: App Router with async Server Components
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 14: Named exports for components
- **Files**: `lib/scaffolding.ts`, `lib/utils.ts`, `lib/workspace-store.ts`, etc.
- **Standard**: Section 3 (Recommended Patterns) — Use named exports for components to aid tree-shaking
- **Current pattern**: All modules use named exports
- **Expected pattern**: Named exports
- **Severity**: Low
- **Status**: Compliant — `lib/scaffolding.ts` exports all functions via `export function`.

---

### Finding 15: Type import style
- **File**: `lib/scaffolding.ts`, line 7
- **Standard**: Section 4 (Recommended Patterns) — Use `import type` when only importing the type
- **Current pattern**: `import { fileURLToPath } from 'url'` — runtime import (correct); no type-only imports in this file
- **Expected pattern**: `import type` for type-only imports
- **Severity**: Low
- **Status**: Compliant.

---

### Finding 16: Synchronous `fs` API (GAP-05 — open, known gap)
- **Files**: `lib/scaffolding.ts`, `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/auto-advance.ts`
- **Standard**: Section 5 (GAP-05) — Async I/O (`fs.promises`) preferred to avoid blocking the event loop
- **Current pattern**: All file operations use synchronous `fs.readFileSync`, `fs.existsSync`, `fs.mkdirSync`, etc.
- **Expected pattern**: `fs.promises` for async I/O
- **Severity**: Low (known gap, low priority for local-only tool)
- **Status**: OPEN (GAP-05) — consistent synchronous pattern across all store files. Not a new violation; tracked in project-standards.md.

---

### Finding 17: `lib/scaffolding.mjs` naming (dual-module pattern)
- **Files**: `lib/scaffolding.ts`, `lib/scaffolding.mjs`, `lib/scaffolding.test.ts`
- **Standard**: Section 8, Table — Utility modules use `kebab-case`
- **Current pattern**: TypeScript source + ESM JavaScript wrapper (`.mjs`)
- **Expected pattern**: `kebab-case`
- **Severity**: Low
- **Status**: Compliant — dual-module approach (`.ts` for type checking, `.mjs` for runtime) is a known pattern in the project. The `.mjs` file follows the kebab-case base name convention.

---

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| High | 0 | No correctness or security violations found |
| Medium | 0 | No maintainability violations found |
| Low | 17 | All findings are style/compliance observations; 0 are new violations |

**Overall Assessment**: **COMPLIANT**

The codebase is broadly compliant with documented naming conventions. The `lib/scaffolding.*` files (added since AUDIT-003) follow all applicable standards:

- **File naming**: `scaffolding.ts`, `scaffolding.mjs`, `scaffolding.test.ts` — all follow kebab-case convention
- **Function/variable naming**: All camelCase (`getTemplatesRoot`, `initWorkspace`, etc.)
- **Type naming**: All PascalCase (`InitResult`, `InitError`, `UpdateResult`, etc.)
- **Exports**: All named exports
- **No enums, no forwardRef, no `any` types, no `@ts-ignore` in source**

GAP-05 (synchronous `fs`) is confirmed consistent across all store files — this is a known open gap tracked in project-standards.md and is not a new violation.

**Gap Update from AUDIT-003**:
- GAP-08 (limited test coverage): **PARTIAL** — `lib/scaffolding.test.ts` adds 1 new test file with 11 test cases covering `resolveWorkspacePath`, `initWorkspace`, `updateWorkspace`, and integration scenarios. This improves coverage for the scaffolding module but store functions (`workflow-store.ts`, `agents-store.ts`, `workspace-store.ts`) still lack dedicated test files.

**Recommended next step**: Verify test naming conventions match across remaining test files (`lib/system-prompt.test.ts`, `lib/workflow-view-mode.test.ts`, `lib/hooks/use-workflow-items.test.ts`) — all follow `*.test.ts` colocation pattern correctly.

---

## Fix Log

All 17 audit findings are **Compliant** — no violations were found, so no source-code changes were required.

| # | Finding | Result |
|---|---------|--------|
| 1 | Test file naming (`lib/scaffolding.test.ts`) | ✅ Fixed (already compliant) |
| 2 | Type definition file naming (`types/*.ts`) | ✅ Fixed (already compliant) |
| 3 | Utility module naming (`lib/scaffolding.ts`, etc.) | ✅ Fixed (already compliant) |
| 4 | Custom hooks naming (`use-*.ts`) | ✅ Fixed (already compliant) |
| 5 | UI primitive naming (`components/ui/`) | ✅ Fixed (already compliant) |
| 6 | Feature component naming (PascalCase) | ✅ Fixed (already compliant) |
| 7 | API route naming (`route.ts` in kebab directories) | ✅ Fixed (already compliant) |
| 8 | Function/variable naming in `lib/scaffolding.ts` | ✅ Fixed (already compliant) |
| 9 | No `enum` usage | ✅ Fixed (already compliant) |
| 10 | No `forwardRef` | ✅ Fixed (already compliant) |
| 11 | No `any` type usage | ✅ Fixed (already compliant) |
| 12 | No `@ts-ignore` in source | ✅ Fixed (already compliant) |
| 13 | No Pages Router patterns | ✅ Fixed (already compliant) |
| 14 | Named exports | ✅ Fixed (already compliant) |
| 15 | Type import style | ✅ Fixed (already compliant) |
| 16 | Synchronous `fs` API (GAP-05) | ⏸ Deferred — known open gap, tracked in project-standards.md, not a new violation |
| 17 | `lib/scaffolding.mjs` dual-module naming | ✅ Fixed (already compliant) |