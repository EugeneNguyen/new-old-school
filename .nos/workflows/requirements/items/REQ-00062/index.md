When run npx nos



current

* Only normal behaviour of starting next js



desired

* TUI
* Allow to choose to&#x20;
  * go to normal log (like current)
  * minimize it (run in background)
  * stop the service
* If there's already run in background service
  * attach to that service when run npx nos again

## Analysis

### 1. Scope

**In scope**
- Replace the current `npx nos` foreground behaviour (in `bin/cli.js`) with an interactive TUI that launches on startup.
- TUI actions:
  - **Go to normal log** — stream the Next.js dev server's stdout/stderr in the current terminal (today's behaviour).
  - **Minimize** — detach the server so it keeps running in the background after the TUI exits.
  - **Stop service** — terminate the running server (foreground or background) and exit.
- Single-instance detection: when `npx nos` runs and a background server is already alive (by PID file + port probe on `NOS_PORT`, default `30128`), attach the new TUI to that existing process instead of starting a second one.
- State persistence between invocations: a lockfile / PID file under `.nos/` (e.g. `.nos/runtime/server.json`) recording `pid`, `port`, `projectRoot`, `startedAt`, and the path to a rotating log file used when the server is detached.
- Graceful shutdown wiring so `SIGINT` in the TUI does not kill a minimized server by accident.

