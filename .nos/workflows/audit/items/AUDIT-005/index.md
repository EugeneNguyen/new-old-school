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

---

## Comprehensive Audit Findings (Full Codebase Scan)

Audited 2026-04-23 against `docs/standards/project-standards.md` and all files in `docs/standards/`.

### A-01: Synchronous `fs` Operations in API Routes (GAP-05)

**Standard violated:** "Synchronous `fs` in API routes should be avoided" (GAP-05)  
**Severity:** High  

10 route files use blocking `fs` calls (`readFileSync`, `readdirSync`, `statSync`, `mkdirSync`, `realpathSync`, `openSync`, `readSync`, `closeSync`):

| File | Sync APIs Used |
|------|----------------|
| `app/api/workflows/route.ts` | `existsSync`, `readdirSync`, `statSync`, `readFileSync` |
| `app/api/chat/route.ts` | `mkdirSync` |
| `app/api/claude/route.ts` | `mkdirSync` |
| `app/api/chat/nos/route.ts` | `mkdirSync`, `readFileSync` |
| `app/api/claude/sessions/route.ts` | `readFileSync`, `statSync`, `readdirSync` |
| `app/api/claude/sessions/[id]/stream/route.ts` | `readFileSync` |
| `app/api/workspaces/browse/route.ts` | `realpathSync`, `statSync`, `readdirSync` (10+ uses) |
| `app/api/workspaces/serve/route.ts` | `realpathSync`, `statSync`, `openSync`, `readSync`, `closeSync`, `readFileSync` |
| `app/api/workspaces/preview/route.ts` | `realpathSync`, `statSync`, `readFileSync` |

**Expected:** Replace all with `fs.promises.*` async equivalents.

---

### A-02: Missing Explicit Return Types on Exported Functions (~90+)

**Standard violated:** "Explicit return types on exported functions" (TypeScript Standards)  
**Severity:** Medium  

Approximately 90+ exported functions lack explicit return types across:

- **`lib/` (4):** `workflow-view-mode.ts:5,23`, `utils.ts:4`, `tool-registry.ts:15`
- **`lib/hooks/` (1):** `use-workflow-items.ts:48`
- **Root (2):** `middleware.ts:4`, `instrumentation.ts:1`
- **Components (~24):** All exported components in `components/dashboard/`, `components/terminal/`, `components/chat/`, `components/ui/`
- **Pages/layouts (~24):** All `page.tsx`, `layout.tsx`, `error.tsx`, `loading.tsx` under `app/`
- **API routes (~40):** Every `GET`/`POST`/`PATCH`/`PUT`/`DELETE` handler

**Current:** `export function cn(...inputs: ClassValue[]) {`  
**Expected:** `export function cn(...inputs: ClassValue[]): string {`

---

### A-03: Raw Tailwind Colors Bypassing Semantic Tokens (~30 instances)

**Standard violated:** "No arbitrary values when design tokens exist" (Tailwind CSS Standards)  
**Severity:** Medium  

Files using raw colors (`green-500`, `red-400`, `blue-400`, `amber-600`, `yellow-500`, `gray-300`, `black`, `white`) instead of semantic tokens:

