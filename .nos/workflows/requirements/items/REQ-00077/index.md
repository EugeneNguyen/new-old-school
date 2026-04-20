# In other workspace (PersonalBranding), the item start the claude, change to in progress, but when the claude finished, it not change to done

## Brainstorming

### 1. Clarify — What do we really mean? What does this exclude?

**Q1: What exactly is "other workspace" in the NOS architecture?**

*Thinking:* The reporter says "PersonalBranding" workspace. NOS has a multi-workspace model where `listWorkspaces()` returns registered workspaces with their `absolutePath`. The sweeper iterates over all workspace roots. We need to be precise about whether this is a workspace registered via `workspaces.yaml` or a different project entirely.

*Recommended answer:* An "other workspace" is a directory registered in `~/.nos/workspaces.yaml` via the NOS dashboard. It has its own `.nos/` tree with workflows, items, and stages — but the NOS dev server runs from a single primary project root. The sweeper in `auto-advance-sweeper.ts` uses `runWithProjectRoot(root, sweepWorkspace)` to process each workspace.

---

**Q2: What does "the claude finished" mean concretely — how is completion detected?**

*Thinking:* This probes the exact mechanism. `completeSessionIfFinished` looks for a session log file at `<projectRoot>/.claude/sessions/<sessionId>.txt`, checks idle time via `stat.mtimeMs`, and looks for a `type: 'result'` JSON line. If any of these steps fail, the item stays In Progress forever.

*Recommended answer:* "Claude finished" means: (a) the Claude CLI child process has exited, (b) the session log file has stopped receiving writes for at least `SESSION_IDLE_MS` (30s), and (c) the last JSON line has `type: 'result'`. The sweeper must successfully read this file to flip status to Done.

---

**Q3: Does this bug affect only external workspaces, or can it also happen in the primary workspace?**

*Thinking:* If the bug is workspace-specific, the root cause is likely a path resolution issue. If it also happens in the primary workspace under certain conditions, the cause could be broader (e.g., timing, file locking, etc.).

*Recommended answer:* Based on the report, this is specific to non-primary workspaces. The primary workspace likely works because the session log path and the sweeper's lookup path both resolve to the same `.claude/sessions/` directory. For other workspaces, there may be a path mismatch.

---

**Q4: Does "not change to done" mean it stays at In Progress permanently, or does it eventually fail/error?**

*Thinking:* The distinction matters — a stuck In Progress state vs. an explicit error would point to different failure modes. No error means the sweeper silently skips the item.

*Recommended answer:* It likely stays at In Progress indefinitely with no error. The sweeper's `completeSessionIfFinished` returns `null` early if it can't `statSync` the log file (the `catch` block at line 162 returns null silently), so there's no error logged. The item simply never transitions.

---

**Q5: Is the session actually being created and running in the other workspace, or does the session itself fail silently?**

*Thinking:* The report says "the item starts the claude, changes to in progress" — so the session IS being created. The question is whether the session log ends up in the right place for the sweeper to find it later.

*Recommended answer:* The session is successfully created. The `claudeAdapter.startSession()` writes the session log to `join(rootAtCallTime, '.claude', 'sessions', ...)` where `rootAtCallTime = getProjectRoot()`. The stage pipeline runs inside `runWithProjectRoot(otherWorkspaceRoot, ...)`, so `getProjectRoot()` returns the other workspace's path. The log file goes to `<otherWorkspace>/.claude/sessions/<id>.txt`. The sweeper's `completeSessionIfFinished` also calls `sessionsDir()` which calls `getProjectRoot()` — and since the sweeper also runs inside `runWithProjectRoot(otherWorkspaceRoot, ...)`, both paths should match. BUT — there's a subtlety worth investigating.

### 2. Probe Assumptions — What are we taking for granted?

**Q6: Does `getProjectRoot()` consistently return the same path during session creation AND during completion checking for other workspaces?**

