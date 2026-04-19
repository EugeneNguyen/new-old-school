I want in screen Claude Terminal, list session
- Current: Same thing between active or still running/inactive or not running anymore session
- Desired: have something indicate which session is running/active

## Analysis

### 1. Scope

**In scope**
- Surface a per-session "is currently streaming / running" indicator in the
  session list on the Claude Terminal screen (`components/terminal/SessionPanel.tsx`).
- Extend the sessions listing API (`GET /api/claude/sessions`) and/or the
  `SessionSummary` type (`types/session.ts`) so the UI can tell which sessions
  have a live Claude CLI child process attached to them (via `streamRegistry`).
- Keep the indicator reasonably fresh while the user is looking at the screen
  (e.g. lightweight polling, or refresh on the existing `fetchSessions` hooks).

**Out of scope**
- Stopping, killing, or otherwise controlling a running session from the list
  (no "cancel" / "kill" button in this requirement).
- Multi-tab / multi-client coordination beyond what the single in-memory
  `streamRegistry` already provides; persistence of "active" state across
  server restarts.
- Redesigning the session card layout, copy-resume affordances, or the active
  (selected) highlight — the existing blue left-border selection state stays.
- Any back-end changes to how sessions are stored on disk.

### 2. Feasibility

Technically straightforward. The server already knows whether a session is
live:
- `lib/stream-registry.ts` tracks every Claude CLI child process and exposes
  `getStatus(sessionId)` returning `'streaming' | 'done' | null`.
- `app/api/claude/sessions/[id]/status/route.ts` already returns
  `{ streaming: boolean }` for a single id; the Terminal page uses it on
  resume.

The `GET /api/claude/sessions` list route currently builds each `SessionSummary`
purely from disk files and does not consult `streamRegistry`. Adding a
`status: 'running' | 'idle'` (or `isRunning: boolean`) field there is a small
change and reuses the existing registry as the single source of truth.

**Risks / unknowns**
- `streamRegistry` is in-memory per Node process. In a multi-instance
  deployment the list route may be served by a worker that did not spawn the
  child, so it would report `idle` incorrectly. Need to confirm the runtime
  topology (today it appears to be a single Next.js dev/prod process, so this
  is likely fine, but worth calling out).
- Refresh cadence: the page currently only calls `fetchSessions()` on mount
  and after a send completes, so a session that finishes in the background
  will look "running" until the next fetch. We'll need a small polling loop
  (or reuse the per-session status endpoint) while at least one session is
  marked running. Need to decide polling interval vs. SSE.
- After `deregister`, the registry keeps the entry for 30s with
  `status = 'done'`. The UI should treat `done` the same as an unknown /
  absent entry (i.e. "idle"), not as a third distinct state.
- Visual language is unspecified in the request (dot? pulse? "running"
  badge?). Needs a design decision before implementation.

### 3. Dependencies

- **Files likely to change**
  - `types/session.ts` — extend `SessionSummary` with a running flag.
  - `app/api/claude/sessions/route.ts` — consult `streamRegistry` when
    building each summary.
  - `components/terminal/SessionPanel.tsx` — render the indicator.
  - `app/dashboard/terminal/page.tsx` — possibly add periodic refresh of
    `fetchSessions` while any session is running.
- **Runtime dependencies**
  - `lib/stream-registry.ts` (already the source of truth for live state).
  - `app/api/claude/route.ts` + `app/api/claude/sessions/[id]/stream/route.ts`
    (they own lifecycle transitions that the registry tracks); no behavioural
    change expected, but any change to when `register` / `deregister` fire
    will affect accuracy of the new indicator.
- **External systems**: none. This is purely in-process state + UI.

### 4. Open questions

1. **Definition of "active"** — does the user mean strictly "a Claude CLI
   child process is currently streaming for this session" (what
   `streamRegistry` tracks), or a softer "recently used" (e.g. updated within
   the last N minutes)? The request wording ("running/active") suggests the
   former; confirm before implementation.
2. **Visual treatment** — preferred indicator? Options: pulsing green dot
   next to the session id, a small "running" badge next to the turn-count
   badge, an animated spinner, or a color change. Should it be distinct from
   the existing blue left-border that marks the *selected* session (which is
   a separate concept).
3. **Refresh strategy** — is short-interval polling (e.g. every 2–5s while
   any session is running) acceptable, or should this use the existing
   per-session `/status` endpoint / SSE? Polling is simpler; SSE is tidier
   but larger scope.
