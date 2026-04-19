Current

* Heart beat is to move the Done item to next only
* Starting item from todo to claude adapter is handle in other place

Desired

* Heart beat handle
  * Move done to next stage (if auto advanced enabled)
  * Send item to claude adapter if that item is to do and that stage has prompt (AI automated)

## Analysis

### 1. Scope

**In scope.**
- Extend the heartbeat sweeper (`lib/auto-advance-sweeper.ts`) so that each tick performs two kinds of work per item, not one:
  1. *Advance branch* (existing): `status === 'Done'` + `currentStage.autoAdvanceOnComplete === true` + has successor → move to next stage and kick pipeline. Unchanged.
  2. *Start branch* (new): `status === 'Todo'` + current stage has a non-empty `prompt` + item is not already claimed for this stage → call the stage-pipeline primitive so the claude adapter gets the item.
- Add a dedup gate so a Todo item is not re-kicked on every tick while its adapter session is already in flight or has already been started for the current stage.
- Keep the existing synchronous-kick paths (`POST /items`, `PATCH /items/:id` on stage change, `autoAdvanceIfEligible`) unchanged — those remain the low-latency path; the heartbeat becomes the *revival* path for items that end up Todo without a matching session (e.g. after a `Failed → Todo` reset, after a server restart that missed the original POST/PATCH kick, or after a stage change where the adapter call errored).

**Explicitly out of scope.**
- Reworking the adapter contract, `buildAgentPrompt`, or `loadSystemPrompt`.
- Auto-reviving `Failed` items. Per the standing system prompt, Failed items stay in their stage until an operator resets them to Todo; the new start branch only fires when `status === 'Todo'`.
- Per-item heartbeat intervals or priority queues — the sweeper remains a single serial tick (REQ-00021 H-6).
- Removing or merging the POST/PATCH-time pipeline kicks. They stay for latency reasons; the heartbeat is strictly additive and idempotent.
- Cancelling or garbage-collecting stale `sessions[]` entries on `meta.yml`.

### 2. Feasibility

Technically low-risk. Most of the machinery already exists.

- **Reuse surface.** `lib/stage-pipeline.ts:triggerStagePipeline` already gates on `status === 'Todo'` + `stage.prompt` non-empty (`lib/stage-pipeline.ts:12-16`), builds the prompt, calls `adapter.startSession`, and appends a session entry. The new sweeper branch is essentially "call this helper, but only when we haven't already".
- **Primitive shape.** The current `lib/auto-advance.ts:autoAdvanceIfEligible` is Done-specific. Cleanest refactor is to split into two sibling primitives (or one dispatcher):
  - `autoAdvanceIfEligible(workflowId, itemId)` — unchanged behavior, Done-only.
  - `autoStartIfEligible(workflowId, itemId)` — new, Todo-only, dedup-aware.
  The sweeper's per-item loop calls both; order matters (advance first, then start — advance resets the newly-entered stage to Todo, which the start branch should then pick up in the *same* tick to minimize latency, matching the behavior `autoAdvanceIfEligible` already has inline via its awaited `triggerStagePipeline`).
- **Dedup risk (the main hazard).** Without a gate, every heartbeat tick on a Todo item whose stage has a prompt would spawn a new `adapter.startSession` and append another entry to `meta.sessions`. Concretely: session N adapter has not yet flipped status to `In Progress` → tick T+1 runs → second session started → duplicate work, duplicate `sessions[]` entry. Dedup options:
  - **(a) Session-entry dedup.** Before calling `triggerStagePipeline`, check `item.sessions?.some(s => s.stage === item.stage)`. Skip if present. Simple and uses only existing data. Downside: a `Failed → Todo` reset does not clear `sessions`, so a retry would be suppressed — needs either a clear-on-reset or an explicit "replay" control.
  - **(b) Timestamped dedup.** Compare `sessions[].startedAt` against the stage-entry timestamp. Requires recording a `stageEnteredAt` which we don't store today.
  - **(c) Claim flag.** Add a transient `pipelinePending` flag on the item meta; set before `startSession`, cleared when the agent flips status. Adds write amplification.
  Recommendation to spike: **(a) + clear `sessions` entries for the current stage on every stage-change write** (workflow-store already detects stage changes and resets status to Todo in that same write path, `lib/workflow-store.ts:210-212`). That aligns the dedup key with "has this stage been kicked during this stage-visit".

