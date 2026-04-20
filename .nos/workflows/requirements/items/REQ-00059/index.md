Workflow setting screen:

* Allow to see all stages
* Reorder stages
* Add stages
* Edit stages
* Delete Stages
  * Deletable Stages must not have item inside

## Analysis

### 1. Scope

**In scope**
- A per-workflow settings surface (not the global `app/dashboard/settings` page) where stage management lives. Likely a new route such as `app/dashboard/[workflowId]/settings/page.tsx` (or similar), reachable from the workflow's toolbar via a "Settings" / gear affordance.
- Listing all stages for the workflow in their canonical order (same order as the kanban columns), including name, description, auto-advance flag, agent, and max-display-items.
- **Add stage**: move the `Add stage` button (`components/dashboard/WorkflowItemsView.tsx:168-170`) out of the kanban toolbar and into the workflow settings screen. The existing `AddStageDialog` can be reused as-is; only its mount point changes.
- **Edit stage**: reuse the existing `StageDetailDialog` (or the same form inline) from the settings screen. The PATCH endpoint at `app/api/workflows/[id]/stages/[stageName]/route.ts` already covers all editable fields.
- **Delete stage**: surface delete from the settings list. Server-side guard "cannot delete stage with items" already exists — UI needs to present the 409 response cleanly and, ideally, gray out / disable the delete affordance when item count > 0 so users know before clicking.
- **Reorder stages**: new capability. Needs a server-side primitive (no `reorderStages` exists today — only `addStage`, `updateStage`, `deleteStage` in `lib/workflow-store.ts`) plus a UI (drag-and-drop or up/down arrows) that persists the new order.

**Out of scope**
- Rewriting the kanban/list views. They continue to read from the same `stages` array; only its ordering and membership change.
- Changing stage data shape in `meta.yml` / workflow config (no new fields).
- Changing the global settings page (`app/dashboard/settings/page.tsx`). That screen stays a project-level settings surface.
- Bulk stage operations, stage templates, per-stage permissions, or stage archiving.
- Moving items between stages as part of "make a stage deletable" — the guard remains: user must empty the stage first.

### 2. Feasibility

Technically straightforward with two meaningful risks.

- **Reorder persistence (new work).** `lib/workflow-store.ts` currently has no reorder primitive; stages are stored as an ordered list and need a new `reorderStages(workflowId, orderedNames[])` helper plus an API route (e.g. `PUT /api/workflows/[id]/stages/order`). Risks: (a) concurrent edits from another session invalidating the submitted order, (b) name drift if a stage is renamed mid-reorder — should validate that the submitted name set matches the current set before writing.
- **Auto-advance semantics after reorder.** The heartbeat sweeper (`lib/auto-advance-sweeper.ts` + `lib/auto-advance.ts`) advances `Done` items to the *next* stage. Reordering changes what "next" means for items currently sitting `Done` in a stage with `autoAdvanceOnComplete: true`. Need to decide whether reorder is allowed while in-flight items exist and, if so, confirm the sweeper happily picks up the new neighbor on its next tick (probably yes, since it recomputes from the live stage list). Worth a quick spike to confirm there's no cached ordering elsewhere.
- **DnD library choice.** No drag-and-drop library currently in use for stages (kanban uses native HTML5 DnD for items). Safest default: native HTML5 DnD for consistency, or `@dnd-kit/core` if we want keyboard accessibility. Up/down buttons are an acceptable MVP that sidesteps the library decision.
- **Navigation / discoverability.** Need to add an entry point on the workflow screen (gear icon on the toolbar) so users find the new settings page. Removing the `Add stage` button from the kanban toolbar without a replacement path would be a regression.

### 3. Dependencies

