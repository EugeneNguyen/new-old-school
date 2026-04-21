# the item in the stage columns should be order by last updated time, from newest to oldest

## Analysis

### Scope

**In scope:**
- Items within each stage column of the **KanbanBoard** view must be sorted by `updatedAt` descending (newest first).
- The **ListView** already sorts correctly — this is primarily a KanbanBoard gap.
- Optionally, the sort could be lifted upstream into `WorkflowItemsView` so both views inherit it consistently.

**Out of scope:**
- Changing the order of the stage columns themselves (those follow the configured `stages.yaml` order).
- Adding user-configurable sort options (ascending, by title, etc.) — the requirement specifies a fixed newest-first order.
- Sorting in the API layer (`readItems()` in `lib/workflow-store.ts`) — the current approach of sorting client-side in React is fine and avoids unnecessary coupling.

### Feasibility

**Viability: High — trivial change.**

The `ListView` component already contains the exact sort logic needed:

```ts
.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
```

The same `.slice().sort(...)` chain needs to be applied in one of two places:

1. **Option A (minimal):** Inside `KanbanBoard.tsx` at line ~56, sort `stageItems` after the `.filter()` call.
2. **Option B (DRY):** Inside `WorkflowItemsView.tsx`, sort `filteredItems` before passing to either `KanbanBoard` or `ListView`, removing the duplicate sort from `ListView`.

**Risks:** None. String comparison on ISO 8601 timestamps produces correct chronological ordering. The `updatedAt` field is always present (set by `writeMeta()` in `lib/workflow-store.ts`).

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `components/dashboard/KanbanBoard.tsx` | Direct | Primary file to modify (or receive pre-sorted items) |
| `components/dashboard/WorkflowItemsView.tsx` | Direct | If choosing Option B (upstream sort) |
| `components/dashboard/ListView.tsx` | Indirect | Already has the sort; may be simplified if sort moves upstream |
| `types/workflow.ts` → `WorkflowItem.updatedAt` | Data model | The field being sorted on — already typed as `string` (ISO 8601) |
| `lib/workflow-store.ts` → `writeMeta()` | Runtime | Guarantees `updatedAt` is set on every item write |

No external services, migrations, or config changes required.

### Open questions

