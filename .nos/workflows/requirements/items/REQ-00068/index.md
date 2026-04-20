Idea of this agent

* It has system prompt which instruct it how to interact with files inside .nos folder
* First is with workflows, stages, and item
* It can manage workflow, stages, can read item (not edit)

## Analysis

### 1. Scope

**In scope:**
- New "NOS Agent" chatbox UI component embedded in the workflow screen (`WorkflowItemsView.tsx` or a dedicated panel)
- New API endpoint (`/api/chat/nos`) for NOS-specific chat interactions
- NOS Agent system prompt file (e.g., `.nos/nos-agent-prompt.md`) instructing the agent how to interact with `.nos` folder contents
- Chat functionality to read workflows, stages, and items
- Display of current workflow/stage/item context within the chat

**Explicitly out of scope:**
- Editing items through the chat (requirement states "read only")
- Full terminal UI (already exists at `/dashboard/terminal`)
- Agent management CRUD (already exists at `/dashboard/agents`)
- Integration with existing ChatWidget FAB (this is a separate, dedicated NOS Agent chatbox)

### 2. Feasibility

**Technical viability:** HIGH
- The codebase already has a mature agent pattern via `lib/agent-adapter.ts` and `lib/agents-store.ts`
- SSE streaming for chat responses is already implemented in `ChatWidget.tsx` and the `/api/chat` route
- The NOS system prompt architecture (`.nos/system-prompt.md`) provides a template for how prompts are structured
- File-based storage for workflows/stages/items already exists and can be read programmatically

**Risks:**
1. **Context window overflow** - If the chat session accumulates many items or long item content, the prompt could grow large. Need to implement message history pruning or summarize context.
2. **Tool access scope creep** - The requirement says "read only" but defining "read" precisely is important (e.g., does reading include listing directory contents, grepping files, etc.?)
3. **Concurrent session handling** - Multiple users in the same workflow screen could trigger multiple NOS Agent sessions.

**Unknowns that need spiking:**
1. How should the NOS Agent be invoked? Should it use the existing Claude CLI adapter, or a dedicated backend-only approach?
2. What exactly can the agent do with workflows and stages? Can it list all items? Filter by stage? View item history?
3. Should the NOS Agent chat history be persisted? If so, where?

### 3. Dependencies

**Internal modules:**
- `lib/agent-adapter.ts` - Agent execution pattern
- `lib/agents-store.ts` - Agent storage/retrieval
- `components/dashboard/WorkflowItemsView.tsx` - Where to embed the chatbox
- `app/api/chat/route.ts` - Existing chat API pattern
- `.nos/system-prompt.md` - Template for NOS Agent system prompt

**Data structures:**
- `.nos/workflows/<workflowId>/items/<itemId>/index.md` - Item content
- `.nos/workflows/<workflowId>/items/<itemId>/meta.yml` - Item metadata (status, stage, comments)
- `.nos/workflows/<workflowId>/config/stages.yaml` - Stage configuration
- `.nos/workflows/<workflowId>/config.json` - Workflow configuration

**External systems:** None required (uses existing Claude CLI adapter pattern)

### 4. Open Questions

1. **Invocation method**: Should the NOS Agent use the existing `claude` CLI adapter (like stage agents) or be implemented as a backend-only service that reads files directly? Using the CLI adapter aligns with existing patterns but adds overhead; backend-only is leaner but requires different tool definitions.

2. **Read scope definition**: The requirement says "can read item (not edit)" but is ambiguous about:
   - Can it read multiple items at once (e.g., "show all items in this stage")?
   - Can it search across all items (grep, find)?
   - Can it read workflow configuration files directly?
   - Can it read the activity/audit log?

3. **Persistence**: Should chat history be stored? Options:
   - Not persisted (ephemeral, stateless per session)
   - Stored per workflow (e.g., `.nos/workflows/<id>/chat-history.jsonl`)
   - Stored in browser localStorage (like existing ChatWidget)

4. **System prompt location**: Should the NOS Agent system prompt live at:
   - `.nos/nos-agent-prompt.md` (new dedicated file)?
   - Part of the existing agent definitions in `.nos/agents/`?
   - A special built-in agent in the agents store?

5. **UI placement**: Where exactly should the chatbox appear?
   - Collapsible side panel in the workflow screen?
   - Floating widget (like ChatWidget)?
   - Dedicated tab within the workflow detail page?

6. **Item context display**: Should the chat always show the currently selected item context, or should the user be able to query arbitrary items/workflows?

## Specification

### Decisions Made

