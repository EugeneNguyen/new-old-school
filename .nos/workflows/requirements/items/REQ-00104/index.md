# Sometime the npx nos stopped and i need to move it again, check and fix that, if cannot see anything, put the logging method to figure it out in the future

## Analysis

The NOS dev server (`npx nos`) occasionally stops responding, requiring the operator to manually restart it. The analysis stage stalled before completing a full investigation, but the following failure modes have been identified from a code review of the runtime components:

**Architecture context:** `npx nos` spawns a detached Next.js dev server (`bin/cli.mjs:104`) whose PID is tracked in `~/.nos/runtime/server.json`. The server process hosts the REST API, the heartbeat sweeper (`lib/auto-advance-sweeper.ts`), the chokidar file watcher, and spawns Claude CLI child processes for stage pipeline runs.

**Identified failure modes:**
1. **Unhandled promise rejections / uncaught exceptions** — The Next.js server process has no top-level `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers. A single unhandled error in any async path (SSE handler, file watcher callback, workspace resolution) can terminate the Node.js process.
2. **Heartbeat sweeper silent death** — The sweeper uses recursive `setTimeout` (`auto-advance-sweeper.ts:95`). If `schedule()` is never called after an error escapes the outer try/catch (e.g., `readHeartbeatMs()` throws on corrupted settings), the sweeper stops permanently without logging that it died.
3. **Child process accumulation** — Stage pipeline spawns Claude CLI child processes. If sessions are never reaped (e.g., the session log file is deleted or the process is orphaned), file descriptors and process entries may accumulate.
4. **File watcher resource exhaustion** — Chokidar watches the `.nos/` directory tree. Large workspaces with many items can exhaust OS file watcher limits (macOS default: 256 per process).
5. **Log file descriptor closure** — The detached server's stdout/stderr are redirected to `~/.nos/runtime/server.log` via a file descriptor opened at spawn time (`cli.mjs:103`). If the log file is deleted or moved while the server runs, subsequent writes cause EPIPE, which can crash the process.
6. **No crash recovery** — When the server dies, nothing restarts it. The operator discovers it only when the dashboard stops responding or the CLI's `isAlive()` check fails.

**Current mitigations:** The sweeper wraps each item tick in try/catch. The stage pipeline catches adapter spawn errors. The CLI has a `pidAlive()`/`tcpAlive()` liveness probe. Log rotation truncates large logs. But none of these prevent the server process itself from dying or detect that the heartbeat has stopped.

**Root cause: `readHeartbeatMs()` throws on malformed settings.yaml, stopping the heartbeat permanently.**

The sweeper's `schedule()` function (line 78–109 in `lib/auto-advance-sweeper.ts`) calls `readHeartbeatMs()` from `lib/settings.ts` (line 27–34). This function:

1. Reads `settings.yaml` via `fs.readFileSync` — can throw on disk I/O errors
2. Calls `yaml.load(raw)` — throws on malformed YAML (invalid types, syntax errors)
3. Validates the `autoAdvanceHeartbeatMs` field — throws if present but not a finite integer ≥ 0

When `readHeartbeatMs()` throws, the sweeper catches it (lines 86–91) but **returns without calling `setTimeout`**. The recursive `schedule()` call at line 101 is unreachable from this path. The heartbeat timer is dead permanently — `rescheduleHeartbeat()` (line 115–117) is the only way to restart it, and it just calls `schedule()` again, which will hit the same error if the settings file is still corrupt.

This means any of the following scenarios will permanently stop the heartbeat:
- A user edits `.nos/settings.yaml` by hand with a typo
- A YAML merge tool introduces a type coercion issue
- The file permissions change mid-read
- The file is deleted concurrently
- The disk fills up during the read

The server keeps running (API routes work), but no items auto-advance, no routines run, and no sessions complete — appearing as "the server stopped working."

The existing `[auto-advance] readHeartbeatMs failed` console error is the only signal, and it's easy to miss. The prior Analysis session correctly identified this as a key issue but did not pinpoint the exact mechanism.

**Secondary findings (lower probability of causing a full stop):**
- `listWorkspaces()` in `tick()` (line 59) has no try/catch — if the workspace registry is corrupt, `tick()` throws. The catch at line 97 catches this, so the timer survives but that tick is lost. No permanent stop.
- `fs.statSync` in `completeSessionIfFinished` (auto-advance.ts line 160) has no try/catch — inside the sweeper's try/catch, so caught and logged.
- No `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers in the server — a truly unexpected rejection could crash the Node.js process.

