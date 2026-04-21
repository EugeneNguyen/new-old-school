# AUDIT-002: Codebase Audit Against Technology Standards

**Audit Date:** 2026-04-21  
**Standards Reference:** `docs/standards/README.md`, `docs/standards/project-standards.md`

---

## Audit Findings

### F-01: `any` type usage in source files

- **Severity:** Medium
- **Standard Violated:** TypeScript Standards — "`unknown` over `any` at system boundaries"
- **Files:**
  - `app/dashboard/page.tsx:33` — `useState<any>(null)` for API response data
  - `components/terminal/ToolUseCard.tsx:12` — `Record<string, any>` in function parameter
  - `lib/tool-registry.ts:15` — `(LucideIcons as any)[iconName]` type assertion
  - `types/tool.ts:14` — `input: Record<string, any>` in interface
- **Current Pattern:** `any` used as escape hatch in 4 locations.
- **Expected Pattern:** Use `unknown` with type guards, or define specific types (e.g., `Record<string, unknown>` or a typed API response interface for `useState`).

---

### F-02: Default exports in feature components

- **Severity:** Medium
- **Standard Violated:** React Patterns — "Named exports (not default) for components, to aid tree-shaking and refactoring" / "Anonymous default exports" anti-pattern
- **Files:** All 17 feature components in `components/dashboard/` and `components/terminal/` use `export default function`:
  - `components/dashboard/ChatWidget.tsx:27`
  - `components/dashboard/KanbanBoard.tsx:17`
  - `components/dashboard/ListView.tsx:82`
  - `components/dashboard/Sidebar.tsx:21`
  - `components/dashboard/WorkflowItemsView.tsx:30`
  - `components/dashboard/WorkflowSettingsView.tsx:23`
  - `components/dashboard/ItemDetailDialog.tsx:72`
  - `components/dashboard/ItemDescriptionEditor.tsx:35`
  - `components/dashboard/NewItemDialog.tsx:27`
  - `components/dashboard/AddStageDialog.tsx:17`
  - `components/dashboard/StageDetailDialog.tsx:20`
  - `components/dashboard/RoutineSettingsDialog.tsx:21`
  - `components/dashboard/WorkspaceSwitcher.tsx:18`
  - `components/terminal/SessionPanel.tsx:56`
  - `components/terminal/ToolUseCard.tsx:27`
  - `components/terminal/SlashPopup.tsx:12`
  - `components/terminal/QuestionCard.tsx:20`
- **Current Pattern:** `export default function ComponentName`
- **Expected Pattern:** `export function ComponentName` (named exports)

---

### F-03: `React.forwardRef` usage (deprecated in React 19)

- **Severity:** Low
- **Standard Violated:** React Standards — "Don't wrap new components in `React.forwardRef` — pass `ref` as a regular prop instead"
- **Files (14 usages across 5 files):**
  - `components/ui/button.tsx:38` (1 usage)
  - `components/ui/card.tsx:4,15,22,29,36` (5 usages: Card, CardHeader, CardTitle, CardDescription, CardContent)
  - `components/ui/input.tsx:6` (1 usage)
  - `components/ui/scroll-area.tsx:4` (1 usage)
  - `components/ui/toast.tsx:11,44,59,74,92,104` (6 usages: ToastViewport, Toast, ToastAction, ToastClose, ToastTitle, ToastDescription)
- **Current Pattern:** `React.forwardRef<...>(...)` with `.displayName` boilerplate
- **Expected Pattern:** Accept `ref` as a regular prop (React 19+ pattern). No urgent action — migrate when touching these files.

---

### F-04: Direct filesystem access in API route handlers

- **Severity:** Medium
- **Standard Violated:** API Route Standards — "Don't access the filesystem directly in route handlers; delegate to store functions in `lib/`" / "Don't put business logic in route handlers; extract to `lib/` modules"
- **Files importing `fs` directly:**
  - `app/api/workflows/route.ts:2` — `import fs from 'fs'`, uses `fs.existsSync`, `fs.readdirSync` directly in GET handler (line 24-28)
  - `app/api/claude/sessions/route.ts:2` — `import { readdirSync, readFileSync, statSync } from 'fs'`, entire session parsing logic inline
  - `app/api/claude/sessions/[id]/stream/route.ts:2` — `import { readFileSync } from 'fs'`
  - `app/api/chat/route.ts:3` — `import { createWriteStream, mkdirSync } from 'fs'`
  - `app/api/chat/nos/route.ts:3` — `import { mkdirSync, readFileSync } from 'fs'`
  - `app/api/claude/route.ts:3` — `import { createWriteStream, mkdirSync } from 'fs'`
  - `app/api/workspaces/browse/route.ts:2` — `import fs from 'fs'`
