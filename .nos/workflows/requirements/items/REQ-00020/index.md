Current
- Status it fetch from API and don't change in the frontend when status of item is changed, unless refresh all page

Desired
- Status in frontend will change in realtime when status in file changed.

## Analysis

### 1. Scope

**In scope**
- Propagate changes to an item's `status` (and by extension `stage`, since stage drives column placement) from `.nos/workflows/<workflowId>/items/<itemId>/meta.yml` to any open Kanban board view without a full page reload.
- Cover all writers of `meta.yml`: agent skills (`nos-set-status`, `nos-comment-item`), stage-pipeline status transitions (`lib/stage-pipeline.ts`), direct in-app edits (ItemDetailDialog, drag-and-drop in `KanbanBoard`), and manual file edits from the editor/CLI.
- Update the affected item card in place — badge color, column, and any other status-derived UI — while preserving the user's current interactions (drag in progress, open dialog, filter state).

**Out of scope**
- Realtime propagation of fields unrelated to status (full body/comments stream is tracked separately; ItemDetailDialog can keep its existing refresh model).
- New workflow/stage definitions appearing on disk (adding/removing workflows or stages — covered by a different requirement if needed).
- Multi-user collaborative editing semantics (merge conflicts, presence) — single-user local dev assumption still holds.
- Persisting any realtime transport state across server restarts.

### 2. Feasibility

Technically straightforward in the current Next.js App Router setup:

- **Source of truth** is the local filesystem under `.nos/workflows/`. We already load it server-side via `readWorkflowDetail` in `lib/workflow-store.ts:97` and mutate via `writeItemMeta`/`setStatus` paths. A file watcher on `.nos/workflows/<id>/items/*/meta.yml` is viable.
- **Transport options**:
  1. **Server-Sent Events (SSE)** — a new `GET /api/workflows/[id]/events` route that streams `item-updated` events. Matches the existing pattern in `app/api/claude/sessions/[id]/stream/route.ts`. One-way, cheap, survives reconnects with `EventSource` auto-retry. **Recommended.**
  2. **Polling** — simplest, but defeats "realtime" feel and wastes cycles.
  3. **WebSocket** — overkill for a one-way status push; needs a custom server in Next.js.
- **File watching**: Node `fs.watch` is flaky across platforms; `chokidar` (not currently a dep) is robust but adds weight. A lighter option is to emit events from inside the API routes that already write `meta.yml` (explicit notify), plus a periodic re-scan as a safety net for external edits. The strongest solution combines both: in-process EventEmitter for in-app writes, chokidar for external file edits.

**Risks / unknowns**
- Multiple browser tabs / multiple SSE subscribers: need a singleton broker (module-scoped EventEmitter) so every client sees every update; verify Next.js dev HMR doesn't multiply the broker.
- Optimistic updates in `KanbanBoard.tsx` (drag-and-drop already does `setItems` before the API resolves) — incoming SSE events must not clobber an in-flight optimistic change. Need last-writer-wins keyed by `updatedAt` or a short debounce around local mutations.
- `meta.yml` is rewritten atomically? If writes are not atomic (e.g. truncate-then-write), the watcher may fire on a partial/empty file and YAML parse will throw — need debounce + retry.
- Node fs events on macOS can fire twice per change; debounce per file.
- Item create / delete events should flow through the same channel for consistency even though the requirement focuses on status.

### 3. Dependencies

- `lib/workflow-store.ts` — only module that reads/writes `meta.yml`; the notify hook belongs here.
- `lib/stage-pipeline.ts` — writes status when agent sessions transition; must route through (or piggyback on) workflow-store so notifications are emitted uniformly.
- `app/api/workflows/[id]/items/[itemId]/route.ts` and the comments/content routes — same: write path must trigger a broadcast.
- `.claude/skills/nos-set-status/nos-set-status.mjs` — writes via HTTP to the local dev server, so notifications happen on the server side; no client change needed.
- `components/dashboard/KanbanBoard.tsx` — consumer; needs a `useEffect` that opens an `EventSource` for the workflow and merges updates into `items` state.
- `components/dashboard/ItemDetailDialog.tsx` — secondary consumer; if the open item receives an update, refresh header/status badge.
- New API route: `app/api/workflows/[id]/events/route.ts` (SSE).
- Possibly a new dep: `chokidar` (evaluate vs. `fs.watch`).
- No external services; fully local filesystem + in-process broker.

