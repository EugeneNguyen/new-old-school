the add item, kanban, list, setting, changed them into the icon only

## Analysis

### Scope

**In scope:**
- Remove text labels from four toolbar buttons in `components/dashboard/WorkflowItemsView.tsx` (lines 111–186): **Add item**, **Kanban**, **List**, **Settings**.
- Each button already has (or needs) an icon from `lucide-react`. After the change, only the icon should render — no adjacent text.
- Add `title` / `aria-label` attributes so the buttons remain accessible and show a tooltip on hover.

**Out of scope:**
- The **Routine** button (line 176–186) — not mentioned in the request, though it follows the same pattern. Could be included if the user confirms.
- The search input and its clear button — these are not navigation actions.
- The **Workspace Switcher** settings button in `WorkspaceSwitcher.tsx` — separate context.
- Mobile / responsive layout changes beyond what naturally follows from smaller icon-only buttons.

### Feasibility

**Low risk / straightforward.**

| Button | Current state | Icon available? | Change needed |
|---|---|---|---|
| Add item | Text-only (`"Add item"`) | No icon imported yet | Import `Plus` from lucide-react; render icon-only with `aria-label` |
| Kanban | `<LayoutGrid>` icon + "Kanban" text | Yes | Remove text, add `title`/`aria-label` |
| List | `<List>` icon + "List" text | Yes | Remove text, add `title`/`aria-label` |
| Settings | `<Settings>` icon + "Settings" text | Yes | Remove text, add `title`/`aria-label` |

- The Kanban/List toggle group container may need width adjustment (`p-1` padding, `px-3` per button) once text is removed — icon-only buttons are narrower.
- The `Button` component already supports `size="icon"` usage patterns (seen elsewhere in the codebase, e.g., the search clear button at line 132–141).

### Dependencies

- **`lucide-react`** — already installed; `Plus` icon may need to be added to the import list.
- **`components/ui/button.tsx`** — the shared Button component; no changes expected, just use existing `size="icon"` or `size="sm"` variants.
- **Accessibility** — removing visible text means `aria-label` and `title` attributes become mandatory for screen readers and discoverability.
- **No backend or API changes required.**

### Open Questions

1. **Should the Routine button also become icon-only?** It follows the same toolbar pattern and wasn't explicitly mentioned.
2. **Tooltip behavior** — is a native `title` attribute sufficient, or should a styled tooltip component (e.g., Radix Tooltip) be used for consistency?
3. **Kanban/List toggle sizing** — should the toggle group shrink to a compact icon pair, or keep its current padded container style?
4. **Add item button** — should it use the `Plus` icon, or a different icon (e.g., `PlusCircle`)?

## Specification

### User Stories

- As a product designer, I want the toolbar buttons to be icon-only so that the interface is more compact and visually clean.
- As a user with low vision or using a screen reader, I want each button to have an `aria-label` and `title` attribute so that I can discover and understand button functionality without relying on visible text.
- As a developer, I want a clear, maintainable implementation so that future toolbar changes follow the same icon-only pattern consistently.

### Acceptance Criteria

1. The **Add item** button renders only the `Plus` icon (imported from `lucide-react`), with no text label visible.
2. The **Kanban** button renders only the `LayoutGrid` icon with no text label visible.
3. The **List** button renders only the `List` icon with no text label visible.
4. The **Settings** button renders only the `Settings` icon with no text label visible.
5. Each of the four buttons has a `title` attribute containing human-readable text (e.g., `title="Add item"`) that displays as a tooltip on hover.
6. Each of the four buttons has an `aria-label` attribute matching the button's intended action (e.g., `aria-label="Add item"`).
7. All buttons maintain their original click handlers and functionality.
8. The Kanban/List toggle group layout remains visually balanced and properly aligned after text removal.
9. No visual or functional regressions in other parts of the WorkflowItemsView component.

### Technical Constraints

- **File modified:** `components/dashboard/WorkflowItemsView.tsx` only (lines 111–186).
- **Icon library:** All icons must be imported from `lucide-react`; the `Plus` icon must be added to the existing import statement if not present.
- **Button component:** Use the existing Button component from `components/ui/button.tsx` with appropriate size variants (e.g., `size="icon"` or `size="sm"`).
- **Accessibility attributes:** Both `title` and `aria-label` are required; they must match or closely match the button's original text label.
- **No API changes:** The change is purely presentational; no backend or data model changes are required.
- **No third-party dependencies:** Avoid adding new dependencies (e.g., do not introduce a custom Tooltip component unless explicitly approved).