- **Current Pattern:** 7 route files import `fs` and perform filesystem operations directly.
- **Expected Pattern:** Delegate all filesystem operations to store functions in `lib/`.

---

### F-05: Synchronous filesystem calls throughout `lib/` stores

- **Severity:** Low (local-only tool)
- **Standard Violated:** GAP-05 in standards — "Async I/O (`fs.promises`) is preferred to avoid blocking the event loop"
- **Scope:** 100+ synchronous `fs` calls across:
  - `lib/workflow-store.ts` (~60 calls)
  - `lib/workspace-store.ts` (~12 calls)
  - `lib/agents-store.ts` (~15 calls)
  - `lib/settings.ts` (~5 calls)
  - `lib/routine-scheduler.ts` (~12 calls)
  - `lib/activity-log.ts` (~3 calls)
  - `lib/auto-advance.ts` (~4 calls)
  - `lib/system-prompt.ts` (~3 calls)
  - `lib/agent-adapter.ts` (~1 call)
- **Current Pattern:** `fs.readFileSync`, `fs.existsSync`, `fs.writeFileSync`, etc.
- **Expected Pattern:** `fs.promises.readFile`, `fs.promises.access`, `fs.promises.writeFile`, etc.
- **Note:** Low priority for a local-only dev tool with no concurrent user load.

---

### F-06: Inline `style={}` attributes alongside Tailwind classes

- **Severity:** Low
- **Standard Violated:** Tailwind CSS Standards — "Don't inline `style=` attributes alongside Tailwind classes"
- **Files:**
  - `components/dashboard/ChatWidget.tsx:267` — `style={{ maxHeight: '70vh' }}`
  - `components/dashboard/ChatWidget.tsx:315` — `style={{ minHeight: 0 }}`
  - `components/dashboard/ChatWidget.tsx:316` — `style={{ minHeight: '8rem' }}`
  - `components/dashboard/ItemDetailDialog.tsx:383` — `style={{ background: 'transparent' }}`
- **Current Pattern:** Mixed inline styles with Tailwind utility classes.
- **Expected Pattern:** Use Tailwind utilities (`max-h-[70vh]`, `min-h-0`, `min-h-32`, `bg-transparent`) or extract to CSS variables.

---

### F-07: `Logo.tsx` PascalCase naming in `components/ui/`

- **Severity:** Low
- **Standard Violated:** File Naming Standards — "UI primitives (shadcn-style): lowercase"
- **File:** `components/ui/Logo.tsx`
- **Current Pattern:** PascalCase filename in a directory where all other files are lowercase (`button.tsx`, `card.tsx`, `dialog.tsx`, etc.)
- **Expected Pattern:** `components/ui/logo.tsx` or move to a non-shadcn directory.

---

### F-08: Missing granular `error.tsx` / `loading.tsx` in sub-routes

- **Severity:** Medium
- **Standard Violated:** Next.js Standards — "Error boundaries (`error.tsx`) per route segment" / "Suspense boundaries around async data dependencies"
- **Present:**
  - `app/dashboard/error.tsx` — exists
  - `app/dashboard/loading.tsx` — exists
- **Missing:**
  - `app/dashboard/workflows/[id]/error.tsx` — NOT present
  - `app/dashboard/workflows/[id]/loading.tsx` — NOT present
  - `app/dashboard/workflows/loading.tsx` — NOT present
- **Impact:** Errors in workflow detail pages bubble to the dashboard-level error boundary, resetting the entire dashboard view. Navigation to workflow pages shows the dashboard skeleton rather than a targeted loading state.

---

### F-09: `"use client"` on dashboard page component

