# (routine) 2026-04-21 00:00

Created by routine at 2026-04-21 00:00

## Audit Findings

Audited against `docs/standards/project-standards.md` on 2026-04-21.

---

### F-01: `any` type usage across error handlers

- **Files**: `app/api/workspaces/route.ts:11`, `app/api/workspaces/browse/route.ts:59`, `app/api/workspaces/[id]/activate/route.ts:21`, `app/api/claude/sessions/route.ts:162`, `app/api/claude/route.ts:152`, `app/api/chat/stop/route.ts:20`, `app/api/chat/route.ts:161`, `app/api/chat/nos/route.ts:138`, `app/api/shell/route.ts:50`, `app/dashboard/workspaces/page.tsx:47`, `app/dashboard/page.tsx:46`, `app/dashboard/terminal/page.tsx:325,438`, `lib/markdown-preview.ts:29-30`
- **Standard violated**: TypeScript Standards — avoid `any`, use `unknown`
- **Current**: `} catch (err: any) {`
- **Expected**: `} catch (err: unknown) {` with type narrowing
- **Severity**: Medium (14 instances)

---

### F-02: Missing explicit return types on exported functions

- **Files**: `middleware.ts:4`, `lib/utils.ts:4`, `lib/workflow-view-mode.ts:5`, `app/api/utils/errors.ts:8`, `instrumentation.ts:1`, and all API route handlers across `app/api/workspaces/`, `app/api/workflows/`, `app/api/chat/`, `app/api/claude/`, `app/api/settings/`, `app/api/agents/`, `app/api/activity/`, `app/api/adapters/`, `app/api/shell/`, `app/api/system/`
- **Standard violated**: TypeScript Standards — explicit return types on exported functions
- **Current**: `export async function GET()` (no return type)
- **Expected**: `export async function GET(): Promise<Response>`
- **Severity**: Low (23+ instances — widespread but no correctness risk)

---

### F-03: Non-null assertions in non-obvious contexts

- **Files**: `lib/workspace-store.ts:120,152`, `components/dashboard/ItemDetailDialog.tsx:163,263,291`, `app/dashboard/activity/page.tsx:77`
- **Standard violated**: TypeScript Standards — avoid `!` unless invariant is trivially obvious
- **Current**: `pathCheck.resolved!`, `item!.id`, `payload.entry!`
- **Expected**: Proper null checks or type narrowing before access
- **Severity**: Medium (5 instances)

---

### F-04: Types defined outside `types/` directory

- **Files**: `components/ui/theme-toggle.tsx:8` (`Theme`), `app/dashboard/settings/page.tsx:32` (`TabId`), `lib/stream-registry.ts:3` (`StreamEntry`), `lib/auto-advance-sweeper.ts:12` (`TimerHandle`), `app/api/workflows/[id]/events/route.ts:19` (`WatcherEntry`)
- **Standard violated**: TypeScript Standards — types live in `types/` directory
- **Current**: Type definitions scattered in component/lib/route files
- **Expected**: Shared types consolidated in `types/*.ts` files
- **Severity**: Low (6+ instances)

---

### F-05: `useEffect` for data fetching in page/components that could be Server Components

- **Files**: `components/dashboard/Sidebar.tsx:28-41`, `app/dashboard/page.tsx:53-62`, `app/dashboard/workflows/page.tsx:72-74`, `app/dashboard/agents/page.tsx:104-106`
- **Standard violated**: React Standards — don't use `useEffect` for data fetching in components that could be Server Components
- **Current**: `'use client'` + `useEffect(() => { fetch('/api/...') }, [])`
- **Expected**: Server Component fetching data at render time, or lifting data fetching to a parent Server Component
- **Severity**: High (4 files — impacts performance and UX)

---

### F-06: Raw Tailwind color classes instead of semantic design tokens

- **Files**: `components/ui/badge.tsx:14` (`bg-green-100 text-green-800`), `components/ui/toast.tsx:32-35` (`border-green-500/50 bg-green-50 text-green-900`, `border-red-500/50`, `border-blue-500/50`, `border-amber-500/50`)
- **Standard violated**: UI Component Standards & Tailwind Standards — use semantic color tokens, no raw color classes when design tokens exist
- **Current**: `bg-green-100 text-green-800`, `border-red-500/50 bg-red-50`
- **Expected**: Semantic tokens like `bg-success text-success-foreground`, `bg-destructive text-destructive-foreground`
- **Severity**: Medium (2 files)

---

### F-07: API routes bypassing `createErrorResponse()` for bare `NextResponse.json()`

