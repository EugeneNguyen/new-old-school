maybe background color or border color

## Analysis

### Scope
**In scope**
- Replace (or augment) the current text `Badge` that shows `Todo` / `In Progress` / `Done` / `Failed` on each item card with a subtler visual indicator — e.g. card background tint, left border accent stripe, or ring color — while preserving accessibility (non-color cue and/or tooltip).
- Apply the new indicator consistently in the three places that render item status today:
  - `components/dashboard/KanbanBoard.tsx` (card in column)
  - `components/dashboard/ListView.tsx` (row badge)
  - `components/dashboard/ItemDetailDialog.tsx` (status pill in the stage timeline)
- Keep the four existing statuses (`Todo`, `In Progress`, `Done`, `Failed`) and their semantic color mapping already encoded in the shared `STATUS_VARIANT` maps.

**Out of scope**
- Adding new statuses or changing the state machine owned by the auto-advance sweeper.
- Redesigning the Kanban/List layouts beyond the status indicator itself.
- Showing per-stage agent activity indicators (already handled by the sparkle/user pill work).

### Feasibility
- Straightforward Tailwind/`cn` change; all three call sites already import `ItemStatus` and a local `STATUS_VARIANT` map, so a single shared helper (e.g. `lib/item-status-style.ts`) returning `{ border, bg, ring }` classes keeps the change small.
- Risk: color-only indicators fail accessibility for color-blind users. Mitigation: keep the status text accessible (tooltip, `aria-label`, or a small dot+label) and pick tokens from the existing Tailwind palette used by `Badge` variants so dark mode keeps working.
- Risk: three duplicated `STATUS_VARIANT` constants already drift slightly; consolidating them is low-effort but touches multiple files — acceptable.
- Unknown to spike: whether the user prefers (a) background tint of the whole card, (b) a 2–3px left accent border, or (c) a subtle ring/outline. A quick Stitch or in-app mockup pass would settle this before implementation.

### Dependencies
- Shared type: `ItemStatus` in `types/workflow.ts`.
- UI primitives: `components/ui/badge.tsx` variants (`secondary`, `default`, `success`, `destructive`) — new styling should reuse the same semantic colors so themes stay consistent.
- Consumers: `KanbanBoard.tsx`, `ListView.tsx`, `ItemDetailDialog.tsx`, and `NewItemDialog.tsx` (uses the same map for the default status preview).
- No backend/API changes; status values and transitions (`lib/auto-advance*.ts`) are unaffected.

### Open questions
1. Which visual treatment does the user want — background tint, left border stripe, outer ring, or a combination? (Recommend left border stripe + muted background tint; smallest visual cost, most scannable.)
2. Should the text `Badge` be removed entirely, kept as a tooltip, or downgraded to a small colored dot + status label?
3. Should `In Progress` get an additional animated cue (pulse) to distinguish it from `Todo`/`Done` at a glance, or is color alone enough?
4. Does the new indicator need to also apply to the stage-header "pending/in-progress/done" counts, or is it item-card-only?

## Specification

### User stories
1. As a user scanning the Kanban board, I want each item card's status to be conveyed by a subtle background tint and a colored left-border accent, so that I can read the board at a glance without the visual noise of a prominent text badge.
2. As a user on the List view, I want the same subtle status indicator applied to each row, so that status recognition is consistent across views.
3. As a user opening an item's detail dialog, I want each stage-timeline entry to use the same indicator treatment, so that the item-level and stage-level statuses look visually unified.
4. As a color-blind user, I want a non-color cue (status text label or tooltip) to remain, so that I can still identify an item's status when color alone is insufficient.
5. As a developer editing status styling later, I want a single shared helper that maps `ItemStatus` → style classes, so that the four render sites cannot drift out of sync.

### Acceptance criteria

