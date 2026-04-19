current

* Switch kanban/list
* search
* add item
* setting
* space between kanban/list switch + search and add item and setting

desired

* Add item
* space
* search
* kanban/list
* setting

## Analysis

### 1. Scope

**In scope**
- Reorder the header controls in `components/dashboard/WorkflowItemsView.tsx` (lines ~103–172) so they render in this left-to-right order:
  1. **Add item** button (currently after the search/view-switch cluster).
  2. Flexible spacer (so subsequent controls are grouped to the right, matching "space" in the desired spec).
  3. **Search** input (with existing clear-button and Escape-to-clear behavior preserved).
  4. **Kanban/List** view-mode toggle (currently leftmost).
  5. **Settings** button (unchanged position relative to right edge).
- Preserve existing responsive behavior (`sm:flex-row`, wrapping on narrow viewports) and existing styling/variants of each control.
- Preserve existing state/handlers: `viewMode`, `updateViewMode`, `query`/`setQuery`, `openNewItem`, settings navigation.

**Out of scope**
- No changes to the `Add item` dialog (`NewItemDialog`), `Settings` page, search matching logic, or Kanban/List component internals.
- No visual redesign (colors, typography, icon swaps) beyond reordering and the spacer.
- No keyboard-shortcut changes.
- No changes to mobile-specific layout beyond what naturally falls out of the reorder (but mobile must not regress).

### 2. Feasibility

- Purely a JSX reorder within a single client component. No new dependencies, no API/data changes, no store changes.
- The current layout uses `justify-between` between a left cluster (toggle + search) and a right cluster (Add + Settings). The desired layout inverts roles: `Add item` becomes the leftmost element, and the right cluster grows to include `search`, `kanban/list`, and `settings`. Easiest implementation is a single flex row with `justify-between` where the left side contains only `Add item` and the right side contains the other three in order.
- Risks:
  - Narrow-viewport wrap order: currently the Kanban/List toggle takes `w-full` on mobile (`sm:w-auto`). After the reorder, we need to confirm the mobile stack order is sensible (likely: Add item, then search full-width, then toggle full-width, then settings). Minor CSS tweak may be needed but no architectural risk.
  - Accessibility / tab order will follow DOM order, which will now start at `Add item`. Acceptable and arguably better.
- Unknowns requiring spikes: none.

### 3. Dependencies

- File touched: `components/dashboard/WorkflowItemsView.tsx` only.
- No backend routes, no `lib/` utilities, no `.nos` config touched.
- No other requirement currently in-flight modifies this header block; safe to proceed independently.
- Related but unaffected: `WorkflowSettingsView.tsx` (linked via the Settings button), `KanbanBoard.tsx` / `ListView.tsx` (consumers of `viewMode`).

### 4. Open questions

- **Spacer semantics**: the request says "space" between Add item and search. Should this be a fixed gap (matching existing `gap-2`) or a flexible spacer that pushes the right-hand group to the far right? Interpreting as a flexible spacer (i.e., `Add item` left-aligned, everything else right-aligned) because that matches the current visual rhythm. Confirm before implementation.
- **Mobile ordering**: should `Add item` remain the first control on mobile too, or should search get priority on small screens? Default assumption: keep DOM order on mobile (Add item first).
- **Settings button label on mobile**: currently shows "Settings" text + icon. No change requested, leaving as-is.

## Specification

### User stories

1. As a **workflow user**, I want the **Add item** button to be the leftmost control in the workflow header, so that the primary action is immediately reachable without scanning past filter controls.
2. As a **workflow user**, I want the **search**, **kanban/list toggle**, and **settings** controls grouped on the right side of the header, so that navigation and filtering tools are spatially separated from the primary action.
3. As a **workflow user on a narrow viewport**, I want the reordered controls to stack in a logical sequence (Add item first, then search, then toggle, then settings), so that the primary action remains accessible without horizontal scrolling.

### Acceptance criteria

1. **Left-side placement of Add item**
   - Given the workflow header is rendered at any viewport width ≥ 640 px (`sm` breakpoint),
   - When I observe the left end of the header row,
   - Then the first interactive element is the **Add item** button and it is left-aligned.

2. **Right-side grouping order: Search → Toggle → Settings**
   - Given the workflow header is rendered at viewport width ≥ 640 px,
   - When I observe the right cluster of controls left-to-right,
   - Then the order is: **Search input**, then **Kanban/List toggle**, then **Settings** button.

3. **Flexible spacer between Add item and the right cluster**
   - Given the header row is wider than the sum of all control widths,
   - When the header renders,
   - Then empty space between **Add item** and the right cluster grows to fill the available width (i.e., `Add item` is flush left and the right cluster is flush right).

4. **Search behavior unchanged**
   - Given a search query is entered in the search input,
   - When the Escape key is pressed while the input has a non-empty value,
   - Then the query is cleared and the clear (×) button disappears.
   - Given the clear (×) button is visible,
   - When it is clicked,
   - Then the query is cleared.

5. **Kanban/List toggle behavior unchanged**
   - Given the current view mode is Kanban,
   - When the **List** button in the toggle is clicked,
   - Then the view switches to List and the active button reflects the new mode.
   - And vice versa: switching from List to Kanban works identically.

6. **Add item disabled state preserved**
   - Given no workflow stages have been configured (`currentStages.length === 0`),
   - When the header renders,
   - Then the **Add item** button is disabled.

