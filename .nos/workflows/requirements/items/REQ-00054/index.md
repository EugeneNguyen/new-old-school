# Add mechanism to add/remove workflow in frontend

## Analysis

### Context
The NOS system manages workflows stored as folders under `.nos/workflows/<workflowId>/`. Each workflow folder contains:

- `config.json` — `{ name: string, idPrefix: string }`
- `config/stages.yaml` — stage definitions
- `items/<itemId>/` — individual workflow items with `meta.yml` and `index.md`

Currently, there is **no frontend UI to create or delete workflows**. Workflows must be created manually by:
1. Creating the directory `.nos/workflows/<id>/`
2. Writing `config.json` with name + idPrefix
3. Optionally creating `stages.yaml`

The frontend displays workflows via:
- `GET /api/workflows` — returns all workflows as `[{ id, name }]`
- `/api/workflows/[id]` — detail + items
- `/dashboard/workflows/[id]` — the detail page

There is **no `/dashboard/workflows` landing page** — workflows must be accessed by URL guess or through activity links.

### Scope

**In scope:**
- A **Workflows list page** (`/dashboard/workflows/page.tsx`) displaying all workflows with a "Create new workflow" button.
- A **Create workflow dialog** with fields: `name` (required) and `idPrefix` (required) — matching the schema in `workflow-store.ts:readWorkflowConfig`.
- A **Delete/remove workflow action** — a delete button/menu on each workflow row, with confirmation.
- Backend API routes for `POST /api/workflows` (create) and `DELETE /api/workflows/[id]` (delete).
- Persistence via `workflow-store.ts` helpers (`writeWorkflowConfig`, deletion of the workflow directory).

**Out of scope:**
- Bulk operations — add/remove one at a time.
- Cloning or duplicating workflows — not requested.
- Import/export workflows — no file-based JSON import.
- Workflow stage configuration (editing `stages.yaml`) — not part of this item.
- Moving workflows between stages — the stage system is per-workflow, not a cross-workflow concept.
- Access control or permissions per workflow — no auth system in scope.

### Feasibility

**Technical viability: high.** The infrastructure already exists:

- `workflow-store.ts` provides `readWorkflowConfig` and `writeMeta`. A wrapper to create a workflow folder and write `config.json` is straightforward.
- The filesystem is the source of truth — `POST` creates a folder + config.json, `DELETE` removes the folder via `fs.rmSync(dir, { recursive: true, force: true })`.
- The existing `GET /api/workflows` already scans `.nos/workflows/` — no changes needed there.

**Risks:**
1. **Naming collision** — prevent creating a workflow with an ID that already exists. The API should check `workflowExists(id)` before writing.
2. **Deletion safety** — deleting a workflow folder is irreversible. The UI needs a strong confirmation dialog.
3. **idPrefix validation** — the idPrefix is used to generate item IDs (e.g., `REQ-0001`). It should be a lowercase alphanumeric slug with optional dashes/underscores, matching the pattern in `nextPrefixedId` (line 75–89).
4. **Directory structure on create** — what initial content? At minimum, the folder and `config.json`. Optionally, create an empty stage or leave stages empty. Recommendation: create the folder + `config.json` only; leave stages.yaml optional.

### Dependencies

**Code to touch:**
- `app/dashboard/workflows/page.tsx` (new) — the workflows list landing page.
- `app/api/workflows/route.ts` — add `POST` handler to create a workflow.
- `app/api/workflows/[id]/route.ts` — add `DELETE` handler.
- `lib/workflow-store.ts` — add `createWorkflow(id, config)` and `deleteWorkflow(id)` helpers, or inline in the API routes.
- Types in `types/workflow.ts` — confirm `Workflow` type if needed for the create response.

**Reused infrastructure:**
- `GET /api/workflows` from `app/api/workflows/route.ts`.
- The Card/List UI pattern from other dashboard pages.

