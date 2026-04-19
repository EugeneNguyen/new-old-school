if autoAdvanceOnComplete is enabled in a stage, when an item status changed to done, it should be moved to the next stage automatically

## Analysis

### Context (observed)
- `Stage` already carries `autoAdvanceOnComplete?: boolean | null` (`types/workflow.ts:6-11`) and the field is parsed from `stages.yaml` into the runtime stage list (`lib/workflow-store.ts:96`). `.nos/workflows/requirements/config/stages.yaml` sets it to `true` for `Analysis`, `Documentation`, `Implementation`, `Validation`, and `null` for terminal `Backlog` / `Done`.
- The UI already exposes this toggle per stage (`components/dashboard/StageDetailDialog.tsx`), and a PATCH route writes it back (`app/api/workflows/[id]/stages/[stageName]/route.ts`). So the data path for *configuring* the flag is done; this requirement is only about *honoring* it.
- Status is mutated through one API surface: `PATCH /api/workflows/[id]/items/[itemId]` → `updateItemMeta` (`app/api/workflows/[id]/items/[itemId]/route.ts:65-77,90-98`, `lib/workflow-store.ts:194-215`). Today only a `stage` change triggers the pipeline (`route.ts:94-97`); a status-only change does not. This gating is deliberate (per REQ-00017 AC-9) and is what prevents the agent's own `nos-set-status` call from recursing.
- `updateItemMeta` already has stage-change handling: when `patch.stage` differs from the current stage and no explicit `status` is passed, it resets status to `Todo` (`workflow-store.ts:210-212`). This is exactly what the pipeline needs — `triggerStagePipeline` starts an agent only when `item.status === 'Todo'` (`lib/stage-pipeline.ts:12`). So, if auto-advance sets `stage = <next>` without passing `status`, the reset-to-Todo + pipeline-kick path is already correctly wired.
- Typical callers of `nos-set-status --status "Done"` are agents driven by the NOS system prompt (REQ-00017). Manual Done flips also happen from the UI: `ItemDetailDialog` writes status via the same PATCH, and KanbanBoard only issues stage PATCHes — it never sets status directly.
- The `requirements` workflow has a terminal `Done` stage (`stages.yaml:105-108`) with `autoAdvanceOnComplete: null`, but workflows in general are not required to have one. "Next stage" has to be defined defensively.

### 1. Scope

**In scope**
- Detect, at the moment an item's `status` transitions to `Done`, whether the item's *current* stage has `autoAdvanceOnComplete === true`.
- If so, move the item to the next stage in `stages.yaml` order and reset its status to `Todo` so the existing pipeline gate can pick it up; if the new stage has a non-null `prompt`, that triggers an agent run for the new stage (same codepath as a manual drag-between-columns move in `KanbanBoard`).
- If the current stage is the *last* stage in the list, do nothing extra — the item stays at `Done` on the final stage. Same behavior if the next stage does not exist for any other reason (defensive).
- Preserve the existing `Todo`-gated pipeline trigger on stage changes (`route.ts:94-97`). The auto-advance should flow through the same mechanism, not invent a parallel one.
- Emit a normal `item-updated` SSE event for the new state so the Kanban board refreshes live (already handled by `writeMeta` → `emitItemUpdated`).

**Out of scope**
- Auto-advance on any status other than `Done` (e.g. "move forward when status becomes `In Progress`").
- Skipping stages, conditional routing, or multi-step advance in a single status flip. "Next stage" means exactly the next element in `stages.yaml`.
- A stage-level `autoAdvanceOnComplete` that also *starts* the next agent when the next stage has no prompt — the existing pipeline already no-ops on `!stage.prompt`.
- Changes to the UI for this feature. The flag is already editable in `StageDetailDialog`.
- Per-item opt-out of auto-advance.
- Auto-advance on the *final* stage (cannot happen — there is nowhere to go). Likewise for stages where `next.prompt` is null (e.g. `Done`): we still move, but nothing runs, which is the desired end-of-pipeline state.
- Retroactive advancement: items that are *already* `Done` at the time this ships are untouched.
- Preventing manual Done flips from auto-advancing. Auto-advance should fire on any transition into `Done`, regardless of source (agent-driven via `nos-set-status`, UI dropdown in `ItemDetailDialog`, or direct PATCH).
- Moving items out of `Done` when the flag is later toggled off.
- Logging/auditing who/what triggered the advance beyond the normal `updatedAt` bump.

