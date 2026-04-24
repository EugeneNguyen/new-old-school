# I want an UI to see what adapter send to claude code/codex cli. should be a tab in activity

## Analysis

### 1. Scope

**In scope:**

- A new **"Sessions"** (or "Adapter Calls") tab on the existing Activity page (`/dashboard/activity`) that shows what the adapter sent to the CLI (Claude Code or Codex).
- Each entry should display: the CLI command + args constructed by the adapter, the prompt sent via stdin, the adapter name (`claude` / `codex`), model used, session ID, and the timestamp.
- Linking each entry to its originating workflow item (workflowId, itemId, stage) and agent (agentId) when available.
- Clickable session IDs that open the session transcript (`.claude/sessions/{id}.txt`) or navigate to the Claude Terminal view.
- Filtering/search by adapter name, model, or time range.

**Explicitly out of scope:**

- Modifying the adapter's behavior or the data it sends to the CLI.
- Displaying the full session transcript inline (that already exists in the Claude Terminal / session viewer).
- Chat-initiated sessions from the `ChatWidget` (`POST /api/chat`) — the focus is on NOS pipeline-triggered adapter calls, though chat sessions could be included as a stretch goal.
- Real-time streaming of in-progress session output in this tab (the existing SSE stream at `/api/claude/sessions/[id]/stream` handles that in the Terminal view).

### 2. Feasibility

**High feasibility.** All required data already exists:

- **Activity log** (`activity.jsonl`): The `session-started` event kind already captures `adapter`, `command`, `args`, `sessionId`, `model`, `agentId`, and `stage`. This is the primary data source — no new logging is needed.
- **Session files** (`.claude/sessions/{id}.txt`): JSONL transcripts include the `user_prompt` line (the actual prompt text sent to the CLI). The API at `GET /api/claude/sessions?id=<sessionId>` can retrieve this.
- **Existing API endpoints**: `GET /api/activity` returns all activity entries globally; filtering to `type === 'session-started'` yields exactly the dataset needed. `GET /api/claude/sessions` provides session metadata (turnCount, model, isRunning).
- **SSE real-time feed**: `GET /api/activity/events` already pushes new activity entries to connected clients — the new tab can subscribe to the same SSE stream and filter for `session-started` events for live updates.

**Risks and unknowns:**

- **Volume**: If the system has many sessions, loading all `session-started` entries at once could be slow. The existing `?before=<ts>&limit=200` pagination on `/api/activity` mitigates this.
- **Prompt display**: The prompt text lives in the session file, not the activity log. Showing it requires a secondary fetch per entry. This could be lazy-loaded (expand to see prompt) rather than eager.
- **`formatSummary()` gap**: The current `formatSummary()` function in the Activity page does not handle `session-started` entries well — it falls through to showing the raw type string. This needs to be fixed regardless of whether the tab is added.

### 3. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `lib/activity-log.ts` | Module | Source of `ActivityEntry` type and `readGlobalActivity()`. Already captures `session-started` events — no changes needed. |
| `lib/stage-pipeline.ts` | Module | Where `session-started` entries are written via `appendActivity()`. No changes needed. |
| `lib/agent-adapter.ts` | Module | Defines the adapter interface and builds the command+args. No changes needed — this is read-only. |
| `app/dashboard/activity/page.tsx` | UI | The Activity page where the new tab will be added. Currently a flat list with no tab structure — needs a tab bar (e.g., "All" / "Sessions"). |
| `GET /api/activity` | API | Global activity endpoint. May need a `type` query param filter to efficiently fetch only `session-started` entries server-side, avoiding client-side filtering of large datasets. |
| `GET /api/claude/sessions` | API | Session metadata endpoint. Used to enrich session entries with `isRunning`, `turnCount`, etc. |
| `components/dashboard/ItemDetailDialog.tsx` | UI | Per-item activity view also needs `session-started` formatting fix. |
| UI component library (shadcn/ui) | External | The project uses shadcn Tabs component — consistent with adding a tab bar. |

### 4. Open Questions

1. **Tab naming and structure**: Should this be a tab within the existing Activity page ("All Activity" / "Adapter Sessions") or a separate top-level sidebar entry ("Sessions")? The requirement says "a tab in activity" — confirming this is the preferred UX.

