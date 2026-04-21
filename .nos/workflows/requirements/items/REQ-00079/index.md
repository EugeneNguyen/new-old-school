current

* When an item move into next stage in 1 workspace, the other browser in different workspace will show up the item. after refresh it will disappeared

desired

* that kind of event will be workspace-siloed. the signal from this browser in this workspace should not go to the other browswer in other workspace

## Brainstorming

### 1. Clarify — What do we really mean? What does this exclude?

**Q1: What exactly constitutes a "workspace" boundary in the context of events?**

*Thinking:* The system has a `nos_workspace` cookie that identifies the active workspace per browser session. We need to be precise about whether "workspace" means the registered workspace entry in `workspaces.yaml` (identified by UUID) or the physical directory path. If two workspaces point to the same directory, should they see each other's events?

*Recommended answer:* A workspace boundary is defined by the workspace UUID (the `nos_workspace` cookie value). Even if two workspace entries happened to reference the same path, each browser session should only receive events that originate from operations tagged with its own workspace ID. In practice, two workspaces sharing a path is an edge case that should be treated as a configuration error.

---

**Q2: Is the issue limited to stage transitions, or does it affect all event types (item-created, item-deleted, item-activity)?**

*Thinking:* The user reported the bug specifically for stage moves, but the underlying mechanism — the shared `EventEmitter` with no workspace qualifier — affects ALL event types equally. If we only fix stage-move events, other cross-workspace leaks would remain.

*Recommended answer:* The fix must cover all event types (`item-updated`, `item-created`, `item-deleted`, `item-activity`). The root cause is systemic: the `WorkflowEvent` type has no `workspaceId` field, so no listener can filter by workspace. Fixing only stage transitions would leave the same bug dormant for other operations.

---

**Q3: Does "other browser in different workspace" mean a different browser window, or could it also be a different tab in the same browser?**

*Thinking:* The `nos_workspace` cookie scopes the workspace per browser (or per cookie jar). If two tabs in the same browser are set to different workspaces, the cookie will be the same for both (cookies are per-domain, not per-tab). We need to understand if multi-workspace within the same browser is a supported scenario.

*Recommended answer:* The current cookie-based workspace identification is per-browser-domain, not per-tab. If a user switches workspaces in one tab, the cookie changes for all tabs. This means the problem described is specifically about **separate browsers** (or separate profiles/incognito sessions) each with their own `nos_workspace` cookie pointing to different workspaces. The fix should not need to handle multiple workspaces within the same cookie jar.

---

**Q4: What does "show up the item" mean precisely — does the item appear in the correct stage or the wrong stage, or does a phantom item appear that doesn't exist in that workspace at all?**

*Thinking:* Since workflow IDs (like `requirements`) are the same string across workspaces, an `item-updated` event from workspace A with `workflowId: "requirements"` will pass the workflow-ID filter in workspace B's SSE listener. The item ID (e.g., `REQ-00079`) likely doesn't exist in workspace B, so it appears as a new phantom item. On refresh, the full REST fetch returns only workspace B's actual items, making the phantom disappear.

*Recommended answer:* A phantom item materializes briefly in the other workspace's Kanban board because the SSE event payload contains an `item` object that `mergeWorkflowItem()` inserts into React state. Since the item doesn't exist in that workspace's filesystem, a full resync (refresh) removes it. The item appears in whatever stage the event payload specifies.

---

**Q5: Should events between workspaces ever be intentionally shared (e.g., for a "global activity feed" feature)?**

*Thinking:* If the system later needs a cross-workspace view (admin dashboard showing all workspace activity), siloing events at the emitter level could make that harder. We should decide if the fix goes in the emitter (add workspace to event payload) or the listener (SSE endpoint filters by workspace).

*Recommended answer:* No cross-workspace event sharing is needed currently. However, the fix should add `workspaceId` (or `workspaceRoot`) to the event payload rather than partitioning the emitter itself, so a future global admin listener could still subscribe to all events if needed.

---

### 2. Probe assumptions — What are we taking for granted?

**Q1: We assume `workflowId` is NOT unique across workspaces — is that confirmed?**