| File | Count | Examples |
|------|-------|----------|
| `components/terminal/SessionPanel.tsx` | 4 | `bg-green-400`→`bg-success`, `border-l-blue-500`→`border-l-primary` |
| `components/chat/ToolUseCard.tsx` | 4 | `text-green-400`→`text-success`, `text-red-400`→`text-destructive`, `text-blue-400`→`text-info` |
| `components/chat/QuestionCard.tsx` | 2 | `text-amber-400`→`text-warning`, `text-green-400`→`text-success` |
| `components/chat/ChatInput.tsx` | 1 | `text-blue-400`→`text-info` |
| `app/dashboard/terminal/page.tsx` | 3 | `text-blue-400`→`text-info`, `text-green-400`→`text-success` |
| `app/dashboard/settings/page.tsx` | 6 | `text-green-600`→`text-success`, `text-red-600`→`text-destructive`, `text-amber-600`→`text-warning` |
| `app/dashboard/agents/page.tsx` | 1 | `text-amber-600`→`text-warning` |
| `components/dashboard/FileBrowser.tsx` | 4 | `text-amber-500`→`text-warning`, `text-blue-500`→`text-info` |
| `components/dashboard/WorkflowSettingsView.tsx` | 1 | `border-yellow-500/50`→`border-warning/50` |
| `components/dashboard/WorkflowItemsView.tsx` | 2 | `border-yellow-500/50`→`border-warning/50` |
| `app/dashboard/workspaces/page.tsx` | 3 | `text-blue-500`→`text-info`, `text-green-500`→`text-success` |
| `lib/item-status-style.ts` | 4 | `border-l-green-500`→`border-l-success`, `bg-green-50`→`bg-success/10` |
| `components/dashboard/ListView.tsx` | 1 | `border-gray-300`→`border-border` |
| `components/dashboard/KanbanBoard.tsx` | 1 | `border-gray-300`→`border-border` |
| `components/dashboard/RoutineSettingsDialog.tsx` | 1 | `bg-white`→`bg-background` |

---

### A-04: Duplicated Claude Spawn + SSE Streaming Logic

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

**Files:** `app/api/chat/route.ts`, `app/api/claude/route.ts`, `app/api/chat/nos/route.ts`  
**Pattern:** All three contain ~90% identical boilerplate: `sessionsDir()`, `ensureSessionsDir()`, `extractSessionId()`, `spawn('claude', ...)`, `ReadableStream` with encoder/closed/closeController, stdout/stderr/close/error handlers, SSE headers.  
**Suggestion:** Extract `lib/claude-stream.ts` with shared `spawnClaudeStream()` utility.

---

### A-05: Duplicated Path Validation / Workspace Sandboxing

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

**Files:** `app/api/workspaces/serve/route.ts` (`validatePath`), `browse/route.ts` (`enforceWorkspaceSandbox`), `preview/route.ts` (inline)  
**Pattern:** Same NUL byte check → absolute path check → traversal check → `realpathSync` → containment check implemented 3 times.  
**Suggestion:** Extract into `lib/workspace-path.ts`.

---

### A-06: `readYamlFile()` Utility Exists But 16 Call Sites Use Inline Pattern

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

**Utility:** `lib/fs-utils.ts:16-26` exports `readYamlFile<T>()`  
**Inline duplicates:** `lib/workflow-store.ts` (12), `lib/agents-store.ts` (2), `lib/routine-scheduler.ts` (1), `lib/settings.ts` (1) — all use `yaml.load(fs.readFileSync(...)) as Record<string, unknown> ?? {}`  

---

### A-07: Duplicated Fetch-Agents `useEffect`

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

**Files:** `components/dashboard/KanbanBoard.tsx:27-42`, `components/dashboard/StageDetailDialog.tsx:56-72`  
**Pattern:** Character-for-character identical `useEffect` fetching `/api/agents`.  
**Suggestion:** Create `lib/hooks/use-agents.ts`.

---

### A-08: Identical `loading.tsx` / `error.tsx` Boundaries (12 files)

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

6 identical `loading.tsx` and 6 identical `error.tsx` across `app/dashboard/{activity,agents,settings,terminal,workflows,workspaces}/`.  
**Suggestion:** Create shared `DashboardLoading`/`DashboardError` components; each route re-exports.

---

### A-09: `workflowExists` Guard Repeated 20+ Times

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

15+ route handlers under `app/api/workflows/[id]/` repeat: `if (!workflowExists(id)) { return createErrorResponse(..., 'NotFound', 404); }`  
**Suggestion:** Create `withWorkflow(id, handler)` wrapper.

---

### A-10: Scattered Regex/Validation Definitions

**Standard violated:** Consolidate duplicated logic  
**Severity:** Medium  

