current

* When an item move into next stage in 1 workspace, the other browser in different workspace will show up the item. after refresh it will disappeared



desired

* that kind of event will be workspace-siloed. the signal from this browser in this workspace should not go to the other browswer in other workspace

## Brainstorming

### 1. Clarify — What do we really mean? What does this exclude?

**Q1: What exactly is a "workspace" in this context — is it the filesystem-backed project root, the browser session (cookie), or both?**

*Thinking:* The term "workspace" is overloaded. We need to nail down whether isolation means "events from a different `absolutePath`" or "events from a different `nos_workspace` cookie session." The distinction matters because a single user could have two tabs open to different workspaces.

*Recommended answer:* A workspace is identified by its UUID (stored in `~/.nos/workspaces.yaml`), which maps 1:1 to a filesystem path. Isolation should be keyed on the workspace ID carried by the browser's `nos_workspace` cookie. Two tabs pointing to the same workspace should share events; two tabs pointing to different workspaces should not.

---

**Q2: Does "event" here mean only SSE-pushed real-time signals, or does it also include REST poll responses and the initial page load?**

*Thinking:* The report shows REST endpoints are already workspace-scoped via `withWorkspace()`. The leak is specifically in the SSE layer. But we should confirm scope — does the user also see stale data on initial page load from a different workspace, or only via real-time push?

*Recommended answer:* The bug is specifically in the real-time SSE push layer. REST endpoints (initial fetches) are correctly scoped via `withWorkspace()` + `getProjectRoot()`. The fix should focus on SSE endpoints: `/api/activity/events` and potentially the per-workflow `/api/workflows/[id]/events` (though the latter already filters by `workflowId`).

---

**Q3: Should file-system watcher events (chokidar) also be workspace-scoped, or just the activity-log events?**

*Thinking:* Chokidar watches specific paths under `.nos/workflows/<id>/items/*/meta.yml`, which are already workspace-specific on disk. But the emitted events flow into the same global EventEmitter without any workspace tag. If two workspaces have the same workflow ID (unlikely but possible with UUIDs), this could cause confusion.

*Recommended answer:* Yes — all events flowing through the global `workflowEvents` EventEmitter should carry a workspace identifier. This includes both `item-activity` events from `appendActivity()` and file-watcher events from chokidar. The workspace ID should be attached at emit time.

---

**Q4: What about the dashboard's "recent activity" widget on the home page — should it also be workspace-siloed?**

*Thinking:* The home page (`app/dashboard/page.tsx`) fetches `/api/activity?limit=10` which is REST-scoped correctly. But if there's an SSE subscription on that page too, it could leak.

*Recommended answer:* Yes. Any real-time subscription on any page should be workspace-scoped. The REST fetch is already correct; the SSE subscription (if any) on the home page must also filter by workspace.

---

**Q5: Does "conflicted" in the title imply data corruption, or just UI confusion (phantom items appearing then disappearing on refresh)?**

*Thinking:* The severity determines the fix urgency. If it's just visual noise (items flash then vanish on refresh), it's a UX bug. If events from workspace B actually mutate workspace A's local state, it's a data integrity issue.

*Recommended answer:* Based on the description ("after refresh it will disappeared"), this is UI confusion, not data corruption. The SSE event triggers a UI update showing a phantom item, but since the REST layer is workspace-scoped, a refresh fetches correct data. However, race conditions during the phantom display could theoretically cause user actions on the wrong item — so it's still high-priority.

---

### 2. Probe Assumptions — What are we taking for granted?

**Q1: Are we assuming that every event on the global EventEmitter can be cheaply tagged with a workspace ID?**

*Thinking:* The current `WorkflowEvent` type may not carry a workspace field. Adding one requires changes at every emit site. We're assuming this is straightforward, but what if some events are emitted from contexts where the workspace isn't easily resolvable (e.g., file-watcher callbacks outside AsyncLocalStorage)?

*Recommended answer:* This is a valid concern. The file watcher (`chokidar`) runs outside the request-scoped AsyncLocalStorage context, so `getProjectRoot()` would return the fallback. The workspace ID must be captured at watcher-creation time and injected into every emitted event. This is feasible since watchers are created per-workflow in a request context where `getProjectRoot()` is available.