*Thinking:* The current SSE listener filters only by `workflowId` (line 150-151 of the events route). If workflow IDs happened to be globally unique (UUIDs), the filter would already be sufficient. But the system uses human-readable names like `requirements` which are identical across workspaces.

*Recommended answer:* Confirmed. Workflow IDs are directory names under `.nos/workflows/` (e.g., `requirements`), chosen by the user or project template. They are virtually guaranteed to collide across workspaces. The `workflowId` filter alone is insufficient for workspace isolation.

---

**Q2: We assume the chokidar file watcher is the only source of events. Is that true?**

*Thinking:* Events can also originate from direct API calls (e.g., PATCH to move an item) which call `updateItemMeta` → `emitItemUpdated`. The auto-advance sweeper also emits events. All paths go through the same shared emitter. The watcher is just one source; the problem is at the emitter level, not the watcher level.

*Recommended answer:* No — there are three event sources: (1) chokidar file watchers detecting filesystem changes, (2) API mutation handlers calling `emitItemUpdated`/`emitItemCreated` directly, and (3) the auto-advance sweeper calling `updateItemMeta`. All three feed the same shared `EventEmitter` without workspace context. The fix must cover all three sources.

---

**Q3: We assume the `auto-advance-sweeper` iterating all workspaces is the primary trigger. Could the chokidar watcher itself be cross-workspace?**

*Thinking:* `acquireWatcher` uses `getProjectRoot()` to build the glob path. If the watcher is acquired inside `withWorkspace()`, it watches the correct workspace's files. But if two SSE connections from different workspaces both request `workflowId: "requirements"`, the watcher key is just `"requirements"` (line 39: `watchers.get(workflowId)`) — no workspace qualifier. The SECOND connection reuses the FIRST workspace's watcher.

*Recommended answer:* Yes — the watcher map is keyed by `workflowId` alone, not by `(workspaceId, workflowId)`. If workspace A connects first and creates a watcher for `requirements` pointing at `/path/A/.nos/workflows/requirements/items/*/meta.yml`, then workspace B's connection increments the ref count but does NOT create a new watcher for its own path. Workspace B's SSE stream would never receive filesystem events from its own workspace, and workspace A's filesystem events leak to workspace B via the shared emitter. This is a second bug layered on top of the emitter issue.

---

**Q4: We assume there's a single Node.js process serving all workspaces. What if the deployment model changes?**

*Thinking:* The current architecture uses a single Next.js dev server (`localhost:30128`) serving all workspaces in one process. If workspaces were ever served by separate processes, the shared `EventEmitter` isolation would come for free. But the in-process model is a deliberate design choice for simplicity.

*Recommended answer:* Single-process is the intended model. The fix should work within this constraint. Splitting into per-workspace processes would be over-engineering for a local dev tool.

---

**Q5: We assume the `nos_workspace` cookie is reliably present on SSE requests. Is it?**

*Thinking:* `EventSource` in browsers automatically sends cookies for same-origin requests. Since the SSE endpoint is on the same origin as the dashboard, the `nos_workspace` cookie should be included. But if there's any scenario where it's missing (e.g., programmatic clients), the workspace can't be resolved.

*Recommended answer:* Yes — `EventSource` sends cookies automatically for same-origin. The `withWorkspace()` wrapper on the SSE route already resolves the workspace from the cookie. The workspace identity is available at SSE connection time; it just isn't used for event filtering.

---

### 3. Find reasons and evidence — Why do we believe this is needed?

**Q1: What is the user impact of phantom items appearing and disappearing?**

*Thinking:* A phantom item briefly appearing in a Kanban board can cause confusion ("did someone add something?"), false notifications (the done-sound plays), and erosion of trust in the system's reliability.

*Recommended answer:* The impact is moderate but trust-eroding: (1) users see items that don't belong to their workspace and may investigate or take action on them, (2) the "done" sound/notification fires for events in other workspaces, (3) on refresh the items vanish, making the system feel buggy and unreliable. For a developer tool this undermines confidence in the workflow state.

---

**Q2: How frequently does this occur in practice?**

*Thinking:* The auto-advance sweeper runs on a heartbeat interval and iterates ALL workspaces. Every time it flips an item's status in any workspace, it emits an event that leaks to all connected SSE clients. If multiple workspaces are active simultaneously, this happens on every status transition.

