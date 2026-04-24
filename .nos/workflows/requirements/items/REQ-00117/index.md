# Activity > command > should show also the prompt that you sent in

## Analysis

### Background

REQ-00115 (Commands tab) and the original REQ-00117 (prompt display) were previously implemented and validated, but the code changes to `app/dashboard/activity/page.tsx` were **never committed to the repository**. The validation commits (`bd6b378`, `ffe4eca`) only wrote to `index.md` and `docs/standards/rtm.md` — the actual UI implementation was lost when the working tree was cleaned up after branch-protection blocked the push. The current activity page is a flat list with no tabs.

The user's new comment — "Bring back the tab of the activity and command" — requests re-implementing:
1. The **tabbed UI** (All / Commands) from REQ-00115.
2. The **prompt display** (show/hide toggle per command card) from the original REQ-00117.

### Scope

**In scope:**
- Add a tab bar to the Activity page with **All** (default) and **Commands** tabs.
- In the Commands tab, filter to `session-started` entries and render them as cards showing: adapter, command + args, model, stage, sessionId, and workflow/item links.
- Add a `prompt?: string` field to the `session-started` variant in `ActivityEntry`.
- Pass `fullPrompt` to `appendActivity()` in `lib/stage-pipeline.ts`.
- In the Commands tab, render a "Show prompt" / "Hide prompt" toggle per card (collapsed by default).
- `formatSummary()` should handle the `session-started` case instead of falling through to the default.

**Out of scope:**
- Changes to the All tab's compact row rendering.
- Prompt display for chat-route sessions (only stage-pipeline sessions).
- Backfilling prompt data into existing `activity.jsonl` entries.
- Prompt truncation or Markdown rendering.
- Command replay or re-run functionality.

### Feasibility

**Technical viability: High.** All pieces are straightforward:
- `fullPrompt` (a string) is already computed and in scope at the `appendActivity` call site (`lib/stage-pipeline.ts:50–64`). Adding it to the data payload is a one-line change.
- The `ActivityEntry` discriminated union (`lib/activity-log.ts:35`) just needs `prompt?: string` appended to the `session-started` variant.
- The tab UI is client-side state + filtering — no new API endpoints needed.
- The Commands tab card layout and prompt toggle are standard React state (`useState<Set<number>>` for expanded indices).

**Risks:**
- **Log size**: Storing full prompts (which can be multi-KB) in `activity.jsonl` will increase log file sizes. Acceptable for a dev-server tool, but worth noting.
- **Backwards compatibility**: The `prompt` field must be optional so existing `session-started` entries (which lack it) continue to parse. The UI must guard on `prompt !== undefined`.

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `lib/activity-log.ts` | Code (type change) | Add `prompt?: string` to `session-started` data variant |
| `lib/stage-pipeline.ts` | Code (data change) | Pass `prompt: fullPrompt` in `appendActivity()` call |
| `app/dashboard/activity/page.tsx` | Code (UI rewrite) | Add tabs, command cards, prompt toggle |
| `@/components/ui/button` | Existing UI component | Already used in the page |
| REQ-00115 spec (in comments) | Reference | Original AC list for the Commands tab feature |

### Open questions

1. **Pagination in Commands tab** — Should the Commands tab have its own "Load older" pagination, or share the single fetch and filter client-side? Client-side filtering is simpler but may hide the Load-older button prematurely when `session-started` entries are sparse relative to the 200-entry page size. (Previous implementation used client-side filtering and accepted this as a v1 tradeoff.)
2. **Copy-to-clipboard** — The previous REQ-00115 spec included clicking a command block to copy it. Should this be re-included? It was accepted before but is a nice-to-have.

## Specification

### User stories

1. **US-1**: As an operator, I want the Activity page to have an "All" tab and a "Commands" tab so that I can quickly filter to adapter invocations without scanning the full activity stream.

2. **US-2**: As an operator, I want each command card in the Commands tab to show a "Show prompt" / "Hide prompt" toggle so that I can inspect the exact prompt that was sent to the agent without it cluttering the default view.

3. **US-3**: As an operator, I want the full prompt stored in the ActivityEntry so that it is available for inspection at any time after the session was triggered.

### Acceptance criteria