## Specification

### User Stories

1. **US-1**: As an operator, I want the NOS server process to be resilient against transient errors, so that a single unhandled exception does not bring down the entire system.
2. **US-2**: As an operator, I want structured diagnostic logging in the NOS runtime, so that when the server stops unexpectedly I can review logs to determine the root cause.
3. **US-3**: As an operator, I want the heartbeat sweeper to be self-healing, so that a transient failure in one tick does not permanently stop the auto-advance system.
4. **US-4**: As an operator, I want a health-check endpoint, so that external tools (or the CLI itself) can verify that the server and its subsystems are functioning.

### Acceptance Criteria

1. **AC-1 — Process-level error handlers**: The Next.js server process installs `process.on('uncaughtException')` and `process.on('unhandledRejection')` handlers that log the error with a full stack trace and timestamp to `~/.nos/runtime/server.log`, but do **not** exit the process (best-effort resilience for a local dev tool).
   - *Given* an unhandled promise rejection occurs in any async code path, *When* the rejection propagates to the process level, *Then* the error is logged with `[UNCAUGHT]` prefix and timestamp, and the process continues running.

2. **AC-2 — Sweeper self-healing**: If `readHeartbeatMs()` or the `tick()` function throws, the sweeper MUST still re-schedule itself for the next interval (fallback to a safe default of 60 000 ms if the configured interval is unreadable).
   - *Given* `readHeartbeatMs()` throws (e.g., corrupted `settings.yaml`), *When* the sweeper's `schedule()` function runs, *Then* it falls back to 60 000 ms and logs `[auto-advance] heartbeat config unreadable, using default 60s`.
   - *Given* the `tick()` promise rejects, *When* the rejection is caught, *Then* `schedule()` is still called afterwards.

3. **AC-3 — Heartbeat lifecycle logging**: The sweeper logs a single line at each tick start (`[heartbeat] tick start`) and tick end (`[heartbeat] tick end, swept N items in Xms`), and logs when it schedules the next tick (`[heartbeat] next tick in Xms`).
   - *Given* the sweeper completes a tick, *When* reviewing `server.log`, *Then* the operator can see the timestamp of the last successful tick and the number of items processed.

4. **AC-4 — Health-check endpoint**: A `GET /api/health` endpoint returns `200 OK` with a JSON body containing `{ status: "ok", uptime: <seconds>, heartbeat: { lastTickAt: <ISO>, nextTickIn: <ms> } }`. If the heartbeat has not ticked within 3× the configured interval, the `heartbeat` section includes `stale: true`.
   - *Given* the server is running and the sweeper has ticked at least once, *When* `GET /api/health` is called, *Then* it returns 200 with `status: "ok"` and `heartbeat.lastTickAt` within the expected interval.
   - *Given* the sweeper has not ticked for more than 3× the interval, *When* `GET /api/health` is called, *Then* `heartbeat.stale` is `true`.

5. **AC-5 — CLI auto-restart on dead server**: When the CLI's TUI loop detects the server is not alive (via `isAlive()`) and a lockfile exists with a `startedAt` timestamp, it logs `[nos] Server died (was started at <time>). Restarting...` and automatically restarts the detached server before returning to the menu, rather than showing the "Run in background" option.
   - *Given* the operator is in the TUI menu, *When* `isAlive()` returns false and a stale lockfile exists, *Then* the CLI restarts the server automatically and shows the log view.

6. **AC-6 — Structured log format**: All NOS runtime log lines (sweeper, stage-pipeline, auto-advance, session-complete) use the format `[<ISO-timestamp>] [<component>] <message>`. The component tag is one of: `heartbeat`, `auto-advance`, `auto-start`, `stage-pipeline`, `session-complete`, `uncaught`.
   - *Given* any runtime component emits a log line, *When* reviewing `server.log`, *Then* every NOS-originated line has a parseable ISO timestamp prefix and a component tag.

### Technical Constraints

