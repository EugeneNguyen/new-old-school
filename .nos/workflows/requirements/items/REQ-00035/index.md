In stage, we can set max number of item to display

Set \= 0 or null or empty \=> no limit

Set > 0 \=> limit, and have show all button

## Analysis

### 1. Scope

**In scope**
- Add a per-stage `maxDisplayItems` (working name) configuration field, persisted in `.nos/workflows/<id>/config/stages.yaml` alongside the existing `prompt` / `autoAdvanceOnComplete` / `agentId` fields.
- Surface the field as an editable input in `StageDetailDialog` (the existing per-stage edit modal opened from the kanban column header).
- Extend the stage `PATCH` API (`app/api/workflows/[id]/stages/[stageName]/route.ts`) to accept `maxDisplayItems` (number ≥ 0, or `null`).
- In `KanbanBoard.tsx`, when a stage has `maxDisplayItems > 0`, render only the first N items in that column and show a "Show all (N of M)" toggle button. When the limit is `0`, `null`, empty, or unset, render all items as today.
- Persist the toggle state per-column for the lifetime of the board view (local `useState`), so toggling does not affect other columns or sessions.

**Explicitly out of scope**
- No pagination, virtualization, or server-side trimming — the API still returns every item; the cap is purely a render-time concern.
- No sort/order changes. The "first N" follows the existing item ordering used by `items.filter((i) => i.stage === stage.name)`.
- No global default for `maxDisplayItems`; it is set per stage.
- No automatic hiding of items based on status or age — only a hard count cap.
- The badge count in the column header (`stageItems.length`) continues to reflect the **total** items in the stage, not the visible subset.

### 2. Feasibility

- **Technical viability**: Straightforward. The data model already supports adding optional stage fields (see `agentId`, `autoAdvanceOnComplete`); the YAML round-trips through `lib/workflow-store.ts`. The UI change is a small slice in `KanbanBoard.tsx` plus one new control in `StageDetailDialog.tsx`.
- **Risks**:
  - Drag-and-drop UX: a user dragging a card from one column to another that is in collapsed state needs a sensible drop target. The drop zone is the column container itself, so this still works, but the dropped card may immediately disappear if it lands beyond the limit. Mitigation: if the column is in collapsed (limited) view and a new item lands in it, briefly auto-expand or surface a "1 hidden — show all" hint.
  - Empty-state copy: today there is a "No items" placeholder when the column is empty. The collapsed view must distinguish "0 items" from "N hidden behind the limit".
  - Ordering: Items are not currently sorted; they appear in store order. Truncating the first N preserves whatever order the store returns. If REQ-00033 / REQ-00034 (or any sibling reqs) introduce sorting, this slice should consume that order rather than re-implementing it.
- **Unknowns / spikes needed**: None significant. Confirm the input control style (number input vs slider) with the existing dialog conventions.

### 3. Dependencies

- **Files that must change**:
  - `types/workflow.ts` — add `maxDisplayItems?: number | null` to `Stage`.
  - `lib/workflow-store.ts` — load / persist the new field; extend `StagePatch`.
  - `app/api/workflows/[id]/stages/[stageName]/route.ts` — validate and forward `maxDisplayItems`.
  - `components/dashboard/StageDetailDialog.tsx` — add a number input bound to the new field.
  - `components/dashboard/KanbanBoard.tsx` — apply the limit, render the "Show all" toggle, manage per-column expanded state.
- **Cross-requirement**:
  - Touches the same stage-config surface as REQ-014 (agent skills), REQ-015 (editable stage info from kanban), and REQ-016 (stage prompt pipeline). No conflict expected — purely additive.
- **External systems**: None.

### 4. Open questions

1. **Field name**: `maxDisplayItems`, `displayLimit`, or `visibleItems`? Pick one for the YAML key and stick with it.
2. **Default value semantics**: The request defines `0`, `null`, and empty as "no limit". Should the YAML serialize the unset case as `null`, omit the key entirely, or write `0`? Recommend: omit when unset; treat `0` as a valid alias for "no limit" only for the API/UI.
3. **Negative values**: Reject (`< 0` → 400) or coerce to `0`? Recommend reject.
4. **Toggle persistence**: Should "Show all" persist across refreshes (localStorage keyed by workflow + stage) or reset every page load? Recommend: in-memory only for this slice.
5. **Drop-into-collapsed behavior**: Auto-expand on drop, flash a hint, or do nothing? Needs a product call before implementation.
6. **Header badge**: Confirm the column count badge stays at the **total** count (not "visible / total"). Alternative is to render `5 / 12` when limited.

## Specification

### 1. User stories