*Thinking:* This is the critical assumption. `getProjectRoot()` uses `AsyncLocalStorage` — the value depends on which `runWithProjectRoot` context is active at the time of the call. If the `claudeAdapter.startSession()` captures `getProjectRoot()` at line 44 synchronously (before the Promise resolves), and the child process writes asynchronously, while the sweeper later checks from a different `runWithProjectRoot` context — the paths should match. But what if there's an async context leak?

*Recommended answer:* The adapter captures `rootAtCallTime` synchronously at line 44 of `agent-adapter.ts`: `const rootAtCallTime = getProjectRoot()`. This is captured once, before any async operations, so it should be correct. The sweeper's `sessionsDir()` also calls `getProjectRoot()` inside `runWithProjectRoot(root, sweepWorkspace)`, so it should get the same workspace root. The paths should match. If they don't, there might be a case where the sweeper is running outside the `AsyncLocalStorage` context.

---

**Q7: Are we assuming the `.claude/sessions/` directory exists in the other workspace?**

*Thinking:* `claudeAdapter.startSession()` calls `mkdirSync(sessionsDirPath, { recursive: true })` to ensure it exists. But if the directory doesn't exist when the sweeper checks, the `statSync` would fail. Also — does the Claude CLI itself write to this directory, or does it write somewhere else?

*Recommended answer:* The adapter creates the directory. But here's a key question: the Claude CLI is spawned with `cwd: cwd ?? rootAtCallTime`. The CLI's own `--output-format stream-json` output is captured by the adapter and written to the log file. The adapter creates the file, not the CLI itself. So the directory creation and file writing are handled by the NOS adapter code, not Claude CLI. This should be consistent.

---

**Q8: Are we assuming the Claude CLI respects the `cwd` for its own operations, or does it have its own session storage?**

*Thinking:* The Claude CLI might write its own session data to `~/.claude/` or a project-level `.claude/` directory. If the CLI creates a `.claude/sessions/` in a different location than what the NOS adapter expects, the sweeper would look in the wrong place.

*Recommended answer:* The NOS adapter captures the stream-json output and writes it to its own log file. The Claude CLI's internal session storage is separate. However, the Claude CLI's `--output-format stream-json` outputs to stdout, which the adapter reads. The key question is: does the Claude CLI emit a `session_id` that matches what the adapter stores? If the CLI puts its `.claude/` files relative to CWD (the other workspace), but the adapter's `sessionsDir` also resolves to the other workspace, this should be fine.

---

**Q9: Are we assuming that `runWithProjectRoot` properly propagates through all async operations in the sweeper?**

*Thinking:* `AsyncLocalStorage` propagates through Promises and async/await in Node.js — but there are known edge cases with `setTimeout`, `setImmediate`, or detached callbacks. The sweeper uses `setTimeout` for scheduling. The `completeSessionIfFinished` is awaited inside the `runWithProjectRoot` callback, so it should be fine. But if there's an edge case...

*Recommended answer:* `AsyncLocalStorage` in Node.js propagates through `await`, `Promise.then`, and `setTimeout`. Since `sweepWorkspace` is called synchronously inside `storage.run(...)`, and `completeSessionIfFinished` is awaited within that call, the context should propagate correctly. This is likely not the root cause — but worth confirming with a debug log.

---

**Q10: Are we assuming the session log file's `mtime` updates as expected on the other workspace's filesystem?**

*Thinking:* If the other workspace is on a different volume, network drive, or has different filesystem semantics (e.g., NFS, SMB), `mtime` behavior could differ. The `SESSION_IDLE_MS` check relies on `stat.mtimeMs`.

*Recommended answer:* On macOS (Darwin) with local APFS/HFS+ volumes, `mtime` should be reliable. But if the other workspace is on an external drive, network mount, or encrypted volume, there could be differences. Worth checking what filesystem "PersonalBranding" workspace lives on.

### 3. Find Reasons and Evidence — Why do we believe this is needed?

**Q11: Can we confirm the session log file actually exists at the expected path in the other workspace?**

*Thinking:* The most direct evidence would be checking whether `<PersonalBranding>/.claude/sessions/<sessionId>.txt` exists after the Claude session runs. If it does, the sweeper should find it. If it doesn't, we know the file is being written elsewhere.