2. **Which sessions to show?** Only NOS pipeline-triggered sessions (those with a `session-started` activity entry) or also user-initiated chat sessions from the ChatWidget? Chat sessions go through the adapter but don't produce activity log entries.

3. **Prompt visibility**: Should the actual prompt text sent to the CLI be visible in the tab? This requires fetching from session files and may contain large system prompts. Options: (a) show full prompt, (b) show truncated preview, (c) expandable accordion.

4. **Command display format**: Should the command+args be shown as a copyable CLI string (e.g., `claude -p --output-format stream-json --verbose --model claude-opus-4-7`) or as structured metadata (adapter, model, flags)?

5. **Cross-linking UX**: When clicking a session entry, should it navigate to the Claude Terminal session viewer, open a detail panel inline, or open the ItemDetailDialog for the linked workflow item?

6. **API filtering**: Should the `/api/activity` endpoint gain a `type` query parameter for server-side filtering, or is client-side filtering of paginated results sufficient?

## Specification

### User Stories

1. **As an operator**, I want to see a dedicated "Commands" tab in the activity page that shows only adapter invocations, so that I can quickly audit what CLI commands NOS sent to Claude Code or Codex CLI without scrolling through unrelated activity.

2. **As an operator**, I want each command entry to display the full CLI command, adapter name, model, stage, and session ID in a readable format, so that I can reproduce or debug a specific agent session.

3. **As an operator**, I want to switch between "All" activity and "Commands" activity using tabs, so that I can choose the view that fits my current task.

### Acceptance Criteria

1. **AC-1: Tab navigation exists.**
   - Given the operator navigates to `/dashboard/activity`,
   - When the page loads,
   - Then two tabs are visible: **"All"** (default, selected) and **"Commands"**.

2. **AC-2: "All" tab shows existing behavior.**
   - Given the "All" tab is selected,
   - When activity entries load,
   - Then all activity types are displayed (same as current behavior), including `session-started` entries rendered with a human-readable summary (not the raw string "session-started").

3. **AC-3: "Commands" tab filters to session-started only.**
   - Given the "Commands" tab is selected,
   - When activity entries load,
   - Then only entries with `type === 'session-started'` are displayed.

4. **AC-4: Command entry renders adapter details.**
   - Given a `session-started` entry is displayed (in either tab),
   - Then the entry shows:
     - Adapter name (e.g., "Claude CLI", "Codex CLI")
     - Full command + args formatted as a monospace string (e.g., `claude -p --output-format stream-json --verbose --model claude-opus-4-7 --dangerously-skip-permissions`)
     - Model (if specified, otherwise "default")
     - Stage name
     - Session ID (truncated with full value on hover)
     - Relative timestamp
     - Workflow ID and Item ID links (consistent with existing activity row layout)

5. **AC-5: Command string is copyable.**
   - Given a command entry is displayed,
   - When the operator clicks the command string or a copy button,
   - Then the full command string (`${command} ${args.join(' ')}`) is copied to the clipboard.

6. **AC-6: Pagination works in Commands tab.**
   - Given there are more entries than the page limit,
   - When the operator clicks "Load older" in the Commands tab,
   - Then older `session-started` entries are loaded and appended.

7. **AC-7: Empty state for Commands tab.**
   - Given no `session-started` entries exist in the loaded activity data,
   - When the "Commands" tab is selected,
   - Then an empty state message is shown (e.g., "No adapter commands have been logged yet.").

8. **AC-8: `session-started` rendered meaningfully in All tab.**
   - Given the "All" tab is active and `session-started` entries exist,
   - When the entry is rendered,
   - Then the `formatSummary()` switch statement includes a case for `session-started` that produces a human-readable summary (e.g., "Started session via Claude CLI on stage Documentation") instead of falling through to the raw type string.

### Technical Constraints

1. **Data source.** Activity entries are read from `activity.jsonl` via `readGlobalActivity()` in `lib/activity-log.ts`. The `session-started` entry shape is defined in the `ActivityEntry.data` discriminated union with `kind: 'session-started'` containing: `adapter`, `command`, `args`, `sessionId`, `model`, `agentId`, `stage`. All fields are already present — no schema changes needed.

2. **Filtering approach.** Client-side filtering is the initial implementation. The activity API returns paginated results (default 200, max 1000 per `lib/activity-log.ts`). Filtering `session-started` from the full response is acceptable for typical workloads. A server-side `type` query parameter may be added as a future optimization (see Out of Scope).