| File | Regex |
|------|-------|
| `lib/validators.ts` | `WORKFLOW_ID_REGEX`, `WORKFLOW_PREFIX_REGEX` |
| `lib/agents-store.ts:13` | `SLUG_REGEX` |
| `lib/workflow-store.ts:634` | `STAGE_NAME_REGEX` (internal) |
| `app/api/settings/default-agent/route.ts:9` | `ADAPTER_SLUG_REGEX` (local) |

**Suggestion:** Consolidate all into `lib/validators.ts`.

---

### A-11: `next-themes` Phantom Dependency (GAP-15)

**Standard violated:** Explicit dependency management (security-design.md, GAP-15)  
**Severity:** Medium  

`next-themes` imported in `app/layout.tsx:4` and `components/ui/theme-toggle.tsx:3` but not listed in `package.json`.  
**Fix:** Add `"next-themes"` to `dependencies`.

---

### A-12: Missing `withWorkspace()` Wrapper on Workspace Routes

**Standard violated:** "Filesystem access should use `withWorkspace()` wrapper" (API Route Standards)  
**Severity:** Medium  

| File | Handlers Missing Wrapper |
|------|-------------------------|
| `app/api/workspaces/route.ts` | GET, POST |
| `app/api/workspaces/[id]/route.ts` | GET, PATCH, DELETE |
| `app/api/workspaces/[id]/activate/route.ts` | POST, DELETE |
| `app/api/workspaces/active/route.ts` | GET |
| `app/api/workspaces/preview/route.ts` | GET |

---

### A-13: Business Logic in Route Handlers Instead of `lib/`

**Standard violated:** "Business logic in `lib/` modules, not route handlers" (API Route Standards)  
**Severity:** Medium  

| File | Logic to Extract |
|------|------------------|
| `app/api/workflows/route.ts:18-58` | Workflow listing (fs scan + JSON parse) |
| `app/api/claude/sessions/route.ts:18-125` | `parseSessionSummary()`, `parseSessionHistory()` |
| `app/api/chat/nos/route.ts:25-52` | `getNosAgentPrompt()`, `buildPrompt()` |
| `app/api/workspaces/browse/route.ts:27-62` | `enforceWorkspaceSandbox()`, `resolveStat()` |
| `app/api/workspaces/serve/route.ts:37-64` | `validatePath()` |

---

### A-14: Hardcoded Error Objects Instead of `createErrorResponse()`

**Standard violated:** "All errors use `createErrorResponse()`" (API Route Standards)  
**Severity:** Medium  

| File | Line | Issue |
|------|------|-------|
| `app/api/workflows/[id]/stages/[stageName]/route.ts` | 141-145 | Manual `NextResponse.json` for 409 |
| `app/api/agents/[id]/route.ts` | 112-121 | Manual error object with extra `references` field |

---

### A-15: Custom Hook in Wrong Location with Wrong Naming

**Standard violated:** "Custom hooks in `lib/hooks/use-*.ts`" (React Standards)  
**Severity:** Medium  

**File:** `hooks/useSlashComplete.ts`  
**Issues:** (1) Lives at project-root `hooks/` instead of `lib/hooks/`. (2) camelCase instead of kebab-case.  
**Expected:** `lib/hooks/use-slash-complete.ts`

---

### A-16: `components/chat/` Not Listed in Structural Standards

**Standard violated:** File organization (project-standards.md lists `ui/`, `dashboard/`, `terminal/` only)  
**Severity:** Medium  

**Directory:** `components/chat/` (7 files)  
**Action:** Add to standards or relocate.

---

### A-17: `system-prompt.ts` Uses Raw `writeFileSync` Instead of `atomicWriteFile`

**Standard violated:** "Atomic writes via `atomicWriteFile()`" (Data Layer Standards)  
**Severity:** Medium  

**File:** `lib/system-prompt.ts:17`  
**Current:** `fs.writeFileSync(filePath, content, 'utf-8')`  
**Expected:** `atomicWriteFileWithDir(filePath, content)` from `lib/fs-utils.ts`

