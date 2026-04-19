Add ability to have notification with toast (in website) and push notification in browser level

## Analysis

### 1. Scope

**In scope**

- **In-app toasts**: a global toast surface (stacked, auto-dismissing) that any dashboard view can trigger via a single helper (e.g. `toast.success`, `toast.error`, `toast.info`). Toasts are the visible channel for short, transient feedback — stage transitions, session start/finish, create/edit/move item results, API errors, etc.
- **Browser-level notifications**: OS-level notifications delivered via the Web Notifications API (`Notification.requestPermission` + `new Notification(...)`) so the user is informed even when the dashboard tab is not focused. Primary triggers: workflow item moves to `Done` (stage-complete), item fails (`FAILED:` summary), or a new comment appears while the user is away.
- **Settings integration**: extend the existing Notifications tab in `app/dashboard/settings/page.tsx` (already owns `AUDIO_DONE_KEY`) with:
  - a master toggle for browser notifications + a permission-request button,
  - per-event toggles (item done, item failed, stage transition, new comment),
  - toasts remain always-on (they are core UX feedback), but the user can mute non-error toasts.
- **Persistence**: preferences stored in localStorage alongside the existing `nos.notifications.*` keys; no server-side user store.
- **Event plumbing**: hook notification emission into the existing auto-advance / heartbeat pipeline (`lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`) and the hooks that already refresh workflow items (e.g. `lib/use-workflow-items.ts`) so the UI emits toasts + browser notifications when item state changes.

**Explicitly out of scope**

- **Web Push / service-worker push from a server** (VAPID, push subscriptions, background push when the tab is fully closed). NOS is a local dev-server tool with no push backend; we only use the foreground `Notification` API while a tab is open.
- **Mobile push** (FCM/APNs) — no native app target.
- **A notification inbox / history view** — toasts are ephemeral; persistence beyond a short in-memory list is a future enhancement.
- **Email / Slack / external channel fan-out**.
- **Cross-tab deduplication beyond best-effort** (if the user opens two dashboard tabs, both may fire a notification; acceptable for v1).

### 2. Feasibility

- **Toast library**: no toast primitive exists in the repo today (grep confirms only the settings-page string matches). We already use Radix primitives (`@radix-ui/react-select`, `@radix-ui/react-slot`); adding a Radix-based toast (`@radix-ui/react-toast`) stays consistent with the existing shadcn/ui-style components under `components/ui/`. `sonner` is a lighter alternative but would introduce a new styling/footprint paradigm — Radix + a `components/ui/toast.tsx` + `use-toast` hook is the lower-risk choice.
- **Browser notifications**: standard Web Notifications API, supported in all evergreen desktop browsers. Key constraints:
  - `Notification.requestPermission()` must be triggered by a user gesture (click), so the Settings tab is the natural entry point.
  - Permission state is per-origin; since NOS runs at `http://localhost:30128`, permission persists for that origin across restarts.
  - Safari requires a user gesture for both the request and subsequent `new Notification(...)` calls in some contexts — we should test it but not block on it for v1 (Chrome/Firefox/Edge are the primary targets).
- **Event source**: the auto-advance sweeper already transitions items and attaches summary comments; the frontend polls/watches workflow items. Toast + browser-notification emission is most naturally a client-side diff over the items list (compare last-seen status/comments count against fresh fetch) rather than a server push. This is feasible with the current `use-workflow-items` hook — no new server endpoint required.
- **Risks / unknowns**:
  - Avoiding a notification storm on first page load (before we have a baseline) — need a "first-fetch is silent" guard.
  - Duplicate notifications across multiple open tabs — mitigate via a `BroadcastChannel` lock or accept for v1.
  - Permission-denied state: we must gracefully degrade to toasts only and surface that in settings.
  - Server-rendered Next.js canary: ensure all `Notification` / `localStorage` access is guarded by `typeof window !== 'undefined'` to avoid SSR errors.

### 3. Dependencies