---

**Q2: Are we assuming a single Next.js process serves multiple workspaces simultaneously?**

*Thinking:* If each workspace ran its own server process, the global EventEmitter would already be workspace-isolated (process isolation). The leak only matters if one process handles requests for multiple workspaces.

*Recommended answer:* Yes — the current architecture uses a single Next.js dev server process, and workspace switching is done via cookie. This is by design (users switch workspaces in the same browser). So the fix must be in-process event isolation, not process separation.

---

**Q3: Are we assuming the `nos_workspace` cookie is reliably present on SSE connections?**

*Thinking:* SSE connections use `EventSource` in the browser, which sends cookies automatically. But if the cookie is missing or stale, the SSE endpoint can't determine which workspace to filter for.

*Recommended answer:* `EventSource` sends cookies by default for same-origin requests, so the `nos_workspace` cookie will be present. The SSE route handler can read it via `cookies()` or the request headers. If the cookie is missing, the SSE should refuse the connection or return no events rather than returning all events.

---

**Q4: Are we assuming workflow IDs are globally unique across workspaces?**

*Thinking:* If two workspaces could have a workflow named `requirements`, filtering by `workflowId` alone isn't sufficient — you need workspace + workflowId.

*Recommended answer:* Workflow IDs (like `requirements`) are directory names, not UUIDs. Two workspaces can absolutely have a workflow with the same ID. This confirms that workspace-level filtering is essential and workflowId filtering alone is insufficient for cross-workspace isolation.

---

**Q5: Are we assuming that the per-workflow SSE endpoint (`/api/workflows/[id]/events`) is NOT leaking cross-workspace?**

*Thinking:* This endpoint filters by `workflowId` in the listener. But if workspace A and workspace B both have a workflow called `requirements`, events from B's `requirements` workflow would pass the filter and reach A's browser.

*Recommended answer:* This is likely a secondary leak vector! The per-workflow endpoint filters only on `workflowId` (the string `"requirements"`), not on workspace. If both workspaces have a `requirements` workflow, events cross-contaminate. This endpoint also needs workspace filtering.

---

### 3. Find Reasons and Evidence — Why do we believe this is needed?

**Q1: What user behavior triggers the cross-workspace leak in practice?**

*Thinking:* Understanding the reproduction steps helps confirm the root cause and ensures the fix addresses the real scenario.

*Recommended answer:* The reproduction is: (1) Open browser tab A pointed at workspace W1, (2) Open browser tab B pointed at workspace W2, (3) Perform an action in tab B (move item to next stage), (4) Observe tab A showing the phantom item. Both tabs connect to the same Next.js process, share the same global EventEmitter, and the SSE endpoint doesn't filter by workspace.

---

**Q2: Is there evidence this causes user confusion or erroneous actions (not just visual noise)?**

*Thinking:* If users see phantom items and try to interact with them (click, drag, edit), they could trigger errors or — worse — actions against the wrong workspace's data.

*Recommended answer:* The primary evidence is the user report itself. The phantom items are real UI elements (not just flickers) that exist until a page refresh. During that window, a user could attempt to interact with them. Even if interaction fails gracefully, the confusion erodes trust in the system's reliability.

---

**Q3: How many users are affected — is this a single-user multi-workspace scenario or a multi-user scenario?**

*Thinking:* Single-user multi-workspace (one person switching between projects) vs. multi-user (team members on different workspaces on the same machine/server) changes the fix's priority and complexity.

*Recommended answer:* Currently NOS is primarily single-user (developer tool), but the user operates multiple workspaces simultaneously in different browser tabs. This is the common case. Multi-user shared server scenarios would amplify the problem but aren't the primary use case today.

---

**Q4: Has this bug been present since multi-workspace support was added, or is it a regression?**

*Thinking:* If it's been present since inception, the SSE layer was never designed for multi-workspace. If it's a regression, we can look at what changed.

*Recommended answer:* Based on the architecture (single global EventEmitter, workspace cookie added later), this appears to be a design gap from when multi-workspace support was bolted onto an originally single-workspace system. The REST layer was properly scoped during that work, but the SSE layer was overlooked.

---

**Q5: Does the current workaround (refreshing the page) have any negative side effects?**

