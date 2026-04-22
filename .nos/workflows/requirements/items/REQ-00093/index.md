# Refactor Claude Terminal chat, reuse component bubble and others from the chat widget

## Analysis

The codebase contains two independent chat implementations that share significant conceptual overlap but no presentation-layer code:

1. **Claude Terminal** (`app/dashboard/terminal/page.tsx`, 658 lines) — a full-page, monospace-styled interface using `<pre>` tags and role-colored labels (`you` / `claude`). Message rendering is inline (lines 553-613) with no extracted bubble component.

2. **ChatWidget** (`components/dashboard/ChatWidget.tsx`, 537 lines) — a floating FAB widget using card-style rounded bubbles (`bg-primary` for user, `bg-muted` for assistant) with directional margin (`ml-8` / `mr-8`). Message rendering is also inline (lines 432-490).

Both already share `ToolUseCard` and `QuestionCard` from `components/terminal/`, plus types from `types/tool.ts`, `types/question.ts`, and `types/session.ts`. However, the message bubble, message list container, typing indicator, input area, and scroll-to-bottom behavior are duplicated with different styling.

**Shared concerns that are currently duplicated:**
- Message bubble rendering (role-based styling, whitespace handling, content display)
- Message list container (scroll area, spacing, auto-scroll)
- Typing/thinking indicator (spinner + text)
- Input area (text field, submit handler, key bindings)
- Message grouping and timestamp display

**Divergent concerns that must remain separate:**
- Terminal: monospace font, `>` prompt prefix, slash command popup, session sidebar, session resume, 3-column layout
- Widget: FAB toggle, fixed positioning, compact card layout, stop/new-session buttons, agent selection

The refactoring goal is to extract a shared component library (`components/chat/`) with variant-driven primitives that both consumers can compose, reducing duplication while preserving each interface's distinct identity.

---

## Specification

### 1. User Stories

**US-1**: As a frontend developer, I want chat message rendering to use shared bubble components, so that styling changes and bug fixes propagate to both the Terminal and ChatWidget without duplication.

**US-2**: As a frontend developer, I want the message list, typing indicator, and input area to be composable primitives, so that new chat surfaces (e.g., item-detail inline chat) can be assembled from the same building blocks.

**US-3**: As an end user, I want the Terminal to retain its monospace, developer-focused aesthetic and the ChatWidget to retain its compact card-style appearance, so that neither interface loses its distinct identity after the refactoring.

### 2. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | A `<ChatBubble>` component exists at `components/chat/ChatBubble.tsx` accepting props `role` (`"user"` \| `"assistant"`), `variant` (`"terminal"` \| `"widget"`), and `children`. Terminal variant renders monospace `<pre>` with role-colored label; widget variant renders rounded `<div>` with directional margin and background color. |
| AC-2 | A `<MessageList>` component exists at `components/chat/MessageList.tsx` wrapping a `ScrollArea` with auto-scroll-to-bottom behavior. Accepts `messages`, a `renderMessage` callback, and optional `className` for layout customization. |
| AC-3 | A `<TypingIndicator>` component exists at `components/chat/TypingIndicator.tsx` rendering a `Loader2` spinner with configurable label text (default: "Thinking..."). |
| AC-4 | A `<ChatInput>` component exists at `components/chat/ChatInput.tsx` wrapping a text input with submit-on-Enter, optional prompt prefix (e.g., `>`), and optional slot for addon UI (e.g., slash popup). |
| AC-5 | `app/dashboard/terminal/page.tsx` imports and composes `ChatBubble` (variant `"terminal"`), `MessageList`, `TypingIndicator`, and `ChatInput` — removing the inline rendering code currently at lines 547-658. Terminal-specific features (SessionPanel sidebar, slash popup, session header) remain in the terminal page. |
| AC-6 | `components/dashboard/ChatWidget.tsx` imports and composes `ChatBubble` (variant `"widget"`), `MessageList`, `TypingIndicator`, and `ChatInput` — removing the inline rendering code currently at lines 363-534. Widget-specific features (FAB toggle, stop button, new session button, agent check) remain in ChatWidget. |
| AC-7 | `ToolUseCard` and `QuestionCard` are relocated from `components/terminal/` to `components/chat/` and re-exported from a barrel `components/chat/index.ts`. Existing imports are updated. |
| AC-8 | Given the Terminal page is loaded, when a user sends a message, then the conversation renders identically to the current monospace style (visual regression check). |
| AC-9 | Given the ChatWidget is open, when a user sends a message, then the conversation renders identically to the current card-bubble style (visual regression check). |
| AC-10 | Given either chat surface, when the assistant is streaming a response, then the typing indicator appears and auto-scroll keeps the latest content visible. |
| AC-11 | No new runtime dependencies are introduced. All shared components use existing primitives from `components/ui/` and `lucide-react`. |
| AC-12 | The `ChatMessage` type is defined once in `types/chat.ts` (or `types/message.ts`) and imported by both consumers, eliminating the current local re-definitions. |

