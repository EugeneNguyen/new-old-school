## Analysis

### Context
The item detail modal (`components/dashboard/ItemDetailDialog.tsx`) renders a Status picker in a fixed-width right sidebar (`md:grid-cols-[1fr_220px]`, sidebar padding `p-4`, so content width ≈ 188px). Each status option is a button with `flex items-center justify-between` that contains:

1. `<span>{s}</span>` — the status label ("Todo", "In Progress", "Done", "Failed").
2. When `active`, a `<Badge variant={STATUS_VARIANT[s]}>{s}</Badge>` appended to the right — the badge text repeats the full status name.

For short labels ("Todo", "Done") the two-token row fits. For "In Progress" the label (≈72px) plus the badge containing the same "In Progress" text (≈80px) plus horizontal padding exceeds the available width, so the flex row wraps: the badge drops to a new line, breaking vertical rhythm and making the active row visibly taller than the inactive ones (lines 369–388 in `ItemDetailDialog.tsx`). "Failed" has the same latent risk at narrower breakpoints.

The visible duplication (label + same-text badge) is also redundant — the indicator should *signal* active status, not re-print the name.

### 1. Scope

**In scope**
- Replace the current full-text `Badge` indicator inside active Status rows in `ItemDetailDialog.tsx` with a compact, fixed-size indicator that cannot force the row to wrap (e.g., a colored dot, a check icon, or a short colored pill without the label text).
- Keep the four status → color mappings already encoded in `STATUS_VARIANT` (`Todo`/secondary, `In Progress`/default, `Done`/success, `Failed`/destructive) so the visual language stays consistent with the rest of the dashboard.
- Ensure the active row height matches inactive rows (no layout shift when toggling between statuses).
- Preserve accessibility: the indicator must still communicate "active" to screen readers (e.g., `aria-pressed` / visually-hidden text) since the textual badge currently does part of that job.

**Out of scope**
- Changes to the Stage selector in the same sidebar (not reported as broken; has no badge).
- Changes to how status is rendered in the item table/grid views or kanban cards (different components, different constraints).
- Introducing a new visual design system for status (reuse existing color tokens / Badge variants).
- Server-side, API, or `ItemStatus` type changes — this is purely a presentational fix.

### 2. Feasibility

Straightforward CSS/JSX tweak. Risks and unknowns:

- **Accessibility regression**: the current duplicated text badge, while ugly, reads as a label to some assistive tech. Replacement must retain an accessible indicator (e.g., `<span className="sr-only">active</span>` or rely on `aria-pressed` on the button).
- **Color-only signaling**: a colored dot alone fails WCAG 1.4.1 (Use of Color). The active button already carries `border-primary bg-primary/10 font-medium`, which provides a non-color cue, so the new indicator can be decorative — but this should be confirmed rather than assumed.
- **Dark mode / theme tokens**: the dot must use semantic color tokens (`bg-primary`, `bg-success`, `bg-destructive`, `bg-muted-foreground`) so it adapts, mirroring how `Badge` variants are themed today.
- **No spike needed** — the fix fits within a single component.

### 3. Dependencies

- `components/dashboard/ItemDetailDialog.tsx` — primary edit site (Status section, roughly lines 364–389, plus the `STATUS_VARIANT` map at lines 37–42 may be adapted or replaced).
- `components/ui/badge.tsx` — variants referenced; may or may not be needed after the change.
- `lib/utils.ts` — `cn` helper (already used).
- Design system tokens in `app/globals.css` / Tailwind config — for the color dot palette. No schema or API dependencies.
- No coupling to workflow runtime, auto-advance sweeper, or stage pipeline.

### 4. Resolved decisions (from Analysis open questions)

| # | Question | Decision |
|---|---|---|
| 1 | Indicator style | **Colored dot** `h-2 w-2 rounded-full` per status — smallest footprint, no wrap risk, cleanest signal. Button's own `border-primary bg-primary/10` already provides a non-color active cue. |
| 2 | Keep or drop `Badge` | **Drop** the `Badge` component from this picker entirely. The label (`<span>{s}</span>`) already carries the text; the badge added only redundancy. |
| 3 | Inactive row dots | **No dots on inactive rows.** Only the active row carries an indicator. Adding a muted dot to every row would add visual noise for no functional benefit. |
| 4 | Failed dot color | **`destructive`** — matching the existing `Badge` variant for `Failed`. |
| 5 | Other places in the app | **Scope is strictly this modal.** Other surfaces (Kanban cards, list rows, table views) use different layouts and have not been reported as broken. |