*Thinking:* If refresh reliably clears phantom items, the bug is annoying but not blocking. But if there are edge cases where refresh doesn't help (e.g., cached state), the severity is higher.

*Recommended answer:* Refresh does clear phantoms because it re-fetches via REST (which is workspace-scoped). However, the SSE reconnects after refresh and the leak resumes immediately for any new events from the other workspace. So refresh is a momentary fix, not a workaround.

---

### 4. Explore Alternatives — What else might be true?

**Q1: Could we solve this with separate EventEmitter instances per workspace instead of adding filtering?**

*Thinking:* A per-workspace emitter would give hard isolation without needing every listener to filter. But it changes the architecture — emitters would need to be created/destroyed as workspaces are activated.

*Recommended answer:* This is a cleaner architectural fix but higher effort. A Map of `workspaceId → EventEmitter` in `workflow-events.ts` would give hard isolation. The tradeoff is lifecycle management (cleaning up emitters when workspaces are deactivated) and the refactor scope. For now, adding a workspace field to events + filtering in SSE handlers is simpler and sufficient.

---

**Q2: Could the client-side simply discard events that don't match its current workspace context?**

*Thinking:* Client-side filtering is simpler to implement (no backend changes) but leaks information across workspaces (events are still transmitted). For a single-user tool this may be acceptable.

*Recommended answer:* Client-side filtering is a valid quick fix for a single-user tool (no security concern). However, it wastes bandwidth, and the client would need to know its workspace ID to filter. Server-side filtering is more correct and only marginally harder. Recommend server-side as the primary fix, with client-side as a defense-in-depth layer.

---

**Q3: Could we use a workspace-scoped SSE URL (e.g., `/api/workspaces/[wsId]/activity/events`) instead of relying on cookies?**

*Thinking:* URL-based scoping makes the isolation explicit and testable. It doesn't rely on cookie presence and makes the API more RESTful.

*Recommended answer:* This is a good alternative. A URL like `/api/workspaces/[wsId]/activity/events` makes scoping explicit. The SSE route handler would receive the workspace ID as a path parameter and filter accordingly. This is more explicit than cookie-based resolution and easier to reason about. Recommended as the preferred approach.

---

**Q4: Is the real fix to tag every event with `workspaceId` at emit time, so any consumer can filter?**

*Thinking:* If events carry their workspace origin, any subscriber (SSE endpoint, future WebSocket, internal listener) can independently filter. This is the most composable fix.

*Recommended answer:* Yes — this is the foundational fix. Every `WorkflowEvent` should include a `workspaceId` field set at emit time (from `getProjectRoot()` or resolved from the file path). Then SSE endpoints filter on it. This decouples the fix from any specific transport and future-proofs the architecture.

---

**Q5: Could process-level isolation (one server per workspace) be a longer-term solution?**

*Thinking:* Complete process isolation eliminates shared-state bugs entirely. But it's heavy — each workspace would need its own port and the UI would need to connect to different backends.

*Recommended answer:* Process isolation is architecturally clean but operationally heavy for a dev tool. It would require a reverse proxy or port-per-workspace scheme. Not recommended for the current scale, but worth noting as a future option if workspace count grows significantly.

---

### 5. Explore Implications — If true, then what else follows?

**Q1: If we add `workspaceId` to all events, does this break any existing consumers?**

*Thinking:* Adding a new field to the event object is additive and shouldn't break existing consumers that don't inspect it. But if any consumer does strict schema validation, it could reject the new field.

*Recommended answer:* Adding `workspaceId` is an additive, non-breaking change to the `WorkflowEvent` type. No existing consumers validate against a strict schema that would reject extra fields. TypeScript's structural typing means existing code continues to work.

---

**Q2: If we fix the SSE layer, should we also audit the Kanban board's drag-and-drop events for cross-workspace leaks?**

*Thinking:* Drag-and-drop in the Kanban board triggers stage moves, which emit events. If the move action itself isn't workspace-scoped (hypothetically), it could write to the wrong workspace.

*Recommended answer:* The write path (drag-and-drop → API call → `withWorkspace()` → file write) is already workspace-scoped via the middleware. The leak is read-path only (SSE push). However, it's worth auditing that the Kanban board's optimistic UI updates are reverted correctly when the SSE stream delivers events from foreign workspaces.