- **New dependency**: `@radix-ui/react-toast` (or equivalent) — aligns with existing Radix use.
- **Existing code touchpoints**:
  - `app/dashboard/settings/page.tsx` — add browser-notification permission UI + per-event toggles under the existing Notifications tab.
  - `lib/settings.ts` — extend the settings schema with new notification preference keys.
  - `lib/use-workflow-items.ts` — emit change events (item-done, item-failed, new-comment) for the notification layer to consume.
  - `app/layout.tsx` (or the dashboard layout) — mount the `<Toaster />` root once.
  - `components/ui/toast.tsx` + `hooks/use-toast.ts` — new files, shadcn-style.
  - `lib/notifications.ts` — new module that wraps `Notification` permission + firing, reads settings, falls back to toast when permission is denied.
- **Related requirements**: REQ-00049 and REQ-00030 mention service workers / manifest in passing — confirm no overlap with a planned PWA effort before implementation (they are currently unrelated, but worth checking during documentation).
- **Runtime coupling**: this requirement is read-only from the NOS runtime's perspective — the status transitions remain owned by `lib/auto-advance-sweeper.ts`; the UI just observes them.

### 4. Open questions

1. **Which events fire a browser notification by default?** Proposed defaults: item `Done` (success) and item `FAILED:` summary. Should stage transitions (e.g. `Analysis → Document`) also fire, or only toast?
2. **Granularity of per-event settings** — one master toggle, or per-event (Done / Failed / Comment / Stage change)? Proposed: master + per-event, with Done/Failed on by default and Comment/Stage off.
3. **Scope of toasts** — do we retrofit existing ad-hoc UI feedback (dialog errors in `ItemDetailDialog`, `NewItemDialog`, etc.) to use the new toast system in this requirement, or keep that as follow-up work?
4. **Audio coupling** — the existing `nos.notifications.audio.itemDone` setting plays a sound on item-done. Should the new browser-notification channel respect the same toggle, share it, or be independent? Proposed: keep audio as its own toggle, add separate toggles for toast and browser notifications.
5. **Multi-tab behavior** — best-effort dedupe with `BroadcastChannel`, or accept duplicate fires for v1?
6. **Toast stack limit & default duration** — propose max 3 visible, 5s default, errors sticky until dismissed; needs confirmation.
7. **Brand/design tokens** — should toast variants (`success`/`error`/`info`/`warning`) map to the existing Yeu Con design system color roles, or define new tokens? Proposed: reuse existing role tokens (success, destructive, info, warning) per the design-system skill.

---

## Specification

### Resolved Decisions

| # | Decision |
|---|---|
| 1 | Browser notifications fire on **item Done** (success) and **item Failed** (`FAILED:` summary). Stage transitions fire only toast, not browser notification. |
| 2 | Settings have **one master toggle** (`nos.notifications.browser.enabled`) + **per-event toggles** (`itemDone`, `itemFailed`, `stageTransition`, `newComment`). Defaults: Done/Failed on, Comment/Stage off. |
| 3 | **Retrofit existing UI feedback** in this requirement where feasible — convert dialog error messages to use `toast.error`. Keep `NewItemDialog`, `ItemDetailDialog`, and `AddStageDialog` as follow-up. |
| 4 | **Audio stays independent** (`nos.notifications.audio.itemDone`). Toast and browser-notification toggles are separate. |
| 5 | **Accept duplicate fires for v1** — no BroadcastChannel dedupe. Multiple tabs may each fire; user is expected to have one tab open. |
| 6 | Toast limits: **max 3 visible**, **5s default duration**, **errors sticky** (manual dismiss only). |
| 7 | Toast variants map to **Yeu Con design tokens**: success → `success`, error → `destructive`, info → `info`, warning → `warning`. |

### User Stories

1. **Toast: Create feedback** — *As a developer, I want to trigger a toast notification from anywhere in the dashboard with a simple API (e.g. `toast.success("Item created")`), so that users receive immediate visual feedback on their actions.*