- **Severity:** Medium
- **Standard Violated:** React Standards — "Server-first. Default to Server Components" / Next.js Standards — "Avoid `"use client"` on components that only render data without interactivity"
- **Files:**
  - `app/dashboard/page.tsx:1` — `"use client"` on the main dashboard page
  - `app/dashboard/settings/page.tsx:1` — `"use client"` on settings page
  - `app/dashboard/terminal/page.tsx:1` — `"use client"` (justified — terminal requires heavy interactivity)
- **Current Pattern:** Dashboard page (`page.tsx`) is a client component that fetches data via `useEffect` + `useState<any>`.
- **Expected Pattern:** Dashboard page should be a Server Component that fetches data server-side, with client interactivity pushed to leaf components (e.g., a `<RefreshButton />` child). The terminal page is correctly client-side.
- **Note:** `app/dashboard/settings/page.tsx` may be justified depending on interactivity requirements.

---

### F-10: No ESLint or Prettier configuration

- **Severity:** Medium
- **Standard Violated:** GAP-03 in standards — "Next.js projects should have explicit ESLint configuration" and "Prettier with `prettier-plugin-tailwindcss`"
- **Current:** No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, or `prettier.config.*` files found.
- **Expected:** `eslint.config.mjs` with `@next/eslint-plugin-next` and `@typescript-eslint/eslint-plugin`. Prettier with `prettier-plugin-tailwindcss`.

---

### F-11: TypeScript `strict: false`

- **Severity:** High
- **Standard Violated:** TypeScript Standards — "Enable `strict: true` in `tsconfig.json`"
- **File:** `tsconfig.json:11` — `"strict": false`
- **Impact:** No compile-time null checks, implicit `any` allowed, missing strictFunctionTypes. This is the single highest-impact configuration gap.

---

### F-12: `@types/react` v18 with React 19 canary

- **Severity:** Medium
- **Standard Violated:** GAP-11 — "Type definitions should match the React version in use"
- **File:** `package.json:65-66` — `"@types/react": "^18.0.0"`, `"@types/react-dom": "^18.0.0"`
- **Current Pattern:** Type definitions target React 18 API surface.
- **Expected Pattern:** `@types/react@^19.0.0` and `@types/react-dom@^19.0.0` to match the canary React 19 runtime.

---

### F-13: Canary dependencies without version pinning

- **Severity:** Medium
- **Standard Violated:** GAP-10 — "Pin to specific canary versions for reproducible builds"
- **File:** `package.json:55,57,58`
  - `"next": "canary"`
  - `"react": "canary"`
  - `"react-dom": "canary"`
- **Impact:** `npm install` on different days pulls different canary builds, leading to non-reproducible builds and potential breakage.
- **Expected Pattern:** Pin to specific canary versions (e.g., `next@15.2.0-canary.42`) or move to stable (`next@^16`, `react@^19`).

---

### F-14: Tailwind CSS v3 (v4.2 is current)

- **Severity:** Low
- **Standard Violated:** GAP-02 — "Tailwind CSS v4.2 is the current release"
- **File:** `package.json:69` — `"tailwindcss": "^3.0.0"`
- **Note:** The project's CSS-variable theme approach is already v4-aligned. Migration path: `npx @tailwindcss/upgrade`.

---

### F-15: Mixed config file module formats

- **Severity:** Low
- **Standard Violated:** GAP-07 — "Choose one module system for config files"
- **Files:**
  - `next.config.mjs` — ESM
  - `tailwind.config.js` — CJS
  - `postcss.config.js` — CJS
- **Expected:** Standardize to ESM (`.mjs` or `"type": "module"`).

---

### F-16: Limited test coverage

- **Severity:** Medium
- **Standard Violated:** Testing Standards — "Critical business logic and API routes should have test coverage"
- **Current:** Only 3 test files:
  - `lib/system-prompt.test.ts`
  - `lib/use-workflow-items.test.ts`
  - `lib/workflow-view-mode.test.ts`
- **Missing coverage for:**
  - `lib/workflow-store.ts` (core data layer, ~780 lines)
  - `lib/agents-store.ts`
  - `lib/workspace-store.ts`
  - `lib/auto-advance.ts`
  - `lib/stage-pipeline.ts`
  - `lib/routine-scheduler.ts`
  - All API route handlers (36 route files)

---

## Summary

| Severity | Count |
|----------|-------|
| **High** | 1 |
| **Medium** | 9 |
| **Low** | 6 |
| **Total** | **16** |