The following open questions from the Analysis section are resolved here as implementation guardrails. They may be revisited during implementation if discovered to be unworkable, but any change must be reflected back into this document.

| # | Question | Decision |
|---|----------|----------|
| 1 | Invocation method | Use the existing `claude` CLI adapter, consistent with stage agent patterns. |
| 2 | Read scope | Allow listing items (all or filtered by stage), reading individual item `index.md` and `meta.yml`, and reading workflow config files. Activity/audit log reading is out of scope. |
| 3 | Chat history persistence | Ephemeral; stored in browser `localStorage` keyed by `nos-chat:<workflowId>`. This mirrors the existing `ChatWidget` pattern. History is cleared when the user closes the panel or explicitly resets. |
| 4 | System prompt location | `.nos/nos-agent-prompt.md` — a new dedicated file adjacent to `.nos/system-prompt.md`. |
| 5 | UI placement | Collapsible side panel docked to the right of `WorkflowItemsView.tsx`, toggled by a button in the workflow toolbar. Collapsed by default. |
| 6 | Item context display | The chat always shows the currently selected item's title, ID, and stage in the header. Users may also query arbitrary items by ID or workflow. |

---

### User Stories

1. **As a** workflow participant, **I want to** open a NOS Agent chat panel from within the workflow screen, **so that** I can query the state of items without leaving the page.

2. **As a** workflow participant, **I want to** ask the NOS Agent to read an item and summarize its content and status, **so that** I can quickly understand what an item is about and where it stands.

3. **As a** workflow participant, **I want to** ask the NOS Agent to list all items in a given stage, **so that** I can see a batch overview of work at a glance.

4. **As a** workflow participant, **I want to** see the currently selected item's context reflected in the chat header, **so that** I always know which item the conversation refers to.

5. **As a** developer, **I want** the NOS Agent to be driven by a configurable system prompt file, **so that** I can update its behavior without touching UI code.

6. **As a** developer, **I want** the NOS Agent to read only (never write or edit), **so that** it cannot accidentally corrupt workflow data.

---

### Acceptance Criteria

1. **AC-1** — A "NOS Agent" button appears in the workflow toolbar; clicking it toggles a side panel containing the chatbox. The panel is collapsed on first load.

2. **AC-2** — The chat panel shows the currently selected item's title, ID, and stage as a persistent header line above the message input.

3. **AC-3** — The NOS Agent API endpoint (`POST /api/chat/nos`) accepts `{ messages: [{role, content}] }` and streams a response via SSE using the `data:` format (`[DONE]` to terminate).

4. **AC-4** — The NOS Agent system prompt (loaded from `.nos/nos-agent-prompt.md`) is prepended to every conversation before being sent to the agent adapter.

5. **AC-5** — The agent has access to at least these read tools (defined in the system prompt):
   - `Glob` — list item files within a workflow
   - `Read` — read `index.md` and `meta.yml` of a specific item
   - `Read` — read workflow `config.json` and `config/stages.yaml`
   - The agent MUST NOT have access to `Write`, `Edit`, `Bash`, or any destructive tool.

6. **AC-6** — Chat history is persisted in `localStorage` under the key `nos-chat:<workflowId>`. On panel open, history is restored; on explicit reset, history is cleared.

7. **AC-7** — If no item is selected, the chat header shows "(no item selected)" and the agent still functions for general queries (e.g., "list all items in this workflow").

8. **AC-8** — The chat panel is responsive and does not overlap the item list on screens narrower than 1024 px (panel renders below the list or is hidden on mobile).

9. **AC-9** — The agent response is streamed token-by-token, updating the UI in real time.

10. **AC-10** — If the agent encounters an error (tool failure, missing file), it returns a plain-text error message in the chat, not a crash or empty response.

---

### Technical Constraints

**API**

- `POST /api/chat/nos`
  - Request body: `{ messages: [{ role: "user" | "assistant", content: string }], workflowId?: string, itemId?: string }`
  - Response: `Content-Type: text/event-stream`
  - Each chunk: `data: <json-string>\n\n`
  - Terminal chunk: `data: [DONE]\n\n`
  - Errors: `500` with `{ error: string }` body, no SSE stream.

**System prompt file**

- Path: `.nos/nos-agent-prompt.md`
- Must define the agent's role, available read-only tools (Glob, Read), working directory context, and clear prohibitions on write/edit operations.

**Agent adapter**

- Uses `lib/agent-adapter.ts` with the `"claude"` adapter.
- System prompt is injected by concatenating `.nos/nos-agent-prompt.md` content before the conversation messages.
- Conversation history is passed in full (up to pruning threshold TBD; initial cap: 20 messages).