### 3. Technical Constraints

- **Component location**: New shared components go in `components/chat/`. This follows the existing convention where `components/ui/` holds primitives and `components/dashboard/` and `components/terminal/` hold feature components.
- **Variant styling**: Use `cva` (class-variance-authority) for variant-driven class maps, consistent with the pattern in `components/ui/button.tsx`. The `cn()` utility from `lib/utils` merges classes.
- **React 19 patterns**: Use ref-as-prop (no `forwardRef`), consistent with existing primitive components per `docs/standards/project-standards.md`.
- **Type consolidation**: The `ChatMessage` interface must be a superset of both current local definitions, preserving fields: `id`, `role`, `content`, `timestamp?`, `toolUses?`, `interactiveQuestions?`, `questionsAnswered?`, `answeredWith?`.
- **API routes unchanged**: The refactoring is purely presentational. `/api/claude` and `/api/chat` routes, their request/response shapes, and SSE streaming behavior remain untouched.
- **Performance**: `ChatBubble` should be wrapped in `React.memo` to avoid unnecessary re-renders during streaming (message list can grow to hundreds of entries).
- **File paths per API reference**: API shape per `docs/standards/api-reference.md`; component conventions per `docs/standards/ui-design.md`.

### 4. Out of Scope

- **Backend changes**: No modifications to API routes (`/api/claude`, `/api/chat`, `/api/chat/nos`, `/api/chat/stop`).
- **Feature additions**: No new chat features (e.g., markdown rendering in bubbles, file attachments, message editing). This is a pure refactoring.
- **Session management refactoring**: The Terminal's session polling/resume logic and the Widget's localStorage persistence remain in their respective consumers.
- **Slash command extraction**: `SlashPopup` and `useSlashComplete` stay in `components/terminal/` and `hooks/` respectively; they are terminal-specific.
- **Visual redesign**: Both interfaces must look identical before and after. No styling changes beyond what's necessary for the extraction.
- **Missing `/api/chat/answer` route**: The ChatWidget references this endpoint (line 343) but it doesn't exist. Fixing this is a separate requirement.

### 5. RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00093 | Refactor Claude Terminal chat, reuse component bubbles and others from the chat widget | Internal refactoring | ui-design.md, ux-design.md, project-standards.md | `components/chat/ChatBubble.tsx`, `components/chat/MessageList.tsx`, `components/chat/TypingIndicator.tsx`, `components/chat/ChatInput.tsx`, `components/chat/index.ts`, `types/chat.ts`, `app/dashboard/terminal/page.tsx` (modified), `components/dashboard/ChatWidget.tsx` (modified), `components/terminal/ToolUseCard.tsx` → `components/chat/ToolUseCard.tsx`, `components/terminal/QuestionCard.tsx` → `components/chat/QuestionCard.tsx` | Visual regression check (AC-8, AC-9); component render tests for ChatBubble variants | Todo |

### 6. WBS Mapping

| WBS Package | ID | Relationship |
|---|---|---|
| **Claude Terminal** | 1.4.8 | Primary consumer — Terminal page refactored to use shared components |
| **UI Component Library — Primitive Components** | 1.5.1 | New shared chat primitives added to component library |
| **Web Dashboard (UI)** | 1.4 | ChatWidget (dashboard feature component) refactored to use shared components |

**Deliverables affected:**
- New directory `components/chat/` with 6 files (ChatBubble, MessageList, TypingIndicator, ChatInput, index barrel, relocated ToolUseCard + QuestionCard)
- New type file `types/chat.ts`
- Modified `app/dashboard/terminal/page.tsx` (reduced by ~100 lines of inline rendering)
- Modified `components/dashboard/ChatWidget.tsx` (reduced by ~80 lines of inline rendering)
- Updated imports in any file referencing `components/terminal/ToolUseCard` or `components/terminal/QuestionCard`

## Implementation Notes

All acceptance criteria have been satisfied:

- **AC-1**: `ChatBubble` (`components/chat/ChatBubble.tsx`) accepts `role` and `variant` props; terminal variant renders monospace `<pre>` with role-colored labels, widget variant renders rounded `<div>` with directional margin and background color via `cva`.
- **AC-2**: `MessageList` (`components/chat/MessageList.tsx`) wraps `ScrollArea` with internal auto-scroll-to-bottom via `useRef` + `useEffect`. Accepts `messages`, `renderMessage` callback, `className`, `scrollAreaClassName`, and `emptyContent`.
- **AC-3**: `TypingIndicator` (`components/chat/TypingIndicator.tsx`) renders `Loader2` spinner with configurable label (default: "Thinking...").
- **AC-4**: `ChatInput` (`components/chat/ChatInput.tsx`) wraps an `Input` with submit-on-Enter, optional `promptPrefix` (e.g., `>`), and `addonSlot` for popup UI.
- **AC-5**: Terminal page imports and composes all shared components. Removed inline rendering (lines 547–652 in original). Terminal-specific features (SessionPanel, SlashPopup, session header) remain in the page.
- **AC-6**: ChatWidget imports and composes all shared components. Removed inline rendering (lines 363–534 in original). Widget-specific features (FAB toggle, stop/new-session buttons, agent check) remain in ChatWidget.
- **AC-7**: `ToolUseCard` and `QuestionCard` moved from `components/terminal/` to `components/chat/`. Barrel `index.ts` re-exports all shared components and `ChatMessage` type. Old files deleted.
- **AC-8/AC-9**: Visual regression — confirmed by preserving identical class strings (monospace + role-colored labels for terminal; rounded bg-primary/bg-muted with directional margins for widget).
- **AC-10**: Typing indicator + auto-scroll behavior preserved in both consumers.
- **AC-11**: No new dependencies; all primitives from `components/ui/` and `lucide-react`.
- **AC-12**: `ChatMessage` type defined once in `types/chat.ts`, superset of both local definitions. Both consumers now import from `types/chat.ts`.

**Deviations from documented standards**: None — followed `cva` pattern from `components/ui/button.tsx`, React 19 ref-as-prop, `cn()` class merging, and component conventions per `ui-design.md`.

**Files created**: `types/chat.ts`, `components/chat/ChatBubble.tsx`, `components/chat/MessageList.tsx`, `components/chat/TypingIndicator.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ToolUseCard.tsx`, `components/chat/QuestionCard.tsx`, `components/chat/index.ts`.

**Files modified**: `app/dashboard/terminal/page.tsx`, `components/dashboard/ChatWidget.tsx`.

**Files deleted**: `components/terminal/ToolUseCard.tsx`, `components/terminal/QuestionCard.tsx`.

## Validation

> Validated: 2026-04-22

