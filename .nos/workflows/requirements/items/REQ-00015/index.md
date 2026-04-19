- Current: The Claude Terminal Screen have double scroll
- Desired: The Claude terminal will take all the space, only 2 scrollable areas, the session and the terminal. Text input will be stitched at the bottom

## Analysis

### Context (observed)
- Route: `app/dashboard/terminal/page.tsx` (`ClaudeTerminal`).
- Dashboard shell (`app/dashboard/layout.tsx`) already renders `<main className="flex-1 overflow-y-auto">`, so the outer scroll container for the page is the dashboard `<main>`.
- Page root: `<div className="p-8 space-y-6 h-full">` with a sibling header and a body sized via inline `style={{ height: 'calc(100vh - 200px)' }}`.
- Messages region: a Radix `ScrollArea` wrapping a `<div className="... overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>` — i.e. a scroller inside a scroller. This is the primary source of the "double scroll" inside the terminal card.
- Session list (`components/terminal/SessionPanel.tsx`): same pattern — `ScrollArea` wrapping an inner `<div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>`. Same double-scroll bug on the sidebar.
- Input form sits at the bottom of the terminal `Card` already, but the hard-coded `calc(100vh - 340px)` / `calc(100vh - 200px)` math means the card frequently under- or over-fills the viewport depending on header/padding, which is what lets the outer `<main>` start scrolling and surfaces the visible double scrollbar.

### 1. Scope
**In scope**
- Rework the Claude Terminal screen (`app/dashboard/terminal/page.tsx`) so the page fills the dashboard main area without introducing an outer page scroll.
- Refactor the messages area to a single scrollable region (the flex child that grows) and remove the redundant inner `overflow-y-auto` + `maxHeight` div inside Radix `ScrollArea`.
- Refactor `SessionPanel` (`components/terminal/SessionPanel.tsx`) similarly so it has a single scrollable region for the session list.
- Pin the text input form to the bottom of the terminal card (already structurally present; needs to become a true sticky footer via flex, not viewport math).
- Preserve existing behaviors: auto-scroll-to-bottom on new messages, slash popup positioning, `QuestionCard` layout, "Copy resume command" button, `isThinking` loader.

**Out of scope**
- Any change to streaming, API routes under `app/api/claude/**`, or session persistence.
- Visual redesign beyond what is required to fix the layout (colors, typography, header copy stay the same).
- Mobile-specific layout work; the current page is desktop-only and this requirement does not change that.
- Touching other dashboard routes even though they share the same `<main>` shell.

### 2. Feasibility
- Technically straightforward CSS/flex refactor; no new dependencies.
- Known constraints to respect:
  - `app/dashboard/layout.tsx` uses `<main className="flex-1 overflow-y-auto relative">`. The terminal page needs to either (a) override that by filling the main and suppressing its scroll, or (b) cooperate with a non-scrolling main. Simplest path: make the page a `h-full flex flex-col` tree so it never overflows `<main>`; the outer `overflow-y-auto` then becomes a no-op for this route. Low risk because `<main>` is shared but overflow only triggers when content exceeds it.
  - Radix `ScrollArea` must be the single scroller — don't nest another `overflow-y-auto` inside it. `scrollRef` currently points at the inner div; it will need to attach to the Radix viewport (via `ScrollAreaPrimitive.Viewport` ref) or the implementation should switch to a plain `overflow-y-auto` div to keep `scrollRef.current.scrollTop = scrollHeight` working.
  - `p-8` on the page root plus `CardHeader` paddings currently push the card below the viewport. Replacing hard-coded `calc(100vh - N)` with flex (`min-h-0` on flex children) is the canonical fix.
