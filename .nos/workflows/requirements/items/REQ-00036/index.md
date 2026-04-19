# Able to switch between display in list and display in kanban

The workflow detail page currently renders items only as a Kanban board. This
requirement adds a user-facing toggle so the same items can also be viewed as
a flat list.

## Analysis

### 1. Scope

**In scope**

* Add a view-mode toggle (Kanban ↔ List) on the workflow detail page
  (`app/dashboard/workflows/[id]/page.tsx`).
* Implement a new `ListView` client component that renders the same
  `WorkflowItem[]` currently passed to `KanbanBoard`, showing at minimum:
  title, stage, status, assigned agent, and `updatedAt`.
* Preserve existing item interactions in list mode: opening
  `ItemDetailDialog`, creating new items via `NewItemDialog`, and receiving
  live updates from the workflow events stream (the same subscription
  `KanbanBoard` uses).
* Persist the chosen view mode across reloads (e.g. `localStorage` key
  scoped per-workflow, or a single global key) so the user doesn't have to
  re-select on every navigation.
* Keep stage grouping visible in the list (e.g. section headers or a stage
  column) so the list remains useful when a workflow has many stages.

**Explicitly out of scope**

* Any change to the underlying data model or API routes — this is a pure
  presentation-layer change.
* Bulk-edit affordances, inline editing, column sorting, filtering, or
  saved views. Those are natural follow-ups but belong to separate
  requirements.
* Drag-and-drop stage transitions from the list view. The list is
  read/navigate-focused; stage changes continue to happen in the Kanban
  board or the detail dialog.
* Changing the stage-detail surface (`StageDetailDialog`) or the sidebar.

### 2. Feasibility

Low technical risk overall. The data the list needs is already loaded by
`readWorkflowDetail` and already streamed into `KanbanBoard` via the
existing events subscription, so no new server work is required.

Notable considerations:

* **Shared state extraction.** `KanbanBoard` currently owns item state,
  the events subscription, self-origination tracking, the done-sound
  hook, and the detail/new-item dialogs. To avoid duplicating that logic
  in `ListView`, the shared concerns should be lifted into a parent
  component (e.g. `WorkflowItemsView`) or a custom hook
  (`useWorkflowItems`) that both views consume. This refactor is the
  main source of effort/risk.
* **Rendering many items.** Lists typically surface more rows at once
  than the Kanban columns do. For workflows with hundreds of items, a
  naive list may feel sluggish; virtualization can be deferred but we
  should confirm current worst-case item counts before deciding.
* **View persistence.** `localStorage` is straightforward but won't
  survive across devices; a per-user setting on the server is
  heavier-weight. `localStorage` is almost certainly the right trade-off
  for now, matching the scope of the feature.
* **Mobile layout.** The current Kanban is horizontally scrolling; a
  list view is inherently more mobile-friendly, so this is a small UX
  win, but the toggle control itself must remain reachable on narrow
  screens.

No spikes required.

### 3. Dependencies

* `components/dashboard/KanbanBoard.tsx` — primary source of logic to
  share; will be refactored or wrapped.
* `components/dashboard/ItemDetailDialog.tsx` and
  `components/dashboard/NewItemDialog.tsx` — reused as-is from list view.
* `app/dashboard/workflows/[id]/page.tsx` — host for the toggle and both
  view components.
* `types/workflow.ts` — existing `WorkflowItem`/`Stage` types are
  sufficient; no new fields expected.
* Workflow events stream (currently consumed inside `KanbanBoard`) — must
  keep feeding whichever view is active.
* Existing UI primitives (`Button`, `Badge`, `cn`) and the Tailwind/shadcn
  design tokens; no new third-party dependency anticipated.

No other requirement items directly block this work. REQ items that also
modify `KanbanBoard` (if any are in flight) should be merged first or
coordinated to avoid refactor conflicts.

### 4. Open questions

1. **Default view.** Should the default be Kanban (current behavior) or
   List? Recommend Kanban to preserve continuity unless product says
   otherwise.
2. **Persistence scope.** Global user preference vs. per-workflow? A
   per-workflow `localStorage` key is more flexible; a single global key
   is simpler. Pick one before implementation.
3. **Grouping in list mode.** Flat list sorted by `updatedAt`, grouped by
   stage, or user-switchable? A stage-grouped list matches the mental
   model of the Kanban and is the proposed default.
4. **Columns/fields shown.** Confirm which fields appear as columns:
   title, stage, status, agent, updatedAt — plus anything else
   stakeholders expect (e.g. priority, assignee, comment count).