---

**Q3: If the per-workflow SSE endpoint also leaks (same `workflowId` in two workspaces), what's the user-visible symptom?**

*Thinking:* This is the secondary leak vector identified earlier. Understanding its symptoms helps prioritize fixing it.

*Recommended answer:* The symptom would be identical to the reported bug: items appearing/moving in the Kanban board or list view that belong to a different workspace's workflow. Since both workspaces can have `requirements` as a workflow ID, all item events from workspace B's `requirements` workflow would appear in workspace A's `requirements` view.

---

**Q4: If we scope SSE by workspace, do we also need to scope the chokidar file watchers?**

*Thinking:* Chokidar watches specific file paths. If workspace A's watcher is watching `/projects/acme/.nos/workflows/...`, it physically can't see workspace B's files at `/projects/other/.nos/workflows/...`. So file watchers are inherently workspace-scoped by path. But the events they emit need workspace tagging.

*Recommended answer:* File watchers are already path-scoped (they can only see their own workspace's files). The fix is only needed at the event-emit layer — tag the workspace ID onto the event when the watcher fires. The watcher setup code has access to the project root (it's created in a request context), so capturing and injecting the workspace ID is straightforward.

---

**Q5: Does fixing this unblock any other features (e.g., multi-workspace dashboard, workspace activity comparison)?**

*Thinking:* If events are properly tagged with workspace IDs, it becomes possible to intentionally aggregate events across workspaces (e.g., a "unified activity" view) as an opt-in feature rather than an accidental leak.

*Recommended answer:* Yes — proper workspace tagging on events is a prerequisite for any intentional cross-workspace feature. Once events carry their origin workspace, you can build: unified activity feeds (opt-in), workspace comparison views, and cross-workspace notifications. The fix for this bug is also the foundation for these future capabilities.

---

## Analysis

### Scope

**In scope:**
- Isolating SSE event streams so that browser tabs connected to Workspace A never receive events originating from Workspace B (and vice versa).
- Both the global activity stream (`/api/activity/events`) and the per-workflow stream (`/api/workflows/[id]/events`) must be workspace-scoped.
- All event types must be covered: `item-activity`, stage moves, status changes, and file-watcher-triggered updates.

**Out of scope:**
- Changing how workspaces are defined, discovered, or switched.
- Multi-user / multi-tenant access control (this is a single-user system; the issue is multi-tab, multi-workspace bleed within one browser).
- Refactoring the workspace routing middleware (`withWorkspace`) beyond what's needed for event isolation.
- REST endpoints — these are already correctly scoped via `withWorkspace()` + `getProjectRoot()`.

### Feasibility

**Root cause:** The event system uses a single global `EventEmitter` on `globalThis.__nosWorkflowEvents` (`lib/workflow-events.ts`). Events are emitted with a `workflowId` (e.g., `"requirements"`) but **no workspace identifier**. Because multiple workspaces share identically-named workflows (both have `.nos/workflows/requirements`), the per-workflow SSE filter (`evtWorkflowId !== id`) passes events from a different workspace's same-named workflow through to the wrong listener.

**Technical viability — HIGH.** The recommended fix is:

1. **Add `workspaceId` to `WorkflowEvent` type** — tag every event at emit time with the originating workspace ID (derived from `getProjectRoot()` or the resolved workspace UUID).
2. **Filter in SSE route handlers** — each SSE endpoint reads the requesting browser's workspace context (from `nos_workspace` cookie via `withWorkspace`) and drops any event whose `workspaceId` doesn't match.
3. **Ensure background emitters carry workspace context** — the chokidar file watcher and auto-advance sweeper emit events outside HTTP request scope; they must capture workspace ID at creation time and inject it into emitted events.