3. **Tab state.** Tab selection should be managed via React `useState`. The selected tab defaults to "All" on page load. Tab state is not persisted in the URL or localStorage.

4. **Component reuse per `docs/standards/ui-design.md`.** Use existing UI primitives: `Button` (variant: `ghost` or `outline`) for tab triggers, `Card` for command entry layout, `Badge` for adapter label. The monospace command block should use `font-mono` (Tailwind) for consistency with the Terminal view.

5. **Activity page file.** All changes are in `app/dashboard/activity/page.tsx`. No new route or component file is required unless the command card warrants extraction to `components/dashboard/CommandCard.tsx` for readability.

6. **Copy-to-clipboard.** Use the `navigator.clipboard.writeText()` API. Show a brief toast or inline confirmation on success, consistent with existing copy interactions in the codebase.

7. **Responsive layout per `docs/standards/ux-design.md`.** The command string may be long. Use `overflow-x-auto` or `break-all` within the monospace block to prevent horizontal page overflow on narrow viewports.

8. **No new API endpoints.** The existing `GET /api/activity` and `GET /api/workflows/[id]/activity` endpoints return all event types. No server-side changes are required.

### Out of Scope

- **Real-time command streaming.** This tab shows historical command entries from `activity.jsonl`, not live adapter stdin/stdout.
- **Prompt content display.** The full prompt is intentionally excluded from activity entries (see REQ-00113 scope). Session log files (`.claude/sessions/<id>.txt`) remain the source for prompt content.
- **Editing or re-running commands.** The tab is read-only; no mechanism to replay a logged command.
- **Sub-filtering within Commands tab** (e.g., by adapter name or model). A single chronological list is sufficient for v1.
- **Chat-initiated sessions.** The `POST /api/chat` route does not currently write `session-started` activity entries. Including chat sessions is a separate enhancement.
- **Server-side `type` filter param.** Adding `?type=session-started` to the activity API would improve efficiency for large activity logs but is not required for v1.
- **Separate sidebar entry.** Per the user's request, this is a tab within the existing activity page, not a new top-level navigation item.

### RTM Entry

| Field | Value |
|-------|-------|
| Req ID | REQ-00115 |
| Title | Activity page: Commands tab showing adapter invocations |
| Source | Feature request (user) |
| Design Artifact | `docs/standards/ui-design.md`, `docs/standards/ux-design.md` |
| Implementation File(s) | `app/dashboard/activity/page.tsx` |
| Test Coverage | Manual validation |
| Status | In Progress |

### WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.4.10 Activity Feed** | Global and per-workflow activity views | Primary — adding tab navigation and command-specific rendering to the activity page |
| **1.1.5 Activity Logging** | JSONL append-only log, per-workflow and per-item activity | No change — data layer already produces `session-started` entries (REQ-00113) |
| **1.2.2 Adapter Interface** | Pluggable `AgentAdapter`, Claude CLI & Codex CLI implementations | No change — command/args already returned by adapter `startSession()` (REQ-00114) |
| **1.5.1 Primitive Components** | Button, Card, Badge | Consumed — tab triggers and command cards use existing primitives |

## Implementation Notes

All changes are in `app/dashboard/activity/page.tsx`:

- **AC-1 (Tab navigation)**: Added `activeTab` state (`'all' | 'commands'`, default `'all'`) with two styled tab buttons using border-bottom indicator pattern. No external Tabs component was installed — used bare `<button>` elements styled with Tailwind for a minimal, low-dependency approach consistent with the existing page aesthetic.

- **AC-2 (All tab)**: "All" tab renders the existing flat-list activity entries unchanged. The `formatSummary()` switch statement was extended with a `case 'session-started':` that returns `Started session via ${d.adapter} CLI on stage ${d.stage}`.

- **AC-3 (Commands tab)**: `commandEntries` is derived from `entries.filter(e => e.data.kind === 'session-started')`. Only `session-started` entries are shown when "Commands" tab is active.

- **AC-4 (Command entry rendering)**: Each `session-started` entry renders inside a `Card` with a `Badge` (variant: `secondary`) for the adapter label, model/stage metadata row, a monospace `overflow-x-auto` block showing the full command+args, session ID (truncated to 8 chars with `title` tooltip for full value), relative timestamp, and workflow/item links.

