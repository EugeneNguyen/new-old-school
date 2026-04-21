# in other workspace, the item status is changed to done when the session is done. fix that

## Brainstorming

### 1. Clarify — What do we really mean? What does this exclude?

**Q1: What exactly is meant by "other workspace"?**

- **Thinking**: NOS supports multiple workspaces (registered in `~/.nos/workspaces.yaml`), each with its own `absolutePath`. The term "other workspace" could mean: (a) a different registered workspace in the same NOS instance, (b) a separate NOS server running on a different project, or (c) the same project opened in multiple terminal sessions. Pinning down the exact topology is critical because the fix differs for each.
- **Recommended answer**: Given NOS's architecture, this most likely refers to a different registered workspace in the same NOS dev server. The heartbeat sweeper (`auto-advance-sweeper.ts:tick()`) iterates over all registered workspaces, and the session log directory (`.claude/sessions/`) is resolved per-workspace via `getProjectRoot()`. The bug manifests when a session completes in workspace A but the item in workspace B is also marked Done.

**Q2: Does "session is done" mean the Claude agent process exited, or that the session log file went idle?**

- **Thinking**: `completeSessionIfFinished` uses log file `mtime` idleness (30s for normal, 60s for stalled) to determine session completion. The agent process exiting and the log going idle are technically different events. If the process crashes without writing a `result` line, the 60s stale timeout kicks in. Understanding which path triggers the cross-workspace bug narrows the investigation.
- **Recommended answer**: Both paths likely trigger it. The `completeSessionIfFinished` function reads the session log from `sessionsDir()` which is `path.join(getProjectRoot(), '.claude', 'sessions')`. If the session log lookup isn't properly scoped, either path (normal `result` line or stale timeout) could match a session ID that exists in a different workspace's `.claude/sessions/` directory.

**Q3: Is the bug about the wrong workspace's item being marked Done, or about the *correct* item being marked Done from the wrong workspace's context?**

- **Thinking**: There's a subtle difference. Scenario A: Workspace A's sweeper pass picks up workspace B's item and marks it Done. Scenario B: The session ID collision — a session ID in workspace A's `.claude/sessions/` happens to match a session referenced in workspace B's item metadata. These require different fixes.
- **Recommended answer**: Most likely Scenario A. The sweeper calls `sweepWorkspace()` within `runWithProjectRoot(root, ...)`, so all `getProjectRoot()` calls should be scoped. But if session log files are shared (e.g., Claude CLI writes all sessions to a single global `.claude/sessions/` regardless of cwd), then session ID lookups in `completeSessionIfFinished` could match across workspaces.

**Q4: Is this reproducible only with multiple registered workspaces, or also with a single workspace?**

- **Thinking**: If `listWorkspaces()` returns zero workspaces, the sweeper falls back to `getProjectRoot()` (the single project root). The bug may only manifest when multiple workspaces are registered and the sweeper iterates over them. Single-workspace setups may be unaffected.
- **Recommended answer**: Likely only reproducible with multiple registered workspaces, since the sweeper's multi-root loop is the only path where cross-workspace contamination can happen.

**Q5: Does "fix that" imply we should prevent the status change entirely, or scope it correctly?**

- **Thinking**: The user wants the sweeper to only mark an item Done in the workspace where the session actually ran. The fix is about correct scoping, not disabling the auto-complete feature.
- **Recommended answer**: Scope it correctly. The `completeSessionIfFinished` logic is correct in principle — it just needs to be properly isolated per workspace so that a session completing in workspace A doesn't affect items in workspace B.

### 2. Probe assumptions — What are we taking for granted?

**Q1: Are we assuming that `.claude/sessions/` is workspace-scoped, when in reality Claude CLI may use a global sessions directory?**

- **Thinking**: `sessionsDir()` returns `path.join(getProjectRoot(), '.claude', 'sessions')`. This assumes each workspace has its own `.claude/sessions/` directory. But the Claude CLI might store all sessions in `~/.claude/sessions/` (user home) regardless of the `cwd` passed to it. If so, the per-workspace `sessionsDir()` would either find nothing or find the wrong files.
- **Recommended answer**: This is the most likely root cause. The Claude CLI (`claude -p ...`) likely uses a global `~/.claude/` directory, not a per-project one. When `agent-adapter.ts` spawns the agent with `cwd` set to a workspace, the session log file is written to the spawner's chosen path — but the session ID in the log might reference a global session. We should verify where the session log is actually written by `claudeAdapter.startSession()`.