- **Files**: `app/api/settings/system-prompt/route.ts:21,32,37,41,49`, `app/api/settings/heartbeat/route.ts:15,26,36-39,48`, `app/api/settings/default-agent/route.ts:30,41,51,78`, `app/api/adapters/[name]/models/route.ts:14`, `app/api/workflows/[id]/stages/route.ts:21,24,54,57`, `app/api/workflows/[id]/stages/order/route.ts:37`, `app/api/workflows/route.ts:54`
- **Standard violated**: API Route Standards — use `createErrorResponse()` from `app/api/utils/errors.ts`
- **Current**: `NextResponse.json({ error: '...' }, { status: 400 })`
- **Expected**: `createErrorResponse('...', 'ValidationError', 400)`
- **Severity**: Medium (13 instances across 7 files)

---

### F-08: Direct filesystem access in API routes instead of store delegation

- **Files**: `app/api/workspaces/browse/route.ts:41-86` (fs.realpathSync, statSync, readdirSync), `app/api/workflows/route.ts:22-49` (fs.existsSync, readdirSync, readFileSync), `app/api/chat/route.ts:15-20,67-76` (mkdirSync, createWriteStream)
- **Standard violated**: API Route Standards — don't access filesystem directly in route handlers; delegate to store functions in `lib/`
- **Current**: Direct `fs.*` calls in route handlers
- **Expected**: Delegate to `lib/*-store.ts` functions
- **Severity**: High (3 files)

---

### F-09: Synchronous `fs` calls throughout stores and API routes

- **Files**: `lib/workflow-store.ts` (writeFileSync, renameSync, existsSync, statSync, readFileSync, mkdirSync, readdirSync — pervasive), `lib/workspace-store.ts` (mkdirSync, writeFileSync, renameSync, readFileSync, realpathSync, statSync, existsSync, readdirSync, copyFileSync), `lib/agents-store.ts` (writeFileSync, renameSync, existsSync, statSync, readFileSync, mkdirSync, readdirSync, rmSync), `app/api/claude/sessions/route.ts:19,54,134,146`, `app/api/claude/sessions/[id]/stream/route.ts:35`, `app/api/claude/route.ts:18`, `app/api/chat/nos/route.ts:22,28`
- **Standard violated**: GAP-05 — prefer `fs.promises` over synchronous calls in server context
- **Current**: `fs.readFileSync(...)`, `fs.writeFileSync(...)`, etc.
- **Expected**: `await fs.promises.readFile(...)`, `await fs.promises.writeFile(...)`, etc.
- **Severity**: Medium (widespread across 3 core store files + 8 API routes; low priority for local-only tool per standards doc)

---

### F-10: UI component files using kebab-case instead of PascalCase

- **Files**: `components/ui/badge.tsx`, `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/dialog.tsx`, `components/ui/input.tsx`, `components/ui/scroll-area.tsx`, `components/ui/select.tsx`, `components/ui/theme-toggle.tsx`, `components/ui/toast.tsx`, `components/ui/toaster.tsx`
- **Standard violated**: File Organization — React components use PascalCase files
- **Current**: `badge.tsx`, `button.tsx`, etc.
- **Expected**: `Badge.tsx`, `Button.tsx`, etc.
- **Severity**: Low (10 files — note: kebab-case in `components/ui/` is the default shadcn/ui convention, which conflicts with the project standard; consider updating the standard to allow this)

---

### F-11: Hook file naming convention violations

- **Files**: `hooks/useSlashComplete.ts` (camelCase instead of kebab-case), `lib/use-workflow-items.ts` (in `lib/` root instead of `lib/hooks/`)
- **Standard violated**: File Organization — custom hooks use `use-` prefix, kebab-case, in `lib/hooks/`
- **Current**: `useSlashComplete.ts` in `hooks/`, `use-workflow-items.ts` in `lib/`
- **Expected**: `use-slash-complete.ts` in `lib/hooks/`, `use-workflow-items.ts` in `lib/hooks/`
- **Severity**: Low (2 files)

---

### F-12: Missing `loading.tsx` files for streaming

- **Files**: No `loading.tsx` found in `app/dashboard/`, `app/dashboard/workflows/`, or any route segment
- **Standard violated**: GAP-04 — App Router best practice: add `loading.tsx` at route boundaries for progressive rendering
- **Current**: No loading states
- **Expected**: `loading.tsx` in `app/dashboard/` and key nested routes
- **Severity**: Medium (structural gap)

---

### F-13: Missing `error.tsx` error boundaries

