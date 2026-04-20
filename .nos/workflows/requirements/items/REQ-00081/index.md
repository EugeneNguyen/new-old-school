* still a workflow with full function
* enable routine mode in setting
* fill in the cron expression
  * at that cron, generate a new item with just a title like (automated routine) and a timeline

## Analysis

### 1. Scope

**In scope:**
- A per-workflow "routine mode" toggle stored in the workflow's configuration (likely `config/settings.yaml` or a new `routine.yaml` alongside `stages.yaml`).
- A cron expression field in the workflow settings that defines when to auto-create items.
- A server-side scheduler (integrated into the existing heartbeat sweeper or as a parallel scheduler) that evaluates cron expressions and fires item creation at the specified times.
- Auto-created items should have:
  - A title following a pattern like `(automated routine) YYYY-MM-DD HH:mm`.
  - An empty or minimal body (a timestamp/timeline note).
  - Placement in the first stage of the workflow (same as manual creation).
  - Stage pipeline triggered normally after creation.
- UI in the workflow settings panel to enable/disable routine mode and edit the cron expression.

**Out of scope:**
- Custom item body templates or dynamic content generation for routine items.
- Multiple cron schedules per workflow (one cron per workflow for v1).
- Timezone configuration (use server local time for v1).
- Retroactive item creation if the server was down during a scheduled tick.

### 2. Feasibility

**Technical viability:** High. The existing `auto-advance-sweeper.ts` already runs a periodic heartbeat (`autoAdvanceHeartbeatMs`) that iterates over all workflows. A cron evaluator can be added to this tick loop (or a parallel loop) to check whether a routine is due.

**Approach options:**
- **Option A (Piggyback on heartbeat):** Add cron evaluation to the existing `tick()` in `auto-advance-sweeper.ts`. Each tick checks if any workflow's cron expression has fired since the last check. Lightweight but couples scheduling granularity to the heartbeat interval (currently 15s — sufficient for minute-level cron).
- **Option B (Dedicated scheduler):** A separate `setInterval` or `setTimeout`-based scheduler that only handles routine creation. Cleaner separation but more moving parts.

**Recommendation:** Option A — the heartbeat already ticks every 15 seconds, which is well within the granularity needed for cron (minute-level). Adding cron checks there avoids a second timer.

**Risks:**
- **Duplicate creation:** If the heartbeat fires multiple times within the same cron minute, duplicate items could be created. Mitigation: persist a `lastFiredAt` timestamp per workflow and only fire if the current minute is strictly newer.
- **Server restarts:** The `lastFiredAt` state must survive process restarts. Storing it in a file (e.g., `.nos/workflows/<id>/routine-state.json`) is sufficient.
- **Cron parsing:** Need a reliable cron parser library. `cron-parser` (npm) is well-maintained and handles standard 5-field expressions.

### 3. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `lib/auto-advance-sweeper.ts` | Internal module | The tick loop where cron evaluation will be integrated |
| `lib/workflow-store.ts` (`createItem`) | Internal module | Used to create the routine item programmatically |
| `lib/settings.ts` | Internal module | Pattern for reading/writing per-workflow config |
| `stages.yaml` / workflow config | Config file | The routine settings will live alongside or within workflow config |
| `app/api/workflows/[id]/items/route.ts` | API route | Existing item creation endpoint; routine creation should use the same `createItem` logic internally |
| `cron-parser` (or similar) | External npm package | Needed to parse and evaluate cron expressions |
| Workflow settings UI | Frontend | Needs new fields for toggling routine mode and entering cron expression |
| `triggerStagePipeline` | Internal module | Auto-created items should still trigger their first stage's pipeline |