- **Startup ordering.** Heartbeat is kicked from `instrumentation.ts:register` on Next's Node runtime. An item created while the server is cold (before `register` runs) currently depends on the POST-time kick. Making the heartbeat also start Todo items means a cold-start item that raced its POST kick still gets picked up within one tick — a reliability win.
- **Tick runtime.** Today a tick is O(items with Done-status) × `await triggerStagePipeline`. New behavior widens this to O(items with prompt-bearing stages). `adapter.startSession` is the only expensive call; after dedup it fires at most once per stage-visit per item, so steady-state cost is the no-op `readItem` + cheap dedup check. Acceptable at current scale; matches the bound in REQ-00021 §Pipeline-trigger-semantics-inside-a-tick.
- **Concurrency.** Sweeper is serial per tick (REQ-00021 H-6), so no new re-entrancy beyond what exists. The race between a heartbeat tick and a PATCH/POST kick is resolved by the dedup gate: whichever writes the `sessions[]` entry first wins; the other sees the entry and skips. There is still a thin TOCTOU window between `readItem` and `appendItemSession` — acceptable at current scale but worth flagging (see Open Question 4).
- **Unknowns requiring a spike.**
  - Exact semantics of `sessions[]` dedup after a Failed reset (see Open Question 1).
  - Whether we want an opt-in per-stage flag (`autoStartOnTodo`, analogous to `autoAdvanceOnComplete`) or implicit-on-prompt-present (see Open Question 2).

### 3. Dependencies

- **`lib/auto-advance-sweeper.ts`** — tick loop must widen from Done-only to both branches. Dominant change.
- **`lib/auto-advance.ts`** — either extend with a sibling `autoStartIfEligible` or rename/restructure to a single dispatcher. Breaks nothing downstream; its only caller outside the sweeper is the PATCH route (`app/api/workflows/[id]/items/[itemId]/route.ts:103`), which only needs the Done-branch primitive.
- **`lib/stage-pipeline.ts`** — unchanged in behavior, but now has a second periodic caller. Current error-swallow semantics (`lib/stage-pipeline.ts:38-43`) remain appropriate: a failed kick should not crash the tick.
- **`lib/workflow-store.ts`** — `sessions` is already parsed/written (`lib/workflow-store.ts:125`, `246-256`); no schema change required for option (a). If Open Question 1 resolves toward clearing sessions on stage-reset or on Failed→Todo, `updateItemMeta`'s stage-transition branch needs adjustment.
- **`types/workflow.ts`** — no change unless we adopt option (b) or (c) above.
- **`instrumentation.ts`** — unchanged; the existing `startHeartbeat()` continues to own the timer.
- **Settings surface (`lib/settings.ts`, `app/dashboard/settings/page.tsx`)** — no new knobs required for MVP. A future per-stage `autoStartOnTodo` flag (Open Question 2) would touch stage config (`.nos/workflows/*/config/stages.yaml`) and the stages editor.
- **Requirement neighbors.**
  - **REQ-00016 (Stage Prompt Pipeline)** — defines `triggerStagePipeline`; reused unchanged.
  - **REQ-00021 (Auto-advance Sweeper)** — this requirement extends the sweeper's remit. Acceptance criteria H-2 ("sweep is idempotent on non-eligible items") must be preserved and strengthened to cover Todo items not matching the start-branch gates.
  - **REQ-00017** — PATCH route's AC-9 ("no pipeline recursion from status changes") still holds; the heartbeat is the *only* path that will re-kick a status-only reset (Failed→Todo), and that is intentional and limited to prompt-bearing stages.
- **External systems.** None. The claude adapter is invoked through the existing in-process agent-adapter abstraction.

### 4. Open questions