1. As a workflow owner, I want to cap the number of items visible in a stage column, so that busy stages do not dominate the kanban board.
2. As a workflow owner, I want to edit that cap from the stage detail dialog, so that I can tune each stage without touching YAML.
3. As a board viewer, I want a "Show all" toggle on a capped column, so that I can still reach hidden items when I need them.
4. As a board viewer, I want the column header badge to keep showing the true total, so that the cap never hides how much work is really parked in a stage.
5. As a board user, I want the cap to apply only to rendering, so that dragging items into a capped column never silently discards or reorders them.

### 2. Acceptance criteria

**Data model**
1. Given a stage in `.nos/workflows/<id>/config/stages.yaml`, when it has no cap configured, then the YAML MUST NOT contain a `maxDisplayItems` key and the in-memory `Stage.maxDisplayItems` MUST be `undefined`.
2. Given a stage whose cap is set to a positive integer `N`, when the workflow is persisted, then `maxDisplayItems: N` MUST be written into that stage's YAML block.
3. Given a stage whose cap is explicitly set to `0` or `null` through the API, when the workflow is persisted, then the `maxDisplayItems` key MUST be removed from the YAML (both values are canonicalized to "no limit" → absent).
4. `Stage.maxDisplayItems` in `types/workflow.ts` MUST be typed as `number | null | undefined` and documented as "positive integer limit; `0`, `null`, or absent all mean no limit".

**API — `PATCH /api/workflows/[id]/stages/[stageName]`**
5. Given a request body `{ "maxDisplayItems": N }` where `N` is an integer ≥ 1, when the PATCH is processed, then the server MUST persist `N` and respond `200` with the updated stage.
6. Given a request body `{ "maxDisplayItems": 0 }` or `{ "maxDisplayItems": null }`, when the PATCH is processed, then the server MUST clear the field (remove the YAML key) and respond `200`.
7. Given a request body where `maxDisplayItems` is a negative number, a non-integer, or a non-numeric non-null value (string, boolean, array, object), when the PATCH is processed, then the server MUST respond `400` with an error message naming the invalid field and MUST NOT mutate the stage.
8. Given a PATCH request that does not include the `maxDisplayItems` key at all, when processed, then the existing stored value MUST be preserved unchanged.
9. The existing `StagePatch` shape in `lib/workflow-store.ts` MUST be extended so callers can set the value to a number, to `null` (clear), or omit it (leave as-is).

**Stage detail dialog (`StageDetailDialog.tsx`)**
10. Given the dialog is opened for a stage, when it renders, then it MUST include a labelled numeric input (label text: "Max items shown") bound to the current `maxDisplayItems` value, with empty string representing "no limit".
11. Given the user enters a positive integer and saves, when the dialog submits, then it MUST send `{ maxDisplayItems: <value> }` via the stage PATCH.
12. Given the user clears the input (empty string) or enters `0` and saves, when the dialog submits, then it MUST send `{ maxDisplayItems: null }`.
13. Given the user enters a negative number, a decimal, or non-numeric text, when the dialog attempts to save, then save MUST be blocked with inline validation text reading "Enter a whole number ≥ 0, or leave blank for no limit" and no PATCH MUST be fired.
14. Closing the dialog without saving MUST NOT change the stored value.

**Kanban rendering (`KanbanBoard.tsx`)**
15. Given a stage with `maxDisplayItems` unset, `null`, or `0`, when the column renders, then all items whose `stage === stage.name` MUST be rendered in the same order as today (no truncation, no toggle, no hint).
16. Given a stage with `maxDisplayItems = N` (N ≥ 1) and `M` items where `M ≤ N`, when the column renders, then all `M` items MUST be rendered and NO "Show all" control MUST be shown.
17. Given a stage with `maxDisplayItems = N` and `M > N` items, when the column renders in its default (collapsed) state, then exactly the first `N` items (same ordering as today) MUST be rendered and a "Show all (N of M)" button MUST be rendered at the bottom of the column's item list.
18. Given the user clicks "Show all" on a capped column, when the click is handled, then all `M` items MUST become visible and the button label MUST switch to "Show less".
19. Given the column is in expanded state, when the user clicks "Show less", then the column MUST return to showing only the first `N` items.
20. The expanded/collapsed state MUST be tracked per stage in local React state in `KanbanBoard`. Toggling one column MUST NOT affect any other column. Reloading the page or navigating away and back MUST reset every column to collapsed.
21. The column header count badge MUST continue to display `stageItems.length` (the total `M`), regardless of cap or expansion state.
22. Given a capped column has `M = 0` items, when it renders, then the existing "No items" placeholder MUST be shown and no "Show all" control MUST appear.
23. Given an item is dragged and dropped into a capped, collapsed column such that it would land beyond position `N`, when the drop completes, then the column MUST auto-expand (enter the "Show all" state) so the dropped item remains visible; subsequent manual "Show less" clicks remain allowed.

