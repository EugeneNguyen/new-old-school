Design the core workflow engine that drives stages, items, and transitions.

## Analysis

### 1. Scope

**In scope**

* A canonical data model for `Workflow`, `Stage`, `WorkflowItem`, `ItemSession`, and `ItemStatus`, shared across the server, UI, and agent skills.
* A file-backed workflow store (`.nos/workflows/<id>/`) with atomic reads/writes for `meta.yml`, `index.md`, and per-workflow `config/stages.yaml`.
* Stage ordering, lookup, and per-stage configuration (prompt, `autoAdvanceOnComplete`, `agentId`, display caps).
* Item lifecycle transitions: `Todo → In Progress → Done | Failed`, with `Failed` pinned to the current stage until the operator resets it.
* A stage pipeline trigger that, when an item is `Todo` on a stage with a prompt, resolves the agent, builds the full agent prompt (system + stage + member + item), starts an adapter session, and records an `ItemSession`.
* Auto-advance semantics: on `Done`, if the stage has `autoAdvanceOnComplete: true`, move the item to the next stage and re-trigger.
* An event stream (`emitItemCreated` / `emitItemUpdated`) that downstream surfaces (Kanban, detail dialog) subscribe to.
* REST surface under `app/api/workflows/[id]/...` for listing, creating, reading, updating, commenting on items and stages.

**Out of scope (for this requirement)**

* Concrete adapter implementations beyond the `claude` default (tracked separately).
* Multi-user concurrency, locking, or distributed coordination — single-operator, single-process assumption stands.
* Authn/authz, audit log retention policies, RBAC.
* Cross-workflow dependencies or cross-workflow item references.
* Rich query/search, analytics, reporting.
* Undo/version history beyond what git gives us on the `.nos/` tree.

### 2. Feasibility

Technically straightforward — the engine is already partially implemented (`lib/workflow-store.ts`, `lib/stage-pipeline.ts`, `types/workflow.ts`, `.nos/workflows/requirements/config/stages.yaml`), so this requirement is primarily about **formalizing** the design, not greenfield construction.

**Risks / unknowns worth spiking:**

* **Race conditions on auto-advance.** Two quick status flips (e.g. agent sets `Done`, operator sets `Done` from UI) can both try to advance. Atomic file writes protect individual files but not multi-step transitions. Decide: serialize per-item via an in-process mutex, or make advance idempotent by re-reading before writing.
* **Session lifecycle on `Failed`.** If an adapter session is still running when the item is flipped to `Failed`, do we kill it or leave it? Needs a policy.
* **Event stream durability.** `emitItemUpdated` is fire-and-forget; if a UI client is disconnected during an auto-advance, it misses the intermediate state. Need to confirm SSE reconnect replays recent events or that clients refetch on reconnect.
* **Config hot-reload.** `stages.yaml` is read on demand; edits mid-pipeline can change stage semantics for an in-flight item. Decide whether stage config is snapshotted per-session or always read live.
* **Status-as-string coupling.** `ItemStatus` is a plain string union. Adding a new status (e.g. `Blocked`, `Cancelled`) touches types, UI, skills, and meta files in lockstep — acceptable for now but worth noting.

### 3. Dependencies

**Internal modules**

* `lib/workflow-store.ts` — persistence of items, stages, sessions.
* `lib/stage-pipeline.ts` — transition trigger and session creation.
* `lib/agent-adapter.ts` — session startup abstraction.
* `lib/system-prompt.ts` — prompt assembly.
* `lib/agents-store.ts` — agent resolution for `stage.agentId`.
* `lib/workflow-events.ts` — pub/sub for UI updates.
* `types/workflow.ts` — canonical types.
* `app/api/workflows/[id]/...` — HTTP surface.
* `components/dashboard/KanbanBoard.tsx`, `ItemDetailDialog.tsx`, `StageDetailDialog.tsx`, `NewItemDialog.tsx` — consuming UIs.
* `.claude/skills/nos-set-status/`, `.claude/skills/nos-comment-item/` — agent-side callers of the transition API.

**Related requirements**

* REQ-012, REQ-013 (sibling items in this workflow) — likely cover adapter and UI concerns on top of the engine.
* REQ-00014 (Skills for agents to interact with NOS) — consumer of the engine's status/comment endpoints.
* REQ-00034 (Member Agent) and REQ-00037 — exercise the pipeline end-to-end.

**External systems**

* Filesystem (`.nos/workflows/**`) — single source of truth.
* Claude CLI / adapter subprocess (via `agent-adapter`).
* Node/Next.js runtime — the engine assumes a single process owning the workflow directory.

### 4. Open questions