*Recommended answer:* It occurs every time the sweeper processes any workspace while another workspace has a browser connected. Given the sweeper runs continuously, this is frequent during active multi-workspace usage — potentially multiple times per minute.

---

**Q3: Is there evidence this is causing data corruption or just visual glitches?**

*Thinking:* The phantom item appears via `mergeWorkflowItem()` in React state, which is ephemeral. No writes go to disk from SSE events (the browser is a read-only consumer of events). So there's no data corruption — purely a visual/UX issue.

*Recommended answer:* No data corruption. The browser is a read-only consumer of SSE events. The phantom items exist only in React state and vanish on refresh. However, if a user drags a phantom item (triggering a PATCH), that could create a real item in the wrong workspace — though this is unlikely since the item ID wouldn't resolve on the server.

---

**Q4: Could this explain other reported anomalies beyond the one described?**

*Thinking:* If the watcher map is also not workspace-qualified (as discovered in assumption Q3), a workspace B client might never receive its OWN filesystem events — only workspace A's events. This could manifest as "items don't update in real-time" for the second workspace to connect.

*Recommended answer:* Yes — the shared watcher keyed only by `workflowId` means the second workspace to connect for the same workflow name gets no file-watch events from its own directory. This likely causes a separate bug: real-time updates appear broken for workspaces that connect after another workspace has already established a watcher for the same workflow ID.

---

### 4. Explore alternatives — What else might be true?

**Q1: Could we solve this at the EventSource URL level by including the workspace ID in the path?**

*Thinking:* Instead of adding workspace to the event payload, we could make the SSE URL workspace-specific: `/api/workspaces/{wsId}/workflows/{id}/events`. The route handler would then only watch files in that workspace's directory. This makes the URL self-describing but requires API restructuring.

*Recommended answer:* This is a valid approach but higher-cost. The current API structure doesn't namespace by workspace in the URL (workspace comes from the cookie). Restructuring all API routes would be a large change. The simpler fix is to add `workspaceRoot` or `workspaceId` to the event payload and filter at the SSE listener, and qualify the watcher map key with the workspace path.

---

**Q2: Could we use separate EventEmitter instances per workspace instead of a global one?**

*Thinking:* A map of `workspaceId → EventEmitter` would provide natural isolation. But then emitters (like `emitItemUpdated`) would need to know which workspace they're in, which means threading workspace context through all callers.

*Recommended answer:* Feasible but invasive. The `emitItemUpdated` function is called from `workflow-store.ts` where `getProjectRoot()` is available (giving the workspace path). A workspace-keyed emitter map is clean but requires changing all emit sites and all listener sites. The lighter approach is: keep one emitter, add a `workspaceRoot` field to the event, and filter on the listener side.

---

**Q3: Could we solve this purely on the client side by comparing item IDs against the local item list?**

*Thinking:* The browser could ignore SSE events for item IDs it hasn't seen before (treating them as phantom). But this would also suppress legitimate `item-created` events for items created by other agents/users in the same workspace.

*Recommended answer:* No — client-side filtering would break the `item-created` event type. The browser legitimately needs to accept events for item IDs it hasn't seen before (new items). The filtering must happen server-side where workspace identity is known.

---

**Q4: Could the watcher key simply be changed to `${workspaceRoot}:${workflowId}` as a minimal fix?**

*Thinking:* Qualifying the watcher key with the workspace root would ensure each workspace gets its own chokidar watcher watching its own directory. Combined with adding `workspaceRoot` to emitted events, this would fix both the watcher-sharing bug and the event-leaking bug.

*Recommended answer:* Yes — this is the minimal viable fix for the watcher bug. Combined with adding a workspace identifier to `WorkflowEvent` and filtering in the SSE listener, it addresses both root causes. The watcher key should be the full filesystem path prefix to avoid any ambiguity.

---

**Q5: Should the fix also address the global activity SSE endpoint (`/api/activity/events`)?**