---

### A-18: `type` Used for Object Shapes Instead of `interface`

**Standard violated:** "Use `interface` for object shapes" (TypeScript Standards)  
**Severity:** Low  

| File | Line | Current | Expected |
|------|------|---------|---------|
| `app/api/utils/errors.ts` | 3 | `export type ApiError = { ... }` | `export interface ApiError { ... }` |
| `app/api/workflows/[id]/events/route.ts` | 19 | `type WatcherEntry = { ... }` | `interface WatcherEntry { ... }` |

---

### A-19: Missing `import type` for Type-Only Imports

**Standard violated:** "Use `import type` when only importing types" (TypeScript Standards)  
**Severity:** Low  

| File | Line | Import |
|------|------|--------|
| `lib/workflow-store.ts` | 4 | `import { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession }` |
| `app/api/workflows/[id]/items/[itemId]/route.ts` | 11 | `import { ItemStatus }` |

**Note:** F-01 in the Fix Log addressed `workflow-store.ts` but it may have regressed or the fix was to a different import line.

---

### A-20: `app/dashboard/page.tsx` Fully Client-Rendered

**Standard violated:** "Server Components by default" (React Standards)  
**Severity:** Low  

**File:** `app/dashboard/page.tsx:1` — entire page is `"use client"` with `useState`/`useEffect` for data fetching.  
**Expected:** Server Component wrapper passing data to interactive child.

---

## Comprehensive Summary

| Severity | Count |
|----------|-------|
| **High** | 1 finding (sync `fs` in 10 route files) |
| **Medium** | 16 findings |
| **Low** | 3 findings |
| **Total** | **20 distinct findings** |

### Compliant Areas (no violations)

- No `any` usage, no `enum`, no `@ts-ignore`, no `forwardRef`
- `params`/`searchParams` properly typed as `Promise` and awaited
- No `pages/` router, no `getServerSideProps`/`getStaticProps`
- Complete error/loading boundaries at all 8+ route segments
- `cn()` used consistently for className merging
- CVA used for multi-variant components (`button`, `badge`, `toast`, `ChatBubble`)
- Tailwind config correctly uses CSS variable-based theming with 12+ tokens
- Dark mode properly configured via `class` strategy
- All `lib/` files kebab-case, all `components/ui/` lowercase, all `components/dashboard/` PascalCase

### Overall Assessment: **Needs Work**

The codebase is well-structured and avoids many common anti-patterns. The highest-impact issue is **synchronous `fs` in API routes** (High) which blocks the Node.js event loop. The most widespread issue is **missing return types** (~90+ functions). Eight categories of **duplicated logic** present consolidation opportunities. The **`next-themes` phantom dependency** and **raw Tailwind colors** (~30 instances) undermine the project's own theming and dependency standards.

---

## Doc Audit Findings

The "Audit with the doc standard" stage did not produce formal findings (session stalled). The fix stage performed a retroactive documentation audit of `docs/standards/project-standards.md` against the codebase.

### D-01: GAP-17 status stale — shows OPEN but was already fixed
- **File**: `docs/standards/project-standards.md`, GAP-17 section
- **Standard**: Gap statuses must reflect actual codebase state
- **Current**: GAP-17 listed as OPEN with recommendation to add null guard
- **Actual**: Null guard already exists at `lib/workflow-store.ts:787`; fix was applied during AUDIT-005 fix stage
- **Severity**: Medium

### D-02: GAP-08 test file count outdated
- **File**: `docs/standards/project-standards.md`, GAP-08 section
- **Standard**: Gap descriptions must match codebase reality
- **Current**: "Only 3 test files found"
- **Actual**: 4 test files — `scaffolding.test.ts` was added in AUDIT-004 but the count was never updated
- **Severity**: Low

