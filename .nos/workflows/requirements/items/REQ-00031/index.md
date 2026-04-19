Show some icon to indicate that that stage is Auto-advance items to the next stage when this one completes

## Analysis

### Scope
**In scope**
- Surface a visual indicator on each Kanban stage column header when its `autoAdvanceOnComplete` flag is truthy, so operators can tell at a glance which stages will push items forward automatically on completion.
- Tooltip/affordance explaining the icon ("Auto-advances to the next stage when items complete").
- Consistent treatment anywhere a stage is rendered alongside the existing AI badge — primarily `components/dashboard/KanbanBoard.tsx` column header (next to the `Sparkles` / "AI" badge at lines 251–261). If the stage edit dialog (`StageDetailDialog.tsx`) already shows the flag as a toggle, no change there beyond parity.

**Out of scope**
- Changing auto-advance behavior itself (`lib/auto-advance.ts`, API wiring) — this is display-only.
- Editing auto-advance state from the column header (edit is already available via the `MoreVertical` menu).
- Styling/design-system tokens beyond reusing existing icon/badge primitives.
- Indicators on the terminal stages (`Backlog`, `Done`) where `autoAdvanceOnComplete` is `null` by config.

### Feasibility
- Data is already present: `Stage.autoAdvanceOnComplete` is typed in `types/workflow.ts:10` and flows through to the client via `KanbanBoard` props.
- UI slot is trivial — the existing header row at `KanbanBoard.tsx:251` already renders a conditional badge (`stage.prompt && <Sparkles/>`); the same pattern applies for auto-advance.
- Low risk: pure presentational change, no state, no API, no migration.
- Unknowns: icon choice (candidates: `lucide-react` `FastForward`, `ChevronsRight`, `ArrowRight`, `Zap`); whether to render as a standalone icon or a labeled pill matching the "AI" badge style.

### Dependencies
- `components/dashboard/KanbanBoard.tsx` — stage column header rendering.
- `types/workflow.ts` — `Stage` type already carries the field; no change needed.
- `lib/workflow-store.ts` and `.nos/workflows/requirements/config/stages.yaml` — source of truth for the flag; read-only for this requirement.
- `components/dashboard/StageDetailDialog.tsx` — already edits the flag; confirm wording/iconography is consistent if it renders an indicator there.
- `lucide-react` — icon set already in use (e.g. `Sparkles`, `MoreVertical`).
- No backend, API, or auto-advance engine changes (`lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`) are required.

### Open questions
1. **Icon + label style** — standalone icon-only indicator, or labeled pill ("Auto") matching the current "AI" badge treatment? Recommendation: labeled pill for symmetry with the AI badge, so both signals are equally discoverable.
2. **Icon choice** — `FastForward`, `ChevronsRight`, or `Zap`? Needs a one-line design decision.
3. **Placement when both flags are set** — most non-terminal stages have both `prompt` and `autoAdvanceOnComplete`. Should the two badges sit side-by-side, merge into a combined "AI · Auto" chip, or stack? Recommendation: side-by-side, same row, to keep each signal independently scannable.
4. **Terminal stages** — confirm `Backlog`/`Done` (where the flag is `null`) should show no indicator rather than an explicit "manual" badge.
5. **Tooltip copy** — exact wording of the `title` attribute for accessibility/clarity.

## Specification

### User stories
1. As a workflow operator scanning the Kanban board, I want to see at a glance which stages auto-advance items on completion, so that I can predict where a card will land after its agent session finishes without opening the stage edit dialog.
2. As a new user learning the workflow, I want the auto-advance indicator to be self-describing via tooltip, so that I understand what the icon means the first time I hover over it.
3. As an operator configuring stages, I want the auto-advance indicator to be visually consistent with the existing "AI" badge, so that both stage capabilities are equally discoverable and scannable.

