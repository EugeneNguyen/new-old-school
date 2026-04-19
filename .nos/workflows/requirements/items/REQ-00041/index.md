move member agent name to next line

## Analysis

### 1. Scope
**In scope:**
- Adjust the stage header row in `components/dashboard/KanbanBoard.tsx` (lines ~93–139) so the member agent pill (the `User` icon + `agent.displayName` / missing-agent fallback) wraps onto a new line below the row containing `stage.name`, the `AI` badge, and the `Auto` badge.
- Keep the existing tooltips, icons, colors, and truncation behavior of the agent pill intact.
- Verify the change still looks correct in three stage states: (a) no agent configured, (b) agent resolved, (c) agent id references a missing agent.

**Out of scope:**
- Any change to the stage header in other surfaces (`ListView`, `StageDetailDialog`, `WorkflowItemsView`, `ItemDetailDialog`).
- Redesign of the AI / Auto badges themselves, of `stage.description` placement, or of the stage card chrome (count pill, edit button, drag zone).
- Responsive/column-width changes to the kanban board layout.
- Any backend, API, or data-model changes — this is a pure presentational tweak.

### 2. Feasibility
- Technically trivial: the current `<div className="flex items-center gap-1.5">` at line 95 groups all four elements. Splitting the agent pill out into a sibling row (or wrapping the top row with `flex-wrap` and forcing the agent pill to `basis-full`) both work and are low-risk.
- Risk: long `agent.displayName` values could still overflow the 320px (`w-80`) column. The current code does not truncate the displayName, so we should add `truncate` / `max-w-full` to the moved pill to avoid re-introducing the same break on a second line.
- No unknowns requiring a spike; a single-file CSS-level edit is sufficient.

### 3. Dependencies
- File: `components/dashboard/KanbanBoard.tsx` (the only stage-header implementation that composes stage name + AI + Auto + agent).
- Data shape: `Stage` and `Agent` from `@/types/workflow` — unchanged.
- Data source: `/api/agents` fetch that hydrates `agents` state — unchanged.
- Related but untouched surfaces that also render stage metadata (for reviewer awareness, not for editing): `components/dashboard/StageDetailDialog.tsx`, `components/dashboard/ListView.tsx`, `components/dashboard/WorkflowItemsView.tsx`.
- No external services, no other requirements depend on or block this.

### 4. Open questions
- Should the agent pill drop to its own line **always**, or only when it would overflow? (Default assumption: **always** — that is what the request literally asks for and avoids jitter as agent names change.)
- Should alignment of the new row be left-aligned under the stage name, or indented? (Default assumption: left-aligned, flush with the stage name, no indent.)
- Should the missing-agent fallback pill (`{stage.agentId}?`) follow the same rule? (Default assumption: yes — it occupies the same slot and has the same overflow risk.)
- Is any spacing change desired between the top row and the agent row? (Default assumption: a small `mt-1` gap to match the existing `mt-0.5` used for `stage.description`.)

## Specification

### 1. User stories
1. As a workflow operator viewing the Kanban board, I want the member agent name to appear on its own line under the stage title, so that long agent display names no longer push the stage header out of alignment or clip inside the 320px column.
2. As a workflow operator, I want the stage name, AI badge, and Auto badge to stay together on a single top row, so that the at-a-glance stage identity is unchanged by this fix.
3. As a workflow operator, I want the agent pill to keep its icon, tooltip, and color, so that I can still identify the agent and hover to see its id.
4. As a workflow operator configuring a stage whose agent id no longer resolves, I want the missing-agent fallback (`<agentId>?`) to wrap to the new line the same way, so that misconfigurations remain visible without breaking the header.

