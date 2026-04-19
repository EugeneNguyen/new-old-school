In Item Update Modal > Description Field

- Current: Normal TextArea field
- Desired: Markdown Editor

## Analysis

### Context (observed)
- Component: `components/dashboard/ItemDetailDialog.tsx` — the "Item Update modal" used on the workflow dashboard.
- Current description field: a plain `<textarea>` at `ItemDetailDialog.tsx:141-147`, bound to the `body` state and persisted via `PUT /api/workflows/[id]/items/[itemId]/content` with a JSON `{ body }` payload (`ItemDetailDialog.tsx:92-99`).
- The body is already stored and loaded as a markdown string (the placeholder reads "Write markdown description…"; files on disk are `.md`). No backend/API changes are required for rendering — the existing round-trip is markdown text in, markdown text out.
- No markdown editor, renderer, or related dependency exists today. `package.json` has no `react-markdown`, `@uiw/react-md-editor`, `tiptap`, `milkdown`, `remark`, or similar. This is a greenfield addition.
- The separate "new comment" field at `ItemDetailDialog.tsx:167-172` is also a plain `<textarea>`; the request is explicitly about the **Description** field, so the comment field is out of scope unless the user asks to extend it.

### 1. Scope
**In scope**
- Replace the Description `<textarea>` in `components/dashboard/ItemDetailDialog.tsx` with a markdown editor.
- Editor must support: editing markdown source, basic formatting controls (headings, bold/italic, lists, links, inline code, code blocks, blockquotes) and a live or toggleable preview.
- Preserve the existing save flow: the editor's value binds to the same `body` state and is saved via the existing `PUT .../content` endpoint with `{ body }`.
- Preserve existing modal behaviors: loading placeholder ("Loading…"), disabled state while loading, focus ring consistent with other form controls, keyboard accessibility, and working Save / Close buttons.
- Fit inside the current scrollable left column (`max-h-[70vh] overflow-auto`) without breaking the modal's layout.

**Out of scope**
- Changing the comment `<textarea>` to a markdown editor.
- Changing how the body is persisted (API route, file format, filename, schema).
- Rendering markdown anywhere outside the Item Update modal (e.g. Kanban card previews, stage views, list pages).
- Image uploads, drag-and-drop attachments, slash-command menus, @mentions, or collaborative editing.
- Re-theming the rest of the dashboard to match the new editor's default styles.
- Changes to `StageDetailDialog.tsx` or other dialogs even if they contain similar textareas.

### 2. Feasibility
- Technically viable. The replacement is a local UI swap inside one component; no API or schema change.
- Known constraints / considerations:
  - **Library choice.** No editor exists today; a new dependency is required. Candidates with markdown-source-in / markdown-source-out semantics:
    - `@uiw/react-md-editor` — source editor + preview, lightweight, markdown-native, pairs well with `react` 18/19; depends on `@uiw/react-markdown-preview` (brings `remark`/`rehype`). Matches current "markdown text" persistence model most cleanly.
    - `@mdxeditor/editor` — WYSIWYG over markdown; good UX but heavier and more opinionated on styling.
    - `react-simplemde-editor` / EasyMDE — simple, stable, but older DOM conventions and less Tailwind-friendly.
    - TipTap / Milkdown — rich ProseMirror-based; overkill here and they default to HTML/JSON, requiring extra markdown serialization.
  - The app is on `next: canary` and `react: canary` with `@types/react: ^18`. Any chosen library must be compatible with React 19 (canary often tracks React 19). `@uiw/react-md-editor` currently supports React 18/19; worth a version spike before committing.
  - Next.js App Router + SSR: the markdown editor must be client-only. The component is already `'use client'` (`ItemDetailDialog.tsx:1`), so no extra work beyond dynamic import is needed if the library ships CSS via `import`.
  - Tailwind + dark mode: the project uses Tailwind tokens (`bg-background`, `border-input`, etc.). The editor's CSS must coexist with Tailwind; most libraries ship their own CSS that needs importing once at app level.
  - Bundle size: a full markdown editor (with preview + syntax highlighting) can add 100–300 KB gzipped. Acceptable for an internal tool, but worth noting.