1. **Transition authority.** Who can move an item `Todo → In Progress`? Only the agent skill, only the server, or also the UI? Current code allows both; should we centralize?
2. **Failed recovery UX.** Spec says operator resets `Failed` items by dragging back to `Todo`. Is dragging the only path, or does the detail dialog also expose an explicit "Retry" action?
3. **Concurrency model.** Is per-item serialization enough, or do we need workflow-wide ordering for global invariants (e.g. id allocation)?
4. **Auto-advance on the final stage.** `Done` stage has `autoAdvanceOnComplete: false`, but what about a `Done` item on an intermediate stage where the next stage has no prompt? Define the no-op case explicitly.
5. **Stage mutability.** Can `config/stages.yaml` be edited at runtime? If so, what happens to items currently in a stage that was renamed or removed?
6. **Session retention.** `sessions[]` grows unbounded in `meta.yml`. Do we cap, rotate, or move history out-of-band?
7. **Event schema stability.** Are `emitItemCreated`/`emitItemUpdated` a committed public contract (consumed by skills or external tools), or internal-only?
8. **ID allocation.** Current padding is `ID_PADDING = 5`; is that a hard guarantee across workflows, and how do we handle legacy short IDs (e.g. `REQ-011`) that predate it?

These must be resolved before the Documentation stage locks the acceptance criteria.

## Specification

### 1. User stories

* As an operator, I want to create and manage workflows made of ordered stages, so that work can move through a predictable pipeline.
* As an operator, I want to create workflow items with persistent metadata and markdown content, so that each item has a durable source of truth on disk.
* As an operator, I want to move items between `Todo`, `In Progress`, `Done`, and `Failed`, so that execution state is visible and controllable.
* As an operator, I want `Failed` items to remain pinned to their current stage until I explicitly reset them, so that failures do not silently advance.
* As a stage agent, I want the system to invoke me automatically when an item becomes `Todo` on a stage with a prompt, so that stage work can run without manual orchestration.
* As an implementer, I want a canonical workflow type system shared by API routes, UI components, and agent skills, so that all surfaces agree on shape and behavior.
* As a UI client, I want item create and update events to be emitted whenever workflow state changes, so that the dashboard can stay in sync without polling every action.
* As an operator, I want items marked `Done` on auto-advancing stages to move to the next stage automatically, so that the workflow progresses with minimal manual intervention.

### 2. Acceptance criteria

1. **Canonical types**
   * Given server, UI, and skill code consume workflow data,
     when they import workflow types,
     then they must use a single canonical definition for `Workflow`, `Stage`, `WorkflowItem`, `ItemSession`, and `ItemStatus`.
2. **Workflow storage layout**
   * Given a workflow with id `<workflowId>`,
     when it is persisted,
     then its canonical on-disk location must be `.nos/workflows/<workflowId>/`.
   * And the workflow must store metadata in `meta.yml`, item content in per-item `index.md` and `meta.yml`, and stage configuration in `config/stages.yaml`.
3. **Atomic persistence**
   * Given any write to workflow metadata, item metadata, item markdown, or stage configuration,
     when the write completes,
     then the written file must not be left in a partially written state visible to subsequent reads in the same process.
4. **Stage ordering and lookup**
   * Given a workflow stage configuration,
     when the engine resolves a stage by name or by position,
     then stage order must be derived from `config/stages.yaml` and preserved consistently across API responses, UI rendering, and transition logic.
5. **Item lifecycle states**
   * Given a workflow item,
     when its status changes,
     then the only supported statuses for this requirement are `Todo`, `In Progress`, `Done`, and `Failed`.
6. **Failed items stay pinned**
   * Given an item in status `Failed`,
     when no explicit operator reset occurs,
     then the engine must keep the item on its current stage and must not auto-advance it.
7. **Reset from failed**
   * Given an item in status `Failed`,
     when an operator resets it to `Todo`,
     then the item remains on the same stage and becomes eligible for that stage's pipeline trigger again.
8. **Pipeline trigger eligibility**
   * Given an item is on a stage,
     when the item status becomes `Todo` and that stage has a non-empty stage prompt,
     then the engine must attempt to run the stage pipeline for that item.
   * Given a stage has no prompt,
     when an item is `Todo` on that stage,
     then no agent session is started automatically.
9. **Prompt assembly**
   * Given the engine starts a stage pipeline run,
     when it builds the adapter prompt,
     then the prompt must include system-level instructions, the stage prompt, the resolved member/agent prompt, and the item content.
10. **Agent resolution**
    * Given a stage declares an `agentId`,
      when the pipeline starts,
      then the engine must resolve that agent configuration before creating the adapter session.
    * If no explicit `agentId` is configured,
      then the default configured adapter/agent path for the workflow engine must be used.
11. **Session recording**
    * Given the engine starts an adapter session for an item,
      when session creation succeeds,
      then an `ItemSession` record must be appended to the item metadata with at least the stage, adapter, session identifier, and start timestamp.
