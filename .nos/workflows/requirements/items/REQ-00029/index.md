## Analysis

### Scope

**In scope**
- Update `components/dashboard/Sidebar.tsx` so the currently active navigation entry is visually highlighted while the user is on that route.
- Cover both navigation lists rendered by the sidebar:
  - Tool links driven by `ToolRegistry.getAllTools()` / `config/tools.json` (Dashboard, Claude Terminal, Settings, etc.), rendered at `Sidebar.tsx:47-65`.
  - Workflow links under the expandable "Workflows" group, rendered at `Sidebar.tsx:85-101` (`/dashboard/workflows/[id]`).
- Define the "active" rule: exact match for the dashboard root (`/dashboard`), prefix match (`startsWith`) for nested routes (e.g. `/dashboard/workflows/requirements/...` should activate both the parent tool link if any and the specific workflow link).
- Reuse existing design tokens (`bg-accent`, `text-accent-foreground`, `text-foreground`) rather than introducing new colors, so the active state reads as "on" and is distinguishable from the plain hover state.
- Keep the collapsed-sidebar mode working: active state must remain visible when only the icon is shown (`collapsed && 'justify-center px-0'`).
- Auto-expand the Workflows group when the current route is a workflow detail page so the highlighted child is not hidden behind the collapsed toggle.

**Out of scope**
- Redesigning the sidebar layout, iconography, or information architecture.
- Adding breadcrumbs, page titles, or any in-screen highlighting outside the sidebar.
- Persisting sidebar collapsed/expanded state (already handled by `SidebarContext`).
- Changing the tools registry or workflow fetch behavior.
- Mobile / responsive treatment beyond what the sidebar already supports.

### Feasibility

Low risk, straightforward Next.js App Router work.

- The sidebar is already a client component (`'use client'` at `Sidebar.tsx:1`), so we can call `usePathname()` from `next/navigation` directly and compare it to each link's `href`.
- `cn` from `@/lib/utils` already composes conditional class lists, so adding an `isActive` branch is a one-line change per link.
- No state management changes are required; `usePathname()` is reactive to route changes and will re-render the sidebar automatically.
- Unknowns / minor risks:
  1. Nested route matching — decide between exact match and prefix match. Likely: exact for `/dashboard`, prefix for everything else. Needs to be careful so `/dashboard` does not appear active on every subpage.
  2. Workflow group auto-expand — `workflowsExpanded` is currently local `useState` (`Sidebar.tsx:15`). To auto-open when the route matches a workflow, derive the initial value (or a side-effect) from the pathname.
  3. Accessibility — active item should also get `aria-current="page"` for screen readers, not just a visual class.

### Dependencies

- **Code touched**
  - `components/dashboard/Sidebar.tsx` — primary change (add `usePathname`, compute `isActive`, merge into `cn(...)` class lists, add `aria-current`, auto-expand workflows group when active).
- **Potentially consulted**
  - `config/tools.json` and `lib/tool-registry.ts` — no change expected, but the `href` values are the source of truth for the tool-link active check.
  - `app/dashboard/**` route segments — verify the actual pathnames used (especially `app/dashboard/workflows/[id]/page.tsx`) so the prefix-match logic is accurate.
  - `components/dashboard/SidebarContext.tsx` — only relevant if we decide to move `workflowsExpanded` into the shared context (not required for this requirement).
- **External systems** — none. Pure client-side UI change; no API, storage, or workflow-engine impact.
- **Related requirements** — none of the open requirements in `.nos/workflows/requirements/items/` depend on this; it's an isolated visual fix.

### Open questions

1. **Match semantics for `/dashboard`** — should the Dashboard tool entry be active only on exactly `/dashboard`, or also on every subpage (since `/dashboard/...` is still "inside the dashboard tool")? Recommendation: exact match, otherwise it will always look active.
2. **Active style intensity** — do we want just a background tint (`bg-accent text-accent-foreground`), or also a leading indicator (left border / bar) to make it unmistakable? Affects visual design and collapsed-mode treatment.
3. **Workflows group expansion behavior** — when the user navigates to a workflow page, should the group auto-expand every time, or only on first navigation (respecting subsequent user-initiated collapse)? Recommendation: auto-expand on first match per mount; do not fight the user afterwards.
4. **Collapsed-mode highlight** — in collapsed sidebar, should the active icon get a filled background, a ring, or both? Needs a quick design call.
5. **Non-tool routes** — are there dashboard routes that are not in `config/tools.json` (e.g. a detail page reached from within a tool) where we still want a parent tool highlighted? If yes, we need a per-tool "activeMatch" rule in `tools.json` rather than string comparison on `href`.

## Specification

### User stories