- **Files**: No `error.tsx` found in `app/dashboard/` or any route segment
- **Standard violated**: GAP-06 — per-route error boundaries via `error.tsx`
- **Current**: No error boundaries
- **Expected**: `error.tsx` in `app/dashboard/` and key route segments
- **Severity**: Medium (structural gap)

---

## Summary

| Severity | Count | Findings |
|----------|-------|----------|
| **High** | 2 | F-05 (useEffect data fetching), F-08 (direct fs in API routes) |
| **Medium** | 7 | F-01 (any types), F-03 (non-null assertions), F-06 (raw color classes), F-07 (inconsistent error responses), F-09 (sync fs calls), F-12 (missing loading.tsx), F-13 (missing error.tsx) |
| **Low** | 4 | F-02 (missing return types), F-04 (types outside types/), F-10 (UI file naming), F-11 (hook naming) |
| **Total** | **13 findings** | ~80+ individual instances |

### Overall Assessment: **Needs Work**

The codebase follows many of the documented standards well — App Router architecture is correct, icon usage is consistent, `cn()` is used properly, store pattern is largely followed, and there are no Pages Router anti-patterns. However, there are two high-severity areas (client-side data fetching where Server Components could be used, and direct filesystem access in API routes) plus a consistent pattern of `any` usage in error handlers and inconsistent error response formatting across API routes. The synchronous filesystem usage is widespread but acknowledged in the standards as low priority for a local-only tool.

**Top 3 remediation priorities:**
1. Convert dashboard pages to Server Components for data fetching (F-05)
2. Delegate filesystem operations from API routes to store functions (F-08)
3. Standardize error responses via `createErrorResponse()` across all API routes (F-07)

## Fix Log

### Fixed

- ✅ **F-01** Fixed: Replaced `catch (err: any)` with `catch (err: unknown)` + `instanceof Error` narrowing across 12 files (13 catch-block instances). Also replaced `Plugin<[], any>` with proper `Root`/`RootContent` types in `lib/markdown-preview.ts` and typed `toolUses` array in `app/api/claude/sessions/route.ts`.
- ✅ **F-03** Fixed: Removed all 5 non-null assertions. Used discriminated union for `ValidatePathResult` in `lib/workspace-store.ts` (2 instances). Extracted narrowed variable before closure capture in `components/dashboard/ItemDetailDialog.tsx` (1 instance) and `app/dashboard/activity/page.tsx` (1 instance). Used optional chaining for `item?.id` (2 instances).
- ✅ **F-06** Fixed: Added `success`, `warning`, and `info` semantic color tokens to CSS variables (`app/globals.css`) and Tailwind config (`tailwind.config.js`). Updated `components/ui/badge.tsx` and `components/ui/toast.tsx` to use semantic tokens instead of raw color classes.
- ✅ **F-07** Fixed: Replaced all 13 bare `NextResponse.json({ error })` calls with `createErrorResponse()` across 7 files: `app/api/settings/system-prompt/route.ts`, `app/api/settings/heartbeat/route.ts`, `app/api/settings/default-agent/route.ts`, `app/api/adapters/[name]/models/route.ts`, `app/api/workflows/[id]/stages/route.ts`, `app/api/workflows/[id]/stages/order/route.ts`, `app/api/workflows/route.ts`.
- ✅ **F-12** Fixed: Added `app/dashboard/loading.tsx` with animated loading state.
- ✅ **F-13** Fixed: Added `app/dashboard/error.tsx` with error boundary UI and retry button.

### Deferred

- ⏸ **F-05** Deferred: Converting dashboard pages from client-side `useEffect` fetching to Server Components requires restructuring interactive state management patterns across multiple pages. High risk of regression; recommend as a dedicated refactor task.
- ⏸ **F-08** Deferred: Delegating filesystem operations from API routes to store functions requires creating new store abstractions and restructuring the chat/claude/browse route handlers. Recommend as a dedicated refactor task.
- ⏸ **F-09** Deferred: Migrating synchronous `fs` calls to `fs.promises` is widespread (3 core stores + 8 API routes). The standards document acknowledges this as low priority for a local-only tool.
- ⏸ **F-02** Deferred: Adding explicit return types to 23+ exported functions is low-severity and best addressed incrementally alongside other changes.
- ⏸ **F-04** Deferred: The flagged types are small, locally-scoped, and co-located with their usage. Moving them adds import complexity without meaningful benefit.
- ⏸ **F-10** Deferred: The kebab-case naming in `components/ui/` is the default shadcn/ui convention. Recommend updating the standard to explicitly allow this exception rather than renaming.
- ⏸ **F-11** Deferred: Hook file renaming involves import changes across the codebase for a low-severity naming convention issue.
