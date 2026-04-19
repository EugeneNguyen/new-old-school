Current:

* Stage name, ai icon, auto advanced icon and member name make the layout broken

Desired

* Agent Member name in the next line

## Analysis

### 1. Scope

**In scope**
- Visual/layout fix for the stage column header in `components/dashboard/KanbanBoard.tsx` (lines ~93–139), which currently renders stage name, AI badge, Auto-advance badge, and Agent member badge together inside one `flex items-center gap-1.5` row within a fixed 320px (`w-80`) column.
- Moving the Agent member chip (`User` icon + `agent.displayName`, and the missing-agent fallback variant) onto a second line beneath the stage name + AI/Auto badges, so the header no longer overflows or truncates when all three adornments are present.
- Preserving existing affordances: the "AI" Sparkles badge, the "Auto" FastForward badge, the missing-agent italic fallback, tooltips (`title=…`), the item count pill, and the `MoreVertical` edit button must continue to render and remain clickable.

**Out of scope**
- Any changes to the stage detail dialog (`StageDetailDialog.tsx`), stage prompt editing, or the underlying stage/agent data model in `types/workflow.ts` / `lib/stage-pipeline.ts`.
- Restyling the item cards below the header or the Kanban container as a whole.
- Adding new metadata (e.g. adapter/model) to the header — only repositioning the existing agent chip.
- Dashboard-wide theming, responsive breakpoints beyond the existing `w-80` column, or keyboard/accessibility rework beyond what the move naturally requires.

### 2. Feasibility

- **Technical viability: high.** The fix is a localized Tailwind/JSX reorganization in one component — split the current single `flex` row into two stacked rows (name + AI/Auto on the first, agent chip on the second) while keeping the outer `flex items-start justify-between gap-2` intact so the count pill + `MoreVertical` button remain right-aligned and top-anchored.
- **Risks**
  - Vertical height of every stage column grows by one line whenever a stage has an assigned agent, which is the common case — acceptable, but worth eyeballing against the board density.
  - `stage.description` already renders on its own line directly below the badges (`p.mt-0.5 line-clamp-2`); inserting the agent chip between the badge row and the description must keep spacing consistent (likely reuse `mt-0.5` / `mt-1`).
  - Tests/snapshots (if any) that assert header DOM structure could need updating — none spotted on a quick look, but the implementor should grep for `stage.agentId` / `displayName` assertions before shipping.
- **Unknowns** — none that require a spike. Pure presentational change.

### 3. Dependencies

- **Primary file:** `components/dashboard/KanbanBoard.tsx` (stage-column header block).
- **Data shape:** relies on the existing `Stage` fields (`name`, `prompt`, `autoAdvanceOnComplete`, `agentId`, `description`) from `types/workflow.ts` and the `agents` prop already passed into the board — no schema or API changes needed.
- **Icons:** continues to use `Sparkles`, `FastForward`, `User` from `lucide-react` (already imported at line 4).
- **Adjacent UI:** `StageDetailDialog` opens from the header's `MoreVertical` button; no change, but the touch target must remain aligned after the restructure.
- No API routes, server code, or NOS workflow runtime touched.

### 4. Open questions

1. **Agent chip placement when absent:** should the second line disappear entirely when `stage.agentId` is unset (likely yes, to avoid a dead row), or should we reserve space for visual consistency across columns? Current code renders nothing when `agentId` is unset, so matching that (conditional second line) is the default assumption.
2. **Missing-agent fallback treatment:** when `agentId` is set but no matching agent is found, the existing italic `"{stage.agentId}?"` chip should also move to the second line — confirm this is desired (assumed yes).
3. **Alignment of the second line:** left-align under the stage name (simplest) vs. indent under the badges. Default to left-align, flush with `h3`.
4. **Should the `AI` and `Auto` badges stay on the same row as the stage name, or also wrap below?** The request specifically calls out the *agent member name* moving down, so the plan is to leave AI/Auto on the title row and only drop the agent chip — confirm before implementation if a different grouping is preferred.
5. **Stage `description` ordering:** should it stay immediately below the first (title) row, or move below the agent chip? Keeping it directly below the agent chip (i.e. title row → agent row → description) reads most naturally; implementor should confirm against any design reference.

## Specification

### User stories

1. As a workflow operator viewing the Kanban board, I want the stage column header to render cleanly when a stage has both AI/Auto badges and an assigned agent, so that I can read the stage name and adornments without truncation or visual overflow inside the 320px column.
2. As a workflow operator, I want the agent member chip to appear on its own line beneath the stage title row, so that the assigned agent's display name remains fully legible regardless of length.
3. As a workflow operator, I want stages without an assigned agent to omit the second line entirely, so that columns stay vertically compact when no agent metadata exists.
4. As a workflow operator, I want the stage's edit (`MoreVertical`) button and item count pill to stay top-right aligned with the stage name, so that header controls remain in their familiar position after the layout change.

### Acceptance criteria

