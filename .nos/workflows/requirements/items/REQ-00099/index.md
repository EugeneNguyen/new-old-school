## Analysis

### Scope

**In scope:**
- Reorder the top-level navigation items in the dashboard sidebar to match: Dashboard → Workflows → Files → Claude Terminal → Members → Activity → Settings.

**Explicitly out of scope:**
- Adding or removing nav items (only reordering).
- Changes to the Workflows sub-menu (workflow list shown when Workflows folder is expanded) or the collapsed sidebar state.
- Changes to the workspace switcher or theme toggle.

### Current State

The sidebar has **two distinct layers of nav items**:

1. **Tool registry items** (rendered via `ToolRegistry.getAllTools()`, sourced from `config/tools.json`):
   Current order: Dashboard, Files, Claude Terminal, Members, Settings.

2. **Hardcoded items** (rendered directly in `Sidebar.tsx`):
   - **Activity** — hardcoded at lines 88–108, outside the tools map.
   - **Workflows** — hardcoded at lines 111–161 as an expandable folder, outside the tools map.

The requested order interleaves Activity and Workflows *between* the tool registry items, meaning the reordering touches both layers. The item list provided in the request (Dashboard → Workflows → Files → Claude Terminal → Members → Activity → Settings) places:
- **Workflows** and **Activity** between Dashboard and Files — but neither is a tool-registry item.
- **Files** comes after both Workflows and Activity — but Files *is* a tool-registry item.

### Feasibility

Technically viable. Two approaches:

1. **Best approach: move Activity and Workflows into `config/tools.json`**, converting them to tool-registry items alongside the existing five. Then reorder the JSON array. This is clean, consistent, and makes the sidebar fully data-driven. The `<Link>` for Activity and the collapsible `<button>` for Workflows would need to be replaced with the standard `tools.map` render — or a variant that supports both Link and button behavior based on a `type` field in the config.

2. **Alternative: manually reorder in `Sidebar.tsx`** with explicit JSX sections. Harder to maintain but avoids touching the config format.

**Risk:** Converting Workflows from a collapsible button to a Link would change its behavior. If users expect it to expand/collapse rather than navigate directly, this could be a UX regression. The current Workflows item toggles an expanded state showing the workflow list; a Link would navigate away on click. Needs clarification — see open questions below.

### Dependencies

- `config/tools.json` — tool ordering
- `components/dashboard/Sidebar.tsx` — nav rendering (for hardcoded Activity and Workflows sections)
- `lib/tool-registry.ts` — if items are added/removed from the registry

No external systems or API dependencies.

### Open Questions

1. **Workflows item behavior** — Should "Workflows" in the list navigate to `/dashboard/workflows` (Link behavior), or remain a collapsible folder that expands to show the workflow list? The current implementation is a button that toggles `workflowsExpanded`. If the request intends a Link, the expanded-on-click behavior is lost. If it should remain a button, the reorder request only partially applies (Activity and Files would move, but Workflows stays as-is).

2. **Activity item behavior** — Currently a Link to `/dashboard/activity`. Is this correct for the new position, or should it also behave differently?

3. **Collapsed state** — The collapsed sidebar (`w-16`) shows only icons with no labels. Does the requested order affect how items display when collapsed? (Likely not, but confirm expectations.)

## Specification

### User Stories

1. **As a user**, I want the sidebar navigation items to appear in the order: Dashboard → Workflows → Files → Claude Terminal → Members → Activity → Settings, so that I can quickly locate the section I need.

2. **As a user**, I want the Workflows sidebar item to remain a collapsible folder that expands to show the workflow list on click, so that I can navigate to individual workflows without leaving the sidebar.

3. **As a user**, I want the Activity sidebar item to remain a Link to `/dashboard/activity`, so that clicking it navigates directly to the activity feed.

### Acceptance Criteria

1. **AC-1**: When the sidebar is expanded, top-level nav items render in this order: Dashboard, Workflows (collapsible folder), Files, Claude Terminal, Members, Activity, Settings.
2. **AC-2**: The Workflows item is a `<button>` that toggles the workflow list expand/collapse state; clicking it does not navigate away.
3. **AC-3**: The Activity item is a `<Link>` to `/dashboard/activity`; clicking it navigates to the activity page.
4. **AC-4**: All other nav items (Dashboard, Files, Claude Terminal, Members, Settings) are rendered as `<Link>` components sourced from `config/tools.json`.
5. **AC-5**: The collapsed sidebar (`w-16`) displays only icons in the same top-to-bottom order as the expanded sidebar, with no labels.
6. **AC-6**: The active state highlighting (`aria-current="page"`, `bg-accent`) continues to work correctly for all items after reordering.
7. **AC-7**: No nav items are added or removed; only the rendering order changes in `Sidebar.tsx`. The `config/tools.json` array order is unchanged.
8. **AC-8**: The Workflows expand/collapse state (showing/hiding the workflow list) is preserved and works identically to before.