**Q2: Are we assuming that `runWithProjectRoot()` properly scopes ALL downstream calls, including async ones?**

- **Thinking**: `runWithProjectRoot` uses `AsyncLocalStorage.run()`. If any downstream code uses `setTimeout`, raw `Promise` callbacks, or other async patterns that escape the async context, `getProjectRoot()` would fall back to the default root, breaking workspace isolation.
- **Recommended answer**: Node.js `AsyncLocalStorage` propagates through standard async/await and most Promise chains. But `fs.readFileSync` (used in `completeSessionIfFinished`) is synchronous and should work fine. The risk is if `triggerStagePipeline` or `updateItemMeta` spawn child processes or background tasks that outlive the `run()` scope.

**Q3: Are we assuming session IDs are globally unique and never collide across workspaces?**

- **Thinking**: Session IDs come from the Claude CLI and are UUIDs. UUID collision is astronomically unlikely. But if workspace B's item metadata somehow references a session ID that was generated in workspace A's context (e.g., through a copy-paste of config or a shared `.claude/` directory), the sweeper could match the wrong session.
- **Recommended answer**: UUIDs are safe from collision. But if multiple workspaces share the same `.claude/` directory (e.g., symlinked or the same absolute path), then session files ARE shared. This is a real configuration risk rather than a uniqueness problem.

**Q4: Are we assuming the sweeper runs in the correct async context for each workspace iteration?**

- **Thinking**: In `tick()`, the sweeper does `await runWithProjectRoot(root, sweepWorkspace)`. Since `sweepWorkspace` is an async function and `runWithProjectRoot` uses `storage.run()`, the async context should propagate through the `await`s inside `sweepWorkspace`. But if `sweepWorkspace` were not awaited (fire-and-forget), the context could be lost.
- **Recommended answer**: The current code correctly awaits each workspace sweep sequentially. The async context should propagate properly. However, `runWithProjectRoot` signature is `<T>(root: string, fn: () => T): T` — it does NOT await the result if `fn` returns a Promise. If `sweepWorkspace` returns a Promise (it does, since it's `async`), `runWithProjectRoot` returns the Promise but the `AsyncLocalStorage` context may not propagate correctly through it. This is a **critical potential bug** — `storage.run(store, asyncFn)` does propagate for native promises in Node.js, but the type signature doesn't enforce awaiting.

**Q5: Are we assuming the session log path construction is correct across workspaces?**

- **Thinking**: `sessionsDir()` is a function that calls `getProjectRoot()` at call time. If called inside a properly scoped `runWithProjectRoot`, it should return the right path. But if it's called outside the scope or cached, it could return the wrong path.
- **Recommended answer**: `sessionsDir()` is called inside `completeSessionIfFinished()` which runs inside the scoped `sweepWorkspace()`. It should be correctly scoped. But we should verify there's no memoization or caching that could leak across workspace contexts.

### 3. Find reasons and evidence — Why do we believe this is needed?

**Q1: Has this bug been observed in practice, and what was the exact symptom?**

- **Thinking**: The requirement title states this as a fact ("the item status is changed to done"). Understanding the exact observed behavior — which workspace's items were affected, what the session was, what the expected behavior was — would help pinpoint the cause.
- **Recommended answer**: The user observed that when a Claude agent session completes for an item in one workspace, items in a different workspace are incorrectly transitioned to Done. The most informative evidence would be the server logs showing `[session-complete]` entries with mismatched workspace roots.

**Q2: Can we reproduce this by running the sweeper against two workspaces with active sessions?**

- **Thinking**: A reproduction test would register two workspaces, create items in both, start a session in workspace A, let it complete, and verify that only workspace A's item is marked Done.
- **Recommended answer**: Yes, this should be reproducible. Create a test that: (1) registers two workspace paths, (2) creates an item with a session in each, (3) writes a completed session log in workspace A only, (4) runs `tick()`, (5) asserts workspace B's item is still In Progress.

**Q3: Does the `claudeAdapter.startSession()` write the session log to the workspace-scoped `.claude/sessions/` or a global one?**

- **Thinking**: The adapter code determines where session logs are physically stored. If it writes to a global path regardless of `cwd`, then the per-workspace `sessionsDir()` lookup in `completeSessionIfFinished` would fail to find the file — OR worse, find a different workspace's session file at the same path.
- **Recommended answer**: Need to check `agent-adapter.ts` to see where the write stream is opened. The session log path is likely constructed using `getProjectRoot()` at the time the session starts. If the adapter runs outside the `runWithProjectRoot` scope (e.g., triggered by an API route with a different workspace cookie), the log could end up in the wrong directory.

**Q4: Are there any existing tests for multi-workspace sweeper behavior?**

- **Thinking**: If multi-workspace sweeping was never tested, the bug is a natural consequence. Tests would also serve as the regression guard for the fix.
- **Recommended answer**: Likely no dedicated multi-workspace sweeper tests exist, given this is a bug report. Writing tests for this scenario should be part of the fix.

**Q5: Could the Claude CLI itself be the source of cross-workspace contamination?**

- **Thinking**: If `claude -p` is invoked with `cwd` set to workspace A but internally uses a shared session state (e.g., `~/.claude/` global config), session events could be written to or read from the wrong location.
- **Recommended answer**: The Claude CLI manages its own sessions in `~/.claude/sessions/` (user-global). NOS's adapter then separately writes a `.txt` log in the workspace-scoped `.claude/sessions/`. These are two different directories. The risk is if the adapter reads from the wrong one, or if the session ID used in the item metadata points to a log file that exists in both locations.

### 4. Explore alternatives — What else might be true?

**Q1: Could the bug be in `updateItemMeta` rather than the sweeper — i.e., the status write goes to the wrong workspace's file?**

- **Thinking**: `updateItemMeta` uses `getProjectRoot()` to resolve the item's YAML file path. If the workspace context is lost by the time the write happens, it could write to the default project root instead of the intended workspace.
- **Recommended answer**: Possible. If `AsyncLocalStorage` context is lost during the async chain (`completeSessionIfFinished` → `updateItemMeta`), the write targets the fallback root. This would mean the item in the *default* workspace gets modified, not necessarily the "other" workspace. We should add logging of the resolved root path in `updateItemMeta` to verify.

**Q2: Could the bug be a race condition — two sweeper ticks overlapping and operating on the wrong workspace context?**

- **Thinking**: The sweeper uses `setTimeout` (not `setInterval`) and awaits the full `tick()` before rescheduling. So two ticks shouldn't overlap. But if `tick()` throws and `schedule()` is called before the previous tick finishes (it isn't — `schedule()` is called after `tick()` completes), there could be overlap.
- **Recommended answer**: The current code structure prevents overlap: `schedule()` sets a new timeout only after `tick()` completes. However, `rescheduleHeartbeat()` can be called externally (e.g., from the settings API), which clears the existing timer and sets a new one. If `tick()` is mid-execution when `rescheduleHeartbeat()` fires, a new tick could start while the old one is still running. This is a minor race but could cause issues.