2. **Toast: Error feedback** — *As a developer, I want to display persistent error toasts that require user dismissal, so that critical issues are acknowledged before the user proceeds.*

3. **Browser notification: Permission request** — *As a user, I want to grant explicit permission for browser-level notifications via a Settings UI, so that I receive alerts even when the dashboard tab is not focused.*

4. **Browser notification: Item complete** — *As a user, I want to receive a browser notification when a workflow item reaches Done status, so that I know progress occurred without watching the dashboard.*

5. **Browser notification: Item failed** — *As a user, I want to receive a browser notification when a workflow item fails with a `FAILED:` summary, so that I can investigate immediately.*

6. **Settings: Granular control** — *As a user, I want to independently toggle browser notifications per event type (Done, Failed, Stage, Comment), so that I receive only the alerts I care about.*

7. **Settings: Toast mute** — *As a user, I want to mute non-error toasts, so that my screen stays clear during routine operations while still seeing errors.*

### Acceptance Criteria

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1 | Toast API `toast.success` renders | User calls `toast.success("Done")` anywhere in app | A toast appears in the toast surface with "Done" message | Toast auto-dismisses after 5s |
| AC-2 | Toast API `toast.error` persists | User calls `toast.error("Failed")` | A toast appears with error styling | Toast stays until user clicks X |
| AC-3 | Toast stacks max 3 | User fires 5 rapid toasts | Only the most recent 3 are visible | Older toasts are removed from view |
| AC-4 | Browser permission flow | User visits Notifications settings | Clicks "Enable browser notifications" button | Native permission dialog appears |
| AC-5 | Browser notification fires on Done | Item transitions to Done with no `FAILED:` prefix | Browser notification fires (if permission granted + toggle on) | Notification shows "Item <id> completed" |
| AC-6 | Browser notification fires on Failed | Item gets `FAILED:` summary | Browser notification fires (if permission granted + toggle on) | Notification shows "Item <id> failed" |
| AC-7 | Settings toggle master | User toggles master switch off | No browser notifications fire for any event | Event toggles are ignored |
| AC-8 | Settings toggle per-event | User toggles "Item done" off, "Item failed" on | Item Done fires | No browser notification; Failed items still fire |
| AC-9 | First fetch is silent | User loads dashboard fresh | First workflow-items fetch completes | No notifications fire (baseline not yet established) |
| AC-10 | SSR safe | App runs on Next.js SSR | Server renders app | No `window.Notification` or `localStorage` errors thrown |
| AC-11 | Permission denied handling | User denies browser permission | Notification attempt occurs | Fall back to toast; Settings shows "Permission denied" |
| AC-12 | Retrofitting dialogs | `NewItemDialog` has an error state | Error occurs | Error is displayed via `toast.error` (not dialog-alert) |

### Technical Constraints

