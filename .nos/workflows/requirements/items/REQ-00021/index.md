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

### 5. Re-analysis: Heartbeat Model (from Comment 5)

Comment 5 pivots the mechanism: *"i want to make it like heart beat, run every 1 mins, can be setup in the setting."* Re-scoping the existing event-triggered implementation into (or alongside) a periodic sweep.

#### 5.1 Interpretation

Two plausible readings — resolving is OQ-H1 below:

- **(A) Replacement.** Remove the in-PATCH auto-advance block from `app/api/workflows/[id]/items/[itemId]/route.ts:101-117` entirely; a background sweeper owns *all* auto-advancement. `nos-set-status --status "Done"` just leaves the item sitting at `Done` on its current stage; the next heartbeat tick notices and advances it.
- **(B) Supplement.** Keep the event-triggered advance for the happy path (fast, no lag), add the heartbeat as a **reaper** that catches items stranded at `Done` — specifically the AC-6 failure case (ItemDetailDialog flips), pre-feature historical items, and any future edge case where the in-PATCH trigger misses.

Strong recommendation: **(B)**. Reasons:
- Keeps typical latency near-zero for the agent-driven flow; the heartbeat becomes a safety net rather than the primary path.
- The heartbeat is already asynchronous from the agent's perspective, so deleting the event path strictly worsens agent-turn latency by up to one poll interval (60s at the default).
- Also neatly fixes AC-6 *without* F1's route refactor: the reaper catches any item whose status transitions to Done by *any* PATCH shape.
- Graceful fallback: if the heartbeat ever misbehaves (setInterval leaks, worker crashes, wrong interval), items still advance in real time for the common case.

All §5 content below assumes (B) unless noted.

#### 5.2 Scope (heartbeat additions)

**In scope**
- A background "auto-advance sweeper" that, on every tick, iterates workflows × items and for each item where `status === 'Done'` AND `currentStage.autoAdvanceOnComplete === true` AND the stage has a successor AND `currentIdx < stages.length - 1`, performs the existing advance (update stage to next → store resets to `Todo` → call `triggerStagePipeline`).
- Sweeper interval configured in NOS settings (default 60s). Settings surface:
  - a new key persisted under `.nos/settings.yaml` (or equivalent — see §5.4) named `autoAdvanceHeartbeatMs` or similar; `0` or a negative value disables the sweep.
  - a new UI section in `app/dashboard/settings/page.tsx` exposing the interval as a numeric input (minutes or seconds — pick one; recommend minutes with a "0 = disabled" escape hatch).
- REST surface for settings read/write mirroring the existing `/api/settings/system-prompt` pattern (`app/api/settings/system-prompt/route.ts:1-46`).
- Process lifecycle: the sweeper must start when the Next.js dev server starts and stop when it stops. Recommend Next.js `instrumentation.ts` or a lazy-start inside a dev-only module, whichever is the project's idiomatic hook (see §5.4 unknowns).
- Observability: a single `console.log` on each tick when it performs an advance, naming workflow, item, and old→new stage. No tick log on no-op ticks (too noisy).

**Out of scope**
- Multi-hop advance per tick (still single hop — same constraint as the event model).
- Per-workflow or per-stage heartbeat intervals. Interval is global.
- Distributed / multi-instance coordination. This is a single-process local dev tool; no locking across replicas.
- Timezone-aware scheduling, cron expressions, blackout windows. Flat interval only.
- Externally triggered sweeps (HTTP endpoint / CLI). If desired later, expose a "Run now" button in the settings page — flagged as OQ-H5.
- Persisting "last sweep at" metadata. The sweeper is stateless; each tick re-reads meta.yml for every item.

#### 5.3 Feasibility

Low-risk. All building blocks reused:

- **Iteration.** `lib/workflow-store.ts` already provides `readStages(workflowId)`, `readItem(workflowId, itemId)`, and `updateItemMeta`. Does it expose `listItems(workflowId)` / `listWorkflows()`? If not, trivial to add (they are thin wrappers over `fs.readdir` under `.nos/workflows/<id>/items/`). Flagged under §5.6 dependencies.
- **Advancement primitive.** The exact advance block already exists inline in the PATCH route. Extract to a private helper `autoAdvanceIfEligible(workflowId, itemId)` in either `lib/stage-pipeline.ts` (same neighborhood as `triggerStagePipeline`) or a new `lib/auto-advance.ts`. Call sites: the PATCH handler (existing event path), the sweeper (new periodic path).
- **Settings I/O.** Follow the exact shape of `lib/system-prompt.ts` + `app/api/settings/system-prompt/route.ts`. Byte-limited JSON/YAML file, PUT+GET endpoints, React page reads on mount and saves on change. For a single `autoAdvanceHeartbeatMs` number the scaffolding is almost copy-paste.
- **Scheduler.** `setInterval(tick, intervalMs)` inside a module that boots once at server start. Two candidate hook points:
  - Next.js `instrumentation.ts` (register() runs once per Node process at startup). Standard Next.js pattern; works in `next dev` and `next start`. **Recommended.**
  - Top-level side effect in a module imported by `app/layout.tsx` (server component). Works but less idiomatic; more likely to be double-booted on hot reload in dev.
- **Hot-reload safety (dev only).** `setInterval` started from a module can leak across hot reloads. Guard with a `globalThis.__nosAutoAdvanceTimer` sentinel: on each boot, clear any prior timer before starting the new one. Same pattern used by `lib/stream-registry.ts` implicitly (its `streams` Map is module-scoped and shared across reloads).