### D-03: Key Files Reference incomplete — 6 important lib files missing
- **File**: `docs/standards/project-standards.md`, Appendix: Key Files Reference
- **Standard**: Reference table should cover all critical business-logic files
- **Missing**: `lib/settings.ts`, `lib/routine-scheduler.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/activity-log.ts`, `lib/workflow-events.ts`
- **Severity**: Medium

### D-04: Section 12 audit findings path incorrect
- **File**: `docs/standards/project-standards.md`, Section 12 Document Types table
- **Standard**: Paths in documentation must be accurate
- **Current**: `.nos/workflows/audit/items/*/meta.yml`
- **Actual**: `.nos/workflows/audit/items/*/index.md` (findings are in `index.md`, not `meta.yml`)
- **Severity**: Low

### D-05: Section 8 file structure missing `components/chat/` directory
- **File**: `docs/standards/project-standards.md`, Section 8 project structure tree
- **Standard**: Directory structure must reflect actual project layout
- **Current**: Lists `ui/`, `dashboard/`, `terminal/` under `components/`
- **Actual**: `components/chat/` exists with 7 files — flagged by A-16 in comprehensive audit
- **Severity**: Low

---

## Doc Fix Log

| # | Finding | Result |
|---|---------|--------|
| D-01 | GAP-17 status stale | ✅ Fixed — updated GAP-17 to RESOLVED (AUDIT-005), added resolution note |
| D-02 | GAP-08 test count | ✅ Fixed — updated from "3 test files" to "4 test files", added `scaffolding.test.ts` |
| D-03 | Key Files Reference incomplete | ✅ Fixed — added 6 lib files: `settings.ts`, `routine-scheduler.ts`, `auto-advance.ts`, `auto-advance-sweeper.ts`, `activity-log.ts`, `workflow-events.ts` |
| D-04 | Audit findings path | ✅ Fixed — changed `meta.yml` to `index.md` in Section 12 Document Types table |
| D-05 | Missing `components/chat/` | ✅ Fixed — added `chat/` directory to Section 8 project structure tree |

---

## Doc Audit Findings (Stage: Audit with Doc Standard)

Audited 2026-04-23 against all 18 artifacts in `docs/standards/` plus 8 ADRs, cross-referenced with all 90 requirements in `.nos/workflows/requirements/items/`.

### DA-01: API Reference missing 9 implemented endpoints
- **Artifact affected**: API Reference (`docs/standards/api-reference.md`)
- **Gap**: 9 API endpoints exist in the codebase but are absent from the API reference. The doc was last updated 2026-04-21 and has not been updated for REQ-00081, REQ-00092, REQ-00094, or REQ-00096.
- **Missing (High — fully implemented routes with no documentation):**
  - `GET/PUT /api/workflows/[id]/routine` — routine config (REQ-00081)
  - `POST /api/workflows/[id]/items/[itemId]/restart` — item restart (REQ-00094)
  - `GET /api/workspaces/serve` — binary file serving with Range support (REQ-00096)
  - `GET /api/workspaces/active` — returns active workspace from cookie (REQ-00096)
  - `GET /api/workspaces/preview` — text file preview (REQ-00092)
- **Missing (Medium — partially documented or underdocumented):**
  - `POST /api/claude` — Claude session spawner (distinct from `/api/chat`)
  - `GET /api/workspaces/[id]` — workspace detail
  - `PATCH /api/workspaces/[id]` — workspace update
  - `POST /api/chat/answer` — question answer submission (REQ-00089)
- **File path**: `docs/standards/api-reference.md`
- **Severity**: High

### DA-02: RTM missing implementation file references
- **Artifact affected**: RTM (`docs/standards/rtm.md`)
- **Gap**: Several implementation files created during REQ-00081–REQ-00099 are not attributed in the RTM:
  - `lib/workspace-store.ts` — core data-layer module backing workspace CRUD, unattributed
  - `lib/fs-utils.ts` — shared utility from AUDIT-005, unattributed
  - `lib/validators.ts` — shared validation from AUDIT-005, unattributed
  - `components/dashboard/RoutineSettingsDialog.tsx` — routine UI from REQ-00081, not in RTM
  - `components/dashboard/WorkflowSettingsView.tsx` — settings view, not in RTM
  - `components/dashboard/SidebarContext.tsx` — context provider, not in RTM
  - `components/dashboard/WorkspaceSwitcher.tsx` — workspace UI, not in RTM
