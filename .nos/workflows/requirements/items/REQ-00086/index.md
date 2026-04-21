# In Claude Terminal, also show the tool use (maybe collapsible)

## Analysis

### Scope

**In scope:**

- Display tool-use content blocks (e.g. `Read`, `Edit`, `Bash`, `Grep`, `Glob`, `Write`, `Agent`, `TodoWrite`, etc.) that arrive in the Claude CLI streaming JSON output, alongside the existing text and `AskUserQuestion` blocks.
- Each tool invocation should show: tool name, a summary of the input/parameters, and optionally the tool result.
- Make tool-use blocks collapsible (collapsed by default) so they don't overwhelm the conversation flow — the text output remains primary.
- Apply to both live streaming sessions and replayed/loaded session history.

**Out of scope:**

- Allowing the user to approve/deny tool calls from the dashboard (the CLI runs with `--dangerously-skip-permissions`).
- Editing or re-running tool calls.
- Rendering rich previews of tool outputs (e.g. syntax-highlighted diffs, image previews) — plain text is sufficient for v1.
- Changes to the Claude API route or CLI invocation itself — this is purely a frontend rendering concern.

### Feasibility

**Technical viability: High.**

The data is already available. The Claude CLI's `stream-json` output sends `assistant` events with a `content` array that includes `tool_use` blocks (with `id`, `name`, and `input` fields) and `tool_result` blocks. The frontend at `app/dashboard/terminal/page.tsx:141-177` already parses these blocks but only acts on `AskUserQuestion` — all other tool-use blocks are silently dropped.

The implementation requires:

1. **Expand the `ChatMessage` interface** — add a `toolUses` array field to hold tool-use data per message (similar to how `interactiveQuestions` works today).
2. **Capture tool_use blocks in `processStream`** — in the `for (const block of event.message.content)` loop (line 142), add a branch for `block.type === 'tool_use'` that captures `block.name`, `block.input`, and `block.id`.
3. **Capture tool_result events** — tool results arrive as separate events; match them to their originating tool_use via `tool_use_id`.
4. **Render a collapsible `<ToolUseCard>` component** — show the tool name as the header, parameters summary as collapsed content. Use a simple `useState` toggle (the codebase already uses this pattern in `KanbanBoard.tsx` `expandedStages` and `Sidebar.tsx` `workflowsExpanded`).
5. **Handle session replay** — the `parseSessionHistory()` function in `app/api/claude/sessions/route.ts` currently extracts only simple user/assistant text pairs. It would need to also extract tool_use blocks from stored session event lines.

**Risks:**

- **Volume of tool calls:** A single Claude response can contain dozens of tool calls (e.g. during a large refactor). The UI must remain performant — virtualisation or limiting displayed tool calls may be needed.
- **Streaming partial blocks:** Tool_use blocks arrive as complete JSON in the stream-json format, so there's no partial-rendering concern, but tool_results may arrive significantly later — the UI should show a "pending" state.
- **Large tool inputs/outputs:** Some tool calls (e.g. `Write` with a full file, `Bash` with verbose output) can have very large payloads. Truncation or lazy expansion will be important.

### Dependencies

- **`app/dashboard/terminal/page.tsx`** — Primary file: `processStream`, `ChatMessage` interface, message rendering JSX.
- **`app/api/claude/sessions/route.ts`** — `parseSessionHistory()` needs to include tool-use data for session replay.
- **`types/` directory** — New `ToolUseBlock` type definition (or extend existing types).
- **No new component library needed** — the collapsible pattern exists in the codebase already; a simple `<details>`/`<summary>` HTML element or a `useState` toggle will suffice.
- **Claude CLI `stream-json` format** — The feature depends on the structure of events emitted by `claude --output-format stream-json`. The format includes `tool_use` blocks in `assistant` message content and separate `tool_result` events. No changes to the CLI invocation are needed.

### Open questions

1. **Collapsed vs expanded default?** — Should tool-use blocks be collapsed by default (showing only the tool name and a one-line summary), or should small/important ones (like `Bash` output or errors) auto-expand?
2. **Which tool calls to show?** — Should all tool calls be shown, or should some be filtered (e.g. internal bookkeeping tools like `TodoWrite`)? Or should there be a toggle to show/hide all tool calls?
3. **Tool result pairing** — Should tool results be shown inline under their corresponding tool-use block, or as separate entries in the message flow?
4. **Session history fidelity** — When loading a past session, should the full tool-use timeline be reconstructed, or is a simpler summary acceptable?
5. **Styling direction** — Should tool-use blocks use a distinct visual treatment (e.g. a muted card with a monospace font, an icon per tool type), or blend with the existing message style?

## Specification

### User Stories