**Risks:**
- The auto-advance sweeper (`lib/auto-advance-sweeper.ts`) runs on a timer outside AsyncLocalStorage. It must capture and store its workspace context at initialization, not at emit time.
- If a workspace ID cannot be resolved (missing cookie, background process), the SSE endpoint should refuse the connection or emit nothing — never fall back to broadcasting all events.

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| `lib/workflow-events.ts` | Core module | Must add `workspaceId` to `WorkflowEvent` type and ensure it's populated on every emit |
| `lib/activity-log.ts` | Module | Calls `workflowEvents.emit()`; must pass workspace ID from its calling context |
| `lib/workspace-context.ts` | Module | Provides `withWorkspace()` and `getProjectRoot()`; workspace ID derivation lives here |
| `app/api/activity/events/route.ts` | API route | Global SSE stream; must read workspace from cookie and filter events |
| `app/api/workflows/[id]/events/route.ts` | API route | Per-workflow SSE stream; must add workspace filter alongside existing `workflowId` filter |
| `lib/auto-advance-sweeper.ts` | Runtime | Background timer that triggers stage moves; must capture workspace context at startup |
| `lib/auto-advance.ts` | Runtime | Executes stage transitions; must propagate workspace ID into emitted events |
| Chokidar file watchers | Infrastructure | Already path-scoped; just need to tag emitted events with workspace ID captured at watcher creation |

### Open Questions