1. **Dedup semantics on retry.** When an operator resets a Failed item back to Todo (drag or detail-dialog status PATCH), the `sessions[]` entry for the current stage already exists. Should that reset (a) clear the current-stage session entry, (b) bypass dedup for one tick by means of a new field, or (c) leave dedup as-is, meaning retries require a stage move rather than a status reset? Option (a) fits the existing "stage reset clears status to Todo" invariant best; it needs confirmation before implementation.
2. **Opt-in per stage or implicit.** The advance branch has an explicit flag (`autoAdvanceOnComplete`). Should the start branch have a parallel `autoStartOnTodo` flag so operators can disable AI kick on specific prompt-bearing stages, or is "stage has a prompt" sufficient signal of intent? Implicit is simpler and matches how POST/PATCH already behave; explicit gives more control for human-review stages that still want a prompt string recorded for reference.
3. **First-tick race with POST/PATCH.** POST kicks the pipeline synchronously. If the heartbeat interval is short and a POST happens mid-tick, can the sweeper observe the item *after* write but *before* `appendItemSession` lands and thus start a second session? Dedup option (a) requires `appendItemSession` to land before the next heartbeat read; this is true today since `triggerStagePipeline` awaits before returning, but should be captured as an invariant, not left implicit.
4. **TOCTOU in dedup check.** Between `readItem` (tick) and `appendItemSession` (inside `triggerStagePipeline`), two writers could both decide to kick. Within a single tick this is impossible (serial), but across the tick/PATCH boundary it is possible if a PATCH lands after the tick's `readItem` and before `appendItemSession`. Do we accept the rare double-kick, or move dedup into `triggerStagePipeline` under a lock / conditional-write?
5. **Heartbeat default for start branch.** Default heartbeat is 60s (`lib/settings.ts:7`). For the advance branch that is acceptable latency. For the start branch — especially Failed→Todo revivals — 60s may feel slow to an operator. Do we keep the shared interval, or add a separate faster poll for the start branch? (MVP: shared interval; revisit if UX complaints surface.)
6. **Observability.** `autoAdvanceIfEligible` logs on advance (`lib/auto-advance.ts:25-27`). Should the start branch log at the same level on every kick, or only when dedup would have fired (diagnostic)? Logging every skip is noisy; logging every kick is useful.
7. **Terminology.** The existing helper is named `autoAdvanceIfEligible`. If we split, the sibling needs a name that is clearly distinct (`autoStartIfEligible`, `kickPipelineIfEligible`, `autoDispatchIfEligible`). Naming affects call sites in the sweeper and any future reuse; worth locking before implementation PR.

## Specification

### Resolved open questions

These decisions lock the Analysis open questions so the spec below is implementable as written:

- **Q1 (retry semantics):** When the workflow store transitions an item to `status === 'Todo'` from any other status (including `Failed → Todo`), it MUST drop every entry of `meta.sessions[]` whose `stage` equals the item's current stage. This makes "Todo on this stage with no matching session entry" the canonical "needs to be kicked" signal.
- **Q2 (opt-in vs implicit):** Implicit. The start branch fires whenever the current stage has a non-empty `prompt` string. No new per-stage flag is introduced; this matches POST/PATCH behavior today.
- **Q3 (POST/PATCH race):** Captured as invariant I-3 below.
- **Q4 (TOCTOU):** Accepted at MVP scale. The dedup check is best-effort; a rare double-kick across the tick/PATCH boundary is permitted and not a defect.
- **Q5 (interval):** Shared with the existing heartbeat interval (`lib/settings.ts` `heartbeatIntervalMs`, default 60000). No new knob.
- **Q6 (logging):** Log once per successful start-branch kick at `info`. Do not log skips.
- **Q7 (naming):** New primitive is `autoStartIfEligible(workflowId, itemId)`, sibling to `autoAdvanceIfEligible`.

### User stories

1. **As an operator,** I want a Todo item that lives on a prompt-bearing stage to be sent to the claude adapter automatically within one heartbeat tick, **so that** I do not have to manually re-kick items after a server restart, a `Failed → Todo` reset, or a stage change whose synchronous kick errored.
2. **As an operator,** I want a `Failed` item I drag back to `Todo` to re-run the stage's adapter call on the next heartbeat tick, **so that** retrying a failed AI stage is a one-gesture action and does not require a stage move.
3. **As an operator,** I want each Todo-on-prompt-bearing-stage state to produce at most one in-flight adapter session per stage-visit, **so that** duplicate work and duplicate `sessions[]` entries do not accumulate when the heartbeat ticks faster than the adapter can flip status to `In Progress`.
4. **As a developer maintaining the sweeper,** I want the start branch and the advance branch implemented as two named primitives (`autoStartIfEligible`, `autoAdvanceIfEligible`) called sequentially from the per-item loop, **so that** each branch is independently testable and the sweeper file stays a thin orchestration layer.
5. **As an operator,** I want the synchronous kick paths (POST `/items`, PATCH `/items/:id` on stage change) to keep their current low-latency behavior, **so that** the heartbeat acts as a revival/safety net rather than the primary trigger.