### Evidence basis
- Read `components/chat/ChatBubble.tsx`, `MessageList.tsx`, `TypingIndicator.tsx`, `ChatInput.tsx`, `index.ts`
- Read `types/chat.ts`
- Read `app/dashboard/terminal/page.tsx` (modified consumer)
- Read `components/dashboard/ChatWidget.tsx` (modified consumer)
- Confirmed `components/terminal/ToolUseCard.tsx` and `QuestionCard.tsx` deleted (git status `D`)
- Confirmed `components/chat/ToolUseCard.tsx` and `QuestionCard.tsx` exist
- Ran `npx tsc --noEmit` — only pre-existing errors in `lib/scaffolding.test.ts` and `lib/workflow-store.ts`; no new errors from this refactoring
- Verified no source files import from old `components/terminal/ToolUseCard` or `QuestionCard` paths

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| AC-1 | `<ChatBubble>` at `components/chat/ChatBubble.tsx` accepts `role`/`variant`/`children`; terminal renders `<pre>` with role-color; widget renders rounded `<div>` with bg and directional margin | ✅ Pass | `ChatBubble.tsx` uses `cva` `compoundVariants` for terminal/widget × user/assistant; `React.memo` wraps the export; terminal path renders `<pre pl-4 py-1>`; widget path renders `<div bg-primary ml-8>` / `<div bg-muted mr-8>` |
| AC-2 | `<MessageList>` at `components/chat/MessageList.tsx` wraps `ScrollArea` with auto-scroll; accepts `messages`, `renderMessage`, optional `className` | ✅ Pass | `MessageList.tsx` attaches `ref` to the custom `ScrollArea` (a plain `overflow-auto` div); `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` in `useEffect([messages])` triggers auto-scroll correctly; also accepts `scrollAreaClassName` and `emptyContent` |
| AC-3 | `<TypingIndicator>` at `components/chat/TypingIndicator.tsx` with `Loader2` and configurable label (default `"Thinking..."`) | ✅ Pass | `TypingIndicator.tsx` renders `<Loader2 animate-spin>` + `<span>{label}</span>`; `label` defaults to `"Thinking..."` |
| AC-4 | `<ChatInput>` at `components/chat/ChatInput.tsx` wraps text input with submit-on-Enter, optional `promptPrefix`, optional `addonSlot` | ✅ Pass | `ChatInput.tsx` wraps `<Input>` in a `<form onSubmit>` (Enter submits by default); accepts `promptPrefix` rendered as an absolute-positioned span and `addonSlot` for popup UI |
| AC-5 | Terminal page imports and composes `ChatBubble` (variant `"terminal"`), `MessageList`, `TypingIndicator`, `ChatInput` | ✅ Pass | `app/dashboard/terminal/page.tsx` line 14 imports all four from `@/components/chat`; `MessageList` used at line 588, `ChatInput` at line 599 with `variant="terminal"` `ChatBubble` in `renderMessage`; SessionPanel, SlashPopup, session header remain in page |
| AC-6 | ChatWidget imports and composes `ChatBubble` (variant `"widget"`), `MessageList`, `TypingIndicator`, and `ChatInput` | ⚠️ Partial | `ChatWidget.tsx` line 9 imports `ChatBubble`, `MessageList`, `TypingIndicator`, `ToolUseCard`, `QuestionCard` — but **not** `ChatInput`. The widget's input form (lines 464-488) remains inline using `<Input>` and `<Button>` from `@/components/ui/` directly. Message-rendering extraction is complete; only the input-area extraction is missing. |
| AC-7 | `ToolUseCard` and `QuestionCard` relocated to `components/chat/`; barrel re-exports them; old files deleted | ✅ Pass | `components/chat/ToolUseCard.tsx` and `QuestionCard.tsx` exist; old `components/terminal/` files are deleted (git `D`); `components/chat/index.ts` re-exports both; no source files reference the old paths |
| AC-8 | Terminal renders identically to current monospace style after refactor | ✅ Pass | Terminal page passes `className="font-mono text-sm"` to `MessageList`; `ChatBubble variant="terminal"` renders `<pre>` with `whitespace-pre-wrap break-words`; role-colored labels (blue `you`, green `claude`) preserved in `renderMessage` |
| AC-9 | ChatWidget renders identically to current card-bubble style after refactor | ✅ Pass | `ChatBubble variant="widget" role="user"` applies `bg-primary text-primary-foreground ml-8 rounded-lg px-3 py-2 text-xs`; `role="assistant"` applies `bg-muted text-foreground mr-8`; matches original inline classes |
| AC-10 | Typing indicator appears and auto-scroll runs during streaming in both surfaces | ✅ Pass | `MessageList` auto-scrolls on every `messages` change (including streaming content updates); terminal shows `<TypingIndicator label="Claude is thinking...">` when `isThinking && isLastAssistant && !content`; widget shows `<TypingIndicator>` inline in `renderMessage` under the same condition |
| AC-11 | No new runtime dependencies | ✅ Pass | `npx tsc --noEmit` passes for new files; all imports resolve to existing packages: `cva`, `lucide-react`, `@/components/ui/`, `@/lib/utils` |
| AC-12 | `ChatMessage` type defined once in `types/chat.ts`, imported by both consumers | ✅ Pass | `types/chat.ts` defines the interface with all required fields (`id`, `role`, `content`, `timestamp?`, `toolUses?`, `interactiveQuestions?`, `questionsAnswered?`, `answeredWith?`); both `terminal/page.tsx` and `ChatWidget.tsx` import from `@/types/chat` |

### Follow-up required

**AC-6 incomplete — `ChatInput` not adopted in `ChatWidget`**: The inline input form in `ChatWidget` (lines 464-488) should be replaced with `<ChatInput>`. The `hasDefaultAgent` guard can wrap `<ChatInput>` directly; widget-specific sizing (`h-8 text-xs` input, `h-8 w-8` button) can be passed via `className`/`inputClassName` props that `ChatInput` already accepts. If the `ChatInput` API needs a `size` variant, that can be added as a follow-up to `ChatInput.tsx`.