- **API shape**: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toast.warning(msg)` — each returns `void`.
- **Toast provider**: `@radix-ui/react-toast` mounted once in `app/layout.tsx` or dashboard layout; exposed via `components/ui/toast.tsx` + `hooks/use-toast.ts`.
- **Settings keys** (localStorage):
  - `nos.notifications.browser.enabled` (bool, default `false`)
  - `nos.notifications.browser.onItemDone` (bool, default `true`)
  - `nos.notifications.browser.onItemFailed` (bool, default `true`)
  - `nos.notifications.browser.onStageTransition` (bool, default `false`)
  - `nos.notifications.browser.onNewComment` (bool, default `false`)
  - `nos.notifications.toast.muteNonError` (bool, default `false`)
  - (existing) `nos.notifications.audio.itemDone` unchanged
- **Browser Notification API**: Guard all calls with `typeof window !== "undefined"` and `Notification.permission === "granted"`.
- **Event source**: Client-side diff in `use-workflow-items.ts` — track last-seen item status + comment count per item; emit change events for notification layer to consume.
- **Design tokens**: Reuse Yeu Con tokens for toast variant colors (`--color-success`, `--color-destructive`, `--color-info`, `--color-warning`).

### Out of Scope

- Service-worker backed Web Push / server-initiated push notifications
- Native mobile push (FCM/APNs)
- Notification inbox/history view
- Cross-tab deduplication (BroadcastChannel)
- Email/Slack/external channel fan-out
- Retrofitting ALL existing dialog UI (marked as follow-up)

---

## Specification

### Resolved Decisions

| # | Decision |
|---|---|
| 1 | Browser notifications fire on **item Done** (success) and **item Failed** (`FAILED:` summary). Stage transitions fire only toast, not browser notification. |
| 2 | Settings have **one master toggle** (`nos.notifications.browser.enabled`) + **per-event toggles** (`itemDone`, `itemFailed`, `stageTransition`, `newComment`). Defaults: Done/Failed on, Comment/Stage off. |
| 3 | **Retrofit existing UI feedback** in this requirement where feasible — convert dialog error messages to use `toast.error`. Keep `NewItemDialog`, `ItemDetailDialog`, and `AddStageDialog` as follow-up. |
| 4 | **Audio stays independent** (`nos.notifications.audio.itemDone`). Toast and browser-notification toggles are separate. |
| 5 | **Accept duplicate fires for v1** — no BroadcastChannel dedupe. Multiple tabs may each fire; user is expected to have one tab open. |
| 6 | Toast limits: **max 3 visible**, **5s default duration**, **errors sticky** (manual dismiss only). |
| 7 | Toast variants map to **Yeu Con design tokens**: success → `success`, error → `destructive`, info → `info`, warning → `warning`. |

### User Stories

1. **Toast: Create feedback** — *As a developer, I want to trigger a toast notification from anywhere in the dashboard with a simple API (e.g. `toast.success("Item created")`), so that users receive immediate visual feedback on their actions.*

2. **Toast: Error feedback** — *As a developer, I want to display persistent error toasts that require user dismissal, so that critical issues are acknowledged before the user proceeds.*

3. **Browser notification: Permission request** — *As a user, I want to grant explicit permission for browser-level notifications via a Settings UI, so that I receive alerts even when the dashboard tab is not focused.*

4. **Browser notification: Item complete** — *As a user, I want to receive a browser notification when a workflow item reaches Done status, so that I know progress occurred without watching the dashboard.*

5. **Browser notification: Item failed** — *As a user, I want to receive a browser notification when a workflow item fails with a `FAILED:` summary, so that I can investigate immediately.*

6. **Settings: Granular control** — *As a user, I want to independently toggle browser notifications per event type (Done, Failed, Stage, Comment), so that I receive only the alerts I care about.*

7. **Settings: Toast mute** — *As a user, I want to mute non-error toasts, so that my screen stays clear during routine operations while still seeing errors.*

### Acceptance Criteria

| ID | Criterion | Given | When | Then |
|----|-----------|-------|------|------|
| AC-1 | Toast API `toast.success` renders | User calls `toast.success("Done")` anywhere in app | A toast appears in the toast surface with "Done" message | Toast auto-dismisses after 5s |
| AC-2 | Toast API `toast.error` persists | User calls `toast.error("Failed")` | A toast appears with error styling | Toast stays until user clicks X |
| AC-3 | Toast stacks max 3 | User fires 5 rapid toasts | Only the most recent 3 are visible | Older toasts are removed from view |
| AC-4 | Browser permission flow | User visits Notifications settings | Clicks "Enable browser notifications" button | Native permission dialog appears |
| AC-5 | Browser notification fires on Done | Item transitions to Done with no `FAILED:` prefix | Browser notification fires (if permission granted + toggle on) | Notification shows "Item <id> completed" |
| AC-6 | Browser notification fires on Failed | Item gets `FAILED:` summary | Browser notification fires (if permission granted + toggle on) | Notification shows "Item <id> failed" |
| AC-7 | Settings toggle master | User toggles master switch off | No browser notifications fire for any event | Event toggles are ignored |
| AC-8 | Settings toggle per-event | User toggles "Item done" off, "Item failed" on | Item Done fires | No browser notification; Failed items still fire |
| AC-9 | First fetch is silent | User loads dashboard fresh | First workflow-items fetch completes | No notifications fire (baseline not yet established) |
| AC-10 | SSR safe | App runs on Next.js SSR | Server renders app | No `window.Notification` or `localStorage` errors thrown |
| AC-11 | Permission denied handling | User denies browser permission | Notification attempt occurs | Fall back to toast; Settings shows "Permission denied" |
| AC-12 | Retrofitting dialogs | `NewItemDialog` has an error state | Error occurs | Error is displayed via `toast.error` (not dialog-alert) |

### Technical Constraints

- **API shape**: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`, `toast.warning(msg)` — each returns `void`.
- **Toast provider**: `@radix-ui/react-toast` mounted once in `app/layout.tsx` or dashboard layout; exposed via `components/ui/toast.tsx` + `hooks/use-toast.ts`.
- **Settings keys** (localStorage):
  - `nos.notifications.browser.enabled` (bool, default `false`)
  - `nos.notifications.browser.onItemDone` (bool, default `true`)
  - `nos.notifications.browser.onItemFailed` (bool, default `true`)
  - `nos.notifications.browser.onStageTransition` (bool, default `false`)
  - `nos.notifications.browser.onNewComment` (bool, default `false`)
  - `nos.notifications.toast.muteNonError` (bool, default `false`)
  - (existing) `nos.notifications.audio.itemDone` unchanged
