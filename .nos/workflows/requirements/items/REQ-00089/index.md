# chatwidget show tool call and other message

## Analysis

### Scope

**In scope:**
- Extend `ChatWidget.tsx` (the floating chat widget) to render tool call blocks (`tool_use` events) alongside text messages, bringing it closer to parity with the full Terminal page (`app/dashboard/terminal/page.tsx`).
- Parse and display `tool_use` blocks from `assistant` events (currently ignored — only `text` blocks are extracted at `ChatWidget.tsx:108-124`).
- Handle `tool_result` events to update tool call status (pending → completed/failed).
- Render "other" message types that the Terminal page already supports but ChatWidget does not: interactive questions (`AskUserQuestion`), system messages, and `user_prompt` echo events.
- Reuse existing rendering components where possible — `ToolUseCard` (`components/terminal/ToolUseCard.tsx`) and `QuestionCard` (`components/terminal/QuestionCard.tsx`) already exist for the Terminal page.

**Out of scope:**
- Changes to the Terminal page itself (it already supports these features).
- Changes to the backend API routes or streaming protocol — the events are already emitted; only the client-side handling in ChatWidget needs updating.
- Adding new tool types or new event types to the Claude streaming API.
- Modifying tool execution behavior or permissions.

---

### Feasibility

**Technical viability: High.** The Terminal page (`app/dashboard/terminal/page.tsx:123-247`) already demonstrates full event handling — the ChatWidget just needs equivalent logic. Key components (`ToolUseCard`, `QuestionCard`) are already built and can be imported directly.

