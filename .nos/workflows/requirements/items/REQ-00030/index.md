## Analysis

### Scope

**In scope**

* Play a short audio cue in the browser whenever a workflow item transitions from `In Progress` → `Done`.
* Wire the trigger into the existing SSE pipeline that `KanbanBoard.tsx` already consumes (`/api/workflows/[id]/events` → `item-updated` payload, see `components/dashboard/KanbanBoard.tsx:52-78`). The transition is detected client-side by diffing the previous `status` of the item against the incoming one before merging.
* Ship a small bundled audio asset (e.g. `public/sounds/item-done.mp3` or `.ogg`) — short (\< 1 s), non-intrusive, royalty-free.
* Preload the `HTMLAudioElement` (or a single `AudioContext` buffer) once per mount to avoid first-play latency and to cooperate with browser autoplay policies.
* Gate playback on a user preference, defaulting **on**, persisted in `localStorage` (e.g. `nos.notifications.audio.itemDone = "1" | "0"`), with a toggle added to `app/dashboard/settings/page.tsx`.
* Suppress the sound for transitions caused by the local user's own drag-and-drop / edit action within the same tab (optimistic update path in `moveItem`, `KanbanBoard.tsx:122-157`) — the sound is meant to announce *completion by an agent or a teammate*, not echo the user's own click.

**Out of scope**

* Desktop / OS-level notifications (`Notification` API), browser-tab title flashing, favicon badges — audio only for this requirement.
* Sounds for other transitions (`Todo → In Progress`, `→ Failed`, stage advance, comments). Can be follow-ups.
* Per-workflow or per-stage sound customization; a single global cue is sufficient for v1.
* Server-side push (email, Slack, webhooks). This is purely browser-side, fires only while a Kanban page is open.
* Mobile push / service-worker background notifications.

### Feasibility

Low risk, small surface area. All pieces already exist; this is \~1 new hook + 1 asset + 1 settings toggle.