**Overall Assessment: Needs Work**

The codebase follows many of its documented conventions — file organization is clean, the type system uses interfaces/types correctly, no enums are used, no `@ts-ignore` directives exist, API routes consistently use `createErrorResponse` and `withWorkspace`, and the shadcn/ui component pattern is well-established. However, there are significant gaps:

1. **High-impact configuration:** TypeScript strict mode is disabled (F-11), which is the single most impactful fix available.
2. **Architectural violations:** 7 API routes import `fs` directly instead of delegating to store functions (F-04), and the dashboard page uses client-side data fetching where server components would be appropriate (F-09).
3. **React modernization:** 14 `forwardRef` usages should be migrated to the React 19 ref-as-prop pattern when files are touched (F-03), and all 17 feature components use default exports instead of named exports (F-02).
4. **Dependency hygiene:** Canary dependencies are unpinned (F-13), `@types/react` version mismatches the runtime (F-12), and Tailwind is one major version behind (F-14).
5. **Quality infrastructure:** No linter or formatter configured (F-10), and test coverage is minimal at 3 files covering non-critical paths (F-16).

The codebase is functional and internally consistent in many areas, but the gaps in type safety, testing, and lint tooling mean regressions are likely to accumulate over time.

---

## Fix Log

| Finding | Status | Notes |
|---------|--------|-------|
| **F-01**: `any` type usage | u2705 Fixed | Replaced `any` with `unknown`, `LucideIcon`, and `SystemStatus` interface across 4 files |
| **F-02**: Default exports | u2705 Fixed | Converted all 17 feature components + dashboard page to named exports; updated all import sites including dynamic imports |
| **F-03**: `React.forwardRef` usage | u23f8 Deferred | Low severity; migrate when touching these shadcn/ui files. No functional impact with React 19. |
| **F-04**: Direct `fs` in API routes | u23f8 Deferred | Medium severity but high blast radius u2014 7 route files need refactoring to delegate to lib/ store functions. Requires dedicated refactor pass. |
| **F-05**: Synchronous fs calls in lib/ | u23f8 Deferred | Low severity for local-only tool. 100+ call sites across 9 files u2014 async migration is a standalone project. |
| **F-06**: Inline `style={}` attributes | u2705 Fixed | Replaced 4 inline styles with Tailwind utilities (`max-h-[70vh]`, `min-h-0`, `min-h-32`, `!bg-transparent`) |
| **F-07**: Logo.tsx PascalCase naming | u2705 Fixed | Renamed to `components/ui/logo.tsx`; updated import paths in `app/page.tsx` and `Sidebar.tsx` |
| **F-08**: Missing error/loading boundaries | u23f8 Deferred | Medium severity; requires new files and testing of error/loading UX. Should be a feature task. |
| **F-09**: `"use client"` on dashboard page | u23f8 Deferred | Medium severity; converting to server component requires architectural changes to data fetching. |
| **F-10**: No ESLint/Prettier | u23f8 Deferred | Medium severity; requires package installation, configuration, and initial lint pass. Standalone setup task. |
| **F-11**: TypeScript `strict: false` | u2705 Fixed | Enabled `strict: true` in `tsconfig.json`. Cleaned up unused variables surfaced by strict mode. |
| **F-12**: `@types/react` v18 mismatch | u2705 Fixed | Updated `@types/react` and `@types/react-dom` to `^19.0.0` |
| **F-13**: Unpinned canary deps | u2705 Fixed | Pinned `next` to `16.2.1-canary.45`; `react`/`react-dom` to `^19.2.5` (stable) |
| **F-14**: Tailwind CSS v3 | u23f8 Deferred | Low severity; v4 migration has its own tool (`npx @tailwindcss/upgrade`) and should be a standalone task. |
| **F-15**: Mixed config module formats | u23f8 Deferred | Low severity; cosmetic consistency issue with no functional impact. |
| **F-16**: Limited test coverage | u23f8 Deferred | Medium severity; writing tests for core stores and API routes is a multi-session effort. |

**Summary:** 7 of 16 findings fixed. 9 deferred u2014 these are either low-risk, require larger refactors (F-04, F-09), or need dedicated setup tasks (F-10, F-14, F-16).