7. **Mobile stacking order (viewport < 640 px)**
   - Given the viewport is narrower than 640 px,
   - When the header wraps to a stacked layout,
   - Then the vertical DOM order from top to bottom is: **Add item**, **Search input**, **Kanban/List toggle**, **Settings** button.

8. **No visual regressions on other header controls**
   - The icon, label, variant (`outline`, `ghost`, `default`), and size of every button remain identical to the pre-reorder state — only their position in the row changes.

### Technical constraints

- **File**: `components/dashboard/WorkflowItemsView.tsx` — this is the only file that may be modified.
- **Flex layout**: implement the desired order using a single `flex` row where `Add item` is the sole left child and a right-hand `flex` sub-container (`items-center gap-2`) holds Search, Toggle, and Settings in that order. Do **not** rely on CSS `order` or absolute positioning.
- **Spacer**: the gap between the left child and the right sub-container must be achieved with Tailwind's `justify-between` on the outer row (or equivalent `flex-1` spacer div), not a fixed margin.
- **Responsive class retention**: the `w-full sm:w-auto` class on the Kanban/List toggle's wrapper `div` must be retained so that the toggle expands to full width on narrow viewports.
- **Existing state and handlers**: `viewMode`, `updateViewMode`, `query`, `setQuery`, `openNewItem`, and `router.push(…/settings)` are bound to their respective controls and must not be re-wired.
- **No new imports**: the reorder requires no additional npm packages or component imports.
- **TypeScript**: the change must produce zero type errors (`tsc --noEmit` passes).
- **Tailwind**: use only existing Tailwind utility classes already present in the file; do not add custom CSS.

### Out of scope

- Changes to `NewItemDialog`, `WorkflowSettingsView`, `KanbanBoard`, `ListView`, or any other component.
- Visual redesign: colors, typography, icon replacements, button size changes.
- Keyboard shortcut additions or modifications.
- Search algorithm, filter logic, or matching behavior.
- Any backend API route, `lib/` utility, or `.nos/` configuration file.
- Animations or transition effects on reorder.
- A/B testing or feature-flag gating of the new order.

## Implementation Notes

Reordered the header controls in `WorkflowItemsView.tsx` (lines 105–172):

- **Add item** button moved to be the first child of the outer flex container (leftmost position)
- **Search** input moved inside the right-side flex sub-container, now appearing before the toggle
- **Kanban/List** toggle moved after search (was previously first)
- **Settings** button moved inside the right-side sub-container, now last in that group
- The outer flex container retains `sm:justify-between` to create a flexible spacer between Add item and the right cluster
- Mobile stacking order is: Add item → Search → Toggle → Settings (matching DOM order)
- All existing handlers (`viewMode`, `updateViewMode`, `query`, `setQuery`, `openNewItem`, settings navigation) preserved
- No visual or behavioral changes beyond the reordering
- TypeScript passes with zero errors

## Validation

Code reviewed against `components/dashboard/WorkflowItemsView.tsx` lines 103–172 (current HEAD). TypeScript (`npx tsc --noEmit`) completed with zero errors.

1. ✅ **Left-side placement of Add item** — line 106: `<Button size="sm" onClick={openNewItem} …>Add item</Button>` is the first child of the outer `flex flex-col sm:flex-row sm:justify-between` container (line 105). At ≥ 640 px it renders leftmost.
2. ✅ **Right-side grouping order: Search → Toggle → Settings** — inner container at line 109 (`flex flex-wrap items-center gap-2`) contains, in order: Search input block (lines 110–138), Kanban/List toggle (lines 139–162), Settings button (lines 163–170).
3. ✅ **Flexible spacer** — outer row uses `sm:justify-between` (line 105); with only two flex children (Add button + right sub-container) the free space collapses to the gap between them, pushing the right cluster flush right.
4. ✅ **Search behavior unchanged** — Escape-clear preserved on lines 118–123 (`if (e.key === 'Escape' && query !== '') … setQuery('')`); click-clear preserved on lines 126–137 (× button `onClick={() => setQuery('')}` only rendered when `query` is truthy).
5. ✅ **Kanban/List toggle behavior unchanged** — lines 140–161: both buttons call `updateViewMode('kanban' | 'list')` and toggle the active class (`bg-primary text-primary-foreground`) via `viewMode ===` comparison.
6. ✅ **Add item disabled state preserved** — line 106: `disabled={currentStages.length === 0}`.
7. ✅ **Mobile stacking order** — outer container uses `flex-col` on mobile (no `sm:` prefix on `flex-row`, only applies ≥ 640 px), so Add button stacks above the inner cluster. Inner cluster's DOM order is Search → Toggle → Settings; the toggle's `w-full sm:w-auto` (line 139) forces it to its own row, yielding vertical order Add → Search → Toggle → Settings.
8. ✅ **No visual regressions** — Add item remains `size="sm"` default variant (line 106); Settings remains `size="sm" variant="outline"` with `Settings` icon + label (lines 163–170); toggle buttons retain their `rounded px-3 py-1.5` styling and icons (lines 144–161); search input retains `h-8 w-48 pl-8 pr-8` and clear button retains `variant="ghost" size="icon"` (lines 124–135). No class, variant, size, icon, or label changed — only DOM position.

All 8 acceptance criteria pass. No regressions identified in adjacent functionality: `viewMode` persistence, search filtering (`filteredItems` memo at lines 90–96), and the settings-page route (`router.push(…/settings)`) are untouched. Item ready to advance to Done.