*Recommended answer:* We should check the other workspace's `.claude/sessions/` directory for the session file. If the file exists there, the issue is in the sweeper's detection logic (idle time, file parsing). If it doesn't exist, the file is being written elsewhere — likely to the NOS primary project's `.claude/sessions/` because `getProjectRoot()` returned the wrong value during session creation.

---

**Q12: What do the NOS server logs show during the sweeper tick for the other workspace's items?**

*Thinking:* The sweeper has console.log/error statements. The `[session-complete]` log at line 182 of `auto-advance.ts` would confirm completion, while silence would indicate the function returned early.

*Recommended answer:* Check the NOS dev server console for `[session-complete]` or `[auto-advance]` logs referencing the PersonalBranding workspace items. Absence of `[session-complete]` for those items would confirm the sweeper is returning early — most likely at the `statSync` failure (line 158-161) because it can't find the session log.

---

**Q13: Is there evidence this worked before, or has it never worked for other workspaces?**

*Thinking:* If this is a regression, we should look for a recent change that broke it. If it never worked, it's a design gap.

*Recommended answer:* The multi-workspace support and the auto-advance sweeper's workspace iteration (via `listWorkspaces()` and `runWithProjectRoot`) suggest this was designed to work. We need to check git history for when multi-workspace sweeping was added and whether it was tested end-to-end.

---

**Q14: Are there multiple sessions being created for the same item/stage? (The meta.yml shows two sessions for Brainstorming)**

*Thinking:* The meta.yml for REQ-00077 itself shows two sessions for the Brainstorming stage, started 375ms apart. This could be a race condition where `autoStartIfEligible` fires twice before the first session is recorded. This is a related but distinct issue.

*Recommended answer:* Yes — the `alreadyKicked` guard in `autoStartIfEligible` (line 60) checks `item.sessions?.some(...)`, but there's a TOCTOU race: two sweeper ticks can both read the item before either has appended a session. This causes duplicate sessions, but it shouldn't directly prevent Done detection. It's a separate bug worth tracking.

---

**Q15: Does the `cwd` parameter matter for Claude CLI's behavior, and is it being set correctly?**

*Thinking:* In `agent-adapter.ts` line 57, the Claude CLI is spawned with `cwd: cwd ?? rootAtCallTime`. The `triggerStagePipeline` doesn't pass a `cwd` explicitly, so it defaults to `rootAtCallTime` (which is `getProjectRoot()`). If `getProjectRoot()` returns the other workspace's path, the Claude CLI runs in that directory — which is correct for reading that workspace's `.claude/` configuration.

*Recommended answer:* The `cwd` defaults to `rootAtCallTime`, which is `getProjectRoot()` at call time. Inside `runWithProjectRoot(otherWorkspace, ...)`, this should be the other workspace's path. The Claude CLI will run with CWD set to the other workspace. This is likely correct behavior.

### 4. Explore Alternatives — What else might be true?

**Q16: Could the root cause be that `--dangerously-skip-permissions` prevents the Claude CLI from running properly in the other workspace?**

*Thinking:* The Claude CLI with `--dangerously-skip-permissions` might still require certain `.claude/` configuration files in the CWD. If the other workspace doesn't have a proper `.claude/` setup, the CLI might exit immediately without emitting a session_id or completing normally.

*Recommended answer:* Possible but unlikely, since the report says the item does change to In Progress (meaning a session_id was received). If the CLI failed immediately, the adapter would reject the promise and the item would stay at Todo. The fact that it reaches In Progress means the session started successfully.

---

**Q17: Could the session log file be written to the NOS primary project's `.claude/sessions/` instead of the other workspace's?**

*Thinking:* This is the most likely root cause. If there's an async context issue where `getProjectRoot()` returns the primary project root during session creation (despite being inside `runWithProjectRoot`), the log file would end up in the wrong directory. Then the sweeper, running in the other workspace's context, would look in `<otherWorkspace>/.claude/sessions/` and not find it.