**Q3: Instead of fixing the scoping bug, should we move to an event-driven model where sessions self-report completion rather than relying on polling?**

- **Thinking**: The heartbeat/polling model has inherent risks around context isolation. An event-driven model (e.g., the adapter calls a completion webhook when the agent process exits) would be more precise and eliminate the cross-workspace polling problem.
- **Recommended answer**: Long-term, an event-driven model is better. Short-term, fixing the scoping bug in the sweeper is more practical and less risky. The sweeper model is well-understood and the fix is likely a matter of ensuring `getProjectRoot()` is properly scoped. We could add a follow-up requirement for event-driven session completion.

**Q4: Could we store the workspace ID in the session metadata to enable correct scoping regardless of the lookup path?**

- **Thinking**: If each `ItemSession` record in `meta.yml` included a `workspaceId` (or `workspaceRoot`), the sweeper could verify it's operating on the correct workspace before marking Done.
- **Recommended answer**: This is a solid defensive measure. Even if the scoping bug is fixed, having explicit workspace attribution in session metadata adds a safety check. The sweeper could skip sessions whose `workspaceRoot` doesn't match the current sweep context.

**Q5: Is the real issue that the session log path is shared across workspaces, and the fix should be to ensure each workspace has truly isolated session storage?**

- **Thinking**: If two workspaces happen to have overlapping `.claude/sessions/` directories (e.g., one is a subdirectory of the other, or they share a symlink), session files from one workspace could be visible to the other's `completeSessionIfFinished` check.
- **Recommended answer**: Ensuring truly isolated session storage is important, but may not be sufficient on its own. The combination of (a) isolated session storage, (b) proper `AsyncLocalStorage` scoping in the sweeper, and (c) workspace attribution in session metadata would provide defense in depth.

