i think we should put it in the sidemenu, in collapse item of workflows, below the list of the workflow, put 1 menu item more name "manage workflows"

## Analysis

### 1. Scope

**In scope**
- Add a "Manage workflows" entry in the sidebar's Workflows collapsible section (`components/dashboard/Sidebar.tsx`), rendered as the last child under the existing workflow list.
- Create a management page (e.g. `app/dashboard/workflows/manage/page.tsx`) that lists all workflows and exposes Create, Edit (rename / prefix), and Delete actions.
- Wire the page to existing HTTP endpoints and add a missing one:
  - `GET /api/workflows` — already exists.
  - `POST /api/workflows` — already exists (create with `id`, `name`, `idPrefix`).
  - `DELETE /api/workflows/[id]` — already exists.
  - `PATCH /api/workflows/[id]` — **new**, to rename a workflow / change its `idPrefix` in `config.json` without moving its folder.
- Confirmation (destructive-action) UX on delete.
- The sidebar entry should highlight when on the manage page and respect the `collapsed` sidebar state (icon-only rendering).

**Out of scope**
- Managing stages, agents, or pipelines of a workflow (already covered by the per-workflow `settings/` route).
- Renaming the workflow **folder id** (filesystem slug). Changing the id requires moving items, rewriting activity logs, and breaking existing session references; treat id as immutable for this requirement.
- Importing/exporting workflows or bulk operations.
- Reordering workflows in the sidebar.
- Access control / permissions.

### 2. Feasibility

Straightforward, low-risk. All the plumbing already exists except the PATCH route.

- **UI**: `Sidebar.tsx` already fetches and renders the workflow list; adding a static "Manage workflows" `<Link>` after the `.map` is a ~10-line change. A new page reuses patterns from the existing `app/dashboard/workflows/[id]/settings` page and `app/api/workflows/route.ts` POST flow.
- **Storage**: `lib/workflow-store.ts` already has `createWorkflow`, `deleteWorkflow`, and `workflowExists`. An update helper (e.g. `updateWorkflowConfig(id, { name?, idPrefix? })`) needs to be added — trivial `fs.readFileSync` / `atomicWriteFile` on `config.json`.
- **Validation risks**:
  - `idPrefix` is embedded into item ids (`REQ-00066`, etc.). Changing prefix should NOT rewrite historical item ids; only new items get the new prefix. The UI must warn about this.
  - Name/prefix length + regex already enforced in the POST route (`PREFIX_REGEX`, `ID_REGEX`); reuse the same regex in PATCH and in the client form.
- **Delete risk**: `deleteWorkflow` does `rm -rf` on the folder. The dashboard should require explicit confirmation (type-to-confirm workflow name is typical). Also need to consider what happens if the user is currently viewing that workflow's page at delete time — redirect to the manage page.
- **Cache / list refresh**: `Sidebar.tsx` loads workflows once in `useEffect` on mount. After create/delete/rename, the sidebar will be stale until a full reload. Options: (a) emit a client-side event the sidebar listens to, (b) use `router.refresh()` plus lift the fetch to a shared context, or (c) accept a reload on mutation for the first cut. Recommend a lightweight `workflowsChanged` event bus or re-fetching via SWR/context. Needs a small decision, not a spike.
- **Concurrency**: write-through `atomicWriteFile` already in place; PATCH is safe against partial writes.

No spikes required.

### 3. Dependencies

- `components/dashboard/Sidebar.tsx` — sidebar entry + stale list refresh.
- `lib/workflow-store.ts` — add `updateWorkflowConfig` helper.
- `app/api/workflows/route.ts` — reuse validation regex/helpers.
- `app/api/workflows/[id]/route.ts` — add PATCH handler.
- `types/workflow.ts` — `Workflow` / `WorkflowConfig` types; may need a `WorkflowUpdate` shape.
- `app/dashboard/workflows/[id]/settings/` — existing per-workflow settings; check for overlap (stage/agent config lives here and should **not** be duplicated on the manage page).
- `app/dashboard/workflows/[id]/page.tsx` — needs a graceful 404/redirect when its workflow is deleted from the manage page in another tab.
- `.nos/workflows/<id>/config.json` — on-disk shape that PATCH will mutate.
- No external services or third-party systems.

### 4. Open questions