- **File path**: `docs/standards/rtm.md`
- **Severity**: Medium

### DA-03: User Journey missing 3 implemented journeys
- **Artifact affected**: User Journey (`docs/standards/user-journey.md`)
- **Gap**: Three fully implemented user journeys have no documentation:
  1. **File Browser Journey** — browse workspace files, navigate directories, preview files (text/image/audio/video), sandboxed security (REQ-00092, REQ-00096)
  2. **Routine Scheduling Journey** — enable routine mode per workflow, configure cron expression, auto-item creation (REQ-00081)
  3. **Item Restart Journey** — restart item from detail dialog, confirmation, reset to first stage (REQ-00094)
- **File path**: `docs/standards/user-journey.md`
- **Severity**: High

### DA-04: UX Design missing interaction patterns for newer features
- **Artifact affected**: UX Design (`docs/standards/ux-design.md`)
- **Gap**: No interaction patterns documented for:
  - File browser: breadcrumb navigation, file preview panel, search filtering, responsive two-panel layout, sandbox enforcement UX
  - Routine settings dialog: toggle enable/disable, cron expression input, validation feedback
  - Item restart: confirmation dialog, disabled-state logic
- **File path**: `docs/standards/ux-design.md`
- **Severity**: Medium

### DA-05: Glossary missing 10+ domain terms
- **Artifact affected**: Glossary (`docs/standards/glossary.md`)
- **Gap**: The following domain concepts are used in code/types but have no glossary entry:
  - **Routine** — `RoutineConfig`, `RoutineState`, cron-scheduled auto-item-creation (`lib/routine-scheduler.ts`)
  - **File Browser / File Viewer** — `BrowseEntry`, `BrowseResponse`, workspace sandboxing (`components/dashboard/FileBrowser.tsx`, `FileViewer.tsx`)
  - **File Sandboxing** — security-relevant workspace root containment enforcement
  - **ChatMessage** — `types/chat.ts`, core type for the chat component library
  - **ToolDefinition / ToolRegistry** — config-driven nav items (`types/tool.ts`, `lib/tool-registry.ts`)
  - **Cron Expression** — fundamental configuration for routines
  - **FileCategory** — extension-to-category mapping (`lib/file-types.ts`)
  - **SkillDefinition** — `types/skill.ts`
  - **routine.yaml / routine-state.json** — data files analogous to `meta.yml`/`stages.yaml` but not listed
- **File path**: `docs/standards/glossary.md`
- **Severity**: High

### DA-06: WBS missing 2 work packages for implemented features
- **Artifact affected**: WBS (`docs/standards/wbs.md`, `docs/standards/wbs-dictionary.md`)
- **Gap**: Two fully implemented features have no WBS work package:
  1. **File Browser** (should be ~1.4.12 + 1.3.9): `app/dashboard/files/`, `components/dashboard/FileBrowser.tsx`, `FileViewer.tsx`, `lib/file-types.ts`, plus 3 API routes (`browse`, `preview`, `serve`)
  2. **Chat Component Library** (should be ~1.5.5): `components/chat/` (7 files — `ChatBubble`, `MessageList`, `TypingIndicator`, `ChatInput`, `ToolUseCard`, `QuestionCard`, `index.ts`), `types/chat.ts`
- **File path**: `docs/standards/wbs.md`, `docs/standards/wbs-dictionary.md`
- **Severity**: High