**AC1 — Shared style helper**
1. A new module `lib/item-status-style.ts` exports a function `getItemStatusStyle(status: ItemStatus)` returning an object with at least `{ border: string; bg: string; ring: string; dot: string; label: string }` whose string fields are Tailwind class names (or `cn`-ready strings).
2. The helper covers all four values of `ItemStatus`: `Todo`, `In Progress`, `Done`, `Failed`.
3. The helper is the single source of truth; the local `STATUS_VARIANT` constants in `KanbanBoard.tsx`, `ListView.tsx`, `ItemDetailDialog.tsx`, and `NewItemDialog.tsx` are either removed or re-exported from the helper.
4. Color tokens used by the helper map 1:1 to the existing `Badge` variant semantics:
   - `Todo` → `secondary` (muted/neutral)
   - `In Progress` → `default` (primary/accent)
   - `Done` → `success`
   - `Failed` → `destructive`
5. The helper works correctly in both light and dark mode (classes include dark-mode variants where the existing `Badge` variants do).

**AC2 — Visual treatment on item cards (Kanban)**
6. Given a card in `components/dashboard/KanbanBoard.tsx`, when it renders, then the card has a **left-border accent stripe** (≥ 2px, ≤ 4px) whose color reflects the item's status via the shared helper.
7. Given the same card, when it renders, then the card background has a **muted tint** of the status color (low-opacity, ≤ ~10% equivalent) that remains readable against the column background in both light and dark mode.
8. The prominent text `Badge` currently rendered on the card is **removed** from the default card layout. A small textual status indicator (e.g. a colored dot + short label, or a `title`/tooltip on the card) MUST remain so the status is discoverable without relying on color alone.
9. The card retains an accessible name for the status: either an `aria-label` on the card root, a `title` attribute, or a visible short label (e.g. `Todo`, `In Progress`, `Done`, `Failed`).
10. Given status `In Progress`, when the card renders, then the accent stripe (or an adjacent small dot) displays a subtle pulse/animation cue (e.g. Tailwind `animate-pulse` on the dot) to distinguish active work from `Todo`/`Done` at a glance.

**AC3 — Visual treatment on List view**
11. In `components/dashboard/ListView.tsx`, each row uses the same shared helper to apply a left-border accent stripe of matching color and width.
12. The existing row-level text `Badge` is either removed or replaced with the small colored-dot + label treatment used on the Kanban card, consistent with AC2.8.
13. Row hover/selected states continue to work and do not obscure the status indicator.

**AC4 — Visual treatment in Item Detail Dialog**
14. In `components/dashboard/ItemDetailDialog.tsx`, the item's status pill in the header/stage timeline is restyled to use the shared helper: colored-dot + label, with the same color mapping as AC1.4.
15. Per-stage status pills in the stage timeline (if they render `ItemStatus`) use the same restyled treatment.

**AC5 — NewItemDialog preview**
16. In `components/dashboard/NewItemDialog.tsx`, the default-status preview reflects the new shared helper's styling, so the preview matches how the card will actually look after creation.

**AC6 — Accessibility**
17. Given any consumer (Kanban, List, Detail, NewItemDialog), when rendered, then status is conveyed by **at least two cues**: color AND one of {short text label, colored-dot shape, `aria-label`/`title`}.
18. Color contrast for the border stripe and for the dot-plus-label against the card background meets WCAG AA (≥ 3:1 for UI components) in both light and dark mode.

**AC7 — No behavioral regressions**
19. Drag-and-drop between Kanban columns still works; status is still read from the `WorkflowItem.status` field.
20. Status transitions driven by the runtime (`lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`) continue to flip the indicator live when the item's status changes in state, without a page reload.
21. The stage-header "pending/in-progress/done" counts are **unchanged** in this requirement (explicitly out of scope — see Out of scope).