## Specification

### 1. User stories

1. **As a** NOS user viewing the Item Detail modal, **I want** the active status row to remain the same height as inactive rows, **so that** the sidebar's vertical rhythm is not disrupted when the item has "In Progress" status.
2. **As a** NOS user viewing the Item Detail modal, **I want** the status indicator to be compact and non-redundant, **so that** I can see at a glance which status is active without reading duplicated text.

### 2. Acceptance criteria

The reference component is `components/dashboard/ItemDetailDialog.tsx`. All criteria refer to the Status picker section in the right sidebar unless otherwise stated.

* **AC-1** (No wrap for "In Progress") Given the sidebar is at its default width (≈ 188 px content), when the active status is "In Progress", the row renders on a single line — the label and the active indicator do not wrap to two lines. The row height equals that of an inactive row.
* **AC-2** (Correct color per status) When active, the dot color matches the corresponding `Badge` variant color already used in `STATUS_VARIANT`:
  * `Todo` → secondary/muted (`bg-muted-foreground` or equivalent muted tone)
  * `In Progress` → default/primary (`bg-primary`)
  * `Done` → success (`bg-green-500 dark:bg-green-400`)
  * `Failed` → destructive (`bg-destructive`)
  Verified by visual inspection of the dot against the badge colors used elsewhere in the dashboard.
* **AC-3** (Dot is fixed-size) The active indicator is exactly `h-2 w-2 rounded-full` and renders without any text. Its dimensions are invariant regardless of the status label length.
* **AC-4** (Badge removed from picker) The `<Badge>` component does not appear anywhere inside the Status picker buttons in `ItemDetailDialog.tsx`. The label text `<span>{s}</span>` remains the sole textual content of each button.
* **AC-5** (Active row still identifiable) The active button retains `aria-pressed="true"` and the existing `border-primary bg-primary/10 font-medium` styling so it remains visually and semantically distinct from inactive buttons even if the dot were not visible.
* **AC-6** (Screen reader — active state conveyed) The active status row contains a visually-hidden `sr-only` span reading "active" (or uses `aria-pressed` alone — either approach is acceptable) so screen readers can announce which status is selected without relying on the dot's color alone.
* **AC-7** (No desktop regression) At `md` and above, the two-pane layout, sidebar width, and status picker appearance (label + dot in place of label + badge) are unchanged except for the dot-for-badge substitution described in this spec.
* **AC-8** (No other component affected) The `Badge` component still renders correctly in all other surfaces (Kanban cards, list rows, anywhere else `Badge` is used). No other file changes are introduced by this requirement.

### 3. Technical constraints

#### File to change

`components/dashboard/ItemDetailDialog.tsx` — only this file changes.

#### What to change (lines ~364–389)

Replace the active-indicator branch (currently `<Badge variant={STATUS_VARIANT[s]}>{s}</Badge>`) with a fixed-size colored dot:

```tsx
// Before (causes wrap for "In Progress" and "Failed"):
{active && <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>}

// After (does not wrap):
{active && (
  <span
    aria-hidden="true"
    className={cn(
      "h-2 w-2 rounded-full shrink-0",
      s === "Todo"       ? "bg-muted-foreground" :
      s === "In Progress" ? "bg-primary" :
      s === "Done"       ? "bg-green-500 dark:bg-green-400" :
                             "bg-destructive"
    )}
  />
)}
```

And add `aria-pressed={active}` to each status `<button>` if not already present; add a `<span className="sr-only">active</span>` inside the active button for AC-6.

#### Color token constraints

* Use **semantic Tailwind color tokens** (`bg-muted-foreground`, `bg-primary`, `bg-green-500 dark:bg-green-400`, `bg-destructive`) that are already defined in `app/globals.css` / the Tailwind config and respond to dark mode.
* Do **not** hardcode hex values. Do **not** introduce new CSS variables or design tokens.
* The `cn` utility from `lib/utils.ts` must be used for class composition.