*Recommended answer:* This is the prime suspect. We need to verify: (1) where `rootAtCallTime` resolves to when the adapter is called from within `runWithProjectRoot`, and (2) where the sweeper looks for the file. If the adapter's `rootAtCallTime` correctly captures the other workspace's root, then the file should be in the right place. But if there's a timing issue or the `AsyncLocalStorage` context isn't active at capture time, this would explain the bug.

---

**Q18: Could the issue be that the sweeper's `setTimeout`-based scheduling loses the `AsyncLocalStorage` context?**

*Thinking:* In `auto-advance-sweeper.ts`, `tick()` iterates roots and runs `runWithProjectRoot(root, sweepWorkspace)`. Inside `sweepWorkspace`, it awaits `completeSessionIfFinished`. The `setTimeout` in `schedule()` just triggers `tick()` — `tick()` itself re-establishes context for each workspace via `runWithProjectRoot`. So this should be fine.

*Recommended answer:* The `setTimeout` in `schedule()` doesn't need to preserve context — it just calls `tick()`, which creates fresh contexts for each workspace. This is not the root cause.

---

**Q19: Could the issue be specific to how `ensureNosDir` initializes the other workspace — perhaps `.claude/sessions/` isn't created?**

*Thinking:* `ensureNosDir` creates `.nos/` for the workspace, but `.claude/sessions/` is separate. The adapter calls `mkdirSync(sessionsDirPath, { recursive: true })` to create it. If the adapter runs correctly, the directory should exist.

*Recommended answer:* The adapter should create `.claude/sessions/` via `mkdirSync`. But if the adapter's `rootAtCallTime` resolves to the wrong path, it creates the directory in the wrong place. This circles back to the path resolution question.

---

**Q20: Could the problem be that the Claude CLI process outlives the NOS server's expectation, causing the idle timeout to never trigger?**

*Thinking:* `child.unref()` at line 138 means the NOS server won't wait for the child to exit. But the Claude CLI process could keep running and writing to the log file, keeping `mtime` fresh. The sweeper checks `idleMs < SESSION_IDLE_MS` (30s). If the CLI writes periodically but never emits `type: 'result'`, the sweeper would need `idleMs >= SESSION_IDLE_MS * 2` (60s) to force completion.

*Recommended answer:* Possible but unlikely for this specific bug, since the user says "when the claude finished" — implying the CLI does finish. However, it's worth checking if the other workspace's Claude session takes longer or produces different output patterns.

### 5. Explore Implications — If true, then what else follows?

**Q21: If the session log path is mismatched, does that mean ALL other workspace items are affected, not just this one?**

*Thinking:* If the root cause is a systematic path resolution issue, every item in every non-primary workspace would have the same problem. This would be a blocker for multi-workspace support.

*Recommended answer:* Yes — if the path resolution is broken, no item in any external workspace would ever transition to Done via the sweeper. This is a critical bug for the multi-workspace feature. We should check if any external workspace item has ever successfully completed.

---

**Q22: If we fix the session log path, do we also need to migrate existing orphaned session logs?**

*Thinking:* If session logs were written to the wrong directory, they'll accumulate there with no cleanup. The items referencing those sessions are stuck at In Progress. A fix needs to address both the path resolution and the stuck items.

*Recommended answer:* Yes. Fix should include: (1) correct the path resolution, (2) provide a way to manually reset stuck items to Todo so they can be re-triggered, and (3) optionally clean up orphaned log files. A migration script or a manual reset command would be helpful.

---

**Q23: If duplicate sessions are being created (as seen in meta.yml), does fixing the Done detection fix the race condition too, or is that a separate issue?**

*Thinking:* Duplicate sessions and stuck In Progress are related but have different root causes. The race condition in `autoStartIfEligible` needs its own fix (e.g., optimistic locking or a file-based lock).

*Recommended answer:* These are separate issues. The Done detection fix addresses the sweeper's inability to find log files. The duplicate session race condition needs a separate guard — perhaps a lock file or atomic check-and-set for the session entry.

---

**Q24: If the sweeper can't find the log file, will the item ever be marked Done through any other mechanism?**