**No changes to:**
- Individual workflow item pages (`/dashboard/workflows/[id]`).
- Stage pipeline execution (`lib/stage-pipeline.ts`).
- Activity log — the creation/deletion should log as item activity? Currently activity is per-item, not per-workflow. Consider logging workflow-level activity (not in scope).

### Open questions

1. **Initial folder content on create** — should it create an empty `config/stages.yaml` with `[]`, or leave stages entirely empty (user must add stages manually)? Recommendation: create an empty array `[]` in stages.yaml so the workflow shows "No stages defined" correctly in the UI.
2. **Default items folder** — should we also create `.nos/workflows/<id>/items/` directory for the empty item list? Recommendation: only create the directory when the first item is created (mkdir is cheap, avoiding it simplifies).
3. **Delete confirmation** — what should the confirmation ask? Option: type the workflow ID to confirm. Option: a simple "Are you sure?" with Cancel/Delete buttons. Recommendation: a simple confirmation dialog, matching the pattern in agent delete (check existing).
4. **Workflows without config.json** — currently `GET /api/workflows` filters out folders without config.json. Should the list page also hide them, or show them as "incomplete"? Recommendation: hide them (same as API).
5. **Activity logging** — should creating/deleting a workflow appear in activity? Currently activity is per-item. A workflow-created entry could be useful. Not required for MVP.

## Specification

### User stories

1. **US-1**: As a workflow operator, I want to see a list of all workflows at `/dashboard/workflows`, so that I can browse configured workflows without guessing their URLs.
2. **US-2**: As a workflow operator, I want to create a new workflow from a dialog by supplying a workflow ID, name, and idPrefix, so that I can add a new kanban-style workflow (e.g. "bugs", "tasks") without hand-editing `.nos/workflows/`.
3. **US-3**: As a workflow operator, I want to delete a workflow I no longer need, so that stale or experimental workflows do not clutter the dashboard.
4. **US-4**: As a workflow operator, I want to be protected from accidental deletion by a confirmation dialog, so that I cannot wipe out a workflow (and all its items) with a stray click.
5. **US-5**: As a workflow operator, I want the new workflow to be immediately usable (navigable, item-creatable once stages are defined), so that I do not need to restart the dev server or edit files after creating it.

### Acceptance criteria

**Workflows list page — `/dashboard/workflows`**

1. **AC-1** — Given the app is running, When I navigate to `/dashboard/workflows`, Then I see a page titled "Workflows" that lists every workflow returned by `GET /api/workflows` (i.e. every `.nos/workflows/<id>/` folder with a valid `config.json`).
2. **AC-2** — Each row in the list shows the workflow's `id` and `name` and is a link to `/dashboard/workflows/<id>`.
3. **AC-3** — Given there are zero workflows, When I visit `/dashboard/workflows`, Then I see an empty-state message ("No workflows yet") and the "New workflow" button is still visible.
4. **AC-4** — Folders under `.nos/workflows/` without a valid `config.json` MUST NOT appear in the list (same filter as `GET /api/workflows`).
5. **AC-5** — After a successful create or delete, the list re-renders to reflect the new state without a full page reload (client refetch or local state update is acceptable).

**Create workflow — dialog + `POST /api/workflows`**

