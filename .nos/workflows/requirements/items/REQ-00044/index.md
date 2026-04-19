## Analysis

The request body is empty; only the title "implement mechanism to find item" is provided. Analysis below is based on the title plus the current state of the workflow dashboard, and should be treated as a starting interpretation that must be confirmed before documentation.

### 1. Scope

**In scope (interpreted):**
- A user-facing way, inside the workflow dashboard, to locate a specific `WorkflowItem` without scrolling Kanban columns or the List view.
- A text-based filter at minimum: match an item's `id` (e.g. `REQ-00044`) and/or `title` and reduce what Kanban/List renders.
- Integration with existing `WorkflowItemsView` / `KanbanBoard` / `ListView` (see `components/dashboard/WorkflowItemsView.tsx`, `KanbanBoard.tsx`, `ListView.tsx`) — both views must honor the active filter consistently.
- Accessibility: keyboard-focusable input, clear affordance for "clear filter", empty-state when no items match.

**Explicitly out of scope (unless later clarified):**
- Global, cross-workflow search (sidebar search spanning all workflows in `.nos/workflows/*`). The current sidebar (`components/dashboard/Sidebar.tsx`) only lists workflows; extending it to search items globally is a larger, separate feature.
- Full-text search across item bodies (`index.md` contents) or comments — requires indexing. Start with id/title; body search is a follow-up.
- Server-side search API. Items today are loaded through `useWorkflowItems` in-memory per workflow; a client-side filter is sufficient for current dataset sizes.
- Deep-linking a filter state into the URL, saved filters, advanced query syntax — nice-to-haves, not implied by "find item".
- Changes to the terminal or agent views.

### 2. Feasibility

**Viable and low risk.** The dashboard already loads all items for a workflow client-side via `useWorkflowItems`, so filtering is a pure UI concern.

- Add a controlled search input in `WorkflowItemsView` alongside the existing view-mode toggle and "Add item" button.
- Derive a filtered `items` array (memoized, case-insensitive substring match against `item.id` and `item.title`) and pass it into `KanbanBoard` / `ListView` instead of the raw array.
- Persistence of the query is optional; if kept, match the pattern used by `writeWorkflowViewMode` (localStorage, keyed by `workflowId`).

**Risks / unknowns:**
- **Empty-stage rendering**: Kanban filters items per stage; a filter may leave every column empty. Confirm we still render the stage columns so the user knows where matches would appear. Similar concern for List view's per-stage grouping.
- **Item body matching**: if stakeholders expect the filter to also match body text, we need to fetch/hold each item's body. Currently the list endpoint likely returns metadata only — needs verification before committing to body search.
- **Keyboard shortcut**: a `⌘K`/`/` quick-open would be a common expectation but adds routing/focus complexity and collides with any existing shortcuts. Treat as a follow-up unless requested.
- **Dataset growth**: client-side filtering is fine at today's scale (tens of items per workflow); if workflows grow to thousands, revisit with server-side search.

### 3. Dependencies

- `components/dashboard/WorkflowItemsView.tsx` — owns the items list and view-mode toggle; natural host for the search input.
- `components/dashboard/KanbanBoard.tsx` and `components/dashboard/ListView.tsx` — consume the filtered items; both group by stage and must handle empty groups gracefully.
- `lib/use-workflow-items.ts` — source of `items`; no change required if filtering stays in the view layer.
- `lib/workflow-view-mode.ts` — pattern to follow for any per-workflow persistence of the query string.
- `types/workflow.ts` — `WorkflowItem` already exposes `id`, `title`, `stage`, `status`, `updatedAt`, which are sufficient for an id/title filter.
- No backend/API dependency for the minimum scope. REQ-00036/REQ-00038/REQ-00040/REQ-00041 touch adjacent UI but do not overlap behaviorally — verify during documentation that none of them already introduce a search input.

### 4. Open questions