4. **Multiple running sessions** — is it expected that more than one session
   can be streaming simultaneously in normal use? If yes, the indicator and
   polling logic must handle N active sessions, not just the currently
   selected one.
5. **Finished-but-selected sessions** — should a session that just finished
   streaming briefly show a "done" state, or silently fall back to idle? The
   registry already preserves `done` for 30s; we can either expose it or
   ignore it.
6. **Interaction with "New Session"** — a brand-new session has no id until
   the first `result` event arrives. Should the UI show a placeholder
   "starting…" row for it in the session list, or is that out of scope here?

## Specification

### User stories

1. As a developer using the Claude Terminal screen, I want each session in
   the list to visibly indicate whether a Claude CLI process is currently
   streaming for it, so that I can tell running sessions apart from idle
   ones at a glance.
2. As a developer running multiple concurrent sessions, I want the running
   indicator to reflect every live session independently, so that I can
   monitor more than one at a time without switching tabs.
3. As a developer watching a session finish in the background, I want its
   running indicator to clear within a few seconds of completion without me
   having to refresh the page, so that the list does not lie about state.
4. As a screen-reader user, I want the running indicator to be announced as
   text (not colour alone), so that the state is accessible.

### Acceptance criteria

Definitions used below:
- A session is **running** iff `streamRegistry.getStatus(sessionId) ===
  'streaming'` in the Node process serving the request. Any other result
  (`'done'`, `null`) is **idle**.
- "Session list" refers to the cards rendered by
  `components/terminal/SessionPanel.tsx` on the Claude Terminal screen.

1. **Type extension**
   - Given `types/session.ts`, when built, then `SessionSummary` exposes a
     boolean field named `isRunning` (required, non-optional).
2. **API: list route reports live state**
   - Given `GET /api/claude/sessions` with no `id` query param, when it
     assembles each `SessionSummary`, then it sets
     `isRunning = streamRegistry.getStatus(session.id) === 'streaming'`.
   - Given a session whose process was `deregister`-ed (status `'done'`),
     when it appears in the list, then `isRunning` is `false` even during
     the 30-second grace window before the registry entry is deleted.
   - Given a session id that never appears in the registry, when it is
     listed, then `isRunning` is `false`.
   - The `id`-specific branch (`GET /api/claude/sessions?id=<id>`) and the
     existing `/api/claude/sessions/[id]/status` endpoint are unchanged.
3. **UI: per-row indicator**
   - Given the session list is rendered, when a session has
     `isRunning === true`, then its card displays a running indicator that
     is:
     a. visually distinct from the existing selected-session blue left
        border (the two states are independent and may co-occur);
     b. colour-independent — it carries an accessible text label (e.g.
        `aria-label="Running"` or visible text) so non-sighted users
        perceive it.
   - Given a session has `isRunning === false`, when its card is rendered,
     then no running indicator is shown.
   - Given two or more sessions have `isRunning === true` simultaneously,
     when the list is rendered, then each such row shows the indicator
     independently.
4. **UI: freshness while visible**
   - Given the Claude Terminal page is mounted and the browser tab is
     visible, when at least one session in the last fetched list had
     `isRunning === true`, then the page re-fetches `GET /api/claude/sessions`
     on an interval of **3 seconds** (±1s) until either no listed session
     is running or the page unmounts / tab becomes hidden.
   - Given the browser tab becomes hidden (`document.visibilityState !==
     'visible'`), when the interval would otherwise fire, then the fetch is
     skipped; on becoming visible again, polling resumes if any session is
     still running.
   - Given every listed session has `isRunning === false`, when the
     interval tick fires, then no additional fetch is scheduled until a
     user action (send, resume, manual refresh) triggers the existing
     `fetchSessions` path, which may re-enable polling.
   - Given a session finishes streaming, when the server has observed the
     `deregister` call, then the next list fetch returns `isRunning = false`
     for it and the indicator disappears from the UI within one polling
     cycle (≤ ~4s end-to-end).
5. **No regressions**
   - The existing selected-session highlight, turn-count badge, copy-resume
     affordance, and row click/keyboard behaviour of `SessionPanel` are
     unchanged.
   - `fetchSessions` continues to be called on mount and after a send
     completes, exactly as today; the new polling is additive.

### Technical constraints

- **Source of truth**: `lib/stream-registry.ts#streamRegistry.getStatus` is
  the only signal that determines `isRunning`. Do not introduce a parallel
  store or derive "running" from file mtimes, turn counts, or client-side
  heuristics.