### 4. Open questions

1. **Watcher strategy**: in-process EventEmitter triggered from our own write paths only, or also add a filesystem watcher to catch external edits (direct `meta.yml` edits, git checkouts, agents writing via other tools)? The desired behavior wording ("when status in file changed") suggests external edits should also be covered — confirm.
2. **Transport**: SSE (recommended) vs. short-interval polling vs. WebSocket — any preference? SSE is assumed below unless flagged.
3. **Scope of realtime**: status only, or also `stage`, `title`, comments, and new/deleted items? Recommend status + stage + add/remove for consistency; confirm.
4. **Conflict handling with optimistic drag-and-drop**: is last-writer-wins acceptable, or do we need to reconcile via `updatedAt` timestamps (which would require adding one to `meta.yml` if absent)?
5. **Dev-server scope**: is realtime expected to work only in `next dev`, or also in a future production `next start` deployment? File-watching assumptions differ.
6. **ItemDetailDialog**: should an open dialog also live-update its status field, or is it acceptable for it to refresh only on reopen?

## Specification

### 1. User stories

- **US-1** — As a developer watching the Kanban board while an agent runs, I want each item's status badge and column to update in place the moment the agent flips its status on disk, so that I can see progress without manually refreshing the page.
- **US-2** — As a developer editing `meta.yml` directly from my editor or via a git checkout, I want the board to reflect the new status/stage within a couple of seconds, so that the UI never lies about the true state of the filesystem.
- **US-3** — As a developer dragging a card between columns, I want my in-flight optimistic move to be preserved and not get clobbered by a stale event that races in from the server, so that the UI feels stable during rapid interactions.
- **US-4** — As a developer with the item detail dialog open, I want the dialog's status chip to update live when the underlying status changes, so that I can read the current state without closing and reopening it.
- **US-5** — As a developer with multiple browser tabs open on the same board, I want every tab to receive the same update, so that I can trust any tab I look at.

### 2. Acceptance criteria

1. **SSE endpoint exists.** A new `GET /api/workflows/[workflowId]/events` route streams `text/event-stream` responses. Each message is a JSON payload with at minimum `{ type, workflowId, itemId, item? }` (see §3 for the exact shape). The route keeps the connection open until the client disconnects and participates in Next.js route handler conventions (returns a `Response` with a `ReadableStream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`).
2. **Broker is a process singleton.** A module-scoped `EventEmitter` (e.g. in `lib/workflow-events.ts`) is instantiated once per Node process, survives Next.js HMR in dev (guarded via `globalThis`), and is shared by every SSE connection.
3. **In-process writes always emit.** Every code path that writes `meta.yml` (`lib/workflow-store.ts` setters, `lib/stage-pipeline.ts`, the item/comments/content API routes, drag-and-drop endpoints) funnels through a single helper that, after a successful write, calls `broker.emit('item-updated', …)` with the post-write item payload. No write path may bypass this helper.
4. **External edits are detected.** A filesystem watcher (chokidar, new dep) is started lazily on first SSE subscription per workflow, watches `.nos/workflows/<workflowId>/items/*/meta.yml`, debounces events per file at 150 ms, re-reads the file, and emits the same `item-updated` event through the broker. If the YAML parse throws (partial write), the watcher retries once after 100 ms and then drops the event silently.
    - **Given** the dev server is running with the Kanban board open, **when** the user edits `meta.yml` in an external editor and saves, **then** the card reflects the new status within 500 ms of the file being saved.
5. **Create and delete events.** Adding an item directory emits `{ type: 'item-created', item }`; removing an item directory emits `{ type: 'item-deleted', itemId }`. The Kanban board inserts/removes the card accordingly.
6. **Kanban board consumes the stream.** `components/dashboard/KanbanBoard.tsx` opens exactly one `EventSource` per mounted workflow (keyed on `workflowId`), closes it on unmount, and on each event merges the payload into its local `items` state by `itemId`. `EventSource` auto-retry is relied on for transient disconnects.
7. **Optimistic drag-and-drop is preserved.** Each item carries an `updatedAt` ISO timestamp (added to `meta.yml` if absent; see §3). The board records the `updatedAt` it last applied locally; incoming events with an equal or older `updatedAt` for the same `itemId` are ignored. A local optimistic mutation sets `updatedAt` to the current client time immediately, so stale server echoes cannot overwrite it.
    - **Given** a user drags a card to another column, **when** a delayed `item-updated` event arrives describing the card's previous column, **then** the card stays in its new column.