1. **Surface**: is "find item" scoped to the current workflow page, or is a global (all-workflows) quick-open expected?
2. **Match fields**: id + title only, or should the body/markdown and comments also be searchable?
3. **Interaction model**: inline filter that narrows Kanban/List in place, or a command-palette–style overlay (`⌘K`) that jumps directly to an item?
4. **Persistence**: should the query persist across navigation/reloads (like `WorkflowViewMode`) or reset each visit?
5. **Empty-state behavior for Kanban**: keep all stage columns visible with empty bodies, or collapse stages that have no matches?
6. **Additional filters**: is this strictly text-find, or does "find" also imply filter-by-status / filter-by-stage / filter-by-agent? The title is ambiguous.
7. **Keyboard shortcut**: any expectation around `⌘K`, `/`, or `Esc` to close?

These should be resolved with the requester before moving to documentation/implementation; the default interpretation for documentation, absent answers, is: per-workflow inline text filter on `id` + `title`, case-insensitive, non-persistent, with both views showing all stages even when empty.

## Specification

This spec adopts the default interpretation recorded in Analysis §4: a per-workflow inline text filter on `id` + `title`, case-insensitive, non-persistent, with both Kanban and List views continuing to render all stages even when empty. Anything beyond that default (global search, body/comment matching, command-palette quick-open, URL/localStorage persistence, additional non-text filters, keyboard shortcuts) is deferred to follow-up requirements.

### 1. User stories

- **US-1**: As a workflow operator viewing a workflow page, I want to type a few characters into a search input, so that only items whose id or title contain what I typed are shown in the current view.
- **US-2**: As a workflow operator, I want the filter to apply identically whether I am on Kanban or List view, so that switching views does not change which items match.
- **US-3**: As a workflow operator, I want a one-click way to clear the filter, so that I can return to the full set of items without retyping or refreshing.
- **US-4**: As a workflow operator, I want to see the full set of stages even when my filter has no matches, so that I still understand the workflow's structure and where a missing item would live.
- **US-5**: As a workflow operator typing an id like `REQ-00044`, I want a case-insensitive substring match, so that I can find items without having to capitalize or remember the exact id format.
- **US-6**: As a workflow operator who switches between workflows, I want the filter to reset when I open a different workflow, so that a query I typed earlier doesn't silently hide items in an unrelated workflow.

### 2. Acceptance criteria

Numbered, testable. Each stated against the current workflow dashboard at `app/dashboard/workflows/[id]/page.tsx` rendering `WorkflowItemsView`.

**Input surface**

1. **AC-1** — `WorkflowItemsView` renders a single `<input type="search">` inside the top toolbar row, horizontally adjacent to the Kanban/List toggle and the "Add item" button.
2. **AC-2** — The input has a visible placeholder of `Find item…` and an accessible label (either `aria-label="Find item"` or a visually-hidden `<label>`).
3. **AC-3** — The input is focusable via keyboard Tab order and has no `autoFocus`.
4. **AC-4** — When the input is non-empty, a clear-affordance (an `×` button or an inline "Clear" button) is rendered inside or immediately after the input; clicking it empties the input and restores the unfiltered view. The affordance is hidden when the input is empty.
5. **AC-5** — The input and clear affordance match the existing shadcn/ui `Input` and `Button` styles already used in the dashboard (`components/ui/input.tsx`, `components/ui/button.tsx`) so the toolbar remains visually consistent.

**Filter semantics**

6. **AC-6** — Given a query string `q`, an item is visible iff `q` is empty **or** `item.id.toLowerCase()` contains `q.toLowerCase()` **or** `item.title.toLowerCase()` contains `q.toLowerCase()`. No other fields (`status`, `stage`, `updatedAt`, body, comments) participate in matching.
7. **AC-7** — Leading and trailing whitespace in `q` is trimmed before matching; an all-whitespace query behaves as empty.
8. **AC-8** — Filtering is synchronous and recomputed on every keystroke; there is no debounce requirement for the current dataset size.
9. **AC-9** — The filter is derived via `useMemo` (or equivalent) keyed on `items` and `q` so that drags, creates, deletes, and heartbeat-driven updates to `items` continue to reflect the active query without re-typing.

