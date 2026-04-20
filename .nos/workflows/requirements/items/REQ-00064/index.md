# Implement a live chat widget

Requirement

* Have a small button float at the bottom right corner
* When click to that, show a window to chat with default adapter



Additional feature

* Have a button "new session" somewhere
* Session will be saved across the site (maybe need to save in config)
  * If the session saved in config not exist, create a new one
* Have button to stop the trigger

## Analysis

### 1. Scope

**In scope**
- A floating circular button fixed to the bottom-right corner of the dashboard shell (`app/dashboard/layout.tsx`). Visible on every dashboard route.
- Click toggles a compact chat panel (drop-up near the FAB) that sends prompts to the project's **default agent adapter** (read via `readDefaultAgent()` in `lib/settings.ts`, not hard-coded to `claude`).
- Streaming assistant responses rendered incrementally, mirroring the existing pattern in `app/dashboard/terminal/page.tsx`.
- "New session" control inside the panel header that discards the current session ID and starts fresh on the next message.
- Session persistence across navigation and reloads: widget keeps working against a single `sessionId` until the user clicks "New session" or the stored ID is no longer resumable (in which case a new one is created transparently).
- "Stop" control that aborts the in-flight streaming turn using `lib/stream-registry.ts` (same mechanism the terminal page uses).

**Explicitly out of scope**
- Adapter/model picker inside the widget — always uses the configured default.
- File attachments, image input, voice input.
- Slash-command autocomplete, interactive `AskUserQuestion` cards, or tool approval UI (the widget is intentionally a "quick chat", not a replacement for `/dashboard/terminal`).
- Showing the widget on non-dashboard routes (`app/page.tsx`, marketing pages) unless later requested.
- Multi-tab session synchronisation beyond what a single persistence layer naturally gives.
- Auth, rate-limiting, or per-user isolation (project is single-tenant today).

### 2. Feasibility

High — all backend plumbing already exists.

- **Streaming**: `POST /api/claude` already returns an SSE stream and accepts `sessionId` for resume. It is currently hard-coded to the `claude` adapter, so either (a) generalise it into `POST /api/chat` that resolves the adapter via `readDefaultAgent()` and dispatches through `listAdapters()` / `AgentAdapter.startSession`, or (b) add a thin `/api/chat` wrapper and leave the existing route alone. Option (b) is lower risk.
- **Session resume & stop**: `app/api/claude/sessions/[id]/stream` and `.../status` plus `lib/stream-registry.ts` already support live-tailing and aborting by session ID — reusable as-is.
- **Widget shell**: Can be a single client component mounted once in `DashboardLayout`. shadcn `Button`, `Card`, `ScrollArea` primitives already in `components/ui/`.
- **Reference implementation**: `app/dashboard/terminal/page.tsx` is a near-complete blueprint for message state, streaming, and session switching. The widget is a trimmed-down version of it.

**Risks / unknowns**
- **Persistence medium ambiguity**: the request says "save in config". `.nos/settings.yaml` (server-side, via `lib/settings.ts`) is the project config surface; `localStorage` is the per-browser alternative. These have very different semantics (shared vs per-device). Needs clarification — see open questions.
- **Stale session IDs**: adapters may reject a `--resume` when the underlying CLI session file has been pruned. The widget must treat "session not found / not resumable" as soft failure and auto-create a new session on the next turn. The existing terminal page does not fully handle this; will need a small fallback.
- **Default adapter not set**: `readDefaultAgent()` can return `{ adapter: null, model: null }`. The widget needs a graceful empty state ("Configure a default agent in Settings").
- **Duplicate UI on `/dashboard/terminal`**: a floating chat over a full-page chat is visually redundant; probably hide or disable the FAB on that route.
- **Layout collisions**: bottom-right is a common zone for toasts (`Toaster` already mounted in `DashboardLayout`). Need to offset the FAB (e.g. `bottom-6 right-6`, toasts stack above).
- **Stop semantics**: `stream-registry` abort kills the child process for that session, which ends the entire CLI run (not just the current turn). That matches the user's "stop the trigger" wording, but worth confirming.

### 3. Dependencies

