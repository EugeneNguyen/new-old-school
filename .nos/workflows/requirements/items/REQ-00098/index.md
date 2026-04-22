# the workflow with routine enabled should display different in list workflow in side menu

## Analysis

### 1. Scope

**In scope:**
- Visual differentiation of workflows with routine enabled vs. those without in the sidebar list
- Updating the sidebar component (`components/dashboard/Sidebar.tsx`) to render routine-enabled workflows distinctly
- Extending the workflow list API to expose routine status

**Explicitly out of scope:**
- Modifying routine scheduling logic or cron configuration UI (already exists)
- Changes to the workflow detail page or any other page
- Bulk operations or filtering on the workflows page

### 2. Feasibility

**Technical viability:** High. The infrastructure already exists:
- Routine config is stored at `.nos/workflows/<id>/config/routine.yaml` with `enabled: boolean`
- An API route already exists at `GET /api/workflows/[id]/routine`
- The sidebar already fetches and renders the workflow list

**Risks:**
- The `Workflow` type in `types/workflow.ts` only has `id`, `name`, `idPrefix` — needs a `routineEnabled` field added
- The list API (`/api/workflows/route.ts`) would need to fetch routine config per workflow, or the Sidebar would need to batch-fetch routine status — performance consideration at scale
- Visual design choice (icon, color, badge) needs to be decided

**Unknowns that need spiking:**
- Visual treatment: icon (e.g., a clock/calendar icon), badge, color tint on the row, or some combination?
- Should the "different" display be applied at rest or only when hovered/selected?
- Are there other fields worth surfacing (cron schedule, last fired time) or just a boolean indicator?

### 3. Dependencies

| Dependency | Details |
|---|---|
| `types/workflow.ts` | Add `routineEnabled?: boolean` field to `Workflow` interface |
| `app/api/workflows/route.ts` | Extend list response to include `routineEnabled` per workflow |
| `lib/routine-scheduler.ts` | `readRoutineConfig()` already exists and returns `enabled` |
| `components/dashboard/Sidebar.tsx` | Modify rendering loop (lines 137-155) to show the routine indicator |
| Existing routine config files | Already in `.nos/workflows/<id>/config/routine.yaml` |

### 4. Open Questions

1. **Visual treatment:** Should routine-enabled workflows show an icon (e.g., `Clock` from lucide-react), a colored dot/badge, or a styled text label?
2. **Granularity:** Should the sidebar show only `enabled` (boolean), or also expose the cron schedule or last fired timestamp?
3. **Empty/missing config:** If a workflow has no `routine.yaml` at all, treat as `routineEnabled: false`?
4. **Performance:** If the API fetches routine config for every workflow at list time, does it cause latency issues with many workflows?

### 4. Open Questions (Supplementary Detail)

1. **Visual treatment:** Should routine-enabled workflows show an icon (e.g., `Clock` from lucide-react), a colored dot/badge, or a styled text label?
2. **Granularity:** Should the sidebar show only `enabled` (boolean), or also expose the cron schedule or last fired timestamp?
3. **Empty/missing config:** If a workflow has no `routine.yaml` at all, treat as `routineEnabled: false`?
4. **Performance:** If the API fetches routine config for every workflow at list time, does it cause latency issues with many workflows?

---

## Specification

### 1. User Stories

- **As an operator**, I want the sidebar workflow list to visually distinguish workflows that run on a schedule, so I can quickly identify automated workflows at a glance.
- **As an operator**, I want routine-enabled workflows to display consistently (at rest and when hovered/selected), so the indicator is never hidden during normal use.
- **As an implementer**, I want a single API response to include both workflow metadata and routine status, so the sidebar can render without additional fetches per workflow.

### 2. Acceptance Criteria

1. **AC-1:** The `Workflow` type in `types/workflow.ts` includes `routineEnabled?: boolean`.
2. **AC-2:** `GET /api/workflows` (list) returns an array where each entry contains `id`, `name`, `idPrefix`, and `routineEnabled` (boolean or `false` if no config exists).
3. **AC-3:** `components/dashboard/Sidebar.tsx` renders a `CalendarClock` icon (from `lucide-react`) inline with the workflow name for every workflow where `routineEnabled === true`.
4. **AC-4:** The routine indicator is visible both at rest and on hover/active state — no opacity fade or conditional visibility based on hover state.
5. **AC-5:** A workflow with no `routine.yaml` file (or with `enabled: false`) renders without the indicator; a workflow with `enabled: true` renders with the indicator.
6. **AC-6:** The sidebar renders correctly for workflows with and without routine config — no rendering errors, no missing links, and no broken layout when the routine field is absent.
7. **AC-7:** `tsc --noEmit` passes with no new errors introduced by this change.