**Data shapes**

```
// Item metadata (.nos/workflows/<id>/items/<id>/meta.yml)
title: string
stage: string        // stage identifier
status: string      // Todo | In Progress | Done
updatedAt: string   // ISO-8601
comments: string[]

// Workflow config (.nos/workflows/<id>/config.json)
id: string
title: string
stages: string[]    // ordered list of stage identifiers
```

**Performance**

- Agent response must begin streaming within 2 seconds of request receipt.
- File reads are local; no network I/O beyond the agent adapter's own calls.

**Compatibility**

- Targets Next.js App Router (existing `/api/chat` pattern).
- Client component uses React hooks; no external state library required.

---

### Out of Scope

- Writing, editing, or deleting any workflow, stage, or item via the chat.
- Accessing the activity/audit log.
- Integration with the existing `ChatWidget` FAB.
- Full terminal emulation or command execution.
- Agent management CRUD (already handled at `/dashboard/agents`).
- Persistent chat history on the server (history lives in browser `localStorage` only).
- Multi-agent coordination or task delegation.
- Email, Slack, or external notifications.

## Validation

### AC-1 — NOS Agent button in workflow toolbar
❌ **FAIL** — No "NOS Agent" button exists in `WorkflowItemsView.tsx`. The toolbar at lines 106–171 has buttons for "Add item", search, kanban/list toggle, and settings — but no chat toggle.

### AC-2 — Chat panel with selected item header
❌ **FAIL** — No chat panel exists. No `NosAgentPanel` or similar component found anywhere in the codebase.

### AC-3 — POST /api/chat/nos SSE streaming
⚠️ **PARTIAL** — The API endpoint exists at `app/api/chat/nos/route.ts` and does stream SSE with `data:` format and `[DONE]` terminator. However, the stream parser in `ChatWidget.tsx` looks for `event.type === 'assistant'` and `event.message` — but the agent outputs raw text chunks (not JSON), not the structured `stream-json` format expected. The SSE format mismatch means the UI would not display streamed tokens correctly.

### AC-4 — System prompt prepended to conversation
✅ **PASS** — `getNosAgentPrompt()` reads `.nos/nos-agent-prompt.md` and `buildPrompt()` prepends it before conversation messages.

### AC-5 — Read-only tools defined in system prompt
⚠️ **PARTIAL** — The system prompt correctly enumerates `Glob` and `Read` as available tools and explicitly prohibits `Write`, `Edit`, `Bash`, `DeleteFile`, and `TaskOutput`. However, the API spawns `claude` with `--dangerously-skip-permissions`, which bypasses the agent's permission guardrails — the system prompt is advisory, not enforced.

### AC-6 — localStorage history persistence
❌ **FAIL** — No `localStorage` persistence exists for NOS Agent chat. The existing `ChatWidget.tsx` uses `nos:chat-widget-session-id` (different key), but no NOS-specific key (`nos-chat:<workflowId>`) is implemented anywhere.

### AC-7 — "(no item selected)" fallback
⚠️ **PARTIAL** — The API correctly handles missing `itemId`/`workflowId` and shows "(No workflow selected)" / "(No item selected)" in the prompt. But since the UI panel does not exist, the behavior is untestable in the browser.

### AC-8 — Responsive layout
❌ **FAIL** — No chat panel exists, so no responsive behavior is defined.

### AC-9 — Token-by-token streaming UI
❌ **FAIL** — SSE streaming exists on the backend but no UI component consumes it.

### AC-10 — Error handling
⚠️ **PARTIAL** — The API wraps errors in `{ type: 'error', message: string }` SSE events and returns 500 JSON for crashes. But there's no UI to display these gracefully.

---

### Summary
**2/10 acceptance criteria pass.** The backend (API endpoint + system prompt) is complete and mostly correct. The frontend (chatbox UI embedded in `WorkflowItemsView`, toolbar button, localStorage persistence) is entirely missing.

### Follow-ups required
1. Create `NosAgentPanel.tsx` component in `components/dashboard/`
2. Add "NOS Agent" toggle button to `WorkflowItemsView.tsx` toolbar
3. Integrate panel into `WorkflowItemsView.tsx` with `isOpen`/`selectedItem` state
4. Implement `localStorage` persistence with key `nos-chat:<workflowId>`
5. Fix SSE format: the backend outputs raw text lines, but the UI needs structured JSON (`{type, message}`) — either change the backend to emit proper stream-json or implement a text-mode parser in the UI
6. Consider removing `--dangerously-skip-permissions` from the agent invocation to actually enforce read-only constraints

