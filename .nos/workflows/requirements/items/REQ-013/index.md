Build /dashboard/workflows/\[id] with a Kanban board driven by stages.yaml and items/.

## Analysis

### 1. Scope

**In scope**

* A Next.js route at `app/dashboard/workflows/[id]/page.tsx` that renders a per-workflow Kanban board.
* Column model driven by `.nos/workflows/<id>/config/stages.yaml` (ordered stages, each with name, description, optional prompt/agentId/autoAdvance/maxDisplayItems).
* Card model driven by `.nos/workflows/<id>/items/*/{meta.yml,index.md}`: cards grouped into columns by the item's current `stage`, with title, status badge (Todo / In Progress / Done / Failed), and agent pill.
* Card interactions: drag-and-drop between stage columns (persisted via `PATCH /api/workflows/[id]/items/[itemId]`), click to open the item detail dialog, "New item" affordance per column, per-stage detail/edit dialog.
* Live updates: incremental refresh from the workflow event stream (`/api/workflows/[id]/events`) so concurrent agent runs reflect into the board without a reload.
* Empty / not-found states: 404 when the workflow directory does not exist; empty-state message when no stages are configured.

**Out of scope (for this requirement)**

* Editing `stages.yaml` from the UI (stage config is still file-edited); creating or deleting workflows; cross-workflow views or search; analytics / burndown; permissions / auth; persisted per-user board preferences; mobile-specific layout tuning.

### 2. Feasibility

* Technically viable with the existing stack (Next.js App Router + server-side `readWorkflowDetail` + client `KanbanBoard`). Comparable plumbing already exists and is in use, so this is primarily a composition problem, not an R\&D one.
* Risks / unknowns:
  * **Stale state under concurrent writes.** Agents flipping status/stage via the skills race against optimistic UI updates. Mitigated by the existing SSE event stream + `updatedAt`-based `mergeItem`, but worth exercising under load.
  * **Large workflows.** `readWorkflowDetail` reads every item folder synchronously on each page load; hundreds of items could cause noticeable TTFB. `maxDisplayItems` on the stage mitigates render cost but not read cost.
  * **Drag-and-drop semantics.** When `autoAdvanceOnComplete` is true, a manual drop competes with the pipeline's own stage transitions — the UX contract (does a manual move re-trigger the stage prompt? mark status back to Todo?) needs to be explicit.
  * **Drag-and-drop UX.** Current implementation uses native HTML5 DnD; touch devices and accessibility (keyboard reordering, ARIA) are known weak points.
  * **Failed-state recovery.** Per the system prompt, a `Failed` item stays in stage and must be reset to `Todo` to re-run. The board must make this reset action discoverable.

### 3. Dependencies

* **Sibling requirements:** REQ-011 (workflow data model / file layout), REQ-012 (items + meta schema), REQ-014 (skills that mutate items), REQ-00018 (status transitions), plus newer stream/event and settings work. This requirement is the UI face of that substrate.
* **Code modules:** `lib/workflow-store.ts` (reads), `lib/workflow-events.ts` + `/api/workflows/[id]/events` (SSE), `/api/workflows/[id]/items/[itemId]` and `.../stages/[stageName]` (mutations), `/api/agents` (agent pill data), `types/workflow.ts`, shared UI primitives (`Badge`, `Button`, `cn`), `components/dashboard/{ItemDetailDialog,NewItemDialog,StageDetailDialog,Sidebar}`, `lib/hooks/use-item-done-sound`.
* **Filesystem contracts:** `.nos/workflows/<id>/config/stages.yaml` and `.nos/workflows/<id>/items/<itemId>/{meta.yml,index.md}`. The board is only as correct as these files; malformed YAML currently degrades to "no stages" rather than a surfaced error.
* **External systems:** none — everything is local FS + in-process SSE. No database, no auth provider.

### 4. Open questions