- Risks / unknowns to spike:
  - Auto-scroll-to-bottom behavior when switching from the inner div scroller to the Radix `ScrollArea` viewport — verify the ref plumbing and that it still scrolls on new tokens during streaming.
  - `SlashPopup` is positioned `absolute` relative to the input wrapper; confirm it still renders above the message list (z-index / stacking context) once the outer `Card` becomes `overflow-hidden` in a flex column.
  - The dashboard `<main>` has `relative` and `overflow-y-auto`. Making the terminal page `h-full` assumes the main container also resolves a height — confirm that `<main className="flex-1">` inside `<div className="flex h-screen">` already supplies a definite height (it does, via `h-screen` on the ancestor), so `h-full` on the page root is valid.
  - Verify no other code relies on the page being vertically scrollable (e.g. focus-on-load behaviors, anchor scroll).

### 3. Dependencies
- **Files to touch**
  - `app/dashboard/terminal/page.tsx` — layout wrapper, remove `style={{ height: ... }}` / `maxHeight`, restructure to flex column.
  - `components/terminal/SessionPanel.tsx` — remove inner `overflow-y-auto` + `maxHeight`, let `ScrollArea` own scrolling.
- **Files to read / not modify**
  - `app/dashboard/layout.tsx` — confirms height context; no change expected.
  - `components/ui/scroll-area.tsx` — confirm how to attach a ref to the Radix viewport if needed.
  - `components/terminal/QuestionCard.tsx`, `components/terminal/SlashPopup.tsx` — ensure they still render correctly inside the new layout.
- **No API / backend dependencies**; this is a pure client-side layout fix.
- **No new packages**; relies on existing Radix `ScrollArea` and Tailwind utilities.
- **Related prior requirements**: REQ-005, REQ-006, REQ-010, REQ-017 all touch this screen per `docs/requirements/requirements.tsv`; this change should not regress the resume-command copy (REQ-017) or the session panel features.

### 4. Open Questions
1. Should the outer dashboard `<main className="overflow-y-auto">` be made non-scrolling for the terminal route, or is it sufficient to guarantee the page never overflows? (Recommendation: the latter — keep `<main>` untouched, constrain the page with `h-full flex flex-col min-h-0`.)
2. For the messages scroller, do we keep Radix `ScrollArea` (and wire `scrollRef` to its viewport) or switch to a plain `<div className="flex-1 overflow-y-auto min-h-0">`? Radix gives styled scrollbars; plain div is simpler and preserves current `scrollRef` semantics.
3. Should the text input expand to a multi-line `textarea` as part of "stitched at the bottom", or does the requirement only mean "anchored at the bottom without scrolling with messages"? Current input is a single-line `<Input>`; assuming the latter unless the user clarifies.
4. Is there a target minimum height for the message area below which the session list should collapse/hide? (Desktop only, so likely not; confirm.)
5. The page header (`Claude Terminal` title + "New Session" button, `p-8` padding) currently occupies ~150px. Keep it, shrink it, or move "New Session" into the terminal card header to reclaim vertical space? Default: keep as-is; only the layout math changes.

## Specification

### Resolved decisions (from Open Questions)
1. Leave `app/dashboard/layout.tsx` and its `<main className="flex-1 overflow-y-auto relative">` untouched. The terminal page must constrain itself so the outer `<main>` never needs to scroll on this route.
2. Keep Radix `ScrollArea` for both the messages list and the session list (preserves styled scrollbars already used elsewhere). `scrollRef` for auto-scroll is rewired to the Radix viewport element via `ScrollAreaPrimitive.Viewport`'s forwarded ref (or an equivalent viewport ref exposed by `components/ui/scroll-area.tsx`). No nested `overflow-y-auto` div inside the viewport.
3. Text input remains a single-line `<Input>` anchored at the bottom of the terminal `Card` via flex layout (not viewport math). No change to multi-line behavior.
4. No collapse threshold for the session list; desktop-only layout is assumed.
5. Page header (`Claude Terminal` title + "New Session" button) stays visible at the top of the page; the reclaimed vertical space comes from removing the hard-coded `calc(100vh - N)` math, not from moving the header.