1. **AC-1 — Data model extension**: The `session-started` variant in the `ActivityEntry` discriminated union (`lib/activity-log.ts`) includes an optional `prompt?: string` field.
   - Given the `ActivityEntry` type definition
   - When a TypeScript consumer accesses `entry.data.prompt` on a `session-started` entry
   - Then the access compiles without error and the value is `string | undefined`.

2. **AC-2 — Prompt persistence**: `triggerStagePipeline()` in `lib/stage-pipeline.ts` passes `prompt: fullPrompt` in the `data` object of its `appendActivity()` call.
   - Given a stage pipeline trigger fires for a Todo item
   - When `appendActivity()` is called with `type: 'session-started'`
   - Then `data.prompt` equals the assembled `fullPrompt` string.

3. **AC-3 — Backwards compatibility**: Existing `session-started` entries in `activity.jsonl` that lack the `prompt` field continue to parse without errors. The UI guards on `prompt !== undefined` before rendering the toggle.
   - Given an `activity.jsonl` file containing legacy `session-started` entries without a `prompt` field
   - When the Activity page loads and renders
   - Then no runtime errors occur and no empty prompt sections are displayed.

4. **AC-4 — Tab bar**: The Activity page renders a tab bar with two tabs: **All** (default active) and **Commands**.
   - Given the operator navigates to `/dashboard/activity`
   - When the page loads
   - Then the "All" tab is selected and the full activity list is displayed.

5. **AC-5 — Commands tab filtering**: Selecting the "Commands" tab filters entries to only those with `type === 'session-started'` and renders them as cards.
   - Given the operator clicks the "Commands" tab
   - When the tab content renders
   - Then only `session-started` entries are shown, each as a card displaying: adapter, command + args, model, stage, sessionId, and links to the workflow/item.

6. **AC-6 — Prompt toggle default collapsed**: In the Commands tab, each card with a prompt shows a "Show prompt" button. The prompt section is hidden by default.
   - Given a command card has `data.prompt` defined
   - When the card first renders
   - Then the prompt text is not visible and a "Show prompt" button is displayed.

7. **AC-7 — Prompt toggle expand/collapse**: Clicking "Show prompt" reveals the prompt text; clicking "Hide prompt" collapses it.
   - Given the operator clicks "Show prompt" on a command card
   - When the prompt section expands
   - Then the full prompt text is rendered in a `<pre>` block with `whitespace-pre-wrap` and `overflow-x-auto`, and the button label changes to "Hide prompt".

8. **AC-8 — Absent prompt graceful**: Command cards for entries that lack `data.prompt` (legacy entries) do not render the toggle button.
   - Given a `session-started` entry where `data.prompt` is `undefined`
   - When the card renders
   - Then no "Show prompt" / "Hide prompt" button appears.

9. **AC-9 — All tab unchanged**: The All tab's compact row rendering is not altered by this change. The All tab continues to display all activity types in the existing row format.

10. **AC-10 — formatSummary handles session-started**: `formatSummary()` returns a human-readable string for `session-started` entries instead of falling through to the default case.
    - Given an entry with `kind: 'session-started'`
    - When `formatSummary()` is called
    - Then it returns a string including the adapter name and stage (e.g., `"Session started: claude → Analysis"`).

11. **AC-11 — TypeScript clean**: All three modified files (`lib/activity-log.ts`, `lib/stage-pipeline.ts`, `app/dashboard/activity/page.tsx`) compile with zero new TypeScript errors.

### Technical constraints

1. **TC-1 — Type location**: The `prompt?: string` field is added to the `session-started` variant at `lib/activity-log.ts:35`. The field must be optional to preserve backwards compatibility with existing JSONL entries.

2. **TC-2 — Prompt source**: The `fullPrompt` variable is already computed and in scope at `lib/stage-pipeline.ts:50–60`. It is passed as `prompt: fullPrompt` inside the `data` object of the `appendActivity()` call at approximately line 74–90.

3. **TC-3 — Client-side filtering**: The Commands tab filters the already-fetched `entries` array client-side (`entries.filter(e => e.type === 'session-started')`). No new API endpoint is required. Pagination uses the shared "Load older" mechanism, filtering client-side after fetch. This is accepted as a v1 tradeoff — sparse `session-started` entries may cause the Commands tab to appear emptier than the page size suggests.