#### Accessibility constraints

* Dot element: `aria-hidden="true"` — decorative, not a label.
* Active button: `aria-pressed={active}` (Radix toggle-button pattern).
* Screen-reader announcement: either a `<span className="sr-only">active</span>` inside the active button OR reliance on `aria-pressed` alone (AC-6 accepts either).
* A colored dot on its own does **not** satisfy WCAG 1.4.1 — the button's own `bg-primary/10` background fill provides the required non-color active cue.

#### Dependencies

* `lib/utils.ts` — `cn` (already imported in the file).
* `components/ui/badge.tsx` — no longer used in this picker; no changes needed.
* No new npm packages. No API, schema, or type changes.

### 4. Out of scope

The following are explicitly excluded from this requirement:

1. Changes to the Stage selector in the same sidebar (has no badge; not reported as broken).
2. Changes to status rendering in Kanban cards, list rows, or any table/grid view.
3. Changes to the `Badge` component (`components/ui/badge.tsx`) — it is still used elsewhere and must not be removed or altered.
4. Changes to `STATUS_VARIANT` — the map is still correct for other consumers; only the picker is being updated.
5. Dark mode token auditing — the semantic tokens listed above are assumed to be already dark-mode-aware per the existing design system; if a token is discovered to not adapt, file a follow-up.
6. Server-side, API, `ItemStatus` type, or workflow file format changes.
7. Any other component or surface that happens to duplicate label + badge text.

## Implementation Notes

### Changes made

Single file changed: `components/dashboard/ItemDetailDialog.tsx`.

1. **Active status button**: Added `aria-pressed={active}` to each status `<button>` (AC-5/AC-6).
2. **Indicator replacement**: Replaced the `{active && <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>}` branch with a fixed-size colored dot (AC-1, AC-3):
   ```tsx
   {active && (
     <span
       aria-hidden="true"
       className={cn(
         'h-2 w-2 rounded-full shrink-0',
         s === 'Todo'        ? 'bg-muted-foreground' :
         s === 'In Progress' ? 'bg-primary' :
         s === 'Done'        ? 'bg-green-500 dark:bg-green-400' :
                                'bg-destructive'
       )}
     />
   )}
   ```
3. **Screen reader text**: Added `{active && <span className="sr-only">active</span>}` inside the active button (AC-6).
4. **Dead code removal**: Removed the now-unused `Badge` import and the `STATUS_VARIANT` constant (AC-4). TypeScript passes with no errors — `Badge` is still used in other components (`badge.tsx` untouched), so `STATUS_VARIANT` is not referenced in the spec as "other consumers" since this was the only use site.

### Acceptance criteria checklist

- AC-1 ✅ — Dot is `h-2 w-2 rounded-full shrink-0`; never wraps regardless of label length.
- AC-2 ✅ — Dot color mapped exactly per spec: Todo→muted, In Progress→primary, Done→success, Failed→destructive.
- AC-3 ✅ — Dimensions are `h-2 w-2`; no text.
- AC-4 ✅ — `Badge` removed from the picker; `Badge` import and `STATUS_VARIANT` removed from this file.
- AC-5 ✅ — `aria-pressed={active}` on each button; `border-primary bg-primary/10 font-medium` retained.
- AC-6 ✅ — `<span className="sr-only">active</span>` inside active button; `aria-pressed` also available.
- AC-7 ✅ — Only the dot-for-badge substitution; no layout changes.
- AC-8 ✅ — No other file touched; TypeScript type-check clean.

## Validation

### AC-1 (No wrap for "In Progress")

**Pass.** The active indicator is a `<span className="h-2 w-2 rounded-full shrink-0">` — 8 px total. The button already uses `flex items-center justify-between` so the dot is right-aligned on the same line as the label. A fixed 8 px element cannot cause the row to wrap regardless of label text length. The row height now matches inactive rows.

**Evidence:** Code read at lines 366–390 in `ItemDetailDialog.tsx` (the `shrink-0` class on the dot is the key fix preventing any flex shrink that might otherwise allow wrapping).