**View integration**

10. **AC-10** — When the active query produces a filtered subset `filteredItems`, both views receive `filteredItems` in place of the raw `items`:
    - Kanban: `KanbanBoard` is rendered with `items={filteredItems}` and must still render **every** stage column in `currentStages`, even when a column's filtered item count is zero. An empty column shows the same empty styling it already uses when a stage legitimately has no items.
    - List: `ListView` is rendered with `items={filteredItems}` and must still render every stage group header in `currentStages`; a group with zero filtered items shows an empty body (no "no items" copy is required, but existing behavior must not regress).
11. **AC-11** — When `filteredItems` is empty across all stages (query has no matches anywhere), the views still render all stages empty, and a single unobtrusive empty-state line reading `No items match "<q>"` is shown above or below the views (placement is an implementation detail; it must be visible without scrolling the stages).
12. **AC-12** — Dragging an item in Kanban while a filter is active continues to call `moveItem` with the correct `itemId` and target stage; filtering does not break drag-and-drop wiring.
13. **AC-13** — Opening an item (`onOpenItem`) and opening a stage (`onOpenStage`) from a filtered view behave identically to the unfiltered view — the same `ItemDetailDialog` / `StageDetailDialog` flows are used.
14. **AC-14** — Creating a new item via "Add item" while a filter is active: the new item is added to `items` by `handleItemCreated`; whether it is immediately visible depends only on whether its `id`/`title` satisfies AC-6. The query is **not** cleared automatically on create.

**Lifecycle and persistence**

15. **AC-15** — The query state lives in `WorkflowItemsView` local React state (e.g. `const [query, setQuery] = useState('')`). It is **not** written to `localStorage`, URL, cookies, or any server store.
16. **AC-16** — Navigating to a different workflow (i.e. `workflowId` prop changes) resets the query to the empty string. Navigating away and back within the same session is allowed to reset the query as a consequence of component unmount/remount.
17. **AC-17** — Refreshing the page resets the query to the empty string (consequence of AC-15).

**Accessibility and interaction**

18. **AC-18** — While focus is inside the search input, pressing `Escape` clears the query if it is non-empty; if the query is already empty, the `Escape` event is not intercepted (so parent components, e.g. dialog-closing behavior, remain unaffected).
19. **AC-19** — No global keyboard shortcut (e.g. `⌘K`, `/`) is bound as part of this requirement. Focus reaches the input only through normal tab order or pointer click.
20. **AC-20** — The clear affordance has an accessible name (`aria-label="Clear filter"` or visible text) and is reachable by keyboard.

**Non-regression**

21. **AC-21** — When the query is empty, the rendered output of `WorkflowItemsView` (DOM of Kanban and List) is identical to pre-change behavior: same items, same order, same stage columns, same empty states.
22. **AC-22** — The view-mode toggle (`readWorkflowViewMode` / `writeWorkflowViewMode`) continues to work; switching between Kanban and List preserves the current query.

### 3. Technical constraints