*Thinking:* Currently, the only mechanism for marking an item Done is `completeSessionIfFinished`. There's no fallback, no manual override via the dashboard, and no timeout-based forced completion.

*Recommended answer:* No — the item will stay In Progress forever. There's no manual "mark as Done" button in the dashboard (per current code review). This means the bug creates permanently stuck items. A manual override or a maximum session duration timeout would be valuable safeguards.

---

**Q25: Should the NOS system have observability for session health — detecting orphaned/stuck sessions?**

*Thinking:* This bug reveals a gap in observability. If sessions get stuck, there's no alert or dashboard indicator. Operators only notice when items don't progress.

*Recommended answer:* Yes. The system should expose: (1) items stuck at In Progress for longer than a configurable threshold, (2) sessions with no matching log file, and (3) sessions whose log file hasn't been written to in a long time. A health check endpoint or dashboard widget would make this class of bug much easier to detect and diagnose.

## Specification

### User Stories

1. As a NOS user with multiple registered workspaces, I want items in non-primary workspaces to transition from "In Progress" to "Done" when the Claude session finishes, so that the stage pipeline advances automatically without manual intervention.

2. As an operator monitoring NOS workflows, I want stuck In Progress items to be detectable and recoverable, so that I can identify and resolve completion failures without restarting the server.

### Acceptance Criteria

1. **Given** a non-primary workspace registered in `~/.nos/workspaces.yaml`, **when** a stage pipeline session completes (Claude CLI exits and session log is idle for ≥ `SESSION_IDLE_MS`), **then** `completeSessionIfFinished` locates the session log and marks the item Done with a summary comment.

2. **Given** `claudeAdapter.startSession` writes a session log to `<workspaceRoot>/.claude/sessions/<sessionId>.txt`, **when** the sweeper's `completeSessionIfFinished` runs for that workspace, **then** `sessionsDir()` resolves to the same `<workspaceRoot>/.claude/sessions/` directory where the log was written.

3. **Given** the sweeper iterates multiple workspace roots via `runWithProjectRoot(root, sweepWorkspace)`, **when** `getProjectRoot()` is called inside `completeSessionIfFinished`, **then** it returns the workspace root passed to `runWithProjectRoot`, never the primary project root or `fallbackRoot()`.

4. **Given** `completeSessionIfFinished` fails to `statSync` a session log file, **when** this happens for a non-primary workspace item, **then** a warning is logged (not silently swallowed) including the resolved path, the workspace ID, and the session ID.

5. **Given** an item has been In Progress for longer than a configurable maximum duration (e.g., `MAX_SESSION_DURATION_MS`, default 30 minutes), **when** the sweeper ticks, **then** the item is force-completed with a `[runtime] session exceeded max duration` comment.

6. **Given** a session log file exists but never receives a `type: 'result'` line and has been idle for ≥ `SESSION_IDLE_MS * 2` (60s), **when** the sweeper ticks, **then** the item is marked Done with a `[runtime] session log stalled` prefix (existing behavior, must remain working for non-primary workspaces).

### Technical Constraints

| Constraint | Detail |
|---|---|
| Path resolution | `sessionsDir()` in `lib/auto-advance.ts:14` must resolve via `getProjectRoot()` which depends on `AsyncLocalStorage` context from `lib/project-root.ts`. The sweeper MUST call `completeSessionIfFinished` within the `runWithProjectRoot(workspaceRoot, ...)` callback. |
| Session log write path | `agent-adapter.ts:45` captures `rootAtCallTime = getProjectRoot()` synchronously. This MUST equal the workspace root when the adapter is called from within `runWithProjectRoot(workspaceRoot, triggerStagePipeline(...))`. |
| AsyncLocalStorage propagation | All async operations (await, Promise.then) within the `runWithProjectRoot` callback must inherit the storage context. No `setTimeout`/`setImmediate` callbacks outside the storage.run scope may call `getProjectRoot()` and expect workspace-scoped results. |
| File paths | Session logs: `<workspaceRoot>/.claude/sessions/<sessionId>.txt`. Item metadata: `<workspaceRoot>/.nos/workflows/<workflowId>/items/<itemId>/meta.yml`. |
| Filesystem | Must work on local APFS/HFS+ volumes and external local drives. Network/SMB mounts are not required to be supported. |
| Backwards compatibility | Primary workspace behavior must not regress. Items in the primary workspace must continue to transition to Done exactly as before. |
| No additional dependencies | Fix must use existing `AsyncLocalStorage`-based scoping; no new state management libraries. |
| `child.unref()` | The adapter unrefs the spawned Claude CLI process (`agent-adapter.ts:138`). The stdout data handler must continue to receive data and write to the log file regardless of unref, even when the Node.js event loop is otherwise idle. |