- `lib/settings.ts` — read/write the persisted widget session ID (if going the server-config route); read default adapter.
- `lib/agent-adapter.ts` — `listAdapters()`, `AgentAdapter.startSession`, session-id extraction logic.
- `app/api/claude/route.ts` — reference / possible generalisation target; pairs with `lib/stream-registry.ts`.
- `app/api/claude/sessions/[id]/{stream,status}/route.ts` — reusable for resume and status polling.
- `app/dashboard/layout.tsx` — mount point for the widget; coexists with `Sidebar` and `Toaster`.
- `components/ui/*` — Button, Card, Input, ScrollArea.
- Optional: `components/terminal/*` (SessionPanel, slash popup, question card) — NOT pulled in for v1 to keep the widget minimal.
- New endpoints likely needed:
  - `POST /api/chat` (or equivalent) — adapter-agnostic streaming wrapper.
  - `POST /api/chat/stop` — explicit stop, or reuse an existing abort endpoint if one exists.
  - `GET/POST /api/settings/chat-widget-session` — only if persistence lands in server config.

### 4. Open questions

1. **Persistence location** — "save in config" means server-side `.nos/settings.yaml` (shared across browsers/devices) or client-side `localStorage` (per browser)? Server config fits the word "config" literally, but makes the "session per user" mental model wrong if nos ever becomes multi-user. Recommendation: `localStorage` for v1, revisit if nos gains auth.
2. **Scope of visibility** — dashboard-only, or also on the landing page / other top-level routes?
3. **Behaviour on `/dashboard/terminal`** — hide the FAB, or allow the widget to coexist?
4. **"Stop the trigger" semantics** — cancel only the current streaming turn (keep session resumable) or kill the entire adapter process for that session?
5. **Adapter fallback** — when no default adapter is configured, does the widget (a) hide itself, (b) show a disabled state with a link to Settings, or (c) fall back to a hard-coded adapter (e.g. `claude`)?
6. **Non-text output** — does v1 need to render tool calls / code blocks with syntax highlighting, or is plain text with markdown sufficient?
7. **"New session" confirmation** — should starting a new session prompt for confirmation when the current conversation is non-empty, to avoid accidental loss?

## Specification

### Decisions on open questions

The following decisions resolve the open questions from the Analysis section and are normative for implementation:

1. **Persistence** — `localStorage` under key `nos:chat-widget-session-id`. Survives page reload and client-side navigation. No server-side write required for v1.
2. **Visibility scope** — Dashboard shell only (every route under `/dashboard/**`). Not shown on the landing page or other top-level routes.
3. **Behaviour on `/dashboard/terminal`** — FAB is hidden (display:none) on that route. The full terminal already provides equivalent functionality.
4. **Stop semantics** — Aborts the current in-flight SSE stream via `stream-registry` abort. The session ID is retained and the session remains resumable; the user may send another message afterward.
5. **Adapter fallback** — When `readDefaultAgent()` returns `{ adapter: null }`, the FAB renders normally but clicking opens the panel in a disabled state showing: *"No default agent configured. Go to Settings → Agents to set one."* No hidden FAB.
6. **Markdown rendering** — Basic markdown: bold, italic, inline code, fenced code blocks (no syntax highlighting). Tool-call payloads and question cards are not rendered.
7. **New session confirmation** — No confirmation dialog. Clicking "New session" immediately clears the stored session ID and the displayed conversation history. Simplicity wins for v1.

---

### User stories

**US-1 — Open the chat panel**
As a dashboard user, I want a persistent floating action button (FAB) in the bottom-right corner of every dashboard page, so that I can open a quick-chat panel from anywhere without navigating away.

**US-2 — Send a message and see a streaming response**
As a dashboard user, I want to type a prompt and see the assistant's reply stream in incrementally, so that I get fast feedback without waiting for the full response.

**US-3 — Resume a previous session**
As a dashboard user, I want my session to persist across page reloads and route changes, so that I can continue a conversation without re-explaining context.

**US-4 — Start a fresh session**
As a dashboard user, I want a "New session" button inside the chat panel, so that I can discard the current conversation and begin a clean context whenever I choose.

**US-5 — Stop an in-progress response**
As a dashboard user, I want a "Stop" button that appears while the assistant is responding, so that I can abort a long or incorrect reply immediately.

**US-6 — Graceful no-adapter state**
As a dashboard user who has not yet configured a default agent, I want the chat panel to explain the missing configuration and link to Settings, so that I know exactly what to fix.