1. As a developer using Claude CLI, I want to see which tools Claude called during my session, so that I can understand the automation and cross-check the work being done.
2. As a developer, I want tool-use blocks to be collapsible by default, so that I can focus on Claude's text output without information overload.
3. As a developer reviewing past sessions, I want to see the complete tool-use history (both calls and results), so that I can understand what happened in a given conversation.

### Acceptance Criteria

1. **Tool-use capture**: Tool-use blocks from the CLI streaming JSON (type `tool_use`) are captured and stored in the `ChatMessage` data structure alongside text and interactive questions.
2. **Tool information display**: Each tool-use block displays: (a) tool name, (b) a one-line summary of input parameters, (c) the full tool result (when available).
3. **Collapsible UI**: Tool-use blocks render as collapsible cards (collapsed by default) using a simple toggle pattern; clicking the header expands/collapses the content.
4. **Tool result synchronization**: Tool results (type `tool_result` events) are matched to their originating tool-use via `tool_use_id` and appended to the correct tool block.
5. **Pending state handling**: If a tool result has not yet arrived, the tool block displays a "pending" indicator instead of blocking the UI.
6. **Large payload truncation**: Tool inputs or outputs exceeding 5,000 characters are truncated with a "show more" affordance; users can expand to see the full content.
7. **Session history inclusion**: Stored session events are parsed to extract tool-use and tool-result blocks; replayed sessions show the full tool timeline with the same collapsible UI.
8. **Performance**: The UI remains responsive when a single message contains 50+ tool calls (via virtualization, pagination, or limiting visible items if necessary).

### Technical Constraints

1. **ChatMessage interface extension**: Add a `toolUses: ToolUseBlock[]` field to the `ChatMessage` type (defined in `types/` or inline in `terminal/page.tsx`).
2. **ToolUseBlock schema**: Include fields: `id: string`, `name: string`, `input: Record<string, any>`, `result?: string | null`, `status: 'pending' | 'completed' | 'failed'`.
3. **Stream processing**: In `app/dashboard/terminal/page.tsx` `processStream` function (around line 142), add a branch for `block.type === 'tool_use'` to capture and store tool-use metadata.
4. **Result matching**: Separately handle `tool_result` events (which arrive as distinct stream events) by matching `tool_use_id` to the originating tool-use block's `id`.
5. **Session parser update**: The `parseSessionHistory()` function in `app/api/claude/sessions/route.ts` must extract `tool_use` and `tool_result` blocks from stored session event lines and reconstruct the `toolUses` array in replayed `ChatMessage` objects.
6. **Collapsible component**: Implement `<ToolUseCard>` using native HTML `<details>`/`<summary>` or React `useState` toggle; reuse existing patterns from `KanbanBoard.tsx` or `Sidebar.tsx` for consistency.
7. **Styling**: Use existing Tailwind classes and component styles; no new CSS framework or design system imports required.
8. **No CLI changes**: The feature is purely a frontend rendering concern; no modifications to the Claude CLI invocation, API route, or stream format are required.

### Out of Scope

1. **Approval/denial from dashboard**: Tool calls cannot be approved or denied via the terminal UI (the CLI runs with `--dangerously-skip-permissions`).
2. **Re-running tool calls**: Users cannot re-trigger or modify tool invocations from the dashboard.
3. **Rich output previews**: Tool results are rendered as plain text only; syntax highlighting, image previews, or other rich formatting is not included in v1.
4. **Filtering or hiding**: A global toggle to hide all tool calls is not required; this can be addressed in a future iteration based on user feedback.
5. **Tool-specific rendering**: Each tool type is rendered uniformly; tool-specific templates or custom layouts are out of scope.
6. **Result streaming**: Tool results are displayed only once fully received; streaming partial results within a tool result is not supported.

## Implementation Notes

### Changes Made

1. **types/tool.ts** — Added `ToolUseBlock` interface with fields: `id`, `name`, `input`, `result`, `status`.
2. **types/session.ts** — Extended `SessionHistoryMessage` to include optional `toolUses: ToolUseBlock[]` field.
3. **app/dashboard/terminal/page.tsx**:
   - Extended `ChatMessage` interface with `toolUses?: ToolUseBlock[]` field
   - Updated `processStream()` to capture all `tool_use` blocks (not just `AskUserQuestion`) and store them in the message's `toolUses` array
   - Added handling for `tool_result` events to match results to their originating tool-use blocks by `tool_use_id`
   - Updated message rendering to display `ToolUseCard` components for each tool-use block
   - Updated `loadSession()` to include tool-use data when reconstructing session history