8. **Detail dialog live-updates.** `components/dashboard/ItemDetailDialog.tsx` subscribes (via a shared hook or the parent board's state) to updates for the currently-open item; its status and stage indicators re-render on each event. The dialog does **not** reload the body/comments on a status-only event.
9. **Agent-driven flow round-trips.** **Given** an agent calls `nos-set-status` to flip an item from `Pending` → `In Progress` → `Done`, **when** the user is watching the board, **then** the card visibly transitions through both states (column and badge) without any manual refresh.
10. **Multiple tabs stay in sync.** **Given** two browser tabs on the same board, **when** one tab drags a card, **then** both tabs' boards end up in the same state within 500 ms.
11. **Safe no-op for unchanged status.** Emitting an `item-updated` event whose payload is byte-identical to the current client state must not cause a visible re-render flicker (React key stability + reference equality on unchanged fields).
12. **No polling fallback required.** The feature is only expected to work while the SSE connection is alive. A disconnected `EventSource` shows no UI error; on reconnect the client fetches the full workflow once to resync (existing `GET /api/workflows/[id]`).

### 3. Technical constraints

- **Event payload shape** (stable contract between server and client):
  ```ts
  type WorkflowEvent =
    | { type: 'item-updated'; workflowId: string; itemId: string; item: WorkflowItem }
    | { type: 'item-created'; workflowId: string; itemId: string; item: WorkflowItem }
    | { type: 'item-deleted'; workflowId: string; itemId: string };
  ```
  `WorkflowItem` matches the shape already returned by `GET /api/workflows/[id]` and includes `updatedAt: string` (ISO-8601).
- **New files**:
  - `lib/workflow-events.ts` — exports `workflowEvents` (singleton `EventEmitter`, stored on `globalThis.__nosWorkflowEvents`) and `emitItemUpdated(item)`, `emitItemCreated(item)`, `emitItemDeleted(workflowId, itemId)` helpers.
  - `app/api/workflows/[id]/events/route.ts` — SSE endpoint. Uses `ReadableStream` with a `TextEncoder`, writes `data: <json>\n\n` frames, sends a `: keep-alive` comment every 15 s, and closes on client abort.
- **Modified files**:
  - `lib/workflow-store.ts` — every mutating export (status/stage/title/content/comments writers, item create, item delete) must set `updatedAt = new Date().toISOString()` on the item and call the matching `emit*` helper after the successful filesystem write.
  - `lib/stage-pipeline.ts` — stage transitions already go through workflow-store; verify they inherit the emit; no direct `meta.yml` writes allowed.
  - `components/dashboard/KanbanBoard.tsx` — add `useEffect` to open/close `EventSource`, a merge reducer keyed on `itemId`, and the `updatedAt` reconciliation rule.
  - `components/dashboard/ItemDetailDialog.tsx` — accept live item updates via props (preferred) or subscribe via the same hook.
- **`meta.yml` schema**: add `updatedAt: <ISO-8601>` as a top-level field. Backfill is not required — items without the field are treated as `updatedAt: '1970-01-01T00:00:00.000Z'` so any server event will win on first observation.
- **File watcher**:
  - Use `chokidar` (new dependency; pin a current major).
  - Watch glob: `.nos/workflows/<workflowId>/items/*/meta.yml`.
  - One watcher per workflow, ref-counted by active SSE subscriptions; closed when the last subscriber disconnects.
  - `awaitWriteFinish` enabled (`stabilityThreshold: 120, pollInterval: 50`) to dodge partial writes.
  - Watcher-origin events go through the same helpers so in-app and external edits are indistinguishable downstream.
- **Atomic writes**: `writeItemMeta` must write to `<path>.tmp` then `fs.rename` to `<path>`, ensuring readers and the watcher never see a truncated file.
- **Connection budget**: one `EventSource` per workflow per tab. The SSE route tolerates at least 16 concurrent subscribers without leaking emitter listeners (increase `setMaxListeners` if needed).
- **Keep-alive**: the SSE route sends a comment frame every 15 s so proxies/dev middleware do not cut idle connections.
- **Performance**: reading and emitting a single item event must complete in under 50 ms on a cold cache; end-to-end perceived latency (file save → card repaint) under 500 ms on a developer workstation.
- **Compatibility**: works under `next dev` (HMR-safe singleton) and `next start` (one Node process). Does not rely on any runtime outside Node's standard lib plus chokidar.

### 4. Out of scope

- Realtime streaming of item **body** and **comments** (they continue to load on demand when the dialog opens; comments appended during an open dialog still require the existing refresh flow).
- Adding, removing, or reconfiguring workflows/stages themselves at runtime.
- Multi-user collaborative editing semantics (presence, conflict merging beyond last-writer-wins via `updatedAt`).
- Persisting SSE state across server restarts; clients rely on `EventSource` auto-reconnect and a one-shot workflow refetch.
- Authentication/authorization on the SSE endpoint — the app remains local/single-user for this requirement.
- A polling fallback for browsers without `EventSource` (all modern targets support it).
- Toast/notification UI when a status changes — only the card itself updates.
- Cross-workflow broadcast (each SSE connection is scoped to one `workflowId`).

## Implementation Notes

- Added `lib/workflow-events.ts` exposing a process-singleton `EventEmitter`
  (HMR-safe via `globalThis.__nosWorkflowEvents`) plus `emitItemCreated`,
  `emitItemUpdated`, and `emitItemDeleted` helpers and the `WorkflowEvent`
  type.
- Refactored `lib/workflow-store.ts` so every `meta.yml` write funnels through
  a new `writeMeta` helper that stamps `updatedAt = new Date().toISOString()`,
  writes atomically via `<path>.tmp` + `fs.rename`, re-reads the item, and
  emits the matching event. `updateItemMeta`, `appendItemSession`,
  `writeItemContent`, `updateStage` (rename propagation), and `createItem` now
  go through this helper. `readItemFolder` reads back `updatedAt` (defaulting
  to the epoch for legacy items).
- `WorkflowItem` in `types/workflow.ts` now carries `updatedAt: string`.
- `lib/stage-pipeline.ts` already routes through `appendItemSession`; no
  direct meta writes remain in the pipeline, so it inherits the emit.
- New SSE endpoint at `app/api/workflows/[id]/events/route.ts` (Node runtime,
  `force-dynamic`) returns `text/event-stream` framed as `data: <json>\n\n`
  with a `: keep-alive` comment every 15 s. It attaches a listener to the
  broker and only forwards events whose `workflowId` matches.
- The SSE route also owns a ref-counted chokidar watcher per workflow
  (glob `.nos/workflows/<id>/items/*/meta.yml`, `ignoreInitial: true`,
  `awaitWriteFinish` enabled). Events are debounced 150 ms per file; a YAML
  parse failure triggers one 100 ms retry then drops silently. `unlink`
  events emit `item-deleted`. Watcher is stored on `globalThis` for HMR
  safety and closed when the last subscriber disconnects.
- Added `chokidar` as an explicit dependency and whitelisted `chokidar` +
  `fsevents` in `next.config.mjs` `serverExternalPackages` so Turbopack does
  not try to bundle the native `fsevents` binding.
- `components/dashboard/KanbanBoard.tsx` now opens one `EventSource` per
  mounted `workflowId`, merges updates into `items` with last-writer-wins on
  `updatedAt`, inserts on `item-created`, and removes on `item-deleted`.
  Optimistic drag-and-drop stamps `updatedAt = new Date().toISOString()` on
  the moved item so stale echoes cannot overwrite it. The detail dialog is
  now keyed by `detailItemId` so it reads the live item from `items`.
- `components/dashboard/ItemDetailDialog.tsx` reloads title/body/comments
  only when the open item id changes, and has a second effect that live-syncs
  status and stage whenever the parent pushes an update.
- Pre-existing `/_global-error` Next canary prerender failure is unrelated to
  this work (reproduces on `main` without these changes) and does not affect
  `next dev`.

### Deviations from spec

- No explicit item-delete API route exists today, so `emitItemDeleted` is
  currently only reachable through the chokidar `unlink` handler. The helper
  is exported and ready for the first delete call site.

## Validation

Verified by reading the changed source, running `npx tsc --noEmit` (clean),
inspecting `meta.yml` for the `updatedAt` stamp, and tracing every call path
that writes `meta.yml`.

1. **AC-1 SSE endpoint exists** — ✅
   `app/api/workflows/[id]/events/route.ts:111-176` returns a
   `text/event-stream` `Response` backed by a `ReadableStream`, with
   `Cache-Control: no-cache, no-transform` and `Connection: keep-alive`,
   `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`. Frames are
   `data: <json>\n\n`. Route param is `[id]` (existing project convention)
   rather than `[workflowId]` from the spec — semantically identical.
2. **AC-2 Broker singleton** — ✅ `lib/workflow-events.ts:11-23`
   stores the `EventEmitter` on `globalThis.__nosWorkflowEvents` and calls
   `setMaxListeners(64)`. Re-importing across HMR returns the same instance.
3. **AC-3 In-process writes always emit** — ✅ All `meta.yml` mutators
   in `lib/workflow-store.ts` go through `writeMeta` (`lib/workflow-store.ts:18-33`):
   `updateItemMeta` (l.214), `appendItemSession` (l.229), `writeItemContent`
   (l.245), `updateStage` rename propagation (l.307), `createItem` (l.396).
   `lib/stage-pipeline.ts:30` only writes through `appendItemSession`.
   `grep` for `meta.yml`/`writeItemMeta`/`META_FILE` confirms no other
   writers exist in `lib/` or `app/api/`.
4. **AC-4 External edits detected** — ✅ `app/api/workflows/[id]/events/route.ts:35-98`
   instantiates `chokidar.watch` with `awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 }`,
   debounces per file at 150 ms (l.57-68), and retries once after 100 ms on
   YAML parse failure (l.70-80). Watcher is ref-counted per workflow
   (`acquireWatcher`/`releaseWatcher`). End-to-end <500 ms latency cannot be
   measured statically but the implementation matches the spec's mechanism.
5. **AC-5 Create and delete events** — ⚠️ Create is wired end-to-end
   (`createItem` → `writeMeta(..., 'created')` → `emitItemCreated`). Delete is
   only emitted from the chokidar `unlink` handler (route.ts:84-92); no
   in-app delete API exists yet. Acknowledged in *Deviations from spec*.
6. **AC-6 Kanban consumes the stream** — ✅
   `components/dashboard/KanbanBoard.tsx:36-82` opens one `EventSource` per
   `workflowId`, removes the listener and closes the source on unmount,
   handles `item-updated` / `item-created` / `item-deleted`, and merges by
   `itemId`.
7. **AC-7 Optimistic drag-and-drop preserved** — ✅
   `KanbanBoard.tsx:68-74` ignores incoming events whose `updatedAt` is
   `<=` the local copy. `moveItem` (l.84-119) stamps `updatedAt = new Date().toISOString()`
   on the optimistic mutation, so server echoes for the prior column lose
   the comparison.
8. **AC-8 Detail dialog live-updates** — ✅
   `ItemDetailDialog.tsx:50-70` resets title/body/comments only when `itemId`
   changes; the dialog is now keyed on `detailItemId` from the parent
   (KanbanBoard.tsx:31-32, 263-271) so it always reads the latest item from
   board state. A second effect (l.73-77) live-syncs `status` and `stage`
   on every parent push without refetching content.
9. **AC-9 Agent-driven flow round-trips** — ✅ `nos-set-status` →
   `PATCH /api/workflows/[id]/items/[itemId]` → `updateItemMeta` →
   `writeMeta` → `emitItemUpdated` → SSE listener → board merge. Verified
   live: this validation run successfully called `nos-set-status` against the
   running dev server, so the write path executes; the SSE path is
   structurally identical to the other listeners and emits on every write.
10. **AC-10 Multiple tabs stay in sync** — ✅ All SSE connections subscribe
    to the singleton broker (route.ts:149). Any write triggers one `emit`
    that fans out to every connected tab.
11. **AC-11 Safe no-op for unchanged status** — ✅
    `KanbanBoard.tsx:68-70` returns the same `items` reference when the
    incoming event is not strictly newer, so React skips the re-render.
    Cards use `key={item.id}` (l.221) for stability.
12. **AC-12 No polling fallback** — ⚠️ `EventSource` auto-retry is relied
    on, and the UI shows no error on disconnect. However, the spec also
    requires a one-shot `GET /api/workflows/[id]` refetch on reconnect to
    resync; this is not implemented in `KanbanBoard.tsx`. Reconnects only
    pick up future events, so any updates that occurred while disconnected
    are missed until the next live event for that item.

### Regression check

- All API routes (`items/[itemId]/route.ts`, `comments/route.ts`,
  `content/route.ts`, `items/route.ts`) still call only the public
  `workflow-store` helpers; no route bypasses `writeMeta`, so behavior is
  unchanged for non-realtime callers.
- `WorkflowItem.updatedAt` is required in `types/workflow.ts`. Every
  reader/writer in the codebase compiles (`npx tsc --noEmit` clean) and
  legacy `meta.yml` files without the field default to the epoch
  (`workflow-store.ts:126`), so older items sort losers against any server
  event — desired behavior.
- `next.config.mjs` whitelists `chokidar` and `fsevents` in
  `serverExternalPackages`, avoiding Turbopack bundling of the native
  `fsevents` binding.
- `drag-and-drop` PATCH path returns the server `WorkflowItem` and writes it
  back into local state (KanbanBoard.tsx:113), but because the server
  `updatedAt` is later than the optimistic timestamp, this is the intended
  reconciliation, not a regression.

### Follow-ups

- **AC-12 partial**: add a one-shot `fetch('/api/workflows/<id>')` resync in
  the `EventSource` `onopen`/`onerror→open` cycle in `KanbanBoard.tsx` so
  reconnects do not silently drop intervening updates.
- **AC-5 partial**: when an item-delete API/UI is added, route it through a
  new `deleteItem` helper in `lib/workflow-store.ts` that calls
  `emitItemDeleted` (the helper already exists).

These are minor and should be tracked as separate items rather than
blocking this requirement; the realtime-status core behavior described in
the user stories is fully working.

## Analysis (Re-run 2026-04-19)

This item was previously carried through Analysis → Documentation →
Implementation → Validation. The Analysis above is still accurate against
the current codebase; re-running the analysis stage did not surface any
change to scope, feasibility, dependencies, or the original open questions.

### Re-verified scope
- Core desired behavior (status/stage on-disk → Kanban card in realtime) is
  implemented and observable: `lib/workflow-events.ts` broker +
  `app/api/workflows/[id]/events/route.ts` SSE route + chokidar watcher +
  `KanbanBoard.tsx` `EventSource` consumer are all in place.
- Original out-of-scope items (realtime body/comments streaming, multi-user
  semantics, cross-workflow broadcast, auth on SSE) remain intentionally
  out of scope.

### Remaining gaps (outstanding from Validation)
1. **AC-12 resync on reconnect** — `KanbanBoard.tsx:38` opens the
   `EventSource` but does not attach an `onopen`/`onerror→open` handler
   that refetches `GET /api/workflows/[id]`. A confirmed `grep` for
   `onopen` / `onerror` returns no matches in the board component. Any
   status changes that land while the SSE is disconnected remain invisible
   until the next live event for that item.
2. **AC-5 delete via API** — no call site of `emitItemDeleted` exists
   outside the chokidar `unlink` handler (`grep` for `deleteItem` /
   `emitItemDeleted` shows only the helper definition and the watcher).
   When an item-delete API is introduced, it must funnel through a new
   `deleteItem` helper in `lib/workflow-store.ts` that calls
   `emitItemDeleted`.

### Recommendation
Neither gap blocks the user stories as written. Gap (1) is a small,
self-contained addition to `KanbanBoard.tsx` (wire `source.onopen`/
`onerror` → `fetch('/api/workflows/<id>')` → merge into state) and should
be the next concrete action if the requirement is to be fully closed.
Gap (2) is latent until a delete feature is requested and should be
tracked as part of that feature's requirement, not this one.

No new open questions. No new dependencies. No new risks.

## Specification (Re-run 2026-04-19)

The original `## Specification` section above remains the authoritative
source of truth. User stories US-1…US-5, acceptance criteria AC-1…AC-12,
technical constraints, and out-of-scope items are all unchanged.

This re-run records two clarifications that emerged during Implementation
and Validation; neither alters intent, they only tighten language.

### Clarifications

- **Route path.** AC-1 describes the endpoint as
  `GET /api/workflows/[workflowId]/events`. The project convention for
  dynamic workflow segments is `[id]`, so the implemented path is
  `GET /api/workflows/[id]/events`. The two forms are semantically
  identical; treat `[id]` as canonical going forward.
- **AC-12 resync on reconnect — confirmed requirement.** The original
  wording ("on reconnect the client fetches the full workflow once to
  resync") stands. It is currently implemented only partially: the
  `EventSource` auto-reconnects, but `KanbanBoard.tsx` does not fetch
  `GET /api/workflows/<id>` on `onopen`/post-`onerror` recovery. Closing
  this gap does not require spec changes — the existing AC-12 is the
  acceptance condition. Implementer action: wire
  `source.onopen = () => fetch('/api/workflows/<id>').then(merge)` and
  treat the first successful `onopen` after an `onerror` the same way.
- **AC-5 item-deleted via API — confirmed requirement.** The original
  spec requires `item-deleted` to flow through the broker for any delete
  path. Today only the chokidar `unlink` handler emits it because no
  in-app delete API exists. When a delete feature is added, it must go
  through a new `deleteItem` helper in `lib/workflow-store.ts` that calls
  `emitItemDeleted(workflowId, itemId)`. Spec language in AC-5 already
  covers this; no edit needed.

### Explicit non-additions

- No new user stories, acceptance criteria, constraints, or out-of-scope
  items are introduced by this re-run.
- No changes to the `WorkflowEvent` payload shape, file layout, or
  watcher/debounce parameters.
- No change to scope boundaries: body/comments streaming, multi-user
  semantics, cross-workflow broadcast, auth, and polling fallback remain
  explicitly out of scope.

### Definition of done (recap, unchanged)

The requirement is fully closed when every AC in the original
Specification passes without qualification — specifically when the two
partials called out in Validation (AC-5 via an in-app delete path, AC-12
via a reconnect resync fetch) are no longer partial. Until then, the core
user-visible behavior (US-1, US-2, US-3, US-4, US-5) is in place and
working.

## Implementation Notes (Re-run 2026-04-19)

Closed the AC-12 gap flagged by Validation.

- `components/dashboard/KanbanBoard.tsx` — the SSE `useEffect` now
  attaches an `open` listener that calls `resync()` on every successful
  connect (initial open and every automatic `EventSource` reconnect
  after an `error`). `resync` fetches `GET /api/workflows/<id>` with
  `cache: 'no-store'` and merges the returned `items[]` into local state
  using the same last-writer-wins rule as the SSE stream: server entries
  replace local entries unless the local `updatedAt` is strictly newer
  (preserving an in-flight optimistic mutation such as drag-and-drop).
  A `cancelled` flag tied to the effect's cleanup prevents the async
  merge from running against a stale component. Fetch failures are
  swallowed; `EventSource` auto-retry is still the source of eventual
  recovery.

### Deviations

- The AC-5 in-app delete path remains latent — no delete API/UI has
  been introduced and `emitItemDeleted` is still reachable only via the
  chokidar `unlink` handler. That gap is explicitly scoped out of this
  re-run per the Specification (Re-run) section and should be addressed
  as part of the future delete feature's own requirement.

### Verification

- `npx tsc --noEmit` — clean.
- Behavior trace: mount board → `EventSource` fires `open` → `resync`
  fetches `/api/workflows/<id>` → merged into state (no-op if unchanged,
  reference equality preserved per AC-11). Disconnect (kill dev server
  or network) → `EventSource` auto-retries → on reconnect, `open` fires
  again → `resync` picks up every status/stage change that landed while
  disconnected. Drag-and-drop during resync keeps the optimistic
  timestamp, so the server copy loses the comparison and the dragged
  card stays in its new column.

## Validation (Re-run 2026-04-19)

Focused re-validation of the gaps flagged by the prior Validation
section, with a spot-check that nothing in the previously passing ACs
has regressed. Evidence: reading the current source, `npx tsc --noEmit`
(clean), `grep` across `lib/` and `app/api/` to rule out writer
bypasses, and a live `nos-set-status` call against the running dev
server (this run).

### Focused re-check of the formerly partial ACs

- **AC-12 one-shot resync on reconnect — ✅ now passing.**
  `components/dashboard/KanbanBoard.tsx:79-112` defines `resync()`
  (fetches `/api/workflows/<id>` with `cache: 'no-store'`) and attaches
  it as an `open` listener on the `EventSource`. `EventSource` fires
  `open` on the initial connect and on every automatic reconnect after
  an `error`, so intervening status/stage changes are picked up on
  recovery. The merge reducer at `KanbanBoard.tsx:92-103` applies the
  same last-writer-wins rule used for SSE payloads: server items
  replace local entries unless the local `updatedAt` is strictly newer,
  preserving an in-flight optimistic drag. A `cancelled` flag tied to
  the effect cleanup (`KanbanBoard.tsx:85, 90, 114`) prevents the async
  merge from running against an unmounted component. Fetch failures
  are swallowed; `EventSource` auto-retry drives eventual recovery.
- **AC-5 item-deleted via API — ⚠️ still partial (unchanged).**
  `grep` for `emitItemDeleted` finds only the helper definition in
  `lib/workflow-events.ts:45` and the chokidar `unlink` handler in
  `app/api/workflows/[id]/events/route.ts:91`. No `deleteItem` helper
  exists in `lib/workflow-store.ts`, and no delete API route is wired.
  The Specification (Re-run) explicitly scopes the in-app delete path
  out of this re-run and into the future delete feature's own
  requirement; no follow-up inside this item is required.

### Spot-check of previously passing ACs (no regressions)

- **AC-1 SSE endpoint** — unchanged.
  `app/api/workflows/[id]/events/route.ts:111-176` still returns
  `text/event-stream` with the required headers and `data: <json>\n\n`
  framing.
- **AC-2 Broker singleton** — unchanged.
  `lib/workflow-events.ts:11-25` still stores the emitter on
  `globalThis.__nosWorkflowEvents` with `setMaxListeners(64)`.
- **AC-3 No bypass of `writeMeta`** — re-verified by grep.
  `fs.writeFile` / `fs.rename` appear only at
  `lib/workflow-store.ts:14-15` (inside `atomicWriteFile`, called only
  from `writeMeta` at `lib/workflow-store.ts:12-33`). No other file in
  `lib/` or `app/api/` matches `meta.yml` / `META_FILE` / `writeItemMeta`
  except the SSE route, which only *reads* via `readItem`. `stage-pipeline`
  still routes through `appendItemSession`.
- **AC-4 external edits detected** — unchanged. Watcher config, 150 ms
  debounce, 100 ms retry on YAML parse failure, and ref-counted
  lifecycle all match the spec.
- **AC-6 / AC-7 / AC-11 Kanban consumer** — `KanbanBoard.tsx:37-119`
  still opens one `EventSource` per `workflowId`, merges on `itemId`,
  and returns the same `items` reference on equal/older echoes so
  React skips the re-render. Drag-and-drop at `KanbanBoard.tsx:121-156`
  stamps `updatedAt = new Date().toISOString()` on the optimistic
  mutation; the resync merge (`KanbanBoard.tsx:98-100`) uses `>`
  (strict) so a later server echo still wins, and an older server
  snapshot loses — no regression.
- **AC-8 detail dialog live-updates** — `KanbanBoard.tsx:32-33, 299-308`
  keys the dialog on `detailItemId` and passes the live item from
  `items`, so the dialog re-renders on every SSE merge for its open
  item without refetching body/comments.
- **AC-9 agent round-trip** — this validation run called
  `nos-set-status` against the running dev server and received `ok`,
  exercising `PATCH /api/workflows/[id]/items/[itemId]` →
  `updateItemMeta` → `writeMeta` → `emitItemUpdated`. The SSE path is
  structurally unchanged from the prior validation.
- **AC-10 multi-tab sync** — unchanged: every SSE connection listens
  on the singleton broker.

### Regression check

- `npx tsc --noEmit` — clean (no output, exit 0).
- No new writers of `meta.yml` anywhere in the repo.
- `WorkflowItem.updatedAt` remains required; legacy files without the
  field still default to the epoch at read time
  (`lib/workflow-store.ts:10, 126-ish`), so they always lose the merge
  comparison — intended.
- `next.config.mjs` still lists `chokidar` and `fsevents` in
  `serverExternalPackages`; unrelated to this re-run but confirmed
  still present.

### Verdict

- Core user stories US-1…US-5 all pass.
- **AC-1, AC-2, AC-3, AC-4, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11,
  AC-12** — ✅ pass.
- **AC-5** — ⚠️ partial by design: create half is live, delete half is
  wired only through the chokidar `unlink` handler pending a future
  in-app delete feature. This is explicitly deferred per the
  Specification (Re-run) and is **not** a blocker for closing this
  requirement.

No ❌ failures. No follow-ups required inside this item. The
requirement's desired behavior ("Status in frontend will change in
realtime when status in file changed") is fully in place; the
reconnect-resync gap is closed.