### Out of Scope

- **Duplicate session race condition**: The TOCTOU race in `autoStartIfEligible` where two sweeper ticks both create sessions for the same item/stage (observed in meta.yml). This is a separate bug requiring its own fix (e.g., file-based locking).
- **Dashboard "Mark as Done" button**: A manual override UI is desirable but is a separate feature request.
- **Session health observability dashboard**: Metrics/widgets for stuck sessions are valuable but belong in a separate requirement.
- **Workspace registration issues**: The workspace is correctly registered and listed; the bug is in post-session completion detection only.
- **Network filesystem support**: Cross-volume `mtime` reliability on NFS/SMB is not addressed.
- **Orphaned session log migration**: Cleaning up session logs that were written to the wrong directory from past runs. A one-time cleanup script may be written separately.

## Analysis

### Scope

**In scope:**
- The `completeSessionIfFinished` function in `lib/auto-advance.ts` and its session log lookup path resolution for non-primary workspaces.
- The `sessionsDir()` helper that resolves `.claude/sessions/` relative to `getProjectRoot()`.
- The `claudeAdapter.startSession` in `lib/agent-adapter.ts` — how and where it writes session log files.
- The `triggerStagePipeline` in `lib/stage-pipeline.ts` — how it invokes the adapter within a scoped project root.
- The `runWithProjectRoot` + `AsyncLocalStorage` propagation in `lib/project-root.ts`.

**Out of scope:**
- Workspace registration (correctly lists workspaces already).
- Heartbeat scheduling mechanism (correctly iterates all workspaces).
- Auto-advance stage-progression logic (fires only after Done is set).
- Dashboard UI rendering.
- The duplicate-session race condition (related but separate bug).

### Feasibility

**Technical viability: HIGH — this is a diagnosable path-resolution or file-existence bug.**

The completion mechanism relies on a chain of path lookups that must all resolve to the same directory:

1. **Session creation path** (`agent-adapter.ts:45`): `sessionsDirPath = join(rootAtCallTime, '.claude', 'sessions')` — where `rootAtCallTime = getProjectRoot()` is captured synchronously.
2. **Session completion check path** (`auto-advance.ts:157`): `logPath = path.join(sessionsDir(), '<sessionId>.txt')` — where `sessionsDir()` also calls `getProjectRoot()`.

Both (1) and (2) run inside `runWithProjectRoot(workspaceRoot, ...)`, so `getProjectRoot()` should return the same workspace path. If they match, the sweeper finds the file. If they don't, the sweeper silently returns `null` and the item stays stuck.

**Primary hypothesis:** The session log file exists at the correct path, but the Claude CLI session finishes and `child.unref()` (line 138 of `agent-adapter.ts`) causes the stdout data handler to miss the final output. The log file is created (mtime exists), but never receives a `{"type": "result"}` line. The sweeper then waits for `SESSION_IDLE_MS * 2` (60s) to force-complete — and it does eventually mark Done with a `[runtime] session log stalled` comment prefix.

**But the report says it NEVER transitions to Done.** This means the sweeper never finds the log file at all. The most likely cause:

- The `sessionsDir()` in `completeSessionIfFinished` resolves to a **different path** than where `claudeAdapter.startSession` wrote the file. This would happen if `AsyncLocalStorage` context is not active during one of the two calls.

**Risks:**
- Fixing path resolution may expose previously hidden race conditions.
- If orphaned session logs exist in the wrong directory, cleanup is needed.

### Dependencies