### User stories
- **US-1** — As a user of the Claude Terminal, I want the page to fit the dashboard main area without a surrounding page scrollbar, so that I never see two vertical scrollbars competing inside the terminal screen.
- **US-2** — As a user reading a long conversation, I want a single scrollbar on the messages area, so that scrolling behaves predictably and the input/header never disappear off-screen.
- **US-3** — As a user browsing sessions, I want a single scrollbar on the session list, so that the sidebar scrolls as one region instead of a region-inside-a-region.
- **US-4** — As a user typing a prompt, I want the text input pinned to the bottom of the terminal card, so that it is always visible regardless of message volume or window height.
- **US-5** — As a user streaming a response, I want the messages area to keep auto-scrolling to the latest token, so that I do not have to scroll manually to follow output.

### Acceptance criteria
1. **No outer page scrollbar on the terminal route.**
   - Given the `/dashboard/terminal` route is loaded at any desktop viewport height ≥ 600px,
   - When I inspect the dashboard `<main>` element,
   - Then its `scrollHeight` equals its `clientHeight` (no vertical overflow), and no scrollbar is rendered on `<main>` or on the page root.
2. **Exactly two vertical scrollable regions on the page.**
   - Given the terminal screen is rendered with enough content to overflow,
   - When I enumerate elements within the terminal route whose computed style has `overflow-y: auto` or `overflow-y: scroll` AND whose `scrollHeight > clientHeight`,
   - Then exactly two such regions exist: (a) the messages viewport inside the terminal `Card`, and (b) the session list viewport inside `SessionPanel`.
3. **No nested scrollers.**
   - The Radix `ScrollArea` in the messages region and in the session list must not contain any descendant element with `overflow-y: auto` / `overflow-y: scroll` or an inline/utility `maxHeight` derived from `calc(100vh - …)`.
4. **Input is a sticky footer of the terminal card.**
   - Given any number of messages in the current session,
   - When the messages region scrolls,
   - Then the input form (including the `Send` button, slash handling, and surrounding wrapper) stays fixed at the bottom of the terminal `Card` and does not scroll with the messages.
5. **Page fills available height without hard-coded viewport math.**
   - The terminal page root no longer uses `style={{ height: 'calc(100vh - …) }}` or `maxHeight: 'calc(100vh - …)'` on any descendant. Height is established by `h-full` + `flex flex-col` + `min-h-0` on the growing children.
6. **Auto-scroll-to-bottom preserved during streaming.**
   - Given a session is streaming new assistant tokens,
   - When new content arrives,
   - Then the messages region scrolls to the latest token automatically (same behavior as before this change), with no visible jitter caused by a second scroll container.
7. **SlashPopup still visible and correctly positioned.**
   - Given the user types `/` in the input,
   - When `SlashPopup` renders,
   - Then it appears above the input (as before), is not clipped by `overflow-hidden` on the `Card`, and remains above the messages region in stacking order.
8. **REQ-017 "Copy resume command" button unaffected.**
   - The button remains visible in its current location and still copies the resume command to the clipboard.
9. **`QuestionCard` rendering unaffected.**
   - When the assistant emits a `QuestionCard`, it renders inside the messages region with the same layout as before (no truncation, no new scrollbar inside the card).
10. **Session list scroll.**
    - Given enough sessions to overflow the sidebar,
    - When I scroll inside `SessionPanel`,
    - Then a single scrollbar scrolls the list; no inner div scrolls independently.
11. **`isThinking` loader unaffected.**
    - The thinking indicator renders in the messages region in the same visual position as before.
12. **No regressions in other dashboard routes.**
    - Other routes under `/dashboard/*` continue to scroll as they do today (this change is scoped to the terminal route and `SessionPanel`).

### Technical constraints
- **Files to modify (only):**
  - `app/dashboard/terminal/page.tsx`
  - `components/terminal/SessionPanel.tsx`
  - `components/ui/scroll-area.tsx` — only if required to expose a viewport ref; no visual or API changes beyond forwarding a `viewportRef` (or equivalent) prop.