### Acceptance criteria
1. **Given** a stage whose `autoAdvanceOnComplete` is a non-empty string (truthy), **when** its column is rendered in `components/dashboard/KanbanBoard.tsx`, **then** a labeled pill badge is shown in the stage header row next to the stage name, containing a `lucide-react` `FastForward` icon and the text `Auto`.
2. **Given** a stage whose `autoAdvanceOnComplete` is `null`, `undefined`, or an empty string (e.g. terminal `Backlog`/`Done`), **when** its column is rendered, **then** no auto-advance badge appears for that column.
3. **Given** a stage that has both `prompt` (AI) and `autoAdvanceOnComplete` set, **when** its column header is rendered, **then** both pills are shown side-by-side on the same row in the order `AI`, `Auto`, each remaining independently readable (not merged into a combined chip).
4. **Given** the auto-advance badge is rendered, **when** the user hovers it, **then** a native tooltip (`title` attribute) reads exactly: `Auto-advances to the next stage when items complete`.
5. **Given** the auto-advance badge is rendered, **then** it uses the same pill geometry and typography as the existing AI badge (`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium`) with a neutral/muted color pair distinct from the primary-colored AI badge — specifically `bg-muted text-muted-foreground` — so the two badges are visually differentiable at a glance.
6. **Given** the auto-advance badge is rendered, **then** the `FastForward` icon inside it is sized `h-3 w-3` to match the `Sparkles` icon in the AI badge.
7. **Given** the `StageDetailDialog.tsx` already exposes `autoAdvanceOnComplete` as an editable control, **when** a user toggles it on/off and saves, **then** the Kanban column header reflects the new indicator state on the next render of the board without requiring a page reload (already guaranteed by the existing store subscription; no new wiring required).
8. **Given** this is a display-only change, **when** the build is run, **then** no changes are made to `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, any API route, `types/workflow.ts`, or `.nos/workflows/requirements/config/stages.yaml`.

### Technical constraints
- **File to modify**: `components/dashboard/KanbanBoard.tsx` only.
- **Icon source**: import `FastForward` from `lucide-react` (already a dependency; same import style as the existing `Sparkles` import).
- **Truthiness check**: treat `autoAdvanceOnComplete` as "on" when the value is a non-empty string. A simple `stage.autoAdvanceOnComplete` JSX truthiness guard is sufficient given the `Stage` type (`string | null | undefined`).
- **Placement**: the new `<span>` must be rendered inside the existing `<div className="flex items-center gap-1.5">` header row at `components/dashboard/KanbanBoard.tsx:251`, immediately after the existing AI badge span (which closes at line 261).
- **Exact markup** to render when the flag is truthy:
  ```tsx
  <span
    title="Auto-advances to the next stage when items complete"
    className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
  >
    <FastForward className="h-3 w-3" />
    Auto
  </span>
  ```
- **No new dependencies** may be added to `package.json`.
- **No changes to tests, fixtures, or configuration** are required.
- **Accessibility**: the tooltip is delivered via `title` attribute for parity with the existing AI badge — no ARIA changes beyond that.
- **Performance**: the change is a single conditional JSX node per stage column; no measurable cost.

### Out of scope
- Modifying auto-advance runtime behavior in `lib/auto-advance.ts` or `lib/auto-advance-sweeper.ts`.
- Adding an edit affordance for `autoAdvanceOnComplete` in the column header — editing remains via the existing `MoreVertical` menu → `StageDetailDialog`.
- Introducing a new design-token or shared `<Badge>` component; reuse of existing inline Tailwind utility classes is the intentional choice.
- Rendering a "Manual" or equivalent indicator on terminal stages (`Backlog`, `Done`) where the flag is `null`.
- Changing the AI badge's appearance, copy, or behavior.
- Adding a combined "AI · Auto" chip; the two signals remain discrete pills.
- Showing the auto-advance indicator anywhere other than the Kanban column header (e.g. the `StageDetailDialog` already conveys this via its toggle control and needs no additional icon).
- Updating documentation, screenshots, or onboarding copy.

## Implementation Notes

- `components/dashboard/KanbanBoard.tsx`: added `FastForward` to the `lucide-react` import and rendered a muted pill badge (`FastForward` icon + `Auto` label) inside the existing stage-header `flex items-center gap-1.5` row, directly after the AI badge, guarded by `stage.autoAdvanceOnComplete` truthiness. Tooltip text exactly `Auto-advances to the next stage when items complete`; classes exactly `inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground` with `h-3 w-3` icon sizing.
- No other files modified. No changes to runtime, API, types, config, or tests. Display-only; terminal stages (`null` flag) render no badge.

## Validation

Evidence source: `components/dashboard/KanbanBoard.tsx:4` (import) and `components/dashboard/KanbanBoard.tsx:262-270` (badge markup), plus `tsc --noEmit` clean.

1. ✅ **AC1 — labeled pill with FastForward + "Auto"**: `KanbanBoard.tsx:262-270` renders `<FastForward className="h-3 w-3" />` and literal `Auto` inside the pill, guarded by `stage.autoAdvanceOnComplete &&`.
2. ✅ **AC2 — no badge when flag is falsy**: truthiness guard at line 262 short-circuits for `null`/`undefined`/empty string, so terminal stages (`Backlog`/`Done`) render nothing.
3. ✅ **AC3 — AI then Auto, side-by-side**: both spans sit inside the same `flex items-center gap-1.5` row (`KanbanBoard.tsx:251`); AI badge at 253-261, Auto badge at 262-270, in that order.
4. ✅ **AC4 — exact tooltip copy**: `KanbanBoard.tsx:264` — `title="Auto-advances to the next stage when items complete"` matches the spec verbatim.
5. ✅ **AC5 — pill geometry + muted color pair**: `KanbanBoard.tsx:265` applies `inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground`, distinct from the AI badge's `bg-primary/10 text-primary`.
6. ✅ **AC6 — `h-3 w-3` icon sizing**: `KanbanBoard.tsx:267` matches `Sparkles` sizing on line 258.
7. ✅ **AC7 — reflects edits without reload**: no new wiring; `stages` state is initialized from props and the column re-renders when `stages` updates via the existing `setStages` path. Type check confirms prop flow intact.
8. ✅ **AC8 — no changes to restricted files from this requirement**: REQ-00031 only touched `components/dashboard/KanbanBoard.tsx`. The working tree changes to `.nos/workflows/requirements/config/stages.yaml` and `app/api/workflows/[id]/items/[itemId]/route.ts` belong to separate concurrent requirements (auto-advance refactor / sweeper work), not this one; `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, and `types/workflow.ts` have no modifications relative to HEAD from this item's scope.

**Regressions checked**: AI badge unchanged at `KanbanBoard.tsx:253-261`; `MoreVertical` edit menu and stage-count chip (`:278-295`) unaffected; `StageDetailDialog` opens unchanged. `npx tsc --noEmit` reports no errors.

**Verdict**: all 8 acceptance criteria pass. Advance to Done.