1. **Terminal path in URL**: `app/dashboard/workflows/manage` collides semantically with `app/dashboard/workflows/[id]` if a workflow ever has id `manage`. Should we reserve `manage` as a blocked id in `ID_REGEX` validation, or use a different path like `/dashboard/workflows/_manage` or `/dashboard/settings/workflows`?
2. **Edit scope on rename**: Do we allow changing `idPrefix` after creation? If yes, confirm the intended behavior for new vs historical items (assumed: only affects new items).
3. **Sidebar refresh model**: Acceptable to require full page reload after create/delete, or do we want live sidebar updates via an event bus / shared store? (Recommendation: event bus — small, keeps the sidebar honest.)
4. **Delete confirmation UX**: Simple "Are you sure?" modal, or type-to-confirm the workflow name / id? Given `rm -rf` semantics, recommend type-to-confirm.
5. **Placement details**: The request says "below the list of the workflow". Confirm it should sit inside the collapsed section (indented with the list) rather than as a top-level sibling, and confirm whether it should appear when the Workflows section is collapsed but the sidebar itself is expanded.
6. **Empty state**: When there are zero workflows, should the manage page still be reachable (to create the first one), and should the sidebar entry still show? (Recommendation: yes to both.)
7. **Undo / soft delete**: Is a trash / soft-delete needed, or is hard delete acceptable given the destructive-confirm UX? (Recommendation: hard delete for now.)

## Validation

> **Note**: No formal `## Specification` section was written into this file — the Documentation stage comment claimed to add it but the file only contains the Analysis. Acceptance criteria below are reconstructed from `### 1. Scope` in the Analysis, which is the only normative definition available.

### Acceptance Criteria

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | "Manage workflows" sidebar link inside Workflows collapsible, below the workflow list | ❌ Fail | `components/dashboard/Sidebar.tsx` lines 126–148: only per-workflow links are rendered; no static "Manage workflows" link added |
| AC-2 | Sidebar link highlights when on manage page | ❌ Fail | N/A — sidebar link was never added |
| AC-3 | Sidebar link renders icon-only when sidebar is collapsed | ❌ Fail | N/A — sidebar link was never added |
| AC-4 | Management page lists all workflows with id and name | ✅ Pass | `app/dashboard/workflows/page.tsx` exists, fetches `/api/workflows`, renders list with `wf.name` and `wf.id` (lines 209–232) |
| AC-5 | Create workflow: form with id / name / idPrefix fields and client-side validation | ✅ Pass | Full create form at lines 235–314 with `ID_REGEX`, `PREFIX_REGEX`, `validateName` inline; 409 conflict handled |
| AC-6 | Edit workflow: rename name and/or idPrefix via PATCH | ❌ Fail | No edit UI in the page; no `PATCH /api/workflows/[id]` handler in `app/api/workflows/[id]/route.ts`; no `updateWorkflowConfig` in `lib/workflow-store.ts` |
| AC-7 | Delete workflow with destructive confirmation UX | ⚠️ Partial | Confirmation dialog exists (lines 316–361) with workflow name shown, but uses simple "Are you sure?" button — not type-to-confirm as the Analysis recommended for `rm -rf` semantics |
| AC-8 | Empty state: manage page reachable and operable with zero workflows | ✅ Pass | Page renders empty-state message when `workflows.length === 0` (line 204–207); "New workflow" button always visible |
| AC-9 | Sidebar refreshes workflow list after create/delete/rename mutation | ❌ Fail | Sidebar fetches workflows once on mount (`useEffect` line 25–38) and has no listener for mutations; no event bus, context, or re-fetch mechanism wired up |

### Summary

4 / 9 criteria pass (AC-4, AC-5, AC-7 partial, AC-8). The management page at `/dashboard/workflows` implements the core create/delete/list flows correctly, but the three highest-visibility items from the original request are missing:

1. **No sidebar entry** — users have no way to discover or navigate to the manage page from the sidebar (AC-1, AC-2, AC-3 all fail).
2. **No edit/rename** — PATCH endpoint and `updateWorkflowConfig` helper were listed as required new additions but are absent (AC-6 fail).
3. **No sidebar refresh** — sidebar workflow list goes stale after mutations (AC-9 fail).

### Follow-ups Required

- [ ] Add "Manage workflows" `<Link>` to `components/dashboard/Sidebar.tsx` inside the `workflowsExpanded` block, after the `.map`, with active-state highlighting and collapsed-sidebar handling.
- [ ] Add `PATCH /api/workflows/[id]` route handler in `app/api/workflows/[id]/route.ts` accepting `{ name?, idPrefix? }`.
- [ ] Add `updateWorkflowConfig(id, patch)` helper in `lib/workflow-store.ts`.
- [ ] Add edit UI to the manage page (inline edit or dialog) wired to the PATCH endpoint.
- [ ] Wire sidebar refresh after mutations: either dispatch a `workflowsChanged` custom event in the page and listen in Sidebar, or lift workflow list to a shared context.
- [ ] (Optional / risk mitigation) Upgrade delete confirmation to type-to-confirm (enter workflow name) given `rm -rf` semantics.