1. **Manual drag vs. auto-advance.** When the user drags a card from Analysis → Documentation, should the destination stage's prompt be (re-)executed, or is a manual move purely a status/stage mutation with no prompt trigger? Current behavior needs to be documented.
2. **Failed-item UX.** Is "reset to Todo" a single click on the card, a drag back to the same column, or only available in the detail dialog? The system prompt assumes operator intervention — the board should make the path obvious.
3. **Column ordering & Done truncation.** `maxDisplayItems` exists on Done — should other stages support it? How are hidden items surfaced (expand toggle, link to a list view)?
4. **Item ordering within a column.** Is order semantically meaningful (priority, FIFO by `updatedAt`, creation order), and should drag reorder within a column persist?
5. **Multi-workflow navigation.** Does the sidebar need to list workflows and deep-link into `/dashboard/workflows/[id]`, or is the URL the only entry point for this requirement?
6. **Concurrency signaling.** When an agent is actively running a stage on an item, should the card show a running/spinner indicator (beyond the `In Progress` badge) so users avoid racing the agent with a manual drag?
7. **Error surfacing.** Malformed `stages.yaml` or `meta.yml` currently results in silent empty/partial renders. Is a visible error banner in scope here, or deferred to a separate "workflow health" requirement?

## Specification

### User stories

1. As an operator, I want to open `/dashboard/workflows/[id]` for a workflow, so that I can see all stages and items for that workflow in a Kanban view.
2. As an operator, I want stage columns to be generated from `.nos/workflows/<id>/config/stages.yaml`, so that the board always matches the workflow's configured stage order and metadata.
3. As an operator, I want items to be grouped into columns by their current stage and shown with key metadata, so that I can understand item progress at a glance.
4. As an operator, I want to drag an item to a different stage, so that I can manually move work through the workflow.
5. As an operator, I want to open item and stage detail dialogs from the board, so that I can inspect and edit workflow data without leaving the page.
6. As an operator, I want live board updates from the workflow event stream, so that I can see agent-driven changes without manually refreshing.
7. As an operator, I want failed items to expose an obvious recovery path, so that I can reset them to `Todo` and re-run stage work when needed.
8. As an operator, I want clear empty and not-found states, so that I can distinguish between a missing workflow and a workflow that has no configured stages.

### Acceptance criteria

1. **Route rendering**
   * Given a workflow id whose directory exists under `.nos/workflows/<id>`, when a user visits `/dashboard/workflows/[id]`, then the app renders a workflow-specific Kanban page for that id.
   * Given a workflow id whose directory does not exist, when a user visits `/dashboard/workflows/[id]`, then the route returns the app's 404 state.
2. **Stage source of truth**
   * Given `.nos/workflows/<id>/config/stages.yaml` contains an ordered list of stages, when the page loads, then the board renders one column per configured stage in the same order as the file.
   * Each rendered column must expose the stage's `name` and `description`.
   * If a stage defines `agentId`, `prompt`, `autoAdvance`, or `maxDisplayItems`, those values must be available to the UI features that display or edit stage details.
3. **Empty stage configuration**
   * Given the workflow exists and `stages.yaml` contains no configured stages, when the page loads, then the board does not render normal columns and instead shows an empty-state message explaining that no stages are configured.
4. **Item source of truth**
   * Given item directories exist at `.nos/workflows/<id>/items/<itemId>/`, when the page loads, then the board reads each item's `meta.yml` and `index.md` and maps the item into the column whose stage matches the item's current `stage` value.
   * Each card must display the item's title.
   * Each card must display the item's current status badge.
   * Each card must display the assigned agent pill when agent data is available.
5. **Supported statuses**
   * The UI must represent item statuses `Todo`, `In Progress`, `Done`, and `Failed`.
   * If an item is in `Failed`, the board must keep the item in its current stage rather than auto-moving it.
6. **Card opening behavior**
   * Given a visible item card, when the user clicks the card, then the item detail dialog opens for that item.
   * The item detail dialog must show enough item detail to inspect and perform supported item edits already provided by the existing dialog component.
7. **New item affordance**
   * Given a rendered stage column, when the user uses the column's "New item" affordance, then the new-item dialog opens with that stage as the creation context.
8. **Stage detail affordance**
   * Given a rendered stage column, when the user opens stage details, then the stage detail dialog opens for that stage.
   * The dialog may expose stage metadata for viewing and any stage edits already supported by the existing stage dialog and backing API.
   * Editing `stages.yaml` directly as a generic file editor is not required.
9. **Manual stage movement**
   * Given a card is dragged from one stage column to another, when the drop is completed on a valid destination column, then the client sends a stage mutation through `PATCH /api/workflows/[id]/items/[itemId]` and updates the board to reflect the destination stage.
   * A manual drag changes the item's persisted `stage` only; it must not implicitly execute a stage prompt, spawn an agent, or otherwise trigger stage pipeline work.
   * If the destination stage differs from the source stage, the item's status must be reset to `Todo` as part of the persisted mutation so that the operator can explicitly re-run stage work from the new stage.
   * Dragging within the same column does not persist a reorder and does not change item data.
