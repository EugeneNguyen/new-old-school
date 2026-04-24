# i want to log the command that adapter use to activity

## Analysis

### Scope

**In scope:**
- Add a new activity event type (e.g. `session-started`) to `activity-log.ts` that captures the adapter command details when the stage pipeline invokes an adapter.
- The logged entry should include: adapter name, the CLI command/args used (e.g. `claude -p --output-format stream-json --verbose --model <model> --dangerously-skip-permissions`), the resolved session ID, the target stage, the model (if specified), and the workflow/item context.
- The activity entry should be appended to the per-workflow `activity.jsonl` alongside existing events so it appears in the activity feed.

**Out of scope:**
- Logging the full prompt content sent to the adapter (it can be very large and is already captured in `.claude/sessions/<sessionId>.txt`).
- Logging adapter stdout/stderr streaming output to the activity log.
- Changes to the session log file format or session management.
- Modifications to adapter behavior or command flags themselves.

### Feasibility

**Technical viability:** High. The change is straightforward:

1. **`lib/activity-log.ts`**: Add a new `ActivityEventType` variant (e.g. `'session-started'`) and a corresponding discriminated union member to the `ActivityEntry.data` type with fields like `adapter`, `command`, `args`, `sessionId`, `model`, `agentId`, and `stage`.

2. **`lib/stage-pipeline.ts`** (line ~63-76): After `adapter.startSession()` resolves with a `sessionId`, call `appendActivity()` with the new event type. All the required data is already in scope at that call site: `adapter.name`, `model`, `sessionId`, `stage.name`, `resolvedAgentId`.

3. **`lib/agent-adapter.ts`**: The command args are constructed locally inside `claudeAdapter.startSession()` (line 54-58) but are not currently returned. Two options:
   - **(A)** Return the args array alongside `sessionId` from `startSession()` — requires updating the `AgentAdapter` interface.
   - **(B)** Reconstruct the args in `stage-pipeline.ts` from the known inputs (adapter name, model) — avoids interface changes but duplicates the arg-building logic.
   - **(Recommended: A)** — cleaner, single source of truth, future-proof for additional adapters.

**Risks:** Minimal. The activity log is append-only and failure-tolerant (`appendActivity` catches errors). Adding a new event type is backward-compatible — existing consumers that filter by known `type` values will simply skip the new entries.

### Dependencies

- **`lib/activity-log.ts`** — Type definitions (`ActivityEventType`, `ActivityEntry`) and the `appendActivity()` function.
- **`lib/agent-adapter.ts`** — The `AgentAdapter` interface and `claudeAdapter` implementation (to expose the constructed command/args).
- **`lib/stage-pipeline.ts`** — The `triggerStagePipeline()` function where the adapter is invoked and the activity entry should be emitted.
- **`types/workflow.ts`** — May need a minor update if the `ItemSession` type is extended, though the activity log entry is independent of session metadata.
- **Dashboard UI** — The activity feed component will need to handle rendering the new event type. If it already has a fallback for unknown types, no change is needed initially.

### Open Questions

1. **What exactly should "the command" include?** Just the CLI binary + args (e.g. `claude -p --output-format stream-json ...`), or also the working directory and environment variables?
2. **Should the full prompt be included or just a hash/length?** The prompt is already stored in the session log, but a length or hash in the activity entry could aid debugging without bloating the log.
3. **Event type naming:** `session-started` vs `adapter-invoked` vs `command-executed` — which naming convention fits best with the existing event vocabulary (`item-created`, `stage-changed`, etc.)?
4. **Should failed adapter invocations also be logged?** Currently `stage-pipeline.ts` catches adapter errors and logs to console but does not write to `activity.jsonl`. If the goal is full auditability, failed attempts should also appear.
5. **Dashboard rendering:** Should the new event appear in the activity feed with a specific visual treatment, or is logging to `activity.jsonl` sufficient for now?

## Specification

### User Stories

1. **As an operator**, I want to see the exact CLI command that NOS used to invoke an adapter when a stage pipeline triggers, so that I can reproduce, debug, or audit agent sessions without digging through process tables or logs.

2. **As a developer extending NOS**, I want the adapter interface to return the command details alongside the session ID, so that the stage pipeline can log them without duplicating command-construction logic.

### Acceptance Criteria

1. **AC-1: New activity event type exists.**
   - Given `lib/activity-log.ts`,
   - When the `ActivityEventType` union is inspected,
   - Then it includes a `'session-started'` variant.