### Out of Scope

- Styling changes to the **Routine** button (unless explicitly confirmed by product).
- Modifications to the search input or its clear button.
- Changes to the Workspace Switcher or other toolbar components outside WorkflowItemsView.
- Mobile or responsive breakpoint adjustments beyond what naturally follows from icon-only sizing.
- Custom tooltip component implementation (standard HTML `title` attribute is sufficient).
- Any changes to workflow state, data fetching, or backend integrations.

## Implementation Notes

**Changes made:**
1. Added `Plus` icon to the lucide-react import (line 5)
2. **Add item button** (lines 111–113): Converted to `size="icon"`, renders Plus icon only, added `aria-label="Add item"`, updated title to always show "Add item" when enabled (preserving disabled tooltip)
3. **Kanban button** (lines 145–156): Removed "Kanban" text, added `title="Kanban"` and `aria-label="Kanban"`, adjusted CSS from `flex-1 px-3 text-sm` to `px-2` for compact icon-only sizing
4. **List button** (lines 157–168): Removed "List" text, added `title="List"` and `aria-label="List"`, adjusted CSS to match Kanban button sizing
5. **Settings button** (lines 170–178): Converted to `size="icon"`, removed text, added `title="Settings"` and `aria-label="Settings"`, removed icon margin

**Acceptance criteria met:**
- ✅ All four buttons render icons only (Plus, LayoutGrid, List, Settings)
- ✅ All four buttons have both `title` and `aria-label` attributes
- ✅ Original click handlers and functionality preserved
- ✅ Toggle group layout remains visually balanced with compact horizontal layout
- ✅ No regressions in other components; Routine button intentionally left unchanged per spec

**File modified:** `components/dashboard/WorkflowItemsView.tsx` (single file as specified)

## Validation

Validated by reading `components/dashboard/WorkflowItemsView.tsx` (lines 1–190).

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Add item button renders only `Plus` icon, no text | ✅ | Line 111–113: `<Button size="icon">…<Plus className="h-4 w-4" /></Button>` — no text node |
| 2 | Kanban button renders only `LayoutGrid` icon, no text | ✅ | Lines 145–156: `<LayoutGrid className="h-4 w-4" />` only inside button — no text node |
| 3 | List button renders only `List` icon, no text | ✅ | Lines 157–168: `<List className="h-4 w-4" />` only — no text node |
| 4 | Settings button renders only `Settings` icon, no text | ✅ | Lines 170–178: `<Button size="icon">…<Settings className="h-4 w-4" /></Button>` — no text node |
| 5 | Each button has a `title` attribute | ✅ | Add item: conditional `title` (`'Create a stage first'` when disabled, `'Add item'` when enabled); Kanban: `title="Kanban"`; List: `title="List"`; Settings: `title="Settings"` |
| 6 | Each button has an `aria-label` attribute | ✅ | All four: `aria-label="Add item"`, `aria-label="Kanban"`, `aria-label="List"`, `aria-label="Settings"` |
| 7 | Original click handlers preserved | ✅ | `openNewItem`, `updateViewMode('kanban')`, `updateViewMode('list')`, `router.push(…/settings)` all intact |
| 8 | Kanban/List toggle group layout visually balanced | ✅ | Container: `inline-flex rounded-md border bg-background p-1`; buttons use `px-2 py-1.5` — compact, symmetrical icon pair |
| 9 | No regressions in WorkflowItemsView | ✅ | Search input, clear button, Routine button, error banner, missing-item banner, KanbanBoard/ListView render — all unchanged |

**Additional checks:**
- `Plus` correctly added to lucide-react import (line 5): `import { LayoutGrid, List, Search, X, Settings, Plus } from 'lucide-react'` ✅
- Only `WorkflowItemsView.tsx` modified — no other files changed ✅
- No new dependencies introduced ✅
- The Add item `title` conditional (`'Create a stage first'` when disabled) is a UX improvement over the spec's static `'Add item'`; does not violate the criterion ✅

**Overall: All 9 acceptance criteria pass. Implementation is complete and correct.**