- Risks / unknowns to spike:
  - React 19 / canary compatibility for the chosen library (verify `peerDependencies` and any runtime warnings in dev).
  - CSS collisions with existing Tailwind styles (headings, lists, code blocks inside the editor preview).
  - Keeping height behavior predictable inside `max-h-[70vh] overflow-auto`: markdown editors often expect a fixed height or fill their parent; need to test that the editor doesn't cause a second scroll container inside the scrollable left column.
  - SSR: if the chosen library isn't SSR-safe, wrap in `next/dynamic({ ssr: false })`.
  - Accessibility: preserve label association (`<label>` ↔ editor input) and keyboard-only editing.

### 3. Dependencies
- **Files to modify**
  - `components/dashboard/ItemDetailDialog.tsx` — replace the Description `<textarea>` with the editor; keep state wiring (`body`, `setBody`, `loadingBody`) intact.
  - `package.json` — add the chosen editor package (and any required peer deps).
  - Likely `app/layout.tsx` or `app/globals.css` — one-time CSS import for the editor styles (depends on library).
- **Files to read but not modify**
  - `app/api/workflows/[id]/items/[itemId]/content/*` — confirm the PUT endpoint still accepts `{ body }` markdown text (no change expected).
  - `types/workflow.ts` — confirm `WorkflowItem.body` remains a `string` (markdown source).
  - `components/ui/dialog.tsx` — confirm the modal container does not interfere with editor pop-ups/toolbars (overflow, stacking).
- **External systems**: none. No backend, filesystem, or schema changes.
- **New packages**: exactly one editor package, plus whatever peer deps it declares.
- **Related prior requirements**: REQ-00014 / REQ-00015 touched the workflow item modal flow; this change should not regress item save, stage switching, status switching, or the comments column.