- **Type shape**:
  ```ts
  // types/session.ts
  export interface SessionSummary {
    id: string;
    createdAt: string;
    updatedAt: string;
    preview: string;
    turnCount: number;
    model: string | null;
    isRunning: boolean; // new
  }
  ```
  The field is required (not optional) so server and client agree on the
  contract; all producers of `SessionSummary` must populate it.
- **API path**: no new route. The change is inside the existing handler at
  `app/api/claude/sessions/route.ts`, in the list branch only
  (`!sessionId`). Import `streamRegistry` from `@/lib/stream-registry` and
  call `getStatus` per summary.
- **Status mapping** (authoritative):
  | `getStatus` return | `isRunning` |
  |---|---|
  | `'streaming'` | `true` |
  | `'done'` | `false` |
  | `null` | `false` |
- **Polling**: implemented in `app/dashboard/terminal/page.tsx` (or a hook
  colocated with it) using `setInterval` guarded by
  `document.visibilityState`. Interval = 3000 ms. No websocket/SSE
  subscription is introduced by this requirement.
- **Component surface**: the indicator is rendered inside
  `components/terminal/SessionPanel.tsx`. Accessible name must be
  `"Running"`. Use an existing design-system token for the colour
  (green/success) and for motion (pulse) if available; do not hard-code
  hex values that bypass the token system.
- **Runtime assumption**: single Node process hosts the Next.js app.
  Behaviour in a multi-worker deployment (where the list route may be
  served by a worker that did not spawn the child) is not guaranteed — see
  Out of scope.
- **Performance**: the list handler already iterates every session file on
  disk; the added call is a single `Map.get` per session and is O(1) per
  entry. Polling runs at 3s only while ≥1 session is running; there is no
  unconditional 3s loop.

### Out of scope

- Controlling a running session from the list (stop/kill/cancel buttons).
- Exposing the 30-second `'done'` grace window as a distinct "just
  finished" UI state.
- A placeholder "starting…" row for new sessions that do not yet have an
  id (they acquire an id from the first `system/init` event; until then
  they are not in the list).
- SSE or websocket push for session-list updates; polling is the chosen
  mechanism.
- Multi-process / multi-instance correctness of the running flag
  (persistence of registry state across server restarts, cross-worker
  visibility).
- Redesign of `SessionPanel` layout, copy-resume affordance, or the
  existing selected-session blue left border.
- Changes to how sessions are persisted on disk or to the
  `/api/claude/sessions/[id]/status` and `/api/claude/sessions/[id]/stream`
  routes.

## Implementation Notes

- `types/session.ts`: added required `isRunning: boolean` to
  `SessionSummary`.
- `app/api/claude/sessions/route.ts`: `parseSessionSummary` now sets
  `isRunning = streamRegistry.getStatus(id) === 'streaming'` using the
  resolved session id (the one picked up from the `system/init` event when
  present), so `'done'` and `null` both map to `false`. The `?id=` branch
  and the standalone `/status` route are untouched.
- `components/terminal/SessionPanel.tsx`: each session row renders an
  animated green dot before the short id when `session.isRunning` is true.
  The dot has `role="status"`, `aria-label="Running"`, a visible-only
  `.sr-only` "Running" label for screen readers, and coexists with the
  existing blue left-border selection state.
- `app/dashboard/terminal/page.tsx`: added a `refreshSessionsSilently`
  fetch (does not touch `isLoadingSessions`) and a visibility-gated
  `setInterval` that polls `/api/claude/sessions` every 3000 ms while at
  least one listed session has `isRunning === true`. The effect tears
  down when no session is running, when the page unmounts, or when the
  browser tab is hidden; it also fires an immediate refresh on tab
  becoming visible. The existing `fetchSessions` calls on mount and after
  sends are preserved.

No changes to the session file storage, the `/status` route, or the
`stream-registry` lifecycle.

## Validation

Method: static review of changed files (`types/session.ts`,
`app/api/claude/sessions/route.ts`,
`components/terminal/SessionPanel.tsx`,
`app/dashboard/terminal/page.tsx`), cross-check against
`lib/stream-registry.ts` and the untouched
`app/api/claude/sessions/[id]/status/route.ts`, plus `tsc --noEmit`
(passes).

### 1. Type extension

- ✅ `SessionSummary.isRunning: boolean` is declared as a required,
  non-optional boolean at `types/session.ts:8`.