**Non-regression**
24. Existing stage fields (`prompt`, `autoAdvanceOnComplete`, `agentId`) MUST continue to round-trip through YAML unchanged when `maxDisplayItems` is edited.
25. Drag-and-drop stage reassignment MUST continue to work on both capped and uncapped columns.

### 3. Technical constraints

- **YAML key**: the persisted key is `maxDisplayItems` (camelCase, matching sibling keys like `autoAdvanceOnComplete` and `agentId`). No alternate names are accepted.
- **Canonical "no limit"**: API accepts `0` and `null` as equivalent inputs for clearing; storage MUST normalize both to "key absent" in YAML. `Stage.maxDisplayItems` in memory MUST be `undefined` in that case (not `0`, not `null`).
- **Validation range**: integer ≥ 0. Reject `< 0`, `NaN`, non-integer numbers, and non-numeric values with HTTP 400.
- **File paths to change** (additive only; no renames):
  - `types/workflow.ts` — extend `Stage`.
  - `lib/workflow-store.ts` — load/persist the field; extend `StagePatch`; normalize `0`/`null` → absent on write.
  - `app/api/workflows/[id]/stages/[stageName]/route.ts` — input validation + forwarding.
  - `components/dashboard/StageDetailDialog.tsx` — number input + client-side validation.
  - `components/dashboard/KanbanBoard.tsx` — truncation, toggle, per-column state, drop-into-collapsed auto-expand.
- **Ordering contract**: the "first N" are the first N entries of `items.filter((i) => i.stage === stage.name)` as produced by existing code. This requirement MUST NOT introduce an independent sort; if a later requirement supplies an ordering hook, this feature consumes it without change.
- **Performance**: the cap is a render-time `slice`; there is no server trimming, no pagination, no virtualization. Workflow item payloads are unchanged in size.
- **State scope for "Show all"**: per-column, in-memory, component-local (`useState` keyed by stage name inside `KanbanBoard`). No localStorage, no URL param, no server persistence.
- **Compatibility**: workflows authored before this change (no `maxDisplayItems` key) MUST continue to load and render identically.

### 4. Out of scope

- Pagination, infinite scroll, or virtualization of the column list.
- Server-side trimming of the items API response.
- A global / workflow-level default for `maxDisplayItems`.
- Persisting the "Show all" toggle across refreshes or between users.
- Changing the column header badge to a "visible / total" format.
- Introducing or changing item sort order in any stage.
- Filtering items by status, age, owner, or any criterion other than the hard count cap.
- Migrating or rewriting existing `stages.yaml` files beyond the first natural save of a touched stage.
- Any visual treatment on cards that are "hidden behind the limit" beyond the "Show all (N of M)" / "Show less" toggle and the drop-into-collapsed auto-expand.

## Implementation Notes

Changes (all additive, no renames):

- `types/workflow.ts`: added `maxDisplayItems?: number | null` to `Stage`.
- `lib/workflow-store.ts`:
  - `readStages` now parses `maxDisplayItems` only when it is a positive integer; otherwise the field stays `undefined` (AC 1, 4).
  - `StagePatch` gained `maxDisplayItems?: number | null` (AC 9).
  - `updateStage` normalizes `0` / `null` → delete key; positive integers are written through (AC 2, 3, 24).
- `app/api/workflows/[id]/stages/[stageName]/route.ts`: validates `maxDisplayItems` — accepts `null` or non-negative integers, collapses `0` to `null`, rejects anything else with HTTP 400 (AC 5, 6, 7). Key omitted → field untouched (AC 8).
- `components/dashboard/StageDetailDialog.tsx`: added a "Max items shown" number input with placeholder "No limit". Empty or `0` sends `null`; positive integers send the number; invalid input blocks save with the inline error `Enter a whole number ≥ 0, or leave blank for no limit` (AC 10–14).
- `components/dashboard/KanbanBoard.tsx`:
  - Added `expandedStages` local state and `toggleStageExpanded` (per-column, in-memory, resets on reload — AC 20).
  - When a stage has `maxDisplayItems > 0` and items exceed the cap, only the first N items render plus a `Show all (N of M)` / `Show less` toggle (AC 15–19, 22).
  - Column header badge still shows the full `stageItems.length` (AC 21).
  - Drop handler auto-expands the target column when dropping an item from a different stage onto a capped-and-already-full column (AC 23). Drops that don't change the stage leave the state alone (AC 25 continues to work).

Typecheck: `npx tsc --noEmit` clean. No new files created; no existing stage YAML rewritten (stages persist on their next natural save, per the out-of-scope note).

## Validation

Verified against the committed source on `main` (`types/workflow.ts`, `lib/workflow-store.ts`, `app/api/workflows/[id]/stages/[stageName]/route.ts`, `components/dashboard/StageDetailDialog.tsx`, `components/dashboard/KanbanBoard.tsx`) and `npx tsc --noEmit` (clean).