### 5. Explore implications — If true, then what else follows?

**Q1: If the `AsyncLocalStorage` context is lost during async sweeper operations, what other features are affected?**

- **Thinking**: `getProjectRoot()` is used throughout the codebase — in `workflow-store.ts`, `settings.ts`, `stage-pipeline.ts`, etc. If the async context propagation is broken, it affects ALL multi-workspace operations, not just the sweeper.
- **Recommended answer**: If this is an `AsyncLocalStorage` propagation bug, it would affect: (a) `triggerStagePipeline` called during auto-advance (agent spawned in wrong workspace), (b) `readStages` in `autoAdvanceIfEligible` (reading wrong workflow config), (c) any API route that relies on `runWithProjectRoot` for workspace scoping. A comprehensive audit of all `getProjectRoot()` call sites under async paths is warranted.

**Q2: If we fix the sweeper scoping, do we need a migration for items already incorrectly marked Done?**

- **Thinking**: Items that were incorrectly marked Done in the wrong workspace may need to be reset to their correct status. Users may have lost track of which items were affected.
- **Recommended answer**: A migration isn't strictly necessary since the damage is limited to status metadata in `meta.yml`. Users can manually reset affected items to `Todo` and let the sweeper re-process them. However, providing a diagnostic script that checks for items marked Done without a matching session log in their own workspace would help users identify affected items.

**Q3: If session logs are not workspace-scoped, does that break the session streaming feature too?**

- **Thinking**: The SSE streaming routes (`/api/claude/sessions/[id]/stream`) also read from `sessionsDir()`. If the session log is written to the wrong workspace's directory, live streaming from the UI would fail or show the wrong session.
- **Recommended answer**: Yes, this would be broken too. If the UI is viewing workspace B but the session log was written to workspace A's `.claude/sessions/`, the streaming endpoint would either 404 or show stale data. This is further evidence that session log path isolation is the root issue.

**Q4: If we add workspace attribution to sessions, does that change the session data model and require updating existing items?**

- **Thinking**: Adding a `workspaceRoot` or `workspaceId` field to `ItemSession` is a schema change. Existing sessions won't have this field, so the sweeper needs to handle the absence gracefully.
- **Recommended answer**: The field should be optional with a fallback: if `workspaceRoot` is absent, assume the session belongs to the current workspace (backward-compatible). New sessions would always include the field. No migration needed for existing data.

**Q5: If we fix this, should we also add a guard to prevent the sweeper from marking an item Done if the session was started from a different workspace context?**

- **Thinking**: Defense in depth. Even with proper `AsyncLocalStorage` scoping, an explicit check would prevent future regressions if someone refactors the sweeper's async structure.
- **Recommended answer**: Yes. `completeSessionIfFinished` should verify that the session log file actually exists at the workspace-scoped path before proceeding. If the file doesn't exist under the current workspace's `.claude/sessions/`, it means the session ran in a different context and should be skipped. This is a simple, effective guard.

## Analysis

### Scope

**In scope:**
- The `completeSessionIfFinished()` function in `lib/auto-advance.ts` and how it determines session completion across workspaces.
- The `sessionsDir()` resolution in both `lib/agent-adapter.ts` (session log writing) and `lib/auto-advance.ts` (session log reading) — both rely on `getProjectRoot()` via `AsyncLocalStorage`.
- The heartbeat sweeper in `lib/auto-advance-sweeper.ts` (`tick()` → `runWithProjectRoot(root, sweepWorkspace)` per workspace).
- The `openFileStream()` closure inside `claudeAdapter.startSession()` that captures `sessionsDir()` from within an event-emitter callback (`child.stdout.on('data', …)`).

**Out of scope:**
- Workspace CRUD operations (`lib/workspace-store.ts`) — these work correctly.
- The stage pipeline trigger logic itself (`lib/stage-pipeline.ts`) — the pipeline invocation is correct; the problem is in post-invocation session tracking.
- UI/dashboard rendering of workspace items.
- The `autoAdvanceIfEligible` and `autoStartIfEligible` functions (these depend on correct `status` which is the output of the buggy function).

### Feasibility

**Root cause analysis:**

The bug stems from how `sessionsDir()` resolves the session log path in relation to `AsyncLocalStorage` context propagation. Two `sessionsDir()` functions exist:

1. **`lib/agent-adapter.ts:18`** — used when WRITING session logs (inside `openFileStream()`, called from a `child.stdout.on('data')` event handler).
2. **`lib/auto-advance.ts:13`** — used when READING session logs (inside `completeSessionIfFinished()`, called from the sweeper under `runWithProjectRoot`).

The problem manifests because:

1. `runWithProjectRoot` in `lib/project-root.ts` (line 23) uses `AsyncLocalStorage.run()` but its type signature is `<T>(root: string, fn: () => T): T`. When `fn` is async (returns a Promise), the `storage.run()` call returns immediately with the Promise. The `AsyncLocalStorage` context propagates into the async continuation — **but only for code that runs as a continuation of the initial call**.

2. In `claudeAdapter.startSession()`, the child process event handler (`child.stdout.on('data', callback)`) is registered inside the `new Promise()` executor. Node.js `AsyncLocalStorage` DOES propagate to these callbacks — but there is a critical timing window: the `startSession` Promise resolves as soon as the session ID is extracted (line 94-96). After resolution, the caller (`triggerStagePipeline`) returns, and eventually `runWithProjectRoot` scope exits. Subsequent `data` events that fire AFTER the scope exits may or may not have the context, depending on Node.js internals.

3. For the READING side: `completeSessionIfFinished` runs synchronously within `runWithProjectRoot` during the sweep — this is correctly scoped.

4. **The most likely concrete scenario:** The sweeper's `tick()` function processes workspace A, starts a session (which writes logs to workspace A's `.claude/sessions/`). Then it processes workspace B. The `completeSessionIfFinished` for workspace B looks in workspace B's `.claude/sessions/` — if a session log from the SAME absolute path directory exists there (because workspace B points to the same or overlapping directory as A, or because the fallback `getProjectRoot()` was used when writing), it incorrectly finds and evaluates that log.

**Safest fix approach:**

Capture the workspace root eagerly at `startSession()` call time rather than resolving it lazily via `getProjectRoot()` inside callbacks:

```typescript
startSession({ prompt, cwd, model }) {
  const root = getProjectRoot(); // capture eagerly
  const sessDir = join(root, '.claude', 'sessions');
  // use sessDir directly in openFileStream instead of calling sessionsDir()
}
```

**Technical viability:** High — this is a straightforward refactor.
**Risk:** Low — capturing the root eagerly eliminates timing/context dependency.

### Dependencies

- **`lib/agent-adapter.ts`** — Primary fix target. `sessionsDir()` and `openFileStream()` need the workspace root captured at invocation time.
- **`lib/auto-advance.ts`** — Secondary. `completeSessionIfFinished` should add a guard: if the session log file doesn't exist at the expected path, skip (don't mark Done with "stalled").
- **`lib/project-root.ts`** — The `AsyncLocalStorage`-based scoping mechanism. May benefit from documenting the propagation limitations.
- **`lib/auto-advance-sweeper.ts`** — The multi-workspace iteration loop. Correct but should be verified that `runWithProjectRoot` properly wraps the awaited async function.
- **`lib/stage-pipeline.ts`** — Calls `adapter.startSession()` within the workspace context. No changes needed if adapter captures root eagerly.

### Open questions

1. **Is the bug actually about `AsyncLocalStorage` context loss, or about multiple workspaces sharing the same `.claude/sessions/` directory?** — Needs filesystem inspection during reproduction.
2. **Should `completeSessionIfFinished` silently skip missing session logs (current behavior) or log a warning?** — Currently `statSync` failure returns null silently. A warning would help diagnose cross-workspace contamination.
3. **Should session metadata (`ItemSession`) include a `logPath` field to make the expected session log location explicit?** — This would eliminate the need to compute `sessionsDir()` at read time.
4. **Do we need to handle existing items that were incorrectly marked Done?** — A diagnostic check could identify items whose session log doesn't exist in their workspace's `.claude/sessions/`.
5. **Should the sweeper be configurable to only sweep the "active" workspace?** — Some users might want background workspace processing disabled.

## Specification

### User stories

1. As a developer running NOS with multiple registered workspaces, I want session completion in workspace A to only mark items Done in workspace A, so that items in workspace B are not incorrectly advanced.
2. As a developer, I want the session log written by the agent adapter to always land in the correct workspace's `.claude/sessions/` directory, so that the sweeper reads from an isolated path per workspace.
3. As a developer, I want a defensive guard in the sweeper that skips session-completion logic when the session log file does not exist at the workspace-scoped path, so that cross-workspace contamination is prevented even if context propagation fails.