**Explicitly out of scope**
- Changing the Next.js dev server itself, the dashboard UI, or the stage pipeline.
- Multi-project / multi-port orchestration (one background server per project root).
- Remote attach over the network — "attach" here is local-only (reading the shared log file, sending signals to the local PID).
- Windows-specific daemonization beyond what Node's `child_process.spawn({ detached: true })` gives us; first cut targets macOS/Linux, with a best-effort fallback on Windows.
- Replacing `open` browser auto-launch behaviour unless it conflicts with background mode (in which case it's suppressed on re-attach).

### 2. Feasibility

**Viable.** The pieces are standard Node tooling:
- TUI: `ink` (React-based, fits the rest of the stack) or `prompts`/`@inquirer/prompts` for a lighter menu. `ink` gives us live log tailing in the same screen; `prompts` is simpler if we only need a menu.
- Background detach: `spawn(..., { detached: true, stdio: ['ignore', logFd, logFd] })` + `child.unref()`, with the PID + log path written to the lockfile.
- Attach: read the lockfile, verify the PID is alive (`process.kill(pid, 0)`) and the port responds, then `tail -f` the log file into the TUI.
- Stop: `process.kill(pid, 'SIGINT')` → wait → `SIGKILL` fallback. Clean up the lockfile.

**Risks / unknowns**
- **Orphaned lockfiles** after an unclean exit (kill -9, crash). Need a liveness probe (PID + port) and auto-cleanup, otherwise "attach" will hang.
- **Log file growth** when minimized for long periods — need a size cap or rotation (simple: truncate on start, cap at N MB).
- **Cross-platform detach semantics**: `detached: true` on Windows spawns a new console window unless `windowsHide` is set; needs verification.
- **TTY ownership on re-attach**: we can't literally re-attach the background child's stdio, so "go to normal log" after minimize must be implemented as "tail the log file", not true stdio re-hookup. This is a subtle UX difference from the first run.
- **Ctrl+C in attach mode**: must only detach the TUI, not signal the background process. Needs explicit input handling.
- **Dependency footprint**: adding `ink` pulls in React+Yoga for the CLI; acceptable since the project already ships React, but worth a size check.

No spikes strictly required, but a 1-hour spike on detach + re-attach on macOS/Linux/Windows is prudent before committing to the TUI library choice.

### 3. Dependencies

- **Code**: `bin/cli.js` is the primary surface; it currently hard-codes `spawn` + `open` + `SIGINT`. All new logic lands here or in a new `bin/` module.
- **Runtime state directory**: new `.nos/runtime/` (or similar) for `server.json` lockfile and `server.log`. Must be added to the bundled template `templates/.nos/` only if we want it scaffolded; otherwise created lazily at first run and gitignored.
- **NOS dev server**: unchanged, but the CLI must keep honouring `NOS_PORT` and `NOS_PROJECT_ROOT` env vars (see `bin/cli.js:10`, `bin/cli.js:56`).
- **New npm dependencies**: one of `ink` + `ink-text-input` / `ink-select-input`, OR `@inquirer/prompts`. Pick one.
- **`open` package**: keep for first-launch browser opening; suppress on re-attach.
- **No changes needed** to `.nos/workflows/`, the stage pipeline, `lib/auto-advance*`, or the dashboard routes.

### 4. Open questions

1. **TUI library**: `ink` (rich, React, heavier) vs `@inquirer/prompts` (simple menu, no live log rendering)? Choice drives whether "normal log" mode is inline tail or a pager handoff.
2. **Lockfile location**: `.nos/runtime/server.json` (per-project, travels with the workflow dir) or `~/.nos/runtime/<hash-of-projectRoot>.json` (per-user)? Per-project is simpler and matches `NOS_PROJECT_ROOT` semantics.
3. **"Minimize" semantics when the server was launched foreground-attached**: do we re-parent the existing child via `child.unref()` + `stdio` redirect to the log file, or do we stop-and-restart as detached? Re-parenting mid-flight is fiddly; restart is simpler but drops in-flight requests.
4. **Multiple project roots**: if the user runs `npx nos` from project A, minimizes, then runs from project B — do we start a second server on a different port, or refuse? Suggest: scope lockfile by `projectRoot`, allow one background server per project.
5. **Browser auto-open**: keep the 4-second delayed `open(url)` on first launch? Skip it on re-attach? Make it a TUI option?
6. **Log retention**: cap size (rotate at 10 MB?) or truncate-on-start? Should `stop` delete the log or keep it for post-mortem?
7. **Exit codes / scripting**: should the TUI be suppressed when stdout is not a TTY (e.g. `npx nos | tee`), falling back to current behaviour? Probably yes.
8. **Status command**: do we also want `npx nos status` / `npx nos stop` non-interactive subcommands, or strictly the TUI? Non-interactive subcommands are cheap to add and useful for scripts.

## Specification

### User Stories

1. As a developer, I want `npx nos` to present an interactive TUI menu when invoked in a terminal, so that I can choose how to start and interact with the NOS dev server without memorising flags.
2. As a developer, I want to stream server logs in my current terminal from the TUI, so that I can monitor and debug NOS exactly as I do today.
3. As a developer, I want to minimise the NOS server to the background from the TUI, so that I can free my terminal while the server keeps running.
4. As a developer, I want to stop the NOS server from within the TUI, so that I can cleanly terminate the service without hunting for the PID.
5. As a developer, I want `npx nos` to automatically attach to an already-running background server instead of starting a second one, so that I never accidentally duplicate the service.
6. As a developer, I want `npx nos status` and `npx nos stop` non-interactive subcommands, so that I can query and control the server from scripts and CI without entering the TUI.
7. As a developer running `npx nos` in a pipe or non-interactive context, I want it to fall back to the original stream-only behaviour, so that scripted workflows continue to work unchanged.

### Acceptance Criteria

**AC-1 — First-run TUI menu (no background server)**
- Given no background NOS server is running for the current project root
- When the user runs `npx nos` and stdout is a TTY
- Then a TUI menu appears with three options: **Show logs**, **Run in background**, **Stop service**
- And **Stop service** is rendered as disabled/greyed-out when no server is running.

**AC-2 — Show logs (foreground stream mode)**
- Given the TUI menu is displayed
- When the user selects **Show logs**
- Then the NOS dev server starts (if not already running) and its stdout/stderr streams live into the current terminal below a header line showing the server URL (e.g. `NOS running at http://localhost:30128`)
- And pressing Ctrl+C stops streaming and returns to the TUI menu (it does NOT kill the server if the server is a background process)
- And on first launch (not re-attach) the existing 4-second delayed `open(url)` call is preserved.

**AC-3 — Run in background (minimize)**
- Given the TUI menu is displayed
- When the user selects **Run in background**
- Then the server process is spawned detached (`{ detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true }`) and unreffed (`child.unref()`)
- And a lockfile is written to `<projectRoot>/.nos/runtime/server.json` with the schema defined in Technical Constraints
- And the terminal is returned to the user with the message: `NOS running in background on http://localhost:<port>`
- And `npx nos` exits with code 0
- And `open(url)` is NOT called.

**AC-4 — Stop service from TUI**
- Given a NOS server is running (foreground or background)
- When the user selects **Stop service** in the TUI
- Then the CLI sends SIGINT to the server PID
- And if the process has not exited within 5 seconds, sends SIGKILL
- And the lockfile at `.nos/runtime/server.json` is deleted after the process exits
- And the TUI exits with code 0.

**AC-5 — Re-attach to running background server**
- Given a lockfile exists, the PID recorded in it is alive (`process.kill(pid, 0)` succeeds), and the port responds to a TCP probe within 1 second
- When the user runs `npx nos` from the same project root
- Then the TUI appears with the options **Show logs** (tails the log file) and **Stop service**, with **Show logs** pre-selected
- And no second server process is started
- And `open(url)` is NOT called.

**AC-6 — Orphaned lockfile detection and cleanup**
- Given a lockfile exists but the PID is not alive OR the port does not respond
- When the CLI starts up
- Then the stale lockfile is deleted automatically before the menu is shown
- And the CLI proceeds as if no server is running.

**AC-7 — Log tailing on re-attach**
- Given the user has re-attached to a background server and selects **Show logs**
- Then the TUI tails `logPath` from `server.json` in real-time (new bytes appended to the file appear in the terminal)
- And pressing Ctrl+C exits the log view and returns to the TUI menu without stopping the background server.

**AC-8 — Non-TTY fallback**
- Given `process.stdout.isTTY` is `false` (e.g. `npx nos | tee out.log`, CI environment)
- When the user runs `npx nos` with no subcommand
- Then the CLI starts the server and streams stdout/stderr directly, with no TUI rendered and no lockfile written
- And behaviour is identical to the current `bin/cli.js` implementation.

**AC-9 — `npx nos status` subcommand**
- Given a background server is running (valid lockfile + liveness probe passes)
- When the user runs `npx nos status`
- Then the CLI prints to stdout: `{ "running": true, "pid": <n>, "port": <n>, "startedAt": "<ISO>" }` and exits with code 0
- Given no server is running (no lockfile or liveness probe fails)
- Then the CLI prints `{ "running": false }` to stdout and exits with code 1.

**AC-10 — `npx nos stop` subcommand**
- Given a server is running
- When the user runs `npx nos stop`
- Then the server is stopped (SIGINT → 5 s grace → SIGKILL fallback), the lockfile is deleted, and the CLI exits with code 0
- Given no server is running
- Then the CLI prints `No NOS server running.` to stderr and exits with code 1.

**AC-11 — Browser auto-open rules**
- On a fresh first launch (no prior lockfile), the existing 4-second delayed `open(url)` is preserved.
- On re-attach (AC-5), background launch (AC-3), or any subcommand (`status`, `stop`), `open(url)` is NOT called.

**AC-12 — Log file lifecycle**
- The server log file lives at `<projectRoot>/.nos/runtime/server.log`.
- On each fresh server start the file is truncated to 0 bytes before the process is spawned.
- If the log file grows beyond 10 MB during a session, the oldest half of the file content is dropped in-place (rotate) to stay under the cap.
- On a successful `stop`, the log file is retained for post-mortem inspection (not deleted).
- `.nos/runtime/` is added to `<projectRoot>/.gitignore` by the CLI on first run if the entry is not already present.

### Technical Constraints

**Lockfile schema** — `<projectRoot>/.nos/runtime/server.json`
```json
{
  "pid": 12345,
  "port": 30128,
  "projectRoot": "/absolute/path/to/project",
  "startedAt": "2026-04-19T10:00:00.000Z",
  "logPath": "/absolute/path/to/project/.nos/runtime/server.log"
}
```
All path values are absolute. All fields are required.

**Log file** — `<projectRoot>/.nos/runtime/server.log`  
Plain text, UTF-8, line-buffered writes by the detached child process.

**Environment variables (unchanged)**
- `NOS_PORT` — overrides the default port `30128`
- `NOS_PROJECT_ROOT` — overrides `process.cwd()` as the project root; matches existing `bin/cli.js` logic at lines 10 and 56

**TUI library**
- Use `ink` (≥ v4) with `ink-select-input` for the menu and `ink`'s streaming state for the log view.
- The TUI must render correctly within an 80-column terminal without line wrapping.
- React is already a project dependency; `ink` adds no novel runtime requirement.

**Process management**
- Detached spawn: `child_process.spawn(node, [serverEntrypoint], { detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true })` + `child.unref()`
- Liveness probe on startup: `process.kill(pid, 0)` (throws `ESRCH` if dead) **and** `net.createConnection({ port, host: '127.0.0.1' })` with a 1-second connection timeout
- Stop sequence: SIGINT → wait up to 5 000 ms → SIGKILL if still alive
- Lockfile I/O is synchronous (`fs.readFileSync` / `fs.writeFileSync` / `fs.unlinkSync`) during startup; log-tailing I/O is asynchronous (`fs.createReadStream` / `fs.watch`)

**Non-TTY detection**
- `process.stdout.isTTY === false` → skip TUI; behave exactly as the current `bin/cli.js`

**Exit codes**
- `0` — normal exit (menu dismissed, background launched, stop succeeded)
- `1` — error condition or "not running" for `status`/`stop` subcommands
- In foreground stream mode, pass through the dev server's own exit code

**Performance**
- TUI startup (lockfile read + liveness probe) must complete within 2 seconds on macOS/Linux
- Log tailing must not buffer more than 64 KB in memory at any time

### Out of Scope

- Changes to the Next.js dev server itself, the NOS dashboard UI, or the stage pipeline
- Remote attach (cross-machine or cross-user)
- Multi-port orchestration or running more than one NOS server per project root simultaneously
- Windows-native service/daemon installation (Task Scheduler, NSSM, etc.) — `detached: true` with `windowsHide: true` only; behaviour on Windows is best-effort
- A `npx nos restart` subcommand (stop + start in one command)
- Log search, filtering, or structured log parsing within the TUI
- Persisting user preferences across invocations (e.g. "always start minimized")
- Authentication or access control on the background process
- Auto-update or version-check behaviour

## Validation

**Pre-check — Implementation presence**
- `bin/cli.js` is unchanged from the pre-spec baseline: it still runs `spawn(next, 'dev')` with `stdio: 'inherit'`, calls `open(url)` after 4 s, and `SIGINT` exits the CLI and kills the child (`bin/cli.js:53-77`). No TUI, no subcommand parsing, no lockfile I/O, no detach logic.
- No `## Implementation Notes` section was appended to `index.md` by the Implement stage.
- `.nos/runtime/` does not exist under the project root.
- `package.json` has no `ink`, `ink-select-input`, or equivalent TUI dependency added (the only new deps are unrelated Radix UI packages for REQ-00063).
- No helper modules (e.g. `bin/tui.js`, `bin/lockfile.js`, `bin/log.js`) were added.
- Git log shows no commit touching `bin/cli.js` for this requirement; the last change predates REQ-00062.

**Acceptance Criteria verdicts**

- **AC-1 — First-run TUI menu:** ❌ — No TUI exists. `bin/cli.js` launches the Next.js dev server directly with no menu. Evidence: `bin/cli.js:46-57`.
- **AC-2 — Show logs (foreground stream mode):** ❌ — No menu to select from; there is no "Show logs" option or header line displaying the server URL before streaming. Current Ctrl+C behaviour kills the server unconditionally (`bin/cli.js:73-77`), which is the opposite of the spec for re-attach scenarios.
- **AC-3 — Run in background (minimize):** ❌ — No detached-spawn code path, no `.nos/runtime/server.json` lockfile writer, no `child.unref()` call anywhere in `bin/`.
- **AC-4 — Stop service from TUI:** ❌ — No TUI and no SIGINT→SIGKILL escalation; the current `SIGINT` handler sends a single signal then `process.exit()` immediately.
- **AC-5 — Re-attach to running background server:** ❌ — No lockfile reader, no `process.kill(pid, 0)` liveness probe, no TCP port probe. Every invocation starts a fresh Next.js server.
- **AC-6 — Orphaned lockfile detection and cleanup:** ❌ — No lockfile concept exists to become orphaned.
- **AC-7 — Log tailing on re-attach:** ❌ — No log file is written (stdio is inherited, not redirected to a file) and no tail/watch logic exists.
- **AC-8 — Non-TTY fallback:** ❌ — Strictly, the current behaviour IS the non-TTY passthrough; however the AC's "given" depends on the existence of a TTY-specific path that isn't implemented, so the AC cannot be considered satisfied. Counted as fail.
- **AC-9 — `npx nos status` subcommand:** ❌ — `bin/cli.js` does not parse `process.argv` for subcommands; `npx nos status` would be passed through as an ignored arg and the dev server would start normally.
- **AC-10 — `npx nos stop` subcommand:** ❌ — Same as AC-9; no subcommand handler.
- **AC-11 — Browser auto-open rules:** ❌ — `open(url)` still fires unconditionally 4 s after launch (`bin/cli.js:63-71`) with no branching by launch mode; the rule "NOT called on re-attach / background / subcommand" is not enforced.
- **AC-12 — Log file lifecycle:** ❌ — No log file, no rotation, no `.gitignore` updater.

**Summary**
- **Counts:** 0 ✅ / 0 ⚠️ / 12 ❌
- **Root cause:** The Implementation stage session (sessionId `0ad05403-1d73-4a60-ace1-0877ba64647b`, started 2026-04-19T16:48:17Z) did not produce any code changes; the session log stalled per the comment left on the item.
- **Regression check:** Because nothing was changed, there are no regressions in adjacent functionality.

**Follow-ups (for next Implementation run)**
1. Add `ink` (≥ v4) and `ink-select-input` to `package.json` dependencies.
2. Refactor `bin/cli.js` into a small dispatcher that parses `argv[2]` for `status` / `stop` subcommands and otherwise enters the interactive TUI when `process.stdout.isTTY` is true.
3. Add `bin/lockfile.js` (read/write/delete + liveness probe: `process.kill(pid, 0)` + TCP connect to `127.0.0.1:<port>` with 1 s timeout) using the schema in Technical Constraints.
4. Add `bin/server.js` for detached spawn (`{ detached: true, stdio: ['ignore', logFd, logFd], windowsHide: true }` + `child.unref()`), foreground spawn (stdio inherit), and stop sequence (SIGINT → 5 s → SIGKILL).
5. Add `bin/log.js` for truncate-on-start, 10 MB rotation (drop oldest half in-place), and async tail using `fs.createReadStream` + `fs.watch`.
6. Add `bin/tui.jsx` with the three-item `ink-select-input` menu, disabled state for **Stop service** when no server is running, pre-selection of **Show logs** on re-attach, and Ctrl+C handling that only leaves the log view (not the background process) on re-attach.
7. Preserve the existing 4 s delayed `open(url)` only on a true first launch; suppress on re-attach, background, `status`, and `stop`.
8. Ensure the CLI adds `.nos/runtime/` to `<projectRoot>/.gitignore` on first run if not already present.
9. Keep the non-TTY code path bit-identical to the current `bin/cli.js` behaviour for scripted/CI use.
10. Manual test matrix on macOS: first launch → Show logs → Ctrl+C; first launch → Run in background → re-invoke (expect attach); `npx nos status` / `npx nos stop` with and without a running server; orphaned lockfile auto-cleanup (write a fake file with PID=1, port closed).

Item stays in the Validation stage pending a re-run of the Implementation stage.

## Implementation Notes

**Files changed:**
- `bin/cli.mjs` — new entry point replacing `bin/cli.js` for the `nos` bin
- `package.json` — updated `bin` to `./bin/cli.mjs`; added `@inquirer/prompts`

**TUI library deviation:** The spec requires `ink ≥ v4`. `ink` 5.2.1 is incompatible with the project's `react: canary` (19.2.5) — its bundled `react-reconciler` 0.29.x references `ReactCurrentOwner` and 0.31.x is missing `resolveUpdatePriority` in ink's host config. `@inquirer/prompts` is used instead; it satisfies all acceptance criteria with no React dependency.

**AC coverage:**
- AC-1: TUI menu with 3 options; Stop service disabled/greyed when no server running (`disabled: '(not running)'` in @inquirer/select)
- AC-2: Show logs starts server (detached, log file), tails log with Ctrl+C returning to menu
- AC-3: Run in background spawns detached server, writes lockfile, exits with code 0
- AC-4: Stop service sends SIGINT, waits 5 s, SIGKILL fallback, deletes lockfile
- AC-5: `runTUI` re-checks lockfile liveness on every loop iteration — if alive, only shows "Show logs" and "Stop service"
- AC-6: Orphaned lockfile (dead PID or port not responding) is deleted before menu renders
- AC-7: Log tailing uses 300 ms polling with `fs.openSync`/`fs.readSync`; Ctrl+C returns to menu, background server untouched
- AC-8: `process.stdout.isTTY === false` → `handleNoTTY()` identical to original `bin/cli.js` behaviour
- AC-9/AC-10: `npx nos status` / `npx nos stop` subcommands implemented
- AC-11: Browser open only on first launch in Show-logs path; suppressed everywhere else
- AC-12: Log truncated on each server start; rotated to 50 % when > 10 MB; retained on stop; `.nos/runtime/` added to `.gitignore` via `ensureGitignore()`