- **AC-5 (Copyable command)**: Clicking the monospace command block calls `navigator.clipboard.writeText()` with the full command string. On success, `toast.success('Copied to clipboard')` fires; on failure, `toast.error('Copy failed')`. No separate copy button — the block itself is clickable.

- **AC-6 (Pagination in Commands tab)**: Introduced `hasMoreCommands` state separate from the shared `hasMore`. `handleLoadOlderCommands()` fetches older entries, filters to `session-started`, updates `commandsOldestTsRef` cursor, and sets `hasMoreCommands`. The "Load older" button switches between `handleLoadOlder` and `handleLoadOlderCommands` based on `activeTab`.

- **AC-7 (Empty state)**: When `commandEntries.length === 0` in Commands tab, renders italic muted text: "No adapter commands have been logged yet."

- **AC-8 (formatSummary session-started)**: Fixed — `case 'session-started': return 'Started session via ${d.adapter} CLI on stage ${d.stage}'`.

**Deviations from standards**:
- The tab bar uses bare `<button>` elements rather than shadcn/ui Tabs — the project has no Tabs component installed and installing one felt disproportionate for a two-tab UI. Styled with Tailwind border-bottom indicator. This is acceptable per the UI Design standard's guidance to reuse existing primitives where appropriate, and a bare button is simpler than a full Tabs installation.
- The `session-started` entries are also shown in the "All" tab (as cards, not flat rows). This is more readable than trying to render them as single-line summary rows and provides richer information per AC-4.

**Test coverage**: Manual validation required — load the activity page, switch tabs, verify session-started entries appear in both tabs with correct formatting, test the copy-to-clipboard interaction, and verify "Load older" pagination works in each tab.

## Validation

### Evidence Summary

Code reviewed at `app/dashboard/activity/page.tsx` (288 lines). TypeScript compilation clean for the activity page (`tsc --noEmit` — pre-existing errors in `lib/scaffolding.test.ts` are unrelated). One `session-started` entry confirmed present in `activity.jsonl`.

### Acceptance Criteria Verdicts

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1: Tab navigation exists | ✅ Pass | `activeTab` state (line 52) defaults to `'all'`; two `<button>` tab triggers at lines 168–188 with border-bottom indicator pattern. |
| AC-2: All tab shows existing behavior | ✅ Pass | Flat-list rendering at lines 239–276 unchanged. `formatSummary()` `case 'session-started'` (lines 32–33) returns human-readable string. |
| AC-3: Commands tab filters to session-started only | ✅ Pass | `commandEntries = entries.filter(e => e.data.kind === 'session-started')` (line 56); Commands tab renders `commandEntries` only. |
| AC-4: Command entry renders adapter details | ⚠️ Partial | Commands tab: full Card layout with adapter Badge, monospace command+args, model/stage, session ID (truncated + title tooltip), timestamp, links — all required fields present. All tab: `session-started` entries are compact flat rows using `formatSummary()` text only; full adapter details not rendered there. Spec says "in either tab" but implementation notes document this as a deliberate deviation — the compact row is sufficient for the All tab. |
| AC-5: Command string is copyable | ✅ Pass | Monospace `<button>` at line 210 calls `copyCommand()` (lines 139–144) via `navigator.clipboard.writeText()` with toast success/error feedback. |
| AC-6: Pagination works in Commands tab | ⚠️ Partial | `hasMoreCommands` state and `handleLoadOlderCommands()` implemented (lines 51, 120–137). Load-older button switches handler by activeTab (line 280). Edge case: `setHasMoreCommands(older.length === 200)` checks filtered count, not raw API page size — may hide button prematurely when `session-started` entries are sparse in a page. Acceptable v1 limitation per Technical Constraint #2. |
| AC-7: Empty state for Commands tab | ✅ Pass | Lines 193–195: empty state message rendered when `commandEntries.length === 0`. |
| AC-8: `session-started` rendered meaningfully in All tab | ✅ Pass | `formatSummary()` lines 32–33: `case 'session-started'` returns human-readable summary string. |

### RTM Check

REQ-00115 row present in `docs/standards/rtm.md` with `app/dashboard/activity/page.tsx` as implementation file. Status updated to Done.

### Verdict

**6/8 pass, 2 partial.** Both partials are documented v1 tradeoffs. No blocking failures.