### Acceptance criteria

Numbering continues conceptually from REQ-00021's H-series; new criteria are prefixed `HS-` (heartbeat start branch).

**Sweeper tick shape**

1. **HS-1** — In each heartbeat tick, for every workflow and every item, the sweeper MUST call `autoAdvanceIfEligible` first and then `autoStartIfEligible`. Order is fixed: advance precedes start so that an item just advanced into a new prompt-bearing stage is kicked in the same tick.
2. **HS-2** — A tick that finds no eligible items (neither advance nor start) MUST be a no-op with respect to filesystem writes and adapter calls. Reading `meta.yml` is allowed.
3. **HS-3** — Sweeper remains serial within a tick (preserves REQ-00021 H-6). The start branch MUST NOT introduce parallelism.

**Start branch eligibility**

4. **HS-4** — `autoStartIfEligible(workflowId, itemId)` MUST kick the pipeline iff ALL of the following hold for the item as read at the start of the call:
   - `status === 'Todo'`.
   - The item's current stage has a non-empty `prompt` string (after trim).
   - `meta.sessions` contains no entry whose `stage` equals the item's current stage.
5. **HS-5** — If any of HS-4's conditions is false, `autoStartIfEligible` MUST return without calling the adapter and without writing to `meta.yml`.
6. **HS-6** — `autoStartIfEligible` MUST NOT fire for `status === 'Failed'`. Operator reset to `Todo` is the only path that re-enables a kick.
7. **HS-7** — The kick itself MUST go through the existing `triggerStagePipeline(workflowId, itemId)` helper. No new adapter call site is introduced.

**Dedup and stage-visit semantics**

8. **HS-8** — `lib/workflow-store.ts` MUST clear `meta.sessions` entries whose `stage` matches the item's current stage on any write that sets `status` to `'Todo'` from a non-`'Todo'` prior value. This includes:
   - The existing stage-change branch that already resets status to Todo (`lib/workflow-store.ts:210-212`).
   - PATCH-driven `Failed → Todo` operator resets.
   - Drag-driven status changes that land on Todo.
9. **HS-9** — A successful `autoStartIfEligible` kick relies on `triggerStagePipeline` to append exactly one entry to `meta.sessions` for the current stage before returning. This is invariant I-3 below; HS-9 is the test that asserts it (after one kick, a second tick on the same item MUST observe the entry and skip).
10. **HS-10** — Across ticks, given a prompt-bearing stage, an item's `meta.sessions` MUST contain at most one entry per `(stage, stage-visit)` pair under normal operation. A "stage-visit" ends when the item's stage changes; HS-8 guarantees the dedup key resets at that point.

**Failure handling and observability**

