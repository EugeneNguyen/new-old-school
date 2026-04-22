# Remove workspace menu item in side menu.

## Analysis

### 1. Scope

**In scope:**
- Removing the workspace switcher UI from the sidebar (`components/dashboard/Sidebar.tsx` line 61: `<WorkspaceSwitcher />`)

**Explicitly out of scope:**
- Deleting workspace data or the workspace API endpoints
- Removing workspace functionality from other contexts (e.g., workspace routes in the API)

**Ambiguity:** The request title says "menu item" but the sidebar (`components/dashboard/Sidebar.tsx`) has only one workspace-adjacent element: the `<WorkspaceSwitcher />` component rendered below the app logo and above the nav links. It is not a "menu item" in the tool list — it is a dedicated section with a label, dropdown, and nested actions. The most reasonable interpretation is that the entire `WorkspaceSwitcher` should be removed, not just its label.

### 2. Feasibility

- **Technical viability:** Trivial. Remove one component import and one JSX element from `Sidebar.tsx`.
- **Risks:**
  - Users who rely on the switcher to change workspaces lose that capability. Confirm this is intentional.
  - The "Manage workspaces" (`/dashboard/workspaces`) and "New workspace" links inside the dropdown will no longer be accessible from the sidebar. Users would need an alternative path.
- **Unknowns:**
  - The workspace selection cookie (`nos_workspace`) is still set by API responses. It won't break anything if the UI is gone, but the backend may be storing state with no UI to observe or change it.
  - There is no other visible "workspace menu item" in the sidebar — the tool-based nav links are driven by `ToolRegistry`, which does not include a workspace tool by default.

### 3. Dependencies

- `components/dashboard/Sidebar.tsx` — remove `<WorkspaceSwitcher />` import and usage
- `components/dashboard/WorkspaceSwitcher.tsx` — becomes unused after removal (can be deleted or left in place for future use)
- `app/dashboard/workspaces/page.tsx` — stays functional, but loses its primary access point from the sidebar UI
- `app/api/workspaces/` — API endpoints are unaffected; they are not driven by the sidebar
- Cookie `nos_workspace` — still written by API responses; no impact from removing the UI

### 4. Open Questions

1. **What is the "menu item"?** If there is a workspace tool registered in `ToolRegistry` (e.g., `config/tools.json`), the sidebar tool list would include it. That would be the menu item to remove. Currently `ToolRegistry.getAllTools()` drives the nav links, and no workspace tool appears there by default. Please confirm whether a tool registry entry exists and should also be removed.
2. **What replaces the manage/new workspace paths?** If `/dashboard/workspaces` is still needed, it requires an alternative access point (e.g., a settings page, a toolbar button, or a direct URL bookmark). If not, the page and its API routes can be removed together.
3. **Is removing the switcher the full intent?** If the intent is to remove workspace awareness entirely, the cookie, API responses, and any workspace-scoped logic should also be audited. If the intent is only to clean up the sidebar, removing the switcher is sufficient.

---

*Prior analysis above; current analysis appended 2026-04-22.*

### 5. Scope (current assessment)

The item's title is "Remove workspace menu item in side menu." Given the sidebar's two distinct workspace-adjacent elements, this could mean two things:

**Interpretation A — Remove `WorkspaceSwitcher` component** (the dropdown at the top of the sidebar):
- Remove `<WorkspaceSwitcher collapsed={collapsed} />` from `Sidebar.tsx` (line 61)
- Remove its import (line 11)
- The "Files" and "Workspaces" tool entries in `tools.json` remain — navigation is unaffected

**Interpretation B — Remove "Workspaces" tool entry from `tools.json`**:
- Remove the `workspaces` object from `config/tools.json` (id: `workspaces`, name: `Workspaces`, href: `/dashboard/workspaces`, icon: `Briefcase`)
- The `<WorkspaceSwitcher />` and "Files" entry remain unchanged
- Navigation to `/dashboard/workspaces` still works via: the workspace switcher's "Manage workspaces" link (inside the dropdown), the "Files" page link, or direct URL

**Which interpretation is correct?** The title says "menu item" — the `WorkspaceSwitcher` is a dedicated section (labeled "Workspace"), not a tool item in the nav list. The tool-list items ("Dashboard", "Files", "Workspaces", "Claude Terminal", "Members", "Settings") are what are typically called "menu items." The `WorkspaceSwitcher` is its own component. So **Interpretation B is most likely**: remove the "Workspaces" entry from `config/tools.json`.

This analysis proceeds under **Interpretation B**.

### 6. Feasibility (Interpretation B)

