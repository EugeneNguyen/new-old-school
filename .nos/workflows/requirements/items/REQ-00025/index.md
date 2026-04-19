When i create a new issue, first it will show 2 items in the backlog, when i reload it come back to 1 item. 

Fix that

## Analysis

### Scope
- **In scope**: Fix the transient duplicate card that appears in the Kanban backlog immediately after creating a new item. The duplicate disappears on reload, which means on-disk state is correct and the bug is client-side only.
- **Out of scope**: Any changes to item persistence, the stage pipeline, SSE transport protocol, or the creation API contract. No UX redesign of `NewItemDialog`.

### Root Cause (Feasibility)
After creating an item, the Kanban list is mutated from two independent sources, and neither deduplicates against the other:

1. `components/dashboard/NewItemDialog.tsx:58` calls `onCreated(created)` with the POST response, which runs `handleItemCreated` in `components/dashboard/KanbanBoard.tsx:177-179`:
   ```ts
   function handleItemCreated(created: WorkflowItem) {
     setItems((curr) => [...curr, created]);
   }
   ```
   This append is unconditional — no id check.
2. The POST handler (`app/api/workflows/[id]/items/route.ts:48-58`) calls `createItem`, which emits an `item-created` event (`lib/workflow-store.ts:29` → `lib/workflow-events.ts:36`). The Kanban's `EventSource` subscriber (`components/dashboard/KanbanBoard.tsx:58-75`) receives it and also appends via `[...curr, incoming]` when no existing id matches.

Because `emitItemCreated` fires inside `createItem` — before the POST response returns — the SSE event typically reaches the client first and inserts the item. When the POST promise later resolves, `handleItemCreated` appends the same record a second time, producing the observed double-card. A hard reload rehydrates `initialItems` from disk, which contains one record, so the duplicate vanishes. The SSE handler (lines 63-74) already deduplicates correctly by id; `handleItemCreated` does not, which is the asymmetry.

A secondary contributor: the POST response is `afterPipeline ?? created` (route.ts:57-58), i.e. a post-stage-pipeline version of the item whose `updatedAt` may be *newer* than the SSE echo. Even if `handleItemCreated` were reordered before the SSE event, the SSE handler's last-writer-wins check (line 68) would still be satisfied by the earlier-emitted record and a fresh insert could happen.

**Technical viability**: High. Fix is a one-function change — make `handleItemCreated` idempotent by finding-or-replacing on id, mirroring the SSE merge logic. Alternatively, drop the append entirely and let SSE be the sole writer (requires confidence that SSE is always connected when the dialog closes — it is, since the `EventSource` is mounted with the board).

**Risks / unknowns**:
- If SSE is ever disabled or the EventSource is disconnected (network hiccup, proxy buffering), a "SSE-only" fix would leave the new item missing from the UI until reload. Keeping `handleItemCreated` as a fallback writer and making it idempotent is the safer path.
- `triggerStagePipeline` may mutate the item (e.g., set it `In Progress`). The client must end up holding the *latest* version; the fix should prefer the record with the newer `updatedAt` (same rule the SSE path uses).

### Dependencies
- `components/dashboard/KanbanBoard.tsx` — `handleItemCreated` (primary fix site) and the SSE merge block (reference implementation).
- `components/dashboard/NewItemDialog.tsx` — calls `onCreated`; no change expected.
- `app/api/workflows/[id]/items/route.ts` — produces the POST response (`afterPipeline ?? created`); no change expected.
- `lib/workflow-store.ts` / `lib/workflow-events.ts` — emit `item-created`; behaviour is correct, no change expected.
- No external services or other workflow items touched.

### Open Questions
1. Should `handleItemCreated` merge with the same last-writer-wins rule as the SSE handler (preferred, consistent), or should it always overwrite (simpler, but risks clobbering a fresher SSE echo)?
2. Is it worth extracting the insert-or-merge logic into a shared helper so the two code paths cannot drift again, or is inlining fine given there are only two call sites?
3. Do we want a regression test at the component level (e.g. React Testing Library firing a simulated SSE + resolved POST in either order), or is a manual verification checklist sufficient for this bug class?

## Specification