12. **Status updates are observable**
    * Given an item is created or updated through the workflow engine,
      when the operation succeeds,
      then the engine must emit the corresponding item-created or item-updated event for subscribers.
13. **REST surface**
    * Given clients manage workflows over HTTP,
      when they interact with the engine,
      then the API under `app/api/workflows/[id]/...` must support listing, creating, reading, and updating items, adding comments to items, and reading and updating stages.
14. **Auto-advance behavior**
    * Given an item is marked `Done` on a stage whose `autoAdvanceOnComplete` is `true`,
      when a next stage exists,
      then the engine must move the item to the next stage, set the item to that next stage's starting state, and evaluate that stage for pipeline triggering.
15. **No-op auto-advance at terminal boundary**
    * Given an item is marked `Done` on a stage with `autoAdvanceOnComplete: true` and no next stage exists,
      when the update is processed,
      then the engine must leave the item on the current stage with status `Done` and perform no further transition.
16. **Next stage without prompt**
    * Given an item auto-advances into a next stage that has no prompt,
      when the transition completes,
      then the item must be visible on that stage and no automatic agent session is started.
17. **Single-process assumption**
    * Given the engine runs in the supported deployment model,
      when reads and writes occur,
      then correctness is only required under a single-operator, single-process ownership model for the `.nos/workflows/**` tree.
18. **Out-of-scope exclusions are enforced**
    * Given future requests touch multi-user coordination, auth, analytics, cross-workflow links, or non-default adapters,
      when evaluating completion of this requirement,
      then those capabilities must not be required for this requirement to be considered complete.

### 3. Technical constraints

* Canonical shared types must live in `types/workflow.ts` and be imported by server code, UI code, and skill-facing logic instead of redefining workflow shapes locally.
* Workflow persistence must remain file-backed under `.nos/workflows/<workflowId>/`; the filesystem is the source of truth for workflow state.
* The engine must interoperate with the existing persistence and pipeline modules in `lib/workflow-store.ts`, `lib/stage-pipeline.ts`, `lib/agent-adapter.ts`, `lib/system-prompt.ts`, and `lib/agents-store.ts`.
* Stage definitions must be read from `.nos/workflows/<workflowId>/config/stages.yaml` and preserve explicit order from the file.
* Item content must remain markdown in each item's `index.md`; structured item metadata, including comments and sessions, must remain in each item's `meta.yml`.
* `ItemStatus` for this requirement is limited to the string union `Todo | In Progress | Done | Failed`; introducing additional statuses is out of scope for this requirement.
* The event contract required by this specification is limited to emitting item-created and item-updated notifications through the existing workflow events layer consumed by dashboard surfaces.
* The HTTP surface must remain under `app/api/workflows/[id]/...` so existing dashboard clients and skills can continue to integrate with stable route locations.
* The engine must assume a single Node/Next.js process owns workflow directory mutations; no distributed locking or cross-process coordination is required.
* Session history is recorded as append-only item metadata for this requirement; retention, pruning, and archival policy are explicitly deferred.
* Legacy item ids that already exist on disk, including shorter ids such as `REQ-011`, must remain readable and operable; this requirement does not mandate migration to a new id format.
* If stage configuration changes at runtime, behavior is defined by the configuration as read by the engine at the time it evaluates the transition; snapshotting per session is not required by this requirement.

### 4. Out of scope

* Implementing adapter backends beyond the default `claude` path.
* Supporting multiple simultaneous operators, multi-process mutation, distributed locks, or conflict resolution.
* Authentication, authorization, role-based access control, or audit-retention policy.
* Cross-workflow dependencies, references, or orchestration between workflows.
* Search, reporting, analytics, dashboards beyond current workflow UI consumption, or historical trend views.
* Undo, rollback, or version history beyond files persisted in `.nos/` and whatever git history already provides.
* Session cancellation policy for already running adapters after an item is flipped to `Failed`.
* History retention caps, archival, or storage compaction for `sessions[]`.
* Introducing new item statuses such as `Blocked` or `Cancelled`.
* Changing the external contract of sibling requirements except where they already consume this engine.

## Implementation Notes

* Verified the canonical shared workflow types live in `types/workflow.ts` and are imported by the engine, API routes, events layer, and dashboard consumers.
* Verified workflow persistence remains file-backed under `.nos/workflows/<workflowId>/`, with atomic writes for item metadata, item markdown, and `config/stages.yaml` handled in `lib/workflow-store.ts`.
* Verified stage ordering, lookup, pipeline triggering, session recording, status observability, and auto-advance behavior are implemented across `lib/workflow-store.ts`, `lib/stage-pipeline.ts`, `lib/auto-advance.ts`, and `app/api/workflows/[id]/items/[itemId]/route.ts`.
* No implementation changes were required beyond updating this requirement item to reflect that the existing code satisfies the finalized specification.