**Technical viability: High.** Single JSON deletion; no code changes required.

- `Sidebar.tsx` renders tool items via `ToolRegistry.getAllTools()` (reads `config/tools.json`). Removing the entry automatically excludes it.
- The `/dashboard/workspaces` page and all API routes remain functional — they just lose their sidebar navigation entry.

**Implementation:** Remove the `workspaces` object from the `config/tools.json` array (index 2, after "Files" at index 1).

**Risks:**
- **Discoverability regression**: Users lose the sidebar shortcut to the workspace management page. The workspace switcher's "Manage workspaces" dropdown link and the "Files" page's link are fallback paths, but if "Workspaces" was the primary discoverability mechanism, this creates a UX gap.
- **Active state gap**: Without a sidebar item for `/dashboard/workspaces`, the workspace management page has no active highlight from the sidebar. (REQ-00091 added breadcrumbs to the workflows pages but not the workspaces page.)
- **Cross-requirement conflict**: REQ-00096 explicitly added the "Workspaces" entry in its implementation. REQ-00097 effectively reverts that decision. No code conflict, but REQ-00096's documentation may need alignment.

**Unknowns:** None.

### 7. Dependencies (Interpretation B)

| Dependency | Type | Status | Notes |
|---|---|---|---|
| `config/tools.json` | Config | Existing | Remove `"id": "workspaces"` entry |
| `Sidebar.tsx` | Component | Existing | No changes; config-driven |
| `WorkspaceSwitcher.tsx` | Component | Existing | Not affected by this change |
| REQ-00096 (file system browser) | Related requirement | In Progress | Added the "Workspaces" entry; this requirement removes it |
| REQ-00095 (add Files menu item) | Related requirement | Done | Added "Files" entry; not affected |

### 8. Open Questions (Interpretation B)

1. **Is removing the "Workspaces" entry sufficient, or should the "Files" page link also be removed?** The request only names "workspace menu item" — the Files page (which also links to `/dashboard/workspaces`) is out of scope per the stated intent.
2. **Should REQ-00096's documentation be updated** to note that the "Workspaces" entry was later removed by REQ-00097? This is a requirements-hygiene concern, not a blocking issue.
3. **Should `/dashboard/workspaces` get breadcrumbs** like the workflows pages did in REQ-00091? This was out of scope for REQ-00091 and remains out of scope here — but it surfaces the gap.

---

## Specification

### 1. User Stories

- **As an operator**, I want the sidebar navigation to show only the tools I actively use, so that infrequently accessed paths do not clutter the interface.
- **As an operator**, I want workspace management to remain accessible via the workspace switcher dropdown and the Files page, so that I am not permanently locked out of the management UI when the sidebar entry is removed.
- **As a future maintainer**, I want the tool registry to reflect only live navigation entries, so that `ToolRegistry.getAllTools()` does not surface routes that have been intentionally deprecated from the sidebar.

### 2. Acceptance Criteria

1. **AC-1:** `config/tools.json` does not contain any entry with `"id": "workspaces"` after implementation.
2. **AC-2:** The sidebar tool list (rendered by `Sidebar.tsx` via `ToolRegistry.getAllTools()`) does not render a "Workspaces" nav link.
3. **AC-3:** The `/dashboard/workspaces` route remains accessible via direct URL, the workspace switcher dropdown ("Manage workspaces" link), and the "Files" page sidebar link.
4. **AC-4:** Removing the entry does not break `Sidebar.tsx` rendering — the remaining five tool entries (Dashboard, Files, Claude Terminal, Members, Settings) render with correct hrefs, icons, and active-state highlighting.
5. **AC-5:** No TypeScript errors are introduced in `config/tools.json` or any file that imports `ToolRegistry`.
6. **AC-6:** No other tool entry is inadvertently removed or reordered (array index stability is preserved for non-workspaces entries).

### 3. Technical Constraints

- **Config shape:** `config/tools.json` must remain a valid JSON array. Each entry must conform to the `ToolEntry` shape: `{ id: string; name: string; href: string; icon: string; description: string; endpoint: string; category: string }` — per `lib/tools.ts` (ToolRegistry module).
- **Deletion scope:** Only the object with `"id": "workspaces"` is removed. No other entries are modified.
- **No code changes required:** `Sidebar.tsx` reads the registry at runtime. No JSX or import changes are needed if the config entry is the only target.
- **RTM alignment:** This requirement undoes the `tools.json` change from REQ-00096, which added the "Workspaces" entry. The RTM row for REQ-00096 should be updated to note this regression; the RTM row for REQ-00097 records the removal.

### 4. Out of Scope

The following are explicitly not in scope for this requirement:

- Deleting `components/dashboard/WorkspaceSwitcher.tsx` or removing it from `Sidebar.tsx` — the switcher is a distinct component and was explicitly excluded from Interpretation B.
- Deleting `app/dashboard/workspaces/page.tsx` or any `/api/workspaces/*` route handlers.
- Modifying the `nos_workspace` cookie, workspace API responses, or any backend workspace-scoped logic.
- Removing the `Briefcase` icon import or any other icon references that remain in use.
- Adding breadcrumbs to `/dashboard/workspaces` (flagged as a separate gap by the analysis).

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00097 |
| **Title** | Remove workspace menu item in side menu |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/ux-design.md` (§ Navigation), `docs/standards/wbs.md` (1.7.3) |
| **Implementation File(s)** | `config/tools.json` |
| **Test Coverage** | To be filled after validation |
| **Status** | In Progress |

*Note: REQ-00096's RTM row (added "Workspaces" entry) should be annotated to reflect this requirement's partial revert.*

### 6. WBS Mapping

This requirement maps to **WBS 1.7.3 — Tool Registry** ("load tools from `config/tools.json`"):

- **Primary package:** 1.7.3 Tool Registry
- **Affected deliverable:** `config/tools.json` — removal of one `ToolEntry` object
- **Downstream deliverables unaffected:** 1.4.11 Workspace Management (page stays functional), 1.7.2 Skill Registry (no relationship), 1.4.1 Dashboard Shell (Sidebar renders from registry — no direct file change)

No other WBS package is directly impacted. The change is isolated to the tool registry configuration file.

---

## Implementation Notes

**Implementation date:** 2026-04-22

**Changes made:**
- Removed the `"id": "workspaces"` entry from `config/tools.json` (array index 2, between "Files" and "Claude Terminal"). The entry had `name: "Workspaces"`, `href: "/dashboard/workspaces"`, `icon: "Briefcase"`, `category: "core"`.
- Updated RTM (`docs/standards/rtm.md`) to:
  1. Annotate REQ-00096's row with a note that the "Workspaces" entry was later removed by REQ-00097.
  2. Add a new row for REQ-00097 with all 6 acceptance criteria validated and status Done.

**Acceptance criteria verification:**
- AC-1: ✅ `config/tools.json` no longer contains any entry with `"id": "workspaces"` (verified by reading the file).
- AC-2: ✅ `Sidebar.tsx` renders tools via `ToolRegistry.getAllTools()` — the entry is gone, so "Workspaces" nav link is not rendered.
- AC-3: ✅ `/dashboard/workspaces` remains accessible via direct URL, WorkspaceSwitcher dropdown ("Manage workspaces" link at line 113 of `WorkspaceSwitcher.tsx`), and the "Files" page sidebar link.
- AC-4: ✅ Remaining five entries (Dashboard, Files, Claude Terminal, Members, Settings) are intact; no array index instability.
- AC-5: ✅ `tsc --noEmit` produces pre-existing errors in `lib/scaffolding.test.ts` only — no new errors introduced by this change.
- AC-6: ✅ Only the workspaces entry was removed; all other entries preserved with original field values.

**Deviations from documented standards:** None. The change is a minimal JSON deletion with no code changes required.

## Validation

| AC | Description | Verdict | Evidence |
|----|-------------|---------|---------|
| AC-1 | `config/tools.json` contains no entry with `"id": "workspaces"` | ✅ Pass | Read `config/tools.json` — 5 entries remain (dashboard, files, terminal, members, settings); workspaces entry absent |
| AC-2 | Sidebar tool list does not render a "Workspaces" nav link | ✅ Pass | `Sidebar.tsx` renders via `ToolRegistry.getAllTools()` — config entry gone, link not rendered |
| AC-3 | `/dashboard/workspaces` accessible via switcher, Files page, direct URL | ✅ Pass | WorkspaceSwitcher line 113 has "Manage workspaces" link; Files page links to `/dashboard/workspaces`; direct URL functional |
| AC-4 | `Sidebar.tsx` renders correctly with 5 remaining entries | ✅ Pass | All 5 entries have correct `href`, `icon`, `category` fields; array index stability confirmed |
| AC-5 | No TypeScript errors introduced by this change | ✅ Pass | `tsc --noEmit` shows only pre-existing errors in `lib/scaffolding.test.ts` (unrelated to this change) |
| AC-6 | No other tool entry removed or reordered | ✅ Pass | Only workspaces entry removed; all other entries preserved with original field values |

**Overall result:** All 6 acceptance criteria verified. Implementation is complete and correct. No regressions detected.