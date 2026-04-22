# Add item in sidemenu to access file browser

## Analysis

### Scope

**In scope:**
- Add a new navigation item to the dashboard sidebar (`components/dashboard/Sidebar.tsx`) that links to the file browser at `/dashboard/workspaces`.
- The item should include an appropriate icon (e.g., `FolderOpen` or `HardDrive` from lucide-react) and a label such as "Files" or "File Browser".
- The item must respect the sidebar's collapsed/expanded state (icon-only when collapsed, icon + label when expanded).
- Active-state highlighting must work correctly when the user is on `/dashboard/workspaces` or any sub-path.

**Out of scope:**
- Creating a new dedicated `/dashboard/files` route — the file browser already exists at `/dashboard/workspaces` (implemented via REQ-00092).
- Modifying the file browser UI itself.
- Extracting `FileExplorer` into a standalone component (separate concern).
- Changes to the workspace switcher or workspace management features on the same page.

### Feasibility

**Technical viability: High — minimal change.**

The sidebar has two mechanisms for navigation items:

1. **Config-driven** (`config/tools.json`): Items defined here are rendered via `ToolRegistry.getAllTools()`. Adding an entry to this JSON array is the simplest path and maintains consistency with Dashboard, Claude Terminal, Members, and Settings.
2. **Hardcoded sections** (Activity, Workflows): These are written directly in `Sidebar.tsx` with custom logic (e.g., Workflows has an expandable sub-list fetched from an API).

Since the file browser is a single-page destination with no sub-navigation or dynamic children, **Option 1 (tools.json entry)** is the correct approach. It requires adding one JSON object and no code changes to `Sidebar.tsx`.

**Risks:**
- **Naming/placement**: The current workspaces page mixes workspace management (workspace switcher, workspace settings) with the file browser. The sidemenu label should clearly communicate "file browsing" without implying it's a separate feature from the workspaces page. Suggest label: "Files" (concise, clear).
- **Icon collision**: The Workflows section already uses the `Folder` icon. The file browser item should use a distinct icon (e.g., `FolderOpen`, `Files`, or `HardDrive`) to avoid visual confusion.

**Unknowns:** None — all infrastructure already exists.

### Dependencies

| Dependency | Type | Status |
|---|---|---|
| REQ-00092 (File system browser UI) | Prerequisite | Done — `FileExplorer` exists at `/dashboard/workspaces` |
| `config/tools.json` | Config file | Existing — add one entry |
| `components/dashboard/Sidebar.tsx` | Component | Existing — already renders tools.json entries; no changes needed |
| `lib/tool-registry.ts` | Library | Existing — must support the chosen icon name (lucide-react icons are dynamically mapped) |
| lucide-react | External package | Already installed |

### Open questions

1. **Label**: Should the item be called "Files", "File Browser", or "Workspaces"? "Files" is recommended for brevity and clarity, but "Workspaces" would match the existing route name.
2. **Placement**: Should the item appear among the config-driven tools (after Settings) or in a specific position? The tools.json array order determines render order — it should likely appear after Dashboard and before or after Claude Terminal, since file browsing is a primary action.
3. **Icon**: Confirm the icon choice. `FolderOpen` is the most intuitive for a file browser and distinct from the `Folder` icon used by Workflows.
4. **Route**: Should the link point to the existing `/dashboard/workspaces` or should a new `/dashboard/files` route be created that redirects or re-exports the same page? Using the existing route is simpler; a new route adds unnecessary indirection.

## Specification

### User Stories

1. **As a** dashboard user, **I want** a "Files" item in the sidebar navigation, **so that** I can access the file browser without memorizing the URL or navigating through other pages.
2. **As a** dashboard user, **I want** the sidebar to visually indicate when I am on the file browser page, **so that** I know where I am in the application.
3. **As a** dashboard user, **I want** the Files item to display only an icon when the sidebar is collapsed, **so that** the compact sidebar remains usable.

### Acceptance Criteria

1. **Given** the dashboard sidebar is rendered, **When** the user views the navigation items, **Then** a "Files" item appears between "Dashboard" and "Claude Terminal" in the config-driven tool list.
2. **Given** the "Files" sidebar item is visible, **When** the user clicks it, **Then** the browser navigates to `/dashboard/workspaces`.
3. **Given** the sidebar is in its expanded state, **When** the user views the Files item, **Then** it displays the `FolderOpen` icon alongside the label "Files".
4. **Given** the sidebar is in its collapsed state, **When** the user views the Files item, **Then** only the `FolderOpen` icon is displayed (no label text).
5. **Given** the user is on `/dashboard/workspaces` or any sub-path, **When** the sidebar renders, **Then** the Files item is highlighted with the active-state style.
6. **Given** the `config/tools.json` file, **When** inspected, **Then** it contains a new entry with `id: "files"`, `name: "Files"`, `href: "/dashboard/workspaces"`, `icon: "FolderOpen"`, and `category: "core"`.
7. **Given** the existing sidebar rendering logic in `Sidebar.tsx`, **When** the Files entry is added to `tools.json`, **Then** no code changes to `Sidebar.tsx` are required — the entry is rendered automatically by `ToolRegistry.getAllTools()`.

### Technical Constraints