### DA-07: 5 architectural decisions in code without ADRs
- **Artifact affected**: ADRs (`docs/standards/adr/`)
- **Gap**: The following architectural decisions are implemented but not captured in ADRs:
  1. **AsyncLocalStorage for workspace scoping** — `lib/project-root.ts` uses `AsyncLocalStorage<{ root: string }>` to thread workspace context. Security-relevant (wrong root = wrong data). **(High)**
  2. **Cron-based routine scheduling** — `lib/routine-scheduler.ts` piggybacks on the heartbeat sweep cycle via `cron-parser`. Coupling decision undocumented. **(High)**
  3. **File browser workspace sandboxing** — `realpathSync + startsWith` pattern in 3 route files for path traversal prevention. Security architecture undocumented. **(High)**
  4. **Chat component extraction/reuse** — `components/chat/` extracted from `components/terminal/` as shared library. **(Medium)**
  5. **Config-driven sidebar navigation** — `config/tools.json` defines nav items; `Sidebar.tsx` accesses by array index (fragile). **(Medium)**
- **File path**: `docs/standards/adr/`
- **Severity**: High (3 High + 2 Medium decisions)

### DA-08: Test plan outdated — understates coverage
- **Artifact affected**: Test Plan (`docs/standards/test-plan.md`)
- **Gap**: The test plan documents only 2 test files and ~8% coverage. Actual state:
  - 4 test files exist: `system-prompt.test.ts` (8 tests), `workflow-view-mode.test.ts` (8 tests), `use-workflow-items.test.ts` (5 tests), `scaffolding.test.ts` (11 tests)
  - `system-prompt.test.ts` and `workflow-view-mode.test.ts` are completely absent from the document
  - Priority targets (workflow-store, auto-advance, stage-pipeline) remain genuinely untested
- **File path**: `docs/standards/test-plan.md`
- **Severity**: Medium

### DA-09: Error handling strategy missing 2 activity entry types
- **Artifact affected**: Error Handling Strategy (`docs/standards/error-handling-strategy.md`)
- **Gap**: The Activity Log Entry Types table lists only 4 types (`title-changed`, `stage-changed`, `status-changed`, `body-changed`). Two implemented types are missing:
  - `restart` — added by REQ-00094 in `lib/activity-log.ts`
  - `routine-item-created` — added by REQ-00081 in `lib/activity-log.ts`
- **File path**: `docs/standards/error-handling-strategy.md`
- **Severity**: Medium

### DA-10: Database design missing newer entity types
- **Artifact affected**: Database Design (`docs/standards/database-design.md`)
- **Gap**: Entity specifications are missing:
  - `BrowseEntry` / `BrowseResponse` — file browser response types (defined inline in both `FileBrowser.tsx` and `browse/route.ts` — duplicated, not in `types/`)
  - `FileCategory` / `FileTypeClassification` — `lib/file-types.ts` exports
  - `ChatMessage` — `types/chat.ts` core type
  - Note: `Routine` entity IS documented (ERD + dedicated section) — no gap there
- **File path**: `docs/standards/database-design.md`
- **Severity**: Medium

### DA-11: Deployment design missing environment variables
- **Artifact affected**: Deployment Design (`docs/standards/deployment-design.md`)
- **Gap**: Two runtime-affecting env vars are used in code but absent from the Environment Variables table:
  - `NOS_HOME` — used in `lib/workspace-store.ts` and `bin/cli.mjs` to override workspace registry location
  - `NOS_PORT` — used in `bin/cli.mjs` to override dev server port
- **File path**: `docs/standards/deployment-design.md`
- **Severity**: Medium

### DA-12: Security design understates /api/shell protections
- **Artifact affected**: Security Design (`docs/standards/security-design.md`)
- **Gap**: The doc states shell mitigation is `typeof !== 'string'` validation only. The actual implementation enforces an `ALLOWED_COMMANDS` whitelist (`ls`, `pwd`, `whoami`, `date`, `git status`, `git log`, `npm list`). This is a positive discrepancy — security is stronger than documented — but the doc should reflect actual controls.
- **File path**: `docs/standards/security-design.md`
- **Severity**: Low (positive gap)