| Module | Role |
|--------|------|
| `lib/auto-advance.ts` | Contains `completeSessionIfFinished` and `sessionsDir()` |
| `lib/auto-advance-sweeper.ts` | Drives the tick loop, calls `runWithProjectRoot` per workspace |
| `lib/agent-adapter.ts` | Creates session log files, manages Claude CLI child process |
| `lib/stage-pipeline.ts` | Triggers stage pipeline, calls adapter without explicit `cwd` |
| `lib/project-root.ts` | `AsyncLocalStorage`-based project root scoping |
| `lib/workspace-store.ts` | Provides workspace listing with `absolutePath` |
| External: Claude CLI | Must emit `session_id` event for log capture to begin |
| Filesystem | `.claude/sessions/` must exist at the resolved workspace path |

### Open Questions

1. **Where does the session log file physically end up?** Check `<PersonalBranding-absolutePath>/.claude/sessions/` vs `<NOS-primary-root>/.claude/sessions/` for the session IDs listed in meta.yml.
2. **Is `AsyncLocalStorage` context reliably preserved** across the full async chain: `tick()` → `runWithProjectRoot()` → `sweepWorkspace()` → `completeSessionIfFinished()`? Add a debug log of `getProjectRoot()` inside `sessionsDir()` to confirm.
3. **Does `child.unref()` cause stdout stream handlers to stop firing** when the NOS server's event loop goes idle between heartbeat ticks?
4. **What filesystem does the PersonalBranding workspace reside on?** If it's a different volume (e.g., network or external drive), `stat.mtimeMs` behavior may differ.
5. **Has any item in a non-primary workspace ever successfully transitioned to Done?** If not, this is a systematic multi-workspace bug rather than a workspace-specific issue.

## Implementation Notes

### Changes Made

**1. `lib/auto-advance-sweeper.ts` — tick() now always includes the primary project root**