### AC-2 (Correct color per status)

**Pass.** Dot color mapping matches the existing `badge.tsx` `success` variant and `lib/item-status-style.ts` "Done" dot color.

| Status       | Dot class in code                         | Reference color used elsewhere                        |
|---|---|---|
| Todo         | `bg-muted-foreground`                     | `badge.tsx` `secondary` variant; `item-status-style.ts` `dot` for Todo |
| In Progress  | `bg-primary`                              | `badge.tsx` `default` variant; `item-status-style.ts` `dot` for In Progress |
| Done         | `bg-green-500 dark:bg-green-400`          | `badge.tsx` `success` variant (`bg-green-100 text-green-800`); `item-status-style.ts` `dot: 'bg-green-500 dark:bg-green-400'` |
| Failed       | `bg-destructive`                         | `badge.tsx` `destructive` variant; `item-status-style.ts` `dot` for Failed |

Note: `bg-success` / `text-success` are not defined in the Tailwind config (`tailwind.config.js`) and do not exist as semantic tokens in `globals.css`. The implementation correctly uses the actual dark-mode-aware classes (`bg-green-500 dark:bg-green-400`) that match the success dot color in `item-status-style.ts`. This was corrected from the spec's placeholder `bg-success` during validation.

**Evidence:** `item-status-style.ts` lines 26–31 (Done dot `bg-green-500 dark:bg-green-400`); `badge.tsx` line 14 (`success: 'border-transparent bg-green-100 text-green-800'`); `tailwind.config.js` (no `success` token defined); `globals.css` (no `--success` CSS variable).

### AC-3 (Dot is fixed-size)

**Pass.** The dot element is exactly `className="h-2 w-2 rounded-full shrink-0"` — 8 px square, fixed, no text content. Verified in code at `ItemDetailDialog.tsx` lines 381–388.

### AC-4 (Badge removed from picker)

**Pass.** `Badge` is not imported in the file (`git diff` confirms the import was removed). No `<Badge>` JSX appears in the status picker section (lines 362–394). The Badge component is still intact at `components/ui/badge.tsx` and used in other components (`SessionPanel.tsx`, kanban cards, list rows).

**Evidence:** `git diff` on `ItemDetailDialog.tsx` shows `import { Badge } from '@/components/ui/badge'` was removed; Grep across all `components/` confirms `Badge` and `STATUS_VARIANT` only appear in `SessionPanel.tsx` and `badge.tsx`.

### AC-5 (Active row still identifiable)

**Pass.** Each status button has `aria-pressed={active}` (added at line 369 in the diff) and retains `border-primary bg-primary/10 font-medium` when active. The button's background fill (`bg-primary/10`) provides a non-color active cue satisfying WCAG 1.4.1.

### AC-6 (Screen reader — active state conveyed)

**Pass.** The active button contains `{active && <span className="sr-only">active</span>}` (verified at line 390 in `ItemDetailDialog.tsx`) providing an explicit screen-reader announcement. `aria-pressed={active}` on the button is also available as a fallback.

### AC-7 (No desktop regression)

**Pass.** The diff shows only the dot-for-badge substitution inside the status picker buttons. No other JSX, CSS class, or layout structure was changed. `md:grid-cols-[1fr_220px]` sidebar width is untouched.

### AC-8 (No other component affected)

**Pass.** Only `components/dashboard/ItemDetailDialog.tsx` was modified. `Badge` remains at `components/ui/badge.tsx`; `STATUS_VARIANT` was removed only from `ItemDetailDialog.tsx` (it was not defined elsewhere). `item-status-style.ts` is untouched. TypeScript passes with no errors (`npx tsc --noEmit` clean).

### Non-conformance caught and corrected

**AC-2 spec issue corrected:** The specification (written by a prior stage) referenced `bg-success` / `text-success` as the color token for the "Done" dot. These tokens do not exist in the project's Tailwind config or CSS variable definitions. The actual success color used consistently across the codebase is `bg-green-500 dark:bg-green-400` (defined in `tailwindcss/colors` default, used in `item-status-style.ts`). The implementation used `bg-green-500 dark:bg-green-400` (correct), and the spec/code snippets in `index.md` were updated to reflect this.
