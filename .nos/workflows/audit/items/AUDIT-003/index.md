# AUDIT-003: Codebase Standards Audit

Audit date: 2026-04-21
Standards reference: `docs/standards/project-standards.md`

---

## Audit Findings

### F-01: Missing `import type` for type-only imports
- **Files**: `app/layout.tsx:2`, `lib/tool-registry.ts:4`, `lib/skill-registry.ts:2`, `app/api/workflows/route.ts:4`, `components/dashboard/Sidebar.tsx:10`, `components/dashboard/WorkflowItemsView.tsx:15`, `components/dashboard/KanbanBoard.tsx:7`, `components/dashboard/ListView.tsx:7`, `components/dashboard/AddStageDialog.tsx:8`, `components/dashboard/SidebarContext.tsx:3` (mixed `ReactNode`), `components/dashboard/ItemDetailDialog.tsx:3` (mixed `KeyboardEvent`), `components/dashboard/StageDetailDialog.tsx:9`, `components/dashboard/NewItemDialog.tsx:12`
- **Standard violated**: TS §4 — "Import types with `import type` when only using the type"
- **Current pattern**: `import { Workflow } from '@/types/workflow'` where `Workflow` is used only as a type annotation/parameter
- **Expected pattern**: `import type { Workflow } from '@/types/workflow'` or inline `import { type Workflow } from '@/types/workflow'`
- **Severity**: Medium

### F-02: Missing explicit return types on exported functions
- **Files**: ~50+ exported functions across `lib/`, `components/`, `app/api/`, and `app/` page files
- **Key examples**: `lib/utils.ts:4` (`cn`), `lib/workflow-view-mode.ts:5,23`, `lib/use-workflow-items.ts:48` (`useWorkflowItems`), `app/api/utils/errors.ts:8` (`createErrorResponse`), `middleware.ts:4`, `instrumentation.ts:1`, all React components in `components/`, all API route handlers
- **Standard violated**: TS §4 — "Explicit return types on exported functions"
- **Current pattern**: `export function cn(...inputs: ClassValue[]) {`
- **Expected pattern**: `export function cn(...inputs: ClassValue[]): string {`
- **Severity**: Medium

### F-03: Non-null assertion without obvious invariant
- **File**: `lib/use-workflow-items.ts:272`
- **Standard violated**: TS §4 — "Avoid non-null assertions unless the invariant is trivially obvious"
- **Current pattern**: `orderedNames.map((name) => nameToStage.get(name)!).filter(Boolean)`
- **Expected pattern**: `orderedNames.flatMap((name) => { const s = nameToStage.get(name); return s ? [s] : []; })`
- **Severity**: Medium

### F-04: Missing input validation — `req.json()` without try/catch
- **Files**: `app/api/workflows/[id]/items/[itemId]/route.ts:51` (PATCH), `app/api/workflows/[id]/stages/[stageName]/route.ts:20` (PATCH), `app/api/workflows/[id]/items/[itemId]/comments/route.ts:21` (POST), `app/api/workflows/[id]/items/[itemId]/comments/[index]/route.ts:22,47` (PATCH/DELETE), `app/api/workflows/[id]/items/[itemId]/content/route.ts:40` (PUT)
- **Standard violated**: API §7 — "Input validation at boundaries"
- **Current pattern**: `const body = await req.json()` with no try/catch — malformed JSON produces a 500 instead of 400
- **Expected pattern**: Wrap in try/catch returning `createErrorResponse('ValidationError', 'Invalid JSON body', 400)`
- **Severity**: High

### F-05: Shell command input not type-validated
- **File**: `app/api/shell/route.ts:24`
- **Standard violated**: API §7 — "Input validation at boundaries"
- **Current pattern**: `if (!command)` — only checks truthiness, not that `command` is a string
- **Expected pattern**: `if (typeof command !== 'string')` guard before calling `.split()`
- **Severity**: High

### F-06: Activity `limit` parameter has no bounds validation
- **Files**: `app/api/activity/route.ts:13`, `app/api/workflows/[id]/activity/route.ts:20`, `app/api/workflows/[id]/items/[itemId]/activity/route.ts:23`
- **Standard violated**: API §7 — "Input validation at boundaries"
- **Current pattern**: `Number(limit)` with no bounds check — negative or infinite values pass through
- **Expected pattern**: Clamp to a reasonable range (e.g., 1–500)
- **Severity**: Medium

### F-07: Incorrect HTTP status codes
- **File**: `app/api/workflows/[id]/items/[itemId]/comments/route.ts:31` — POST returns 200, should be 201
- **File**: `app/api/workspaces/[id]/route.ts:45` — DELETE returns 200, should be 204 No Content
- **File**: `app/api/workflows/[id]/items/route.ts:59` — internal failure returns 400, should be 500
- **Standard violated**: API §7 — "Use correct status codes: 201 for creation, 400 for validation errors"
- **Severity**: Medium