10. **Failed-item recovery**
    * Given an item is in status `Failed`, when the operator uses the supported recovery control in the item detail dialog, then the item can be reset to `Todo` without changing its stage.
    * The board must make this recovery path discoverable from the card or dialog; a hidden or undocumented recovery path does not satisfy the requirement.
11. **Live updates**
    * Given `/api/workflows/[id]/events` emits item or stage changes for the current workflow, when the client receives those events, then the visible board updates incrementally without a full page reload.
    * Given a concurrent agent run changes an item's status, stage, title, or other displayed metadata, when the corresponding event arrives, then the card reflects the latest server state.
    * Client-side optimistic updates must reconcile with event-stream updates using the latest server timestamp/state rather than permanently favoring stale local state.
12. **Concurrency visibility**
    * Given an item status is `In Progress`, when the card renders, then the UI must make that state visible via the status badge.
    * A dedicated spinner or separate running indicator is optional for this requirement.
13. **Column item limits**
    * Given a stage defines `maxDisplayItems`, when the number of items in that stage exceeds the limit, then the board may truncate the visible list to that limit.
    * This requirement only guarantees `maxDisplayItems` support where the current stage configuration and UI already use it; it does not require a generalized hidden-items explorer for every stage.
14. **Item ordering**
    * Item ordering within a column must be deterministic.
    * The implementation may order items by existing workflow-store behavior, such as creation or update order, but this requirement does not require persistent manual reordering.
15. **Navigation scope**
    * The requirement is satisfied if `/dashboard/workflows/[id]` is reachable by direct URL.
    * Sidebar workflow discovery links are optional unless already supported by the existing sidebar implementation.
16. **Error handling scope**
    * Given malformed workflow files cause stages or items to be unreadable, the board may degrade to empty or partial rendering consistent with current workflow-store behavior.
    * Visible workflow-health error banners are not required by this requirement.
17. **No full-page refresh requirement**
    * After successful item mutations or incoming workflow events, the user must not be required to manually reload the page to see the updated board state.

### Technical constraints

* The page must be implemented at `app/dashboard/workflows/[id]/page.tsx` within the Next.js App Router.
* Workflow data must come from the filesystem-backed workflow store, specifically `.nos/workflows/<id>/config/stages.yaml` and `.nos/workflows/<id>/items/<itemId>/{meta.yml,index.md}`.
* Stage definitions must preserve configured order and support these fields when present: `name`, `description`, `prompt`, `agentId`, `autoAdvance`, and `maxDisplayItems`.
* Item cards and dialogs must use the existing workflow domain types from `types/workflow.ts` and existing read logic in `lib/workflow-store.ts` rather than introducing a second workflow data model.
* Live synchronization must use the existing workflow event stream at `/api/workflows/[id]/events`.
* Item mutations must use the existing item update API at `PATCH /api/workflows/[id]/items/[itemId]`.
* Stage detail interactions must use the existing stage API surface at `/api/workflows/[id]/stages/[stageName]` where applicable.
* The board UI must compose with the existing dashboard components and shared primitives, including `components/dashboard/KanbanBoard.tsx`, `ItemDetailDialog.tsx`, `NewItemDialog.tsx`, `StageDetailDialog.tsx`, `Sidebar.tsx`, and shared UI primitives already used by the dashboard.
* The implementation must remain compatible with concurrent local agent activity, meaning server-originated changes can arrive at any time and must be merged into the visible board state.
* Native HTML5 drag-and-drop is acceptable for this requirement; touch-specific drag support and keyboard-accessible reordering are not required.
* The solution must not require a database, external queue, auth provider, or external service; it must operate against local filesystem data and in-process SSE only.
* Large-workflow optimization beyond the current read path is not required. The requirement does not mandate performance work beyond keeping the existing board usable with the current store and `maxDisplayItems` behavior.

### Out of scope

* Editing `stages.yaml` as a raw file or full workflow-stage authoring from the UI.
* Creating or deleting workflows.
* Cross-workflow boards, global search, analytics, burndown, or reporting views.
* Auth, permissions, and multi-user access control.
* Persisted per-user board preferences.
* Mobile-specific layout tuning, touch drag support, or keyboard-accessible drag-and-drop.
* Persisted manual item reordering within a stage.
* Automatic stage prompt execution, agent spawning, or pipeline execution as a side effect of manual drag-and-drop.
* Dedicated workflow-health diagnostics or validation banners for malformed workflow files.
* Additional external storage or infrastructure beyond the local workflow files and existing event/update APIs.