### User stories
1. As a user creating a new workflow item, I want the new card to appear exactly once in the backlog column, so that I am not confused into thinking duplicate work was created.
2. As a user, I want the visible card to reflect the latest server state of the item (including any stage-pipeline mutations such as a status flip to `In Progress`), so that the Kanban does not lie to me between SSE echo and POST response.
3. As a user with a flaky network where the SSE stream may be momentarily disconnected, I want a newly created item to still appear in the backlog without requiring a manual reload, so that creation never appears to silently fail.

### Acceptance criteria
1. **Single card on creation (SSE-then-POST order)**
   - Given the Kanban board is open with a live SSE connection,
   - When the user submits `NewItemDialog` and the `item-created` SSE event arrives before the POST promise resolves,
   - Then the backlog column contains exactly one card for the new item both before and after the POST promise resolves, with no transient duplicate visible at any frame.
2. **Single card on creation (POST-then-SSE order)**
   - Given the Kanban board is open,
   - When the POST response resolves before the `item-created` SSE event arrives,
   - Then the backlog column contains exactly one card for the new item both before and after the SSE event arrives.
3. **Latest-writer-wins merge**
   - Given two records for the same `id` reach the client (one via `onCreated`, one via SSE),
   - When their `updatedAt` timestamps differ,
   - Then the card displayed in the Kanban reflects the record with the strictly greater `updatedAt`. Records with equal `updatedAt` are treated as already up-to-date (no replacement needed).
4. **SSE-disconnected fallback**
   - Given the SSE `EventSource` is closed or has not yet (re)connected when `NewItemDialog` succeeds,
   - When the POST response resolves with the created item,
   - Then the new item still appears exactly once in the backlog column without requiring a page reload.
5. **No regression on reload**
   - Given a new item has been created in the current session,
   - When the user reloads the page,
   - Then the backlog column shows the same single card (parity with `initialItems` rehydrated from disk) with no flicker or duplicate.
6. **Idempotent re-emission**
   - Given the same `item-created` payload is delivered more than once (e.g. SSE retry, double `onCreated` call),
   - When each delivery is processed,
   - Then the rendered list still contains exactly one card for that `id`.
7. **No collateral damage to other items**
   - Given the backlog already contains other items,
   - When a new item is created,
   - Then the order, identity, and content of all pre-existing items is unchanged; only the new card is added.

### Technical constraints
- **Fix site**: `components/dashboard/KanbanBoard.tsx` — `handleItemCreated` must become idempotent by id and apply a last-writer-wins merge keyed on `WorkflowItem.updatedAt`, mirroring the SSE merge block currently at `KanbanBoard.tsx:63-74`.
- **Merge rule (single source of truth)**: For an incoming `WorkflowItem` with id `X`:
  - If no item with id `X` exists in state → append.
  - If an item with id `X` exists and `incoming.updatedAt > existing.updatedAt` → replace in place (preserve list position).
  - Otherwise → leave state unchanged (return the same array reference where possible to avoid spurious re-renders).
- **Shared helper**: Both `handleItemCreated` and the SSE `item-created` handler MUST route through one shared pure function (e.g. `mergeItem(items, incoming)`) defined in the same module, so the two paths cannot drift again. No new files are required.
- **Type contract**: Continue to use the existing `WorkflowItem` type from `types/workflow.ts`; do not introduce new fields. `updatedAt` is already populated by the server on every write.
- **No API/server changes**: `app/api/workflows/[id]/items/route.ts`, `lib/workflow-store.ts`, and `lib/workflow-events.ts` MUST NOT be modified. The POST response shape (`afterPipeline ?? created`) and the `item-created` SSE event payload are treated as fixed inputs.
- **No persistence changes**: On-disk format under `.nos/workflows/<workflow>/items/` is unchanged.
- **Performance**: The merge runs on every POST and every SSE event for the open board; it must remain O(n) over current items and avoid creating new array references when no change is made.
- **Compatibility**: Behaviour must be unchanged for `item-updated` and `item-deleted` SSE events — only the create path is in scope for this fix.

### Out of scope
- Any modification to `NewItemDialog.tsx` UX or its `onCreated` contract.
- Refactoring the SSE transport, reconnection logic, or event schema.
- Changes to stage pipeline behaviour or to the POST response body shape.
- Optimistic-UI rendering before the server confirms creation.
- Server-side deduplication or idempotency tokens on the create endpoint.
- Adding automated component/integration tests — manual verification per the acceptance criteria above is sufficient for this bug; a regression test may be added separately if desired but is not required by this requirement.
- Changes to other Kanban interactions (drag-and-drop, status edits, deletion).