### 2. Feasibility

Technically small and low-risk. All primitives exist:

- `readStages(workflowId)` returns the ordered `Stage[]` list with `autoAdvanceOnComplete` already parsed.
- `updateItemMeta` already performs a combined stage-change + status reset atomically in one `meta.yml` write.
- `triggerStagePipeline` is already called post-write when a stage change is PATCHed — piggyback on the same call.

**Preferred implementation site.** Put the auto-advance logic inside the PATCH handler (`app/api/workflows/[id]/items/[itemId]/route.ts`) after the first `updateItemMeta` resolves. Rationale: the handler already owns cross-cutting concerns (pipeline triggering on stage change). Adding the advance inside `lib/workflow-store.ts:updateItemMeta` would bury a behavioral rule inside a CRUD helper and also couple the store to `triggerStagePipeline`, which it does not import today. Route-level keeps concerns separate.

**Algorithm (sketch).**
1. Parse the incoming patch as usual and call `updateItemMeta(...)`.
2. If the patch set `status === 'Done'` (and the result's `status` is actually `Done`), look up the updated item's current stage in the stages list.
3. If that stage has `autoAdvanceOnComplete === true` and has a *successor* stage, issue a second `updateItemMeta` with `{ stage: <successor> }` (no status passed, so the store resets to `Todo`).
4. Call `triggerStagePipeline(id, itemId)` — same behavior as a user-initiated stage move. If the successor's `prompt` is null (e.g. `Done`), the pipeline is a no-op, which is correct.
5. Return the *final* item from the PATCH response so the UI receives the advanced state in one round trip.

**Risks / unknowns**
- **Status-only PATCH must keep not-retriggering the pipeline** (per REQ-00017 AC-9). The change above only triggers the pipeline via the *second* `updateItemMeta`, which is a stage change — so the existing recursion guard still holds. Regular `nos-set-status --status "Done"` calls without auto-advance still do not kick the pipeline.
- **Idempotency on the terminal stage.** If the current stage has no successor (last stage), the route must no-op the advance instead of throwing or moving to an invalid stage. Bounds check is trivial.
- **Idempotency on already-Done items.** If someone PATCHes `status: 'Done'` on an item that's already `Done`, should we re-advance? The safer rule: only auto-advance when the transition is `Todo | In Progress → Done`, not `Done → Done`. Requires reading the item's *prior* status inside `updateItemMeta` (or checking from within the route before the first write). Otherwise an idempotent skill call could yo-yo the item across multiple stages. Flagged as OQ1.
- **Interaction with the agent-driven status flip** (REQ-00017 system prompt). The agent flips status to `Done` at the end of every run on every intermediate stage (Analysis, Documentation, …). That is exactly the intended trigger for this requirement — the agent no longer needs to know about stage advancement at all. Before this ships, an Analysis-stage agent that flipped to `Done` would leave the item stranded; after this ships, it auto-advances to Documentation and fires that stage's agent. **This is the feature.** Worth calling out as the primary integration point rather than a side effect.
- **Stage names that no longer exist** (someone deleted or renamed the "current" stage in `stages.yaml` between item creation and advance time). If the item's current stage is not found in the list, don't advance. Defensive.
- **`autoAdvanceOnComplete: null` vs `false`.** Treat both as "do not advance." Only the literal boolean `true` opts in. Matches how the UI's checkbox already works (`StageDetailDialog` writes `true | false | null`).
- **Race between two concurrent `Done` PATCHes** on the same item. `updateItemMeta` is a full-rewrite atomic (`atomicWriteFile`), but the read-advance-write sequence inside the route is not atomic across two PATCHes. Worst case: double-advance by one stage extra. Low probability for a single-user local tool; document as a known limitation and revisit if it ever bites.
- **Testing surface.** Matches the project's existing "manual verification via a throwaway item" style (per REQ-00017 spec). Primary check: trigger a pipeline on a `Todo` item in an `autoAdvance`-flagged stage, wait for the agent to flip status to `Done`, observe the item jumps to the next column and its new-stage agent fires.

No spikes required.

### 3. Dependencies

- **Files to modify**
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — after the initial `updateItemMeta`, detect transition-to-Done, check the stage's `autoAdvanceOnComplete`, perform the second `updateItemMeta({ stage: next })`, call `triggerStagePipeline`, and return the final state.
- **Files to read / confirm, not modify**
  - `lib/workflow-store.ts` — confirm `updateItemMeta`'s stage-change-resets-status-to-Todo path is still in place and still the right behavior for auto-advance (yes).
  - `lib/stage-pipeline.ts` — confirm the `status === 'Todo'` gate is preserved and that `!stage.prompt` still short-circuits cleanly for terminal stages (yes).
  - `types/workflow.ts` — no changes needed; `autoAdvanceOnComplete` already exists on `Stage`.
  - `.nos/workflows/requirements/config/stages.yaml` — already configured with the flag for the right stages; no data-file changes required for this workflow.
  - `components/dashboard/KanbanBoard.tsx` — confirm it consumes `WorkflowItem` updates via the SSE event stream and the PATCH response, so the column-jump will be reflected without extra UI code (`emitItemUpdated` path already covers this).
- **Related requirements**
  - REQ-00015 (Editable Stage Information from Kanban Column) introduced the `autoAdvanceOnComplete` field on stages. This requirement activates it.
  - REQ-00017 (NOS system prompt) is the primary producer of the `Done` status flips that this requirement will key off of. The two are tightly coupled — without REQ-00017 in place, auto-advance only fires when the user manually picks Done.
  - REQ-00014 (skills) — `nos-set-status` is the concrete CLI the agent uses to reach this code path.
  - REQ-016 (Stage Prompt Pipeline) defined `triggerStagePipeline`, which this requirement reuses unchanged.
- **External systems**: none.
- **New packages**: none.

### 4. Open questions

1. **Transition detection: read prior status?** Should "auto-advance on Done" fire on *every* PATCH that leaves the status as `Done`, or only on the transition `prior !== 'Done' → 'Done'`? Recommendation: only on the transition — read the item's current status inside `updateItemMeta` (or inside the route before the first write) and skip the advance if it was already `Done`. Prevents yo-yo moves from idempotent skill calls and matches the word "changed" in the raw request.
2. **Where exactly the bookkeeping lives.** Route-level (recommended above) vs pushed into `updateItemMeta` as a single atomic write vs a new helper `advanceIfComplete(workflowId, itemId)`. Recommendation: route-level for the reasons in §2; revisit if a second caller (e.g. a future CLI) needs the same behavior.
3. **Should `triggerStagePipeline` be awaited or fire-and-forget for the auto-advance path?** Today the PATCH route awaits it on manual stage moves and returns the post-pipeline item. Same behavior here seems right — keeps the UI's post-Done snapshot coherent. Confirm.
4. **Last-stage behavior with `autoAdvanceOnComplete: true`.** If someone turns the flag on for the terminal stage (e.g. `Done`), there is no successor. Recommendation: silently no-op. Do not error, do not wrap around.
5. **Skipping no-op stages?** If the next stage's `prompt` is null (e.g. an intermediate "Approved" column), we still move the item but no agent runs. Is that the desired end state, or should auto-advance *keep hopping* until it lands on a stage with a prompt or the terminal stage? Recommendation: single-hop only. Multi-hop is a separate feature (and would need cycle protection).
6. **Events emitted to the Kanban UI.** One combined update or two discrete ones (status-to-Done, then stage-advanced)? The two-write implementation above naturally emits two `item-updated` events. The UI should handle that fine (each event contains the full item). Flag for confirmation; if flicker is observed, collapse into a single write in `updateItemMeta`.
7. **Auto-advance on a manual UI Done flip.** The feature description is source-agnostic, so it will fire on both agent- and user-driven Done flips. Confirm that is desired (it arguably is — a user marking something Done is an implicit "ready for next stage" signal), or gate to agent-only by requiring some marker (e.g. the presence of a session in the current stage). Recommendation: source-agnostic, matching the literal spec.
8. **Backwards compatibility.** Items that are currently sitting at `Done` on an intermediate stage (possible after REQ-00017 landed but before this) will not be swept forward by this change — only *new* transitions into `Done` advance. Is a one-time sweep desired? Recommendation: no; if needed it is a trivial follow-up script, and there is no evidence in the repo of stranded items today.

## Specification

### User stories

1. As an **agent running in a stage pipeline**, I want the item I just finished (status flipped to `Done`) to automatically move to the next stage, so that the next stage's agent is kicked off without requiring me to know about stage ordering.
2. As a **user watching the Kanban board**, I want items whose stage has `autoAdvanceOnComplete = true` to hop to the next column as soon as their status becomes `Done`, so that I do not have to drag them manually to keep the pipeline flowing.
3. As a **user who manually flips an item to `Done` via the item detail dialog**, I want the item to auto-advance when the current stage opts in, so that manual and agent-driven completions behave identically.
4. As a **workflow author**, I want to opt a stage out of auto-advance by leaving `autoAdvanceOnComplete` as `false` or `null`, so that terminal or review-gated stages do not move items forward on their own.
5. As a **developer of the NOS harness**, I want status-only PATCHes that do not cross a Done boundary to continue not retriggering the stage pipeline (per REQ-00017 AC-9), so that the existing recursion guard for agent-driven `nos-set-status` calls is preserved.

### Acceptance criteria

Given/When/Then. The "current stage" is the value of `item.stage` immediately before the PATCH under test. The "next stage" is the element immediately after the current stage in the array returned by `readStages(workflowId)`.

1. **Agent-driven advance fires.** *Given* an item whose current stage has `autoAdvanceOnComplete === true` and a non-last index in `stages.yaml`, *and* whose status is `Todo` or `In Progress`, *when* `PATCH /api/workflows/:id/items/:itemId` is called with body `{ "status": "Done" }`, *then* after the request completes the item's `stage` equals the next stage's `name`, its `status` equals `Todo`, and `updatedAt` is newer than it was before the request.

2. **Pipeline runs for the new stage.** *Given* AC-1's conditions *and* the next stage has a non-null `prompt`, *when* the PATCH completes, *then* `triggerStagePipeline(workflowId, itemId)` is invoked exactly once for the advance, and (per REQ-016) a stage session starts for the new stage with the new stage's prompt.

3. **Flag off: no advance.** *Given* an item whose current stage has `autoAdvanceOnComplete === false` or `null`, *when* PATCH sets `status` to `Done`, *then* the item's `stage` is unchanged, `status` is `Done`, and `triggerStagePipeline` is NOT invoked for this PATCH.

4. **Terminal stage: no advance.** *Given* an item on the last stage in `readStages(workflowId)` (regardless of its `autoAdvanceOnComplete` value), *when* PATCH sets `status` to `Done`, *then* the item's `stage` is unchanged, `status` is `Done`, no error is thrown, and `triggerStagePipeline` is NOT invoked for this PATCH.

5. **Idempotent Done PATCH does not re-advance.** *Given* an item whose `status` is already `Done` on a stage with `autoAdvanceOnComplete === true`, *when* PATCH is called again with `{ "status": "Done" }`, *then* the item's `stage` is unchanged and no advance occurs. Only the transition `prior.status !== 'Done'` → `next.status === 'Done'` triggers auto-advance. (Resolves OQ1.)

6. **Manual UI Done flip also advances.** *Given* AC-1's stage/flag conditions, *when* the user changes the status dropdown in `ItemDetailDialog` from `In Progress` to `Done`, *then* the behavior is identical to AC-1 (same PATCH endpoint, same advance, same pipeline trigger). (Resolves OQ7.)

7. **Next stage with null prompt still advances, no agent runs.** *Given* AC-1's conditions but the next stage has `prompt: null`, *when* the PATCH completes, *then* the item's `stage` equals the next stage and `status` equals `Todo`, *and* `triggerStagePipeline` is invoked but starts no session (existing `!stage.prompt` short-circuit in `lib/stage-pipeline.ts`). No multi-hop. (Resolves OQ5.)

8. **Unknown current stage: no advance.** *Given* an item whose `stage` is not present in the current `readStages(workflowId)` result (renamed/deleted stage), *when* PATCH sets `status` to `Done`, *then* the status update still succeeds and the stage is left unchanged; no advance occurs and no error is thrown.

9. **Status-only PATCH without crossing into Done still does not trigger pipeline.** *Given* the route's existing REQ-00017 AC-9 guarantee, *when* PATCH sets `status` to `Todo` or `In Progress`, *then* `triggerStagePipeline` is NOT invoked. This requirement must not weaken that guarantee. (Only the second, stage-changing `updateItemMeta` performed by auto-advance is allowed to reach the pipeline.)

10. **Stage-only PATCH behavior is unchanged.** *Given* the existing behavior where PATCH with `{ "stage": "<other>" }` triggers the pipeline and resets status to `Todo`, *when* such a PATCH is issued, *then* behavior is byte-for-byte unchanged by this requirement.

11. **PATCH response reflects final state.** *When* an auto-advance fires as part of a PATCH, *then* the JSON body of the PATCH response contains the item with its new `stage`, new `status` (`Todo`), and updated `updatedAt` — not the intermediate `{ stage: <old>, status: 'Done' }` state.

12. **SSE events are emitted.** *When* an auto-advance fires, *then* the workflow's event stream emits at least one `item-updated` event carrying the final post-advance item state. If two writes occur (status→Done then stage→next with status reset to Todo), two `item-updated` events MAY be emitted; the Kanban UI already handles this correctly (each event carries the full item). (Resolves OQ6 as "two events acceptable"; flicker is not an acceptance failure.)

13. **No regression: manual drag still works.** *Given* the Kanban drag-between-columns flow issues `PATCH` with `{ stage: '<next>' }`, *when* that PATCH runs, *then* it still resets status to `Todo` and triggers the pipeline exactly as before.

14. **Concurrent Done PATCHes.** *Given* two concurrent PATCHes with `{ status: 'Done' }` on the same item, *then* the system may at worst advance the item one stage further than a single-PATCH flow would. The system MUST NOT corrupt `meta.yml`, leave it unparsable, or advance the item past the terminal stage. (Limitation acknowledged, not required to be fully transactional.)

### Technical constraints

- **Implementation site.** Logic lives in `app/api/workflows/[id]/items/[itemId]/route.ts`, in the `PATCH` handler, after the initial `updateItemMeta(...)` call resolves. Do NOT move this logic into `lib/workflow-store.ts` — the store is a CRUD helper and must not depend on `lib/stage-pipeline.ts`. (Resolves OQ2.)
- **No new exports or helpers** are required. Do not introduce `advanceIfComplete(...)` or similar; a single inline block in the PATCH handler is sufficient and keeps the two current call paths (stage-change pipeline trigger, new auto-advance) co-located.
- **Detection rule.** Auto-advance fires if and only if ALL of the following hold after the first `updateItemMeta`:
  1. The incoming patch included `status === 'Done'` (string equality, case-sensitive).
  2. The item's status **before** that write was not already `'Done'` (transition detection — read the prior item via `readItem` / equivalent before the first write, or surface the prior status from `updateItemMeta`).
  3. The item's post-write status is `'Done'` (sanity check).
  4. `readStages(workflowId)` contains an entry whose `name` equals the item's current `stage`.
  5. That stage's `autoAdvanceOnComplete === true` (strict boolean equality — `null` and `false` do not qualify).
  6. The stage's index in the array is strictly less than `stages.length - 1` (i.e. there is a successor).
- **Advance mechanism.** Call `updateItemMeta(workflowId, itemId, { stage: next.name })` with no `status` field. This relies on the existing reset-to-Todo behavior in `lib/workflow-store.ts:updateItemMeta` when `patch.stage !== current.stage && patch.status === undefined`. Do not pass `status: 'Todo'` explicitly — rely on the store's existing invariant so both code paths stay identical.
- **Pipeline trigger.** After the second `updateItemMeta` resolves, `await triggerStagePipeline(workflowId, itemId)` — same call, same position, same awaited semantics as the existing manual stage-move path in the route. (Resolves OQ3.)
- **Response body.** Return the item object resolved from the *second* `updateItemMeta` (or a fresh `readItem` after the pipeline trigger if that's how manual stage-moves currently shape their response). Do not return the intermediate `Done`-on-old-stage snapshot.
- **Single-hop only.** After advancing once, do NOT re-enter the auto-advance check for the new stage in the same PATCH, even if the new stage is also flagged and its status somehow ends up `Done`. The feature is exactly one stage forward per PATCH. (Resolves OQ5.)
- **Type signatures.** No changes to `Stage`, `WorkflowItem`, or `updateItemMeta`'s signature. `autoAdvanceOnComplete: boolean | null | undefined` on `Stage` already exists in `types/workflow.ts`.
- **Files touched.**
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — modify PATCH handler.
  - No other source files should change to satisfy this requirement.
- **Data files.** No changes to `.nos/workflows/*/config/stages.yaml`. The `requirements` workflow already flags `Analysis`, `Documentation`, `Implementation`, `Validation` with `autoAdvanceOnComplete: true`; those entries are the feature's primary consumers.
- **Performance.** Adds at most one extra `readStages` call and one extra `updateItemMeta` write per qualifying PATCH. Neither is hot-path; no caching required.
- **Compatibility.** Behavior of PATCHes that do not include `status === 'Done'` is unchanged. Behavior of PATCHes that include `stage: <x>` is unchanged. Only the specific transition-into-Done case gains new behavior.

### Out of scope

- Auto-advance on any other status transition (`Todo → In Progress`, `In Progress → Todo`, etc.).
- Multi-hop advance / cycle protection / conditional routing. One PATCH advances at most one stage.
- A retroactive sweep of items already stuck at `Done` on an intermediate stage prior to this change. (Resolves OQ8.)
- A per-item opt-out of auto-advance.
- UI changes: `StageDetailDialog` already edits `autoAdvanceOnComplete`; `ItemDetailDialog` already edits status; `KanbanBoard` already consumes `item-updated` SSE events and renders stage/column changes. No UI code is required to land this feature.
- A new `advanceIfComplete(...)` helper or CLI-callable equivalent.
- Changes to the agent's system prompt (REQ-00017). The agent continues to flip to `Done` at the end of each stage; this requirement supplies the advance on top of that.
- Audit logging, notifications, or any record of "auto-advanced by system" distinct from the normal `updatedAt` bump.
- Collapsing the two `updateItemMeta` writes into a single atomic write inside the store. May be revisited if AC-12's two-event emission causes visible UI flicker, but is explicitly not a requirement here.
- Guarding against fully-concurrent Done PATCHes beyond the at-worst-one-extra-hop behavior described in AC-14. True transactional locking is out of scope.

## Implementation Notes

- Added auto-advance logic to `app/api/workflows/[id]/items/[itemId]/route.ts` inside the `PATCH` handler, immediately after the existing stage-change pipeline-trigger branch. No other source files were modified.
- Before the first `updateItemMeta`, the handler now reads `priorStatus` via `readItem` so transition detection (`priorStatus !== 'Done' → updated.status === 'Done'`) can avoid re-advancing on idempotent `{ status: 'Done' }` PATCHes (AC-5).
- Auto-advance fires only when: `patch.status === 'Done'`, `priorStatus !== 'Done'`, `updated.status === 'Done'`, the item's current stage is found in `readStages`, that stage's `autoAdvanceOnComplete === true`, and the stage has a successor (`currentIdx < stages.length - 1`). Matches the spec's Detection rule exactly.
- Advance performs `updateItemMeta(id, itemId, { stage: next.name })` with no `status` field, relying on the stage-reset-to-Todo invariant in `lib/workflow-store.ts` so the pipeline's `status === 'Todo'` gate (`lib/stage-pipeline.ts:12`) picks it up. Then `await triggerStagePipeline(id, itemId)` runs and the PATCH response returns the post-pipeline item (AC-11).
- The existing stage-change branch is untouched and still takes precedence: a PATCH with `stage` set never enters the auto-advance block (AC-10, AC-13).
- Status-only PATCHes that don't cross into Done still don't call the pipeline, preserving REQ-00017 AC-9.
- Single-hop only: after one advance the handler returns — no re-entry check on the new stage.
- No type changes, no new helpers, no data-file changes. `Stage.autoAdvanceOnComplete` already existed from REQ-00015.

## Validation

Verdicts are based on code inspection of the PATCH handler in `app/api/workflows/[id]/items/[itemId]/route.ts:35-124`, the store helper `lib/workflow-store.ts:194-215`, the pipeline gate `lib/stage-pipeline.ts:6-44`, the SSE emission via `writeMeta` → `emitItemUpdated` (`lib/workflow-store.ts:18-30`), and the two UI callers (`components/dashboard/KanbanBoard.tsx:103-105`, `components/dashboard/ItemDetailDialog.tsx:90-102`). No tests exist in this project; verification is by trace, matching the project's documented validation style.

1. **AC-1 — Agent-driven advance fires.** ✅ Pass. `priorStatus` is captured at `route.ts:90`; after `updateItemMeta` writes `status=Done`, the block at `route.ts:101-117` detects the transition, finds `currentIdx`, confirms `autoAdvanceOnComplete === true`, and writes `{ stage: next.name }` without a `status` field. `lib/workflow-store.ts:210-212` then resets status to `Todo`. `updatedAt` is bumped by the second `writeMeta`.

2. **AC-2 — Pipeline runs for the new stage.** ✅ Pass. `triggerStagePipeline` is awaited once after the advance (`route.ts:113`). With the new stage's status now `Todo` and its `prompt` non-null (e.g. Analysis→Documentation in `stages.yaml`), the gate at `lib/stage-pipeline.ts:12-16` passes and a session starts.

3. **AC-3 — Flag off: no advance.** ✅ Pass. The check `current.autoAdvanceOnComplete === true` at `route.ts:110` is a strict boolean comparison; `false` and `null` fall through and the handler returns the Done-on-current-stage state without calling the pipeline.

4. **AC-4 — Terminal stage: no advance.** ✅ Pass. `currentIdx < stages.length - 1` at `route.ts:108` excludes the last stage. `Done` is the last stage in `.nos/workflows/requirements/config/stages.yaml:105-108`; even though its `autoAdvanceOnComplete` is `null`, the index guard also protects future workflows whose terminal stage mistakenly sets the flag.

5. **AC-5 — Idempotent Done PATCH does not re-advance.** ✅ Pass. `priorStatus !== 'Done'` at `route.ts:103` blocks the second-Done case. A repeat `{ status: 'Done' }` PATCH writes a same-value status through `updateItemMeta` and returns without entering the auto-advance block.

6. **AC-6 — Manual UI Done flip also advances.** ❌ Fail. `components/dashboard/ItemDetailDialog.tsx:90-102` always includes `stage` in the PATCH body (alongside `status`, `title`, `comments`), even when the stage is unchanged. In the route, `patch.stage !== undefined` at `route.ts:96` is therefore `true` on every ItemDetailDialog save, so control hits the existing stage-change branch and returns at `route.ts:98` before the auto-advance block is evaluated. Inside that branch `triggerStagePipeline` short-circuits on `status !== 'Todo'` (`lib/stage-pipeline.ts:12`), so the Done state is persisted but the item never auto-advances when set via the item detail dialog. Drag-between-columns from `KanbanBoard` (`KanbanBoard.tsx:105`) only sends `{ stage }`, so that path is unaffected; the failure is specific to ItemDetailDialog Done flips. A direct `PATCH { status: 'Done' }` from a custom client would succeed (AC-1), so the agent-driven flow via `nos-set-status` still works — but the acceptance criterion explicitly calls out ItemDetailDialog as the scenario. See follow-up F1.

7. **AC-7 — Next stage with null prompt still advances, no agent runs.** ✅ Pass. The advance writes `{ stage: next.name }` unconditionally (no prompt-presence check); then `triggerStagePipeline` is awaited and its `!stage.prompt` short-circuit at `lib/stage-pipeline.ts:16` returns without starting a session. Single-hop is preserved — the handler returns immediately after, no re-entry into the advance block.

8. **AC-8 — Unknown current stage: no advance.** ✅ Pass. `stages.findIndex` returns `-1`, and `currentIdx !== -1` at `route.ts:108` prevents the advance. The status update from the first `updateItemMeta` is still persisted and returned.

9. **AC-9 — Status-only PATCH without crossing into Done still does not trigger pipeline.** ✅ Pass. When `patch.stage` is undefined and `patch.status` is `Todo` or `In Progress`, the stage-change branch is skipped (`route.ts:96` false) and the auto-advance branch is skipped (`patch.status === 'Done'` false at `route.ts:102`). Control falls through to `return NextResponse.json(updated)` at `route.ts:119` without invoking `triggerStagePipeline`. REQ-00017 AC-9 is preserved.

10. **AC-10 — Stage-only PATCH behavior unchanged.** ✅ Pass. The stage-change branch at `route.ts:96-99` is byte-identical to the pre-REQ-00021 code path; the auto-advance block is appended *after* it and never runs when `patch.stage !== undefined`.

11. **AC-11 — PATCH response reflects final state.** ✅ Pass. `route.ts:114` returns `afterPipeline ?? advanced ?? updated`, where `afterPipeline` is the post-`triggerStagePipeline` item (with the new stage, new status `Todo`, any newly-appended session, and a fresh `updatedAt`). The intermediate Done-on-old-stage snapshot is never returned.

12. **AC-12 — SSE events are emitted.** ✅ Pass. Both `updateItemMeta` calls funnel through `writeMeta` (`lib/workflow-store.ts:214`), and `writeMeta` calls `emitItemUpdated` at `lib/workflow-store.ts:30`. Two writes → two `item-updated` events, each carrying the full item; the Kanban UI consumes these and will reflect the column jump live. Matches the spec's "two events acceptable" resolution of OQ6.

13. **AC-13 — No regression: manual drag still works.** ✅ Pass. The stage-change branch at `route.ts:96-99` and `updateItemMeta`'s `stageChanged && patch.status === undefined` → reset-to-Todo path at `lib/workflow-store.ts:210-212` are both unchanged. `KanbanBoard.tsx:105` continues to send `{ stage }` only.

14. **AC-14 — Concurrent Done PATCHes.** ✅ Pass. `writeMeta` uses atomic file writes (`atomicWriteFile`-based flow); no partial-file corruption is possible. The read-advance-write window across two PATCHes is not transactional, but the worst case is a double-advance by one stage, which is the explicitly acknowledged limitation. The terminal-stage guard at `route.ts:108` prevents advancing past the last stage under any interleaving.

### Summary

13 of 14 criteria pass. AC-6 fails because `ItemDetailDialog` always includes `stage` in its PATCH body, which routes the request through the existing stage-change branch and bypasses the new auto-advance block.

### Follow-ups

- **F1 (required to satisfy AC-6).** Change the auto-advance detection in `app/api/workflows/[id]/items/[itemId]/route.ts` so that it is not gated by `patch.stage !== undefined`. Two reasonable options:
  - **(a) Preferred — change the stage branch guard to an actual-change check.** Compute `stageChanged = patch.stage !== undefined && patch.stage !== priorItem.stage` and use that for the stage-change pipeline-trigger branch. When `patch.stage` is set to the same value as the current stage (the ItemDetailDialog case), fall through to the auto-advance block. This restores the intuitive "stage-change triggers pipeline, status-change-to-Done triggers advance" model and matches the spec's Detection rule, which names status/priorStatus/flag/successor as the only gates.
  - **(b) Alternative — fix ItemDetailDialog to omit `stage` when it is unchanged.** `components/dashboard/ItemDetailDialog.tsx:95-100` would conditionally include `stage` only when the user actually picked a different column in the dialog's stage dropdown. Leaves the route logic untouched but spreads the concern into the UI and does not fix a hypothetical third caller that also sends `stage` on every save.
  - Recommendation: option (a), because the route is the single source of truth for the advance rule and the spec's §Technical-constraints places all detection logic there. Keep the behavior after the fix identical to AC-1 for ItemDetailDialog Done flips.
- **F2 (nice-to-have, not required).** Add a lightweight trace log (or a single console line) when an auto-advance fires, so that the agent-driven cascade through Analysis → Documentation → Implementation → Validation is observable without tailing SSE. Pure diagnostic value; no behavior change.

Because AC-6 fails, the item remains in the Validation stage per the stage prompt's step 5. Do not mark this requirement Done until F1 lands and AC-6 is re-verified.