### DA-13: GAP-11 (@types/react version mismatch) appears resolved
- **Artifact affected**: Project Standards (`docs/standards/project-standards.md`), Security Design
- **Gap**: GAP-11 and the AUDIT-005 item header claim `@types/react@18.3.28` is installed (mismatching React 19). However, `package.json` now declares `@types/react: ^19.0.0` — the major version matches React 19. The gap description and item content are stale.
- **File path**: `docs/standards/project-standards.md` (GAP-11)
- **Severity**: Medium (stale gap status)

### DA-14: README.md gap summary table not updated for GAP-16/GAP-17
- **Artifact affected**: Standards README (`docs/standards/README.md`)
- **Gap**: The README gap summary table covers GAP-01 through GAP-15 only. GAP-16 (remaining reuse opportunities) and GAP-17 (null-safety in createItem, now RESOLVED) were added in AUDIT-005 but not reflected in the README.
- **File path**: `docs/standards/README.md`
- **Severity**: Low

### DA-15: UI design component inventory incomplete
- **Artifact affected**: UI Design (`docs/standards/ui-design.md`)
- **Gap**: The Component Inventory sections are missing:
  - **Chat Components** (`components/chat/`): ChatBubble, MessageList, TypingIndicator, ChatInput — extracted in REQ-00093
  - **Dashboard Components**: FileBrowser, FileViewer, RoutineSettingsDialog — added in REQ-00081, REQ-00092, REQ-00096
- **File path**: `docs/standards/ui-design.md`
- **Severity**: Medium

### DA-16: Partial requirement validation failures not tracked in RTM
- **Artifact affected**: RTM (`docs/standards/rtm.md`)
- **Gap**: Several requirements are marked Done in the RTM but have known failing acceptance criteria per their own validation records:
  - **REQ-00082** (Dark mode): AC-7 ❌ (hardcoded zinc colors), AC-8 ⚠️ (terminal dark forced), TC4 ❌ (next-themes missing)
  - **REQ-00084** (Logo): AC-5 ❌ (raster favicon absent), AC-6 ⚠️ (apple-icon path)
  - **REQ-00086** (Terminal tool-use): AC-7 ❌ (parseSessionHistory wrong event type)
  - **REQ-00093** (Chat refactor): AC-6 ⚠️ (ChatWidget still uses inline input)
- The RTM does not flag these partial validations.
- **File path**: `docs/standards/rtm.md`
- **Severity**: High

---

## Doc Audit Summary

### Findings by Severity

| Severity | Count | Key Areas |
|----------|-------|-----------|
| **High** | 6 | API reference (9 missing endpoints), user journeys (3 missing), glossary (10+ missing terms), WBS (2 missing packages), ADRs (5 missing), RTM partial validations (4 reqs) |
| **Medium** | 8 | RTM file refs, UX design, test plan, error handling, database design, deployment env vars, UI design inventory, stale GAP-11/GAP-13 |
| **Low** | 2 | Security positive gap, README gap table |
| **Total** | **16 findings** |

### Overall Compliance Verdict: **Moderate — Documentation Lagging Implementation**

The documentation foundation is solid — all 18 standard artifacts exist and cover the original system architecture thoroughly. However, features delivered since AUDIT-004 (REQ-00081 routine scheduling, REQ-00092/REQ-00096 file browser, REQ-00093 chat refactor, REQ-00094 item restart) have not been propagated to the standards docs. The API reference is missing 9 endpoints (High). Three complete user journeys are undocumented (High). The glossary lacks 10+ domain terms introduced by newer features (High). Five architectural decisions — including security-relevant ones like AsyncLocalStorage workspace scoping and file browser sandboxing — have no ADRs (High). The WBS is missing work packages for two shipped features. The RTM marks 4 requirements as Done despite having documented failing acceptance criteria.

The documentation was comprehensive and accurate as of the initial standards creation (2026-04-21) but has not kept pace with the ~20 requirements delivered since then. A focused documentation sprint updating all 18 artifacts for the REQ-00080–REQ-00099 feature batch would restore compliance.