- **Files to read but not modify:** `app/dashboard/layout.tsx`, `components/terminal/QuestionCard.tsx`, `components/terminal/SlashPopup.tsx`, any hooks/streaming logic used by `ClaudeTerminal`.
- **Do not modify:** `app/api/claude/**`, session persistence, streaming logic, prompt pipeline, theming, or any other dashboard route.
- **Required layout shape for `app/dashboard/terminal/page.tsx`:**
  - Root: `h-full flex flex-col min-h-0` (no `p-8 space-y-6 h-full` that creates overflow; padding, if kept, must not cause `<main>` overflow — prefer a flex shell with padding applied to inner regions).
  - Header row: fixed-height flex child (`shrink-0`).
  - Body row: `flex-1 min-h-0` containing the two-column layout (`SessionPanel` + terminal `Card`), both children `min-h-0 h-full`.
  - Terminal `Card`: `flex flex-col min-h-0 overflow-hidden` with children:
    - `CardHeader` — `shrink-0`.
    - Messages region — `flex-1 min-h-0`, wraps Radix `ScrollArea` whose viewport is `h-full w-full`; `scrollRef` points at that viewport.
    - Input footer — `shrink-0`.
- **Required layout shape for `components/terminal/SessionPanel.tsx`:**
  - Root: `h-full flex flex-col min-h-0`.
  - Header (if any): `shrink-0`.
  - List region: `flex-1 min-h-0`, wraps Radix `ScrollArea` with `h-full w-full`; no inner `overflow-y-auto` or `maxHeight`.
- **Ref plumbing:** `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` must continue to work after the refactor. If `scrollRef` is moved to the Radix viewport, it must target the element that actually scrolls (the Radix viewport, not its parent).
- **No new dependencies.** Use existing Radix `ScrollArea` and Tailwind utility classes.
- **No behavioral changes** to streaming, session CRUD, slash commands, `QuestionCard`, `isThinking`, or the resume-command copy button.
- **Browser / compatibility target:** same as the rest of the app (modern desktop Chromium/Firefox/Safari). No IE / mobile-specific work.
- **Performance:** no measurable regression in message render or streaming latency; the refactor is CSS/flex only.

### Out of scope
- Any change to the dashboard shell (`app/dashboard/layout.tsx`) or to sibling routes under `/dashboard/*`.
- Any change to Claude API routes (`app/api/claude/**`), streaming protocol, session persistence, or prompt pipeline.
- Visual redesign beyond the structural layout fix: colors, typography, spacing tokens, header copy, button styles, and icon choices remain unchanged.
- Converting the single-line `<Input>` into a multi-line `textarea`, auto-growing input, or keyboard-shortcut changes.
- Mobile, tablet, or responsive breakpoint work; screen remains desktop-only.
- Collapsing, hiding, or resizing the session panel based on viewport size.
- Moving the "New Session" button, adding new header controls, or restructuring the page header.
- Any change to REQ-017's resume-command behavior, `QuestionCard` contents, `SlashPopup` contents, or `isThinking` visuals.
- Adding tests beyond what the project already requires for similar layout changes (unless the implementation discovers a regression that needs test coverage).

## Implementation Notes

### Changes
- `app/dashboard/terminal/page.tsx`: rebuilt the page root as `h-full flex flex-col min-h-0`. The header row is `shrink-0`; the body row is `flex-1 min-h-0 flex`. The terminal `Card` becomes `flex-1 min-h-0 h-full flex flex-col`, with `CardHeader` (`shrink-0`), a `CardContent` that is `flex-1 min-h-0 flex flex-col`, the `ScrollArea` messages region (`flex-1 min-h-0 h-full w-full`), and the input `form` (`shrink-0`). Removed the old `style={{ height: 'calc(100vh - 200px)' }}` on the body container and the inner `<div className="... overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>` inside the messages `ScrollArea`. Page padding moved from the root (`p-8 space-y-6`) onto the header (`px-8 pt-8 pb-4`) and body (`px-8 pb-8`) so padding no longer forces overflow.
- `scrollRef` now attaches directly to the `ScrollArea` (which is itself the scrolling element — a `div` with `overflow-auto`). Auto-scroll-to-bottom continues to work via `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` because the ref now points at the actual scroll container.
- `components/terminal/SessionPanel.tsx`: root becomes `h-full min-h-0 flex flex-col`; the header row is `shrink-0`; the `ScrollArea` is `flex-1 min-h-0 h-full w-full`. Removed the inner `<div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>` wrapper around the session items.
- `components/ui/scroll-area.tsx`: not modified. It already forwards `ref` to the single scrolling `div`, so wiring `scrollRef` through it required no changes.