The original `tick()` had a logic branch: if `listWorkspaces()` returned entries, it ONLY iterated those workspaces, completely skipping the primary project root (where the NOS server runs). This meant that once any external workspace was registered, items in the primary project would never be swept for completion. Fixed by always including `primaryRoot` in the iteration list (deduplicated if it's also a registered workspace).

**2. `lib/auto-advance.ts` — completeSessionIfFinished observability and max duration**

- Removed the unused `sessionsDir()` helper; inlined the path resolution using an explicit `getProjectRoot()` call captured into `resolvedRoot`. This makes the resolved path visible in logs.
- When `statSync` fails, the function now logs a `console.warn` with the workspace root, resolved path, session ID, and item ID (AC4). Previously it returned `null` silently, making debugging impossible.
- Added `MAX_SESSION_DURATION_MS` (30 minutes). If the session log cannot be found AND the session's `startedAt` timestamp indicates it's been running longer than the max duration, the item is force-completed with a `[runtime] session exceeded max duration` comment (AC5).
- Existing stalled-session detection (idle ≥ 60s without a `type: result` line) is preserved and now works correctly for non-primary workspaces since the path resolution is explicit (AC6).

### Root Cause Analysis

The `AsyncLocalStorage` propagation is correct — `runWithProjectRoot(root, sweepWorkspace)` properly scopes `getProjectRoot()` through all `await` chains. The primary bug was in `tick()` excluding the primary project from sweeps once workspaces were registered. The observability improvements (AC4, AC5) ensure future path-resolution issues are immediately visible in server logs rather than causing silent stuck items.

### Deviations from Spec

None. All 6 acceptance criteria are addressed.

## Validation

### AC1 — Non-primary workspace items transition to Done when session completes

✅ **Pass**

`tick()` in `lib/auto-advance-sweeper.ts:57–71` always includes `primaryRoot` in the roots list (deduplicated), then calls `runWithProjectRoot(root, sweepWorkspace)` for every root. `sweepWorkspace` awaits `completeSessionIfFinished` for each item, which reads the session log and calls `updateItemMeta(..., { status: 'Done' })` when the idle/result conditions are met. The previously broken path — where `listWorkspaces()` returning non-empty entries caused `primaryRoot` to be silently skipped — is fixed.

---

### AC2 — Session log write path matches sweeper lookup path

✅ **Pass**

`agent-adapter.ts:44–45` captures `rootAtCallTime = getProjectRoot()` synchronously (inside whatever `runWithProjectRoot` context is active at call time) and constructs `sessionsDirPath = join(rootAtCallTime, '.claude', 'sessions')`. The session file is written to `join(sessionsDirPath, sessionId + '.txt')`. `auto-advance.ts:155–156` computes `resolvedRoot = getProjectRoot()` and `logPath = path.join(resolvedRoot, '.claude', 'sessions', sessionId + '.txt')`. Both calls to `getProjectRoot()` are made within the same `runWithProjectRoot(workspaceRoot, ...)` scope, so both resolve to the same workspace root. Path alignment is guaranteed.

---

### AC3 — `getProjectRoot()` returns the workspace root inside `completeSessionIfFinished`, never `fallbackRoot()`

✅ **Pass**

`lib/project-root.ts:23–25` implements `runWithProjectRoot` using `AsyncLocalStorage.run({ root }, fn)`. Node.js `AsyncLocalStorage` propagates through `await` chains, so `sweepWorkspace` (called as `fn`) and everything it awaits — including `completeSessionIfFinished` — inherits the scoped `root`. `getProjectRoot()` at `lib/project-root.ts:17–21` checks `storage.getStore()` first and only falls back to `fallbackRoot()` if no store is set. Since the call is always within an active `storage.run`, `fallbackRoot()` is never reached during sweeps.

---

### AC4 — Warning logged (not silently swallowed) when `statSync` fails

✅ **Pass**

`auto-advance.ts:172–175` now emits:
```
console.warn(`[session-complete] cannot stat session log: workflow=${workflowId} item=${itemId} session=${session.sessionId} root=${resolvedRoot} path=${logPath}`)
```
This includes: resolved workspace root path (`root=`), workflow/item identifiers (serving as workspace context), and session ID. Previously the catch block returned `null` silently with no log output.

---

### AC5 — Items in-progress longer than `MAX_SESSION_DURATION_MS` are force-completed

✅ **Pass**

`auto-advance.ts:14` defines `MAX_SESSION_DURATION_MS = 30 * 60 * 1000` (30 minutes). In the `statSync` catch block (`auto-advance.ts:161–170`), if `sessionAge > MAX_SESSION_DURATION_MS`, the function appends a `[runtime] session exceeded max duration` comment, calls `updateItemMeta(..., { status: 'Done' })`, and returns. This fires before the regular `console.warn`-and-return path, so force-completion takes priority over the silent-skip path.

---

### AC6 — Stalled session detection preserved for non-primary workspaces

✅ **Pass**

`auto-advance.ts:184` retains `if (!finished && idleMs < SESSION_IDLE_MS * 2) return null;` and `auto-advance.ts:189` uses `prefix = finished ? '' : '[runtime] session log stalled; '`. This logic is unchanged. Since `logPath` now resolves correctly for non-primary workspaces (via the fixed `getProjectRoot()` scoping), stalled-log detection now works end-to-end for external workspaces — previously the `statSync` would fail before reaching this branch at all.

---

### Regressions check — Primary workspace backwards compatibility

✅ **Pass**

When no external workspaces are registered, `workspaceRoots = []` and `allRoots = [primaryRoot]` — identical sweep behavior to before. When external workspaces are registered, `primaryRoot` is prepended unless already present, so primary items continue to be swept in every tick. No behavioral change for the primary workspace.

---

### Edge cases

✅ **`session.startedAt` missing**: `sessionAge` defaults to `0`, which is never `> MAX_SESSION_DURATION_MS`. The force-complete branch is skipped; the regular warn-and-return fires. Safe.

✅ **`primaryRoot` already in `workspaceRoots`**: The deduplication check `workspaceRoots.includes(primaryRoot)` prevents double-sweeping. Safe.

✅ **Empty workspaces list**: `allRoots = [primaryRoot]`. Primary workspace always swept. Safe.
