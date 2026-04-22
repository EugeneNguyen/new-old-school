In the sidemenu > workflows:

Change the order

Current:

* All workflows item first, then list of workflows



Desired

* List of workflow first, then "All workflows" item

## Analysis

### Scope

**In scope:**
- Reorder the two blocks inside the Workflows collapsible section of the sidebar so that the dynamically-rendered list of individual workflows appears **before** the static "All workflows…" link.

**Out of scope:**
- Changing the order of individual workflows relative to each other (they remain in API-returned order).
- Modifying the "All workflows" page itself, the `/api/workflows` endpoint, or any workflow data model.
- Any other sidebar sections (Files, Settings, etc.).

### Feasibility

**Viability:** Trivial. The change is a purely presentational swap of two adjacent JSX blocks in `components/dashboard/Sidebar.tsx` (lines 108-137). The `workflows.map(…)` block (lines 115-136) moves above the static `<Link>` to "All workflows…" (lines 109-114). No new state, props, API changes, or data transformations are needed.

**Risks:** None identified. The two blocks are independent siblings inside a `<div>` — swapping their order has no logic side-effects.

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `components/dashboard/Sidebar.tsx` | Direct — only file modified | Lines 108-137 contain the two blocks to swap. |
| `GET /api/workflows` (`app/api/workflows/route.ts`) | Read-only dependency | Provides the workflow list; no changes needed. |

No external services, database changes, or cross-module impacts.

### Open Questions

None — the requirement is unambiguous and the implementation path is clear.

## Specification

### User Stories

1. **As an operator**, I want the sidebar Workflows section to list individual workflows before the "All workflows…" link, so that I can access the workflow I need without scrolling past a generic navigation entry.

### Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | **Given** the sidebar is expanded and the Workflows section is open, **when** the operator views the workflow list, **then** individual workflow links appear above the "All workflows…" link. |
| AC-2 | **Given** one or more workflows exist, **when** rendered in the sidebar, **then** workflows appear in the same relative order returned by `GET /api/workflows` (i.e. API-returned order is preserved). |
| AC-3 | **Given** a workflow has `routineEnabled: true`, **when** rendered in the reordered list, **then** the `CalendarClock` icon still appears to the left of the workflow name. |
| AC-4 | **Given** the operator navigates to a specific workflow page, **when** the sidebar renders, **then** the active workflow link is highlighted with `bg-accent text-accent-foreground` styling. |
| AC-5 | **Given** no workflows exist (empty list), **when** the sidebar Workflows section is open, **then** only the "All workflows…" link is displayed with no empty-state artefacts above it. |
| AC-6 | **Given** the sidebar is in collapsed mode, **when** the operator views the sidebar, **then** the Workflows section remains hidden (existing behaviour unchanged). |

### Technical Constraints

- **File to modify:** `components/dashboard/Sidebar.tsx` — the `workflows.map(…)` JSX block (currently lines 115–136) must move above the static `<Link>` to "All workflows…" (currently lines 109–114) within the `<div className="pl-4 space-y-1">` container.
- **No API changes:** The `GET /api/workflows` endpoint (`app/api/workflows/route.ts`) is unchanged; it remains the sole data source for the workflow list.
- **No new state or props:** The reorder is a static JSX swap; no new React state, context, or component props are introduced.
- **Sidebar navigation order** per `docs/standards/ux-design.md`: Dashboard → Workflows → Files → Claude Terminal → Members → Activity → Settings. This change affects only the *internal* ordering within the Workflows collapsible section, not the top-level navigation order.
- **Styling:** The existing `text-xs font-medium text-muted-foreground` on "All workflows…" and `text-sm font-medium` on individual workflow links are preserved.

### Out of Scope

- Changing the relative order of individual workflows (they remain in API-returned order).
- Modifying the "All workflows" page (`app/dashboard/workflows/page.tsx`) itself.
- Changes to `GET /api/workflows` or any workflow data model.
- Any other sidebar sections (Dashboard, Files, Claude Terminal, Members, Activity, Settings).
- Adding separators, headings, or visual dividers between the two blocks.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00100 | Update sidemenu (workflow order) | Feature request | ux-design.md, wbs.md (1.4.1) | `components/dashboard/Sidebar.tsx` | Visual regression check — all 6 ACs | Pending |

### WBS Mapping

- **WBS 1.4.1 — Dashboard Shell**: This requirement modifies the sidebar navigation within the dashboard shell. The sidebar component (`Sidebar.tsx`) is a deliverable of WBS package 1.4.1 ("Root layout with sidebar, navigation, workspace switcher").
- No other WBS packages are affected.

## Implementation Notes

Swapped the two JSX blocks inside the `<div className="pl-4 space-y-1">` container in `components/dashboard/Sidebar.tsx` (lines 107–138): the `workflows.map(…)` block now renders above the static "All workflows…" `<Link>`. No other changes were made — all six acceptance criteria are satisfied by this single reorder: individual workflows render first (AC-1), API-returned order is preserved since no reordering logic was added (AC-2), the `CalendarClock` icon remains on `routineEnabled` workflows (AC-3), active-state styling is unchanged (AC-4), empty list shows only "All workflows…" (AC-5), and collapsed mode is unaffected as both blocks sit inside `!collapsed && workflowsExpanded &&` (AC-6). No deviations from documented standards.

## Validation

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Individual workflow links appear above "All workflows…" | ✅ Pass | `Sidebar.tsx` lines 109–130: `workflows.map(...)` renders before the `<Link href="/dashboard/workflows">All workflows…</Link>` at lines 131–136. Order is unambiguous in JSX. |
| AC-2 | Workflows appear in API-returned order | ✅ Pass | `workflows` state is set by `setWorkflows(data)` directly from the `GET /api/workflows` response array (line 34). No sort or filter is applied before or after the map. |
| AC-3 | `CalendarClock` icon renders for `routineEnabled` workflows | ✅ Pass | Lines 124–126: `{wf.routineEnabled && <CalendarClock className="w-4 h-4 shrink-0 mr-2 text-muted-foreground" />}` inside the map — unchanged from before the reorder. |
| AC-4 | Active workflow link highlighted with `bg-accent text-accent-foreground` | ✅ Pass | Lines 117–122: `active && 'bg-accent text-accent-foreground'` applied via `cn()` using `isActive(href, pathname)`. Logic is unchanged. |
| AC-5 | Empty list shows only "All workflows…", no artefacts | ✅ Pass | Empty `workflows` array renders zero items from `map()`; the static "All workflows…" link is unconditional within the expanded block. No empty-state component was added. |
| AC-6 | Collapsed mode hides Workflows section | ✅ Pass | Line 107: entire block guarded by `!collapsed && workflowsExpanded &&`; both the map and the static link are inside this guard. |

**Result: All 6 ACs pass. No regressions identified in adjacent sidebar sections (Dashboard, Files, Claude Terminal, Members, Activity, Settings) — all are independent of the reordered Workflows sub-block.**