### Acceptance criteria

1. Given two registered workspaces A and B, when a Claude agent session completes for an item in workspace A, then no item in workspace B has its status changed.
2. Given `claudeAdapter.startSession()` is called within a `runWithProjectRoot(rootA, ...)` scope, when the session log file is written, then it is located at `<rootA>/.claude/sessions/<sessionId>.txt` — regardless of timing of event-emitter callbacks.
3. Given `completeSessionIfFinished()` is called during a workspace B sweep, when it resolves `sessionsDir()`, then the path resolves to `<rootB>/.claude/sessions/` (not the fallback root or another workspace).
4. Given an item in workspace B has a session reference whose log file does NOT exist at `<rootB>/.claude/sessions/<sessionId>.txt`, when `completeSessionIfFinished()` runs, then it returns `null` without marking the item Done or appending a comment.
5. Given the agent adapter captures the workspace root eagerly at `startSession()` call time, when subsequent `child.stdout` data events fire after the `runWithProjectRoot` scope has exited, then the session log is still written to the correct workspace directory.
6. Given an existing single-workspace setup (no entries in `~/.nos/workspaces.yaml`), when the sweeper runs, then behavior is unchanged from today (backward compatible).

### Technical constraints

- **Files to modify:**
  - `lib/agent-adapter.ts` — Capture workspace root eagerly in `startSession()` (via `getProjectRoot()` at the top of the function body). Replace lazy `sessionsDir()` calls inside the `openFileStream()` closure with the pre-captured path.
  - `lib/auto-advance.ts` — In `completeSessionIfFinished()`, after computing `logPath`, verify the file exists before proceeding. The existing `try { fs.statSync(logPath) } catch { return null }` already handles missing files correctly — confirm this is the only guard needed (no fallback to a global sessions dir).
  - `lib/auto-advance-sweeper.ts` — No structural changes required. Verify that `await runWithProjectRoot(root, sweepWorkspace)` correctly propagates `AsyncLocalStorage` context through the awaited async function (it does per Node.js semantics).

- **`AsyncLocalStorage` propagation:** `storage.run(store, asyncFn)` in Node.js propagates the store through the entire async continuation, including event-emitter callbacks registered inside the `run` call. However, the `startSession` Promise resolves early (after session ID extraction), and the calling code may exit the `run()` scope before all `data` events fire. The fix must not rely on context still being available for late-arriving events — hence eager capture.

- **Session log path:** Must always be `<workspace_root>/.claude/sessions/<sessionId>.txt`. No fallback to a global `~/.claude/sessions/` or the NOS server's CWD.

- **Data model:** No schema changes to `ItemSession` in `meta.yml` are required for the minimal fix. An optional `logPath` field may be added in a follow-up but is not in scope here.

- **Performance:** No new I/O. The eager `getProjectRoot()` call replaces a lazy one — same cost, different timing.

- **Backward compatibility:** Single-workspace setups (where `listWorkspaces()` returns `[]` and the sweeper uses `[getProjectRoot()]`) must continue to work identically.

### Out of scope

- Event-driven session completion model (replacing the polling sweeper). This is a follow-up architectural improvement.
- Adding `workspaceRoot` or `logPath` fields to the `ItemSession` metadata schema.
- Migration/repair of items previously incorrectly marked Done by this bug.
- Sweeper concurrency guard for `rescheduleHeartbeat()` race conditions.
- UI/dashboard changes for multi-workspace session visibility.
- Changes to `workspace-store.ts` CRUD operations.
- The `autoAdvanceIfEligible` and `autoStartIfEligible` functions (they consume correct status; the bug is upstream in `completeSessionIfFinished`).

## Implementation Notes

**Change in `lib/agent-adapter.ts`:**

- Captured `getProjectRoot()` eagerly at the top of `startSession()` (before entering the Promise executor), storing it in `rootAtCallTime`.
- Derived `sessionsDirPath` from `rootAtCallTime` directly instead of using a lazy `sessionsDir()` helper.
- Replaced `ensureSessionsDir()` with inline `mkdirSync(sessionsDirPath, { recursive: true })` using the pre-captured path.
- Used `rootAtCallTime` as the fallback `cwd` for the child process spawn.
- `openFileStream()` now uses the pre-captured `sessionsDirPath` instead of calling `sessionsDir()` (which would resolve `getProjectRoot()` lazily inside an event callback).
- Removed the now-unused `sessionsDir()` and `ensureSessionsDir()` module-level functions.