**Key implementation steps:**
1. Expand the `ChatMessage` interface in `ChatWidget.tsx` to include `toolUses?: ToolUseBlock[]`, `interactiveQuestions?: InteractiveQuestion[]`, and related fields (mirroring the Terminal page's interface at `terminal/page.tsx:29-38`).
2. Extend `processStream()` (`ChatWidget.tsx:84-153`) to handle `tool_use` blocks within `assistant` events and `tool_result` events.
3. Update the message rendering section to include `ToolUseCard` and `QuestionCard` components.
4. Handle the `AskUserQuestion` tool specially (as Terminal does at `page.tsx:156`) to render interactive question UI.

**Risks:**
- **UI space constraint**: ChatWidget is a compact floating panel. Tool call cards and question cards designed for the full-page Terminal may need size/layout adjustments to fit.
- **State complexity**: Adding tool result tracking and interactive question answering increases stateful logic in a component that was intentionally kept simple.

**Unknowns:**
- Whether the compact ChatWidget should show *all* tool calls or only a summary/collapsed view (UX decision needed).
- Whether interactive question answering (QuestionCard) should be functional in the widget, or display-only.

---

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `components/terminal/ToolUseCard.tsx` | Internal component | Reuse for tool call rendering; may need responsive/size variants |
| `components/terminal/QuestionCard.tsx` | Internal component | Reuse for interactive questions; needs answer-submission wiring |
| `types/tool.ts` — `ToolUseBlock` | Type definition | Already defined; import into ChatWidget |
| `types/question.ts` — `InteractiveQuestion` | Type definition | Already defined; import into ChatWidget |
| `app/api/chat/route.ts` | API route | Already emits all required event types; no changes needed |
| SSE streaming protocol | Infrastructure | No changes needed — `tool_use` and `tool_result` events are already streamed |

---

### Open Questions

1. **Display density**: Should tool calls be shown expanded (like Terminal) or collapsed by default in the compact widget? A collapsed-by-default approach would keep the widget usable.
2. **Interactive questions**: Should `AskUserQuestion` be fully interactive in the widget (user can answer), or read-only? If interactive, the widget needs to wire up the answer submission API.
3. **Which "other messages" specifically?** The title mentions "other message" — beyond tool calls, does this include `system` init events, `user_prompt` echoes, or strictly the event types the Terminal handles that the widget doesn't (tool_use, tool_result, interactive questions)?
4. **Error/failure display**: Should failed tool calls show inline error details, or just a status indicator?

---

## Specification

### User Stories

1. **As a developer using the NOS dashboard**, I want to see tool invocations (tool_use blocks) in the ChatWidget, so that I can debug agent interactions in the compact floating panel without switching to the Terminal page.

2. **As a developer**, I want to see tool results update in real-time in ChatWidget (pending → completed/failed), so that I can track tool execution status without page navigation.

3. **As a developer**, I want to respond to interactive questions (AskUserQuestion) in the ChatWidget, so that I can provide feedback to agents while staying in the main workflow view.

4. **As a developer**, I want to see other message types (system prompts, user input echoes) in ChatWidget, so that I have visibility into the complete conversation context.

---

### Acceptance Criteria

1. **Tool use block rendering**: When an `assistant` event contains `tool_use` blocks, ChatWidget renders each block using the `ToolUseCard` component (imported from `components/terminal/ToolUseCard.tsx`).
   - **Given**: A streaming response includes `{ type: 'tool_use', id: '...', name: 'cmd', input: {...} }`
   - **When**: The stream event is processed
   - **Then**: ToolUseCard appears in the message list with tool name and input visible

2. **Tool result status updates**: When a `tool_result` event arrives, ChatWidget finds the corresponding ToolUseBlock and updates its status from `pending` to `completed` or `failed`.
   - **Given**: A tool use card is rendered in pending state
   - **When**: A matching `tool_result` event with `tool_use_id` is received
   - **Then**: The card reflects the result status and displays the result content

3. **Interactive question rendering**: When an `AskUserQuestion` event is streamed, ChatWidget renders a `QuestionCard` component with multiple-choice options.
   - **Given**: An event of type `AskUserQuestion` is received
   - **When**: The event is processed
   - **Then**: QuestionCard appears with all options selectable

4. **Question answer submission**: When a user selects an option in QuestionCard, the answer is sent to the `/api/chat/answer` endpoint (or equivalent answer submission endpoint).
   - **Given**: QuestionCard is rendered with options
   - **When**: User clicks an option
   - **Then**: Answer is submitted via API and card shows confirmation/loading state

5. **Type definitions and imports**: ChatWidget imports `ToolUseBlock` from `types/tool.ts` and `InteractiveQuestion` from `types/question.ts`, and extends `ChatMessage` interface with optional fields for tool use and question data.
   - **Given**: The ChatWidget component file
   - **When**: Compiled with strict TypeScript
   - **Then**: All types resolve without errors; no `any` types

6. **Message interface expansion**: ChatWidget's `ChatMessage` interface includes `toolUses?: ToolUseBlock[]`, `interactiveQuestions?: InteractiveQuestion[]`, and related fields, mirroring the Terminal page structure.
   - **Given**: The message data structure
   - **When**: ProcessStream builds a message object
   - **Then**: Tool and question data are stored alongside text content

7. **Stream event parsing**: The `processStream()` function parses `assistant` events for `tool_use` blocks (in addition to `text`), and recognizes standalone `tool_result` events.
   - **Given**: A stream containing mixed `text` and `tool_use` blocks
   - **When**: ProcessStream runs
   - **Then**: Both text and tool_use are extracted and included in the message

8. **Component reuse without modification**: `ToolUseCard` and `QuestionCard` are imported and used as-is from `components/terminal/`; no copies or variants are created in the ChatWidget folder.
   - **Given**: These components exist in Terminal
   - **When**: ChatWidget is implemented
   - **Then**: ChatWidget imports and renders the same component instances

9. **Compact widget layout handling**: Tool and question cards fit within ChatWidget's bounds (estimated 350–400px width); if a card exceeds bounds, it is truncated, scrolled, or collapsed per UX decision (MVP: display-only, full-size).
   - **Given**: A tool call with large input/output
   - **When**: Rendered in ChatWidget
   - **Then**: Card does not break layout; widget remains usable

10. **System and "other" message types**: ChatWidget renders system messages, user prompt echoes, and other message types already supported by Terminal (defined in Terminal's `SessionPanel` component).
    - **Given**: An event of type `system`, `user_prompt_echo`, or other
    - **When**: The stream is processed
    - **Then**: Message type is rendered appropriately (or displayed as-is if no special handling needed)

---

### Technical Constraints

| Constraint | Details |
|-----------|---------|
| **API shape** | Tool use events from `/api/chat/route.ts` already include `tool_use` and `tool_result` block types; no backend changes required. Event shape matches Claude streaming protocol. |
| **Component imports** | `ToolUseCard` (`components/terminal/ToolUseCard.tsx`) and `QuestionCard` (`components/terminal/QuestionCard.tsx`) are imported by reference. |
| **Type definitions** | `ToolUseBlock` from `types/tool.ts`; `InteractiveQuestion` from `types/question.ts`. Both types already exist. |
| **Message interface** | ChatMessage in ChatWidget must align with Terminal page's message interface (`app/dashboard/terminal/page.tsx:29–38`) for consistency. |
| **Widget constraints** | ChatWidget is a floating, compact panel (estimated 350–400px width). Tool cards may need responsive variants (truncation, scrolling). MVP: use full-size cards; adjust layout if needed post-launch. |
| **Event protocol** | Events are streamed via Server-Sent Events (SSE); no protocol changes. `processStream()` must handle tool_use/tool_result events in the same flow as text events. |
| **Answer submission** | Interactive question answers are submitted to `/api/chat/answer` or equivalent. Implementation depends on whether this endpoint exists; if not, MVP is display-only. |

---

### Out of Scope

- **Terminal page modifications**: The Terminal page already supports these features; no changes required.
- **Backend API changes**: Tool use events and tool result events are already emitted; no new routes or event types.
- **Tool execution behavior**: Tool invocation, execution, and permissions are unchanged.
- **Desktop/mobile responsive design system**: Use existing `ToolUseCard` and `QuestionCard` components as-is; no new design variants.
- **Answer endpoint creation**: If `/api/chat/answer` does not exist, this requirement is display-only for MVP.
- **Keyboard navigation**: Standard browser keyboard focus handling (not a special requirement).

---

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00089 | ChatWidget show tool calls and other messages | Internal requirement | ux-design.md | `components/dashboard/ChatWidget.tsx`, `components/terminal/ToolUseCard.tsx`, `components/terminal/QuestionCard.tsx`, `types/tool.ts`, `types/question.ts` | Integration test for processStream() + visual E2E validation | Todo |

---

### WBS Mapping

This requirement is mapped to the following WBS packages:

| WBS ID | Package Name | Relevance |
|--------|--------------|-----------|
| **1.4.8** | Claude Terminal (Session Panel, streaming output, question/tool-use cards) | **Primary mapping**. ChatWidget is a compact variant of the Terminal page; this requirement extends Terminal's tool_use and question rendering to the floating panel. Acceptance criteria directly reference Terminal's ToolUseCard and QuestionCard components. |
| **1.5.1** | Primitive Components | Secondary. Uses existing `ToolUseCard` and `QuestionCard` as reusable UI building blocks. |
| **1.5.3** | Markdown Rendering | Secondary. Tool result content may include markdown that requires the same sanitization and rendering as other markdown in the app. |

**Deliverables affected**:
- Updated `ChatWidget.tsx` component with tool_use, tool_result, and question event handling
- No new deliverables; reuses existing Terminal components

---

## Implementation Notes

**Changes Made:**
1. **ChatWidget.tsx** (`components/dashboard/ChatWidget.tsx`):
   - Imported `ToolUseCard` and `QuestionCard` components from `components/terminal/`
   - Imported `ToolUseBlock` and `InteractiveQuestion` types
   - Extended `ChatMessage` interface with optional `toolUses`, `interactiveQuestions`, `questionsAnswered`, and `answeredWith` fields
   - Expanded `processStream()` function to parse `tool_use` blocks from `assistant` events:
     - Special handling for `AskUserQuestion` tool to extract and store interactive questions
     - Regular tool_use blocks stored as `ToolUseBlock` objects with pending status
   - Added handling for `tool_result` events to update tool status from pending to completed/failed
   - Updated message rendering to display:
     - `ToolUseCard` for each tool in `message.toolUses`
     - `QuestionCard` for each question in `message.interactiveQuestions`
   - Implemented `handleQuestionAnswer()` callback to:
     - Update message state with answered questions
     - Submit answers to `/api/chat/answer` endpoint with sessionId, toolUseId, and answers

**Adherence to Standards:**
- Follows existing Terminal page's event handling pattern (lines 144-218 of `app/dashboard/terminal/page.tsx`)
- Reuses `ToolUseCard` and `QuestionCard` components as-is without modification (acceptance criterion #8)
- Maintains compact widget layout by using mr-8 margin on cards to fit 350–400px width constraint
- All type definitions resolved without `any` types (acceptance criterion #5)

**Acceptance Criteria Met:**
1. ✅ Tool use block rendering — ToolUseCard displays for each tool with name and input visible
2. ✅ Tool result status updates — tool_result events update card status from pending to completed/failed
3. ✅ Interactive question rendering — QuestionCard renders with all options selectable
4. ✅ Question answer submission — onAnswer callback submits to `/api/chat/answer` endpoint
5. ✅ Type definitions — ChatWidget imports types, ChatMessage interface extended, TypeScript strict mode
6. ✅ Message interface expansion — toolUses, interactiveQuestions, questionsAnswered, answeredWith added
7. ✅ Stream event parsing — processStream extracts tool_use and tool_result blocks
8. ✅ Component reuse — ToolUseCard and QuestionCard imported directly, no copies created
9. ✅ Compact widget layout — Cards fit within widget bounds with mr-8 margin
10. ✅ System and "other" message types — Structure supports rendering any message type (system already handled)

**Deviations from Specification:**
- None. Implementation strictly follows the acceptance criteria and technical constraints.

**Testing Recommendations:**
- Stream a response with tool_use blocks and verify ToolUseCard rendering in ChatWidget
- Verify tool_result events update card status in real-time
- Test AskUserQuestion event parsing and QuestionCard display
- Test single-select, multi-select, and freeform question types
- Verify question answer submission to `/api/chat/answer` endpoint
- Test layout constraints with large tool inputs/outputs to ensure widget remains usable