### 2. Acceptance criteria
1. **Given** a stage rendered in `KanbanBoard.tsx` with `stage.agentId` set and the agent resolvable from the `/api/agents` response, **when** the board is displayed, **then** the stage name, the `AI` badge (if `stage.prompt` is truthy), and the `Auto` badge (if `stage.autoAdvanceOnComplete` is truthy) render on the first line inside the header's `min-w-0 flex-1` container, and the agent pill renders on a second line below that first line.
2. **Given** a stage whose `stage.agentId` does not match any loaded agent, **when** the board is displayed, **then** the italic muted fallback pill `{stage.agentId}?` renders on the second line in place of the resolved agent pill, using the same row/position rule as AC 1.
3. **Given** a stage with `stage.agentId` unset, **when** the board is displayed, **then** no second line is rendered for the agent slot and the header occupies only the first line (plus `stage.description`, if present, per existing behavior).
4. **Given** an agent whose `displayName` is long enough that it would exceed the 320px column, **when** the pill renders on the second line, **then** the pill text is truncated with an ellipsis (no wrap to a third line, no horizontal overflow of the column).
5. **Given** a stage where `stage.description` is set, **when** the header renders, **then** `stage.description` continues to appear beneath the agent pill line (order: top row → agent pill row → description), preserving existing `line-clamp-2` behavior.
6. **Given** the agent pill is rendered on its own line, **when** the user hovers it, **then** the existing `title` tooltip (`Runs as agent '<displayName>' (<id>)` for a resolved agent, `References missing agent '<id>'` for the fallback) is unchanged.
7. **Given** the same `KanbanBoard` view, **when** a user drags, clicks the edit button, or opens the stage detail dialog from the header, **then** all existing interactions (drag-to-reorder stage, count pill, edit button at lines ~146–159) continue to function and are not visually overlapped by the new agent row.
8. **Given** the other surfaces that render stage metadata (`StageDetailDialog`, `ListView`, `WorkflowItemsView`, `ItemDetailDialog`), **when** they render, **then** their layouts are unchanged by this requirement.

### 3. Technical constraints
- **File under edit:** `components/dashboard/KanbanBoard.tsx` only. No other component file may be modified for this requirement.
- **Edit locus:** the stage header block currently spanning lines ~93–139 (the `<div className="flex items-start justify-between gap-2">` wrapper and its inner `<div className="flex items-center gap-1.5">`).
- **Required layout rule:** split the existing single flex row into two stacked rows inside the `min-w-0 flex-1` container:
  - Row 1 (unchanged content, unchanged row classes): `stage.name` `<h3>`, the AI badge, the Auto badge.
  - Row 2 (new): the resolved agent pill **or** the missing-agent fallback pill. Row 2 must be left-aligned flush with `stage.name` (no indent).