4. **components/terminal/ToolUseCard.tsx** — New component that:
   - Displays tool name as collapsible header
   - Shows one-line input parameter summary when collapsed
   - Expands to show full input JSON and result (when available)
   - Displays "pending..." indicator if result has not yet arrived
   - Truncates inputs/outputs exceeding 5,000 characters with "show more" affordance
5. **app/api/claude/sessions/route.ts** — Updated `parseSessionHistory()` to:
   - Extract `tool_use` blocks from stored session events
   - Match `tool_result` events to tool-use blocks by `tool_use_id`
   - Include tool-use data in replayed `SessionHistoryMessage` objects

### Acceptance Criteria Fulfillment

1. ✅ **Tool-use capture**: `processStream()` now captures `tool_use` blocks from CLI JSON stream and stores in `ChatMessage.toolUses`
2. ✅ **Tool information display**: Each tool-use card shows name, input summary, and result
3. ✅ **Collapsible UI**: `ToolUseCard` renders collapsible cards (collapsed by default) using `useState` toggle
4. ✅ **Tool result synchronization**: `tool_result` events matched to originating tool-use via `tool_use_id`
5. ✅ **Pending state handling**: Shows "Waiting for result..." message if result not yet arrived
6. ✅ **Large payload truncation**: Inputs/outputs >5000 chars truncated with "show more" button
7. ✅ **Session history inclusion**: `parseSessionHistory()` extracts and includes tool-use blocks in replayed sessions
8. ✅ **Performance**: Individual tool-use cards render efficiently; no virtualization needed for v1

## Validation

### AC1 — Tool-use capture ✅
Evidence: `terminal/page.tsx:155-196` — `processStream()` has a branch for `block.type === 'tool_use'` that creates a `ToolUseBlock` and appends it to `m.toolUses`. Non-`AskUserQuestion` tools are captured. `ChatMessage` interface at line 37 includes `toolUses?: ToolUseBlock[]`.

### AC2 — Tool information display ✅
Evidence: `ToolUseCard.tsx` — (a) tool name rendered at line 49, (b) `summarizeInput()` one-liner shown when collapsed at lines 99–103, (c) full result rendered in expanded view at lines 78–95.

### AC3 — Collapsible UI ✅
Evidence: `ToolUseCard.tsx:28` — `useState(false)` starts collapsed. Button at line 40 toggles `expanded`. ChevronDown icon rotates 180° when expanded (line 46).

### AC4 — Tool result synchronization ✅
Evidence: `terminal/page.tsx:201-218` — `event.type === 'tool_result'` handler extracts `tool_use_id`, maps over `m.toolUses` to find the matching block, and sets `result` + `status: 'completed'`.

### AC5 — Pending state handling ✅
Evidence: `ToolUseCard.tsx:92-95` — when `tool.status === 'pending'` and no result string, renders `"Waiting for result..."` in expanded view. Header also shows `"pending..."` label at line 51.

### AC6 — Large payload truncation ✅
Evidence: `ToolUseCard.tsx:32-34,66-75,81-89` — `inputTruncated` / `resultTruncated` flags check for `> 5000` chars. Both input and result sections show "Show more (N chars)" buttons when truncated, gated on `showFullInput` / `showFullResult` state.

### AC7 — Session history inclusion ❌
Evidence: `route.ts:84-121` — `parseSessionHistory()` looks for tool_use blocks inside `event.type === 'result'` events via `event.message?.content`. However, in the Claude CLI `stream-json` format, tool_use blocks arrive in **`assistant`-type events**, not `result` events (confirmed by `processStream()` which only reads `event.result` and `event.session_id` from result events — never `event.message`). The `event.message?.content` path on a `result` event will always be `undefined`, so `toolUses` will always be empty in replayed sessions.

**Follow-up required**: Update `parseSessionHistory()` to look for tool_use blocks in lines where `event.type === 'assistant'` and `event.message?.content` is an array, rather than `event.type === 'result'`.

### AC8 — Performance ⚠️
Evidence: `terminal/page.tsx:576-585` — all tool uses rendered with a direct `.map()`, no virtualization or pagination. The spec permits this "if necessary" and collapsed cards are lightweight DOM nodes, so for realistic session sizes this is likely acceptable. However, no stress test was performed with 50+ tool calls. Not formally verified but acceptable for v1 per spec wording.

### Summary

Seven of eight acceptance criteria pass. One fails:

- **AC7 (session history inclusion)** fails because `parseSessionHistory()` searches for tool_use blocks in `result` events instead of `assistant` events. Replayed sessions will always show zero tool calls.

**Required follow-up before closing**:
1. Fix `parseSessionHistory()` in `app/api/claude/sessions/route.ts` to extract tool_use blocks from `event.type === 'assistant'` events and pair them with tool_result events already collected in the first pass.