5. **Empty/failed states.** Should failed items be highlighted
   differently in the list (they already have a destructive badge in
   Kanban)? Assume yes unless told otherwise.
6. **Keyboard/a11y.** Is keyboard navigation through the list (arrow
   keys, Enter to open) required for this iteration, or a follow-up?

## Specification

### User stories

1. As a workflow user, I want to toggle between Kanban and List views on
   the workflow detail page, so that I can choose the presentation that
   best fits my current task (scanning many items vs. tracking stage
   flow).
2. As a returning user, I want my last-selected view mode to be
   remembered per workflow, so that I don't have to re-select it on every
   navigation.
3. As a user in List view, I want to see each item's title, stage,
   status, assigned agent, and last-updated time at a glance, so that I
   can triage work without opening each item.
4. As a user in List view, I want to open an item's detail dialog and
   create new items exactly as I can from the Kanban, so that switching
   view modes does not cost me functionality.
5. As a user in either view, I want live updates from the workflow
   events stream to appear in whichever view is active, so that the data
   I see never goes stale relative to Kanban.
6. As a user of a workflow with many stages, I want items grouped by
   stage in List view, so that the list preserves the mental model of
   the Kanban board.

### Acceptance criteria

Open questions from the Analysis section are resolved here so the spec
is self-contained:

* **Default view** is **Kanban** (preserves existing behavior).
* **Persistence scope** is **per-workflow** via `localStorage` under
  the key `nos:workflow:<<workflowworkflowId>:viewMode`, values `"kanban"` or
  `"list"`.
* **Grouping in list mode** is **grouped by stage**, stages rendered in
  the workflow's configured order; within each stage, items are sorted
  by `updatedAt` descending.
* **Columns shown in list mode** are, in order: Title, Stage, Status,
  Agent, Updated. No additional fields for this iteration.
* **Failed items** get the same destructive `Badge` styling already used
  in Kanban.
* **Keyboard navigation** (arrow keys, Enter) is explicitly deferred to
  a follow-up — only baseline a11y (see AC13) is required here.

1. **Given** a workflow detail page at `/dashboard/workflows/[id]`,
   **when** it first renders with no stored preference, **then** the
   Kanban view is shown and a view-mode toggle control labelled
   "Kanban" / "List" is visible at the top of the items area.
2. **Given** the view-mode toggle is visible, **when** the user clicks
   "List", **then** the Kanban board is replaced by the list view
   without a full page reload, and the toggle reflects "List" as the
   active mode.
3. **Given** the user has selected "List" on workflow `W`, **when** the
   user reloads the page or navigates away and back to the same
   workflow, **then** the list view is shown on mount.
4. **Given** the user has selected "List" on workflow `W1`, **when** the
   user navigates to a different workflow `W2` with no stored
   preference, **then** `W2` still opens in Kanban (preference is
   per-workflow, not global).
5. **Given** the list view is active, **then** for each item exactly
   these columns render in this order: **Title**, **Stage**, **Status**,
   **Agent**, **Updated** (relative time, e.g. "3m ago"). Missing agent
   renders as an em dash.
6. **Given** the list view is active, **then** items are grouped by
   stage under section headers showing the stage name and the count of
   items in that stage; stages are rendered in the workflow's configured
   order, and empty stages are still rendered with their header and a
   "No items" placeholder row.
7. **Given** the list view is active, **when** the user clicks a list
   row, **then** `ItemDetailDialog` opens for that item, identical to
   Kanban behavior.
8. **Given** the list view is active, **when** the user triggers the
   "new item" action (same control currently wired into the page),
   **then** `NewItemDialog` opens and on submit the newly created item
   appears in the list without a reload.
9. **Given** either view is active, **when** a workflow event stream
   message arrives (item created, updated, stage-changed, status-changed,
   deleted), **then** the active view reflects the change within the
   same render cycle as Kanban currently does.
10. **Given** an item has `status = "Failed"`, **then** its row in the
    list view renders with the destructive `Badge` variant on the
    Status column, matching the treatment used in Kanban.
11. **Given** the list view is active on a narrow viewport
    (≤ 640 px wide), **then** the toggle control remains visible and
    reachable without horizontal scrolling, and each list row remains
    legible (columns may collapse or wrap but no data is truncated
    beyond an ellipsis on Title).
12. **Given** no items exist in a workflow, **then** the list view
    renders a single "No items yet" empty state (no stage groupings)
    and the new-item control remains available.
13. **Given** the list view is active, **then** the toggle buttons are
    real `<<buttonbutton>` elements with `aria-pressed` reflecting the active
    mode, and each list row is activatable with `Enter` when focused
    (click-to-open plus native button/link semantics — full arrow-key
    navigation is out of scope).