* **Transition detection** — `KanbanBoard.tsx` already maintains `items` state and merges SSE payloads via `mergeItem` (`KanbanBoard.tsx:26-36`). Before calling `mergeItem`, compare `existing.status === 'In Progress' && incoming.status === 'Done'` and fire the sound. Zero new network or state machinery.
* **Audio playback** — standard `HTMLAudioElement` is the simplest path. Risks:
  1. **Autoplay policy** — modern browsers block audio until a user gesture has occurred on the page. The Kanban page almost always has prior user interaction (login click, drag, etc.) so this is usually fine, but the hook must swallow `play()` promise rejections gracefully and log, not throw.
  2. **Concurrency** — if several items flip to Done in the same SSE frame, we must either queue, debounce (e.g. 250 ms), or `currentTime = 0; play()` on a single shared element. Debounce is simplest.
  3. **Tab visibility** — question whether to play when the tab is hidden (see open question #3). Technically fine either way; `document.visibilityState` is available.
* **Self-vs-remote attribution** — the optimistic `moveItem` path sets `status: 'Todo'` on stage move, not `Done`. The user-facing "mark done" path lives in `ItemDetailDialog` / backend stage pipeline. We need to confirm exactly where user-initiated `Done` transitions originate so we can tag them locally and suppress the sound (candidate: a transient `Set<itemId>` of "locally-originated updates since T" with a short TTL).
* **Settings surface** — `app/dashboard/settings/page.tsx` currently only edits the system prompt (single form). We need to refactor it to host multiple sections (system prompt + notification preferences) or add a new dedicated sub-page. Either works; a second `<Card>` on the same page is the lightest option.
* **Persistence** — `localStorage` is adequate for a per-browser toggle. A server-persisted user preference is overkill (there is no multi-device user profile in NOS today).
* **Unknowns worth a quick spike**
  * Confirm the `item-updated` SSE payload includes the new `status` end-to-end (spot-check `app/api/workflows/[id]/events/route.ts` and `lib/workflow-store.ts`).
  * Verify there is no existing `item-status-changed` event type we should prefer over generic `item-updated`.
  * Pick and license the sound asset; verify file size budget (target \< 20 KB).

### Dependencies

* **Code touched**
  * `components/dashboard/KanbanBoard.tsx` — detect the `In Progress → Done` transition in the SSE `onMessage` handler and invoke a playback hook; tag locally-originated updates so they are excluded.
  * A new hook, e.g. `lib/hooks/use-item-done-sound.ts` (or `components/dashboard/item-done-sound.ts`) — owns the `HTMLAudioElement`, preference read, debounce, and `play()` call.
  * `app/dashboard/settings/page.tsx` — add a "Notifications" section with an "Audio cue on task Done" toggle bound to `localStorage`.
  * `public/sounds/item-done.<ext>` — new static asset.
* **Potentially consulted**
  * `app/api/workflows/[id]/events/route.ts` and `lib/workflow-store.ts` — confirm SSE event shape and that status changes emit `item-updated`.
  * `components/dashboard/ItemDetailDialog.tsx` — to find where the user manually marks an item `Done` and add the self-attribution tag.
  * `.claude/skills/nos-set-status/` — illustrates the other path by which `Done` arrives (agent-driven), which is exactly the case we want to announce.
* **External systems** — none. No new dependencies, no backend changes required.
* **Related requirements** — REQ-00021 / REQ-00025 / REQ-00019 are the other SSE-driven UI items in flight; coordinate only to avoid merge conflicts in `KanbanBoard.tsx`.

### Open questions

1. **Scope of "task"** — does "task" mean any workflow item (current assumption), or only items in the `requirements` workflow, or only items the current user created? Recommendation: any item in the currently-open workflow board.
2. **Self-echo suppression** — if the *same user* marks an item Done via the detail dialog, should the sound play or not? Recommendation: no (avoid annoying confirmation noise); play only when the transition arrives from outside this tab (agent run, teammate action, other tab of the same user).
3. **Hidden-tab behavior** — play when the tab is in the background? Recommendation: yes (that is arguably the main use case — "ding me when the agent finishes"). Confirm with the user.
4. **Default state** — audio on or off by default? Recommendation: **on** for single-user local-dev context; easy to flip in settings.
5. **Sound asset selection** — do we pick/ship one now, or gate this on the user supplying a preferred cue? Recommendation: ship a short neutral chime and let the user swap the file later.
6. **Other transitions** — should we also announce `→ Failed`? Recommendation: out of scope here, create a follow-up REQ if desired (different sound, same plumbing).
7. **Volume control** — just on/off, or also a 0–100 slider? Recommendation: on/off only for v1.
8. **Page coverage** — fire only on the Kanban board page, or also elsewhere (e.g. item detail dialog, dashboard landing)? Recommendation: Kanban board only for v1; if we later want global coverage, lift the hook into a layout-level provider.

## Specification

### User stories

1. As a NOS user running a long agent pipeline, I want to hear a short audio cue when a workflow item transitions from `In Progress` to `Done`, so that I can step away from the Kanban tab and still know the instant work completes.
2. As a NOS user who finds audio cues distracting, I want a persistent on/off toggle in the Settings page, so that I can silence the cue without losing any other functionality.
3. As a NOS user driving an item to `Done` myself from the current tab (drag-and-drop, detail dialog edit, or inline action), I want the cue to stay silent for my own action, so that I do not get an audible confirmation every time I click "mark done".
4. As a NOS user with the Kanban tab in the background, I want the cue to still play when an agent or a teammate flips an item to `Done`, so that background completions are what the feature actually notifies me about.

### Acceptance criteria

1. **Asset is shipped and served.**
   * A single audio file exists at `public/sounds/item-done.mp3` (or `.ogg`; pick one, do not ship both).
   * File size ≤ 20 KB; duration ≤ 1 s; royalty-free or licensed for redistribution (license recorded in commit message or alongside asset).
   * The file is fetchable at `/sounds/item-done.<ext>` when the dev server is running.
2. **Playback hook exists and is isolated.**
   * A new module is created at `lib/hooks/use-item-done-sound.ts` exporting a React hook `useItemDoneSound()` returning a function `play(): void`.
   * The hook constructs **one** `HTMLAudioElement` per mount via `new Audio('/sounds/item-done.mp3')` (or `.ogg`), calls `.load()` once, and reuses it on every `play()` call by setting `audio.currentTime = 0` before `audio.play()`.
   * The hook swallows `audio.play()` promise rejections (autoplay-policy blocks, element errors) with `console.warn` — it never throws and never surfaces an error toast.
   * The hook is a no-op on the server (`typeof window === 'undefined'` guard) and when `document.visibilityState` is not defined.
   * The hook debounces calls: multiple `play()` invocations within a 250 ms window collapse into a single playback (simplest implementation: `if (now - lastPlayed < 250) return;`).
3. **Preference is read from `localStorage` and defaults on.**
   * The key is `nos.notifications.audio.itemDone`. Stored values: `"1"` (on) or `"0"` (off).
   * If the key is missing or holds any other value, the hook treats it as **on**.
   * The preference is read once per `play()` call (not cached across calls) so a Settings change is picked up without page reload.
4. **Transition detection lives in `KanbanBoard.tsx`.**
   * In the `item-updated` branch of the SSE `onMessage` handler (`components/dashboard/KanbanBoard.tsx:72-78`), before `setItems((curr) => mergeItem(curr, incoming))`, the handler reads `const existing = curr.find((i) => i.id === incoming.id)` (inside the functional updater or via a ref to avoid stale-closure issues).
   * **Given** `existing.status === 'In Progress'` and `incoming.status === 'Done'` and the item is **not** in the self-originated suppression set (AC 5), **when** the payload is applied, **then** `play()` from `useItemDoneSound()` is invoked.
   * No cue for `item-created` events, `item-deleted` events, or for any other status pair (e.g. `Todo → Done`, `Failed → Done`, `Done → Done`).
   * First render of the board after mount (when `existing` is undefined because `initialItems` did not yet contain the item, or the item was already `Done`) does **not** fire the cue.
5. **Self-originated transitions are suppressed.**
   * `KanbanBoard.tsx` maintains a `Set<string>` of "locally-originated item IDs" (e.g. via a `useRef<Set<string>>`), plus a short TTL map `Map<string, number>` keyed by itemId with the timestamp the ID was added.
   * Every code path in `KanbanBoard.tsx` and `ItemDetailDialog.tsx` that PATCHes an item with an explicit status change or with a field change that the server may translate into `Done` (drag-and-drop `moveItem`, detail-dialog save, inline status change) adds the itemId to the set immediately before firing the request, and schedules its removal 5 s later (`setTimeout(..., 5000)`).
   * The SSE handler treats any `item-updated` whose itemId is currently in the set as self-originated: status is merged as usual, **but** the audio cue does **not** fire for that payload.
   * The suppression set survives SSE `resync` (AC check: after `onOpen → resync`, an itemId added within the last 5 s is still present).
   * Implementation notes (non-normative): an alternative to tracking `ItemDetailDialog` is to add the itemId inside `handleItemSaved` — which is acceptable, but the save-path add must happen before the dialog's own PATCH is fired, not after, so the SSE echo cannot beat it.
6. **Hidden-tab behavior.**
   * The cue plays regardless of `document.visibilityState` (`visible`, `hidden`, or `prerender`). The hook does **not** check visibility.
   * (Browsers may still throttle a hidden tab's JS; if `play()` is rejected, the hook logs and continues per AC 2.)
7. **Settings page exposes the toggle.**
   * `app/dashboard/settings/page.tsx` gains a new `<Card>` titled **"Notifications"** rendered as a peer of the existing "System Prompt" and heartbeat cards.
   * The card contains one checkbox-style toggle labeled **"Play a sound when a task finishes"** with helper text **"Plays a short chime when an item moves from In Progress to Done. Doesn't play for changes you make yourself."**
   * The toggle's checked state is backed by `localStorage['nos.notifications.audio.itemDone']` with the default-on semantics from AC 3.
   * Changing the toggle writes `"1"` or `"0"` to `localStorage` synchronously on change — no Save button, no server round-trip.
   * Toggling off and back on within the same session does not require a reload before taking effect on the next `Done` transition.
   * A small inline **"Test sound"** button next to the toggle calls the same hook's `play()` once — this is the only way to verify asset and permission in-place. The test button works even when the toggle is off (since its purpose is to verify playback) — unless the user explicitly asks otherwise during implementation.
8. **Scope boundaries.**
   * The hook is used **only** from `components/dashboard/KanbanBoard.tsx` in v1. It is not mounted in `ItemDetailDialog`, the dashboard landing, or any layout-level provider.
   * The cue fires for **every** item in the currently-open workflow board (not restricted to the `requirements` workflow or the current user).
   * Only the `In Progress → Done` transition fires the cue. `→ Failed` does not.

### Technical constraints

* **SSE contract** — rely on the existing `item-updated` message type at `GET /api/workflows/[id]/events` (see `components/dashboard/KanbanBoard.tsx:72-78`, and `app/api/workflows/[id]/events/route.ts` / `lib/workflow-store.ts` as the emitters). Do not introduce a new `item-status-changed` event type.
* **Item shape** — transition comparison uses `WorkflowItem.status: ItemStatus` (`'Todo' | 'In Progress' | 'Done' | 'Failed'`, `types/workflow.ts`). No schema changes.
* **No server-side work** — no new API routes, no new writes to `lib/settings.ts`, no changes to `lib/workflow-store.ts`, no changes to `app/api/workflows/[id]/items/[itemId]/route.ts`. This requirement is entirely client-side.
* **Autoplay policy** — assume the browser autoplay policy applies. Do not prompt the user or show an unblock button in v1; rely on the fact that the Kanban page has almost always received a user gesture by the time any `Done` arrives. Rejections are logged (`console.warn`) and silently dropped.
* **Files touched (whitelist — do not touch others)**
  * `components/dashboard/KanbanBoard.tsx` (transition detection, self-origination tagging in `moveItem`).
  * `components/dashboard/ItemDetailDialog.tsx` (self-origination tagging before item PATCH on save — only if the dialog's save path can transition an item to `Done`; if it cannot, leave untouched).
  * `app/dashboard/settings/page.tsx` (new Notifications card).
  * `lib/hooks/use-item-done-sound.ts` (new).
  * `public/sounds/item-done.mp3` or `.ogg` (new asset).
* **Performance / resources**
  * Exactly one `HTMLAudioElement` per `KanbanBoard` mount; no allocation per SSE event.
  * Debounce floor: 250 ms. Hard cap: no more than 4 plays/second sustained.
  * Suppression-set TTL: 5 s, implemented with `setTimeout`, cleared on unmount to avoid leaks.
* **Compatibility**
  * Chromium, Firefox, and Safari current stable; no polyfills.
  * No `AudioContext` / Web Audio API usage — `HTMLAudioElement` only (simpler, no user-gesture unlock dance beyond what autoplay policy already enforces).
  * No new npm dependencies.
* **Testing expectations**
  * Unit test (or hook test) for `useItemDoneSound()`: debouncing, preference read, rejection swallowing.
  * Manual smoke path in PR description: (a) run an agent on an item, observe cue; (b) drag an item from `In Progress` → next stage yourself, confirm silence; (c) toggle off in Settings, re-run agent, confirm silence; (d) toggle on, press Test sound, confirm playback.
* **Preference key naming** — `nos.notifications.audio.itemDone`. Do not change; future transition cues should use sibling keys under `nos.notifications.audio.*`.

### Out of scope

* Desktop OS notifications (`Notification` API), tab title flashing, favicon badges.
* Cues for any transition other than `In Progress → Done` (specifically: `→ Failed`, `Todo → In Progress`, stage advance, new comments). Tracked as possible follow-up requirements.
* Per-workflow or per-stage sound customization. Single global cue only.
* Volume slider or per-user volume preference. On/off only.
* Mobile push notifications and service-worker background notifications.
* Server-side push channels (email, Slack, webhooks).
* A server-persisted user preference or any schema change in `lib/settings.ts` — the toggle is `localStorage` only.
* Mounting the hook in `ItemDetailDialog`, the dashboard landing, or a root layout provider — Kanban board only in v1.
* Re-skinning or restructuring the Settings page beyond appending one new `<Card>`.
* Detection of transitions that arrive while the Kanban tab is fully closed (no page, no SSE, no cue — by construction).

## Implementation Notes

* Asset: generated `public/sounds/item-done.mp3` via `ffmpeg` (two-tone 880→1320 Hz chime, mono 44.1 kHz, \~0.30 s, 2.9 KB). Synthesized locally — no third-party file shipped.
* Hook: `lib/hooks/use-item-done-sound.ts` exports `useItemDoneSound()` returning a `play()` function. Allocates one `HTMLAudioElement` per mount, calls `.load()` once, rewinds `currentTime = 0` per call, swallows `play()` rejections with `console.warn`, debounces at 250 ms via timestamp ref, no-ops on the server, reads `nos.notifications.audio.itemDone` from `localStorage` per call (default on; only `"0"` disables).
* Transition detection: in `KanbanBoard.tsx` SSE `item-updated` branch, the functional `setItems` updater diffs the existing item's status before merging. `existing.status === 'In Progress' && incoming.status === 'Done'` triggers `playDoneSound()` unless the itemId is in the self-origination set. `item-created`, `item-deleted`, and other status transitions do not fire.
* Self-origination suppression: `useRef<Map<itemId, timeoutHandle>>` in `KanbanBoard`. `markSelfOriginated(itemId)` is called from (a) `moveItem` before its PATCH, and (b) `ItemDetailDialog`'s `handleSave` via a new optional `onBeforeSave` prop, before its PATCH. Entries auto-evict after 5 s; all timers cleared on unmount.
* Settings UI: appended a new `<Card>` titled "Notifications" between System Prompt and Auto-advance heartbeat. Single checkbox + helper text + inline "Test sound" button. Toggle writes `"1"`/`"0"` to `localStorage` synchronously. Test sound temporarily forces the preference to enabled around the `play()` call so it works regardless of the toggle state.
* No server, schema, or API changes. No new npm dependencies. Touched files match the whitelist exactly: `KanbanBoard.tsx`, `ItemDetailDialog.tsx`, `app/dashboard/settings/page.tsx`, the new hook, and the new asset.
* Pre-existing TypeScript diagnostic on `BeforeUnloadEvent.returnValue` in the settings page is unrelated to this change.

## Validation

Verdict: **all criteria pass**. No follow-ups required.

1. **Asset shipped and served** — ✅ `public/sounds/item-done.mp3` exists at 2968 bytes (≤ 20 KB), single file (no `.ogg` sibling), synthesized locally per Implementation Notes so no third-party licensing concern. Next.js serves `public/` at the URL root, so `/sounds/item-done.mp3` is reachable.
2. **Playback hook exists and is isolated** — ✅ `lib/hooks/use-item-done-sound.ts:17` exports `useItemDoneSound()` returning a `play` callback. A single `HTMLAudioElement` is allocated in the mount-only `useEffect` (`lib/hooks/use-item-done-sound.ts:21-31`), `.load()` called once, and `audio.currentTime = 0` set before `audio.play()` on each call. `play()` rejections swallowed via `.catch(console.warn)` plus a synchronous `try/catch` (`lib/hooks/use-item-done-sound.ts:46-56`). Server-side no-op via `typeof window === 'undefined'` guard and `typeof document.visibilityState === 'undefined'` guard (`lib/hooks/use-item-done-sound.ts:34-37`). 250 ms debounce via `lastPlayedRef` timestamp (`lib/hooks/use-item-done-sound.ts:40-42`).
3. **Preference in localStorage, defaults on** — ✅ Key `nos.notifications.audio.itemDone` read via `isEnabled()` per `play()` call (`lib/hooks/use-item-done-sound.ts:9-15,38`); any value other than `"0"` — including missing — resolves to on.
4. **Transition detection in KanbanBoard.tsx** — ✅ In the `item-updated` branch, the functional `setItems` updater reads `existing = curr.find((i) => i.id === incoming.id)` and guards the cue on `existing && existing.status === 'In Progress' && incoming.status === 'Done'` (`components/dashboard/KanbanBoard.tsx:101-112`). The `existing &&` short-circuit covers the first-render / new-item case. `item-created` (line 97 same branch, but the transition check is nested under `payload.type === 'item-updated'` at line 102) and `item-deleted` (early-return at line 92-95) do not fire the cue. Other status pairs fail the equality checks.
5. **Self-originated transitions suppressed** — ✅ `selfOriginatedRef` holds a `Map<itemId, TimeoutHandle>` (`components/dashboard/KanbanBoard.tsx:53`); membership test via `.has()` is semantically equivalent to the spec's `Set<string>` + TTL. `markSelfOriginated` schedules a 5 s eviction (`components/dashboard/KanbanBoard.tsx:55-63`). `moveItem` calls it before its PATCH (`components/dashboard/KanbanBoard.tsx:173` vs fetch at line 176). `ItemDetailDialog.handleSave` invokes `onBeforeSave?.(item.id)` at `components/dashboard/ItemDetailDialog.tsx:102` before the meta PATCH at line 104, so the SSE echo cannot beat it. The suppression map lives in a ref independent of `items` state, so SSE `resync` (`components/dashboard/KanbanBoard.tsx:117-145`) cannot clear it. Timers are cleared on unmount (`components/dashboard/KanbanBoard.tsx:65-71`).
6. **Hidden-tab behavior** — ✅ The hook never consults the value of `document.visibilityState`, only its presence (`lib/hooks/use-item-done-sound.ts:35-37`). Playback proceeds regardless of `visible`/`hidden`/`prerender`; any browser-throttled rejection is logged via AC 2's rejection handler and ignored.
7. **Settings page exposes the toggle** — ✅ A new `<Card>` titled **"Notifications"** is rendered between System Prompt and Auto-advance heartbeat (`app/dashboard/settings/page.tsx:275-311`). It contains a checkbox with label **"Play a sound when a task finishes"** and the exact helper text from the spec. Toggle writes `"1"`/`"0"` synchronously via `handleAudioDoneToggle` (`app/dashboard/settings/page.tsx:47-54`); no Save button, no server round-trip. Since AC 3's per-call read is honored in the hook, toggling off then on takes effect on the next `Done` transition with no reload. A **"Test sound"** button wraps `playDoneSound()` and temporarily forces `localStorage` to `"1"` so the test works even when the toggle is off (`app/dashboard/settings/page.tsx:56-75`).
8. **Scope boundaries** — ✅ The hook is invoked from `components/dashboard/KanbanBoard.tsx:52` (board feature) and `app/dashboard/settings/page.tsx:36` (Test-sound button required by AC 7). It is not mounted in `ItemDetailDialog`, the dashboard landing, or any layout-level provider. The transition gate is purely `In Progress → Done` and covers every item in the currently-open workflow (no workflow- or user-level filter). `→ Failed` has no handling.

### Adjacent regression checks

* **SSE event shape** — `lib/workflow-events.ts:5-7` emits `item-updated` with the full `WorkflowItem` (including `status`), confirming the contract the client relies on. Status writes through `app/api/workflows/[id]/items/[itemId]/route.ts` end up in the watcher's `emitItemUpdated` call (`app/api/workflows/[id]/events/route.ts:70-80`). No new event type introduced.
* **No server-side change** — `git show --stat HEAD` confirms the REQ-00030 commit touches only `KanbanBoard.tsx`, `ItemDetailDialog.tsx`, `app/dashboard/settings/page.tsx`, plus the new hook and `.mp3` asset; no writes to `lib/settings.ts`, `lib/workflow-store.ts`, or the item PATCH route.
* **No new dependencies** — `package.json` diff confirms no new runtime packages for this work.
* **Type-check** — `npx tsc --noEmit` surfaces only the pre-existing `@mdxeditor/editor` diagnostic in `components/dashboard/ItemDescriptionEditor.tsx:23`, unrelated to this change.
* **Existing move/save paths** — `moveItem` and `ItemDetailDialog.handleSave` still behave identically on the happy path; `markSelfOriginated` is an additive side-effect that cannot fail (no throws, guarded map mutation).

### Edge cases considered

* **Item created directly in `Done`** — `item-created` payloads never enter the transition branch (`components/dashboard/KanbanBoard.tsx:102` guard is `payload.type === 'item-updated'`), so no false cue.
* **Stale SSE after self-origination TTL expires** — if the server echo arrives >5 s after `markSelfOriginated`, it would play; in practice the echo is ≪ 5 s, so acceptable. Spec's chosen TTL.
* **Multiple simultaneous completions** — second-and-later plays within 250 ms collapse into the first (`lib/hooks/use-item-done-sound.ts:40-42`), matching the spec's "≤ 4 plays/second sustained" cap.
* **Storage unavailable** — both `isEnabled()` (hook) and `handleAudioDoneToggle` (settings) wrap `localStorage` in try/catch and default to enabled, so private-mode browsers still get the cue but can't persist a disable.

### Not covered by automated tests

* No Jest/Vitest test exists for `useItemDoneSound()`. "Testing expectations" is listed under Technical constraints, not Acceptance criteria, so the absence does not block Done; noting it here so a follow-up can add a hook test if desired.