### 4. Open Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | Should routine items have a distinguishable marker in `meta.yml` (e.g., `source: routine`)? | **Yes** — add an `origin: routine` field so the UI can visually differentiate automated items from manually created ones. |
| 2 | What happens if the workflow has routine mode enabled but no stages configured? | **Skip creation** — same guard as the existing `POST /items` endpoint. Log a warning. |
| 3 | Should there be a way to pause routine mode without fully disabling it (e.g., a "paused" state)? | **Not for v1** — the toggle (enabled/disabled) is sufficient. A paused state can be added later if needed. |
| 4 | What title format should routine items use? | **`(routine) YYYY-MM-DD HH:mm`** — concise, sortable, and clearly signals automation. |
| 5 | Should routine items start in the first stage or a configurable target stage? | **First stage** — consistent with manual creation. A `routineTargetStage` setting can be added in a future iteration. |
| 6 | Should the cron expression be validated on save in the UI? | **Yes** — parse the expression on the client and show an inline error before persisting. Also validate server-side. |
| 7 | Does "timeline" in the original request mean recording the creation timestamp in the item body? | **Yes** — include a one-line body like `Created by routine at 2026-04-20 09:00` to provide context. |

## Specification

### 1. User Stories

- **US-1:** As a workflow owner, I want to enable routine mode on a workflow, so that items are created automatically on a schedule without manual intervention.
- **US-2:** As a workflow owner, I want to configure a cron expression for routine mode, so that I can control exactly when automated items are generated.
- **US-3:** As a workflow owner, I want to disable routine mode at any time, so that automatic item creation stops immediately.
- **US-4:** As a team member, I want to distinguish routine-created items from manually created items, so that I can understand the origin of each item at a glance.
- **US-5:** As a workflow owner, I want routine items to trigger the normal stage pipeline after creation, so that they flow through the same process as manual items.

### 2. Acceptance Criteria

1. **Given** a workflow with routine mode disabled, **when** the user enables routine mode and saves a valid cron expression in the workflow settings UI, **then** the configuration is persisted in `.nos/workflows/<id>/config/routine.yaml`.

2. **Given** a workflow with routine mode enabled and a cron expression of `0 9 * * *`, **when** the server heartbeat ticks past 09:00, **then** exactly one new item is created with the title `(routine) YYYY-MM-DD HH:mm` matching the scheduled time.

3. **Given** a routine item has just been created, **then** its `meta.yml` contains `origin: routine` and its body contains a single line: `Created by routine at YYYY-MM-DD HH:mm`.

4. **Given** a routine item has been created, **then** the first stage's pipeline is triggered for that item (same behavior as a manually created item).

5. **Given** a workflow with routine mode enabled, **when** the heartbeat ticks multiple times within the same cron-matched minute, **then** only one item is created (deduplication via `lastFiredAt` in `routine-state.json`).

6. **Given** the server is restarted, **when** it comes back up and the heartbeat ticks, **then** it reads `lastFiredAt` from `.nos/workflows/<id>/routine-state.json` and does not duplicate a past creation.

7. **Given** a workflow with routine mode enabled but no stages configured, **when** the cron fires, **then** no item is created and a warning is logged.

8. **Given** a user enters an invalid cron expression in the settings UI, **when** they attempt to save, **then** an inline validation error is shown and the expression is not persisted.

9. **Given** a user disables routine mode, **when** the next cron tick would have fired, **then** no item is created.

10. **Given** a routine item is created, **then** the workflow's `activity.jsonl` records an event of type `routine-item-created`.

### 3. Technical Constraints

**Configuration storage:**
- Routine settings are stored in `.nos/workflows/<id>/config/routine.yaml` with the schema:
  ```yaml
  enabled: boolean
  cron: string          # standard 5-field cron expression (minute hour dom month dow)
  ```
- `routine-state.json` lives at `.nos/workflows/<id>/routine-state.json` with the schema:
  ```json
  { "lastFiredAt": "ISO-8601 datetime string or null" }
  ```

**Scheduler integration:**
- Cron evaluation is added to the existing heartbeat `tick()` in `lib/auto-advance-sweeper.ts`.
- The heartbeat interval is 15 000 ms (per `.nos/settings.yaml`), which provides adequate granularity for minute-level cron.
- Use the `cron-parser` npm package (or equivalent) to evaluate whether the current minute matches the cron expression and is strictly newer than `lastFiredAt`.

**Item creation:**
- Use the existing `createItem` function from `lib/workflow-store.ts`.
- Title format: `(routine) YYYY-MM-DD HH:mm` (24-hour, server local time).
- Body: `Created by routine at YYYY-MM-DD HH:mm`.
- `meta.yml` must include `origin: routine`.
- After creation, call `triggerStagePipeline` for the new item.