---

### Acceptance criteria

**AC-1 — FAB presence and position**
- Given I am on any `/dashboard/**` route except `/dashboard/terminal`,
- When the page renders,
- Then a circular FAB button is visible, fixed to `bottom-24 right-6` (above the toast zone), with a chat-bubble icon and an accessible `aria-label="Open chat"`.

**AC-2 — FAB hidden on terminal route**
- Given I navigate to `/dashboard/terminal`,
- When the page renders,
- Then the FAB is not visible (display:none or not rendered).

**AC-3 — Toggle open / close**
- Given the FAB is visible,
- When I click it,
- Then a chat panel expands (drop-up from the FAB); clicking the FAB again, or a dedicated close button in the panel header, collapses it.
- The panel must not obstruct the Sidebar or top navigation bar.

**AC-4 — Send a message**
- Given the panel is open and a default adapter is configured,
- When I type a non-empty prompt and press Enter or click the Send button,
- Then the message appears in the conversation list as a user bubble, and the assistant response begins streaming into an assistant bubble immediately below.
- The input field is cleared and disabled while the response streams.

**AC-5 — Streaming render**
- Given a response is streaming,
- When each SSE chunk arrives,
- Then the assistant bubble updates in place (no new bubble per chunk).
- Basic markdown (bold, italic, inline code, fenced code blocks) must render correctly in the final bubble.

**AC-6 — Stop button**
- Given a response is streaming,
- When a "Stop" icon button is visible in the panel footer,
- And I click it,
- Then the SSE stream is aborted via `stream-registry`, the assistant bubble shows the partial content received so far, and the input is re-enabled.
- The session ID is not cleared; the next message may continue the session.

**AC-7 — Session persistence across navigation**
- Given I have sent at least one message in the current session,
- When I navigate to another `/dashboard/**` route and back, or reload the page,
- Then the conversation history is displayed and the session ID in `localStorage` (key `nos:chat-widget-session-id`) matches the one used previously.

**AC-8 — New session**
- Given the panel is open with a non-empty conversation,
- When I click "New session" in the panel header,
- Then the conversation history is cleared from the panel UI, the `localStorage` key `nos:chat-widget-session-id` is deleted, and the next message sent creates a brand-new session.
- No confirmation dialog is shown.

**AC-9 — Stale session auto-recovery**
- Given the session ID stored in `localStorage` is no longer resumable (the adapter rejects `--resume`),
- When I send a new message,
- Then the widget silently discards the stale ID, starts a new session, and delivers the response normally; no error is shown to the user.

**AC-10 — No default adapter configured**
- Given `readDefaultAgent()` returns `{ adapter: null }`,
- When I click the FAB,
- Then the panel opens showing only the message: *"No default agent configured. Go to Settings → Agents to set one."* with a link to `/dashboard/settings`.
- The input field and Send button are not rendered in this state.

**AC-11 — API endpoint: POST /api/chat**
- Given a valid JSON body `{ prompt: string, sessionId?: string }`,
- When `POST /api/chat` is called,
- Then it resolves the default adapter via `readDefaultAgent()`, starts or resumes the session via `AgentAdapter`, and returns an SSE stream with the same event format used by `POST /api/claude`.
- If `sessionId` is omitted or invalid, a new session is created and the new session ID is emitted in a `session` SSE event before the first `data` chunk.

**AC-12 — Layout: no collision with Toaster**
- Given the `Toaster` component is mounted in `DashboardLayout` with default positioning (bottom-right),
- When a toast notification appears while the FAB and/or chat panel is visible,
- Then the toast stacks above the FAB without overlap (achieved by the FAB offset `bottom-24 right-6`).

---

### Technical constraints

1. **Mount point** — The widget component (`<ChatWidget />`) is mounted once inside `app/dashboard/layout.tsx`, as a sibling to `<Sidebar>` and `<Toaster>`. It must not be mounted per-page.
2. **Client component** — The widget is a `'use client'` component. No server-component logic may be embedded inside it.
3. **Persistence key** — `localStorage` key: `nos:chat-widget-session-id`. Value: a raw session ID string. No additional metadata is stored.
4. **New API route** — `POST /api/chat/route.ts` must call `readDefaultAgent()` from `lib/settings.ts` to resolve the adapter at request time. Hard-coding the adapter name is not permitted.
5. **SSE format** — The `/api/chat` SSE stream must emit:
   - `event: session\ndata: <sessionId>\n\n` — exactly once, as the first event.
   - `event: data\ndata: <chunk>\n\n` — one per text chunk.
   - `event: done\ndata: \n\n` — when the turn completes.
   - `event: error\ndata: <message>\n\n` — on unrecoverable failure.