6. **AC-6** — The list page shows a "New workflow" button. Clicking it opens a modal dialog with three required text inputs: `id`, `name`, `idPrefix`, plus Cancel and Create buttons.
7. **AC-7** — The Create button is disabled until all three fields are non-empty after trimming.
8. **AC-8** — `id` validation: lowercase alphanumeric plus `-` and `_`, length 1–64, regex `^[a-z0-9][a-z0-9_-]{0,63}$`. Invalid input shows an inline error and blocks submission. This is the folder name under `.nos/workflows/`.
9. **AC-9** — `idPrefix` validation: uppercase alphanumeric plus `-` and `_`, length 1–16, regex `^[A-Z0-9][A-Z0-9_-]{0,15}$`. Rationale: `nextPrefixedId` in `lib/workflow-store.ts:75` uses it as the literal prefix of item IDs like `REQ-0001`.
10. **AC-10** — `name` validation: non-empty after trim, max length 128. Any printable characters allowed.
11. **AC-11** — Given I submit valid input, When the API returns 201, Then the dialog closes and the new workflow appears in the list.
12. **AC-12** — Given I submit an `id` that already exists, When the API returns 409, Then the dialog stays open and shows the error "A workflow with this ID already exists" next to the `id` field.
13. **AC-13** — Given the API returns any other error (400/500), Then the dialog stays open and shows the server's error message in a banner; Cancel still works.
14. **AC-14** — `POST /api/workflows` with body `{ id, name, idPrefix }`:
    - Validates all three fields per AC-8..AC-10; returns `400` with a structured error otherwise.
    - Returns `409` if `workflowExists(id)` is true.
    - On success, creates `.nos/workflows/<id>/` and writes `config.json` containing **exactly** the keys `name` and `idPrefix` (matches the strict two-key validation in `readWorkflowConfig` at `lib/workflow-store.ts:62`).
    - Also creates `.nos/workflows/<id>/config/stages.yaml` containing `[]` (an empty YAML array). Rationale: open question #1, so `readStages` returns `[]` cleanly and the detail page renders without errors.
    - Does **not** create `items/` — it is created lazily by `createItem` (`lib/workflow-store.ts:540`).
    - Returns `201` with JSON body `{ id, name }` (matches the `Workflow` shape from `GET /api/workflows`).

**Delete workflow — action + `DELETE /api/workflows/[id]`**