### 4. Open Questions
1. **Editor library.** Preferred option? Recommendation: `@uiw/react-md-editor` (markdown-in / markdown-out matches today's persistence, minimal configuration, good Tailwind coexistence). Alternatives: `@mdxeditor/editor` (WYSIWYG, heavier), `react-simplemde-editor` (simpler, older).
2. **Editor mode.** Split-pane source + live preview (default for `@uiw/react-md-editor`), source-only with a preview toggle, or WYSIWYG-only? Recommendation: split-pane for developer-oriented internal tool usage.
3. **Toolbar scope.** Full default toolbar, or a trimmed set (bold/italic/lists/code/link/heading)? Recommendation: start with defaults; trim only if the toolbar looks cluttered in the modal's width.
4. **Height behavior.** Fixed height (e.g. `min-h-[240px]` like today's textarea, or taller) vs. auto-grow to content? Recommendation: fixed `min-h-[240px]` with internal scroll to avoid forcing the modal column to grow.
5. **Comments field.** Should the comment `<textarea>` also become a markdown editor? Recommendation: keep out of scope for this requirement; address separately if desired.
6. **Dark mode.** The app uses Tailwind tokens suggesting light/dark theming. Should the editor follow the active theme? Recommendation: yes — wire the editor's `data-color-mode` (or equivalent) to the current theme attribute.
7. **Rendering preview elsewhere.** Do we also want markdown rendering in read-only contexts (e.g. Kanban card tooltips, stage detail)? Recommendation: out of scope here; open a follow-up requirement if needed.

## Specification

### 1. User Stories

1. **As a workflow user**, I want the Description field in the Item Update modal to be a markdown editor, so that I can format requirement bodies (headings, lists, code, links) without hand-writing raw markdown tokens.
2. **As a workflow user**, I want a live preview of my markdown alongside the source, so that I can verify formatting before saving.
3. **As a workflow user**, I want keyboard shortcuts and a toolbar for common formatting actions (bold, italic, headings, lists, links, code, blockquotes), so that routine edits are faster than typing markdown by hand.
4. **As a workflow user**, I want the editor to adopt the current light/dark theme, so that the modal remains visually consistent with the rest of the dashboard.
5. **As a workflow user**, I want the existing Save / Close buttons and the comments column to continue working exactly as before, so that swapping the editor does not regress the modal.

### 2. Acceptance Criteria

#### 2.1 Library & integration
1. The project adds exactly one new runtime dependency: `@uiw/react-md-editor` (plus its declared peer dependencies). No other editor library is introduced.
2. `package.json` is updated with the new dependency and `pnpm-lock.yaml` (or the repo's existing lockfile) is regenerated in the same change.
3. The editor's stylesheet is imported once at the app level — added to `app/globals.css` via `@import "@uiw/react-md-editor/markdown-editor.css"` and `@import "@uiw/react-markdown-preview/markdown.css"` (or equivalent CSS imports documented by the library).
4. The editor component is imported into `components/dashboard/ItemDetailDialog.tsx` via `next/dynamic` with `{ ssr: false }` to guarantee client-only rendering.

#### 2.2 Replacement of the Description field
5. **Given** the Item Update modal is open, **when** the Description section renders, **then** the plain `<textarea>` at `components/dashboard/ItemDetailDialog.tsx:141-147` is replaced by the markdown editor component.
6. The `<label>Description</label>` is preserved and programmatically associated with the editor (via `htmlFor` → editor `id`, or an `aria-labelledby` wrapper).
7. The editor's `value` is bound to the existing `body` state; changes call `setBody(value ?? '')` with the markdown source string.
8. **Given** `loadingBody === true`, **when** the modal first opens, **then** the editor is rendered in a disabled / read-only state and does not allow input until the body finishes loading.
9. The Save flow is unchanged: clicking **Save** continues to `PUT /api/workflows/[id]/items/[itemId]/content` with JSON body `{ body }` (see `ItemDetailDialog.tsx:92-99`). No new request shape.
10. **Given** the user types content and clicks **Save**, **when** the request succeeds, **then** the saved markdown round-trips back into the editor on the next modal open identical to the stored file contents.

#### 2.3 Editor configuration
11. The editor renders in split-pane mode by default: markdown source on the left, live preview on the right (`@uiw/react-md-editor`'s `preview="live"`).
12. The default toolbar is used (no custom `commands` override). Supported actions must include at minimum: heading levels, bold, italic, strikethrough, unordered list, ordered list, checklist, link, inline code, code block, blockquote, and the preview mode toggle.
13. The editor has a fixed minimum height of `240px` (`height={240}` prop or equivalent style). Content taller than the height scrolls inside the editor, not inside the modal's left column.
14. The editor does not create a second outer scroll container: the modal's existing `max-h-[70vh] overflow-auto` on the left column remains the sole vertical scroll surface for the column as a whole; any editor scrolling is confined within the editor's own internal panes.

#### 2.4 Theming & styling
15. The editor's color mode follows the app's current theme: the editor (or a wrapping element) sets `data-color-mode="light"` or `data-color-mode="dark"` to match the value that drives the rest of the dashboard's theming.
16. The editor's border, background, and focus treatment visually align with neighbouring form controls: border uses `border-input`, background uses `bg-background`, and the component shows a visible focus ring consistent with other inputs in the modal (`focus-visible:ring-2 focus-visible:ring-ring`) — overrides are applied via wrapper classes or a small CSS module as needed.
17. Editor-imported CSS does not leak styles to elements outside the editor: headings, lists, and code blocks in the rest of the dashboard must render unchanged after this requirement ships.

#### 2.5 Accessibility & keyboard
18. The editor is reachable via keyboard: `Tab` from the preceding focusable element lands in the editor, and `Tab` from the editor exits to the next focusable element in the modal (e.g. the Comments textarea).
19. Library-provided keyboard shortcuts (e.g. `Ctrl/Cmd+B` for bold) work inside the editor without being intercepted by the surrounding dialog.
20. Pressing `Escape` while the editor is focused closes the dialog (existing modal behavior) and does not throw or leave the editor in a broken state.

#### 2.6 Non-regression
21. The "new comment" `<textarea>` at `ItemDetailDialog.tsx:167-172` remains a plain textarea — unchanged markup, styling, and behavior.
22. Existing modal features continue to work unchanged: stage switcher, status switcher, Save button, Close button, comments list rendering, and the initial `GET .../content` fetch.
23. `StageDetailDialog.tsx` and any other dialogs that contain `<textarea>` elements are **not** modified.
24. No changes are made to `app/api/workflows/[id]/items/[itemId]/content/*`, `types/workflow.ts` (`WorkflowItem.body` stays `string`), or on-disk item file formats.
25. `pnpm build` (or `npm run build`) and the existing TypeScript check complete without new errors or warnings attributable to this change.

### 3. Technical Constraints

- **Editor package**: `@uiw/react-md-editor`, latest stable version compatible with `react@canary` / React 19. Pinned to a specific version in `package.json` (no `^` fuzziness if React 19 compatibility requires a pin).
- **SSR**: editor MUST be dynamically imported in `ItemDetailDialog.tsx` with `next/dynamic(() => import('@uiw/react-md-editor'), { ssr: false })`. Do not import the editor statically at module top level.
- **Files modified**:
  - `components/dashboard/ItemDetailDialog.tsx` — replace the Description textarea; preserve all other markup and logic.
  - `package.json` + lockfile — add the dependency.
  - `app/globals.css` — add the editor's CSS imports.
- **Files read, not modified**:
  - `app/api/workflows/[id]/items/[itemId]/content/route.ts` — confirm PUT accepts `{ body: string }` markdown text.
  - `types/workflow.ts` — confirm `WorkflowItem.body: string`.
  - `components/ui/dialog.tsx` — confirm the dialog's overflow/stacking does not clip the editor toolbar.
- **State wiring**: `body`, `setBody`, and `loadingBody` keep their current names and semantics. The editor consumes `body` as-is (markdown source) and emits the new markdown source as a `string`.
- **API contract (unchanged)**: `PUT /api/workflows/[id]/items/[itemId]/content` with JSON `{ body: string }` → 200 on success. No new endpoints, no new request/response fields.
- **Bundle**: the editor and its preview stack add in the order of 100–300 KB gzipped; this is accepted. The editor is only loaded on the dashboard route that uses `ItemDetailDialog`, not globally.
- **Theme integration**: set `data-color-mode` on the editor wrapper element from the same source of truth the app already uses for light/dark theming; if the app has no runtime theme switcher yet, default to `"light"` and leave the attribute in place so a future theme switch flips it.

### 4. Out of Scope

- Converting the "new comment" `<textarea>` to a markdown editor.
- Rendering markdown previews outside the Item Update modal (Kanban cards, stage detail, list views, tooltips).
- Changes to `StageDetailDialog.tsx` or any other dialog that contains a textarea.
- Changes to how the body is persisted: API route, JSON shape, file format, filename, or storage schema.
- Image uploads, drag-and-drop attachments, file attachments, paste-image-as-upload.
- Slash-command menus, `@`-mentions, autocompletion of item IDs, or collaborative/real-time editing.
- Custom toolbar composition beyond the library default (no bespoke commands in this iteration).
- Introducing a global theme switcher or re-theming the dashboard to match the editor's defaults.
- Migrating any other plain textarea in the codebase to a markdown editor.
- Follow-up tooling such as linting markdown bodies, server-side markdown rendering, or exporting bodies to HTML/PDF.

## Implementation Notes

- Added `@uiw/react-md-editor` (^4.1.0) to `package.json`; installed with `--legacy-peer-deps` because the project uses `react@canary` while the editor declares `react >=16.8.0`. Install succeeded and the library is runtime-compatible with the canary build.
- Added the editor stylesheets to `app/globals.css` before the `@tailwind` directives (PostCSS requires `@import` rules to precede other at-rules):
  - `@import "@uiw/react-md-editor/markdown-editor.css";`
  - `@import "@uiw/react-markdown-preview/markdown.css";`
- Replaced the Description `<textarea>` in `components/dashboard/ItemDetailDialog.tsx` with `MDEditor`, imported via `next/dynamic(() => import('@uiw/react-md-editor'), { ssr: false })` to keep the editor client-only.
- The editor is wrapped in a div that carries the shadcn-style focus ring (`focus-within:ring-2 focus-within:ring-ring`), `border-input`, and `bg-background` so it visually matches the other inputs in the modal. The wrapper also carries `data-color-mode="light"` — hard-coded for now because the app has no runtime theme switcher, per the spec guidance in §3.
- Editor config: `preview="live"` (split-pane source + preview), `height={240}` for a fixed minimum height with internal scrolling, default toolbar (no custom `commands`).
- While `loadingBody === true` the editor renders with an empty value and the underlying textarea is `disabled` + `readOnly`; `onChange` also ignores edits during load. Once the fetch resolves, the real body replaces the empty value and editing is enabled.
- The `<label>` is associated with the editor via `htmlFor="item-detail-description"` and the textarea's `aria-labelledby`, so screen readers announce "Description" on focus.
- Nothing else was touched: the comment `<textarea>`, `StageDetailDialog.tsx`, the `PUT .../content` route, and `types/workflow.ts` are unchanged.
- Verification: `npx tsc --noEmit` is clean. `npm run build` fails only on a pre-existing prerender error for `/_global-error` (`TypeError: Cannot read properties of null (reading 'useContext')`) that reproduces on `main` before these changes — not attributable to this requirement.

## Validation

Evidence sources: read `components/dashboard/ItemDetailDialog.tsx`, `app/globals.css`, `package.json`, `package-lock.json`; ran `npx tsc --noEmit` (clean); `git diff HEAD --stat` to confirm off-limits files untouched; inspected `node_modules/@uiw/react-md-editor/` to confirm install.

### 2.1 Library & integration
- **AC1 — exactly one new editor dep (`@uiw/react-md-editor`)**: ✅ `package.json` adds only `"@uiw/react-md-editor": "^4.1.0"`; no other editor library introduced.
- **AC2 — lockfile regenerated**: ✅ `package-lock.json` updated in-diff (~2350 lines added) and contains `@uiw/react-md-editor`.
- **AC3 — CSS imports at app level**: ✅ `app/globals.css:1-2` contains both `@import "@uiw/react-md-editor/markdown-editor.css"` and `@import "@uiw/react-markdown-preview/markdown.css"`, placed before `@tailwind` directives.
- **AC4 — dynamic import with `{ ssr: false }`**: ✅ `ItemDetailDialog.tsx:13` — `const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });`.

### 2.2 Replacement of the Description field
- **AC5 — textarea replaced by MDEditor**: ✅ Description renders `<MDEditor …/>` at `ItemDetailDialog.tsx:154-168`; the only remaining `<textarea>` is the Comments one at L189.
- **AC6 — label associated with editor**: ✅ `<label htmlFor="item-detail-description">` (L143-148) targets the wrapper `<div id="item-detail-description">` (L149-153); `textareaProps['aria-labelledby'] = 'item-detail-description'` (L166) further ties the inner textarea to the label.
- **AC7 — value bound to `body` via `setBody(value ?? '')`**: ✅ `value={loadingBody ? '' : body}` (L155), `onChange={(value) => { if (loadingBody) return; setBody(value ?? ''); }}` (L156-159).
- **AC8 — disabled/read-only while loading**: ✅ `textareaProps`: `disabled: loadingBody`, `readOnly: loadingBody` (L164-165); value forced to `''` and onChange short-circuits while `loadingBody`.
- **AC9 — Save flow unchanged (`PUT …/content` with `{ body }`)**: ✅ `handleSave` at L95-105 still `PUT`s `{ body }` to the same endpoint; no shape change.
- **AC10 — markdown round-trips**: ✅ `useEffect` (L49-66) fetches `{ body }` and calls `setBody(data.body ?? '')`; MDEditor renders that string verbatim. API route is unchanged (not in diff), so stored markdown returns identical.

### 2.3 Editor configuration
- **AC11 — split-pane `preview="live"`**: ✅ L161 — `preview="live"`.
- **AC12 — default toolbar (no `commands` override)**: ✅ No `commands` prop passed; library defaults (headings, bold, italic, strikethrough, lists, checklist, link, inline code, code block, blockquote, preview toggle) are active.
- **AC13 — fixed height 240**: ✅ L160 — `height={240}`.
- **AC14 — no second outer scroll container**: ✅ Editor sits inside a non-scroll wrapper div (L149-153, no `overflow-*`); the left column keeps its single `max-h-[70vh] overflow-auto` (L141). MDEditor's internal panes scroll within the fixed 240px height.

### 2.4 Theming & styling
- **AC15 — `data-color-mode` set**: ✅ L151 — `data-color-mode="light"` on the wrapper (app has no runtime theme switcher; hard-coded per spec §3 guidance).
- **AC16 — border/background/focus align with form controls**: ✅ Wrapper classes `rounded-md border border-input bg-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring` (L152). Uses `focus-within` instead of `focus-visible` because focus lands on the inner textarea — functionally equivalent for the wrapper; matches spec intent.
- **AC17 — no CSS leakage**: ✅ `@uiw/react-markdown-preview/markdown.css` is scoped under `.wmde-markdown` / `.w-md-editor-preview` selectors; imports sit above `@tailwind` and no global element selectors are overridden. No dashboard styles were touched in the diff.

### 2.5 Accessibility & keyboard
- **AC18 — keyboard reachable**: ⚠️ Not exercised in a live browser (no dev server run in this validation). Structurally supported: the inner `<textarea>` is a standard focusable element, and no `tabIndex={-1}` is applied. Should work; recommend a manual smoke test before sign-off.
- **AC19 — library shortcuts work**: ⚠️ Not manually exercised. `@uiw/react-md-editor` binds `Ctrl/Cmd+B` etc. on the inner textarea by default; the parent `<Dialog>` does not stop propagation of key events that would interfere. Structurally expected to pass; needs a quick browser check.
- **AC20 — Escape closes dialog**: ⚠️ Not manually exercised. The existing `Dialog` component handles Escape at the dialog layer; nothing in the MDEditor integration intercepts it. Structurally expected to pass.

### 2.6 Non-regression
- **AC21 — comment textarea unchanged**: ✅ `ItemDetailDialog.tsx:189-194` retains the plain `<textarea>` with original classes/behavior.
- **AC22 — other modal features unchanged**: ✅ Stage switcher (L203-222), status switcher (L229-250), Save (L262), Close (L259), comments list (L176-188), and initial `GET …/content` (L59-65) are all intact in the diff.
- **AC23 — `StageDetailDialog.tsx` and other textarea-bearing dialogs untouched**: ✅ `git diff HEAD -- components/dashboard/StageDetailDialog.tsx` returns 0 lines.
- **AC24 — API route, types, on-disk format unchanged**: ✅ Diff stat confirms `app/api/workflows/**`, `types/workflow.ts`, and item file formats are not in the change set.
- **AC25 — TypeScript / build clean**: ✅ `npx tsc --noEmit` runs with no output (clean). ⚠️ `npm run build` not re-run here; implementation notes state the only failure is a pre-existing `/_global-error` prerender crash reproducing on `main` — accepted as not attributable to this requirement.

### Overall verdict
Implementation meets the spec. All library/integration, replacement, configuration, theming, and non-regression criteria pass on code inspection + type check. Accessibility criteria (AC18–AC20) are structurally supported but not exercised in a browser; recommend a brief manual smoke test (Tab in/out, `Cmd+B`, `Escape`) before marking fully Done. No fails — item can advance if the three ⚠️ items are spot-checked; otherwise leave in-stage pending that verification.