### Technical Constraints

- **`config/tools.json`**: Array order is unchanged. Tool entries are not added or removed. File shape per WBS §1.7.3.
- **`components/dashboard/Sidebar.tsx`**: Nav item rendering order is changed. `workflowsExpanded` state remains a `useState` boolean; no new state introduced.
- **`lib/tool-registry.ts`**: No changes required. `ToolRegistry.getAllTools()` and `ToolRegistry.getIcon()` continue to work.
- **No API changes**: No new endpoints, no data model changes.
- **No schema changes**: No changes to workflow, item, or agent data structures.

### Out of Scope

- Adding or removing sidebar nav items.
- Modifying the Workflows sub-menu content or expand behavior.
- Modifying the collapsed sidebar's icon-only layout.
- Modifying the workspace switcher or theme toggle.
- Converting Workflows from a collapsible `<button>` to a `<Link>`.
- Changes to `config/tools.json` array order (ordering is achieved via `Sidebar.tsx` render sequencing).

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00099 |
| **Title** | Reorder sidemenu |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/ux-design.md` (§ Navigation), `docs/standards/wbs.md` (1.4.1) |
| **Implementation File(s)** | `components/dashboard/Sidebar.tsx` |
| **Test Coverage** | Visual regression check — sidebar items visible in correct order; Workflows collapsible; Activity navigation works |
| **Status** | — |

### WBS Mapping

- **WBS Package**: 1.4.1 — Dashboard Shell (layout, sidebar, navigation, workspace switcher)
- **Deliverables affected**: Dashboard sidebar top-level nav ordering
- **No other WBS packages affected

## Implementation Notes

The reorder was implemented by replacing the `tools.map()` render loop with explicit, ordered IIFE blocks in `Sidebar.tsx`. Each tool is accessed by index from the tools array (Dashboard=0, Files=1, Claude Terminal=2, Members=3, Settings=4), interleaved with the hardcoded Workflows button and Activity Link at their new positions. The `config/tools.json` array order was not changed per AC-7. The Workflows collapsible button behavior is preserved unchanged, and the Activity Link to `/dashboard/activity` remains functional.**

## Validation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC-1 | Expanded sidebar renders items in order: Dashboard → Workflows → Files → Claude Terminal → Members → Activity → Settings | ✅ Pass | `Sidebar.tsx` JSX blocks at lines 65-87, 89-138, 140-163, 165-188, 190-213, 215-236, 238-261 match required order exactly |
| AC-2 | Workflows item is a `<button>` that toggles expand/collapse; does not navigate | ✅ Pass | Line 90: `<button onClick={() => setWorkflowsExpanded(!workflowsExpanded)}>` — no href, no navigation |
| AC-3 | Activity item is a `<Link>` to `/dashboard/activity` | ✅ Pass | Lines 217-235: `const href = '/dashboard/activity'` with `<Link href={href}>` |
| AC-4 | Dashboard, Files, Claude Terminal, Members, Settings rendered as `<Link>` from `config/tools.json` | ✅ Pass | Each uses `tools[N]` from `ToolRegistry.getAllTools()` rendered as `<Link href={tool.href}>` |
| AC-5 | Collapsed sidebar (`w-16`) shows icons only, in same top-to-bottom order | ✅ Pass | Every item uses `{!collapsed && <span>}` to hide label; icons always rendered; JSX order is static regardless of `collapsed` |
| AC-6 | Active state highlighting (`aria-current="page"`, `bg-accent`) works for all items | ✅ Pass | All five Link items and Activity Link carry `aria-current={active ? 'page' : undefined}` and `active && 'bg-accent text-accent-foreground'` |
| AC-7 | No nav items added or removed; `config/tools.json` array order unchanged | ✅ Pass | `config/tools.json` still contains exactly 5 entries in original order: Dashboard, Files, Claude Terminal, Members, Settings |
| AC-8 | Workflows expand/collapse state preserved and functional | ✅ Pass | `workflowsExpanded` useState at line 26; auto-expand useEffect at lines 43-47; sub-list gated on `!collapsed && workflowsExpanded` at line 107 |

**Result: All 8 acceptance criteria pass. No regressions detected.**