**API / UI:**
- The workflow settings UI (within the workflow detail page at `app/dashboard/workflows/[id]/page.tsx` or a dedicated settings panel) must expose:
  - A toggle for enabling/disabling routine mode.
  - A text input for the cron expression with client-side validation (parse with `cron-parser` and show an error if invalid).
- A server-side API endpoint (e.g., `PUT /api/workflows/[id]/routine`) must validate the cron expression before writing `routine.yaml`.

**Activity logging:**
- Log a `routine-item-created` event to the workflow's `activity.jsonl` via the existing `logActivity` utility.

**Performance / safety:**
- The cron check adds negligible cost per tick (one file read of `routine.yaml` + one file read of `routine-state.json` + one cron parse per workflow with routine enabled).
- File writes (`routine-state.json`) must be atomic (write-to-temp then rename) to avoid corruption on crash.

### 4. Out of Scope

- Multiple cron schedules per workflow.
- Timezone selection (server local time is used).
- Retroactive/catch-up creation for missed ticks while the server was down.
- Custom item body templates or dynamic content beyond the timestamp line.
- A "paused" state distinct from disabled.
- Configurable target stage (items always start at the first stage).
- Notification or alerting when routine items are created.
- Routine mode for workflows that have no stages (guarded and skipped silently with a log warning).

## Implementation Notes

### Files created/modified

1. **`lib/routine-scheduler.ts`** (new) - Core routine scheduling logic:
   - `readRoutineConfig()` / `writeRoutineConfig()` - manage `.nos/workflows/<id>/config/routine.yaml`
   - `readRoutineState()` / `writeRoutineState()` - manage `.nos/workflows/<id>/routine-state.json`
   - `validateCronExpression()` - uses `CronExpressionParser.parse()`
   - `processWorkflow()` - evaluates cron, creates routine item, marks `origin: routine` in meta.yml, logs `routine-item-created` activity, triggers stage pipeline
   - `tickRoutines()` - called by heartbeat sweeper each tick

2. **`lib/auto-advance-sweeper.ts`** (modified) - Added `tickRoutines()` call inside the project root tick loop.

3. **`lib/activity-log.ts`** (modified) - Added `routine-item-created` to `ActivityEventType` union and `ActivityEntry.data` discriminated union.

4. **`app/api/workflows/[id]/routine/route.ts`** (new) - GET/PUT endpoint for routine config with server-side cron validation.

5. **`components/dashboard/RoutineSettingsDialog.tsx`** (new) - Dialog with toggle switch and cron input, client-side format validation, API integration.

6. **`components/dashboard/WorkflowItemsView.tsx`** (modified) - Added "Routine" button and `RoutineSettingsDialog` component.

### Key implementation decisions

- **Deduplication**: `lastFiredAt` in `routine-state.json` tracks the last time a routine item was created. Only creates if `scheduledTime > lastFiredAt`. Survives server restarts.
- **Item creation**: Uses existing `createItem()` with `actor: 'runtime'`. After creation, reads meta.yml and adds `origin: routine` field.
- **Title format**: `(routine) YYYY-MM-DD HH:mm` (24-hour, server local time).
- **Body**: `Created by routine at YYYY-MM-DD HH:mm`.
- **Stage pipeline**: `triggerStagePipeline()` called after item creation, same as manual creation.
- **Activity logging**: `routine-item-created` event appended to `activity.jsonl`.
- **Atomic writes**: All state files use write-to-temp-then-rename pattern.
- **Cron library**: `cron-parser` v5.5.0, uses `CronExpressionParser.parse()` (not `parseExpression`).

## Validation

### AC-1 — Config persisted to `routine.yaml` — **PASS**
`writeRoutineConfig()` in `lib/routine-scheduler.ts:53` writes `routine.yaml` atomically to `.nos/workflows/<id>/config/routine.yaml`. The PUT endpoint at `app/api/workflows/[id]/routine/route.ts:26` validates and calls it. The `RoutineSettingsDialog` calls PUT on save. Path and schema match the spec.