1. As a user navigating the dashboard, I want the sidebar entry matching my current route to be visually highlighted, so that I can see at a glance which tool or workflow I am currently in.
2. As a user on a workflow detail page (`/dashboard/workflows/[id]`), I want the Workflows group to be automatically expanded and the matching workflow child link highlighted, so that the active location is never hidden behind a collapsed group.
3. As a user with the sidebar collapsed to icons, I want the active entry's icon to remain visibly highlighted, so that I can still orient myself without expanding the sidebar.
4. As a screen reader user, I want the active sidebar entry to announce itself as the current page, so that I can navigate the dashboard non-visually.

### Acceptance criteria

1. **Tool link exact match for dashboard root**
   - **Given** the user is on the exact path `/dashboard`
   - **When** the sidebar renders
   - **Then** the "Dashboard" tool entry (whose `href` is `/dashboard`) is rendered with the active visual state AND `aria-current="page"`, and no other tool entry is active.

2. **Tool link prefix match for nested tool routes**
   - **Given** a tool entry in `config/tools.json` with `href` `/dashboard/<toolId>` (any non-root tool, e.g. `/dashboard/settings`)
   - **When** the current pathname equals that `href` OR starts with `${href}/`
   - **Then** that tool entry is rendered active with `aria-current="page"`.
   - The rule MUST NOT cause `/dashboard` to match when the pathname is `/dashboard/settings` (dashboard is exact-match only).

3. **Workflow child link active**
   - **Given** the current pathname is `/dashboard/workflows/<id>` or any deeper subpath of it
   - **When** the sidebar renders
   - **Then** the workflow link whose `href` is `/dashboard/workflows/<id>` is rendered active with `aria-current="page"`.

4. **Workflows group auto-expands when a child is active**
   - **Given** the user navigates (or initially loads) a pathname matching `/dashboard/workflows/<id>` or deeper
   - **When** the sidebar mounts and on subsequent pathname changes
   - **Then** the Workflows group is expanded so the active child is visible.
   - **However**, if the user subsequently toggles the group closed via the chevron while still on a workflow route, the group stays closed until the user navigates to a different workflow or reloads — i.e. auto-expand triggers on pathname changes into/between workflow routes, not on every render.

5. **Active state reuses existing design tokens**
   - The active class set MUST be `bg-accent text-accent-foreground` (matching the hover tokens already present in `Sidebar.tsx`), and MUST NOT introduce new Tailwind color utilities or custom CSS.
   - Hover on an already-active entry MUST NOT change its appearance in a way that makes it read as inactive.

6. **Collapsed-mode highlight remains visible**
   - **Given** `collapsed === true` in `SidebarContext`
   - **When** an entry is active
   - **Then** the active `bg-accent text-accent-foreground` styling is applied to the icon-only button, and the active state is visually distinguishable from inactive icons at a glance.

7. **Accessibility attribute**
   - Every active sidebar link (tool link or workflow child link) MUST carry `aria-current="page"`.
   - Non-active links MUST NOT carry `aria-current`.

8. **Route reactivity**
   - **Given** the user clicks from one sidebar entry to another
   - **When** Next.js updates the pathname
   - **Then** the sidebar re-renders and the highlighted entry updates without a full page reload and without any manual refresh.

### Technical constraints

- **File touched**: `components/dashboard/Sidebar.tsx` only. No changes to `config/tools.json`, `lib/tool-registry.ts`, `components/dashboard/SidebarContext.tsx`, or any route/page file.
- **Pathname source**: use `usePathname()` from `next/navigation`. Do not read `window.location` or pass the path in via props.
- **Active-match helper**: implement a single local helper with signature roughly `isActive(href: string, pathname: string): boolean` that returns:
  - `pathname === href` when `href === '/dashboard'` (exact match for the root).
  - `pathname === href || pathname.startsWith(href + '/')` otherwise (prefix match with a `/` boundary so `/dashboard/work` does not match `/dashboard/workflows`).
  - Treat a missing/empty pathname as "no active entry".
- **Class composition**: reuse `cn` from `@/lib/utils`. Append `'bg-accent text-accent-foreground'` to the existing class list when active; do not remove or reorder existing classes.
- **Workflow auto-expand**: derive from pathname via a `useEffect` keyed on `usePathname()` that sets `workflowsExpanded` to `true` when the pathname matches a workflow route. Do not force it back to `false` on non-workflow routes (respect user toggling).
- **ARIA**: add `aria-current={isActive ? 'page' : undefined}` on every `<Link>` the sidebar renders for tool links and workflow child links.
- **Performance**: no additional network requests, no new context providers, no additional client libraries. The change must remain O(n) over the already-rendered list of links.
- **Compatibility**: must continue to work with the existing `SidebarContext` collapsed state and the existing workflows fetch behavior. No changes to the tools registry contract.
- **No new dependencies**: do not add any npm packages.

### Out of scope