*Thinking:* The global activity endpoint at `app/api/activity/events/route.ts` also listens on the shared emitter and streams `item-activity` events. It's wrapped in `withWorkspace()` so it knows which workspace the client belongs to. If it doesn't filter events by workspace, the same cross-workspace leak occurs for the activity feed.

*Recommended answer:* Yes — the activity SSE endpoint has the same vulnerability. It should also filter incoming events by workspace. The fix should be applied consistently across both SSE endpoints.

---

### 5. Explore implications — If true, then what else follows?

**Q1: If we add `workspaceRoot` to events, does that expose filesystem paths to the browser?**

*Thinking:* The browser receives the SSE event payload. If `workspaceRoot` is `/Users/alice/projects/foo`, that leaks the server's filesystem layout to the client. This is a local dev tool so it's low-risk, but it's still worth considering.

*Recommended answer:* Since this is a local dev tool (server and browser on the same machine), exposing the workspace path in events is acceptable. However, if preferred, we could filter server-side (compare the event's workspace to the SSE connection's workspace before sending) so the `workspaceRoot` field never reaches the browser at all. This is the cleaner approach.

---

**Q2: If the watcher map key includes workspace, what happens when no SSE clients are connected for a workspace?**

*Thinking:* The ref-counting mechanism (`acquireWatcher`/`releaseWatcher`) already handles this — when refs drop to 0, the watcher is closed. Qualifying the key by workspace doesn't change this behavior; it just means the map has more entries (one per workspace×workflow combination).

*Recommended answer:* No change to lifecycle behavior. The ref-counting cleanup still works. The map just holds workspace-qualified keys. Each workspace's watcher is independently acquired and released.

---

**Q3: If we filter events server-side in the SSE listener, does this affect the auto-advance sweeper's ability to emit events?**

*Thinking:* The sweeper runs `runWithProjectRoot(ws.absolutePath, ...)` for each workspace. Inside that context, `getProjectRoot()` returns the correct workspace path. If `emitItemUpdated` is modified to include the workspace root (by calling `getProjectRoot()` at emit time), the event will carry the correct workspace. The SSE listener then filters by comparing the event's workspace to the connection's workspace.

*Recommended answer:* No negative impact. The sweeper already runs in the correct workspace context. Events it emits will naturally carry the correct workspace root. The SSE listener for workspace B will simply ignore events tagged with workspace A's root. The sweeper's functionality is unchanged.

---

**Q4: Does this fix need to account for hot-module-reloading (HMR) in development?**

*Thinking:* The `globalThis.__nosWorkflowEvents` and `globalThis.__nosWorkflowWatchers` patterns exist specifically to survive HMR. Adding workspace-qualified keys to the watcher map doesn't change HMR resilience. The event payload change is purely additive.

*Recommended answer:* No special HMR consideration needed. The globalThis singletons already survive HMR. The changes (workspace in event payload, workspace-qualified watcher keys) are compatible with the existing HMR strategy.

---

**Q5: If we implement this fix, should we also add a workspace field to `ActivityEntry` for consistency?**

*Thinking:* `ActivityEntry` is written to `activity.jsonl` per-workspace (since `appendActivity` uses `getProjectRoot()` to find the file). But when emitted as a `WorkflowEvent`, it loses workspace context. Adding workspace to either the `ActivityEntry` type or wrapping it in the event payload would make the fix consistent.

*Recommended answer:* The `item-activity` event should carry workspace context just like other event types. Rather than modifying `ActivityEntry` (which is a persisted format), the workspace should be added at the `WorkflowEvent` level — i.e., add `workspaceRoot: string` to all variants of the `WorkflowEvent` union type. This keeps the fix uniform and doesn't change the on-disk activity log format.

## Specification

### User Stories

1. **As a** developer working in workspace A, **I want** SSE events to only contain items from my workspace, **so that** phantom items from other workspaces never appear on my Kanban board or activity feed.

2. **As a** developer running multiple workspaces simultaneously, **I want** each browser session's real-time updates to be isolated to its own workspace, **so that** I can trust the board state without needing to refresh.

3. **As a** developer whose workspace connects to the SSE endpoint after another workspace has already connected for the same workflow name, **I want** my browser to receive file-watch events from my own workspace's directory, **so that** real-time updates work correctly regardless of connection order.