- **Process handlers** must be installed during server startup. The appropriate location is a Next.js instrumentation hook (`instrumentation.ts` per Next.js docs) or the existing `startHeartbeat()` call site, since that runs once at server init.
- **Health endpoint** follows the API shape per `docs/standards/api-reference.md`: returns JSON via `NextResponse.json()`. No authentication required (local-only tool).
- **Heartbeat state** (lastTickAt, itemsSwept) should be stored in a module-level variable in `lib/auto-advance-sweeper.ts`, exported for the health endpoint to read. Do not write to disk for this — it is ephemeral runtime state.
- **Log format change** is a breaking change for any log-parsing tools. Since NOS is a local dev tool with no known external log consumers, this is acceptable.
- **CLI restart logic** modifies `bin/cli.mjs` only. The restart reuses the existing `startDetachedServer()` function.
- **File paths**: `lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`, `lib/stage-pipeline.ts`, `bin/cli.mjs`, `app/api/health/route.ts` (new).
- **Performance**: The health endpoint must respond in <50ms. The structured logging must not add measurable overhead to the heartbeat tick.

### Out of Scope

- **External process supervisor** (systemd, launchd, pm2): This requirement addresses in-process resilience and diagnostics only. A supervisor integration may be a future requirement.
- **Crash telemetry / remote reporting**: NOS is local-only; no data leaves the machine.
- **Automatic recovery of orphaned Claude CLI child processes**: Child process lifecycle is tracked by the existing session completion logic. Improving that is a separate concern.
- **Dashboard UI for health/diagnostics**: A health dashboard widget is out of scope. The health endpoint is API-only for now.
- **Changing the Next.js dev server to production mode**: The server runs in dev mode for hot-reload; this is by design.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00104 | NOS server stability & diagnostics | Operator report | `docs/standards/system-architecture.md`, `docs/standards/error-handling-strategy.md` | `lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`, `lib/stage-pipeline.ts`, `bin/cli.mjs`, `app/api/health/route.ts` (new) | (to be filled after validation) | In Progress |

### WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.1.4** Auto-Advance System | Sweeper self-healing, heartbeat lifecycle logging, heartbeat state export | Core changes |
| **1.2.5** Session Tracking | Structured logging in session-complete path | Log format update |
| **1.3.8** System Routes | New `GET /api/health` endpoint | New route |
| **1.7.1** CLI Entry Point | Auto-restart logic in TUI menu loop | CLI behavior change |
| **1.8.4** Middleware | Process-level error handlers (instrumentation hook) | New infrastructure |
| **1.8.7** Standards & Auditing | Error handling strategy update for process-level handlers | Documentation |

## Implementation Notes

All 6 acceptance criteria implemented:

- **AC-1** (`instrumentation.ts`): Added `installProcessErrorHandlers()` called on server startup. Installs `uncaughtException` and `unhandledRejection` handlers that log to `~/.nos/runtime/server.log` with `[UNCAUGHT]`/`[UNHANDLED]` prefix and ISO timestamp. Process continues running (best-effort).

- **AC-2** (`lib/auto-advance-sweeper.ts:schedule()`): Changed to fall back to `60_000` ms when `readHeartbeatMs()` throws, and unconditionally calls `schedule()` after `tick()` even when tick throws. Logs the fallback.

- **AC-3** (`lib/auto-advance-sweeper.ts`): Added structured logging for tick start (`[heartbeat] tick start`), tick end (`[heartbeat] tick end, swept N items in Xms`), and next tick scheduling (`[heartbeat] next tick in Xms`). Also added `lastTickDurationMs` and `lastTickItemsSwept` tracking.

- **AC-4** (`app/api/health/route.ts` new): Created `GET /api/health` returning `{ status: "ok", uptime, heartbeat: { lastTickAt, lastTickDurationMs, lastTickItemsSwept, nextTickIn, stale } }`. `stale: true` when last tick was >3× the interval ago.

- **AC-5** (`bin/cli.mjs:runTUI()`): When `isAlive()` returns false and a lockfile exists, the CLI now logs and auto-restarts the server instead of deleting the lockfile. Also re-checks `alive` after restart.

- **AC-6** (log format): Updated all `console.log` calls in `lib/auto-advance.ts`, `lib/stage-pipeline.ts`, and `lib/auto-advance-sweeper.ts` to use `[<ISO-timestamp>] [<component>] <message>` format. Component tags: `heartbeat`, `auto-advance`, `auto-start`, `stage-pipeline`, `session-complete`, `uncaught`.

- **Documentation**: Added Process-Level Error Handling section to `docs/standards/error-handling-strategy.md` covering the handlers, self-healing behavior, and health endpoint.