14. **Given** `localStorage` is unavailable or throws (private mode,
    quota), **then** the toggle still works for the current session and
    the UI falls back to the default (Kanban) on next load without
    crashing.

### Technical constraints

* **Files changed**
  * `app/dashboard/workflows/[id]/page.tsx` — host both views behind a
    new `WorkflowItemsView` component; move any props currently passed
    directly to `KanbanBoard` into that wrapper.
  * `components/dashboard/KanbanBoard.tsx` — refactor: item state,
    events-stream subscription, self-origination tracking, done-sound
    hook, and the `ItemDetailDialog` / `NewItemDialog` wiring are lifted
    out into a shared `useWorkflowItems` hook (new file
    `lib/use-workflow-items.ts` or `components/dashboard/use-workflow-items.ts`).
    `KanbanBoard` continues to own Kanban-specific rendering and any
    Kanban-only interactions (e.g. drag-and-drop).
  * `components/dashboard/ListView.tsx` — **new** client component
    consuming `useWorkflowItems` and rendering the stage-grouped list.
  * `components/dashboard/WorkflowItemsView.tsx` — **new** parent that
    owns the view-mode state, persists it to `localStorage`, renders the
    toggle, and mounts either `KanbanBoard` or `ListView`.
* **Types** — reuse `WorkflowItem` and `Stage` from `types/workflow.ts`
  as-is. No schema additions. No new fields on items.
* **Data loading** — no changes to `readWorkflowDetail`, API routes under
  `app/api/workflows/[id]/…`, or the events stream contract. This is a
  presentation-only change.
* **View-mode persistence** — per-workflow `localStorage` key pattern:
  `nos:workflow:<<workflowworkflowId>:viewMode`, string values `"kanban" | "list"`.
  Reads must be guarded for SSR (`typeof window !== "undefined"`) and
  wrapped in `try/catch` to survive quota/private-mode failures.
* **Shared hook (`useWorkflowItems`)** must be the *only* consumer of
  the workflow events subscription for the items area; `KanbanBoard` and
  `ListView` must not each open their own EventSource. The hook exposes
  at minimum: current items array, handlers to open the detail dialog
  and new-item dialog, and the dialog-state needed to mount those
  dialogs once at the parent level.
* **Rendering** — naive render is acceptable for this iteration;
  virtualization is not required. The list component should still be
  keyed by item id and avoid unnecessary re-renders when unrelated items
  change (e.g. via `React.memo` on row components or stable grouping).
* **Styling** — use existing UI primitives (`Button`, `Badge`, `cn`) and
  Tailwind/shadcn tokens. No new third-party dependency. The list uses
  CSS grid or a plain table; pick one and keep it consistent.
* **a11y** — toggle buttons use `aria-pressed`; rows are focusable and
  `Enter`-activatable. Full roving-tabindex / arrow-key navigation is a
  follow-up.
* **Testing** — add unit coverage for `useWorkflowItems` (items
  reducer / events reconciliation) and for the view-mode persistence
  helper. Component-level tests for `ListView` rendering and for the
  toggle behavior in `WorkflowItemsView`.

## Implementation Notes

* Added `components/dashboard/WorkflowItemsView.tsx` to own shared item state, dialog wiring, the Kanban/List toggle, and per-workflow view-mode persistence via `localStorage`.
* Added `components/dashboard/ListView.tsx` for the stage-grouped flat list and `lib/use-workflow-items.ts` plus `lib/workflow-view-mode.ts` for shared item/event and persistence logic.
* Refactored `components/dashboard/KanbanBoard.tsx` into a rendering-focused component while preserving drag/drop and stage editing behavior.

### Out of scope

* Any change to the data model, API routes, or events stream contract.
* Bulk edit, inline edit, column sorting, filtering, saved views.
* Drag-and-drop stage transitions from the list view.
* Changes to `StageDetailDialog` or the sidebar.
* Virtualization of the list.
* Server-side or cross-device persistence of view mode (explicitly
  `localStorage`-only).
* Full keyboard navigation of list rows (arrow keys, j/k, roving
  tabindex) — deferred to a follow-up.
* Mobile-specific redesign beyond ensuring the toggle and rows remain
  legible on narrow viewports.
* Additional list columns (priority, assignee, comment count, etc.).

## Validation