1. **What is the canonical workspace identifier?** Is it the UUID from `~/.nos/workspaces.yaml`, the absolute filesystem path, or the `nos_workspace` cookie value? The fix must use a consistent key across emit and filter sides.
2. **Does the auto-advance sweeper operate in a single workspace or iterate across all known workspaces?** If it iterates, it already has workspace context per iteration; if single, it must be told which workspace it's serving.
3. **Should the client pass workspace ID explicitly in the SSE URL** (e.g., `/api/workspaces/[wsId]/events`) for defense-in-depth, or is cookie-based server-side resolution sufficient?
4. **Are there other real-time consumers** (e.g., the chat widget's streaming responses, any future WebSocket endpoints) that also need workspace isolation applied?

## Specification

### User Stories

1. **As a developer** working with multiple NOS workspaces open in separate browser tabs, **I want** real-time SSE events to be scoped to the workspace my tab is connected to, **so that** I never see phantom items, stage moves, or status changes from a different workspace's workflows.

2. **As a developer** performing stage transitions (drag-and-drop, auto-advance) in Workspace A, **I want** those events to be invisible to any browser tab connected to Workspace B, **so that** my other workspace's UI remains stable and trustworthy without requiring a page refresh.

3. **As a developer** with two workspaces that share an identically-named workflow (e.g., both have `requirements`), **I want** the per-workflow SSE stream to distinguish between them by workspace — not just by workflow ID — **so that** events from one workspace's `requirements` workflow never appear in the other's Kanban board or list view.

### Acceptance Criteria

1. **Given** two browser tabs open to different workspaces (W1 and W2), **when** an item is moved to the next stage in W2, **then** the tab connected to W1 receives zero SSE events related to that stage move.

2. **Given** two workspaces that both contain a workflow named `requirements`, **when** an item is created/updated/deleted in W1's `requirements` workflow, **then** the per-workflow SSE stream (`/api/workflows/requirements/events`) for W2 does not emit that event.

3. **Given** the global activity SSE stream (`/api/activity/events`), **when** an `item-activity` event is emitted from Workspace A, **then** only SSE connections whose resolved workspace matches A receive the event.

4. **Given** a background process (auto-advance sweeper, chokidar file watcher) emitting events outside an HTTP request context, **when** those events are emitted to the global `EventEmitter`, **then** each event carries the `workspaceId` of the workspace it originated from (captured at watcher/sweeper creation time).

5. **Given** an SSE connection where the workspace cannot be resolved (missing or invalid `nos_workspace` cookie), **when** the connection is established, **then** the endpoint either refuses the connection or streams no events — it must never fall back to broadcasting all events from all workspaces.

6. **Given** the fix is deployed, **when** a page refresh is performed in any tab, **then** the behavior is identical to before the fix (REST endpoints remain correctly scoped via `withWorkspace()`).

7. **Given** two tabs on the **same** workspace, **when** an event is emitted in that workspace, **then** both tabs receive the event (same-workspace sharing is preserved).

### Technical Constraints

**Event type changes:**
- The `WorkflowEvent` union type in `lib/workflow-events.ts` must be extended with a `workspaceId: string` field on every variant (`item-updated`, `item-created`, `item-deleted`, `item-activity`).
- All emit helper functions (`emitItemUpdated`, `emitItemCreated`, `emitItemDeleted`) must accept and propagate a `workspaceId` parameter.

**Workspace identity:**
- The canonical workspace identifier must be the value stored in the `nos_workspace` cookie, which is the UUID key from `~/.nos/workspaces.yaml`. This is the value used for both emit-side tagging and SSE-side filtering.
- Workspace resolution on the SSE read side uses `resolveWorkspaceRoot()` from `lib/workspace-context.ts` or directly reads the `nos_workspace` cookie value.

**SSE route handler changes:**
- `app/api/activity/events/route.ts` — must resolve the requesting connection's workspace ID from the cookie and drop any `WorkflowEvent` whose `workspaceId` does not match.
- `app/api/workflows/[id]/events/route.ts` — must add workspace-based filtering alongside the existing `workflowId`-based filtering.

**Background emitter changes:**
- `lib/auto-advance-sweeper.ts` — runs on a `setInterval` timer outside `AsyncLocalStorage`. Must capture the workspace ID at sweeper initialization time and inject it into every event emitted during sweep iterations.
- `lib/auto-advance.ts` — must accept and forward workspace ID when emitting events during stage transitions.
- Chokidar file watchers (created in `app/api/workflows/[id]/events/route.ts`) — already path-scoped on disk, but must tag emitted events with the workspace ID captured at watcher creation time from the HTTP request context.

**Activity log:**
- `lib/activity-log.ts` calls `workflowEvents.emit()` for `item-activity` events. The `appendActivity()` function (or its callers) must pass the workspace ID so it can be included in the emitted event.

**Compatibility:**
- Adding `workspaceId` to `WorkflowEvent` is an additive change. TypeScript structural typing ensures existing consumers that don't inspect the field continue to compile.
- REST endpoints are unaffected — they are already correctly scoped via `withWorkspace()` middleware.

**Performance:**
- Filtering is a simple string comparison on each SSE event; no measurable performance impact expected.
- No new network requests, database queries, or file I/O are introduced in the hot path.

### Out of Scope

1. **Workspace definition/discovery/switching logic** — how workspaces are registered in `~/.nos/workspaces.yaml`, how the `nos_workspace` cookie is set, and how the UI switches between workspaces are unchanged.
2. **REST endpoint scoping** — already correct via `withWorkspace()` + `getProjectRoot()`. No changes needed.
3. **Multi-user / multi-tenant access control** — NOS is a single-user developer tool. This fix addresses multi-tab, multi-workspace bleed within one browser, not multi-user security boundaries.
4. **Per-workspace `EventEmitter` instances** — while architecturally cleaner, replacing the single global emitter with a `Map<workspaceId, EventEmitter>` is a larger refactor. The current fix (tag + filter) is sufficient and lower-risk.
5. **Workspace-scoped SSE URL paths** (e.g., `/api/workspaces/[wsId]/events`) — cookie-based workspace resolution is the chosen approach for this fix; URL-based scoping is a potential future enhancement.
6. **Client-side event filtering** — server-side filtering is the primary fix. Client-side defense-in-depth filtering may be added separately but is not part of this requirement.
7. **Chat widget / Claude streaming SSE** (`/api/chat/nos/route.ts`, `/api/claude/route.ts`) — these use separate streaming mechanisms (child process stdout, `streamRegistry`) that are session-scoped, not workspace-scoped via the global `EventEmitter`.

## Implementation Notes

The fix uses `workspaceRoot` (the resolved absolute filesystem path from `getProjectRoot()`) as the canonical workspace identifier on events, since it's available in both HTTP request contexts (via `withWorkspace()` → `runWithProjectRoot()`) and background process contexts (the auto-advance sweeper already iterates with `runWithProjectRoot(root, sweepWorkspace)`).

**Changes made:**

1. **`lib/workflow-events.ts`** — Added `workspaceRoot: string` to every `WorkflowEvent` variant. The `emitItem*` helpers call `getProjectRoot()` at emit time to tag each event.

2. **`lib/activity-log.ts`** — `appendActivity()` now includes `workspaceRoot: getProjectRoot()` in the emitted `item-activity` event.

3. **`app/api/activity/events/route.ts`** — Captures `wsRoot = getProjectRoot()` at SSE connection time (inside `withWorkspace()`), then filters: events with a non-matching `workspaceRoot` are dropped. The `workspaceRoot` field is stripped from the SSE payload to avoid leaking internal paths to the client.

4. **`app/api/workflows/[id]/events/route.ts`** — Same workspace filter pattern. Additionally:
   - The chokidar watcher key is now `${workspaceRoot}:${workflowId}` (already was) to prevent cross-workspace watcher collisions.
   - Watcher callbacks (`emitForPath`, `unlink`) are wrapped in `runWithProjectRoot(workspaceRoot, ...)` so that `getProjectRoot()` inside `emitItemUpdated`/`emitItemDeleted` returns the correct workspace even though the callbacks fire outside `AsyncLocalStorage` context.

5. **`lib/auto-advance-sweeper.ts`** — No changes needed. The sweeper already wraps each workspace iteration in `runWithProjectRoot(root, sweepWorkspace)`, so all events emitted during a sweep naturally carry the correct `workspaceRoot`.

**Deviations from spec:** The spec references `workspaceId` (UUID); we use `workspaceRoot` (absolute path) instead because it's directly available from `getProjectRoot()` without an extra lookup. Both are 1:1 with a workspace and the absolute path is what `withWorkspace()` resolves the cookie to. This avoids introducing a reverse-lookup from path→UUID.

## Validation

Validated by reading `lib/workflow-events.ts`, `lib/activity-log.ts`, `app/api/activity/events/route.ts`, `app/api/workflows/[id]/events/route.ts`, `lib/auto-advance-sweeper.ts`, and `lib/workspace-context.ts`.

### Criterion 1 — Cross-workspace SSE isolation (stage move)
✅ Both SSE routes guard with `if (evt.workspaceRoot !== wsRoot) return` before forwarding (`activity/events/route.ts:40`, `workflows/[id]/events/route.ts:156`). Events from W2 carry W2's root and are dropped by W1's listener.

### Criterion 2 — Same-name workflow disambiguation in per-workflow SSE
✅ `workflows/[id]/events/route.ts:155-159`: workspace check runs *before* workflowId check. Even when both workspaces share the name `requirements`, the workspace filter prevents cross-contamination.

### Criterion 3 — Global activity SSE scoped to matching workspace
✅ `activity-log.ts:99` emits with `workspaceRoot: getProjectRoot()`; `activity/events/route.ts:40` drops non-matching events.

### Criterion 4 — Background emitters tag events with originating workspace
✅ Sweeper wraps each workspace iteration in `runWithProjectRoot(root, sweepWorkspace)` (`auto-advance-sweeper.ts:67`). Chokidar `emitForPath` and `unlink` callbacks are wrapped in `runWithProjectRoot(workspaceRoot, ...)` (`workflows/[id]/events/route.ts:74,96`), so `getProjectRoot()` inside `emitItemUpdated`/`emitItemDeleted` resolves correctly.

### Criterion 5 — Missing cookie does not broadcast all workspaces
⚠️ `workspace-context.ts:22`: when `resolveWorkspaceRoot()` returns `null`, `withWorkspace` calls the handler without wrapping in `runWithProjectRoot`. `getProjectRoot()` falls back to the server-wide default root. The SSE stream then forwards only events matching that default — not all workspaces. The spec required the connection to be refused or stream zero events; the implementation instead streams events from the fallback workspace. This is benign (no broadcast to all workspaces) but diverges from the strict spec wording. **Follow-up:** consider explicitly reading the cookie and returning a 401/empty stream when it's absent.

### Criterion 6 — REST endpoints unaffected after fix
✅ No changes were made to REST endpoints; they remain scoped via `withWorkspace()` + `getProjectRoot()`.

### Criterion 7 — Same-workspace tabs both receive events
✅ The filter `evt.workspaceRoot !== connectionWorkspaceRoot` only drops events from *different* workspaces. Two tabs on the same workspace resolve to the same root and both pass the filter.

### Summary
6 of 7 criteria pass fully. AC5 is a minor partial — the missing-cookie path falls back to the default workspace instead of refusing or producing no events, but does not broadcast across all workspaces. The core cross-workspace isolation bug is fully resolved.