- **Browser Notification API**: Guard all calls with `typeof window !== "undefined"` and `Notification.permission === "granted"`.
- **Event source**: Client-side diff in `use-workflow-items.ts` — track last-seen item status + comment count per item; emit change events for notification layer to consume.
- **Design tokens**: Reuse Yeu Con tokens for toast variant colors (`--color-success`, `--color-destructive`, `--color-info`, `--color-warning`).

### Out of Scope

- Service-worker backed Web Push / server-initiated push notifications
- Native mobile push (FCM/APNs)
- Notification inbox/history view
- Cross-tab deduplication (BroadcastChannel)
- Email/Slack/external channel fan-out
- Retrofitting ALL existing dialog UI (marked as follow-up)

---

## Validation

Build / lint: `npx tsc --noEmit` exits 0; `npm test` 22/22 pass.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | ✅ | `components/ui/toaster.tsx:27,46,72` — `DEFAULT_DURATION = 5000`; `toast.success` enqueues with default duration; the store schedules `dismiss` after 5s. |
| AC-2 | ✅ | `components/ui/toaster.tsx:28,73-74` — `toast.error` defaults to `ERROR_DURATION = Infinity`; `if (duration !== Infinity)` skips the auto-dismiss timer, so error toasts stay until the user clicks `<ToastClose />`. |
| AC-3 | ✅ | `components/ui/toaster.tsx:26,48` — `MAX_TOASTS = 3`; `toasts = [...toasts, …].slice(-MAX_TOASTS)` keeps only the newest three. |
| AC-4 | ✅ | `app/dashboard/settings/page.tsx:158-166,573-588` — `handleRequestPermission` calls `requestPermission()` (which awaits `Notification.requestPermission()` per `lib/notifications.ts:111-113`) on a click handler, satisfying the user-gesture requirement. |
| AC-5 | ✅ | `lib/use-workflow-items.ts:135-148` — on `In Progress → Done` SSE diff, fires `notifyBrowser({ title: 'Item <id> completed', body: title })` after master + per-event toggle and baseline guards. |
| AC-6 | ❌ | No `FAILED:` detection anywhere in `lib/use-workflow-items.ts`, `lib/notifications.ts`, or the toaster (grep confirms only the `ON_ITEM_FAILED` constant exists). The settings UI exposes the toggle, but no notification is ever emitted for failed items. |
| AC-7 | ✅ | `lib/notifications.ts:138` — `notifyBrowser` early-returns when `!isBrowserNotificationEnabled()`, so flipping the master off blocks every per-event path. |
| AC-8 | ⚠️ | Done branch honors the per-event toggle (`lib/use-workflow-items.ts:142`), so toggling Done off suppresses Done. The Failed branch is missing entirely (see AC-6), so the symmetric "Failed still fires" half of the criterion cannot be verified — partial. |
| AC-9 | ✅ | `lib/use-workflow-items.ts:142,168-170` — `baselineRef.current` is only assigned after the first `resync` snapshot; the Done notification is gated by `if (baselineRef.current && …)`, so the first arrival is silent. |
| AC-10 | ✅ | `lib/notifications.ts:18,98,122,137` and `components/ui/toaster.tsx:64,67` — every `Notification` / `localStorage` access is wrapped in `typeof window !== 'undefined'` (and `typeof Notification !== 'undefined'`). The toast store is created as `{} as ToastStore` on the server; it is only consumed inside `'use client'` modules, and the dashboard `Toaster` mount lives in a client subtree. `npx tsc --noEmit` exits 0. |
| AC-11 | ⚠️ | Settings shows "Denied — enable in browser settings" (`app/dashboard/settings/page.tsx:563-565`) and the master toggle is disabled until permission is granted. However `notifyBrowser` (`lib/notifications.ts:139`) silently `return`s when permission is not `granted` — there is no fallback to `toast.warning`/`toast.info` as the AC requires. Partial. |
| AC-12 | ⚠️ | `components/dashboard/NewItemDialog.tsx:13,100` — create-failure path now calls `toast.error(msg)`. However the dialog still renders the inline `bg-destructive/10` banner at `NewItemDialog.tsx:185-189`, so the error is shown via *both* the toast *and* the dialog-alert. The AC says "via `toast.error` (not dialog-alert)" — partial. |