6. **Stop mechanism** — Abort is triggered by calling `streamRegistry.abort(sessionId)` (same call as `app/api/claude/sessions/[id]/stream`). The `/api/chat/stop` endpoint (or equivalent) must accept `{ sessionId: string }` and invoke this.
7. **FAB position** — Fixed CSS: `position: fixed; bottom: 6rem; right: 1.5rem; z-index: 50`. The panel expands upward from the FAB.
8. **Panel dimensions** — Width: `24rem` (384 px). Max height: `70vh`. Scroll via `ScrollArea` from `components/ui/scroll-area`.
9. **Route detection for hiding FAB** — Use `usePathname()` from `next/navigation`. Hide when `pathname === '/dashboard/terminal'` or `pathname.startsWith('/dashboard/terminal')`.
10. **Markdown** — Use the existing markdown renderer already present in the codebase (check `components/` for a `Markdown` or `ReactMarkdown` wrapper before adding a new dependency).
11. **Accessibility** — FAB must have `aria-label`. Panel must have `role="dialog"` and `aria-label="Chat"`. Input must have `aria-label="Message"`. Stop button must have `aria-label="Stop"`. New session button must have `aria-label="New session"`.
12. **TypeScript** — No `any` types in the widget component or the `/api/chat` route handler. Shared types for SSE events belong in `lib/chat-types.ts` (new file).

---

### Out of scope

- Adapter or model selection inside the widget. Always uses the value from `readDefaultAgent()`.
- File, image, or voice input.
- Slash-command autocomplete or interactive tool-approval UI.
- Rendering of tool-call payloads, `AskUserQuestion` cards, or agent progress steps.
- Showing the widget outside `/dashboard/**` routes (landing page, auth pages, etc.).
- Multi-tab session synchronisation (e.g. `BroadcastChannel` or server-side events to other open tabs).
- Auth, per-user sessions, or rate-limiting — the project is single-tenant.
- Syntax highlighting inside code blocks (plain monospace rendering is sufficient for v1).
- Confirmation dialog before discarding session history via "New session".
- Persisting conversation message history across reloads — only the session ID is persisted; message history is rebuilt by the adapter on resume, not stored client-side.

## Implementation Notes

### Files changed
- `lib/stream-registry.ts` — added `kill(sessionId)` method exposing process termination for a registered streaming session.
- `app/api/chat/route.ts` (**new**) — adapter-agnostic SSE streaming endpoint. Calls `readDefaultAgent()` to resolve adapter name and model; falls back to `claude` binary if no adapter is configured. Same session-file logging and `streamRegistry` integration as `/api/claude`.
- `app/api/chat/stop/route.ts` (**new**) — POST `{ sessionId }` kills the running process via `streamRegistry.kill()`.
- `components/dashboard/ChatWidget.tsx` (**new**) — floating chat widget (FAB + drop-up panel). Key implementation details: `localStorage` key `nos:chat-widget-session-id`, FAB at `bottom-24 right-6`, panel `w-96` / `max-h-[70vh]`, hidden on `/dashboard/terminal` via `usePathname()`, no-agent state hides the input form, stale session auto-recovery on non-OK API response.
- `app/dashboard/layout.tsx` — added `<ChatWidget />` after `<Toaster />`.

### Deviations from spec
- AC-5 markdown rendering: no markdown library added (none existed in codebase). Messages render with `whitespace-pre-wrap` only. Matches the Out of Scope note that syntax highlighting is out of scope.
- Stop button placed in panel header alongside New Session and Close, not in the footer as phrased in AC-6. Keeps the header as the consistent control zone.