### Acceptance Criteria

1. **Given** two browser sessions connected to different workspaces, **when** an item moves stages in workspace A, **then** workspace B's SSE stream receives no event for that item.

2. **Given** two browser sessions connected to different workspaces with the same workflow ID (e.g., `requirements`), **when** an item is created in workspace A, **then** no phantom item appears in workspace B's Kanban board.

3. **Given** two browser sessions connected to different workspaces, **when** an item is deleted in workspace A, **then** workspace B's SSE stream receives no `item-deleted` event for that item.

4. **Given** two browser sessions connected to different workspaces, **when** the auto-advance sweeper processes workspace A and emits an `item-activity` event, **then** workspace B's activity feed SSE stream does not receive that event.

5. **Given** workspace B connects to the SSE endpoint for workflow `requirements` after workspace A has already connected for the same workflow ID, **when** a file changes in workspace B's `.nos/workflows/requirements/items/` directory, **then** workspace B's SSE stream receives the corresponding event (i.e., the chokidar watcher watches workspace B's own directory, not workspace A's).

6. **Given** a single workspace with multiple browser tabs (same cookie jar), **when** an item is updated, **then** all tabs for that workspace still receive the event as before (no regression).

7. **Given** an SSE connection from a browser with no `nos_workspace` cookie (default workspace), **when** events are emitted from the default project root, **then** the connection receives those events (fallback behavior preserved).

8. **Given** the fix is deployed, **when** the browser receives an SSE event payload, **then** the payload does not contain the `workspaceRoot` field (server-side filtering only; filesystem paths are not leaked to the client).

### Technical Constraints

1. **Event type shape** — Add a `workspaceRoot: string` field to every variant of the `WorkflowEvent` union type in `lib/workflow-events.ts`. This field is used exclusively for server-side filtering and must be stripped before serialization to the SSE stream.

2. **Emit-site tagging** — Each emit function (`emitItemUpdated`, `emitItemCreated`, `emitItemDeleted`) must call `getProjectRoot()` at emit time to populate `workspaceRoot`. The `item-activity` emission in `lib/activity-log.ts` must do the same. All emit sites already run inside `runWithProjectRoot()` or `withWorkspace()` context, so `getProjectRoot()` is available without new plumbing.

3. **SSE listener filtering** — Both SSE route handlers must:
   - Capture the connection's workspace root at setup time (via the already-resolved `withWorkspace()` context).
   - In the `listener` callback, compare `evt.workspaceRoot` to the connection's workspace root and drop mismatches before calling `safeEnqueue`.
   - Files affected: `app/api/workflows/[id]/events/route.ts` and `app/api/activity/events/route.ts`.

4. **Watcher map key qualification** — `acquireWatcher` and `releaseWatcher` in `lib/workflow-events.ts` must key the watcher map by `${workspaceRoot}:${workflowId}` instead of `workflowId` alone. `acquireWatcher` should accept an explicit `workspaceRoot` parameter (passed from the SSE route handler) rather than relying on AsyncLocalStorage at call time.

5. **No changes to persisted formats** — The on-disk `ActivityEntry` shape in `activity.jsonl` must not change. The `workspaceRoot` field exists only on the in-memory `WorkflowEvent`.

6. **HMR compatibility** — The `globalThis.__nosWorkflowEvents` and `globalThis.__nosWorkflowWatchers` singletons must continue to survive hot-module-reloading. The changes (workspace-qualified watcher keys, additive event payload field) are compatible with the existing HMR strategy.

7. **Single-process model** — The solution must work within the single Node.js process serving all workspaces. No process-per-workspace isolation.

8. **Files to modify:**
   | File | Change |
   |---|---|
   | `lib/workflow-events.ts` | Add `workspaceRoot` to `WorkflowEvent` union; add `workspaceRoot` param to `acquireWatcher`/`releaseWatcher`; qualify watcher map key |
   | `lib/workflow-store.ts` | Pass `getProjectRoot()` into emit calls |
   | `lib/activity-log.ts` | Add `workspaceRoot` to `item-activity` event emission |
   | `app/api/workflows/[id]/events/route.ts` | Capture workspace root; filter listener by `workspaceRoot`; strip `workspaceRoot` before sending; pass `workspaceRoot` to `acquireWatcher` |
   | `app/api/activity/events/route.ts` | Capture workspace root; filter listener by `workspaceRoot`; strip `workspaceRoot` before sending |