1. **Option A vs Option B?** Should the sort be added locally in `KanbanBoard` (minimal diff, leaves `ListView`'s own sort in place), or lifted to `WorkflowItemsView` (DRY, single sort location, slightly larger diff)? Both are valid; Option B is cleaner long-term.
2. **Items without `updatedAt`?** Legacy items created before the field was introduced may lack it. The current `readItemFolder` parser requires it, so this is likely a non-issue — but worth confirming there are no items on disk missing the field.

## Specification

### User stories

1. As a **project manager**, I want items in each Kanban stage column sorted by last-updated time (newest first), so that I can immediately see the most recently changed requirements without scrolling.
2. As a **developer**, I want the Kanban and List views to use a consistent sort order, so that switching between views does not disorient me with different item positions.

### Acceptance criteria

1. **Given** the KanbanBoard view is rendered with items in a stage, **when** items have different `updatedAt` timestamps, **then** items within each stage column are displayed in descending `updatedAt` order (newest first).
2. **Given** an item's `updatedAt` value changes (e.g., via an edit or status transition), **when** the KanbanBoard re-renders with updated data, **then** the modified item moves to the top of its stage column.
3. **Given** the ListView already sorts items by `updatedAt` descending, **when** the sort is lifted to `WorkflowItemsView` (Option B), **then** the ListView continues to display items in the same newest-first order with no visual regression.
4. **Given** a search filter is active, **when** `filteredItems` are passed to either view, **then** the filtered subset is still sorted by `updatedAt` descending.
5. **Given** a stage column uses `maxDisplayItems` capping, **when** items are sorted before slicing, **then** the visible items are the *most recently updated* ones, not the first alphabetically by ID.

### Technical constraints

| Constraint | Detail |
|---|---|
| **Sort field** | `WorkflowItem.updatedAt` — typed as `string` (ISO 8601) in `types/workflow.ts:35`. String comparison produces correct chronological order for ISO 8601 timestamps. |
| **Sort direction** | Descending (newest first). |
| **Preferred approach** | **Option B (upstream sort):** Sort `filteredItems` inside the `useMemo` in `WorkflowItemsView.tsx:90–96` before passing to `KanbanBoard` or `ListView`. Remove the duplicate `.sort()` from `ListView.tsx:88–89` and `ListView.tsx:102`. |
| **Fallback approach** | **Option A (local sort):** Add `.slice().sort(...)` to `stageItems` in `KanbanBoard.tsx:56` after the `.filter()` call. Leave `ListView`'s sort untouched. |
| **Sort expression** | `.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))` — already proven in `ListView`. |
| **Files modified** | Option B: `WorkflowItemsView.tsx`, `ListView.tsx`, `KanbanBoard.tsx` (receives pre-sorted items, no sort needed internally). Option A: `KanbanBoard.tsx` only. |
| **Data guarantee** | `updatedAt` is always present — `writeMeta()` in `lib/workflow-store.ts` sets it on every write, and `readItemFolder` requires it. No null/fallback handling needed. |
| **Performance** | Negligible. Item counts per workflow are small (tens to low hundreds). A single in-memory `.sort()` on short strings adds no measurable overhead. |
| **No API changes** | Sorting remains client-side in React. No changes to `lib/workflow-store.ts` or any API route. |

### Out of scope

- **Column order:** The order of stage columns themselves is defined by `stages.yaml` and is not affected.
- **User-configurable sort:** No UI for choosing sort field or direction. The requirement specifies a fixed newest-first order.
- **API-level sorting:** Sorting stays in the React layer; `readItems()` in `lib/workflow-store.ts` is not modified.
- **Drag-and-drop reordering within a column:** Items are sorted purely by `updatedAt`; manual reorder is not part of this requirement.

## Implementation Notes

Implemented Option B (upstream sort) as specified:

1. **`WorkflowItemsView.tsx`** — `filteredItems` `useMemo` now applies `.slice().sort()` by `updatedAt` descending after filtering, so both `KanbanBoard` and `ListView` receive pre-sorted items.
2. **`ListView.tsx`** — Removed the duplicate `.slice().sort()` from the `groupedStages` memo and the no-stages fallback branch since items arrive pre-sorted.
3. **`KanbanBoard.tsx`** — No changes needed; it already uses `items.filter(...)` per stage, which preserves the upstream sort order.

No deviations from the specification. TypeScript compiles cleanly.

## Validation

### AC1 — KanbanBoard stage columns sorted newest-first ✅
`WorkflowItemsView.tsx:97` applies `.slice().sort((a, b) => a.updatedAt < b.updatedAt ? 1 : ...)` to `filteredItems` before passing to `KanbanBoard`. `KanbanBoard.tsx:56` derives `stageItems` via `items.filter(...)`, which preserves the upstream sort order. Each stage column therefore renders items in descending `updatedAt` order.

### AC2 — Re-render after update moves item to top ✅
The `filteredItems` `useMemo` in `WorkflowItemsView.tsx:90-98` lists `items` as a dependency. When `useWorkflowItems` receives a new item state via SSE and updates `items`, the memo recomputes, re-sorting with the new `updatedAt` values. The modified item surfaces to the top of its column on the next render.

### AC3 — ListView visual regression check ✅
`ListView.tsx:83-88` `groupedStages` memo now only calls `items.filter(...)` — no `.sort()`. Confirmed by reading the file: no sort call exists anywhere in `ListView.tsx`. Items arrive pre-sorted from `WorkflowItemsView`, so the list renders in the same newest-first order as before. No regression.

### AC4 — Filtered subset is sorted ✅
`WorkflowItemsView.tsx:90-98`: filtering (`items.filter(...)`) produces `base`, then `.slice().sort(...)` is applied to `base`. The resulting `filteredItems` passed to both views is filtered *and* sorted. Search filter preserves newest-first order.

### AC5 — Capped columns show most recently updated items ✅
`KanbanBoard.tsx:56-64`: `stageItems` is derived by `items.filter(...)` (preserving upstream sort), then `visibleItems = stageItems.slice(0, cap)`. Since `stageItems` is already sorted newest-first, slicing to `cap` yields the `cap` most recently updated items, not alphabetical-ID order.

### TypeScript compilation ✅
`npx tsc --noEmit` produced no output (zero errors).

### Adjacent functionality check ✅
- Drag-and-drop in `KanbanBoard` is unchanged (`onDragStart`/`onDrop` still reference item IDs correctly).
- Stage-count badge (`stageItems.length`) counts all items in the stage, not just visible ones — unchanged.
- `maxDisplayItems` expand/collapse toggle is unaffected.
- `ListView` stage grouping and header row are unchanged.