4. **TC-4 — State management**: Expanded prompt indices are tracked via `useState<Set<number>>` initialised as an empty set. Toggling adds/removes the card index from the set.

5. **TC-5 — Prompt rendering**: Prompt text is rendered in a `<pre>` element with CSS classes `whitespace-pre-wrap overflow-x-auto font-mono text-xs` to preserve formatting while preventing horizontal overflow.

6. **TC-6 — Log size**: Storing full prompts (multi-KB strings) in `activity.jsonl` increases log file sizes. This is acceptable for a dev-server tool (per system architecture: local-only, file-based storage). No truncation or compression is applied.

7. **TC-7 — Existing UI components**: The tab bar uses the existing `Button` component (`@/components/ui/button`) with variant styling to indicate active/inactive tabs. No new UI component library additions are required.

### Out of scope

1. **OS-1 — Prompt assembly changes**: The `buildAgentPrompt()` function is not modified. The prompt is stored as-is from the existing `fullPrompt` variable.
2. **OS-2 — All tab modifications**: The All tab's compact row rendering is unchanged. No prompt display is added to the All tab.
3. **OS-3 — Backfilling**: Existing `session-started` entries in `activity.jsonl` are not backfilled with prompt data. Only new entries going forward will contain the `prompt` field.
4. **OS-4 — Chat-route sessions**: Prompt capture applies only to stage-pipeline sessions (`triggerStagePipeline`). Chat-route sessions (`/api/chat`) are excluded.
5. **OS-5 — Prompt truncation and Markdown rendering**: The prompt is displayed as plain preformatted text. No truncation, syntax highlighting, or Markdown rendering is applied.
6. **OS-6 — Command replay**: No mechanism to re-run or replay a command from the Commands tab is included.
7. **OS-7 — Copy-to-clipboard**: Clicking a command block to copy it is deferred as a nice-to-have for a future iteration.

### RTM entry

| Field | Value |
|-------|-------|
| Req ID | REQ-00117 |
| Title | Activity: show prompt sent to agent |
| Source | Feature request (user) |
| Design Artifact | `docs/standards/system-architecture.md`, `docs/standards/glossary.md` (ActivityEntry, Adapter) |
| Implementation Files | `lib/activity-log.ts`, `lib/stage-pipeline.ts`, `app/dashboard/activity/page.tsx` |
| Test Coverage | Manual validation — verify all 11 ACs against running dev server |
| Status | In Progress |

### WBS mapping

| WBS Package | Name | Relevance |
|-------------|------|-----------|
| 1.1.5 | Activity Logging | Extends the `ActivityEntry` type with `prompt` field; affects JSONL append-only log schema |
| 1.2.3 | Stage Pipeline Trigger | Modifies `triggerStagePipeline()` to pass `fullPrompt` to `appendActivity()` |
| 1.4.10 | Activity Feed | Adds tabbed UI (All / Commands), command cards, and prompt toggle to the Activity page |

## Implementation Notes

### Changes made

1. **`lib/activity-log.ts`** — Added `prompt?: string` to the `session-started` variant at line 35. The field is optional, preserving backwards compatibility with existing JSONL entries that lack the field.

2. **`lib/stage-pipeline.ts`** — Added `prompt: fullPrompt` to the `data` object in the `appendActivity()` call (inside `triggerStagePipeline()`). The `fullPrompt` variable is already in scope at that call site.

3. **`app/dashboard/activity/page.tsx`** — Complete rewrite of the page component:
   - Added `activeTab` state (`'all'` | `'commands'`) with a styled tab bar (border-b underline for active, muted text for inactive).
   - All tab renders the original compact row list unchanged.
   - Commands tab filters `entries.filter(e => e.type === 'session-started')` client-side and renders each as a card showing: adapter badge, command+args code block, model via badge, stage name, sessionId, relative timestamp, and a workflow/item link.
   - Added `expandedPrompts` state (`Set<number>`) to track which card prompts are expanded.
   - Prompt toggle renders only when `d.prompt !== undefined` — legacy entries without the field show no toggle.
   - Expanded prompt renders in `<pre>` with `whitespace-pre-wrap overflow-x-auto font-mono text-xs`.
   - `formatSummary()` now handles `session-started` explicitly (`"Session started: {adapter} → {stage}"`), removing the fallthrough to `entry.type`.

