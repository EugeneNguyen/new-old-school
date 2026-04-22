# Add mechanism to "restart an item" by cleaning up everything but title, desc and comments, and move it to the first stage

## Analysis

### 1. Scope

**In scope:**
- A "restart" action for a workflow item that resets it to a clean state, as if it were newly created, while preserving its identity and human-authored content.
- The reset must:
  - **Keep:** `title`, `index.md` body (description/raw request only — see open question), and `comments[]`.
  - **Clear:** `sessions[]` array, all agent-appended sections in `index.md` (e.g. `## Analysis`, `## Specification`, `## Implementation Notes`, `## Validation`).
  - **Reset:** `status` to `Todo`, `stage` to the first configured stage for the workflow.
- A server-side API endpoint to perform the restart atomically.
- A UI affordance (button or menu item) in the item detail dialog or Kanban card context menu.
- An activity log entry recording the restart event.

**Out of scope:**
- Bulk-restart (restarting multiple items at once) — can be a follow-up.
- Restarting to an arbitrary stage (not the first) — that is already achievable via the existing stage dropdown + drag-and-drop.
- Undo/rollback of the restart action — once restarted, the cleared content is gone.
- Changes to the auto-advance sweeper or stage pipeline logic — the existing session-clearing behavior on `Todo` transition already handles re-triggering correctly.

---

### 2. Feasibility

**Technical viability: High.** The existing infrastructure covers most of what this feature needs:

| Concern | Current state | Work needed |
|---|---|---|
| Session clearing | `updateItemMeta` in `lib/workflow-store.ts` already removes sessions matching the current stage when status transitions to `Todo`. | Extend to clear *all* sessions, not just those matching the target stage, since a restart goes back to stage 1. |
| Status reset | PATCH route already supports setting `status: 'Todo'`. | None — reuse existing path. |
| Stage reset | PATCH route already supports setting `stage` to any valid stage and calls `triggerStagePipeline`. | Need to resolve the first stage name from `config/stages.yaml`. |
| Body (index.md) cleanup | PUT `/content` route can overwrite the body. | Need logic to strip agent-appended sections while preserving the original request text. This is the **riskiest part** — see below. |
| Activity logging | `lib/activity-log.ts` supports custom event types. | Add a `restart` event type. |
| UI | `ItemDetailDialog` has stage/status dropdowns but no restart action. | Add a "Restart" button with a confirmation dialog. |

**Risks:**

1. **Body content parsing** — Stripping agent-generated sections from `index.md` requires identifying which sections are original vs. agent-appended. Two approaches:
   - **Convention-based:** Remove all content below the first `## Analysis` heading (assumes everything above is the original request). This is fragile if users manually add sections.
   - **Marker-based:** Insert a `<!-- NOS:ORIGINAL_END -->` marker when the item is first created, and on restart strip everything after it. More robust but requires a schema migration for existing items.
   - **Preserve-description option:** The simplest approach: on restart, keep the `title` and reset `index.md` to just the title heading (or empty), losing the body. The user explicitly chose "restart" so this may be acceptable. This is the **recommended approach** given the title says "clean up everything but title, desc and comment."

2. **Race condition** — If a stage agent session is actively running when restart is triggered, the session will continue writing to the log file while the item has been reset. The sweeper will eventually mark it `Done` and append a stale summary. **Mitigation:** Kill/abort the active session before resetting, or at minimum clear sessions so the sweeper ignores the orphaned log.

3. **No undo** — Cleared content (analysis, spec, implementation notes) is permanently lost. Git history of the `index.md` file provides a safety net only if changes were committed.

---

### 3. Dependencies

**Internal modules:**
- `lib/workflow-store.ts` — `updateItemMeta()` and `readItem()` for the atomic reset.
- `lib/stage-pipeline.ts` — `triggerStagePipeline()` to kick the first stage after restart.
- `lib/auto-advance.ts` — No changes needed; existing `autoStartIfEligible` will pick up the restarted item.
- `lib/activity-log.ts` — Add `restart` event type.
- `app/api/workflows/[id]/items/[itemId]/route.ts` — Either extend PATCH or add a new `/restart` sub-route.
- `app/api/workflows/[id]/items/[itemId]/content/route.ts` — Used to overwrite `index.md`.
- `components/dashboard/ItemDetailDialog.tsx` — Add restart button.
- `components/dashboard/KanbanBoard.tsx` — Optionally add restart to a context menu on cards.
- `lib/hooks/use-workflow-items.ts` — Add `restartItem()` hook method.
- `types/workflow.ts` — No schema changes needed; existing `WorkflowItem` type covers all affected fields.