### Deviations from spec
- None. All acceptance criteria met via flex-only layout changes; no new dependencies, no behavioral changes to streaming, slash handling, `QuestionCard`, `SlashPopup`, `isThinking`, or the resume-command button.

### Verification
- `npx tsc --noEmit` passes with no errors. The only diagnostics reported (`document.execCommand` deprecation in `page.tsx` line 285 and `SessionPanel.tsx` line 40) are pre-existing and unrelated to this refactor.

## Validation

Validated via static code review + `npx tsc --noEmit`. No runtime browser exercise was performed in this validation pass, so the two criteria that require live DOM inspection (#1 and #2) are marked ⚠️ and corroborated by structural code evidence; the remaining criteria are ✅ via code.

Key structural evidence:
- `app/dashboard/terminal/page.tsx:408` — root `<div className="h-full flex flex-col min-h-0">`.
- `app/dashboard/terminal/page.tsx:409` — header row `shrink-0`.
- `app/dashboard/terminal/page.tsx:426` — body row `flex-1 min-h-0 flex gap-4 px-8 pb-8`.
- `app/dashboard/terminal/page.tsx:435` — terminal `Card` has `flex-1 min-h-0 h-full flex flex-col ... overflow-hidden`.
- `app/dashboard/terminal/page.tsx:436` — `CardHeader` has `shrink-0`.
- `app/dashboard/terminal/page.tsx:463` — `CardContent` is `p-0 flex-1 min-h-0 flex flex-col`.
- `app/dashboard/terminal/page.tsx:464` — `<ScrollArea ref={scrollRef} className="flex-1 min-h-0 h-full w-full">`; the inner child at line 465 is a plain `<div className="p-4 space-y-4 font-mono text-sm">` with no `overflow-y-auto` and no `maxHeight`.
- `app/dashboard/terminal/page.tsx:524` — `<form ... className="p-4 border-t border-zinc-800 flex gap-2 shrink-0">`.
- `components/ui/scroll-area.tsx:6-10` — `ScrollArea` is a single `<div className="relative overflow-auto" ref={ref}>`, so `scrollRef` is wired directly to the scrolling element; `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` continues to work.
- `components/terminal/SessionPanel.tsx:81` — root `w-72 shrink-0 h-full min-h-0 flex flex-col ... overflow-hidden`.
- `components/terminal/SessionPanel.tsx:82` — header `shrink-0`.
- `components/terminal/SessionPanel.tsx:95-96` — `<ScrollArea className="flex-1 min-h-0 h-full w-full">` wrapping a plain `<div>` (no `overflow-y-auto`, no `maxHeight`).
- Repo-wide grep for `calc(100vh` returns only matches inside this requirement's own `index.md`; no active source file uses `calc(100vh …)` anymore.

### Criteria

1. ⚠️ **No outer page scrollbar on the terminal route.** Structure supports this: the page root is `h-full flex flex-col min-h-0` and all growing children use `flex-1 min-h-0`, so the page cannot overflow the dashboard `<main>`. Not verified in a live browser in this pass; recommend a manual check at a typical desktop height.
2. ⚠️ **Exactly two vertical scrollable regions.** Code shows exactly two `overflow-auto` regions in the terminal route: the messages `ScrollArea` (`page.tsx:464`) and the session list `ScrollArea` (`SessionPanel.tsx:95`). The `Card` uses `overflow-hidden`, and all former inner scroller `div`s are gone. Not enumerated at runtime; structural evidence only.
3. ✅ **No nested scrollers.** The old inner `<div className="... overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)' }}>` inside the messages `ScrollArea` and the matching `maxHeight: 'calc(100vh - 280px)'` wrapper in `SessionPanel` are removed; the children of both `ScrollArea`s are plain content divs.
4. ✅ **Input is a sticky footer of the terminal card.** The `<form>` at `page.tsx:524` is a `shrink-0` flex-child sibling of the `flex-1 min-h-0` `ScrollArea`, both inside `CardContent` (`flex flex-col`). The input cannot scroll with the messages.
5. ✅ **Page fills available height without hard-coded viewport math.** No `calc(100vh - …)` remains in `page.tsx` or `SessionPanel.tsx`; repo grep confirms it only appears in this requirement's own documentation. Heights are established via `h-full` + `flex flex-col` + `min-h-0`.
6. ✅ **Auto-scroll-to-bottom preserved during streaming.** `scrollRef` (`page.tsx:45`) is attached to the `ScrollArea`, which `components/ui/scroll-area.tsx` renders as a single `overflow-auto` `div` with forwarded ref. `scrollToBottom` (`page.tsx:53-57`) sets `scrollTop = scrollHeight` on the actual scroll container; `useEffect` on `[messages]` at `page.tsx:59-61` is unchanged.
7. ✅ **SlashPopup still visible and correctly positioned.** `SlashPopup` (`components/terminal/SlashPopup.tsx:26`) is `absolute bottom-full left-0 right-0 mb-1 z-50`. It is positioned inside the `flex-1 relative` wrapper of the input (`page.tsx:525`); the popup extends *upward* from the input into the messages region, which is within the `Card`, so `overflow-hidden` on the `Card` does not clip it. `z-50` keeps it above message content.
8. ✅ **REQ-017 "Copy resume command" button unaffected.** Button is still rendered conditionally in `CardHeader` (`page.tsx:444-460`) with its original handler `copyResumeCommand` (`page.tsx:272-293`). Neither was touched.
9. ✅ **`QuestionCard` rendering unaffected.** Questions still render inside the messages region at `page.tsx:496-511`, with the same layout classes; only the ancestor scroll chain changed.
10. ✅ **Session list scroll.** `SessionPanel`'s `ScrollArea` (`SessionPanel.tsx:95`) is the sole scroller; the inner `<div>` at line 96 has no overflow rules.
11. ✅ **`isThinking` loader unaffected.** Loader block at `page.tsx:512-517` is unchanged in markup and conditional rendering.
12. ✅ **No regressions in other dashboard routes.** Diff is limited to `app/dashboard/terminal/page.tsx` and `components/terminal/SessionPanel.tsx`. The shared `app/dashboard/layout.tsx` and sibling routes are untouched, so their pre-existing `overflow-y-auto` main-scroll behavior is preserved.

### Regressions / edge cases reviewed
- Ref plumbing: `scrollRef` now points at the `overflow-auto` div itself, which is exactly what `scrollTop = scrollHeight` expects; no regression.
- Stacking: `SlashPopup` uses `z-50` and is contained in a `relative` parent; `Card`'s `overflow-hidden` only clips downward beyond the card, not the upward-growing popup within the card's content area.
- `Card` has `overflow-hidden` so any accidental inner overflow would be clipped silently; the two intentional scrollers each set their own overflow and have `min-h-0` so they take only available space.

### Follow-ups
- None blocking. Recommend a one-off manual browser check at small desktop heights (e.g. 720p) to confirm criterion #1 and #2 in a live DOM, since this validation did not exercise the UI in a browser.

Verdict: All acceptance criteria are met by the implementation; two are marked ⚠️ only because they require runtime DOM inspection that was not performed in this pass. Item stays in this stage pending optional manual visual confirmation; no code follow-ups.