9. **Files to verify (no changes expected):**
   | File | Verification |
   |---|---|
   | `lib/workspace-context.ts` | Confirm `getProjectRoot()` is available inside all emit-site contexts |
   | `lib/auto-advance-sweeper.ts` | Confirm it calls `runWithProjectRoot()` per workspace before sweeping |
   | `lib/auto-advance.ts` | Confirm `updateItemMeta()`/`appendActivity()` run inside correct workspace context |
   | `lib/use-workflow-items.ts` | Client-side SSE consumer — no changes needed since filtering is server-side |

### Out of Scope

1. **API URL restructuring** — No namespace-by-workspace in the URL (e.g., `/api/workspaces/{wsId}/workflows/...`). The cookie-based workspace resolution is sufficient.

2. **Per-workspace EventEmitter instances** — The fix uses one shared emitter with payload-level filtering. Splitting into workspace-keyed emitters is more invasive and blocks a future cross-workspace admin view.

3. **Client-side workspace filtering** — All filtering happens server-side. The browser remains a passive consumer of its SSE stream.

4. **Multi-workspace within the same browser** — The `nos_workspace` cookie is per-domain. Supporting multiple workspaces in different tabs of the same browser requires a fundamentally different identification mechanism and is not part of this fix.

5. **ActivityEntry on-disk format changes** — The `workspaceRoot` field lives only on the transient `WorkflowEvent` type, not in persisted `activity.jsonl` entries.

6. **Cross-workspace admin/global feed** — No global view that intentionally shows events from all workspaces. The architecture (workspace on the event payload, server-side filter) preserves the option to add one later.

## Analysis

### 1. Scope

**In scope:**

- **Add `workspaceRoot` to `WorkflowEvent` type** — all variants of the union in `lib/workflow-events.ts` must carry a `workspaceRoot: string` field so listeners can determine event origin.
- **Tag events at emit sites** — `emitItemUpdated`, `emitItemCreated`, `emitItemDeleted`, and the `item-activity` emission in `lib/activity-log.ts:99` must call `getProjectRoot()` at emit time and attach it to the event payload.
- **Filter events in SSE listeners** — both SSE endpoints must compare the incoming event's `workspaceRoot` against the connection's resolved workspace root (from `withWorkspace()`), dropping events from foreign workspaces before enqueuing them.
  - `app/api/workflows/[id]/events/route.ts` — the per-workflow listener (lines 148-154).
  - `app/api/activity/events/route.ts` — the global activity listener (lines 36-39).
- **Qualify the chokidar watcher map key** — `acquireWatcher`/`releaseWatcher` in `lib/workflow-events.ts` key the watcher map by `workflowId` alone. The key must become `${workspaceRoot}:${workflowId}` so each workspace gets its own file watcher pointing at the correct directory.

**Out of scope:**

- Restructuring the API URL scheme to include workspace IDs (e.g., `/api/workspaces/{wsId}/workflows/...`). The cookie-based workspace resolution is sufficient.
- Splitting the process-wide `EventEmitter` into per-workspace instances. One emitter with payload-level filtering is simpler and preserves the option for a future cross-workspace admin view.
- Client-side workspace filtering. The server should prevent foreign events from reaching the wire.
- Changes to the persisted `ActivityEntry` format in `activity.jsonl`.
- Multi-workspace-within-same-browser support (the cookie model is per-domain, not per-tab; this is by design).

### 2. Feasibility

**Viability: High.** The fix is surgical and additive:

- The `getProjectRoot()` call is already available at every emit site (the emitters run inside `runWithProjectRoot()` context, either from API handlers via `withWorkspace()` or from the sweeper via explicit `runWithProjectRoot()` calls).
- The SSE endpoints already resolve the workspace root via `withWorkspace()` at connection setup time — the workspace identity just needs to be captured in a closure and compared against incoming events.
- The watcher map key change is a one-line adjustment in `acquireWatcher()` and `releaseWatcher()`.