### Deviations from documented standards

- **TC-7 (UI component reuse)**: The tab bar uses a raw `<button>` element with CSS classes rather than the `Button` component from `@/components/ui/button`. The `Button` component lacks a tab-variant and adding one would be speculative — a plain `<button>` with Tailwind styling matches the existing component styling and achieves the required UX.
- **Load older in Commands tab**: The "Load older" button condition is simplified — it only shows in the Commands tab when `commandEntries.length > 0 && hasMore`. This is acceptable per TC-3's v1 tradeoff noting that sparse `session-started` entries may make the Commands tab appear emptier.

### Validation checklist

| AC | Status |
|----|--------|
| AC-1 Data model field | ✅ `lib/activity-log.ts:35` — `prompt?: string` in `session-started` variant |
| AC-2 Prompt persisted | ✅ `lib/stage-pipeline.ts` — `prompt: fullPrompt` in `appendActivity()` data |
| AC-3 Backwards compat | ✅ Field is optional; UI guard `d.prompt !== undefined` |
| AC-4 Tab bar | ✅ `activeTab` state, "All" default, underline active style |
| AC-5 Commands tab filtering | ✅ `commandEntries = entries.filter(e => e.type === 'session-started')` |
| AC-6 Prompt toggle default collapsed | ✅ `expandedPrompts` initialised as empty `Set` |
| AC-7 Prompt expand/collapse | ✅ Toggle reveals `<pre>` block; label toggles "Show"/"Hide prompt" |
| AC-8 Absent prompt graceful | ✅ `{d.prompt !== undefined && ...}` guard prevents toggle for legacy entries |
| AC-9 All tab unchanged | ✅ All-tab block renders original compact row format unmodified |
| AC-10 formatSummary handles session-started | ✅ Explicit `case 'session-started': return \`Session started: ${d.adapter} → ${d.stage}\`` |
| AC-11 TypeScript clean | ✅ `npx tsc --noEmit` produces zero new errors in the 3 modified files |

## Validation

Validated by reading all three implementation files and running `npx tsc --noEmit`.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 — Data model extension | ✅ | `lib/activity-log.ts:35` — `prompt?: string` present in `session-started` variant |
| AC-2 — Prompt persistence | ✅ | `lib/stage-pipeline.ts:89` — `prompt: fullPrompt` included in `appendActivity()` data object |
| AC-3 — Backwards compatibility | ✅ | Field is optional (`?`); UI guard `d.prompt !== undefined` at `page.tsx:245` prevents toggle on legacy entries |
| AC-4 — Tab bar | ✅ | `page.tsx:54` — `useState<Tab>('all')` default; tab bar at lines 138–159 with All and Commands buttons |
| AC-5 — Commands tab filtering | ✅ | `page.tsx:117` — `entries.filter(e => e.type === 'session-started')`; cards show adapter, command+args, model, stage, sessionId, workflow/item link |
| AC-6 — Prompt toggle default collapsed | ✅ | `page.tsx:55` — `expandedPrompts` initialised as `new Set()` (empty) |
| AC-7 — Prompt toggle expand/collapse | ✅ | `page.tsx:247–257` — `isExpanded` toggles button label and shows `<pre>` with `whitespace-pre-wrap overflow-x-auto font-mono text-xs` |
| AC-8 — Absent prompt graceful | ✅ | `page.tsx:245` — `{d.prompt !== undefined && ...}` guard; no toggle rendered for entries without prompt |
| AC-9 — All tab unchanged | ✅ | `page.tsx:161–205` — All tab block renders original compact row format, no modification |
| AC-10 — formatSummary handles session-started | ✅ | `page.tsx:31–32` — explicit `case 'session-started'` returns ``Session started: ${d.adapter} → ${d.stage}`` |
| AC-11 — TypeScript clean | ✅ | `npx tsc --noEmit` output contains only pre-existing errors in `lib/scaffolding.test.ts`; zero errors in the 3 modified files |

**Overall verdict: all 11 ACs pass. Ready to commit and push.**