1. ✅ **Pass** — Default render is Kanban and the toggle is visible with “Kanban” / “List” buttons at the top of the items area. Evidence: `components/dashboard/WorkflowItemsView.tsx:27-28`, `components/dashboard/WorkflowItemsView.tsx:59-84` initializes `viewMode` to `DEFAULT_WORKFLOW_VIEW_MODE` (`kanban`) and renders both buttons.
2. ✅ **Pass** — Clicking “List” swaps the rendered component client-side without a page reload and updates the active toggle state. Evidence: `components/dashboard/WorkflowItemsView.tsx:52-55`, `components/dashboard/WorkflowItemsView.tsx:73-79`, `components/dashboard/WorkflowItemsView.tsx:97-107`.
3. ✅ **Pass** — List mode persists across reloads for the same workflow via per-workflow `localStorage`. Evidence: `lib/workflow-view-mode.ts:5-31`, `components/dashboard/WorkflowItemsView.tsx:48-55`, unit coverage in `lib/workflow-view-mode.test.ts:11-58`.
4. ✅ **Pass** — Preferences are scoped per workflow, so a different workflow with no stored value still defaults to Kanban. Evidence: storage key includes workflow id in `lib/workflow-view-mode.ts:5-7`; fallback behavior covered by `lib/workflow-view-mode.test.ts:25-38`.
5. ❌ **Fail** — The list renders the columns in the required order, but the Agent column always shows an em dash and never renders an assigned agent because `WorkflowItem` has no assigned-agent field and `ListView` hardcodes `—`. Evidence: `components/dashboard/ListView.tsx:101-106`, `components/dashboard/ListView.tsx:64-69`, `types/workflow.ts:27-36`.
6. ✅ **Pass** — Items are grouped by stage, stages are rendered in configured order, counts are shown, empty stages render with a “No items” placeholder, and items within stages sort by `updatedAt` descending. Evidence: `components/dashboard/ListView.tsx:81-89`, `components/dashboard/ListView.tsx:108-135`.
7. ✅ **Pass** — Clicking a list row opens `ItemDetailDialog`. Evidence: `components/dashboard/ListView.tsx:35-43`, dialog mounted in `components/dashboard/WorkflowItemsView.tsx:109-119`.
8. ✅ **Pass** — The shared “Add item” control opens `NewItemDialog`, and newly created items are merged into the live list without reload. Evidence: `components/dashboard/WorkflowItemsView.tsx:86-89`, `components/dashboard/WorkflowItemsView.tsx:121-129`, `lib/use-workflow-items.ts:210-212`.
9. ✅ **Pass** — The active view consumes a single shared EventSource and reflects create/update/delete item changes through shared state. Evidence: `lib/use-workflow-items.ts:82-156` is the only EventSource consumer; no other dashboard EventSource usage found; list and Kanban both read the shared `items` state in `components/dashboard/WorkflowItemsView.tsx:97-107`.
10. ✅ **Pass** — Failed items render with the destructive badge variant in list mode. Evidence: `components/dashboard/ListView.tsx:9-14`, `components/dashboard/ListView.tsx:58-63`.
11. ⚠️ **Partial** — The code appears responsive: the toggle is full-width on small screens and rows collapse to a single-column layout with title truncation. However, I did not exercise the UI in a browser at ≤640 px, so reachability and legibility were not empirically verified. Evidence: `components/dashboard/WorkflowItemsView.tsx:59-61`, `components/dashboard/ListView.tsx:45-47`, `components/dashboard/ListView.tsx:49-50`.
12. ✅ **Pass** — With zero items, list mode renders a single “No items yet” empty state rather than stage groupings, while the add-item control remains available. Evidence: `components/dashboard/ListView.tsx:91-97`, `components/dashboard/WorkflowItemsView.tsx:86-89`.
13. ✅ **Pass** — Toggle controls are real `<<buttonbutton>` elements with `aria-pressed`, and list rows are keyboard-activatable with `Enter`. Evidence: `components/dashboard/WorkflowItemsView.tsx:62-83`, `components/dashboard/ListView.tsx:35-43`.
14. ✅ **Pass** — `localStorage` failures fall back to default without crashing, while in-memory state still drives the current session. Evidence: `lib/workflow-view-mode.ts:9-35`, unit coverage in `lib/workflow-view-mode.test.ts:31-58`.

### Regression / edge-case checks

* ✅ Shared event subscription was correctly lifted into `useWorkflowItems`; neither `ListView` nor `KanbanBoard` opens its own EventSource. Evidence: `lib/use-workflow-items.ts:82-156`; no EventSource usage found in `components/dashboard/*`.
* ❌ Missing requested component-level tests for `ListView` and `WorkflowItemsView`. Evidence: no matching component test files found; only `lib/use-workflow-items.test.ts` and `lib/workflow-view-mode.test.ts` exist.
* ⚠️ Browser-level UI validation was not performed in this session, so mobile behavior and interaction polish were validated by code inspection rather than live exercise.