### AC-2 — Exactly one item created with correct title on cron fire — **FAIL → FIXED**
**Bug found**: `lib/routine-scheduler.ts:116` used `iter.next().toDate()` instead of `iter.prev().toDate()`. `next()` returns the _next_ future occurrence, which is always `> now`, so the guard `if (scheduledTime > now) return` always triggered and items were **never created**. Fixed in-place: changed to `iter.prev().toDate()` so the scheduler correctly detects when the most recent occurrence is newer than `lastFiredAt`. Verified with `node -e` that `CronExpressionParser.parse('0 9 * * *', { currentDate: new Date('2026-04-20T09:00:30Z') }).prev().toDate()` returns `2026-04-20T02:00:00.000Z` (correct 09:00 local).

### AC-3 — `origin: routine` in meta.yml and correct body — **PASS** (after AC-2 fix)
Code at `lib/routine-scheduler.ts:147-158` patches `origin: routine` into meta.yml after item creation. Title and body use `formatRoutineTime(scheduledTime)` producing `(routine) YYYY-MM-DD HH:mm` and `Created by routine at YYYY-MM-DD HH:mm`. Atomic write used.

### AC-4 — Stage pipeline triggered — **PASS** (after AC-2 fix)
`triggerStagePipeline(workflowId, created.id)` called at `lib/routine-scheduler.ts:175`.

### AC-5 — Deduplication within same cron minute — **PASS** (after AC-2 fix)
`lastFiredAt` written as `now.toISOString()` immediately after creation (`lib/routine-scheduler.ts:162`). Next tick computes same `scheduledTime` via `prev()` and the check `scheduledTime <= lastFired` returns true, preventing duplicate creation.

### AC-6 — Restart resilience — **PASS**
`readRoutineState()` reads from file (`lib/routine-scheduler.ts:68`). `writeRoutineState()` uses `atomicWriteFile` (temp+rename). On restart the persisted `lastFiredAt` prevents re-creation of the same scheduled minute.

### AC-7 — No creation when no stages — **PASS**
`lib/routine-scheduler.ts:106-109` checks `stages.length === 0`, logs a warning, and returns early.

### AC-8 — Client-side cron validation with inline error — **PARTIAL**
The UI shows an inline error before save (`RoutineSettingsDialog.tsx:64-66`). However, `isValidCronFormat()` (`RoutineSettingsDialog.tsx:192-195`) only checks for 5 whitespace-separated fields — it does not actually parse the expression with `cron-parser`. Invalid values like `99 99 99 99 99` pass client-side but are rejected by the server. The server error _is_ surfaced inline via the `error` state, so the user still sees a message. The spec called for parsing with `cron-parser` on the client; the implementation uses a looser check. **Follow-up**: Replace `isValidCronFormat` with an actual `cron-parser` parse attempt on the client.

### AC-9 — No creation when routine disabled — **PASS**
`lib/routine-scheduler.ts:103` returns early when `!config.enabled`.

### AC-10 — `routine-item-created` activity logged — **PASS** (after AC-2 fix)
`appendActivity` called at `lib/routine-scheduler.ts:165-172` with `type: 'routine-item-created'`. `ActivityEventType` union and `ActivityEntry.data` discriminated union in `lib/activity-log.ts:11-32` both include the new event kind.

---

### Summary

| Criterion | Verdict | Notes |
|---|---|---|
| AC-1 Config persisted | **PASS** | |
| AC-2 Item created on cron fire | **FIXED** | Critical bug: `iter.next()` → `iter.prev()` |
| AC-3 `origin: routine` + body | **PASS** | Contingent on AC-2 fix |
| AC-4 Stage pipeline triggered | **PASS** | Contingent on AC-2 fix |
| AC-5 Deduplication | **PASS** | Contingent on AC-2 fix |
| AC-6 Restart resilience | **PASS** | |
| AC-7 No creation without stages | **PASS** | |
| AC-8 Client-side cron validation | **PARTIAL** | Count-only check; follow-up to use real parse |
| AC-9 Disabled → no creation | **PASS** | |
| AC-10 Activity logged | **PASS** | Contingent on AC-2 fix |

**One critical bug fixed** (`iter.next()` → `iter.prev()`). **One follow-up item**: strengthen client-side cron validation to use `cron-parser` parse instead of a field-count check.