1. **Implementation approach**: Add a single JSON object to `config/tools.json`. No changes to `components/dashboard/Sidebar.tsx` or `lib/tool-registry.ts` are required — the sidebar already renders all entries from `ToolRegistry.getAllTools()` (per `docs/standards/ui-design.md` component inventory).
2. **JSON schema**: The new entry must conform to the `ToolDefinition` interface defined in `types/tool.ts`:
   ```json
   {
     "id": "files",
     "name": "Files",
     "href": "/dashboard/workspaces",
     "icon": "FolderOpen",
     "description": "Browse workspace files",
     "endpoint": "/api/workspaces",
     "category": "core"
   }
   ```
3. **Array position**: The entry must be inserted at index 1 (after "Dashboard", before "Claude Terminal") so file browsing appears as a primary navigation action.
4. **Icon**: Must use `FolderOpen` from lucide-react to avoid collision with the `Folder` icon used by the Workflows section in the sidebar. The `ToolRegistry.getIcon()` method dynamically resolves lucide-react icons by name.
5. **Route**: Links to the existing `/dashboard/workspaces` route. No new route or redirect is created — the file browser UI (REQ-00092) already exists at that path.
6. **No API changes**: The endpoint field references the existing `/api/workspaces` route group (per `docs/standards/api-reference.md` § Workspaces).

### Out of Scope

1. Creating a new `/dashboard/files` route or redirect — the existing `/dashboard/workspaces` route is reused.
2. Modifying the `FileExplorer` component or file browser UI — that is the domain of REQ-00092.
3. Adding sub-navigation or expandable children under the Files item — it is a single-page destination.
4. Changing the Workspace Management section of the workspaces page (workspace switcher, settings).
5. Modifying `Sidebar.tsx` or `lib/tool-registry.ts` — the config-driven rendering already handles new entries.

### RTM Entry

| Field | Value |
|-------|-------|
| Req ID | REQ-00095 |
| Title | Add item in sidemenu to access file browser |
| Source | Feature request |
| Design Artifact | `docs/standards/ui-design.md`, `docs/standards/ux-design.md` |
| Implementation File(s) | `config/tools.json` |
| Test Coverage | Manual validation — visual inspection of sidebar rendering, navigation, active state, and collapsed/expanded states |
| Status | In Progress |

### WBS Mapping

| WBS ID | Package | Relevance |
|--------|---------|----------|
| 1.4.1 | Dashboard Shell (layout, sidebar, navigation, workspace switcher) | Primary — the sidebar navigation is the direct deliverable |
| 1.7.3 | Tool Registry (load tools from `config/tools.json` with icon resolution) | Secondary — the `tools.json` config file is the artifact being modified |
| 1.5.4 | Icon System (lucide-react icon library) | Tertiary — the `FolderOpen` icon must be available in the lucide-react package |

## Implementation Notes

Added a single JSON entry for the "Files" navigation item to `config/tools.json` at array index 1 (after Dashboard, before Claude Terminal). The entry uses `id: "files"`, `name: "Files"`, `href: "/dashboard/workspaces"`, `icon: "FolderOpen"`, `description: "Browse workspace files"`, `endpoint: "/api/workspaces"`, and `category: "core"`. No changes were made to `components/dashboard/Sidebar.tsx` or `lib/tool-registry.ts` — the existing config-driven rendering via `ToolRegistry.getAllTools()` automatically picks up and renders the new entry with correct active-state highlighting, icon-only collapsed mode, and icon+label expanded mode.

## Validation

### Evidence Summary

- `config/tools.json` inspected directly — entry confirmed at array index 1.
- `components/dashboard/Sidebar.tsx` inspected — unchanged; renders all `ToolRegistry.getAllTools()` entries as `<Link>` items with icon-only / icon+label based on `collapsed` state, active class via `isActive()`.
- `lib/tool-registry.ts` inspected — `getIcon()` does a dynamic lookup in `* as LucideIcons`; falls back to `HelpCircle` if not found.
- `FolderOpen` confirmed present in installed `lucide-react` package (`node -e "const l = require('lucide-react'); console.log('FolderOpen' in l)"` → `true`).
- `isActive('/dashboard/workspaces', pathname)` returns `true` for the route and any sub-path (checked against the implementation at `Sidebar.tsx:15-19`).
- No regressions: Dashboard, Claude Terminal, Members, Settings entries still present in `tools.json` at their original positions (indices 0, 2, 3, 4).

### Acceptance Criteria Results

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | "Files" item appears between "Dashboard" and "Claude Terminal" | ✅ | `tools.json` index 1 is the Files entry; Dashboard at 0, Claude Terminal at 2 |
| 2 | Clicking navigates to `/dashboard/workspaces` | ✅ | `href: "/dashboard/workspaces"` in entry; `Sidebar.tsx:68` renders `<Link href={tool.href}>` |
| 3 | Expanded state shows `FolderOpen` icon + "Files" label | ✅ | `icon: "FolderOpen"` confirmed resolvable; `Sidebar.tsx:81-82` renders icon unconditionally and label when `!collapsed` |
| 4 | Collapsed state shows only the icon | ✅ | `Sidebar.tsx:82`: `{!collapsed && <span>…</span>}` hides label when collapsed |
| 5 | Active-state highlighted on `/dashboard/workspaces` and sub-paths | ✅ | `isActive()` at `Sidebar.tsx:15-19` matches exact path and `startsWith(href + '/')` |
| 6 | `tools.json` entry has all required fields | ✅ | All fields (`id`, `name`, `href`, `icon`, `description`, `endpoint`, `category`) match spec exactly |
| 7 | No changes to `Sidebar.tsx` required | ✅ | `Sidebar.tsx` is unmodified; config-driven rendering picks up entry automatically |