## Validation

1. ❌ **Route rendering** — `app/dashboard/workflows/[id]/page.tsx:28-32` renders `<KanbanBoard workflowId={detail.id} stages={detail.stages} initialItems={detail.items} />`, but `components/dashboard/KanbanBoard.tsx:9-15` defines different props (`items`, `onOpenItem`, `onMoveItem`, `onOpenStage`) and the file also references undeclared symbols like `workflowId`, `setItems`, `setStages`, `setError`, `Button`, `Plus`, `useRef`, `useItemDoneSound`, and `mergeItem` (`components/dashboard/KanbanBoard.tsx:49-80`, `162-225`, `404-435`). This means the route does not currently type-check/build as a working page. The not-found branch is implemented at `app/dashboard/workflows/[id]/page.tsx:7-10`.
2. ⚠️ **Stage source of truth** — `lib/workflow-store.ts:90-134` reads ordered stages from `.nos/workflows/<id>/config/stages.yaml`, preserves order, and maps `name`, `description`, `prompt`, `autoAdvanceOnComplete`, `agentId`, and `maxDisplayItems`. The page passes `detail.stages` through (`app/dashboard/workflows/[id]/page.tsx:27-32`), and stage details UI exposes those fields in `components/dashboard/StageDetailDialog.tsx:36-48`, `71-124`, `145-220`. However, `readStages` currently type-fails in production build at `lib/workflow-store.ts:110`, so the implementation is not fully validated end-to-end.
3. ✅ **Empty stage configuration** — `app/dashboard/workflows/[id]/page.tsx:22-26` renders a dedicated empty-state message instead of board columns when `detail.stages.length === 0`.
4. ❌ **Item source of truth** — items are read from filesystem in `lib/workflow-store.ts:142-163` and `215-242`, including title/stage/status/body/comments. But `components/dashboard/KanbanBoard.tsx:378-385` only renders title, status badge, and item id; there is no assigned agent pill on the card when agent data exists. The only agent pill present is stage-level (`components/dashboard/KanbanBoard.tsx:293-316`), not item-level.
5. ⚠️ **Supported statuses** — the domain model supports `Todo`, `In Progress`, `Done`, and `Failed` in `types/workflow.ts:17` and the UI badge mapping exists in `components/dashboard/KanbanBoard.tsx:17-22` and `components/dashboard/ItemDetailDialog.tsx:35-41`. `readItemFolder` preserves an item's stage from metadata (`lib/workflow-store.ts:153-162`), so failed items remain in their current stage by data model. But because the board component does not type-check/build, this is only partially satisfied in practice.
6. ⚠️ **Card opening behavior** — the intended card click behavior exists in `components/dashboard/KanbanBoard.tsx:365-370`, opening `ItemDetailDialog` (`404-414`), and the dialog supports inspection/editing of title, stage, status, body, and comments (`components/dashboard/ItemDetailDialog.tsx:144-295`). This remains partial because the board currently does not compile.
7. ❌ **New item affordance** — the requirement asks for a per-column affordance opening the new-item dialog with that stage as creation context. The current board only has a global “Add item” button at `components/dashboard/KanbanBoard.tsx:210-218`, and `NewItemDialog` resets to the first stage on open (`components/dashboard/NewItemDialog.tsx:48-56`) rather than accepting a column-specific creation context.
8. ⚠️ **Stage detail affordance** — each column exposes a stage-detail button (`components/dashboard/KanbanBoard.tsx:328-340`) and `StageDetailDialog` supports viewing/editing the required metadata via the stage API (`components/dashboard/StageDetailDialog.tsx:71-124`). Partial only because the board currently does not compile.
9. ❌ **Manual stage movement** — the optimistic client move in `components/dashboard/KanbanBoard.tsx:162-198` sends `PATCH /api/workflows/[id]/items/[itemId]` with `{ stage: newStage }`, which should reset status to `Todo` via `lib/workflow-store.ts:271-281`. But the server route explicitly triggers stage pipeline work whenever `patch.stage !== undefined` (`app/api/workflows/[id]/items/[itemId]/route.ts:97-100`), violating the requirement that manual drag must not execute prompts or spawn agents. Also, same-column no-op is correctly handled in `components/dashboard/KanbanBoard.tsx:165`.
10. ⚠️ **Failed-item recovery** — `components/dashboard/ItemDetailDialog.tsx:254-279` exposes status selection including `Todo`, so an operator can reset a failed item without changing stage. However, discoverability is only via the generic status selector in the dialog, not an obvious recovery-specific affordance from the card/dialog, and the board does not compile.
11. ❌ **Live updates** — the board contains intended SSE logic using `/api/workflows/${workflowId}/events` and `updatedAt` reconciliation (`components/dashboard/KanbanBoard.tsx:76-160`), and `app/api/workflows/[id]/route.ts:5-12` supports resync. But the current file references undeclared state/helpers (`setItems`, `mergeItem`, `workflowId`) so this behavior is not actually buildable/verifiable.
12. ⚠️ **Concurrency visibility** — the board intends to show `In Progress` via status badge (`components/dashboard/KanbanBoard.tsx:378-382`). Partial only because the component currently fails to compile.
13. ⚠️ **Column item limits** — `maxDisplayItems` is read from stage config (`lib/workflow-store.ts:127-128`) and the board contains truncation/expand logic (`components/dashboard/KanbanBoard.tsx:230-237`, `387-396`). Partial only because the component currently fails to compile.
14. ❌ **Item ordering** — column items are rendered with `items.filter((i) => i.stage === stage.name)` at `components/dashboard/KanbanBoard.tsx:228`, preserving whatever order arrives from `readItems`. `lib/workflow-store.ts:218-230` uses raw `fs.readdirSync(itemsDir)` with no explicit sort, so deterministic ordering is not guaranteed by the implementation.
15. ⚠️ **Navigation scope** — the direct route exists at `app/dashboard/workflows/[id]/page.tsx:5-35`, satisfying the intended entry point, but the page cannot be considered working while the board/build is broken.
16. ✅ **Error handling scope** — malformed stages degrade to empty/partial behavior in `lib/workflow-store.ts:92-105`, `100-133`, and unreadable items are skipped with logging in `lib/workflow-store.ts:223-228`, which matches the allowed degraded behavior.
17. ❌ **No full-page refresh requirement** — the intended optimistic updates and SSE reconciliation are present in `components/dashboard/KanbanBoard.tsx:76-198`, but they are not currently operational because the component does not type-check/build.

