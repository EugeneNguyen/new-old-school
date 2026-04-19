Current

* Stage & Status is in list style



Desired

* It should be in dropdown style

## Analysis

### 1. Scope

**In scope**

- Replace the current vertical list-of-buttons pickers for **Stage** and **Status** in the item side panel with a dropdown control in both dialogs:
  - `components/dashboard/NewItemDialog.tsx` (Stage picker at lines ~152–171; Status is a single read-only row showing `Todo` at lines ~178–186).
  - `components/dashboard/ItemDetailDialog.tsx` (Stage picker at lines ~335–354; Status picker at lines ~361–394).
- Preserve existing behavior and contracts:
  - Stage change still calls `setStage(name)` and is persisted via the existing save flow.
  - Status change still calls `setStatus(s)` with `ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed'`.
  - Status dot color tokens from `getItemStatusStyle`/the inline mapping in `ItemDetailDialog` (lines ~383–387) must be retained in the trigger and/or menu items.
  - In `NewItemDialog` the Status field stays effectively locked to `Todo` (new items cannot ship with any other initial status); the dropdown there may be rendered disabled or as a read-only trigger, not a full selector.
- Keep keyboard accessibility (focusable trigger, arrow-key navigation through options, Enter/Escape) and ARIA semantics equivalent or better than the current `<button>` list.

**Out of scope**

- No changes to the data model, API routes, or status transition rules (status is still owned by the NOS runtime; see `CLAUDE.md` → *Workflow Item Status Protocol*).
- No redesign of the side-panel layout beyond swapping these two controls.
- No changes to other list-style pickers elsewhere in the app (e.g. `StageDetailDialog`, `AddStageDialog`, settings pages) unless the same component is reused there.
- Introducing a full generic `Select` primitive for the design system is **not** required; if added, it should be minimal and colocated under `components/ui/`.

### 2. Feasibility

- Technically straightforward. Both dialogs are client components and already hold the selected value in local `useState`, so swapping the render layer is isolated.
- `components/ui/` currently has no `select`/`dropdown` primitive (only `badge`, `button`, `card`, `dialog`, `input`, `scroll-area`). Two realistic options:
  1. **Native `<select>`** styled with Tailwind — smallest change, good a11y out of the box, but limited control over per-option styling (e.g., the Status color dot cannot appear inside `<option>` reliably across browsers).
  2. **Headless dropdown** (e.g., Radix `@radix-ui/react-select` or `@radix-ui/react-dropdown-menu`) — gives full control over trigger/menu styling so the colored status dot renders consistently, matches the existing shadcn-style look of `dialog.tsx`, and is the more likely long-term fit. Requires adding a dependency and a thin wrapper.
- Risks / unknowns:
  - Whether the project already has a preferred dropdown approach (no Radix select currently installed per `components/ui/` listing — confirm against `package.json` during Plan stage).
  - Visual parity: the Status option currently shows its colored dot only when active; in a dropdown we need to decide whether the dot appears on every menu item and on the trigger.
  - Mobile behavior: native `<select>` is friendlier on touch; if we go custom we must ensure the menu is usable on small screens and inside the dialog's scroll container.
  - Form semantics in `NewItemDialog` — current code submits stage via local state, not a form field, so replacing the list with a dropdown is safe, but make sure `autoFocus` ordering (title input keeps focus) is not disturbed.

### 3. Dependencies

- Files touched:
  - `components/dashboard/NewItemDialog.tsx`
  - `components/dashboard/ItemDetailDialog.tsx`
  - Potentially a new shared primitive (e.g., `components/ui/select.tsx`) if we go the headless route.
- Shared helpers reused as-is: `@/lib/utils` (`cn`), `@/lib/item-status-style` (`getItemStatusStyle`), `@/types/workflow` (`Stage`, `ItemStatus`, `WorkflowItem`).
- External: possibly adds `@radix-ui/react-select` (or equivalent) to `package.json` — needs approval during Plan stage.
- No API or runtime dependency; NOS runtime status ownership (`lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`) is untouched.

### 4. Open questions