**Risks:**

- **Watcher glob path correctness:** When qualifying the watcher key, `acquireWatcher` must also ensure the chokidar glob uses the correct workspace root. Currently the glob is built from `getProjectRoot()` at acquisition time, so if `acquireWatcher` is called inside the right workspace context, this works naturally. Must verify that all `acquireWatcher` call sites run inside `runWithProjectRoot()` or `withWorkspace()`.
- **Default workspace (no cookie):** If `resolveWorkspaceRoot()` returns `null` (no `nos_workspace` cookie), `getProjectRoot()` falls back to the primary project root. Events from this "default" workspace and from an explicitly-registered workspace that happens to have the same path would both carry the same `workspaceRoot`. This is correct behavior — same path means same data.

**Unknowns:**

- None requiring a spike. The code paths are well-understood from the brainstorming phase.

### 3. Dependencies

**Internal modules touched:**

| File | Change |
|---|---|
| `lib/workflow-events.ts` | Add `workspaceRoot` to `WorkflowEvent` union; qualify watcher map key |
| `lib/workflow-store.ts` | Thread `getProjectRoot()` into `emitItemUpdated`, `emitItemCreated`, `emitItemDeleted` calls |
| `lib/activity-log.ts` | Add `workspaceRoot` to the `item-activity` event emission (~line 99) |
| `app/api/workflows/[id]/events/route.ts` | Capture workspace root at connection time; filter listener by `workspaceRoot` |
| `app/api/activity/events/route.ts` | Same: capture + filter |

**Internal modules read (no changes expected):**

| File | Reason |
|---|---|
| `lib/workspace-context.ts` | Provides `withWorkspace()`, `runWithProjectRoot()`, `getProjectRoot()` — consumed, not modified |
| `lib/auto-advance-sweeper.ts` | Calls `runWithProjectRoot()` per workspace before sweeping — already correct, just verify |
| `lib/auto-advance.ts` | Calls `updateItemMeta()` / `appendActivity()` inside correct workspace context — verify |
| `lib/use-workflow-items.ts` | Client-side SSE consumer — no changes needed since filtering happens server-side |

**External systems:** None. This is entirely within the Node.js process.

### 4. Open Questions

1. **Should `workspaceRoot` be stripped from the event payload before sending to the browser?** Exposing filesystem paths in SSE payloads is low-risk for a local dev tool, but stripping them keeps the API cleaner. The filter runs server-side, so the field is only needed inside the `listener` callback — it could be omitted from `safeEnqueue`. **Recommendation:** Strip it; the browser doesn't need it.

2. **Should `acquireWatcher` accept an explicit `workspaceRoot` parameter, or derive it from `getProjectRoot()` internally?** Passing it explicitly makes the call site clearer and avoids depending on AsyncLocalStorage context at call time. **Recommendation:** Pass explicitly from the SSE route handler where `withWorkspace()` has already resolved the root.

3. **The title of this item ("stage column order by last update time, desc") doesn't match the body (cross-workspace event leaking). Which is the intended requirement?** The body and brainstorming clearly address cross-workspace event isolation. The title may be a leftover or mismatch. **Recommendation:** Clarify with the requester; the analysis here covers the body's requirement (workspace-siloed events).

## Implementation Notes

All acceptance criteria addressed. Changes made:

1. **`lib/workflow-events.ts`** — Added `workspaceRoot: string` to every variant of the `WorkflowEvent` union. Each emit function (`emitItemUpdated`, `emitItemCreated`, `emitItemDeleted`) now calls `getProjectRoot()` at emit time and attaches it to the event payload.

2. **`lib/activity-log.ts`** — The `appendActivity` function now includes `workspaceRoot: getProjectRoot()` in the `item-activity` event emission.

3. **`app/api/workflows/[id]/events/route.ts`** — `acquireWatcher` and `releaseWatcher` now accept an explicit `workspaceRoot` parameter and key the watcher map by `${workspaceRoot}:${workflowId}`. The SSE listener captures the connection's workspace root at setup, filters events by comparing `evt.workspaceRoot` against it, and strips `workspaceRoot` from the payload before serialization.