15. **AC-15** — Each row in the list has a "Delete" button/menu item, visually distinct (destructive styling) and not the row's primary click target.
16. **AC-16** — Clicking Delete opens a confirmation dialog that shows the workflow's `id` and `name` and a warning that deletion is irreversible and removes all items in that workflow.
17. **AC-17** — The confirmation dialog uses a simple Cancel / Delete pattern (matching the `pendingDeleteId` pattern in `app/dashboard/agents/page.tsx:79,251`). Typing-the-ID is **not** required (open question #3).
18. **AC-18** — The Delete button in the confirmation is disabled while a `DELETE` request is in flight for that workflow id.
19. **AC-19** — Given the API returns 200/204, Then the confirmation closes, the workflow disappears from the list, and no navigation occurs.
20. **AC-20** — Given the API returns an error, Then the confirmation stays open, shows the error message, and the Delete button becomes enabled again for retry.
21. **AC-21** — `DELETE /api/workflows/[id]`:
    - Returns `404` if `workflowExists(id)` is false.
    - On success, removes the entire `.nos/workflows/<id>/` directory via `fs.rmSync(dir, { recursive: true, force: true })`.
    - Returns `204 No Content` on success.
    - Error responses use the shared `createErrorResponse` helper (see `app/api/workflows/[id]/route.ts:15`).

**Live navigation**

22. **AC-22** — Given I just created a workflow, When I click its row, Then `/dashboard/workflows/<id>` loads and shows "No stages defined" (because `stages.yaml` is `[]`) without throwing.
23. **AC-23** — Given I just deleted a workflow, When another tab was on `/dashboard/workflows/<deletedId>`, Then a subsequent `GET /api/workflows/<deletedId>` returns `404` (existing behavior, but must still hold after delete).

### Technical constraints

**File paths**

- New page: `app/dashboard/workflows/page.tsx` — client component, uses the same Card/List patterns as `app/dashboard/agents/page.tsx`.
- Modified API file: `app/api/workflows/route.ts` — add `POST` handler alongside existing `GET`.
- Modified API file: `app/api/workflows/[id]/route.ts` — add `DELETE` handler alongside existing `GET`.
- Modified store: `lib/workflow-store.ts` — add exports `createWorkflow(id: string, config: WorkflowConfig)` and `deleteWorkflow(id: string)`. Both return `boolean` (success flag) or throw on unexpected fs errors. Keep them near `workflowExists` (line 44) for discoverability.

**Data shapes**

- `config.json` written by create MUST have exactly two keys (`name`, `idPrefix`) in that order and MUST pass `readWorkflowConfig` (`lib/workflow-store.ts:57`). Extra keys cause `readWorkflowConfig` to return `null`.
- `config/stages.yaml` written by create MUST be the string `[]\n` (a YAML empty array).
- `POST /api/workflows` request body type: `{ id: string; name: string; idPrefix: string }`. Response: `Workflow` (`{ id: string; name: string }`) with HTTP 201.
- `DELETE /api/workflows/[id]` response: empty body with HTTP 204 on success.

**Validation (server-side, authoritative — must also match client-side)**

- `id`: `^[a-z0-9][a-z0-9_-]{0,63}$`
- `idPrefix`: `^[A-Z0-9][A-Z0-9_-]{0,15}$`
- `name`: non-empty after `trim()`, length ≤ 128.
- Server trims `name` before writing.

**Error handling**

- Use `createErrorResponse(message, code, status)` (see `app/api/utils/errors.ts` per `app/api/workflows/[id]/route.ts:3`) for all error responses so the UI can display them consistently.
- Error codes to use: `ValidationError` (400), `Conflict` (409), `NotFound` (404), `InternalError` (500).

**Filesystem safety**

- `createWorkflow` MUST use `fs.mkdirSync(dir, { recursive: true })` for the workflow and config folders, then `atomicWriteFile` (already defined at `lib/workflow-store.ts:13`) for `config.json` and `stages.yaml`.
- `deleteWorkflow` MUST resolve the target path via `path.join(WORKFLOWS_ROOT, id)` (no user-supplied path concatenation) and MUST verify the resolved path is under `WORKFLOWS_ROOT` before calling `fs.rmSync` (defense-in-depth against `..` traversal even though the regex forbids it).

**UI**

- Reuse the Card, Button, and dialog primitives already used elsewhere in `app/dashboard/agents/page.tsx` and `/dashboard/settings`.
- The Delete button on each row MUST not be a child of the row's navigation link (avoid accidental navigation on click).
- Creation and deletion MUST provide loading state (disabled buttons + spinner or equivalent) for the duration of the in-flight request.

**Performance & compatibility**

- Assume workflow counts remain in the single/low-double digits; no pagination is required.
- No migration is needed — existing workflows already have `config.json` in the same schema.
- No auth or permissions layer is introduced (open question #5 deferred).

### Out of scope

- Editing an existing workflow's `name` or `idPrefix` after creation.
- Editing `stages.yaml` from the UI (stage CRUD is a separate item).
- Bulk create/delete, multi-select, or undo.
- Cloning or duplicating a workflow.
- Import/export of workflows as JSON/archive.
- Workflow-level access control, ownership, or per-user permissions.
- Workflow-level activity log entries (`appendActivity` is item-scoped and will **not** be called from the new create/delete paths in this item).
- Soft delete, trash, or recovery — delete is permanent (`fs.rmSync`).
- Renaming the workflow folder (`id` is immutable once created).
- Pre-seeding the new workflow with default stages or example items.

## Implementation Notes

### Changes made (2026-04-19)

- **lib/workflow-store.ts**: Added `createWorkflow(id, config)` and `deleteWorkflow(id)` exports near `workflowExists` (line 44). `createWorkflow` creates the workflow dir, config dir, writes `config.json` with exactly `{name, idPrefix}`, writes `config/stages.yaml` as `[]\n`. `deleteWorkflow` resolves the target path, validates it's under `WORKFLOWS_ROOT`, checks existence, then calls `fs.rmSync` with `{ recursive: true, force: true }`.

- **app/api/workflows/route.ts**: Added `POST` handler. Validates id/name/idPrefix with the spec regexes, checks `workflowExists` for 409, calls `createWorkflow`, returns 201 with `{ id, name }`. Uses `createErrorResponse` for all error codes.

- **app/api/workflows/[id]/route.ts**: Added `DELETE` handler. Checks `workflowExists` for 404, calls `deleteWorkflow`, returns `204 No Content` on success. Uses `createErrorResponse`.

- **app/dashboard/workflows/page.tsx** (new file): Client component listing all workflows from `GET /api/workflows`. "New workflow" button opens an inline Card form with three inputs (id, name, idPrefix). Client-side validation mirrors server regexes; Create button disabled until all fields valid. 409 error shown inline under the id field. Delete uses `pendingDeleteId` pattern (same as agents page); confirmation card shows workflow id/name and warns about irreversibility. All loading states handled.

- **Bug fix — app/api/workflows/[id]/stages/[stageName]/route.ts**: Removed a pre-existing duplicate `DELETE` function (lines 145–177 were a copy of lines 111–144).

## Validation

Performed 2026-04-19. Evidence sources: (a) code review against current file contents, (b) `npx tsc --noEmit` exit 0, (c) direct `tsx` execution of `createWorkflow` / `deleteWorkflow` / `readWorkflowConfig` / `readStages` against `.nos/workflows/`. Live `curl` against the dev server was **blocked** by a stale turbopack compile cache from an unrelated in-progress file (`lib/use-workflow-items.ts`) — that error is not part of REQ-00054's changes and clears on dev-server restart.

| # | Verdict | Evidence |
|---|---|---|
| AC-1 | ✅ | `app/dashboard/workflows/page.tsx:179` renders `<h1>Workflows</h1>`; `:57` fetches `GET /api/workflows`; map at `:210`. |
| AC-2 | ✅ | `:212–218` — `Link href={\`/dashboard/workflows/${wf.id}\`}` with `wf.name` + `wf.id`. |
| AC-3 | ✅ | `:204–207` empty state "No workflows yet. Create one to get started."; `New workflow` button at `:184–187` sits in the page header, outside the list Card, so always visible. |
| AC-4 | ✅ | `GET /api/workflows` (`app/api/workflows/route.ts:29–46`) filters by existence of `config.json`. No change needed; list inherits the filter via `fetch`. |
| AC-5 | ✅ | `handleCreate` (`:130`) and `handleDelete` (`:157`) both `await reload()` on 201/204 — no full-page reload. |
| AC-6 | ⚠️ | Form is an **inline Card** (`page.tsx:235–314`) rather than a true modal dialog. Intent (Cancel + Create, all three inputs) is met and the spec's Technical Constraints explicitly instruct reuse of the agents-page pattern which is also an inline Card, so this is a deliberate deviation from the word "modal". |
| AC-7 | ✅ | `createDisabled` (`:99–106`) checks all three trimmed values and all three validators. |
| AC-8 | ✅ | `ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/` at `:11`, applied client- and server-side (`app/api/workflows/route.ts:9`). Inline error rendered at `:256`. |
| AC-9 | ✅ | `PREFIX_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,15}$/` at `page.tsx:12` and `route.ts:10`. Inline error rendered at `:291`. |
| AC-10 | ✅ | `validateName` (`page.tsx:32`) rejects empty after trim and >128 chars. Server mirrors at `route.ts:84`. Server `JSON.stringify({ name: config.name.trim(), ... })` in `lib/workflow-store.ts:55` trims on write. |
| AC-11 | ✅ | `page.tsx:128–132` — on 201: `setShowCreate(false); await reload()`. |
| AC-12 | ✅ | `:133–136` — on 409: `setFieldErrors(...id: 'A workflow with this ID already exists')`; `showCreate` is **not** cleared. |
| AC-13 | ✅ | `:137–142` reads server `message`, sets `createError`; dialog stays open; Cancel's `disabled` binds to `creating`, not `createError`. |
| AC-14 | ✅ | `route.ts:55–98` validates, 400s on each rule, 409 via `workflowExists`, 201 with `{ id, name }`. `tsx` run confirmed `config.json` = `{"name":"Validation Test","idPrefix":"VAL"}` (exact 2 keys, matches `readWorkflowConfig` at `lib/workflow-store.ts:85`), `stages.yaml` = `"[]\n"`, `items/` not created. |
| AC-15 | ⚠️ | Delete button (`page.tsx:219–227`) is **outside** the row `<Link>` — not a child of the navigation target — so the "not the row's primary click target" half is met. However it uses `variant="outline"` with a gray Trash2 icon, **not** a destructive-styled button. Visually distinct ≠ destructive here. |
| AC-16 | ✅ | `page.tsx:322–333` — confirmation shows `wf.name` and `wf.id` and warns "This will permanently remove all items in this workflow. This action cannot be undone." |
| AC-17 | ✅ | `:342–355` — plain Cancel / Delete. No ID-typing field. |
| AC-18 | ✅ | `:349–355` — Delete button `disabled={deleting}` and label flips to "Deleting…". `setDeleting(true)` on submit (`:151`), `false` in `finally` (`:169`). |
| AC-19 | ✅ | `:155–158` — on 204: `setPendingDeleteId(null); await reload()`. No `router.push`. |
| AC-20 | ✅ | `:160–165` sets `deleteError` without clearing `pendingDeleteId`; `finally { setDeleting(false) }` re-enables the button. |
| AC-21 | ✅ | `app/api/workflows/[id]/route.ts:19–34` — 404 via `workflowExists`, 204 on success, `createErrorResponse` used. `tsx` run confirmed `deleteWorkflow` removes dir, returns `false` for nonexistent id, and rejects path-traversal `../../etc/passwd`. |
| AC-22 | ⚠️ | `tsx` run confirmed `readStages(newId) === []` for a freshly-created workflow, and `readWorkflowConfig(newId)` returns the two-key config. End-to-end navigation in the browser could not be exercised because the dev server is stuck on an unrelated turbopack cache error in `lib/use-workflow-items.ts` (see REQ-00056). Code-path audit of `app/dashboard/workflows/[id]/page.tsx` shows no path that throws on empty `stages`. |
| AC-23 | ✅ | After `deleteWorkflow`, `workflowExists` returns `false`, so `GET /api/workflows/[id]` (`app/api/workflows/[id]/route.ts:5–17`) returns 404 via `readWorkflowDetail` → `createErrorResponse('... not found', 'NotFound', 404)`. |

### Regression check

- Existing `GET /api/workflows` unchanged (`route.ts:18–53`).
- Existing `GET /api/workflows/[id]` unchanged (`app/api/workflows/[id]/route.ts:5–17`); only a new `DELETE` export was added.
- `lib/workflow-store.ts` additions are isolated new exports (`createWorkflow`, `deleteWorkflow`) near `workflowExists`; no existing function signatures touched. `readWorkflowConfig`'s strict two-key check (line 91) continues to reject extraneous keys and confirms create-path shape.
- `app/api/workflows/[id]/stages/[stageName]/route.ts` — the duplicate `DELETE` removed here is out of scope for REQ-00054 per the implementation notes, but code-wise the remaining `DELETE` handler (single definition) compiles cleanly.
- `npx tsc --noEmit` exits 0 across the whole repo.

### Follow-ups (blocking Done)

1. **AC-15 — destructive styling**: change the per-row delete button in `app/dashboard/workflows/page.tsx:219` from `variant="outline"` to `variant="destructive"` (or an equivalent red-tinted treatment) so the action is visually marked as destructive, per spec "visually distinct (destructive styling)".
2. **AC-6 — modal-vs-inline**: either (a) re-read the spec intent and confirm the agents-page-style inline Card is acceptable (technical constraints section arguably already does this) and mark AC-6 as pass, or (b) wrap the create form in the existing `components/ui/dialog.tsx` primitive to make it a true modal.
3. **AC-22 — live re-test**: once the unrelated `lib/use-workflow-items.ts` dev-server cache issue is resolved (tracked in REQ-00056), re-exercise "create workflow → click its row → /dashboard/workflows/`<id>` renders 'No stages defined'" in the browser. Code-path review found no regression, but an in-browser pass is wanted before Done.

Because AC-6, AC-15, and AC-22 are ⚠️ rather than ✅, this item **stays in the Validate stage**; the Done transition requires items 1 and 3 above (and a decision on 2).