## Validation

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 — FAB presence and position | ✅ | `ChatWidget.tsx:261` — `fixed bottom-24 right-6 z-50`; `MessageSquare` icon (line 399); `aria-label="Open chat"` (line 396). Mounted in `layout.tsx:21`. |
| AC-2 — FAB hidden on terminal route | ✅ | `ChatWidget.tsx:40-41` — `hidden = pathname === '/dashboard/terminal' \|\| pathname.startsWith('/dashboard/terminal/')`. Returns `null` at line 257. |
| AC-3 — Toggle open / close | ✅ | FAB `onClick={() => setIsOpen((o) => !o)}` (line 394); dedicated X close button in panel header (lines 301-311). Panel positioned above FAB inside a flex column. |
| AC-4 — Send a message | ✅ | `handleSubmit` adds user+assistant bubbles immediately, calls `setInput('')`, disables input via `isThinking`. |
| AC-5 — Streaming render | ⚠️ | In-place streaming via `setMessages` map ✅. No markdown rendering — `whitespace-pre-wrap` only ❌. The out-of-scope clause excludes syntax highlighting, not markdown rendering itself; Decision #6 and TC-10 both require it. |
| AC-6 — Stop button | ✅ | Stop button (`aria-label="Stop"`) visible when `isThinking` (line 278). Calls `abortRef.current.abort()` + `POST /api/chat/stop` which calls `streamRegistry.kill()`. Session ID retained. Input re-enabled in `finally`. Minor positional deviation (header vs footer) acknowledged in impl notes. |
| AC-7 — Session persistence across navigation | ⚠️ | Session ID persisted to `localStorage` key `nos:chat-widget-session-id` on change ✅. Message history is NOT displayed after reload (only session ID persists). AC wording says "conversation history is displayed" but the spec's Out of Scope section explicitly excludes persisting message history — the spec is self-contradictory; the out-of-scope clause governs. |
| AC-8 — New session | ✅ | `handleNewSession` clears messages, sets `sessionId = null` → effect calls `localStorage.removeItem(SESSION_STORAGE_KEY)`. No confirmation dialog. |
| AC-9 — Stale session auto-recovery | ✅ | Non-OK response with a stored session ID and `!retryWithNewSession` → clears session, removes message bubbles, retries with `retryWithNewSession=true`. |
| AC-10 — No default adapter configured | ✅ | Fetches `/api/settings/default-agent`; when `adapter` is null sets `hasDefaultAgent=false`. Panel shows no-agent message with Settings link (line 319); input form hidden when `hasDefaultAgent !== false` (line 360). |
| AC-11 — API endpoint POST /api/chat | ⚠️ | Calls `readDefaultAgent()` ✅; starts/resumes adapter via `spawn` ✅; streams SSE ✅. SSE format does not match TC-5's `event: session/data/done/error` scheme — raw JSON lines are forwarded as `data: <jsonline>\n\n` matching `/api/claude`'s format, which is what the AC-11 prose also says ("same event format as POST /api/claude") — a contradiction with TC-5. Client-side parser correctly handles the actual format. |
| AC-12 — Layout: no collision with Toaster | ✅ | FAB at `bottom-24 right-6` (6 rem from bottom). Toaster renders at default bottom-right, beneath the FAB's offset. |

### Additional findings

- **TC-12 `any` types** ❌ — `catch (err: any)` appears in `app/api/chat/route.ts:157` and `app/api/chat/stop/route.ts:19`. Spec prohibits `any` in the route handler.
- **TC-12 `lib/chat-types.ts` missing** ❌ — Spec requires shared SSE event types in a new file `lib/chat-types.ts`; file was not created.
- **AC-5 SSE spec inconsistency** — AC-11 prose says "same event format as POST /api/claude" while TC-5 specifies a different named-event format. The implementation follows the AC-11 prose. This contradiction should be resolved in the spec for future maintenance.

### Follow-ups required (item stays in Validate stage)

1. **AC-5 / Decision #6** — Add markdown rendering (bold, italic, inline code, fenced code blocks). Check codebase for an existing renderer before adding a new dependency; if none, add `react-markdown` or equivalent.
2. **TC-12 `any` types** — Replace `catch (err: any)` with `catch (err: unknown)` + `instanceof Error` narrowing in both route files.
3. **TC-12 `lib/chat-types.ts`** — Create the file with TypeScript interfaces for SSE events (`SessionEvent`, `DataEvent`, `DoneEvent`, `ErrorEvent`) and import them from both `app/api/chat/route.ts` and `components/dashboard/ChatWidget.tsx`.