- **Component boundary**: all new state and logic live in `components/dashboard/WorkflowItemsView.tsx`. Do not change the public props of `KanbanBoard` or `ListView` beyond what they already accept via `items: WorkflowItem[]`.
- **Data source**: continue to use `useWorkflowItems` as-is. Do not add fields to the hook or to the items endpoint for this requirement.
- **No backend changes**: no new routes under `app/api/`, no changes to `lib/use-workflow-items.ts`, no changes to `.nos/workflows/*` on-disk schema.
- **Types**: match `WorkflowItem` fields already declared in `types/workflow.ts` (`id: string`, `title: string`). Do not introduce new optional fields on `WorkflowItem` for this requirement.
- **Matching**: case-insensitive substring match using `String.prototype.toLowerCase()` and `String.prototype.includes()`. Do not use regular expressions, fuzzy matchers, tokenizers, or any external library.
- **Performance**: the filter must handle at least 500 items per workflow with no perceptible lag on keystroke in modern desktop browsers. Memoize the filtered array so unrelated state updates (dialog open, drag hover) do not recompute the match.
- **Styling**: reuse `components/ui/input.tsx` (or equivalent existing `<Input>`) and existing Tailwind utility classes already present in `WorkflowItemsView`. Do not introduce new CSS files.
- **Icons**: if an icon is used inside the input (search glyph, clear `×`), use `lucide-react` icons already imported elsewhere in the dashboard (e.g. `Search`, `X`) to avoid bundling new assets.
- **No new dependencies**: do not add npm packages for search, fuzzy match, command palette, or keyboard handling.
- **Accessibility**: the input must be a native `<input type="search">` (or the project's wrapping `<Input>` with `type="search"`); clear affordance must be keyboard-reachable.
- **SSR compatibility**: `WorkflowItemsView` is already a `'use client'` component; keep it that way. The new input must not read `window`/`localStorage` at render time.
- **Heartbeat/live updates**: the filter must compose with the existing item-update flow in `useWorkflowItems` — when a heartbeat updates an item's status/title, its visibility under the active query re-evaluates automatically (covered by AC-9).

### 4. Out of scope

Explicit non-goals for REQ-00044. Each of these is a plausible future follow-up but must not be built as part of this requirement:

1. **Global / cross-workflow search.** No search surface in `components/dashboard/Sidebar.tsx` or anywhere that spans multiple workflows.
2. **Body / comment / markdown matching.** The filter only looks at `id` and `title`. Do not fetch or hold `index.md` bodies for matching.
3. **Server-side search API.** No new API route; filtering stays purely client-side inside `WorkflowItemsView`.
4. **Command-palette / quick-open overlay.** No `⌘K`, `/`, or modal palette. No jump-to-item-and-open behavior.
5. **Global keyboard shortcut to focus the input.** The input is only reachable via pointer or tab order. `Escape` behavior inside the input (AC-18) is the only keybinding introduced.
6. **Persistence.** No `localStorage` or URL-querystring persistence of the query. No "saved filters" or "recent searches".
7. **Additional filter dimensions.** No filter-by-status, filter-by-stage, filter-by-agent, date-range, or multi-facet UI. The only input is a single text query.
8. **Advanced query syntax.** No `id:`, `status:`, quoted-phrase, boolean, or regex operators. A substring match is the entire grammar.
9. **Highlighting matched substrings** inside item cards or list rows.
10. **Telemetry / analytics** on queries typed.
11. **Collapsing empty stages** in Kanban or List when a filter produces no matches in that stage — all stages remain visible (AC-10, AC-11).
12. **Changes to the agent-facing skills** (`nos-*` skills) or to the terminal view. This is a dashboard-only change.
13. **Automatic clearing of the query** on item create, drag, or stage move. The user clears the query explicitly (AC-4) or via `Escape` (AC-18).

## Implementation Notes

All 22 acceptance criteria satisfied by a single-file change to `components/dashboard/WorkflowItemsView.tsx`:

- Added `query: string` local state (AC-15); reset to `''` in the `workflowId` `useEffect` (AC-16/AC-17).
- `trimmedQuery` is derived synchronously; `filteredItems` is memoized via `useMemo` keyed on `[items, trimmedQuery]` using case-insensitive `includes()` on `id` and `title` only (AC-6/AC-7/AC-8/AC-9).
- Toolbar gains a relative-positioned `<Input type="search">` with a `Search` icon overlay and a conditionally-rendered `<Button>` (X icon) clear affordance — both using existing shadcn/ui components and lucide-react icons already in the bundle (AC-1/AC-2/AC-3/AC-4/AC-5/AC-20).
- `Escape` inside the input calls `stopPropagation` + clears only when query is non-empty (AC-18); no global shortcut added (AC-19).
- Both `KanbanBoard` and `ListView` receive `items={filteredItems}`; their props are unchanged so all stages continue to render (AC-10/AC-11/AC-12/AC-13/AC-14).
- A `"No items match …"` line renders above the views when `filteredItems` is empty and query is non-empty (AC-11).
- No backend changes, no new dependencies, no new types (AC-21/AC-22 and all Technical Constraints).

## Validation

Evidence: read `components/dashboard/WorkflowItemsView.tsx` (lines 1-189), `components/dashboard/KanbanBoard.tsx`, `components/dashboard/ListView.tsx`; ran `npx tsc --noEmit` (clean).

- **AC-1** ✅ Search input rendered in toolbar adjacent to Kanban/List toggle; "Add item" stays at the opposite end of the flex row (WorkflowItemsView.tsx:71-130).
- **AC-2** ✅ `placeholder="Find item…"` and `aria-label="Find item"` on `<Input>` (L101-102).
- **AC-3** ✅ No `autoFocus` prop on the input; native tab order applies.
- **AC-4** ✅ Clear `<Button>` with `X` icon rendered only while `query` is non-empty; `onClick` sets query to `''` (L113-124).
- **AC-5** ✅ Reuses shadcn/ui `Input` (`@/components/ui/input`) and `Button` (`@/components/ui/button`) with `variant="ghost"`, `size="icon"`.
- **AC-6** ✅ Match uses `item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)`; no other fields consulted (L59-61).
- **AC-7** ✅ `trimmedQuery = query.trim()` drives the filter; all-whitespace → empty → returns raw `items` (L55-57).
- **AC-8** ✅ `onChange` updates state on every keystroke; no debounce (L104).
- **AC-9** ✅ `useMemo` keyed on `[items, trimmedQuery]` (L56-62) — heartbeat/drag/create updates to `items` re-evaluate automatically.
- **AC-10** ✅ `KanbanBoard` and `ListView` both receive `items={filteredItems}` with `stages={currentStages}` unchanged (L145-154); both iterate `stages.map` first (KanbanBoard.tsx:53, ListView.tsx:82), so every stage column/group renders even when its filtered subset is empty.
- **AC-11** ✅ When `trimmedQuery && filteredItems.length === 0`, a muted `No items match "<q>"` line renders above the views (L138-142).
- **AC-12** ✅ `onMoveItem={moveItem}` wiring unchanged; drag calls `moveItem(itemId, stage)` on the live `items` array regardless of the filter.
- **AC-13** ✅ `onOpenItem={openItem}` and `onOpenStage={openStage}` unchanged; `ItemDetailDialog` / `StageDetailDialog` mounted with the same props (L156-186).
- **AC-14** ✅ "Add item" button still calls `openNewItem`; `handleItemCreated` (from `useWorkflowItems`) appends to `items`. Nothing clears `query` on create — visibility of the new item depends solely on AC-6.
- **AC-15** ✅ `const [query, setQuery] = useState('')` — no `localStorage`/URL/cookie writes anywhere for the query (L29).
- **AC-16** ✅ `useEffect` keyed on `[workflowId]` calls `setQuery('')` on workflow change (L50-53).
- **AC-17** ✅ Reload → `useState('')` initial value → query is empty; no rehydration path.
- **AC-18** ✅ `onKeyDown` clears the query and `stopPropagation`s **only** when `query !== ''`; otherwise `Escape` bubbles up (L105-110).
- **AC-19** ✅ No global listeners, no `⌘K`/`/` handler anywhere in the file.
- **AC-20** ✅ Clear button has `aria-label="Clear filter"` and is a focusable `<Button type="button">` (L114-123).
- **AC-21** ✅ With empty `query`, `trimmedQuery` is empty → `filteredItems === items` (early return in `useMemo`); views receive the same array as before and the "No items match" line is gated on `trimmedQuery`.
- **AC-22** ✅ `updateViewMode` (L64-67) and `readWorkflowViewMode`/`writeWorkflowViewMode` usage unchanged; only the `workflowId` effect resets `query`, not the view-mode change, so toggling Kanban↔List preserves the active query.

Verdict: all 22 acceptance criteria pass. `npx tsc --noEmit` is clean. No follow-ups.