### Regression and edge-case checks

* ✅ `npm test` passes: 9/9 tests green (`package.json:14`, command output on 2026-04-19).
* ❌ `npm run build` fails during TypeScript checking at `lib/workflow-store.ts:110` (`Operator '<=' cannot be applied to types 'unknown' and 'number'`).
* ❌ Adjacent regression: the workflow page and board integration is internally inconsistent because `app/dashboard/workflows/[id]/page.tsx:28-32` passes `workflowId`/`initialItems`, while `components/dashboard/KanbanBoard.tsx:9-15` declares a different prop interface and still contains references to missing state/imports from an unfinished refactor.
* ❌ Edge-case miss: manual stage changes trigger `triggerStagePipeline` (`app/api/workflows/[id]/items/[itemId]/route.ts:97-100`), which directly contradicts the specification’s “no implicit pipeline execution on drag” rule.
* ❌ Edge-case miss: new item creation is not stage-scoped from a column; opening the dialog resets to the first configured stage (`components/dashboard/NewItemDialog.tsx:48-56`).
* ❌ Edge-case miss: item cards do not show an assigned agent pill, only stage-level agent metadata (`components/dashboard/KanbanBoard.tsx:293-316`, `350-385`).

### Follow-ups

* Fix `lib/workflow-store.ts:108-112` type narrowing so the project builds.
* Reconcile `app/dashboard/workflows/[id]/page.tsx` with `components/dashboard/KanbanBoard.tsx` so the board has a consistent prop/state model and all referenced imports/helpers/state exist.
* Remove implicit `triggerStagePipeline` execution from manual stage changes through `PATCH /api/workflows/[id]/items/[itemId]`, or add a separate API path/flag so drag remains a pure stage/status mutation.
* Add per-column “New item” affordances that open `NewItemDialog` with the destination stage preselected.
* Add item-level agent pill rendering based on the item’s assigned/most recent session agent data.
* Make column ordering deterministic, e.g. by sorting in `readItems` or before column render.
* After fixes, rerun `npm run build`, targeted interaction checks for drag/detail dialogs/SSE, and revalidate this requirement before advancing.