### 3. Technical Constraints

- **Workflow type:** `types/workflow.ts` — add `routineEnabled?: boolean` to the `Workflow` interface. Shape:
  ```typescript
  interface Workflow {
    id: string;
    name: string;
    idPrefix: string;
    routineEnabled?: boolean; // true when routine.yaml exists with enabled: true
  }
  ```
- **API shape:** `app/api/workflows/route.ts` — list response conforms to `GET /api/workflows` per `docs/standards/api-reference.md`. Each item must include `routineEnabled`. Response type:
  ```typescript
  interface WorkflowListResponse {
    workflows: Workflow[];
  }
  ```
- **Routine config reader:** `lib/routine-scheduler.ts` exports `readRoutineConfig(workflowId)` which returns `RoutineConfig | null`. The list API should call this per workflow — no reimplementation of file reading. If the config file does not exist or `enabled` is `false`, `routineEnabled` is `false`.
- **Icon:** `CalendarClock` from `lucide-react` — already imported/used in `components/dashboard/RoutineSettingsDialog.tsx`, ensuring visual consistency across the app.
- **Rendering location:** `components/dashboard/Sidebar.tsx` — modify the workflow list map (approx. lines 137–155) to conditionally render the icon inline with the workflow name.
- **Performance:** The list API iterates all workflows and reads each one's `routine.yaml`. This is acceptable for typical scale; no caching layer is introduced in this requirement. If latency becomes a concern, a separate follow-up requirement should address it.

### 4. Out of Scope

The following are explicitly not in scope for this requirement:

- Modifying the routine configuration UI (RoutineSettingsDialog), cron schedule display, or any scheduling logic.
- Adding routine status to the workflow detail page, item list, or any other page outside the sidebar.
- Batch operations, filtering, or sorting of workflows by routine status on any page.
- Caching the routine status in memory, Redis, or any persistent store.
- Exposing the cron schedule expression or last fired timestamp in the sidebar.
- Adding a `routine` variant to `components/ui/badge.tsx` — the indicator is an inline icon, not a badge.

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00098 |
| **Title** | the workflow with routine enabled should display different in list workflow in side menu |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/ui-design.md`, `docs/standards/ux-design.md` |
| **Implementation File(s)** | To be filled after implementation |
| **Test Coverage** | To be filled after validation |
| **Status** | In Progress |

### 6. WBS Mapping

This requirement spans two WBS packages:

**Primary package — WBS 1.4.1 (Dashboard Shell):**
Sidebar rendering of routine-enabled workflows. Deliverables affected:
- `components/dashboard/Sidebar.tsx` — add conditional routine indicator in the workflow list map
- `types/workflow.ts` — add `routineEnabled` field

**Secondary package — WBS 1.3.1 (Workflow Routes):**
Extending the list API to expose routine status. Deliverables affected:
- `app/api/workflows/route.ts` — populate `routineEnabled` per workflow in list response
- `lib/routine-scheduler.ts` — `readRoutineConfig()` is the existing integration point

**Downstream deliverables unaffected:**
- 1.2.6 Routine Scheduler (logic already exists; this requirement only surfaces its status)
- 1.4.7 Agent Management UI (unrelated)
- 1.4.10 Activity Feed (unrelated)

### Exact Sidebar Rendering Block
`components/dashboard/Sidebar.tsx` lines 137-155 — the workflow list map currently renders a simple `Link` with only the workflow name. The routine indicator should be inserted here.

```tsx
{workflows.map((wf) => {
  const href = `/dashboard/workflows/${wf.id}`;
  const active = isActive(href, pathname);
  return (
    <Link
      key={wf.id}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center px-3 py-2 rounded-md transition-colors text-sm font-medium',
        'hover:bg-accent hover:text-accent-foreground',
        'text-muted-foreground',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      <span className="truncate">{wf.name}</span>
    </Link>
  );
})}
```

### Workflow Type (Current)
`types/workflow.ts` — only `id`, `name`, `idPrefix`. Needs `routineEnabled?: boolean` added.

### Routine Config Shape
`lib/routine-scheduler.ts` defines:
```tsx
export interface RoutineConfig {
  enabled: boolean;
  cron: string;
}
```
Stored at `.nos/workflows/<workflowId>/config/routine.yaml`.

### Available Badge Variants
`components/ui/badge.tsx` — `default`, `secondary`, `destructive`, `outline`, `success`. No `routine` variant exists yet.

### Existing Routine Icon
`CalendarClock` from lucide-react is already used in `components/dashboard/RoutineSettingsDialog.tsx` — visual consistency is recommended.

### Reusable Utility
`lib/routine-scheduler.ts` already exports `readRoutineConfig(workflowId)` which returns `RoutineConfig`. The workflows list API should call this per workflow, not reimplement file reading.

## Implementation Notes

### Changes Made

1. **`types/workflow.ts`** — Added `routineEnabled?: boolean` to the `Workflow` interface.

2. **`app/api/workflows/route.ts`** — Extended the GET handler to call `readRoutineConfig(folder)` per workflow and include `routineEnabled` in the response object. The icon is rendered unconditionally (not behind hover), so AC-4 is satisfied.

3. **`components/dashboard/Sidebar.tsx`** — Added `CalendarClock` to the lucide-react import and conditionally renders it inline before the workflow name when `wf.routineEnabled === true`. The indicator is visible at rest and on hover/active state (no opacity changes applied).

### Deviations from Standards

None. The implementation follows existing patterns: `CalendarClock` from lucide-react (consistent with `RoutineSettingsDialog.tsx`), optional field on the interface, and no new caching layer introduced.

### Verification

- `npx tsc --noEmit` passes with no new errors in modified files.
- All 7 acceptance criteria are satisfied:
  - AC-1: `routineEnabled?: boolean` in type ✓
  - AC-2: List API returns `routineEnabled` ✓
  - AC-3: `CalendarClock` icon rendered for enabled workflows ✓
  - AC-4: Icon visible at rest (not conditional on hover) ✓
  - AC-5: No config → no icon; `enabled: true` → icon ✓
  - AC-6: Layout stable when field is absent ✓
  - AC-7: TypeScript clean ✓

## Validation

### Evidence Summary

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | `Workflow` type includes `routineEnabled?: boolean` | ✅ Pass | `types/workflow.ts:5` — field present as `routineEnabled?: boolean` |
| AC-2 | `GET /api/workflows` returns `routineEnabled` per entry | ✅ Pass | `app/api/workflows/route.ts:41-48` — calls `readRoutineConfig(folder)`, sets `routineEnabled = routineConfig?.enabled === true`, includes it in each pushed object |
| AC-3 | `CalendarClock` icon rendered for `routineEnabled === true` | ✅ Pass | `components/dashboard/Sidebar.tsx:5` imports `CalendarClock`; lines 152-154 conditionally render `<CalendarClock className="w-4 h-4 shrink-0 mr-2 text-muted-foreground" />` |
| AC-4 | Indicator visible at rest and on hover — no conditional opacity | ✅ Pass | The condition is `wf.routineEnabled` (data field), not a hover class. No `opacity-0`, `group-hover:opacity-100`, or CSS visibility toggles applied to the icon |
| AC-5 | No `routine.yaml` or `enabled: false` → no icon; `enabled: true` → icon | ✅ Pass | `lib/routine-scheduler.ts:39` returns `null` when file absent; API uses `routineConfig?.enabled === true` which is `false` for `null` or `{ enabled: false }`. Confirmed: `audit` workflow has `enabled: true` and will show icon; `requirements` workflow has no `routine.yaml` and will not |
| AC-6 | Sidebar stable for all workflow configs — no errors or broken layout | ✅ Pass | `routineEnabled` is optional (`?`); `{wf.routineEnabled && (...)}` handles `undefined` safely in JSX. Flex container (`flex items-center`) adapts correctly with or without the icon |
| AC-7 | `tsc --noEmit` — no new errors from this change | ✅ Pass | TypeScript errors present in `lib/scaffolding.test.ts` and `lib/workflow-store.ts` are pre-existing (neither file was modified by this requirement). The three changed files do not appear in the error output |

### Regression Check

- `GET /api/workflows` response remains backward-compatible: core fields (`id`, `name`, `idPrefix`) unchanged; `routineEnabled` is additive.
- Sidebar renders all workflows including those without routine config — no regressions in layout or navigation.
- `lib/routine-scheduler.ts` was not modified; its behavior is unchanged.

### Verdict

All 7 acceptance criteria pass. No regressions detected. Ready to update RTM and close.