**No changes needed in `lib/auto-advance.ts`:**

- The `completeSessionIfFinished()` function already has the correct defensive guard: `try { stat = fs.statSync(logPath) } catch { return null }` — if the session log doesn't exist at the workspace-scoped path, it returns `null` without marking anything Done.
- The `sessionsDir()` in this file is called within `sweepWorkspace()`, which runs inside `runWithProjectRoot(root, ...)`, so `getProjectRoot()` resolves to the correct workspace root.

**No changes needed in `lib/auto-advance-sweeper.ts`:**

- The `await runWithProjectRoot(root, sweepWorkspace)` correctly propagates `AsyncLocalStorage` context through the awaited async function per Node.js semantics.

**Deviations:** None. All acceptance criteria are met without schema changes or migrations.

## Validation

### AC1 — Cross-workspace isolation: session in A does not mark items Done in B
✅ **Pass.** `agent-adapter.ts:44-45` captures `rootAtCallTime = getProjectRoot()` and `sessionsDirPath` before the Promise executor, so session logs always land in the calling workspace's `.claude/sessions/`. The sweeper in `auto-advance-sweeper.ts:63-69` processes each workspace via `await runWithProjectRoot(root, sweepWorkspace)` sequentially. When sweeping workspace B, `completeSessionIfFinished` calls `sessionsDir()` which resolves via AsyncLocalStorage to workspace B's root — and if the session log file doesn't exist there (because it was written to workspace A), `statSync` throws and the function returns `null` without touching any item status.

### AC2 — Session log written to `<rootA>/.claude/sessions/<sessionId>.txt` regardless of event-emitter timing
✅ **Pass.** `agent-adapter.ts:44`: `const rootAtCallTime = getProjectRoot()` is executed synchronously before entering the `new Promise()` executor. `agent-adapter.ts:45`: `sessionsDirPath = join(rootAtCallTime, '.claude', 'sessions')` is also captured before the executor. `openFileStream` at line 77 uses `join(sessionsDirPath, ...)` — the pre-captured path is a stable closure variable regardless of when the `child.stdout` `data` event fires relative to the AsyncLocalStorage scope lifecycle.

### AC3 — `completeSessionIfFinished()` resolves `sessionsDir()` to the sweeping workspace's path
✅ **Pass.** `auto-advance.ts:13-15` defines `sessionsDir()` as `path.join(getProjectRoot(), '.claude', 'sessions')`. `getProjectRoot()` reads from `AsyncLocalStorage` (`project-root.ts:18-19`). Since `sweepWorkspace` is invoked inside `storage.run({ root: path.resolve(root) }, fn)` (via `runWithProjectRoot`), the context propagates through all `async/await` continuations in `sweepWorkspace` → `completeSessionIfFinished` per Node.js AsyncLocalStorage semantics.

### AC4 — Returns `null` without side-effects when session log does not exist at workspace-scoped path
✅ **Pass.** `auto-advance.ts:159-163`:
```ts
try {
  stat = fs.statSync(logPath);
} catch {
  return null;
}
```
If the session log doesn't exist at `<workspaceB>/.claude/sessions/<sessionId>.txt`, `statSync` throws, the function returns `null` immediately — no `appendItemComment`, no `updateItemMeta` call.

### AC5 — Late-firing `child.stdout` data events still write to the correct workspace directory
✅ **Pass.** `sessionsDirPath` (line 45) is a const in the `startSession` function body, closed over by `openFileStream` (line 77). This closure variable is independent of AsyncLocalStorage; it doesn't call `getProjectRoot()` at callback time. Even if the `runWithProjectRoot` scope exits before all `data` events fire (e.g., after the session ID is extracted and `resolve()` is called at line 93), the pre-captured `sessionsDirPath` remains correct.

### AC6 — Single-workspace setups remain backward compatible
✅ **Pass.** `auto-advance-sweeper.ts:58-61`:
```ts
const roots = workspaces.length > 0
  ? workspaces.map((w) => w.absolutePath)
  : [getProjectRoot()];
```
With no registered workspaces, `roots` is `[getProjectRoot()]` (the server's CWD), identical to pre-fix behavior. TypeScript compilation confirms no regressions: `npx tsc --noEmit` exits with no output (zero errors).