- **Spacing:** add `mt-1` (or a visually equivalent Tailwind utility from the project's existing scale) between row 1 and row 2. Do not change the existing `mt-0.5` spacing for `stage.description`.
- **Truncation:** the agent pill on row 2 must enforce `truncate` and `max-w-full` (or the equivalent combination of `min-w-0` + `truncate`) so it cannot overflow the 320px (`w-80`) column or wrap to a third line. The displayName text node must carry the truncate class, not just the wrapping `<span>`.
- **Preserved attributes (must not change):** the pill's `title` tooltip text, its `User` icon (`h-3 w-3`), its `bg-secondary`/`text-secondary-foreground` classes for the resolved state, and its `bg-muted italic text-muted-foreground` classes for the fallback state.
- **Types / data:** no changes to `Stage` or `Agent` types in `@/types/workflow`; no changes to the `/api/agents` contract; no changes to the `agents` state hydration.
- **Conditional rendering:** row 2 must only mount when `stage.agentId` is truthy; when `stage.agentId` is empty/undefined, no empty row, spacer, or placeholder should render.
- **Styling approach:** use Tailwind utility classes consistent with the rest of the file. Do not introduce new CSS modules, inline `style={{…}}` props, or new global styles.
- **No behavior changes:** do not modify drag-and-drop handlers, `onMoveItem`, `setExpandedStages`, the count pill, the edit button, or any `onClick`/`onMouseDown` logic in lines ~146–159.
- **Performance:** the resolved-agent lookup (`agents.find((candidate) => candidate.id === stage.agentId)`) must not be duplicated across both rows; compute the resolved agent (or its fallback state) once per stage render and reuse the value for row 2.

### 4. Out of scope
- Redesign or restyling of the AI badge, the Auto badge, or the agent pill's colors, icons, radius, or padding.
- Changes to `StageDetailDialog.tsx`, `ListView.tsx`, `WorkflowItemsView.tsx`, `ItemDetailDialog.tsx`, or any other surface that renders stage metadata.
- Changes to the `w-80` column width, the kanban board's responsive breakpoints, or the stage card's overall chrome (border, background, padding, gap).
- Changes to `stage.description` rendering, its `line-clamp-2` truncation, or its position relative to the agent row beyond the ordering stated in AC 5.
- Backend, API, schema, or data-model changes (no touch to `/api/agents`, `@/types/workflow`, or NOS runtime code).
- Adding new tooltips, popovers, menus, or interactions for the agent pill.
- Introducing overflow-driven conditional wrapping (e.g., "wrap only when long"); the agent pill always occupies its own row when present, per AC 1–3.
- Automated visual regression tests or new unit/e2e test suites — verification is a manual check of the three stage states listed in Analysis §1.

## Validation

**Overall verdict: ❌ Implementation not performed.** The Implementation stage session (sessionId `9e17f747-fce5-454e-ae0a-643a543b8121`, agent `david-engineer`) failed to produce any code change — the associated comment records a model-access error (`claude-sonnet-4-6`), and no `## Implementation Notes` section was ever appended to this file. The code in `components/dashboard/KanbanBoard.tsx` (lines 93–139) is still the pre-REQ-00041 single-flex-row layout that this requirement was filed to fix.

Evidence:
- `components/dashboard/KanbanBoard.tsx:93-139` — `stage.name`, AI badge, Auto badge, and the agent pill (resolved or missing-agent fallback) all still live inside the same `<div className="flex items-center gap-1.5">`. No second row has been added. No `truncate`/`max-w-full` has been applied to `{agent.displayName}`.
- `git log -- components/dashboard/KanbanBoard.tsx` — last touch was commit `abba236` ("Add agent workspace and workflow automation"), which predates REQ-00041. No implementation commit exists.
- `index.md` — no `## Implementation Notes` section; only Analysis and Specification were authored.

### Acceptance criteria

| # | Verdict | Evidence |
|---|---------|----------|
| AC1 — resolved agent pill on a second line below name/AI/Auto | ❌ | `KanbanBoard.tsx:95-139` still renders all four on one row inside `flex items-center gap-1.5`. |
| AC2 — missing-agent fallback on a second line | ❌ | `KanbanBoard.tsx:129-137` still renders the fallback pill as a sibling on the same top row. |
| AC3 — no second row when `stage.agentId` is unset | ❌ (vacuously true, but the whole layout rule is unimplemented) | The conditional `stage.agentId && …` at line 115 still guards the original single-row pill; no new row exists to be conditionally mounted. |
| AC4 — truncation of long `displayName` on row 2 | ❌ | `{agent.displayName}` at line 125 has no `truncate` class and its wrapper `<span>` has no `max-w-full`/`min-w-0`. |
| AC5 — `stage.description` below the agent pill row | ❌ | `stage.description` (lines 140–144) renders below the single combined row; there is no agent-pill row for it to follow. |
| AC6 — tooltips preserved | ⚠️ | Existing `title` attributes at lines 121 and 131 are unchanged — but only because nothing was moved. Not verified against the required new layout. |
| AC7 — drag, count pill, edit button unaffected | ✅ | Unrelated elements at lines 146–163 are untouched by the (non-)change. |
| AC8 — other surfaces unchanged | ✅ | `StageDetailDialog.tsx`, `ListView.tsx`, `WorkflowItemsView.tsx`, `ItemDetailDialog.tsx` are untouched. |

### Follow-ups

1. Re-run the Implementation stage (or run it for the first time) with a working model. The stage prompt is already complete in §Specification above; the implementer should:
   - Inside the `min-w-0 flex-1` container at `KanbanBoard.tsx:94`, split the current `flex items-center gap-1.5` row (lines 95–139) so `stage.name`, the AI badge, and the Auto badge stay on row 1, and the agent pill (resolved or missing) moves into a new sibling row 2 with `mt-1`.
   - Compute `const agent = stage.agentId ? agents.find(c => c.id === stage.agentId) : undefined;` once at the top of the stage render block, and reuse it for row 2 (per Technical Constraint §3 "Performance").
   - On row 2, wrap the pill so it cannot overflow the 320px column: apply `truncate` + `min-w-0`/`max-w-full` to the pill `<span>` and to the `displayName` text node.
   - Preserve both `title` tooltip strings and the `bg-secondary`/`bg-muted italic` color classes exactly as they are today.
2. After implementing, append `## Implementation Notes` to this file summarizing the change, then re-run this Validation stage.
3. Do **not** advance this item to Done until the above passes.