- Adding a per-tool `activeMatch` or regex field to `config/tools.json` (open question 5 is deferred; current spec assumes `href`-based matching is sufficient).
- Adding a left-border / indicator bar or any other visual treatment beyond the `bg-accent text-accent-foreground` tint (open question 2 is resolved in favor of tint-only to stay within existing tokens).
- Highlighting breadcrumbs, page headers, tab bars, or any element outside `components/dashboard/Sidebar.tsx`.
- Persisting the `workflowsExpanded` flag across reloads or moving it into `SidebarContext`.
- Mobile- or viewport-specific active-state treatments.
- Redesigning iconography, typography, spacing, or information architecture of the sidebar.
- Changes to the tools registry, workflow fetch endpoint, or any backend/API behavior.

## Implementation Notes

Changes confined to `components/dashboard/Sidebar.tsx`:
- Added `usePathname` import from `next/navigation` and a local `isActive(href, pathname)` helper: exact match for `/dashboard`, otherwise `pathname === href || pathname.startsWith(href + '/')`, with null/empty pathname treated as no match.
- Tool link loop now computes `active`, appends `bg-accent text-accent-foreground` via `cn`, and sets `aria-current={active ? 'page' : undefined}`. Existing hover and collapsed classes are preserved.
- Workflow child links do the same, using `/dashboard/workflows/<id>` as the href source of truth.
- Added a `useEffect` keyed on `pathname` that sets `workflowsExpanded` to `true` whenever the path is `/dashboard/workflows` or starts with `/dashboard/workflows/`. The effect only fires on pathname change, so a user-initiated chevron close while on the same workflow route is respected; navigating to a different workflow re-expands.
- No changes to `tools.json`, `tool-registry`, `SidebarContext`, or any route files. No new dependencies.

No deviations from the spec.

## Validation

1. ✅ **Tool link exact match for dashboard root** — `isActive` at `Sidebar.tsx:12-16` returns `pathname === href` when `href === '/dashboard'`, so only the exact `/dashboard` route activates the Dashboard entry. Active class `bg-accent text-accent-foreground` and `aria-current={active ? 'page' : undefined}` are applied at `Sidebar.tsx:69,75`.
2. ✅ **Tool link prefix match for nested tool routes** — for non-root hrefs, `isActive` returns `pathname === href || pathname.startsWith(href + '/')` (`Sidebar.tsx:15`). The `+ '/'` boundary prevents `/dashboard/work` from matching `/dashboard/workflows`. Verified against existing routes (`settings`, `terminal`, `workflows`).
3. ✅ **Workflow child link active** — workflow links compute `active = isActive('/dashboard/workflows/<id>', pathname)` at `Sidebar.tsx:106`, with matching class and `aria-current` at `Sidebar.tsx:111,116`.
4. ✅ **Workflows group auto-expands when a child is active** — `useEffect` keyed on `pathname` (`Sidebar.tsx:40-44`) calls `setWorkflowsExpanded(true)` only when the pathname matches `/dashboard/workflows` or a `/dashboard/workflows/` subpath. It never forces `false`, so a user-initiated chevron close while on the same route is respected (effect doesn't re-fire). Navigating to a different workflow re-fires the effect.
5. ✅ **Active state reuses existing design tokens** — active class is exactly `'bg-accent text-accent-foreground'` (`Sidebar.tsx:75,116`), same tokens as the hover state. No new Tailwind utilities or custom CSS. Appended via `cn` so prior classes are preserved; hover on active keeps the same tokens so it doesn't read as inactive.
6. ✅ **Collapsed-mode highlight remains visible** — the active class is appended unconditionally in the tool-link `cn(...)` (`Sidebar.tsx:70-76`), so the icon-only button retains `bg-accent text-accent-foreground` when `collapsed === true`. Workflow child links are intentionally hidden in collapsed mode (`!collapsed && workflowsExpanded` at `Sidebar.tsx:102`), which is consistent with the existing sidebar behavior.
7. ✅ **Accessibility attribute** — `aria-current={active ? 'page' : undefined}` is set on every tool `<Link>` (`Sidebar.tsx:69`) and every workflow child `<Link>` (`Sidebar.tsx:111`). Inactive links receive `undefined`, which React omits from the DOM.
8. ✅ **Route reactivity** — `pathname = usePathname()` at `Sidebar.tsx:21` is reactive; Next.js re-renders the client component on route changes, so the highlighted entry updates without a page reload.

**Regression / adjacency checks**
- ✅ `npx tsc --noEmit` passes with no errors.
- ✅ Sidebar collapse/expand toggle still works (no changes to `SidebarContext` usage at `Sidebar.tsx:20,133`).
- ✅ Workflows fetch behavior unchanged (`Sidebar.tsx:25-38`).
- ✅ No changes to `config/tools.json`, `lib/tool-registry.ts`, `components/dashboard/SidebarContext.tsx`, or any route files (verified via `git status`).
- ✅ No new npm dependencies.
- ✅ Edge case `/dashboard/work` vs `/dashboard/workflows`: confirmed `isActive('/dashboard/workflows', '/dashboard/work')` → false due to the `+ '/'` boundary.
- ✅ Null pathname treated as "no active entry" (`Sidebar.tsx:13`).

All acceptance criteria pass. Ready to advance.