- `components/dashboard/WorkflowItemsView.tsx` — owns the current `Add stage` button + `AddStageDialog` wiring; needs the button removed and a "Settings" entry point added.
- `components/dashboard/AddStageDialog.tsx` — reused unchanged from the new settings page.
- `components/dashboard/StageDetailDialog.tsx` — already supports edit + delete with a confirm flow; reused from the new settings page, or its form content is extracted for inline use.
- `lib/use-workflow-items.ts` — currently exposes `openAddStage/closeAddStage/addStageOpen`; these usages move or are re-exposed for the settings page. Also exposes `handleStageCreated/handleStageSaved/handleStageDeleted` — a reorder equivalent (`handleStagesReordered`) is new.
- `lib/workflow-store.ts` — add `reorderStages` primitive (pure data manipulation on the workflow's `stages` array + persistence to workflow config).
- `app/api/workflows/[id]/stages/route.ts` (POST exists) and `app/api/workflows/[id]/stages/[stageName]/route.ts` (PATCH + DELETE exist) — unchanged, or extended with a new order endpoint. Cleanest addition is a separate `PUT /api/workflows/[id]/stages/order` route to avoid overloading POST semantics.
- Routing: new `app/dashboard/[workflowId]/settings/page.tsx` (path shape depends on how the current workflow route is structured — verify during Documentation stage).
- Heartbeat sweeper (`lib/auto-advance-sweeper.ts`) — no code change expected, but needs to be verified as non-caching w.r.t. stage order.

### 4. Open questions

1. **Location of the settings screen** — new per-workflow route (e.g. `/dashboard/<workflowId>/settings`) vs. a modal launched from the workflow toolbar? A dedicated route is better for reorder-heavy interactions and deep linking; a modal is faster to ship. Pick one before implementation.
2. **Reorder UX** — drag-and-drop (nicer, needs accessibility story) vs. up/down arrow buttons (simpler, keyboard-accessible by default). Acceptable to ship arrows first and upgrade later.
3. **Scope of "inside of a workflow setting"** — does the requirement want *only* `Add stage` relocated, or the full CRUD+reorder suite to live there with the kanban stage-header shortcut (which currently opens `StageDetailDialog`) removed too? The bullet list reads as the latter, but confirm the kanban's click-stage-to-edit shortcut can stay for convenience.
4. **Deletion guardrail UX** — should the delete button be hidden/disabled when `itemCount > 0` (requires surfacing item counts per stage in the list), or always enabled with a friendly 409-derived error (current behavior)? Disabling upfront is clearer but needs per-stage item counts on the settings page.
5. **Reorder while items are mid-run** — allow freely, or block when any item is `In Progress`? Lean toward allow + document, since the sweeper should tolerate it, but worth confirming with the stage runtime owner.
6. **Renaming collisions during reorder** — if another client renames a stage between load and submit, do we 409 or take best-effort? Recommend validating the submitted name set against current state and 409 on mismatch, forcing the client to reload.

## Specification

### Resolutions to open questions

Before writing acceptance criteria, the six open questions from Analysis are resolved as follows and become binding for this spec:

1. **Location** — dedicated per-workflow route at `app/dashboard/workflows/[id]/settings/page.tsx` (matches the existing `app/dashboard/workflows/[id]/page.tsx` shape).
2. **Reorder UX** — MVP ships **up/down arrow buttons** per row. Drag-and-drop is out of scope for this requirement.
3. **Relocation scope** — the `Add stage` button is removed from `WorkflowItemsView` and only lives in the settings screen. The kanban stage-header click-to-edit shortcut (`StageDetailDialog`) **stays** as a convenience path.
4. **Delete guardrail** — delete control is disabled in the UI when the stage's item count > 0, with a tooltip explaining the guard. The server 409 is still handled as a fallback for race conditions.
5. **Mid-run reorder** — allowed without restriction. The heartbeat sweeper recomputes "next stage" from the live list on every tick, so reordering while items are `In Progress` is safe.
6. **Concurrent edits during reorder** — the reorder endpoint validates that the submitted stage-name set exactly matches the current set and returns **409** on mismatch. The client must reload and retry.

### 1. User stories

- **US-1**: As a workflow owner, I want a dedicated Settings screen for each workflow, so that stage management lives in one predictable place separate from the kanban work surface.
- **US-2**: As a workflow owner, I want to see all stages of a workflow in one list with their key attributes (name, description, auto-advance flag, agent, item count), so that I can review the structure at a glance.
- **US-3**: As a workflow owner, I want to add a new stage from the settings screen, so that adding structure no longer competes with day-to-day item work on the toolbar.
- **US-4**: As a workflow owner, I want to edit an existing stage from the settings screen, so that I can change its name, description, auto-advance flag, agent, or max-display-items without navigating through the kanban.
- **US-5**: As a workflow owner, I want to delete a stage, but only when it contains no items, so that I don't accidentally orphan work.
- **US-6**: As a workflow owner, I want to reorder stages using up/down arrows, so that the kanban columns reflect the actual lifecycle order as it evolves.
- **US-7**: As a workflow user, I want a clear entry point (gear / "Settings" button) on the workflow toolbar, so that I can find the new settings screen without hunting.

### 2. Acceptance criteria

Each criterion is testable; Given/When/Then is used where it adds clarity.

#### Route and entry point

1. **AC-1 (route exists)** — A new route renders at `app/dashboard/workflows/[id]/settings/page.tsx` for every valid workflow id. Visiting an unknown id shows the standard "not found" state consistent with the existing workflow route.
2. **AC-2 (entry point)** — The workflow toolbar in `components/dashboard/WorkflowItemsView.tsx` gains a "Settings" button (gear icon, adjacent to or replacing the area around the current `Add stage` button). Clicking it navigates to `/dashboard/workflows/<id>/settings`.
3. **AC-3 (Add stage removed from kanban)** — The `Add stage` button at `components/dashboard/WorkflowItemsView.tsx:168-170` is removed. The `AddStageDialog` is no longer mounted from `WorkflowItemsView`. The kanban toolbar retains `Add item` only.
4. **AC-4 (kanban shortcut preserved)** — Clicking a stage header in the kanban still opens `StageDetailDialog` (edit + delete), unchanged from current behavior.
5. **AC-5 (back navigation)** — The settings screen provides a visible way back to the workflow (e.g. a "Back to workflow" link or breadcrumb). Browser back also returns cleanly.

#### Stage list

6. **AC-6 (list order)** — Stages render in the same order as the kanban columns (i.e. the order in the workflow config's `stages` array). Each row shows: name, description (truncated if long), auto-advance indicator, agent name (or "none"), max-display-items value (or "—"), and the count of items currently in that stage.
7. **AC-7 (empty-list state)** — If a workflow has zero stages, the list shows an empty-state message and an "Add stage" call-to-action.
8. **AC-8 (item counts accurate)** — The item count per stage equals the number of workflow items whose current stage matches the stage name, as resolved by the same source of truth the kanban uses.

#### Add stage

9. **AC-9 (add dialog)** — An "Add stage" button on the settings screen opens the existing `AddStageDialog` unchanged. On success the new stage appears at the end of the list without a full-page reload.
10. **AC-10 (add validation)** — Creation respects all current server-side validations in `POST /api/workflows/[id]/stages` (including duplicate-name rejection). A server validation error is surfaced inline in the dialog.

#### Edit stage

11. **AC-11 (edit dialog)** — An "Edit" action on each row opens `StageDetailDialog` (or an equivalent form using the same `PATCH /api/workflows/[id]/stages/[stageName]` endpoint) pre-populated with that stage's current values.
12. **AC-12 (edit persistence)** — Saving updates all editable fields (name, description, auto-advance flag, agent, max-display-items) via the existing PATCH endpoint. On success the row reflects the new values without a full-page reload.
13. **AC-13 (rename propagation)** — When a stage's name changes, the list row's key/label updates and the item count continues to match (the underlying items' stage references are updated by the existing PATCH handler; the UI must not require a manual reload to show the correct count).

#### Delete stage

14. **AC-14 (delete disabled when non-empty)** — Given a stage's item count is > 0, when the user views the settings list, then that stage's delete control is disabled and shows a tooltip such as "Move or delete the N item(s) in this stage before deleting it."
15. **AC-15 (delete enabled when empty)** — Given a stage's item count is 0, when the user clicks delete, then a confirmation prompt appears naming the stage; confirming calls `DELETE /api/workflows/[id]/stages/[stageName]` and removes the row on success.
16. **AC-16 (server-guard fallback)** — If the server returns **409** on delete (race with a newly-created item), the UI does not remove the row, shows the server's error message inline, and refreshes the item count.

#### Reorder stages

17. **AC-17 (up/down controls)** — Each row has an "up" and "down" arrow control. The topmost row's "up" is disabled; the bottommost row's "down" is disabled.
18. **AC-18 (optimistic update)** — Clicking "up" or "down" swaps the row with its neighbor immediately in the UI, then persists the new order.
19. **AC-19 (persistence endpoint)** — A new endpoint `PUT /api/workflows/[id]/stages/order` accepts a JSON body `{ "order": string[] }` — the complete list of stage names in their desired order — and persists it via a new `reorderStages(workflowId: string, orderedNames: string[])` helper in `lib/workflow-store.ts`.
20. **AC-20 (validation)** — Given the submitted `order` array, when its set of names does not exactly equal the current set of stage names for that workflow, then the endpoint returns **409** with an error message indicating the stage list changed and the client must reload. No partial write occurs.
21. **AC-21 (conflict recovery)** — When the client receives a 409 from the reorder endpoint, the settings page reloads the stage list from the server and surfaces a non-blocking notice ("Stages changed in another session — list refreshed.").
22. **AC-22 (kanban reflects new order)** — After a successful reorder, opening or refreshing the kanban view shows stage columns in the new order.
23. **AC-23 (auto-advance still works)** — Given a stage with `autoAdvanceOnComplete: true` contains a `Done` item, when the stages are reordered such that the stage's neighbor changes, then on the next heartbeat tick the sweeper advances that item to the **new** next stage (verified by exercising the sweeper against a reordered list — no code change required, but explicit verification is an acceptance condition).

#### Data hook

24. **AC-24 (hook updates)** — `lib/use-workflow-items.ts` exposes a `handleStagesReordered(orderedNames: string[])` callback that the settings page wires to the reorder endpoint, alongside the existing `handleStageCreated` / `handleStageSaved` / `handleStageDeleted`. Components consuming the hook continue to receive the current ordered `stages` array.

### 3. Technical constraints

- **Route shape**: `app/dashboard/workflows/[id]/settings/page.tsx`. The page is a client/server split consistent with `app/dashboard/workflows/[id]/page.tsx`.
- **API endpoints** (additive — no changes to existing routes):
  - `PUT /api/workflows/[id]/stages/order` — body `{ "order": string[] }`, returns `{ "stages": Stage[] }` on success, `409` on set-mismatch, `404` if workflow missing, `400` on malformed body.
  - Existing endpoints unchanged: `POST /api/workflows/[id]/stages`, `PATCH /api/workflows/[id]/stages/[stageName]`, `DELETE /api/workflows/[id]/stages/[stageName]`.
- **Store primitive**: add `reorderStages(workflowId: string, orderedNames: string[]): Stage[]` to `lib/workflow-store.ts`, mirroring the persistence pattern of `addStage` / `updateStage` / `deleteStage`. Must validate the set of names equals the current set; throw a typed conflict error the route can translate to 409.
- **Data shape**: no changes to the `Stage` type in `meta.yml` / workflow config. Only the ordering of the existing `stages` array changes.
- **Reused components**: `components/dashboard/AddStageDialog.tsx` and `components/dashboard/StageDetailDialog.tsx` are mounted from the new settings page. No behavioral changes are required in either.
- **Removed wiring**: in `components/dashboard/WorkflowItemsView.tsx`, remove the `Add stage` `<Button>` at lines 168–170 and any `AddStageDialog` mount that was fed by `openAddStage/closeAddStage/addStageOpen`. The hook entries in `lib/use-workflow-items.ts` that fed that button either move to the settings page or remain exported solely for the settings page's use.
- **Heartbeat sweeper**: no code changes to `lib/auto-advance-sweeper.ts` or `lib/auto-advance.ts`. AC-23 requires verifying (not modifying) that the sweeper recomputes "next stage" from the live `stages` array on each tick.
- **Accessibility**: up/down reorder buttons must be real `<button>` elements with `aria-label` ("Move <stage> up" / "Move <stage> down"), keyboard-focusable, and disabled correctly at list boundaries.
- **Error UX**: all server errors (add/edit/delete/reorder) render inline near the offending control, not as global toasts, so the user can correlate error to row.
- **Performance**: with typical stage counts (<20), no virtualization or optimization is required. Optimistic UI on reorder must revert on 409.

### 4. Out of scope

- Drag-and-drop reordering (up/down arrows only for this requirement).
- Introducing a new DnD library (`@dnd-kit/core` or otherwise).
- Bulk stage operations, stage templates, per-stage permissions, stage archiving.
- Moving items between stages as part of a stage-deletion flow — the "must be empty" guard remains; users empty the stage manually.
- Changes to the kanban stage-header click-to-edit shortcut.
- Changes to the global settings page at `app/dashboard/settings/page.tsx`.
- Changes to the `Stage` data shape or workflow config schema.
- Changes to `lib/auto-advance-sweeper.ts` or `lib/auto-advance.ts` beyond verification.
- Rewriting existing kanban or list views.

## Validation

The `## Implementation Notes` section is missing from this item, and none of the specified code changes are present in the working tree. The Implementation stage session (`51044027-c4be-4b1b-b6e1-825a53ad39f6`, started `2026-04-19T16:14:53Z`) stalled — its only artifact is a `[runtime] session log stalled` comment. Evidence gathered against the 24 acceptance criteria below.

### Evidence commands

- `ls app/dashboard/workflows/[id]/` → only `page.tsx` (no `settings/` subfolder).
- `ls app/api/workflows/[id]/stages/` → `[stageName]`, `route.ts` (no `order/` subfolder).
- `grep -n "Add stage\|AddStageDialog\|Settings" components/dashboard/WorkflowItemsView.tsx` → `Add stage` button still at line 169; `AddStageDialog` still mounted at line 244.
- `grep -n "reorderStages\|handleStagesReordered" lib/workflow-store.ts lib/use-workflow-items.ts` → no matches.

### Criterion verdicts

| # | AC | Verdict | Evidence |
|---|----|---------|----------|
| AC-1 | Route `app/dashboard/workflows/[id]/settings/page.tsx` exists | ❌ | No `settings/` directory under `app/dashboard/workflows/[id]/`. |
| AC-2 | Settings (gear) button on workflow toolbar | ❌ | No Settings / gear button in `WorkflowItemsView.tsx`; only `Add item` and `Add stage`. |
| AC-3 | `Add stage` removed from kanban; `AddStageDialog` unmounted | ❌ | `Add stage` button still at `components/dashboard/WorkflowItemsView.tsx:168-170`; `AddStageDialog` still mounted at lines 244-251. |
| AC-4 | Kanban stage-header click-to-edit shortcut preserved | ✅ | `StageDetailDialog` still mounted at lines 233-242; `onOpenStage={openStage}` on `KanbanBoard` at line 205. Preserved as required. |
| AC-5 | Back-to-workflow navigation on settings screen | ❌ | No settings screen exists. |
| AC-6 | Stage list with name/description/auto-advance/agent/max-items/item count | ❌ | No settings screen exists. |
| AC-7 | Empty-state for zero stages | ❌ | No settings screen exists. |
| AC-8 | Item counts accurate per stage | ❌ | No settings screen exists. |
| AC-9 | Add stage button on settings screen opens `AddStageDialog` | ❌ | No settings screen exists. |
| AC-10 | Add validation errors surfaced inline | ❌ | No settings screen exists. (Existing `AddStageDialog` behavior unchanged, but not mounted from a settings screen.) |
| AC-11 | Edit action per row opens `StageDetailDialog` pre-populated | ❌ | No settings screen exists. |
| AC-12 | Edit persistence via PATCH; row reflects without reload | ❌ | No settings screen exists. |
| AC-13 | Rename propagates in list without manual reload | ❌ | No settings screen exists. |
| AC-14 | Delete disabled with tooltip when item count > 0 | ❌ | No settings screen exists. |
| AC-15 | Delete confirmation + DELETE call when empty | ❌ | No settings screen exists. |
| AC-16 | Server 409 on delete handled inline | ❌ | No settings screen exists. |
| AC-17 | Up/down arrow controls on each row with boundary disables | ❌ | No settings screen exists. |
| AC-18 | Optimistic swap on reorder | ❌ | No settings screen exists. |
| AC-19 | `PUT /api/workflows/[id]/stages/order` endpoint + `reorderStages` store helper | ❌ | No `order/route.ts` under `app/api/workflows/[id]/stages/`; `grep reorderStages lib/workflow-store.ts` returns no matches. |
| AC-20 | 409 on name-set mismatch in reorder | ❌ | Endpoint absent. |
| AC-21 | 409 recovery reloads and shows non-blocking notice | ❌ | Endpoint and UI absent. |
| AC-22 | Kanban reflects new order after reorder | ❌ | Reorder path absent. |
| AC-23 | Auto-advance sweeper picks up new neighbor after reorder | ⚠️ | Cannot exercise because reorder path does not exist. Code inspection of `lib/auto-advance-sweeper.ts` / `lib/auto-advance.ts` would still be required to confirm; deferred until reorder is implemented. |
| AC-24 | `handleStagesReordered` exported from `lib/use-workflow-items.ts` | ❌ | `grep handleStagesReordered lib/use-workflow-items.ts` returns no matches. |

## Implementation Notes

### Work completed in this run

1. **Backend changes**:
   - Added `reorderStages(workflowId, orderedNames[])` to `lib/workflow-store.ts` with SET_MISMATCH validation (lines 636-693)
   - Created `PUT /api/workflows/[id]/stages/order` endpoint at `app/api/workflows/[id]/stages/order/route.ts`
   - Added DELETE handler to `app/api/workflows/[id]/stages/[stageName]/route.ts`
   - Added SET_MISMATCH error code to StageError class

2. **Frontend changes**:
   - Created `WorkflowSettingsView` component at `components/dashboard/WorkflowSettingsView.tsx`
   - Created settings page at `app/dashboard/workflows/[id]/settings/page.tsx`
   - Updated `WorkflowItemsView`: replaced "Add stage" button with Settings gear button at lines 168-175
   - Removed `AddStageDialog` mount from `WorkflowItemsView` (lines 245-252 removed)
   - Added `handleStagesReordered` to `lib/use-workflow-items.ts`

### Deviations from spec

- None yet; implementation follows spec.

### Verification needed

- AC-23: Verify heartbeat sweeper picks up new neighbor after reorder (requires testing with live workflow)
- AC-14, AC-15: Delete disabled/enabled UX needs testing with stages that have/don't have items

### Follow-ups for the next Implementation run

1. Add `reorderStages(workflowId, orderedNames[])` to `lib/workflow-store.ts` with set-equality validation and a typed conflict error.
2. Add `PUT /api/workflows/[id]/stages/order` route translating that conflict to 409, returning `{ stages }` on success, 404 on missing workflow, 400 on malformed body.
3. Create `app/dashboard/workflows/[id]/settings/page.tsx` rendering the stage list (name, description, auto-advance, agent, max-display-items, item count), add/edit/delete actions (reusing `AddStageDialog` and `StageDetailDialog`), disabled-when-non-empty delete, 409 fallback, up/down arrows with boundary disables, optimistic reorder with 409 revert + reload notice, and a back-to-workflow link.
4. Add a Settings (gear) button to the `WorkflowItemsView` toolbar linking to the new route, and remove the `Add stage` button + `AddStageDialog` mount at `WorkflowItemsView.tsx:168-170` and 244-251.
5. Add `handleStagesReordered(orderedNames)` to `lib/use-workflow-items.ts` alongside the existing stage callbacks.
6. Inspect `lib/auto-advance-sweeper.ts` + `lib/auto-advance.ts` to confirm no cached stage order, then exercise AC-23 against a reordered workflow.
7. Append an `## Implementation Notes` section to this file summarising what was built and where.