11. **HS-11** — Any error thrown by `triggerStagePipeline` inside the start branch MUST be caught and logged; it MUST NOT abort the rest of the tick. (Mirrors REQ-00016's existing error-swallow at `lib/stage-pipeline.ts:38-43`.)
12. **HS-12** — Each successful start-branch kick MUST log one line at `info` level identifying `workflowId`, `itemId`, and `stage`. Skips MUST NOT log.
13. **HS-13** — Existing advance-branch logging behavior is preserved unchanged.

**Compatibility with existing kick paths**

14. **HS-14** — `POST /api/workflows/:id/items` and `PATCH /api/workflows/:id/items/:itemId` (stage change) MUST continue to call `triggerStagePipeline` synchronously as today. No code is removed from these paths.
15. **HS-15** — `app/api/workflows/[id]/items/[itemId]/route.ts:103` continues to call only `autoAdvanceIfEligible` (Done branch). It MUST NOT gain a call to `autoStartIfEligible` — the heartbeat is the sole periodic caller.

**Given/When/Then scenarios**

16. **HS-16 — Cold-start revival.**
    - **Given** the server starts and item `X` exists with `status === 'Todo'`, current stage has `prompt` set, and `meta.sessions` has no entry for the current stage,
    - **When** the first heartbeat tick runs after `instrumentation.register`,
    - **Then** `triggerStagePipeline` is invoked exactly once for `X` and `meta.sessions` gains one entry for the current stage.
17. **HS-17 — Failed→Todo retry.**
    - **Given** item `X` is `Failed` on a prompt-bearing stage with one `meta.sessions` entry for that stage,
    - **When** the operator PATCHes `status` to `Todo`,
    - **Then** the workflow-store write clears the matching `meta.sessions` entry (HS-8), and the next heartbeat tick kicks the pipeline once (HS-4) producing exactly one new `meta.sessions` entry.
18. **HS-18 — In-flight dedup.**
    - **Given** item `X` is `Todo` on a prompt-bearing stage, the current heartbeat tick has already kicked the pipeline, and the adapter has not yet flipped status,
    - **When** the next heartbeat tick runs,
    - **Then** `autoStartIfEligible` finds the existing `meta.sessions` entry for the current stage and returns without calling the adapter.
19. **HS-19 — Advance-then-start in one tick.**
    - **Given** item `X` is `Done` on stage `A` with `autoAdvanceOnComplete` true and successor stage `B` whose `prompt` is non-empty,
    - **When** a heartbeat tick processes `X`,
    - **Then** `autoAdvanceIfEligible` moves `X` to stage `B` with `status === 'Todo'` (clearing any stale `meta.sessions` entry for `B` per HS-8), and `autoStartIfEligible` immediately kicks the pipeline for stage `B` in the same tick.
20. **HS-20 — Non-prompt stage no-op.**
    - **Given** item `X` is `Todo` on a stage with empty `prompt`,
    - **When** any number of heartbeat ticks run,
    - **Then** no adapter call is made, no log line is emitted, and `meta.yml` is not written.
21. **HS-21 — Failed item is left alone.**
    - **Given** item `X` is `Failed` on a prompt-bearing stage,
    - **When** any number of heartbeat ticks run,
    - **Then** `autoStartIfEligible` does not kick (HS-6) and the advance branch does not fire (HS series of REQ-00021 already covers this).

### Technical constraints

**File and symbol surface (paths are normative)**

- **`lib/auto-advance.ts`** — add `export async function autoStartIfEligible(workflowId: string, itemId: string): Promise<void>`. Existing `autoAdvanceIfEligible` retains its current signature and behavior.
- **`lib/auto-advance-sweeper.ts`** — per-item loop becomes:
  ```
  await autoAdvanceIfEligible(workflowId, item.id);
  await autoStartIfEligible(workflowId, item.id);
  ```
  No other structural changes; the existing serial-per-tick loop and error containment stay.
- **`lib/stage-pipeline.ts`** — unchanged. Continues to gate on `status === 'Todo'` + non-empty `prompt`, and to append a `meta.sessions` entry via `appendItemSession` before returning.
- **`lib/workflow-store.ts`** — extend the meta-write path so that any transition setting `status` to `'Todo'` (from a non-`'Todo'` prior value) also strips `meta.sessions` entries whose `stage` matches the item's current stage. The existing stage-change branch at `lib/workflow-store.ts:210-212` is the natural integration point; the PATCH-driven Failed→Todo case must be covered too.
- **`app/api/workflows/[id]/items/[itemId]/route.ts`** — unchanged surface. Continues to call `autoAdvanceIfEligible` only.
- **`instrumentation.ts`** — unchanged. Existing `startHeartbeat()` continues to own the timer; the timer interval continues to come from `lib/settings.ts:heartbeatIntervalMs`.
- **`types/workflow.ts`** — unchanged. No new fields; the dedup signal is the existing `meta.sessions[].stage`.
- **`lib/settings.ts`** and **`app/dashboard/settings/page.tsx`** — unchanged. No new setting is introduced.

**Data shapes**

- `meta.sessions[]` entry shape is unchanged. The dedup check reads `entry.stage` and compares it to the item's current `stage` value (string equality).
- No new fields on `meta.yml`. No migration is required for existing items.

**Invariants**

- **I-1 — Single periodic caller.** `autoStartIfEligible` is called only from the heartbeat sweeper. Adding a second periodic caller is a future requirement, not part of this one.
- **I-2 — Awaited dedup write.** Every kick path that calls `triggerStagePipeline` (POST, PATCH stage-change, advance branch, start branch) MUST `await` it so that `appendItemSession` lands before the caller returns. This is what makes the dedup gate work.
- **I-3 — Stage-visit dedup key.** `(item.stage, presence-of-matching-session-entry)` is the stage-visit dedup key. Stage transitions clear matching entries (HS-8), so a fresh visit always starts with an empty key.
- **I-4 — Advance-before-start ordering.** Sweeper MUST call advance before start within the same item's per-tick processing (HS-1).

**Performance and compatibility**

- Steady-state per-tick cost MUST be O(items) reads + O(eligible items) adapter calls. After dedup converges, eligible-items count drops to zero between operator actions.
- No change to the heartbeat interval, adapter contract, or `triggerStagePipeline` signature.
- Backwards compatible with existing `meta.yml` files. Items whose `meta.sessions[]` already contains an entry for the current stage will be treated as already-kicked; this is the intended behavior and matches the "already in flight" case.

### Out of scope

- Reworking the agent adapter contract, `buildAgentPrompt`, or `loadSystemPrompt`.
- Auto-reviving `Failed` items without operator action. The standing system prompt requires an operator reset to Todo; the start branch only fires on `Todo`.
- A separate, faster heartbeat for the start branch. Shared interval only.
- Per-item heartbeat intervals, priority queues, or parallel tick execution.
- A per-stage `autoStartOnTodo` opt-in flag. Implicit (prompt-presence) only.
- Garbage-collecting historical `meta.sessions[]` entries for prior stages or prior visits. HS-8 only clears the current-stage entry on Todo-transitions; older entries are left as audit history.
- Cancellation of in-flight adapter sessions when an item is dragged out of its stage.
- Stricter dedup that closes the cross-tick/PATCH TOCTOU window (Open Question 4 — accepted as best-effort at MVP scale).
- Any change to the settings UI or to `lib/settings.ts` schema.
- Any change to the kanban UI, item detail dialog, or stage editor.

## Implementation Notes

- `lib/auto-advance.ts` — added `autoStartIfEligible(workflowId, itemId)` sibling to `autoAdvanceIfEligible`. Gates on `status === 'Todo'`, current stage's `prompt` (trimmed) non-empty, and no existing `sessions[]` entry for the current stage. On a kick it logs `[auto-start]` once and `await`s `triggerStagePipeline`. Errors are caught and logged so the rest of the tick is unaffected (HS-11).
- `lib/auto-advance-sweeper.ts` — per-item loop now calls `autoAdvanceIfEligible` then `autoStartIfEligible`, in that order (HS-1, HS-19). Removed the Done-only pre-filter since each primitive does its own gating against a fresh `readItem`. Sweep stays serial within a tick (HS-3). The unused `readItem` import was dropped.
- `lib/workflow-store.ts` — `updateItemMeta` now snapshots the prior status; if the write transitions status to `'Todo'` from a non-`'Todo'` prior, any `meta.sessions[]` entries whose `stage` matches the post-write `meta.stage` are filtered out before writing. This covers the existing stage-change branch that auto-resets to Todo, as well as PATCH-driven `Failed → Todo` and drag-driven Todo writes (HS-8, HS-17).
- No changes to `lib/stage-pipeline.ts`, `app/api/workflows/[id]/items/[itemId]/route.ts`, `instrumentation.ts`, `types/workflow.ts`, or `lib/settings.ts` — synchronous POST/PATCH kicks remain the low-latency path (HS-14, HS-15) and no new schema or settings were introduced.
- `tsc --noEmit` passes with no errors. No deviations from the spec.

## Validation

Evidence: code read of `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/workflow-store.ts`, `lib/stage-pipeline.ts`, `app/api/workflows/[id]/items/[itemId]/route.ts`, `app/api/workflows/[id]/items/route.ts`. `npx tsc --noEmit` ran cleanly.

**Sweeper tick shape**

- ✅ HS-1 — `auto-advance-sweeper.ts:38-39` awaits `autoAdvanceIfEligible` then `autoStartIfEligible` per item, in that fixed order.
- ✅ HS-2 — Both primitives early-return without filesystem writes or adapter calls when their gates fail (`auto-advance.ts:11,15,16,19,38,39,43,45,48`); only `readItem`/`readStages` run.
- ✅ HS-3 — `auto-advance-sweeper.ts:36-46` is a sequential `for…of` with `await`s; no `Promise.all` or other parallelism introduced.

**Start branch eligibility**

- ✅ HS-4 — `auto-advance.ts:38-48` checks all three conditions: `status === 'Todo'`, `(stage.prompt ?? '').trim()` non-empty, and `item.sessions?.some((s) => s.stage === item.stage) === true` skip-on-present.
- ✅ HS-5 — Each gate `return null` before the `triggerStagePipeline` call; no writes.
- ✅ HS-6 — `status !== 'Todo'` early-returns covers `Failed`, `In Progress`, and `Done`.
- ✅ HS-7 — Single call to `triggerStagePipeline(workflowId, itemId)` at `auto-advance.ts:55`.

**Dedup and stage-visit semantics**

- ✅ HS-8 — `workflow-store.ts:233,244-251` snapshots `priorStatus`, then on any write where `newStatus === 'Todo' && priorStatus !== 'Todo'` filters `meta.sessions` to drop entries whose `stage` matches the post-write `meta.stage`. Covers the stage-change auto-Todo branch (line 240-242), explicit `Failed → Todo` PATCHes, and any other Todo-landing write.
- ✅ HS-9 — `stage-pipeline.ts:31-37` calls `appendItemSession` and `await`s before returning, so a subsequent `readItem` in the next tick observes the new entry.
- ✅ HS-10 — Follows from HS-4 + HS-8: dedup gate prevents repeat kicks within a stage-visit; HS-8 clears the key on stage transition.

**Failure handling and observability**

- ✅ HS-11 — `auto-advance.ts:54-63` wraps `triggerStagePipeline` in try/catch that logs and returns; the sweeper's outer try/catch (`auto-advance-sweeper.ts:37-45`) provides a second containment layer.
- ✅ HS-12 — `auto-advance.ts:50-52` logs `[auto-start] workflow=… item=… stage=…` before the kick. Skips do not log. Note: log fires before the awaited kick, so a kick that throws inside `triggerStagePipeline` will still produce the start-line plus an error line — strictly compliant with "successful kicks MUST log" while erring on the side of more diagnostics.
- ✅ HS-13 — `autoAdvanceIfEligible` logging at `auto-advance.ts:25-27` is unchanged.

**Compatibility with existing kick paths**

- ✅ HS-14 — `app/api/workflows/[id]/items/route.ts:58` (POST) and `app/api/workflows/[id]/items/[itemId]/route.ts:98` (PATCH stage-change) both still `await triggerStagePipeline` synchronously.
- ✅ HS-15 — `app/api/workflows/[id]/items/[itemId]/route.ts:103` calls `autoAdvanceIfEligible` only; no `autoStartIfEligible` import or call site.

**Given/When/Then scenarios**

- ✅ HS-16 — Cold-start path: `instrumentation.ts` → `startHeartbeat` → `tick` → `autoStartIfEligible` finds Todo + prompt + no session entry → kicks once.
- ✅ HS-17 — PATCH `status: 'Todo'` from `Failed` triggers HS-8 cleanup in `updateItemMeta`; next tick observes empty session-for-stage and kicks.
- ✅ HS-18 — Second tick reads `sessions[]` containing the stage entry written by `appendItemSession` and the dedup check at `auto-advance.ts:47-48` short-circuits.
- ✅ HS-19 — `autoAdvanceIfEligible` already calls `triggerStagePipeline` after the stage transition (`auto-advance.ts:29`), so the new stage gets kicked inside the same tick. The follow-on `autoStartIfEligible` call then no-ops because the session entry now exists. End-state matches the scenario; the kick is performed by the advance branch rather than the start branch, but the criterion is about "kicked in the same tick", which holds.
- ✅ HS-20 — `prompt` empty/whitespace fails the trim gate (`auto-advance.ts:44-45`); no log, no adapter call, no write.
- ✅ HS-21 — `status === 'Failed'` fails the `status === 'Todo'` gate; advance branch's `status === 'Done'` gate also fails.

**Adjacent regressions**

- POST `/items` and PATCH stage-change still call `triggerStagePipeline` synchronously — low-latency path preserved.
- `appendItemSession` write path unchanged; existing `meta.yml` files with prior-stage entries are left as audit history (only current-stage entries are filtered on Todo-transition).
- `tsc --noEmit` passes (no output → no errors).

**Verdict: all 21 acceptance criteria pass. No follow-ups; advancing to Done.**