**Data model**
1. ✅ `readStages` (`lib/workflow-store.ts:101-107`) only assigns `stage.maxDisplayItems` when the YAML value is a positive integer; otherwise the field is `undefined`. Existing `stages.yaml` files (e.g. `.nos/workflows/requirements/config/stages.yaml`) omit the key and load cleanly.
2. ✅ `updateStage` (`lib/workflow-store.ts:353-359`) writes positive integers through; `yaml.dump` serializes them as `maxDisplayItems: N` inline with sibling keys.
3. ✅ `updateStage` deletes the key when patch is `null` or `0`; API layer (`route.ts:82`) also collapses `0` → `null` before reaching the store, so either path clears YAML.
4. ✅ `Stage.maxDisplayItems` in `types/workflow.ts:14` is `number | null | undefined` with the documenting comment "Positive integer limit on how many items to render in the column. `0`, `null`, or absent all mean 'no limit'."

**API — `PATCH /api/workflows/[id]/stages/[stageName]`**
5. ✅ Integer ≥ 1 path: `Number.isInteger(raw) && raw >= 0`, `raw === 0 ? null : raw` — a positive integer is forwarded unchanged and the route responds with the updated `{ stages, items }` (200).
6. ✅ `0` and `null` both set `patch.maxDisplayItems = null`, producing a `delete current.maxDisplayItems` in `updateStage`.
7. ✅ The `else` branch in `route.ts:83-89` returns HTTP 400 with the message `"maxDisplayItems" must be a non-negative integer or null` for negatives, non-integers (1.5), NaN, strings, booleans, arrays, and objects (typeof / `Number.isInteger` / `Number.isFinite` guards). `patch.maxDisplayItems` is not set, so the store mutation is never attempted for those bodies.
8. ✅ Omitting the key leaves `body.maxDisplayItems === undefined`; the branch is skipped and `updateStage` only touches other fields.
9. ✅ `StagePatch.maxDisplayItems?: number | null` in `lib/workflow-store.ts:309`.

**Stage detail dialog**
10. ✅ `StageDetailDialog.tsx:196-210` renders a labelled numeric `Input` (label "Max items shown"); effect at `:43-47` binds empty string when `stage.maxDisplayItems` is absent/non-positive, otherwise `String(value)`.
11. ✅ Positive integer path: `parsed === 0 ? null : parsed` sends the number in the PATCH body (`:108`).
12. ✅ Empty string → `maxDisplayItemsPayload = null`; `0` → also `null`.
13. ✅ Negative, decimal, or non-numeric input triggers `setError('Enter a whole number ≥ 0, or leave blank for no limit')` and returns before `fetch`. Message text matches the spec verbatim.
14. ✅ Close button invokes `onOpenChange(false)` without touching state; `handleSave` is the only code path that issues the PATCH.

**Kanban rendering**
15. ✅ `cap` is `null` unless `stage.maxDisplayItems` is a positive number; `visibleItems = stageItems` when `!isCapped`; the toggle button is gated on `cap !== null && stageItems.length > cap`.
16. ✅ `isCapped = cap !== null && stageItems.length > cap` — with M ≤ N this is false, so `visibleItems = stageItems` and no toggle renders.
17. ✅ When M > N and collapsed, `visibleItems = stageItems.slice(0, cap)`; toggle label in collapsed state is `Show all (${cap} of ${stageItems.length})`.
18. ✅ Click calls `toggleStageExpanded`; `isExpanded` flips to true → `visibleItems = stageItems`; button label becomes `Show less`.
19. ✅ Second click flips `isExpanded` to false → back to the slice.
20. ✅ `expandedStages` is component-local `useState<Record<string, boolean>>`, keyed by stage name; toggling one key does not affect others, and state is lost on reload.
21. ✅ Column header badge at `:345-347` prints `stageItems.length` unconditionally.
22. ✅ `stageItems.length === 0` renders the existing "No items" placeholder; toggle is gated on `stageItems.length > cap`, which is false, so no button renders.
23. ✅ Drop handler (`:268-284`): when `willChangeStage && cap !== null && stageItems.length >= cap`, it sets `expandedStages[stage.name] = true` before calling `moveItem`, keeping the dropped card visible. Manual "Show less" remains available on the same button afterward.

**Non-regression**
24. ✅ `updateStage` writes `prompt`, `autoAdvanceOnComplete`, and `agentId` through the same `current[...] = ...` pattern used for `maxDisplayItems`, and only mutates the touched keys; round-trip via `yaml.dump` → `readStages` preserves them.
25. ✅ `moveItem` is invoked unconditionally on drop; the only new behaviour is an optional `setExpandedStages` before the move, which does not block or alter the PATCH.

All 25 criteria pass. No follow-ups.