### Technical constraints
- **Files to create**: `lib/item-status-style.ts` — single exported helper + shared type for the returned class bundle.
- **Files to edit**: `components/dashboard/KanbanBoard.tsx`, `components/dashboard/ListView.tsx`, `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/NewItemDialog.tsx`.
- **Shared type**: `ItemStatus` stays defined in `types/workflow.ts`; do not change its union.
- **Color tokens**: reuse the Tailwind classes backing the existing `Badge` variants in `components/ui/badge.tsx` (`secondary`, `default`, `success`, `destructive`) so theming stays consistent. Do not introduce new palette tokens.
- **Border stripe**: implement via Tailwind `border-l-2` / `border-l-[3px]` and a semantic color class. Do not use inline `style` hex values.
- **Background tint**: use a low-opacity variant (e.g. `bg-<token>/10`) so the card stays readable on the column background. Dark-mode variant required where the color changes.
- **Animation**: `In Progress` pulse uses Tailwind `animate-pulse` on the dot only; do not animate the whole card or stripe (would be distracting and bad for accessibility `prefers-reduced-motion`).
- **Class composition**: use the existing `cn` utility from `@/lib/utils` — no new dependency.
- **No API/backend changes**: `app/api/**`, `lib/auto-advance*.ts`, `lib/stage-pipeline.ts`, `.nos/**`, and the `ItemStatus` type are untouched.
- **Performance**: the helper must be a pure function returning static string constants per status; no runtime allocation inside render hot paths.

### Out of scope
- Adding, renaming, or removing any `ItemStatus` value.
- Changing the auto-advance state machine (`lib/auto-advance*.ts`) or when a status flips.
- Restyling the stage-header "pending/in-progress/done" aggregate counts.
- Per-stage agent activity indicators (sparkle/user pill) — already handled elsewhere.
- Redesigning Kanban column headers, List view columns, or the Item Detail dialog beyond the status indicator treatment.
- Introducing new global design tokens, a theming system, or CSS variables beyond the existing Tailwind palette.
- Mobile-specific layout changes.

## Implementation Notes

No implementation was performed for this requirement. The Analysis and Specification sections are complete, but no code changes were made to introduce the shared `lib/item-status-style.ts` helper or to restyle the Kanban, List, Detail, or NewItemDialog call sites. The previous run's final comment ("Now I have a clear picture. Let me implement all the changes.") announced implementation but the session log stalled before any edits were applied.

## Validation

Validation performed by reading the repository for the expected new module and grepping each consumer file for the local `STATUS_VARIANT` maps that the spec said must be removed or re-exported.

Evidence:
- `lib/item-status-style.ts` does not exist (`ls lib/item-status-style.ts` → `No such file or directory`).
- `components/dashboard/KanbanBoard.tsx:17` still defines a local `STATUS_VARIANT` and `KanbanBoard.tsx:204` still renders `<Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">`.
- `components/dashboard/ListView.tsx:9` / `:62` unchanged — local map + `<Badge>` row label intact.
- `components/dashboard/ItemDetailDialog.tsx:36` / `:274` unchanged — local map + `<Badge>` pill intact.
- `components/dashboard/NewItemDialog.tsx:25` / `:167` unchanged — local map + `<Badge variant={STATUS_VARIANT.Todo}>` preview intact.
- No `getItemStatusStyle`, `item-status-style`, `border-l-2`, `border-l-[3px]`, `animate-pulse`, or dot-indicator reference appears in any of the four target files.