### 2. API: list route reports live state

- ✅ `parseSessionSummary` sets
  `isRunning: streamRegistry.getStatus(id) === 'streaming'` at
  `app/api/claude/sessions/route.ts:59`. `id` is the resolved session id
  (overwritten from `system/init.session_id` at line 35 when present),
  so the lookup matches what `stream-registry` keys on.
- ✅ `'done'` → `false`: the strict `=== 'streaming'` comparison maps
  the 30s grace-window `'done'` state to `false`.
- ✅ `null` (unknown id) → `false`: same comparison; `getStatus` returns
  `null` for missing entries (`lib/stream-registry.ts:52-54`).
- ✅ `?id=<id>` branch unchanged — it returns `SessionHistory`, not a
  summary, and does not touch `streamRegistry` (`route.ts:90-101`).
- ✅ `/api/claude/sessions/[id]/status` route file is byte-identical to
  its prior form — still returns `{ streaming }` only.

### 3. UI: per-row indicator

- ✅ When `session.isRunning === true`, a green pulsing dot is rendered
  before the short id (`SessionPanel.tsx:134-145`).
- ✅ Distinct from selected-session blue left border: the dot sits in
  the row's inner flex group (`.flex items-center gap-1.5`), while the
  blue indicator is applied as `border-l-2 border-l-blue-400` on the
  outer row (`SessionPanel.tsx:124-130`). The two render independently
  and co-occur when a running session is also selected.
- ✅ Accessible name is `Running`: the dot has `role="status"`,
  `aria-label="Running"`, `title="Running"`, and a `.sr-only`
  "Running" text node, so screen readers announce the state regardless
  of colour.
- ✅ When `isRunning === false`, the `session.isRunning && (...)`
  guard short-circuits and no dot renders.
- ✅ The indicator is rendered per-row inside `sessions.map(...)`, so
  N simultaneously-running sessions each get their own dot.

### 4. UI: freshness while visible

- ✅ Polling is gated by `hasRunningSession =
  sessions.some(s => s.isRunning)` (`page.tsx:95`) and by
  `document.visibilityState === 'visible'` inside the interval callback
  (`page.tsx:101-105`). Interval is exactly `3000` ms.
- ✅ When the tab is hidden, the interval callback's visibility check
  short-circuits and no fetch fires. On becoming visible, the
  `visibilitychange` listener calls `refreshSessionsSilently()`
  immediately, and the already-scheduled interval resumes ticking.
- ✅ When `hasRunningSession` flips to `false`, the effect's cleanup
  runs (`page.tsx:114-117`), tearing down the interval and the
  visibilitychange listener. No further polling fires until
  `fetchSessions` (on mount, `loadSession` resume path, or after a
  send) re-populates a running session, which re-runs the effect.
- ✅ Disappearance within ≤4s end-to-end: when the server's
  `deregister` runs, `getStatus` immediately returns `'done'` (grace
  window), so the next 3s poll maps to `isRunning: false`, React
  updates the list, and the dot unmounts on that render. 3s poll +
  network → well under 4s in normal conditions.

### 5. No regressions

- ✅ Selected-row styling (`border-l-blue-400` + `bg-zinc-800/50`),
  turn-count badge, copy-resume button, `role="button"` click, and
  Enter/Space keyboard handling in `SessionPanel.tsx` are unchanged
  from before the requirement.
- ✅ `fetchSessions()` still runs on mount (`page.tsx:90-93`) and after
  each send (`page.tsx:408`) and after stream resume (`page.tsx:295`).
  The new silent refresher (`refreshSessionsSilently`) is additive and
  does not replace any existing call.

### Regressions / edge cases checked

- `tsc --noEmit` passes — the required `isRunning` field is populated
  by the only producer (`parseSessionSummary`), so no consumer breaks.
- The `?id=` branch returns `SessionHistory`, not `SessionSummary`,
  so the new required field does not force any change there.
- The `/status` route is unchanged; the resume-stream path in
  `loadSession` still works as before.
- No design-system token for success-green exists in the project's
  Tailwind config, so `bg-green-400` / `bg-green-500` (Tailwind
  defaults, not hard-coded hex) are used. This matches the existing
  convention in the file (`text-green-400` used for the "claude"
  label at `page.tsx:522`), so no token system is bypassed beyond
  what the codebase already does.

### Verdict

All five acceptance-criterion groups pass. Item is ready to advance.