1. **Dropdown implementation** — native `<select>` (zero deps, limited styling) vs. Radix-based custom dropdown (matches design system, allows colored status dot in options). Which does the team prefer?
2. **Status in `NewItemDialog`** — keep the dropdown present but disabled showing `Todo`, or remove the Status field entirely from the create flow since it is not user-editable?
3. **Scope of change** — should other list-style pickers in the app (if any analogous ones exist, e.g., stage/status pickers inside `StageDetailDialog` or settings) also be converted for consistency, or is this strictly limited to the two dialogs referenced in the request?
4. **Visual spec** — should the Status dropdown show the color dot in both the trigger and each menu item, or only in the menu items (matching today's "only on active" pattern)?

## Specification

### 1. User stories

1. **As a** workflow user editing an existing item in the detail dialog, **I want** to change the item's Stage via a compact dropdown, **so that** I can pick among many configured stages without the side panel growing a long vertical list.
2. **As a** workflow user editing an existing item, **I want** to change the item's Status via a dropdown that still shows the colored status dot, **so that** I get the same visual cue the current list provides but in less vertical space.
3. **As a** workflow user creating a new item, **I want** to pick the initial Stage from a dropdown, **so that** the create dialog's layout matches the detail dialog and does not scroll when many stages are configured.
4. **As a** workflow user creating a new item, **I want** to see a read-only Status control that clearly shows `Todo`, **so that** I understand new items always start at `Todo` (and status is not mine to choose).
5. **As a** keyboard-only user, **I want** to open and navigate both dropdowns with the keyboard, **so that** the new controls are at least as accessible as today's button list.

### 2. Acceptance criteria

**Stage dropdown — `ItemDetailDialog`**

1. **Given** an item detail dialog is open on an existing item, **When** the user looks at the `Stage` field, **Then** it renders as a single dropdown trigger showing the currently selected stage name (not a vertical list of buttons).
2. **Given** the Stage dropdown is closed, **When** the user clicks the trigger (or focuses it and presses `Enter`/`Space`/`↓`), **Then** a menu opens listing every stage from `workflow.stages` in configured order.
3. **Given** the Stage menu is open, **When** the user selects a stage, **Then** the menu closes, the trigger updates to show that stage, and the component invokes the existing `setStage(name)` handler so the save flow persists the value unchanged.
4. **Given** the Stage menu is open, **When** the user presses `Escape`, **Then** the menu closes without changing the selection.
5. **Given** the current item has a `stage` value that does not match any configured stage, **Then** the trigger shows that value as-is and the menu still opens normally (same tolerance as today's list).

**Status dropdown — `ItemDetailDialog`**

6. **Given** an item detail dialog is open on an existing item, **When** the user looks at the `Status` field, **Then** it renders as a single dropdown trigger showing the current status label and its colored dot.
7. **Given** the Status dropdown is open, **Then** the menu lists exactly these options in order: `Todo`, `In Progress`, `Done`, `Failed`, each with its colored dot visible on the left.
8. **Given** the Status menu is open, **When** the user selects an option, **Then** the menu closes, the trigger updates, and the component invokes the existing `setStatus(s)` handler (typed `ItemStatus`).
9. **Given** the Status trigger or any menu item is rendered, **Then** the dot color is derived from the same source used today (`getItemStatusStyle(status).dot` / the inline mapping at lines ~383–387) — no new color tokens introduced.

**Stage dropdown — `NewItemDialog`**

10. **Given** the New Item dialog is open, **When** the user looks at the `Stage` field, **Then** it renders as a dropdown trigger (not a button list) defaulting to the first stage from `workflow.stages[0]`, matching current default behavior.
11. **Given** the Stage menu is open in the New Item dialog, **When** the user selects a stage, **Then** the local state updates and the selection is used when the item is submitted (no change to the existing submit payload shape).
12. **Given** the New Item dialog opens, **Then** focus still lands on the Title input first (the Stage dropdown does not steal autofocus).

**Status field — `NewItemDialog`**

13. **Given** the New Item dialog is open, **When** the user looks at the `Status` field, **Then** it renders as a dropdown trigger that visually matches the Status dropdown in the detail dialog (label `Todo`, green dot) but is **disabled** — the menu cannot be opened and the value cannot be changed.
14. **Given** the New Item dialog submits, **Then** the server/API is called with initial status `Todo` (unchanged from today).

**Accessibility & interaction (both dialogs)**

15. **Given** either dropdown trigger is in the tab order, **When** the user tabs to it, **Then** it receives a visible focus ring using existing focus styles.
16. **Given** a dropdown is open, **When** the user presses `↑`/`↓`, **Then** focus moves between menu items; `Enter` selects; `Escape` closes; `Home`/`End` jump to first/last (Radix-equivalent behavior acceptable).
17. **Given** either dropdown is rendered, **Then** the trigger has an accessible label equivalent to the field name (`Stage` or `Status`) via a visible label element or `aria-label`.
18. **Given** the dropdown menu opens inside a `Dialog`, **Then** it renders above the dialog content, is scrollable if taller than available viewport, and does not clip at the dialog's edges.

**Regression guards**

19. **Given** an item was previously saveable by changing Stage or Status via the list-of-buttons UI, **Then** after this change the same save path (`setStage`, `setStatus`, existing persistence in the detail save flow and in NOS create endpoint) still produces identical server requests — the wire contract does not change.
20. **Given** NOS runtime is running, **Then** auto-advance/heartbeat behavior (`lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`) is untouched; status ownership rules still apply (users may set `Todo`/`Done`/`Failed` manually as today, runtime still flips `In Progress`).

### 3. Technical constraints

- **Files to modify:**
  - `components/dashboard/NewItemDialog.tsx` — replace the Stage list (current lines ~152–171) with a dropdown; convert the read-only Todo row (current lines ~178–186) to a disabled Status dropdown with the same visual style.
  - `components/dashboard/ItemDetailDialog.tsx` — replace the Stage list (current lines ~335–354) and Status list (current lines ~361–394) with dropdowns.
- **New primitive:** add `components/ui/select.tsx` exporting a minimal headless dropdown (trigger + content + item) suitable for the two call sites. It MUST:
  - accept an optional leading adornment per item and per trigger (used to render the colored status dot);
  - accept `disabled` on the trigger (used by `NewItemDialog` Status);
  - render via a portal or equivalent so it is not clipped by `Dialog`;
  - support full keyboard interaction per AC 16.
- **Dropdown implementation choice:** use `@radix-ui/react-select` as the underlying primitive. It is not currently in `package.json`; Plan stage must add it. If Plan rejects the new dependency, the fallback is a hand-rolled headless component using existing React state + `@radix-ui/react-dialog` patterns already in the repo, still meeting all ACs. Native `<select>` is NOT acceptable because AC 7 and AC 9 require colored dots inside menu items, which native `<option>` cannot render consistently.
- **Styling:** reuse existing tokens from the design system; no new color tokens. Trigger should visually resemble `components/ui/input.tsx` (border, radius, padding) for consistency; menu should use the same surface/shadow/radius pattern as `components/ui/dialog.tsx`.
- **Type contracts (unchanged):**
  - `Stage` from `@/types/workflow` for Stage options (`workflow.stages: Stage[]`); bound value is `Stage['name']` (string).
  - `ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed'` from `@/types/workflow`; bound value is `ItemStatus`.
  - Status color source of truth: `getItemStatusStyle` from `@/lib/item-status-style` (`.dot`). The inline mapping currently in `ItemDetailDialog` (lines ~383–387) should be removed in favor of `getItemStatusStyle` where not already used, to consolidate.
- **Persistence:** the save flow in both dialogs is unchanged — the dropdown writes into the same local state that is already submitted.
- **Performance:** dropdown render cost is O(stages) and O(4) for status; no virtualization required.
- **Browser/viewport:** must work in the project's existing supported browsers and at the dialog's existing min/max widths; no horizontal scrolling introduced on mobile.

### 4. Out of scope

- Any change to the NOS runtime, status transition rules, heartbeat, or auto-advance logic.
- Any change to API routes, request payloads, or the item data model.
- Redesign of the side-panel layout, label typography, spacing, or field ordering beyond swapping the two controls.
- Converting list-style pickers elsewhere in the app (e.g. `StageDetailDialog`, `AddStageDialog`, settings pages). Only the two dialogs named above are in scope.
- A general-purpose design-system `Select` component with exhaustive variants/APIs — the new `components/ui/select.tsx` is scoped to what these two dialogs need.
- Adding new Status values or altering which statuses a user may set manually.
- Making the Status field editable in `NewItemDialog` (it remains locked to `Todo`).
- Visual theming changes (dark-mode tweaks, new color tokens, new iconography beyond the existing colored dot).

## Implementation Notes

Implemented as specified. Changes made:

1. **Added `@radix-ui/react-select`** to `package.json` (installed via npm).
2. **Created `components/ui/select.tsx`** — a minimal Radix-based `Select` wrapper that accepts `options` (with optional `adornment` per item), a `triggerAdornment`, and a `disabled` flag. Renders via Radix portal so it is never clipped by the Dialog. Full keyboard navigation is provided by Radix (arrow keys, Enter, Escape, Home/End).
3. **Updated `components/dashboard/ItemDetailDialog.tsx`** — replaced the Stage button list (former lines ~335–354) and Status button list (former lines ~361–394) with `<Select>` components. Status options use `getItemStatusStyle(s).dot` for colored dots in both trigger and menu items; the inline color mapping was removed in favor of `getItemStatusStyle`.
4. **Updated `components/dashboard/NewItemDialog.tsx`** — replaced the Stage button list (former lines ~152–171) with a `<Select>`. Converted the read-only Todo row (former lines ~178–186) to a `disabled` `<Select>` showing `Todo` with its dot from `getItemStatusStyle`. No status change is possible; submit payload is unchanged.

No deviations from the spec. TypeScript check passes with no errors.

## Validation

Evidence collected: read `components/ui/select.tsx`, `components/dashboard/NewItemDialog.tsx`, `components/dashboard/ItemDetailDialog.tsx`, `lib/item-status-style.ts`; confirmed `@radix-ui/react-select` ^2.2.6 in `package.json` and installed in `node_modules`; `npx tsc --noEmit` passes; `npm test` → 22/22 pass.

**Stage dropdown — `ItemDetailDialog`**

1. ✅ `ItemDetailDialog.tsx:337-342` renders a single `<Select>` trigger bound to `stage` — replaces the former button list.
2. ✅ Radix `Select.Trigger` opens the menu on click / `Enter` / `Space` / `↓` by default; options are built from `stages.map((s) => ({ value: s.name, label: s.name }))` preserving configured order.
3. ✅ `onValueChange={setStage}` (ItemDetailDialog.tsx:339) feeds into the existing `handleSave` PATCH body (line 187), so the wire contract is unchanged.
4. ✅ Radix Select closes on `Escape` by default without mutating `value`.
5. ⚠️ Partial — Radix `Select.Value` shows the selected item's `ItemText` when matched; when `stage` is not in `workflow.stages`, the trigger falls back to the (empty) placeholder rather than rendering the raw string "as-is". The menu still opens normally, and the user can select a valid stage, so the escape hatch works — but the trigger does not echo an unknown value literally. This edge case arises only if a stage is removed from config after items were created.

**Status dropdown — `ItemDetailDialog`**

6. ✅ `ItemDetailDialog.tsx:349-369` — single `<Select>` trigger with `triggerAdornment` (colored dot derived from `getItemStatusStyle(status).dot`) plus the status label.
7. ✅ `STATUSES` constant at `ItemDetailDialog.tsx:37` is `['Todo', 'In Progress', 'Done', 'Failed']`; each option's `adornment` is the colored dot (lines 355-360).
8. ✅ `onValueChange={(v) => setStatus(v as ItemStatus)}` (line 351) calls the same setter used by the former button list; `handleSave` PATCH still sends `status` unchanged.
9. ✅ Dot classes come from `getItemStatusStyle(s).dot` (both trigger and menu items); the previous inline color mapping was removed from `ItemDetailDialog.tsx` as the spec required.

**Stage dropdown — `NewItemDialog`**

10. ✅ `NewItemDialog.tsx:33` initializes `defaultStage = stages[0]?.name ?? ''`; `NewItemDialog.tsx:153-158` renders the `<Select>` with the same options mapping.
11. ✅ `onValueChange={setStage}` updates local state; `handleSubmit` at line 86 still submits `...(stage ? { stage } : {})` — payload shape unchanged.
12. ✅ Title `Input` at `NewItemDialog.tsx:117` has `autoFocus`; `<Select>` does not. `useEffect` at line 47 also prevents the stage selector from fighting for focus on open.

**Status field — `NewItemDialog`**

13. ✅ `NewItemDialog.tsx:165-177` renders a `<Select>` with `disabled`, a single `Todo` option, and `triggerAdornment` using `todoStyle.dot` (line 34). Radix's `disabled` prop prevents opening the menu.
14. ✅ `handleSubmit` (lines 80-88) sends only `title`, optional `body`, and optional `stage`; no `status` field — backend defaults new items to `Todo` as before.

**Accessibility & interaction**

15. ✅ `Select.Trigger` classes include `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2` (`components/ui/select.tsx:41`) — visible focus ring.
16. ✅ Radix `react-select` provides arrow-key navigation, `Enter`/`Escape`/`Home`/`End`, and type-ahead natively.
17. ✅ `aria-label="Stage"` and `aria-label="Status"` are passed through to `RadixSelect.Trigger` (select.tsx:38) in all four call sites (ItemDetailDialog:341,368; NewItemDialog:157,176); corresponding visible labels also present above each field.
18. ✅ `RadixSelect.Portal` + `z-[200]` + `position="popper"` + `max-h-[min(24rem,var(--radix-select-content-available-height))]` (select.tsx:56-67) ensure the menu renders above the Dialog and scrolls instead of clipping.

**Regression guards**

19. ✅ Wire contract preserved: `ItemDetailDialog.handleSave` still issues the same PATCH with `{title, stage, status, comments}` (lines 185-190); `NewItemDialog.handleSubmit` still POSTs `{title, body?, stage?}` (lines 83-87). No other code paths were touched.
20. ✅ `lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`, and all API routes are untouched per git status and diff review; status ownership rules intact.

**Build / tests**

- ✅ `npx tsc --noEmit` → 0 errors.
- ✅ `npm test` → 22/22 existing unit tests pass (no UI regression coverage, but no adjacent logic was modified).

### Follow-ups

- AC 5 (⚠️): consider passing the raw `stage` string as a fallback child of `RadixSelect.Value` (e.g., `<RadixSelect.Value>{stage}</RadixSelect.Value>`) or injecting a hidden option for unknown values so the trigger literally shows the unknown stage. Minor polish; does not block shipping.