## Analysis

### 1. Scope

**In scope**

* Add a view-mode toggle (Kanban ↔ List) on the workflow detail page
  (`app/dashboard/workflows/[id]/page.tsx`).
* Implement a new `ListView` client component that renders the same
  `WorkflowItem[]` currently passed to `KanbanBoard`, showing at minimum:
  title, stage, status, assigned agent, and `updatedAt`.
* Preserve existing item interactions in list mode: opening
  `ItemDetailDialog`, creating new items via `NewItemDialog`, and receiving
  live updates from the workflow events stream (the same subscription
  `KanbanBoard` uses).
* Persist the chosen view mode across reloads (e.g. `localStorage` key
  scoped per-workflow, or a single global key) so the user doesn't have to
  re-select on every navigation.
* Keep stage grouping visible in the list (e.g. section headers or a stage
  column) so the list remains useful when a workflow has many stages.

**Explicitly out of scope**

* Any change to the underlying data model or API routes — this is a pure
  presentation-layer change.
* Bulk-edit affordances, inline editing, column sorting, filtering, or
  saved views. Those are natural follow-ups but belong to separate
  requirements.
* Drag-and-drop stage transitions from the list view. The list is
  read/navigate-focused; stage changes continue to happen in the Kanban
  board or the detail dialog.
* Changing the stage-detail surface (`StageDetailDialog`) or the sidebar.

### 2. Feasibility

Low technical risk overall. The data the list needs is already loaded by
`readWorkflowDetail` and already streamed into `KanbanBoard` via the
existing events subscription, so no new server work is required.

Notable considerations:

* **Shared state extraction.** `KanbanBoard` currently owns item state,
  the events subscription, self-origination tracking, the done-sound
  hook, and the detail/new-item dialogs. To avoid duplicating that logic
  in `ListView`, the shared concerns should be lifted into a parent
  component (e.g. `WorkflowItemsView`) or a custom hook
  (`useWorkflowItems`) that both views consume. This refactor is the
  main source of effort/risk.
* **Rendering many items.** Lists typically surface more rows at once
  than the Kanban columns do. For workflows with hundreds of items, a
  naive list may feel sluggish; virtualization can be deferred but we
  should confirm current worst-case item counts before deciding.
* **View persistence.** `localStorage` is straightforward but won't
  survive across devices; a per-user setting on the server is
  heavier-weight. `localStorage` is almost certainly the right trade-off
  for now, matching the scope of the feature.
* **Mobile layout.** The current Kanban is horizontally scrolling; a
  list view is inherently more mobile-friendly, so this is a small UX
  win, but the toggle control itself must remain reachable on narrow
  screens.

No spikes required.

### 3. Dependencies

* `components/dashboard/KanbanBoard.tsx` — primary source of logic to
  share; will be refactored or wrapped.
* `components/dashboard/ItemDetailDialog.tsx` and
  `components/dashboard/NewItemDialog.tsx` — reused as-is from list view.
* `app/dashboard/workflows/[id]/page.tsx` — host for the toggle and both
  view components.
* `types/workflow.ts` — existing `WorkflowItem`/`Stage` types are
  sufficient; no new fields expected.
* Workflow events stream (currently consumed inside `KanbanBoard`) — must
  keep feeding whichever view is active.
* Existing UI primitives (`Button`, `Badge`, `cn`) and the Tailwind/shadcn
  design tokens; no new third-party dependency anticipated.

No other requirement items directly block this work. REQ items that also
modify `KanbanBoard` (if any are in flight) should be merged first or
coordinated to avoid refactor conflicts.

### 4. Open questions

1. **Default view.** Should the default be Kanban (current behavior) or
   List? Recommend Kanban to preserve continuity unless product says
   otherwise.
2. **Persistence scope.** Global user preference vs. per-workflow? A
   per-workflow `localStorage` key is more flexible; a single global key
   is simpler. Pick one before implementation.
3. **Grouping in list mode.** Flat list sorted by `updatedAt`, grouped by
   stage, or user-switchable? A stage-grouped list matches the mental
   model of the Kanban and is the proposed default.
4. **Columns/fields shown.** Confirm which fields appear as columns:
   title, stage, status, agent, updatedAt — plus anything else
   stakeholders expect (e.g. priority, assignee, comment count).
5. **Empty/failed states.** Should failed items be highlighted
   differently in the list (they already have a destructive badge in
   Kanban)? Assume yes unless told otherwise.
6. **Keyboard/a11y.** Is keyboard navigation through the list (arrow
   keys, Enter to open) required for this iteration, or a follow-up?