1. **Given** a stage with `agentId` resolving to an existing agent, **when** the Kanban board renders, **then** the stage header shows two stacked rows: row 1 contains the `<h3>` stage name plus any `AI` (Sparkles) and `Auto` (FastForward) badges; row 2 contains the agent chip (`User` icon + `agent.displayName`).
2. **Given** a stage with `agentId` set but no matching agent in the `agents` prop, **when** the header renders, **then** the italic missing-agent fallback chip (`User` icon + `"{stage.agentId}?"`, `italic` class, `title="References missing agent '<id>'"`) appears on row 2 in place of the resolved agent chip.
3. **Given** a stage with `agentId` unset (null/undefined/empty), **when** the header renders, **then** row 2 is not rendered at all (no empty/reserved space) and `stage.description` (if present) appears immediately below row 1.
4. **Given** a stage with `prompt` set, **when** the header renders, **then** the AI badge (`title="AI-automated: items entering this stage start an agent session"`, `Sparkles` icon, text "AI") remains on row 1, to the right of the stage name.
5. **Given** a stage with `autoAdvanceOnComplete` true, **when** the header renders, **then** the Auto badge (`title="Auto-advances to the next stage when items complete"`, `FastForward` icon, text "Auto") remains on row 1.
6. **Given** any stage, **when** the header renders, **then** the right-hand column of the header (item count pill + `MoreVertical` button) stays right-aligned and top-anchored to row 1 — it does not shift down when row 2 is added.
7. **Given** the agent chip is on row 2, **when** the user hovers it, **then** the same `title` tooltip (`Runs as agent '<displayName>' (<id>)` or `References missing agent '<id>'`) shows as before.
8. **Given** the agent chip is on row 2, **when** the user clicks the `MoreVertical` button, **then** `StageDetailDialog` opens exactly as it does today (no regression in click target or handler wiring).
9. **Given** a stage with both an agent and a `description`, **when** the header renders, **then** the visual order from top to bottom is: row 1 (name + AI/Auto badges) → row 2 (agent chip) → `description` paragraph (`line-clamp-2`, `text-xs text-muted-foreground`).
10. **Given** a stage with an extremely long `agent.displayName` (e.g. 40+ characters), **when** the header renders, **then** the chip stays within the 320px column and does not push the count pill or `MoreVertical` button off-screen.

### Technical constraints

- **File of change:** `components/dashboard/KanbanBoard.tsx`, lines ~93–139 (the stage column header `<div className="flex items-start justify-between gap-2">` block). No other files modified.
- **No data, type, or API changes:** continue to use existing `Stage` fields (`name`, `prompt`, `autoAdvanceOnComplete`, `agentId`, `description`) from `types/workflow.ts` and the `agents` prop already passed into `KanbanBoard`.
- **Icons:** reuse `Sparkles`, `FastForward`, `User` from `lucide-react` (already imported). Do not add new icon imports.
- **Outer layout preserved:** the outer flex container remains `flex items-start justify-between gap-2` so that `items-start` keeps the right-hand controls top-anchored when row 2 appears.
- **Row structure:** inside the left `min-w-0 flex-1` wrapper, replace the single `flex items-center gap-1.5` row with a vertical stack (e.g. `flex flex-col gap-0.5` or two sibling rows). Row 1 keeps `flex items-center gap-1.5` for name + AI + Auto. Row 2 (agent chip) is rendered conditionally on `stage.agentId` being truthy.
- **Agent chip alignment:** row 2 is left-aligned, flush with the `<h3>` stage name (no extra indent).
- **Spacing:** use a small gap (`mt-0.5` or `gap-0.5`) between row 1 and row 2 so density matches the existing badge row; `stage.description` keeps its current `mt-0.5 line-clamp-2 text-xs text-muted-foreground` styling.
- **Class name reuse:** the agent chip and missing-agent chip retain their existing Tailwind classes verbatim (`inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground` and the italic `bg-muted` variant).
- **Truncation:** the agent chip's display name should not break the 320px column; either let the chip wrap naturally on the second line (acceptable) or apply `truncate max-w-full` to the inner text span if needed to keep the chip on a single line. Either choice satisfies AC #10 as long as the count pill and `MoreVertical` button remain in place.
- **No DOM IDs / data attributes added or renamed.** Existing `title` attribute strings stay byte-identical so any downstream tooltip assertions remain valid.

### Out of scope

- Changes to `StageDetailDialog.tsx`, stage prompt editing UI, or any stage configuration form.
- Changes to `types/workflow.ts`, `lib/stage-pipeline.ts`, API routes under `app/api/`, or the NOS workflow runtime.
- Adding new stage metadata to the header (e.g. adapter, model, status counts beyond the existing item count pill).
- Restyling the item cards rendered below the header, the Kanban container, or other dashboard pages.
- Responsive breakpoints beyond the existing fixed `w-80` column width.
- Accessibility rework beyond what the row split naturally entails (no new ARIA roles, focus management, or keyboard handlers).
- Snapshot/test infrastructure changes — if a snapshot test exists and breaks, update it as part of implementation, but do not introduce new test scaffolding.
- Theming changes (light/dark mode tokens, color palette).

## Implementation Notes

**Changed:** `components/dashboard/KanbanBoard.tsx` (lines 94–147, the stage column header `<div>` block).