4. **`app/api/activity/events/route.ts`** — Captures workspace root via `getProjectRoot()` inside `withWorkspace()`, filters `item-activity` events by workspace, and strips `workspaceRoot` before sending.

No changes to `workflow-store.ts` were needed — the emit functions already run inside the correct workspace context (via `runWithProjectRoot` or `withWorkspace`), so `getProjectRoot()` returns the right value at emit time.

No changes to persisted formats (`ActivityEntry`, `activity.jsonl`).

## Validation

### AC1 — Stage move in workspace A does not appear in workspace B's SSE stream
✅ **Pass** — `app/api/workflows/[id]/events/route.ts` line 156: `if (evt.workspaceRoot !== connectionWorkspaceRoot) return;` drops all events whose `workspaceRoot` doesn't match the SSE connection's resolved root. Any `item-updated` emitted by workspace A carries workspace A's root and is silently discarded before `safeEnqueue`.

### AC2 — Item created in workspace A does not produce phantom item in workspace B
✅ **Pass** — `emitItemCreated` in `lib/workflow-events.ts` line 41 attaches `workspaceRoot: getProjectRoot()`. The SSE workflow-events listener checks `evt.workspaceRoot` before enqueueing. Same workspace-filter logic covers `item-created`.

### AC3 — Item deleted in workspace A does not send `item-deleted` to workspace B
✅ **Pass** — `emitItemDeleted` (line 52) attaches `workspaceRoot`. The listener guard at line 156 of the events route applies to all event types including `item-deleted`.

### AC4 — Auto-advance sweeper activity events are workspace-siloed
✅ **Pass** — `lib/auto-advance-sweeper.ts` calls `runWithProjectRoot(root, sweepWorkspace)` per workspace (line 67), so `getProjectRoot()` inside `appendActivity` returns the correct root. `activity-log.ts` line 99 emits `{ type: 'item-activity', entry, workspaceRoot: getProjectRoot() }`. `app/api/activity/events/route.ts` line 40: `if (evt.workspaceRoot !== wsRoot) return;` drops cross-workspace activity events.

### AC5 — Workspace B gets its own chokidar watcher after workspace A already connected
✅ **Pass** — `acquireWatcher` in the events route (line 39) keys the watcher map by `${workspaceRoot}:${workflowId}`. Workspace B's key is distinct from workspace A's, so a new watcher is created pointing at workspace B's own glob path (lines 46-53). Each workspace independently watches its own `.nos/workflows/<id>/items/*/meta.yml`.

### AC6 — Same-workspace multi-tab regression check
✅ **Pass** — The workspace-root filter is an equality check: tabs sharing the same `nos_workspace` cookie resolve to the same `connectionWorkspaceRoot`, so events pass through unchanged. No regression.

### AC7 — Default workspace (no cookie) still receives events
✅ **Pass** — `withWorkspace()` falls back to `getProjectRoot()` (the primary project root) when no `nos_workspace` cookie is present. Both the emitter and the SSE listener resolve the same fallback path, so events match and are delivered.

### AC8 — `workspaceRoot` field stripped from browser-bound payloads
✅ **Pass** — Both SSE routes destructure `workspaceRoot` out before serialisation:
- `app/api/workflows/[id]/events/route.ts` line 160: `const { workspaceRoot: _, ...payload } = evt;`
- `app/api/activity/events/route.ts` line 41: `const { workspaceRoot: _, ...payload } = evt;`
The field never reaches the client.

### Additional checks

**TC5 — `ActivityEntry` on-disk format unchanged** ✅ — `activity-log.ts` `ActivityEntry` type (lines 18-30) has no `workspaceRoot` field. The `workspaceRoot` is added only to the transient `WorkflowEvent` at emit time.

**TC6 — HMR compatibility preserved** ✅ — `globalThis.__nosWorkflowEvents` and `globalThis.__nosWorkflowWatchers` singletons are unchanged. The watcher map now uses workspace-qualified string keys, which is fully compatible with the existing HMR survival pattern.

**TypeScript compilation** ✅ — `npx tsc --noEmit` exits cleanly with no errors.

**No regressions found.** All 8 acceptance criteria pass.