**Risks / unknowns**
- **Re-entrancy within a tick.** If a tick is slow (awaiting `triggerStagePipeline` which starts an agent session), a second tick could fire before the first finishes. Guard with a boolean `sweepInFlight` flag inside the tick closure; skip overlapping ticks. Even simpler: make the tick serial and short by *queuing* advances and letting `triggerStagePipeline` run without awaiting inside the sweep (fire-and-forget for the sweeper path only — the event path continues to await). Flagged as OQ-H3.
- **Interaction with the event-triggered path.** An item that just transitioned to Done via the PATCH handler will be advanced by that handler before the next tick. The sweeper's "still Done on the same stage after N ms" check is the thing that lets it ignore items that have already moved. No concurrency issue as long as the sweeper reads current state immediately before advancing (it does — `readItem` per iteration).
- **Window between Done-write and sweeper-advance for non-AC-1 flows.** With heartbeat at 60s, a user ItemDetailDialog Done flip (AC-6 failing case) has a latency of up to ~60s before the next stage fires. Explicitly acceptable per the user's "every 1 min" framing.
- **Cost.** `O(workflows × items)` per tick. For the current project (~30 items), trivial. Revisit if item count grows past ~10k. No caching planned.
- **Settings live-reload.** Changing the interval via the settings page should take effect without restarting the server. Easy: reload the interval on every tick and schedule the next tick via `setTimeout(next, currentIntervalMs)` instead of `setInterval`. Or subscribe to settings write and restart the timer. Recommend the setTimeout chain — simpler.
- **Disabled state.** If the user sets interval to 0 / negative, the sweeper should stop calling itself and leave the system purely event-driven. Next write to settings must be able to wake it up — implies the settings-write endpoint needs to call a `rescheduleHeartbeat()` function. Trivial.
- **Next.js runtime.** The sweeper must run in Node (not Edge). Enforced by `export const runtime = 'nodejs'` in the settings route and by using `instrumentation.ts` which is always Node.
- **Failure isolation.** One item's advance failing (e.g. broken adapter) must not kill the sweeper. Wrap each per-item advance in `try/catch` and log.

#### 5.4 Dependencies

- **Files to add/modify**
  - `instrumentation.ts` (new) — Next.js lifecycle hook that boots the sweeper once per process.
  - `lib/auto-advance.ts` (new, optional) — extracts the advance-if-eligible logic so both the PATCH handler and the sweeper call one function. Alternative: add it to `lib/stage-pipeline.ts`.
  - `lib/settings.ts` (new) — read/write `.nos/settings.yaml` with the heartbeat interval and any future global settings. Mirror `lib/system-prompt.ts`.
  - `app/api/settings/heartbeat/route.ts` (new) — GET/PUT for the interval. Or generalize `app/api/settings/[key]/route.ts` if multiple global settings are foreseen (OQ-H2).
  - `app/dashboard/settings/page.tsx` — add a "Auto-advance heartbeat" card with a numeric input (minutes) and Save button. Follows the existing System Prompt card's pattern.
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — refactor to call the shared `autoAdvanceIfEligible` helper instead of the inline block (optional cleanup; not strictly required).
  - `lib/workflow-store.ts` — may need a new `listWorkflows()` / `listItems(workflowId)` helper if one doesn't exist; these are thin `readdir` wrappers.
- **New packages**: none. `setTimeout` and `fs` are enough.
- **Related requirements**
  - REQ-00021 (this one, original scope) — the event-triggered advance. Kept as fast-path under interpretation (B).
  - REQ-00015 — source of `autoAdvanceOnComplete` on Stage.
  - REQ-00016 — `triggerStagePipeline` is reused by the sweeper unchanged.
  - REQ-00017 — the agent's end-of-run `nos-set-status --status Done` remains the dominant Done-producer; heartbeat catches the stragglers.
  - No conflict with REQ-00014 skills; this requirement does not touch them.
- **External systems**: none.

#### 5.5 Updated / new acceptance criteria

The original ACs 1–14 (event-triggered path) remain. New ACs (H-series) layer the heartbeat behavior on top.