### F-08: Business logic embedded in route handlers
- **File**: `app/api/workflows/route.ts:22-49` — Manual filesystem walk duplicating `lib/workflow-store.ts`
- **File**: `app/api/claude/sessions/route.ts:26-125` — `parseSessionSummary`/`parseSessionHistory` belong in `lib/`
- **File**: `app/api/claude/sessions/[id]/stream/route.ts:34-38` — Session replay logic inline
- **File**: `app/api/chat/nos/route.ts:26-52` — `getNosAgentPrompt()`/`buildPrompt()` inline
- **Standard violated**: API §7 — "Don't put business logic in route handlers; extract to `lib/` modules"
- **Severity**: Medium

### F-09: Inconsistent error response construction
- **File**: `app/api/utils/errors.ts:16-19` — `createErrorResponse()` uses `new Response(JSON.stringify())` instead of `NextResponse.json()`
- **File**: `app/api/agents/[id]/route.ts:112-124` — 409 response constructed manually, bypasses `createErrorResponse()`
- **File**: `app/api/settings/system-prompt/route.ts:50` — Uses `NextResponse.json({ error })` instead of `createErrorResponse()`
- **File**: `app/api/settings/default-agent/route.ts:79` — Same non-standard error shape
- **File**: `app/api/settings/heartbeat/route.ts:46` — Same non-standard error shape
- **Standard violated**: API §7 — "Use `createErrorResponse()` for centralized error responses"
- **Severity**: Medium

### F-10: Synchronous `fs` calls in API route handlers
- **File**: `app/api/workflows/route.ts:24,28,32,37,39`
- **File**: `app/api/workspaces/browse/route.ts:41,48,58,70-71,86`
- **File**: `app/api/claude/sessions/route.ts:20,55,135,147`
- **File**: `app/api/claude/sessions/[id]/stream/route.ts:35`
- **File**: `app/api/chat/nos/route.ts:28`
- **Standard violated**: Data §10 / Gap GAP-05 — "Async I/O preferred to avoid blocking the event loop"
- **Severity**: Low (local-only tool)

### F-11: `React.forwardRef` usage (deprecated in React 19)
- **Files**: `components/ui/toast.tsx` (6 usages), `components/ui/card.tsx` (4), `components/ui/scroll-area.tsx` (1), `components/ui/input.tsx` (1), `components/ui/button.tsx` (1) — 14 total across 5 files
- **Standard violated**: React §3 / UI §9 — "New components should accept ref as a regular prop (React 19 pattern)"
- **Current pattern**: `const Button = React.forwardRef<...>((props, ref) => ...)`
- **Expected pattern**: `function Button({ ref, ...props }: ButtonProps & { ref?: React.Ref<...> }) { ... }`
- **Severity**: Low

### F-12: Manual class string concatenation instead of `cn()`
- **File**: `components/dashboard/WorkflowItemsView.tsx:150-152,162-164` — Template literal for conditional classes
- **File**: `components/terminal/SlashPopup.tsx:36-40` — Template literal with two conditional segments
- **Standard violated**: Tailwind §5 — "Always use `cn()` to merge Tailwind classes. Never manually concatenate class strings"
- **Severity**: Medium

### F-13: Hook files in wrong directory
- **File**: `lib/use-workflow-items.ts` — Should be at `lib/hooks/use-workflow-items.ts`
- **File**: `lib/use-workflow-items.test.ts` — Should be at `lib/hooks/use-workflow-items.test.ts`
- **Standard violated**: File Organization §8 — "Custom hooks: `use-` prefix, kebab-case in `lib/hooks/`"
- **Severity**: Low

### F-14: Missing `loading.tsx` in dashboard sub-routes
- **Paths**: `app/dashboard/activity/`, `app/dashboard/agents/`, `app/dashboard/settings/`, `app/dashboard/terminal/`, `app/dashboard/workflows/`, `app/dashboard/workflows/[id]/`, `app/dashboard/workflows/[id]/settings/`, `app/dashboard/workspaces/` (8 segments)
- **Standard violated**: Next.js §2 — "Add `loading.tsx` at key route segments for streaming"
- **Severity**: Low

### F-15: Missing `error.tsx` in dashboard sub-routes
- **Paths**: Same 8 segments as F-14
- **Standard violated**: Next.js §2 — "Add `error.tsx` at key route segments for graceful degradation"
- **Severity**: Low

---

## Previously Identified Gaps (Reconfirmed)

The following gaps from `docs/standards/project-standards.md` §11 were reconfirmed during this code scan:

| Gap | Status | Notes |
|-----|--------|-------|
| GAP-03 | OPEN | No linter config exists; `npm run lint` calls removed `next lint` |
| GAP-05 | OPEN | Synchronous `fs` widespread in stores and route handlers (F-10) |
| GAP-09 | OPEN | 14 `forwardRef` usages confirmed in 5 UI files (F-11) |
| GAP-11 | OPEN | `@types/react@18` still installed with React 19 |
| GAP-13 | OPEN | `"lint": "next lint"` still in package.json |
| GAP-14 | OPEN | `reactCompiler: true` not set in `next.config.mjs` |
| GAP-15 | OPEN | `next-themes` still missing from `package.json` dependencies |

---

## Summary

**Finding counts by severity:**

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| High | 2 | F-04, F-05 |
| Medium | 7 | F-01, F-02, F-03, F-06, F-07, F-08, F-09, F-12 |
| Low | 5 | F-10, F-11, F-13, F-14, F-15 |
| **Total** | **15** | |

**Overall assessment: Needs work.**

The codebase is clean on the most critical TypeScript anti-patterns — no `any`, no `enum`, no `@ts-ignore`, no Pages Router remnants, correct `params`/`searchParams` awaiting, and proper `"use client"` usage. Naming conventions are well-followed with only minor placement issues.

However, there are two high-severity input validation gaps in API routes (missing try/catch on `req.json()` across 6 endpoints, and untyped shell command input), plus a broad pattern of medium-severity maintainability issues: ~13 files with missing `import type`, ~50+ exported functions without explicit return types, business logic embedded in 4 route handlers, inconsistent error response construction in 5 locations, and manual class concatenation in 3 components. The 7 previously-identified open gaps (GAP-03/05/09/11/13/14/15) were all reconfirmed — none have been resolved since the last audit stage.

Priority remediation order: F-04/F-05 (input validation) → F-09 (error consistency) → F-07 (HTTP status codes) → F-08 (extract business logic) → F-01/F-02 (type hygiene) → remaining items.

---

## Fix Log

### High Severity

| Finding | Status | Notes |
|---------|--------|-------|
| F-04 | ✅ Fixed | Added try/catch around `req.json()` in 6 endpoints: items PATCH, stages PATCH, comments POST, comments/[index] PATCH, content PUT, items POST. Returns 400 with `ValidationError` on malformed JSON. |
| F-05 | ✅ Fixed | Shell route now validates `typeof command !== 'string'` and also wraps `req.json()` in try/catch. |

### Medium Severity

| Finding | Status | Notes |
|---------|--------|-------|
| F-01 | ✅ Fixed | Converted to `import type` or inline `type` keyword in all 13 flagged files. |
| F-02 | ⏸ Deferred | ~50+ exported functions — best addressed by enabling `@typescript-eslint/explicit-function-return-type` once GAP-03 (linter infrastructure) is resolved. |
| F-03 | ✅ Fixed | Replaced non-null assertion with `flatMap` + conditional in `use-workflow-items.ts:272`. |
| F-06 | ✅ Fixed | Added `Math.max(1, Math.min(500, ...))` bounds clamping to all 3 activity route `limit` params. |
| F-07 | ✅ Fixed | Comments POST now returns 201; workspace DELETE returns 204; items POST internal failure returns 500. |
| F-08 | ⏸ Deferred | Business logic extraction in 4 route handlers is a structural refactor — should be its own focused PR to avoid breaking API behavior. |
| F-09 | ✅ Fixed | `createErrorResponse()` now uses `NextResponse.json()` instead of `new Response(JSON.stringify())`. Settings routes (system-prompt, default-agent, heartbeat) and agents DELETE now use `createErrorResponse()` consistently. |
| F-12 | ✅ Fixed | Replaced template literal class concatenation with `cn()` in `WorkflowItemsView.tsx` (2 locations) and `SlashPopup.tsx` (1 location). |

### Low Severity

| Finding | Status | Notes |
|---------|--------|-------|
| F-10 | ⏸ Deferred | Sync-to-async `fs` conversion across stores and route handlers is a significant refactor. Low severity (local-only tool). |
| F-11 | ✅ Fixed | Migrated all 14 `React.forwardRef` usages to React 19 ref-as-prop pattern across 5 UI files (button, input, card, scroll-area, toast). |
| F-13 | ✅ Fixed | Moved `lib/use-workflow-items.ts` and `lib/use-workflow-items.test.ts` to `lib/hooks/`. Updated all imports. Tests pass (5/5). |
| F-14 | ✅ Fixed | Added `loading.tsx` to all 8 dashboard sub-route segments. |
| F-15 | ✅ Fixed | Added `error.tsx` (client component with error boundary) to all 8 dashboard sub-route segments. |

### Summary

| Status | Count |
|--------|-------|
| ✅ Fixed | 12 |
| ⏸ Deferred | 3 (F-02, F-08, F-10) |
| ❌ Skipped | 0 |