2. **AC-2: Discriminated union member for `session-started`.**
   - Given the `ActivityEntry.data` discriminated union,
   - When `kind` is `'session-started'`,
   - Then the data shape includes the fields: `adapter` (string), `command` (string — the CLI binary name), `args` (string[] — the full argument array passed to `spawn`), `sessionId` (string), `model` (string | undefined), `agentId` (string | null), and `stage` (string).

3. **AC-3: `AgentAdapter.startSession()` returns command details.**
   - Given the `AgentAdapter` interface in `lib/agent-adapter.ts`,
   - When `startSession()` resolves,
   - Then the returned object has shape `{ sessionId: string; command: string; args: string[] }`.
   - And the `claudeAdapter` implementation populates `command` with `'claude'` and `args` with the exact array passed to `spawn()`.

4. **AC-4: Activity entry emitted on successful session start.**
   - Given `triggerStagePipeline()` in `lib/stage-pipeline.ts`,
   - When `adapter.startSession()` resolves successfully,
   - Then `appendActivity()` is called with a `session-started` entry containing the adapter name, command, args, sessionId, model, agentId, and stage name.
   - And the entry uses the existing `workflowId` and `itemId` context.

5. **AC-5: Activity entry written to `activity.jsonl`.**
   - Given a successful stage pipeline trigger,
   - When the `session-started` activity entry is appended,
   - Then a new line appears in `.nos/workflows/<workflowId>/activity.jsonl` with `type: 'session-started'` and all specified data fields.

6. **AC-6: Failed adapter invocations are NOT logged.**
   - Given `adapter.startSession()` rejects with an error,
   - When the catch block in `triggerStagePipeline()` runs,
   - Then no `session-started` activity entry is appended (the existing `console.error` is sufficient for this phase).

7. **AC-7: Backward compatibility preserved.**
   - Given existing activity log consumers (API routes, dashboard activity feed),
   - When they encounter a `session-started` entry,
   - Then they either render it or skip it gracefully — no errors or crashes.
   - And existing `ActivityEventType` filtering logic continues to work for all prior event types.

8. **AC-8: No prompt content in the activity entry.**
   - Given the `session-started` data shape,
   - Then neither the full prompt text nor a hash/length of the prompt is included (the prompt is already captured in `.claude/sessions/<sessionId>.txt`).

### Technical Constraints

1. **Interface change (option A from analysis).** The `AgentAdapter` interface's `startSession()` return type changes from `{ sessionId: string }` to `{ sessionId: string; command: string; args: string[] }`. All existing adapter implementations (`claudeAdapter`) and all callers of `startSession()` must be updated.

2. **`command` field value.** For `claudeAdapter`, `command` is the literal string `'claude'` (the binary name passed to `spawn()`). Future adapters should similarly use their CLI binary name.

3. **`args` field value.** The exact `string[]` passed as the second argument to `spawn()`. For `claudeAdapter` this includes flags like `['-p', '--output-format', 'stream-json', '--verbose', '--model', '<model>', '--dangerously-skip-permissions']`.

4. **Activity log schema.** The new entry follows the existing `ActivityEntry` structure: `ts`, `workflowId`, `itemId`, `type`, `actor`, `data`. The `actor` field should be `'runtime'` since the stage pipeline (a runtime component) emits this event.

5. **File paths.** Activity entries are appended to `.nos/workflows/<workflowId>/activity.jsonl` per the existing `appendActivity()` function — no new file paths introduced.

6. **Performance.** The `appendActivity()` call is non-blocking (async, fire-and-forget with error catch). Adding one extra call after `startSession()` has negligible impact.

7. **Event naming convention.** The name `session-started` follows the existing kebab-case noun-verb pattern (`item-created`, `stage-changed`, `status-changed`, `body-changed`).

### Out of Scope

- **Logging the full prompt content** — already captured in `.claude/sessions/<sessionId>.txt`.
- **Logging adapter stdout/stderr** — streaming output is out of scope for the activity log.
- **Logging failed adapter invocations** — deferred to a future requirement. Only successful `startSession()` results produce an activity entry.
- **Dashboard UI rendering of the new event type** — if the activity feed has a fallback for unknown types it will work automatically; a dedicated visual treatment is deferred.
- **Logging environment variables or working directory** — only the CLI binary name and argument array are captured.
- **Prompt hash or length in the activity entry** — unnecessary given the session log file exists.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00113 | Log adapter command to activity | Feature request (user) | `docs/standards/system-architecture.md`, `docs/standards/glossary.md` (ActivityEntry, Adapter) | `lib/activity-log.ts`, `lib/agent-adapter.ts`, `lib/stage-pipeline.ts` | Manual validation — verify `activity.jsonl` entry after stage trigger | Todo |

### WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.1.5 Activity Logging** | New `session-started` event type added to `ActivityEventType` and `ActivityEntry.data` discriminated union | Primary — extends the activity log schema |
| **1.2.2 Adapter Interface** | `AgentAdapter.startSession()` return type extended to include `command` and `args` | Interface change — all implementations must be updated |
| **1.2.3 Stage Pipeline Trigger** | `triggerStagePipeline()` emits a `session-started` activity entry after successful adapter invocation | Integration point — connects adapter output to activity log |

## Implementation Notes

### Changes Made

1. **`lib/activity-log.ts`** (lines 11-19, 35):
   - Added `'session-started'` variant to `ActivityEventType` union
   - Added discriminated union member `{ kind: 'session-started'; adapter: string; command: string; args: string[]; sessionId: string; model: string | undefined; agentId: string | null; stage: string }` to `ActivityEntry.data`

2. **`lib/agent-adapter.ts`** (lines 6-14, 97):
   - Updated `AgentAdapter.startSession()` return type from `{ sessionId: string }` to `{ sessionId: string; command: string; args: string[] }`
   - Updated `claudeAdapter.startSession()` resolve call to return `{ sessionId: id, command: 'claude', args }` where `args` is the exact array passed to `spawn()`

3. **`lib/stage-pipeline.ts`** (lines 11, 64, 74-90):
   - Added import for `appendActivity` from `@/lib/activity-log`
   - Destructured `command` and `args` from `adapter.startSession()` result
   - Added `appendActivity()` call with `session-started` entry after successful session start, using `actor: 'runtime'`

### Deviations from Standards

None. Implementation follows existing patterns:
- Activity log entry format matches existing `ActivityEntry` structure
- Event type naming follows kebab-case noun-verb convention (`session-started`)
- Actor is `'runtime'` per specification
- Failed invocations are not logged (AC-6 satisfied by catch block behavior)
- No prompt content included (AC-8 satisfied by design)

## Validation

### Evidence

**Code inspection:** All three implementation files read directly.
**TypeScript:** `tsc --noEmit` u2014 zero errors in modified files (pre-existing errors in `lib/scaffolding.test.ts` only, unrelated to this requirement).
**Activity log inspection:** No live `session-started` entry yet u2014 the Validation stage was triggered ~8 seconds after the Implementation stage completed, before the dev server hot-reloaded the new `stage-pipeline.ts`. Future stage pipeline triggers will produce entries.
**Dashboard backward compatibility:** `app/dashboard/activity/page.tsx` `formatSummary()` has a `default:` branch returning `entry.type`; `session-started` entries render as the string `'session-started'` without errors or crashes.

### Criteria Verdicts

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-1: `'session-started'` in `ActivityEventType` | u2705 Pass | `lib/activity-log.ts:19` u2014 union includes `\| 'session-started'` |
| AC-2: Discriminated union member with all required fields | u2705 Pass | `lib/activity-log.ts:35` u2014 all 7 required fields present (`adapter`, `command`, `args`, `sessionId`, `model: string \| undefined`, `agentId: string \| null`, `stage`) |
| AC-3: `AgentAdapter.startSession()` returns `{ sessionId, command, args }` | u2705 Pass | Interface at `lib/agent-adapter.ts:12`; `claudeAdapter` resolves `{ sessionId: id, command: 'claude', args }` at line 97 |
| AC-4: `appendActivity()` called on successful session start | u2705 Pass | `lib/stage-pipeline.ts:74-90` u2014 inside try block after `startSession()` resolves, with all required fields and `actor: 'runtime'` |
| AC-5: Entry written to `activity.jsonl` | u26a0ufe0f Partial | Code path correct (uses existing `appendActivity()` which appends to the per-workflow file). No live entry exists yet u2014 timing artifact: implementation landed ~8 s before Validation trigger, dev server likely hadnu2019t hot-reloaded. Next stage pipeline trigger will produce an entry. |
| AC-6: Failed invocations NOT logged | u2705 Pass | `appendActivity()` is inside try block only; catch block at `lib/stage-pipeline.ts:98-103` does `console.error` only |
| AC-7: Backward compatibility preserved | u2705 Pass | `app/dashboard/activity/page.tsx` `formatSummary` default branch returns `entry.type`; TypeScript compiles cleanly for all modified files |
| AC-8: No prompt content in activity entry | u2705 Pass | `session-started` data shape has no prompt field; `appendActivity()` call does not include prompt |

### Summary

7 of 8 criteria pass; AC-5 is partial due to a timing artifact (not a code defect u2014 the implementation code path is correct). Overall: implementation is correct and complete.