- **H-1 Sweep advances stranded items.** Given an item at `status=Done` on a stage with `autoAdvanceOnComplete===true` and a successor stage, when the heartbeat fires, the item is advanced to the next stage with `status=Todo` and `triggerStagePipeline` is invoked. Latency bound: one heartbeat interval.
- **H-2 Sweep is idempotent on non-eligible items.** Ineligible items (`status!==Done`, flag off, on terminal stage, unknown stage) are left untouched on every tick. No state writes.
- **H-3 Interval is configurable.** The heartbeat interval is read from NOS settings on every tick (or on settings-change); changing the value via the settings UI takes effect by the next scheduled tick without server restart.
- **H-4 Zero/negative interval disables the sweep.** Setting the interval to `0` or a negative value stops future ticks. A later positive value resumes ticking. Event-triggered advance remains active regardless.
- **H-5 Event path still fires first.** For the typical agent-driven path (REQ-00017's `nos-set-status --status Done`), the PATCH handler advances the item within the same request — the sweeper only sees it already advanced on its next tick.
- **H-6 Overlapping ticks do not double-advance.** Two overlapping ticks on the same item produce at most one advance (either serial execution, a lock flag, or atomic "advance iff still at the observed state" semantics).
- **H-7 Failure isolation.** A per-item error (stages.yaml missing, adapter failure, etc.) is logged and does not prevent subsequent items in the same tick or subsequent ticks from running.
- **H-8 Settings endpoint shape.** `GET /api/settings/heartbeat` returns `{ intervalMs: number }`; `PUT` accepts `{ intervalMs: number }` and validates it as a finite non-negative integer. 400 on other shapes. Follows the `/api/settings/system-prompt` convention.

#### 5.6 Open questions (heartbeat)

- **OQ-H1 Replace or supplement?** Strong default: supplement (B). Confirm before implementation.
- **OQ-H2 Settings storage shape.** New file `.nos/settings.yaml` with `heartbeatMs: 60000`, or generalize the existing system-prompt approach to a single `.nos/settings.json` with multiple keys? Recommendation: new YAML file, single-key for now, structured so adding more keys later is additive.
- **OQ-H3 Overlap handling.** Serial `setTimeout` chain (simple, strictly no overlap) vs `setInterval` + in-flight flag (slightly more drift-resistant). Recommendation: `setTimeout` chain — simpler and matches the "heartbeat" framing (fixed gap between ticks rather than fixed wall-clock cadence).
- **OQ-H4 Boot hook.** `instrumentation.ts` (recommended) vs module-scope import in `app/layout.tsx`. Defer to maintainer preference, but `instrumentation.ts` is the Next.js blessed hook.
- **OQ-H5 Manual "Run now" button?** Adds operator feel but is a small scope creep. Recommendation: not in this requirement.
- **OQ-H6 Unit of the interval in the UI.** Minutes (matches the "every 1 min" user language) vs seconds vs milliseconds. Recommendation: minutes, with `0 = disabled`. Persist internally as `ms` but display/edit in minutes to match intent.
- **OQ-H7 Should the sweeper also clean up `Failed` items?** Out of scope per this comment's literal wording, but worth capturing as a future ask.
- **OQ-H8 Should the pipeline trigger be awaited inside a tick?** Awaiting makes one tick potentially long (agent session start is seconds); not awaiting uncouples advance from next-stage kick. Recommendation: await per item, but process items serially; total tick time is bounded by (number of eligible items × startSession latency). For the scale of this project, fine.

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

### Heartbeat sweeper (from Comment 5)

This subsection layers the heartbeat model from §5 of Analysis on top of the event-triggered path above. **OQ-H1 is resolved as (B) Supplement**: keep the in-PATCH advance untouched for zero-latency happy path, add a periodic sweeper as a reaper that catches items stranded at `Done` (including the ItemDetailDialog AC-6 failure case and any future PATCH shape that misses the event path). **OQ-H2 is resolved** as "new `.nos/settings.yaml` with a single structured key", so adding further global settings later is additive.

#### Additional user stories

6. As a **user who flips an item to `Done` from the item detail dialog**, I want the item to move to the next stage without restarting the server or manually dragging, so that the UI-driven completion path does not strand work.
7. As a **workflow operator**, I want to configure the heartbeat interval (in minutes) from the settings page, with `0` disabling the sweeper, so that I can tune the latency/cost tradeoff or fall back to event-only advancement.
8. As a **developer investigating pipeline behavior**, I want a single log line each time the sweeper performs an advance, so that I can observe cascades (Analysis → Documentation → Implementation → Validation) without tailing SSE.

#### Additional acceptance criteria (H-series)

Given/When/Then. "The sweeper" refers to the periodic background task. "A tick" is one iteration of the sweeper. "The interval" is the number read from settings, expressed in milliseconds internally.

- **H-1 Sweep advances stranded items.** *Given* an item whose `status === 'Done'` and whose current stage has `autoAdvanceOnComplete === true` and a successor (`currentIdx < stages.length - 1`), *when* the next heartbeat tick runs, *then* the sweeper calls the same advance primitive as the event path (writes `{ stage: next.name }` with no `status` field, relying on the store's reset-to-Todo invariant, then invokes `triggerStagePipeline`). Latency upper bound: one interval.
- **H-2 Sweep is idempotent on non-eligible items.** *Given* items with any of: `status !== 'Done'`, `autoAdvanceOnComplete !== true` on the current stage, current stage not in `readStages`, or `currentIdx === stages.length - 1`, *when* a tick runs, *then* no `updateItemMeta` or `triggerStagePipeline` call is made for those items. No `meta.yml` is rewritten.
- **H-3 Interval is configurable and live-reloads.** *Given* the user changes the heartbeat interval via the settings UI and saves, *when* the next scheduled tick would fire, *then* it fires at the new interval. The server is NOT restarted. Implemented by reading the interval from `.nos/settings.yaml` (via `lib/settings.ts`) at each scheduling point; see technical constraints for the `setTimeout`-chain shape.
- **H-4 Zero or negative interval disables the sweep.** *Given* the stored `autoAdvanceHeartbeatMs` value is `0` or negative (or absent), *when* the sweeper's scheduler evaluates next-tick, *then* no further tick is scheduled. The event-triggered advance in `app/api/workflows/[id]/items/[itemId]/route.ts` continues to operate regardless of this setting. *When* the user later writes a positive value via `PUT /api/settings/heartbeat`, *then* the sweeper resumes (the PUT handler calls a `rescheduleHeartbeat()` function that re-arms the next tick).
- **H-5 Event path still fires first.** *Given* a PATCH that would both trigger the event-path advance and leave the item in a state the sweeper would later catch, *when* the PATCH completes, *then* the item is already on the next stage and the next tick sees `status === 'Todo'` (or already on a further stage), failing H-2's eligibility check and doing nothing. The event and heartbeat paths MUST NOT double-advance the same transition.
- **H-6 Overlapping ticks do not double-advance.** *Given* a tick whose per-item work (including `await triggerStagePipeline`) takes longer than the interval, *when* the scheduler would fire a second tick, *then* the second tick is suppressed until the first completes. Implemented by scheduling the next tick via `setTimeout` only after the current tick's per-item loop resolves (serial chain), not via `setInterval`.
- **H-7 Failure isolation.** *Given* an error thrown during one item's advance (missing `stages.yaml`, adapter failure, disk write failure), *when* the per-item step runs, *then* the error is caught, logged with workflow and item identifiers, and the tick proceeds to the next item. A later tick retries that item. A thrown error MUST NOT kill the sweeper process or skip remaining items in the tick.
- **H-8 Settings endpoint shape.** `GET /api/settings/heartbeat` returns `{ "intervalMs": <finite non-negative integer> }` with a default shape when the file is absent. `PUT /api/settings/heartbeat` accepts a JSON body of `{ "intervalMs": <finite non-negative integer> }`; any other shape (missing key, non-number, negative, NaN, non-integer) returns HTTP 400 with an explanatory body and leaves the stored value unchanged. On success the handler writes the file, invokes `rescheduleHeartbeat()`, and returns 200 with the new value. Follows `/api/settings/system-prompt`'s conventions (runtime `nodejs`, byte limits, atomic write).
- **H-9 Observability.** *When* the sweeper performs an advance, *then* a single `console.log` line is emitted containing at minimum: the workflow id, the item id, the old stage name, and the new stage name. No log line is emitted on no-op ticks.
- **H-10 Settings UI.** The `app/dashboard/settings/page.tsx` page contains an "Auto-advance heartbeat" card with: a label, a numeric input accepting minutes (integer ≥ 0, stored internally as ms = minutes × 60000), a "Save" button that PUTs to `/api/settings/heartbeat`, and a visible hint that `0 = disabled`. The card mirrors the existing System Prompt card's structure (load-on-mount, dirty-tracking, error toast on failed save).
- **H-11 Single-hop per tick.** *When* a tick advances an item, *then* it does NOT re-enter the eligibility check on the newly-advanced item in the same tick. An item on a newly-flagged Done-ready stage will be picked up by the *next* tick. This matches the event-path's single-hop constraint.
- **H-12 Process lifecycle.** The sweeper boots exactly once per Node process via Next.js `instrumentation.ts`. In `next dev` with HMR, a `globalThis.__nosAutoAdvanceTimer` sentinel clears any prior timer before starting a new one so hot reloads do not multiply timers. In `next start` (production), the timer is armed once and runs for the life of the process.

#### Additional technical constraints

- **OQ-H1 resolution.** Supplement, not replace. The event-path block in `app/api/workflows/[id]/items/[itemId]/route.ts:101-117` stays. The sweeper is an independent code path that reaches the same outcome for cases the event path misses.
- **OQ-H2 resolution.** Settings storage is a new file `.nos/settings.yaml` with a single top-level key `autoAdvanceHeartbeatMs: <number>`. Future global settings append new top-level keys rather than introducing sibling files. Do NOT generalize `lib/system-prompt.ts` — keep it specialised; add a new `lib/settings.ts` whose public surface is narrow: `readHeartbeatMs()` and `writeHeartbeatMs(ms)`. Byte limits, atomic write, and runtime shape mirror `lib/system-prompt.ts`.
- **Shared advance primitive.** Extract the advance block from the route into a new exported function `autoAdvanceIfEligible(workflowId, itemId)` in a new file `lib/auto-advance.ts`. The function's contract: read the item and stages, check the full Detection rule from §Technical-constraints above (including `autoAdvanceOnComplete === true` and successor bounds), and if eligible, perform the second `updateItemMeta({ stage: next.name })` plus `await triggerStagePipeline`. Return either the advanced item or `null` if no advance occurred. Both the route handler and the sweeper call this function; this is the ONE place that encodes the advance rule.
  - *Caveat for the route handler*: it still needs the *transition* check (`priorStatus !== 'Done'` and `patch.status === 'Done'`) because it has access to the patch shape; the sweeper does NOT check transitions — an item whose status is already `Done` and is sitting on a flagged stage is by definition eligible from the sweeper's perspective. To keep a single helper with a clean contract, the helper checks only post-conditions (`status === 'Done'`, flag, successor). The route's transition gate is layered on *outside* the helper call, identical to today's inline block.
- **Scheduler shape.** Use a `setTimeout` chain, not `setInterval`:
  ```
  function schedule() {
    const ms = readHeartbeatMs();
    if (!Number.isFinite(ms) || ms <= 0) { timer = null; return; }
    timer = setTimeout(async () => {
      try { await tick(); } catch (e) { console.error('[heartbeat] tick failed', e); }
      schedule();
    }, ms);
  }
  ```
  This guarantees no overlap (H-6) and re-reads the interval on every cycle (H-3).
- **Boot hook.** New top-level file `instrumentation.ts` with:
  ```
  export async function register() {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { startHeartbeat } = await import('./lib/auto-advance-sweeper');
    startHeartbeat();
  }
  ```
  The Edge runtime guard prevents accidental double-boot in Middleware contexts. `instrumentation.ts` is Next.js's blessed lifecycle hook.
- **HMR safety.** `startHeartbeat()` stores its timer on `globalThis.__nosAutoAdvanceTimer` and, on every call, clears the existing timer before arming a new one. Same idempotency pattern as other module-scoped singletons (SSE stream registry).
- **`rescheduleHeartbeat()`.** The settings PUT handler imports this from the sweeper module and calls it after a successful write. Its behavior is identical to calling `startHeartbeat()` — clear any existing timer, re-arm via `schedule()` reading the new value.
- **Iteration.** The sweeper's tick iterates `listWorkflows()` × `listItems(workflowId)`, both added to `lib/workflow-store.ts` as thin wrappers over `fs.readdir` against `.nos/workflows/<id>/items/`. Per item, call `readItem` to get the current `stage` and `status`, then call `autoAdvanceIfEligible`. Serial iteration. Errors from one item are caught and logged (H-7); the loop continues.
- **Pipeline trigger semantics inside a tick.** `autoAdvanceIfEligible` awaits `triggerStagePipeline` (OQ-H8 resolution: await). Tick time is bounded by (eligible-item count) × startSession latency. Acceptable at current scale; revisit if item count grows beyond ~1000.
- **Route handler refactor.** The event-path's inline advance block is replaced with a call to `autoAdvanceIfEligible(id, itemId)`, preserving the transition gate immediately around it:
  ```
  if (patch.status === 'Done' && priorStatus !== 'Done') {
    const advanced = await autoAdvanceIfEligible(id, itemId);
    if (advanced) return NextResponse.json(advanced);
  }
  ```
  This collapses the duplicated logic and removes the direct `readStages` + `updateItemMeta` calls from the route. Behavior under the existing ACs 1–14 is unchanged.
- **ItemDetailDialog path.** With the heartbeat in place, AC-6 is satisfied by the sweeper within one interval. F1's route refactor (changing the stage-change guard to an "actual-change" check) is NO LONGER required for AC-6 and is dropped from the spec. The ItemDetailDialog's current PATCH shape (always including `stage`) still routes to the stage-change branch, the Done state persists, and the next tick advances it. If zero-latency advancement from ItemDetailDialog is later desired, the route refactor can be reconsidered as a separate follow-up.
- **File inventory for the heartbeat layer.**
  - New: `instrumentation.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/settings.ts`, `app/api/settings/heartbeat/route.ts`.
  - Modified: `app/api/workflows/[id]/items/[itemId]/route.ts` (route handler now calls the helper), `lib/workflow-store.ts` (adds `listWorkflows()` / `listItems()` if absent), `app/dashboard/settings/page.tsx` (adds the heartbeat card).
- **Default interval.** `60000` ms (60 s / 1 minute), matching the user's "every 1 min" language. Used when the settings file is absent or unparseable.
- **No per-tick state.** The sweeper is stateless across ticks; it re-reads workflows, items, stages, and the interval on every cycle. No "last sweep at" persistence. Simpler to reason about and makes failure recovery trivial (just start ticking again).
- **Runtime pinning.** Both `app/api/settings/heartbeat/route.ts` and any module pulled by the sweeper must keep Node-only APIs (`fs`, `setTimeout` at module level) off the Edge runtime. Declare `export const runtime = 'nodejs'` in the settings route.

#### Additional out-of-scope items

- Multi-hop advance per tick. One stage forward per eligible item per tick, same as the event path.
- Per-workflow or per-stage heartbeat intervals. One global interval.
- Distributed / multi-instance coordination; file locking across processes. Single-process tool.
- Cron expressions, wall-clock scheduling, blackout windows. Flat interval only.
- Externally triggered "Run now" sweeps (OQ-H5). Single follow-up candidate, not in this scope.
- Sweeping `Failed` items (OQ-H7). Out of scope per Comment 5's literal wording.
- Unit tests for the sweeper. Manual verification via a throwaway item, matching the project's validation style.
- Metrics, dashboards, or structured logging beyond the single H-9 console line.
- Making the event path fire-and-forget on `triggerStagePipeline`. Remains awaited.
- The F1 follow-up from the event-path Validation (route refactor to satisfy AC-6 via the event path). Superseded by the heartbeat catching the ItemDetailDialog case.

## Implementation Notes

- Added auto-advance logic to `app/api/workflows/[id]/items/[itemId]/route.ts` inside the `PATCH` handler, immediately after the existing stage-change pipeline-trigger branch. No other source files were modified.
- Before the first `updateItemMeta`, the handler now reads `priorStatus` via `readItem` so transition detection (`priorStatus !== 'Done' → updated.status === 'Done'`) can avoid re-advancing on idempotent `{ status: 'Done' }` PATCHes (AC-5).
- Auto-advance fires only when: `patch.status === 'Done'`, `priorStatus !== 'Done'`, `updated.status === 'Done'`, the item's current stage is found in `readStages`, that stage's `autoAdvanceOnComplete === true`, and the stage has a successor (`currentIdx < stages.length - 1`). Matches the spec's Detection rule exactly.
- Advance performs `updateItemMeta(id, itemId, { stage: next.name })` with no `status` field, relying on the stage-reset-to-Todo invariant in `lib/workflow-store.ts` so the pipeline's `status === 'Todo'` gate (`lib/stage-pipeline.ts:12`) picks it up. Then `await triggerStagePipeline(id, itemId)` runs and the PATCH response returns the post-pipeline item (AC-11).
- The existing stage-change branch is untouched and still takes precedence: a PATCH with `stage` set never enters the auto-advance block (AC-10, AC-13).
- Status-only PATCHes that don't cross into Done still don't call the pipeline, preserving REQ-00017 AC-9.
- Single-hop only: after one advance the handler returns — no re-entry check on the new stage.
- No type changes, no new helpers, no data-file changes. `Stage.autoAdvanceOnComplete` already existed from REQ-00015.

### Heartbeat layer (Comment 5 / Spec §Heartbeat sweeper)

Added the supplement-mode heartbeat sweeper on top of the existing event-triggered path.

- **New files.**
  - `lib/settings.ts` — reads/writes `.nos/settings.yaml`. Narrow API: `readHeartbeatMs()` returns the stored value or the `60000` ms default (file absent / unparseable / non-integer); `writeHeartbeatMs(ms)` validates finite non-negative integer, preserves other top-level keys, and writes atomically with a 64 KB limit.
  - `lib/auto-advance.ts` — exports `autoAdvanceIfEligible(workflowId, itemId)`. The single place that encodes the advance rule (post-conditions: `status === 'Done'`, stage found in `readStages`, `autoAdvanceOnComplete === true`, has successor). Writes `{ stage: next.name }` without a `status` field (relying on the store's stage-reset-to-Todo invariant), logs the old→new stage, awaits `triggerStagePipeline`, returns the advanced item or `null`. Transition detection (`priorStatus !== 'Done'`) remains in the route handler per the spec's technical constraints.
  - `lib/auto-advance-sweeper.ts` — setTimeout-chain scheduler. `startHeartbeat()` / `rescheduleHeartbeat()` clear any prior timer via a `globalThis.__nosAutoAdvanceTimer` sentinel (HMR-safe) and re-arm. On each tick: iterate `listWorkflows()` × `listItems(workflowId)`, read each item, and for any `status === 'Done'` item call `autoAdvanceIfEligible` (awaited serial — H-6 no-overlap). Errors per-item caught and logged; the loop continues (H-7). Interval is re-read from settings before every reschedule (H-3). Interval `<= 0` or non-finite leaves the timer unscheduled (H-4). Timer is `unref`ed so it does not block Node exit.
  - `instrumentation.ts` — Next.js `register()` hook, gated on `NEXT_RUNTIME === 'nodejs'`, lazy-imports the sweeper and calls `startHeartbeat()`.
  - `app/api/settings/heartbeat/route.ts` — `GET` returns `{ intervalMs }`; `PUT` validates `{ intervalMs: finite non-negative integer }`, writes via `writeHeartbeatMs`, calls `rescheduleHeartbeat()`, returns the new value. `runtime = 'nodejs'`. Non-integer / negative / missing key → 400.
- **Modified files.**
  - `lib/workflow-store.ts` — added `listWorkflows()` and `listItems(workflowId)` thin `readdir`-over-directories helpers. No changes to existing exports.
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — collapsed the inline auto-advance block into a call to `autoAdvanceIfEligible`, keeping the transition gate (`patch.status === 'Done' && priorStatus !== 'Done'`) immediately around it. Behavior under the original ACs 1–14 is preserved.
  - `app/dashboard/settings/page.tsx` — added an "Auto-advance heartbeat" card below the System Prompt card. Numeric input in minutes (0 = disabled, stored internally as `ms = minutes × 60000`), Save button, dirty tracking, load/save error messages, flash confirmation. Mirrors the System Prompt card's structure.
- **Behavior.**
  - Event path (REQ-00021 original): unchanged happy path. An agent flipping status to Done via `nos-set-status` triggers the PATCH handler's transition gate → `autoAdvanceIfEligible` → second `updateItemMeta` → `triggerStagePipeline`.
  - Heartbeat path (new): every `intervalMs` (default 60s) a tick sweeps all workflow items and advances any stranded `Done` item on a flagged non-terminal stage. This catches the ItemDetailDialog AC-6 case that the event path misses because the dialog always sends `stage` in its PATCH body — F1 is superseded as noted in the spec.
- **Deviations from spec.** None. `tsc --noEmit` passes.

## Validation

Re-validated after the heartbeat layer (Comment 5 / Comment 8) landed. Verdicts are based on code inspection of the PATCH handler (`app/api/workflows/[id]/items/[itemId]/route.ts`), the shared helper (`lib/auto-advance.ts`), the sweeper (`lib/auto-advance-sweeper.ts`), the settings module (`lib/settings.ts`), the settings route (`app/api/settings/heartbeat/route.ts`), the boot hook (`instrumentation.ts`), the store helpers (`lib/workflow-store.ts`), the pipeline gate (`lib/stage-pipeline.ts`), and the UI callers (`components/dashboard/KanbanBoard.tsx`, `components/dashboard/ItemDetailDialog.tsx`, `app/dashboard/settings/page.tsx`). `npx tsc --noEmit` passes with no output. No tests exist in this project; verification is by trace, matching the project's documented validation style.

### Event-path acceptance criteria (AC-1 … AC-14)

1. **AC-1 — Agent-driven advance fires.** ✅ Pass. `priorStatus` is captured at `route.ts:91`; after the first `updateItemMeta`, the transition gate at `route.ts:102` calls `autoAdvanceIfEligible`, which at `lib/auto-advance.ts:9-30` re-reads the item, validates `status==='Done'`, finds `currentIdx`, checks `autoAdvanceOnComplete===true` and successor, writes `{ stage: next.name }` with no `status` field, then awaits `triggerStagePipeline`. `lib/workflow-store.ts:239-241` resets status to `Todo` inside the second write and `updatedAt` is bumped at `writeMeta` (`workflow-store.ts:24`).

2. **AC-2 — Pipeline runs for the new stage.** ✅ Pass. `autoAdvanceIfEligible` awaits `triggerStagePipeline` at `lib/auto-advance.ts:29`. With `status==='Todo'` and a non-null prompt, the gate at `lib/stage-pipeline.ts:12-16` passes and `adapter.startSession` runs.

3. **AC-3 — Flag off: no advance.** ✅ Pass. Strict boolean check at `lib/auto-advance.ts:19`: `current.autoAdvanceOnComplete !== true` returns `null`. `false` and `null` both fall through; the route returns the first-write snapshot at `route.ts:107`.

4. **AC-4 — Terminal stage: no advance.** ✅ Pass. `currentIdx >= stages.length - 1` returns `null` at `lib/auto-advance.ts:16`. `Done` is the terminal stage in `.nos/workflows/requirements/config/stages.yaml:105-108`; the index guard is also the last-line defense for any future workflow that flags its terminal stage.

5. **AC-5 — Idempotent Done PATCH does not re-advance.** ✅ Pass. The transition gate `patch.status === 'Done' && priorStatus !== 'Done'` at `route.ts:102` blocks repeat Done PATCHes. A second `{ status: 'Done' }` PATCH writes the same status and returns via `route.ts:107` without entering the advance branch.

6. **AC-6 — Manual UI Done flip also advances.** ✅ Pass (via heartbeat, within one interval). `components/dashboard/ItemDetailDialog.tsx:103-108` still always includes `stage` alongside `status`, so `patch.stage !== undefined` at `route.ts:97` is true and the event path is bypassed — as noted in prior validation. The spec explicitly resolves this under §Heartbeat sweeper / "ItemDetailDialog path": the sweeper catches the stranded Done item on the next tick. `lib/auto-advance-sweeper.ts:36-47` iterates every `Done` item and calls `autoAdvanceIfEligible`. Observed PATCH trace: ItemDetailDialog sends `{ title, stage, status:'Done', comments }` → `updateItemMeta` persists `status=Done` (no stage reset because `stageChanged===false` when stage equals current at `workflow-store.ts:232`) → route's stage-change branch calls `triggerStagePipeline` which no-ops on `status!=='Todo'` → response returns with Done persisted → next tick (≤ heartbeat interval) finds it and advances. F1 is superseded and dropped per spec.

7. **AC-7 — Next stage with null prompt still advances, no agent runs.** ✅ Pass. `autoAdvanceIfEligible` writes `{ stage: next.name }` without reading `next.prompt`; `triggerStagePipeline` then short-circuits at `lib/stage-pipeline.ts:16` (`!stage.prompt`). Helper returns after one advance; no re-entry (H-11).

8. **AC-8 — Unknown current stage: no advance.** ✅ Pass. `lib/auto-advance.ts:15`: `if (currentIdx === -1) return null`. The first `updateItemMeta` already persisted the status; the route returns that state.

9. **AC-9 — Status-only non-Done PATCH still does not trigger pipeline.** ✅ Pass. With `patch.stage===undefined` and `patch.status` in `{'Todo','In Progress','Failed'}`, both branches are skipped — `route.ts:97` false, `route.ts:102` false — control falls to `return NextResponse.json(updated)` at `route.ts:107`. REQ-00017 AC-9 preserved.

10. **AC-10 — Stage-only PATCH behavior unchanged.** ✅ Pass. `route.ts:97-100` is the same branch as before; the auto-advance call sits strictly after it and is unreachable when `patch.stage !== undefined`.

11. **AC-11 — PATCH response reflects final state.** ✅ Pass. `autoAdvanceIfEligible` returns `afterPipeline ?? advanced` (`lib/auto-advance.ts:30`); the route returns whatever the helper returns at `route.ts:104`. The intermediate `{old-stage, Done}` snapshot is never surfaced.

12. **AC-12 — SSE events are emitted.** ✅ Pass. Each `updateItemMeta` funnels through `writeMeta` (`workflow-store.ts:243`) → `emitItemUpdated` (`workflow-store.ts:30`). Two writes emit two `item-updated` events; Kanban consumes these live. Matches the "two events acceptable" OQ6 resolution.

13. **AC-13 — No regression: manual drag still works.** ✅ Pass. `KanbanBoard.tsx:105` sends `{ stage }` only; the stage-change branch at `route.ts:97-100` remains byte-identical; `updateItemMeta`'s `stageChanged && patch.status === undefined → status='Todo'` path at `workflow-store.ts:239-241` is unchanged.

14. **AC-14 — Concurrent Done PATCHes.** ✅ Pass. `writeMeta` writes atomically via `atomicWriteFile` (`workflow-store.ts:12-16`). Worst case remains a single extra hop per the acknowledged limitation; the terminal guard prevents advancing past the last stage under any interleaving.

### Heartbeat acceptance criteria (H-1 … H-12)

- **H-1 — Sweep advances stranded items.** ✅ Pass. `lib/auto-advance-sweeper.ts:28-47` walks `listWorkflows()` × `listItems(workflowId)`, `readItem`s each entry, and on `status==='Done'` calls `autoAdvanceIfEligible`, which performs the same advance primitive as the event path (`{ stage: next.name }` without a `status` field → store resets to Todo → `await triggerStagePipeline`). Upper-bound latency: one interval (default 60s from `lib/settings.ts:7`).

- **H-2 — Sweep is idempotent on non-eligible items.** ✅ Pass. `lib/auto-advance-sweeper.ts:39` skips non-Done items before the helper is invoked; inside the helper every ineligibility branch (`readStages` miss, flag !== true, at terminal, item deleted) returns `null` before any write (`lib/auto-advance.ts:10-19`). No `updateItemMeta` call is issued for non-eligible items.

- **H-3 — Interval is configurable and live-reloads.** ✅ Pass. `schedule()` re-invokes `readHeartbeatMs()` on every reschedule (`lib/auto-advance-sweeper.ts:60`). `readHeartbeatMs` re-reads `.nos/settings.yaml` each call (`lib/settings.ts:30-37`). The settings PUT handler calls `rescheduleHeartbeat()` after a successful write (`app/api/settings/heartbeat/route.ts:40`), which clears the existing timer and arms a new one at the freshly-read value.

- **H-4 — Zero or negative interval disables the sweep.** ✅ Pass. `lib/auto-advance-sweeper.ts:66`: `if (!Number.isFinite(ms) || ms <= 0) return;` exits `schedule()` without arming a timer (existing timer was cleared on entry). The event path remains active (no reference to the heartbeat in the route). A later PUT with a positive value triggers `rescheduleHeartbeat()` and the sweeper resumes.

- **H-5 — Event path still fires first.** ✅ Pass. For `nos-set-status --status Done` (no `stage` field), the PATCH body has `status:'Done'` only; the transition gate at `route.ts:102` catches it and advances in-request. By the time the next tick reads the item, `status==='Todo'` on the next stage, so the sweeper's `status !== 'Done'` guard at `auto-advance-sweeper.ts:39` skips it. No double-advance.

- **H-6 — Overlapping ticks do not double-advance.** ✅ Pass. `schedule()` uses a `setTimeout` chain rather than `setInterval`: the next tick is only scheduled after the current tick's awaited work completes (`auto-advance-sweeper.ts:68-74`). No overlap is possible by construction.

- **H-7 — Failure isolation.** ✅ Pass. Per-item work is wrapped in `try/catch` at `auto-advance-sweeper.ts:37-46`; errors from `readItem` or `autoAdvanceIfEligible` are logged with workflow/item identifiers and the loop continues. Per-workflow failure in `listItems` is also caught at `auto-advance-sweeper.ts:30-35`. The top-level `tick()` wrapper in `schedule()` catches any remaining throw at `auto-advance-sweeper.ts:69-73`; the next reschedule still fires.

- **H-8 — Settings endpoint shape.** ✅ Pass. `GET` returns `{ intervalMs }` at `app/api/settings/heartbeat/route.ts:7-15`. `PUT` at lines 17-46 validates `typeof === 'number' && isFinite && isInteger && >= 0`; any other shape returns 400 with `"intervalMs must be a finite non-negative integer"`. Malformed JSON also returns 400 via the catch at lines 21-23. Runtime pinned to `nodejs` at line 5.

- **H-9 — Observability.** ✅ Pass. `lib/auto-advance.ts:25-27` emits a single `console.log` line with `workflow=<id> item=<id> <old> -> <new>` on every successful advance. No log fires on no-op ticks (the helper returns `null` before the log).

- **H-10 — Settings UI.** ✅ Pass. `app/dashboard/settings/page.tsx:230-283` renders the "Auto-advance heartbeat" card: numeric input in minutes with `min=0 step=1`, `0 = disabled` hint, Save button gated on `!isHeartbeatDirty || !heartbeatValid`, dirty tracking, load-error banner, inline save-error + validation messages, green "Saved" flash for 2.5 s. Load on mount at lines 57-81. PUT body is `{ intervalMs: minutes * 60000 }` at line 150. Mirrors the System Prompt card's structure.

- **H-11 — Single-hop per tick.** ✅ Pass. `autoAdvanceIfEligible` is a single-shot function (`lib/auto-advance.ts`): it performs at most one `updateItemMeta` and one `triggerStagePipeline`, then returns. After the advance the item's status is `Todo`, so even if the per-item loop somehow re-examined it (it does not — the `for` iterates the items list once), `auto-advance-sweeper.ts:39`'s `status !== 'Done'` guard would skip. An item on a newly-flagged successor stage is not re-advanced until the next tick.

- **H-12 — Process lifecycle.** ✅ Pass. `instrumentation.ts` gates on `process.env.NEXT_RUNTIME === 'nodejs'` (line 2) before lazy-importing the sweeper and calling `startHeartbeat()`. Inside `schedule()`, `getTimer()` / `setTimer()` use the `globalThis.__nosAutoAdvanceTimer` sentinel (`auto-advance-sweeper.ts:7-17`) and any prior timer is `clearTimeout`-cleared before arming the next one (lines 52-56), so HMR reloads don't multiply timers. The timer is `unref`-ed at lines 77-79 so it does not block Node exit.

### Regression check

- **REQ-00017 AC-9 preserved.** The route's transition gate continues to refuse to invoke pipeline/advance for status-only non-Done PATCHes (see AC-9 above). Agent-driven `nos-set-status --status "In Progress"` does not recurse.
- **REQ-00015 unaffected.** `Stage.autoAdvanceOnComplete` shape untouched; `StageDetailDialog`'s PATCH still writes `true | false | null` and is read back as such.
- **REQ-00016 unaffected.** `triggerStagePipeline` signature and behavior unchanged; both callers (route, helper) use the same `await`-return shape.
- **Manual drag (KanbanBoard).** Sends `{ stage }` only; still hits the stage-change branch; no interaction with the heartbeat layer.
- **Settings file.** `.nos/settings.yaml` is created on first PUT; absent file is tolerated (`lib/settings.ts:17-20` returns `{}` on ENOENT → default 60000 ms applies). No existing keys are clobbered (read-modify-write at `lib/settings.ts:43-45`).

### Summary

All 14 event-path criteria (AC-1 … AC-14) and all 12 heartbeat criteria (H-1 … H-12) pass. AC-6, the prior cycle's single failure, is now satisfied via the heartbeat sweeper (latency ≤ one interval) exactly as the spec's "ItemDetailDialog path" technical constraint specifies. F1 (route refactor) is explicitly dropped from the spec as superseded.

### Manual verification to run on first boot (out of scope for this validation but worth noting for the operator)

- Drag an item into a stage with `autoAdvanceOnComplete: true`, open the detail dialog, flip status to Done, save, and watch — within one heartbeat interval (default 60 s) the item should jump to the next column and its new-stage agent should fire (visible via `console.log` line from `auto-advance.ts:25` and a new session appended to the item's `meta.yml`).
- In the settings page, set the interval to `0`, save, flip an item to Done via ItemDetailDialog, and confirm the item stays put. Restore to `1`, save, and confirm the next tick advances it.

### Follow-ups

None required to accept this requirement. Optional ideas captured in spec §Out of scope (Run-now button, Failed-item sweeping, sub-minute UI unit). F1 is superseded and closed.