Because the helper module is absent and none of the four consumer files were edited, every functional criterion fails. AC21 (regression guard: stage-header counts unchanged) nominally holds since nothing was touched at all, but cannot earn a pass in the absence of the implementation it protects — marking it ⚠️ partial / N/A for transparency.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1.1 `getItemStatusStyle` exported from `lib/item-status-style.ts` | ❌ fail | File does not exist. |
| AC1.2 Helper covers all 4 `ItemStatus` values | ❌ fail | Helper missing. |
| AC1.3 Helper is single source of truth; local `STATUS_VARIANT` removed/re-exported | ❌ fail | All four files still define their own `STATUS_VARIANT` constant. |
| AC1.4 Color tokens map to `Badge` variants | ❌ fail | Helper missing. |
| AC1.5 Light + dark mode classes | ❌ fail | Helper missing. |
| AC2.6 Kanban card left-border accent stripe | ❌ fail | `KanbanBoard.tsx` unchanged; no `border-l-*` status class. |
| AC2.7 Kanban card muted status-color background tint | ❌ fail | No `bg-<token>/10` applied to card. |
| AC2.8 Prominent `Badge` removed from Kanban card, replaced with dot+label | ❌ fail | `KanbanBoard.tsx:204` still renders `<Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">`. |
| AC2.9 Accessible status name on card | ❌ fail | Only the removed-in-spec `Badge` provides the label today; no `aria-label`/`title` added. |
| AC2.10 `In Progress` dot/stripe pulse cue | ❌ fail | No `animate-pulse` added anywhere. |
| AC3.11 List row left-border accent stripe | ❌ fail | `ListView.tsx` row has no status border. |
| AC3.12 List row `Badge` removed or replaced with dot+label | ❌ fail | `ListView.tsx:62` still renders `<Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>`. |
| AC3.13 Hover/selected states preserved | ⚠️ partial | States preserved only because nothing changed; indicator doesn't exist to interact with. |
| AC4.14 ItemDetailDialog status pill restyled with shared helper | ❌ fail | `ItemDetailDialog.tsx:274` still uses local `STATUS_VARIANT` + `Badge`. |
| AC4.15 Per-stage pills use same restyled treatment | ❌ fail | Same location unchanged. |
| AC5.16 NewItemDialog preview uses shared helper | ❌ fail | `NewItemDialog.tsx:167` still renders `<Badge variant={STATUS_VARIANT.Todo}>Todo</Badge>`. |
| AC6.17 Two cues (color + text/shape/aria) on every consumer | ❌ fail | New cue system not introduced; existing `Badge` text alone is a single composite cue and is the thing the spec asked to replace. |
| AC6.18 WCAG AA contrast for stripe + dot/label | ❌ fail | Nothing new to measure. |
| AC7.19 Drag-and-drop still works | ✅ pass | No changes to DnD wiring. |
| AC7.20 Runtime status flips propagate to indicator | ⚠️ partial | Existing `Badge` still updates live; the new indicator the spec mandates does not exist, so this AC cannot be proved against the intended implementation. |
| AC7.21 Stage-header counts unchanged | ⚠️ partial | Counts untouched, but this is a regression guard for an absent implementation. |

Result: **0 / 21 functional ACs pass.** AC7.19 passes vacuously because nothing was changed; AC3.13, AC7.20, AC7.21 are marked partial/N/A on the same basis.

### Follow-ups

The item must be re-run through the implementation stage before it can reach Done. Required work:

1. Create `lib/item-status-style.ts` exporting `getItemStatusStyle(status: ItemStatus)` returning `{ border, bg, ring, dot, label }` Tailwind class bundles derived from the existing `Badge` variant tokens (`secondary`, `default`, `success`, `destructive`) with dark-mode variants.
2. Remove the four duplicate `STATUS_VARIANT` constants in `KanbanBoard.tsx`, `ListView.tsx`, `ItemDetailDialog.tsx`, `NewItemDialog.tsx` and consume the helper instead.
3. On the Kanban card, drop the prominent `<Badge>`, add a `border-l-[3px]` status-colored stripe, a low-opacity status tint (`bg-<token>/10`), and a colored dot + short label (with `animate-pulse` on the dot when status is `In Progress`). Add an `aria-label`/`title` on the card root carrying the status text.
4. Mirror the stripe + dot-plus-label treatment on `ListView.tsx` rows, preserving hover/selected states.
5. Replace the header/timeline status `Badge` in `ItemDetailDialog.tsx` with the dot-plus-label treatment, including per-stage pills.
6. Update the `NewItemDialog.tsx` default-status preview to use the same helper so it matches the real card render.
7. Verify AA contrast for stripe and dot+label in both light and dark themes; confirm the auto-advance sweeper still flips the indicator live without reload.