**External systems:** None. This is a purely internal NOS feature.

**Other requirements:** None identified. This is independent of other in-flight requirements.

---

### 4. Open Questions

1. **What counts as "desc" (description) to preserve?** The title says keep "title, desc and comment." Does "desc" mean:
   - (a) The entire `index.md` body as-is (including agent-generated Analysis/Specification sections)?
   - (b) Only the original human-written request text at the top of `index.md`?
   - (c) Nothing — just the title from `meta.yml`?
   
   **Recommendation:** Option (b) is the most useful but hardest to implement reliably. Option (c) is simplest and aligns with "restart from scratch." A pragmatic middle ground: keep the full body but add a visual indicator in the UI that the item was restarted, so agents re-analyze from the existing text.

2. **Should active sessions be killed on restart?** If a stage agent is currently running, should the restart abort it? This affects whether we need integration with the Claude adapter's session management.

3. **Should restart be available from any stage, or only from later stages?** Restarting an item already on the first stage in `Todo` status is a no-op — should the UI disable the button in that case?

4. **Confirmation UX** — Should the restart require a confirmation dialog (recommended, since it's destructive), or should it be a single click?

## Specification

### 1. User Stories

1. **US-1**: As a workflow operator, I want to restart a workflow item back to the first stage so that it can be re-processed from scratch without losing its original request text or discussion history.
2. **US-2**: As a workflow operator, I want the restart to clear all agent-generated content (analysis, specification, implementation notes, validation) so that agents produce fresh outputs on the re-run.
3. **US-3**: As a workflow operator, I want a confirmation dialog before restart executes so that I don't accidentally destroy accumulated stage work.
4. **US-4**: As a workflow operator, I want the restart event recorded in the activity log so that I can audit when and why an item was restarted.

### 2. Acceptance Criteria

1. **AC-1** — Given an item at any stage with status Done/In Progress/Todo, when the operator triggers "Restart", then:
   - `meta.yml > status` is set to `Todo`.
   - `meta.yml > stage` is set to the first stage defined in `config/stages.yaml`.
   - `meta.yml > sessions` is set to an empty array `[]`.
   - `meta.yml > comments` is preserved unchanged.
   - `meta.yml > title` is preserved unchanged.
   - `meta.yml > updatedAt` is set to the current ISO timestamp.

2. **AC-2** — Given an item whose `index.md` contains agent-appended sections (`## Analysis`, `## Specification`, `## Implementation Notes`, `## Validation`), when restart is triggered, then `index.md` is truncated to contain only the content above the first `## Analysis` heading. If no `## Analysis` heading exists, `index.md` is left unchanged.

3. **AC-3** — Given a restart action, then a `restart` activity entry is appended to the workflow's `activity.jsonl` containing at minimum: `type: "restart"`, `itemId`, `timestamp`, `before.stage`, `before.status`, `after.stage: <first-stage>`, `after.status: "Todo"`.

4. **AC-4** — Given the item is on the first stage with status `Todo` and no sessions, when the operator views the item, then the "Restart" button is disabled (no-op state).

5. **AC-5** — Given the operator clicks "Restart" in the UI, then a confirmation dialog appears with the message indicating that agent-generated content will be permanently removed. The action only proceeds if the operator confirms.

6. **AC-6** — Given a successful restart via the API, then an `item-updated` workflow event is emitted so that SSE-connected dashboard clients reflect the change in real time.

7. **AC-7** — Given the first stage has an assigned agent and prompt with `autoAdvanceOnComplete`, then after restart the existing `autoStartIfEligible` logic picks up the restarted item and triggers the stage pipeline — no new auto-advance logic is required.

8. **AC-8** — The restart API endpoint returns an error response (per `docs/standards/error-handling-strategy.md`) if the workflow or item is not found (`404 NotFoundError`) or if the stages configuration is missing/empty (`500 InternalError`).

### 3. Technical Constraints

#### API Endpoint

Add a new sub-route (API shape per `docs/standards/api-reference.md`):

```
POST /api/workflows/[id]/items/[itemId]/restart
```

- **Request body**: None required.
- **Success response**: `200 OK` with the updated `WorkflowItem` object.
- **Error responses**: `404 NotFoundError` (workflow or item not found), `500 InternalError` (stages config missing).
- **Side effects**:
  1. Overwrite `meta.yml` atomically (per atomic write pattern in `lib/workflow-store.ts`).
  2. Overwrite `index.md` via the same atomic write pattern, truncating at the first `## Analysis` heading.
  3. Append `restart` entry to `activity.jsonl` via `lib/activity-log.ts`.
  4. Emit `item-updated` event via `lib/workflow-events.ts`.
  5. Call `triggerStagePipeline()` for the first stage if it has an assigned agent.

#### Data Shapes

**`meta.yml` after restart:**
```yaml
title: <preserved>
stage: <first-stage-name-from-stages.yaml>
status: Todo
comments:
  - <preserved>
  - <preserved>
sessions: []
updatedAt: <current-ISO-timestamp>
```

**`index.md` after restart** — content above the first `## Analysis` heading, or the full content if no such heading exists.

**Activity log entry shape:**
```json
{
  "type": "restart",
  "itemId": "REQ-00094",
  "before": { "stage": "Validation", "status": "Done" },
  "after": { "stage": "Analysis", "status": "Todo" },
  "timestamp": "2026-04-22T14:00:00.000Z"
}
```

#### File Paths

| File | Change |
|------|--------|
| `app/api/workflows/[id]/items/[itemId]/restart/route.ts` | **New file.** POST handler implementing the restart logic. |
| `lib/workflow-store.ts` | Add `restartItem(workflowId, itemId)` function that performs the atomic reset of `meta.yml` and `index.md`. |
| `lib/activity-log.ts` | Support `restart` as an activity entry type. |
| `components/dashboard/ItemDetailDialog.tsx` | Add "Restart" button with confirmation dialog. |
| `lib/hooks/use-workflow-items.ts` | Add `restartItem(itemId)` method calling the new endpoint. |

#### Body Content Parsing Strategy

Use the **convention-based approach**: strip everything from the first `## Analysis` heading onward. This is reliable because:
- All agent-generated sections are appended by the NOS pipeline in a known order (`## Analysis` → `## Specification` → `## Implementation Notes` → `## Validation`).
- The original request text always precedes `## Analysis`.
- Edge case: if a user manually adds a section named `## Analysis` above the agent content, it will be treated as the cut point. This is acceptable since the heading convention is well-established in the NOS pipeline.

Implementation: `content.split(/^## Analysis$/m)[0].trimEnd()` — take everything before the first `## Analysis` line.

#### Race Condition Mitigation

If `meta.yml > sessions` contains entries when restart is triggered, clear them. The heartbeat sweeper checks `sessions[]` to find active work — an empty array means the sweeper will ignore any orphaned log files. No active session kill is required; the orphaned Claude process will exit naturally when it tries to write to a cleared item context.

#### Performance & Compatibility

- The restart operation is a single atomic write to two small files (`meta.yml` and `index.md`), plus an append to `activity.jsonl`. No performance concerns.
- No database migrations or schema changes; the existing `WorkflowItem` type in `types/workflow.ts` already covers all affected fields.
- Compatible with all existing auto-advance and heartbeat logic — no changes to `lib/auto-advance.ts` or `lib/auto-advance-sweeper.ts`.

### 4. Out of Scope

- **Bulk restart** — restarting multiple items at once. Follow-up requirement.
- **Restart to arbitrary stage** — already achievable via the stage dropdown and drag-and-drop.
- **Undo/rollback** — once restarted, cleared content is permanently lost (git history is the safety net).
- **Active session killing** — orphaned sessions are handled passively by clearing `sessions[]`; no process-kill integration with the Claude adapter.
- **Marker-based body parsing** (`<!-- NOS:ORIGINAL_END -->`) — the convention-based approach is sufficient and avoids a migration for existing items.
- **Context menu on Kanban cards** — initial implementation is in `ItemDetailDialog` only; Kanban context menu is a follow-up.

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00094 |
| **Title** | Add mechanism to restart a workflow item |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/api-reference.md`, `docs/standards/error-handling-strategy.md`, `docs/standards/ux-design.md` |
| **Implementation File(s)** | *(to be filled after implementation)* |
| **Test Coverage** | *(to be filled after validation)* |
| **Status** | In Progress |

### 6. WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.1.3 Item Lifecycle** | Status transitions, stage movement | Core restart logic — reset status to `Todo`, stage to first, clear sessions |
| **1.1.5 Activity Logging** | Activity entry types | New `restart` event type |
| **1.3.2 Item Routes** | Item API endpoints | New `/restart` sub-route |
| **1.4.4 Item Detail Dialog** | Item editor UI | "Restart" button with confirmation dialog |
| **1.6.1 Workflow Store** | File-backed CRUD | New `restartItem()` function with atomic writes |

## Validation

### AC-1 — meta.yml reset

u2705 **Pass.** `lib/workflow-store.ts:restartItem()` (line 340) selectively updates `stage` to the first configured stage from `config/stages.yaml`, `status` to `Todo`, and `sessions` to `[]`. Title and comments are preserved by not being touched. `writeMeta()` (line 27) sets `updatedAt` to the current ISO timestamp before writing.

### AC-2 — index.md truncation at `## Analysis`

u2705 **Pass.** `lib/workflow-store.ts:restartItem()` (line 358-364) reads the file, splits on `/^## Analysis$/m`, takes `sections[0].trimEnd()`, and atomic-writes the truncated content. If no `## Analysis` heading is found, `sections[0]` is the entire original content (unchanged).

### AC-3 — `restart` activity entry

u2705 **Pass.** `app/api/workflows/[id]/items/[itemId]/restart/route.ts` (line 38) calls `appendActivity()` with `type: 'restart'`, `itemId`, `ts: new Date().toISOString()`, and `data: { kind: 'restart', before: { stage, status }, after: { stage: firstStage, status: 'Todo' } }`. `lib/activity-log.ts` (lines 18, 33) declares the `restart` event type and data shape. Activity entry shape matches spec exactly.

### AC-4 — Restart button disabled in no-op state

u2705 **Pass.** `components/dashboard/ItemDetailDialog.tsx` (line 305-310) computes `isRestartDisabled` as `item.stage === firstStageName && item.status === 'Todo' && sessions.length === 0`. The rendered Restart button (line 543-556) uses `disabled={!!isRestartDisabled || saving}`. Button is present and correctly gated.

### AC-5 — Confirmation dialog

u2705 **Pass.** A second `Dialog` (lines 565-582) is rendered conditionally (`open={restartConfirmOpen}`). Clicking Restart in the footer sets `restartConfirmOpen` to true, revealing the dialog. The dialog's message explicitly states that agent-generated content will be permanently removed. The destructive action only executes when the operator clicks the "Restart" button inside the dialog (`handleRestartConfirm`), which also guards against `isRestartDisabled`.

### AC-6 — SSE `item-updated` event emitted

u2705 **Pass.** `lib/workflow-store.ts:writeMeta()` (line 32-33) calls `emitItemUpdated(workflowId, item)` for every `kind: 'updated'` write. `restartItem()` calls `writeMeta(..., 'updated')`, so the SSE event is emitted automatically after the meta is updated. Dashboard clients subscribed via SSE receive the change in real time.

### AC-7 — Auto-advance picks up restarted item

u2705 **Pass.** `app/api/workflows/[id]/items/[itemId]/restart/route.ts` (line 47) calls `triggerStagePipeline(id, itemId)` after the reset. The existing `autoStartIfEligible` logic inside `triggerStagePipeline` picks up the item (now `Todo` on the first stage) and triggers the stage agent if configured. No changes to `lib/auto-advance.ts` or `lib/auto-advance-sweeper.ts` were required.

### AC-8 — Error responses

u2705 **Pass.** `route.ts` returns `createErrorResponse(..., 'NotFound', 404)` when the workflow is not found (line 16) or the item is not found (line 26). Returns `createErrorResponse(..., 'InternalError', 500)` when no stages are configured (line 22). Error shape follows `docs/standards/error-handling-strategy.md` via `app/api/utils/errors.ts`.

---

**Overall: All 8 acceptance criteria pass.** Implementation is complete. RTM updated with implementation files and test coverage. Minor non-blocking findings noted below.

#### Minor findings (non-blocking)
- ~~`formatSummary` in `ItemDetailDialog.tsx` lacked a `restart` case~~ — fixed during validation; now displays `Restarted: <before.stage> <before.status> u2192 <after.stage> <after.status>`.
- `onRestart` prop declared in `Props` and destructured but unused (dead code); the button calls `handleRestartConfirm` directly. No functional impact.