### Additional findings (Technical Constraints not captured by an AC)

- **`muteNonError` toggle does not persist.** `app/dashboard/settings/page.tsx:18` imports `setToastMuted` from `lib/notifications`, but `app/dashboard/settings/page.tsx:72` declares `const [toastMuted, setToastMuted] = useState(false);` which shadows the import. The handler at `settings/page.tsx:153-156` therefore calls the React state setter twice and never writes to `localStorage`. Refresh and the toggle resets to off.
- **`muteNonError` setting is never consumed.** Even if persistence is fixed, `toast.success/info/warning` (`components/ui/toaster.tsx:71-81`) ignore `isToastMuted()` — non-error toasts always show. The setting is currently read only by the settings page to populate its checkbox.

### Follow-ups (must be addressed before advancing to Done)

1. Detect `FAILED:` summary comments in `lib/use-workflow-items.ts` (track per-item `comments.length`, inspect new comment bodies for a leading `FAILED:`) and call `notifyBrowser({ title: 'Item <id> failed' })` gated by `isItemFailedNotificationEnabled()`. Closes AC-6 and the Failed half of AC-8.
2. Make `notifyBrowser` (or its callers) fall back to `toast.warning` / `toast.error` when `Notification.permission !== 'granted'` so the user still sees the cue. Closes AC-11.
3. Drop the inline `bg-destructive/10` error banner in `NewItemDialog.tsx:185-189` once `toast.error` is wired (or keep one channel, not both). Closes AC-12.
4. Rename the `useState` setter in `settings/page.tsx:72` (e.g. `setToastMutedState`) so the imported `setToastMuted` from `lib/notifications` is the one called inside `handleToastMuteToggle`. Persistence bug.
5. Honor `isToastMuted()` inside `toast.success/info/warning` in `components/ui/toaster.tsx` (early-return without enqueueing) so the mute setting actually mutes. Technical-constraint fix.

Verdict: **7 ✅ / 4 ⚠️ / 1 ❌ across 12 ACs.** Stays in **Validate** stage; do not advance to Done.