**What changed:**
- The single `flex items-center gap-1.5` row (stage name + AI badge + Auto badge + agent chip) was replaced with a two-layer structure inside the existing `min-w-0 flex-1` wrapper: an outer `<div className="flex flex-col gap-0.5">` that stacks row 1 (name + AI + Auto badges) and row 2 (agent chip, conditional on `stage.agentId`).
- The outer flex container (`flex items-start justify-between gap-2`) and right-hand controls column (item count pill + `MoreVertical` button) were left untouched — the `items-start` alignment on the outer container ensures right-hand controls stay top-anchored to row 1 regardless of whether row 2 is present.
- No other files were modified. All existing Tailwind classes, `title` tooltip strings, and icon usage are byte-identical to the original.

**Acceptance criteria check:**
- AC 1–2: Agent chip (resolved or missing-agent fallback) now renders on its own second row. ✓
- AC 3: `stage.agentId` falsy → row 2 not rendered; `description` stays directly below row 1. ✓
- AC 4–5: AI and Auto badges remain on row 1 with original classes and tooltip strings. ✓
- AC 6: `items-start` on outer flex keeps count pill + `MoreVertical` top-anchored; no regression. ✓
- AC 7: `title` attributes on agent chip are unchanged. ✓
- AC 8: `onOpenStage` handler wiring is untouched. ✓
- AC 9: Visual order is now: row 1 (name + badges) → row 2 (agent chip) → `description` paragraph. ✓
- AC 10: Agent chip wraps naturally on the second line; long names do not push the right-hand controls off-screen. ✓

## Validation

Evidence base: code review of `components/dashboard/KanbanBoard.tsx:93-160`, `npx tsc --noEmit` (clean), and grep for `KanbanBoard` / `stage.agentId` / `displayName` assertions in `*.test.*` (no test files exist — no snapshots to update).

| AC | Verdict | Evidence |
|----|---------|----------|
| 1 | ✅ Pass | `KanbanBoard.tsx:95` wraps the header left column in `<div className="flex flex-col gap-0.5">`. Row 1 at line 96 is `<div className="flex items-center gap-1.5">` holding the `<h3>` stage name (line 97), the AI badge (lines 98-106), and the Auto badge (lines 107-115). Row 2 (lines 117-140) is the agent chip rendered as a sibling inside the flex-col stack. |
| 2 | ✅ Pass | Missing-agent fallback at `KanbanBoard.tsx:131-139` renders on row 2 with `title={`References missing agent '${stage.agentId}'`}`, `italic` class on `bg-muted` chip, and `<User />` + `{stage.agentId}?` — byte-identical to the pre-change strings. |
| 3 | ✅ Pass | Row 2 is gated on `{stage.agentId && (…)}` at line 117, so a falsy `agentId` short-circuits and no empty row is emitted. `stage.description` at line 142-146 renders directly under the flex-col stack, which then contains only row 1. |
| 4 | ✅ Pass | AI badge at `KanbanBoard.tsx:98-106` remains on row 1, with `title="AI-automated: items entering this stage start an agent session"`, `<Sparkles className="h-3 w-3" />`, and text "AI" — strings and classes unchanged. |
| 5 | ✅ Pass | Auto badge at `KanbanBoard.tsx:107-115` remains on row 1, with `title="Auto-advances to the next stage when items complete"`, `<FastForward className="h-3 w-3" />`, and text "Auto" — unchanged. |
| 6 | ✅ Pass | Outer container at `KanbanBoard.tsx:93` is still `flex items-start justify-between gap-2`; the right-hand controls column (`KanbanBoard.tsx:148-159`) is a direct sibling of the left column and is top-anchored via `items-start`, so it stays aligned with row 1 regardless of row 2's presence. |
| 7 | ✅ Pass | Agent chip `title` at `KanbanBoard.tsx:123` is `Runs as agent '${agent.displayName}' (${agent.id})`; fallback `title` at line 133 is `References missing agent '${stage.agentId}'`. Both strings are byte-identical to the pre-change implementation. |
| 8 | ✅ Pass | `MoreVertical` button handler wiring at `KanbanBoard.tsx:152-159` is untouched; `onClick` still calls `onOpenStage(stage)` with the same `e.stopPropagation()` + `draggable={false}` + `onMouseDown` stopPropagation guards. |
| 9 | ✅ Pass | DOM order inside the left column: row 1 (name + AI + Auto) at line 96 → row 2 (agent chip) at line 117 → `<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">` description at line 142-146. |
| 10 | ✅ Pass | Left column wrapper is `min-w-0 flex-1` (line 94), so long `displayName` values wrap within the fixed `w-80` (320px) column (line 89) instead of overflowing. Right-hand controls sit in a sibling `shrink-0` container (line 148), so they cannot be pushed off-screen. |

**Regressions checked:** `npx tsc --noEmit` exits clean; no snapshot/unit tests reference `KanbanBoard` or `stage.agentId`; no other files were modified per the diff (spec-compliant with the "file of change" constraint).

**Verdict:** All 10 acceptance criteria pass. Ready to advance.
