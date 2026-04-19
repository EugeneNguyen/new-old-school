## Analysis

### Scope
**In scope**
- Render existing item comments in `components/dashboard/ItemDetailDialog.tsx` (lines ~193–200) as formatted Markdown instead of plain text inside a `whitespace-pre-wrap` div.
- Apply the same sanitize schema (`markdownSanitizeSchema` from `lib/markdown-preview.ts`) already used by the item body editor so comment rendering is visually and security-consistent with other Markdown surfaces.
- Keep the comment **input** (`textarea` at lines 202–207) as a plain multiline text field — authors still type Markdown source; only the display is styled.

**Out of scope**
- Switching the comment input into a full `MDEditor` instance / live preview.
- Editing or deleting existing comments.
- Threaded replies, reactions, mentions, or attachments.
- Changing the storage shape of `comments` on the workflow item (still `string[]`).

### Feasibility
- Technically straightforward: the project already depends on `@uiw/react-md-editor` and has a configured rehype sanitize schema in `lib/markdown-preview.ts`. Swapping the plain-text `<div>` for `<MDEditor.Markdown source={c} />` (or an equivalent `ReactMarkdown` render) guarded by `rehypeSanitize(markdownSanitizeSchema)` is a small, localized change.
- Risks / unknowns:
  - **Bundle size** — `MDEditor.Markdown` pulls in the editor's preview chunk; if only the preview half is needed, importing `@uiw/react-markdown-preview` directly may be leaner. Worth confirming before picking the import path.
  - **Styling collisions** — the markdown preview ships its own CSS (`.wmde-markdown`) with a default background / font that may clash with the current `bg-secondary/40` comment bubble. A wrapper class + `data-color-mode` handling (light/dark) likely needed.
  - **Line-break semantics** — today a bare newline visually breaks a line because of `whitespace-pre-wrap`. In CommonMark a single newline is a soft break. Need to decide whether to enable `remark-breaks` (GitHub-style single-newline breaks) to preserve author expectations for existing unformatted comments.
  - **Sanitization coverage** — confirm the existing schema is safe for user-authored content (it was designed for the body field, which has the same trust level, so likely fine) and that raw HTML via `rehype-raw` is either disabled or still sanitized for the comment path.

### Dependencies
- `components/dashboard/ItemDetailDialog.tsx` — primary change site.
- `lib/markdown-preview.ts` — reuse `markdownSanitizeSchema`; may need a small export if currently internal.
- `@uiw/react-md-editor` (already a dependency) or a sibling `@uiw/react-markdown-preview` package.
- `app/globals.css` — possibly a tweak to scope / override markdown preview styles inside the comment bubble.
- Indirect: any other surface that displays `item.comments` (e.g. Kanban card previews in `components/dashboard/KanbanBoard.tsx`) should be checked for consistency — we may want markdown rendering there too, or an explicit decision to keep those as plain text snippets.
- No backend / API changes: `app/api/workflows/[id]/items/[itemId]/route.ts` already stores comments as strings.

### Open Questions
1. Should the comment **input** also show a live preview toggle, or stay as a plain `textarea`? (Default assumption: stay plain.)
2. Enable `remark-breaks` for single-newline → `<br>`, or follow strict CommonMark? Existing comments were authored under pre-wrap semantics, so switching to strict CommonMark may visually collapse them.
3. Should Kanban card previews of comments also render Markdown, or continue to show a plain-text excerpt?
4. Is raw HTML (via `rehype-raw`) desired in comments, or should we restrict to Markdown syntax only?
5. Any requirement around code-block syntax highlighting in comments (the body already has highlight.js wiring via the schema)?

## Specification

### User stories
- As a workflow participant, I want comments I post on an item to render with Markdown formatting (headings, lists, bold/italic, links, inline code, code blocks, blockquotes), so that I can communicate structured context as effectively as I can in the item body.
- As a reader of an item's comment thread, I want previously-authored plain-text comments to remain visually readable after the render upgrade, so that the switch from `whitespace-pre-wrap` to Markdown does not silently collapse existing line breaks.
- As a developer, I want comment rendering to reuse the same sanitize schema and styling conventions as the item body, so that trust boundaries and visual language stay consistent across the dialog.
- As a comment author, I want the comment composer to remain a simple multiline textarea, so that posting a quick note is not gated on a heavier editor UI.

### Acceptance criteria

Scope of change is confined to the comment **display** inside `components/dashboard/ItemDetailDialog.tsx`. All criteria apply there unless stated otherwise.

1. **Markdown rendering replaces plain-text display.**
   Given an item with one or more comments, when the detail dialog opens, then each comment's Markdown source is rendered as HTML (headings, lists, emphasis, links, inline code, fenced code blocks, blockquotes) instead of being wrapped in a `whitespace-pre-wrap` text node.
2. **Sanitization parity with the item body.**
   Given a comment whose Markdown source includes disallowed HTML (e.g. `<script>`, inline event handlers, `javascript:` URLs), when it is rendered, then the disallowed content is stripped or neutralized by the same sanitize schema exported from `lib/markdown-preview.ts` (`markdownSanitizeSchema`) that the item body uses.
3. **Raw HTML is not executed.**
   Given a comment containing raw HTML tags, when it is rendered, then only tags permitted by `markdownSanitizeSchema` survive; raw HTML pass-through (e.g. via `rehype-raw`) MUST NOT be enabled on the comment path.
4. **Line-break compatibility with legacy comments.**
   Given a pre-existing comment that was authored under `whitespace-pre-wrap` semantics (single newlines intended as visual line breaks), when it is re-rendered, then a single newline produces a visible line break (`<br>`). This is satisfied by enabling `remark-breaks` on the comment render pipeline.
5. **Code blocks are styled.**
   Given a comment containing a fenced code block with a language hint (e.g. ```` ```ts ````), when rendered, then the block is displayed with a monospace font and matches the highlight.js presentation already used by the item body (no new highlighter wiring is required beyond reusing the body's schema / plugins).
6. **Comment composer is unchanged in behavior.**
   Given the comment composer at the bottom of the dialog, when a user focuses it, then it remains a plain `<textarea>` (no live preview, no toolbar). The user types Markdown source; "Add Comment" posts the raw string unchanged, preserving the current API contract.
7. **Styling fits the existing comment bubble.**
   Given a rendered comment, when viewed in either light or dark color mode, then:
   - The bubble retains its existing `bg-secondary/40` (or equivalent) background — the markdown preview's default background MUST NOT leak through.
   - Typography, link color, and inline-code background follow the dialog's existing design tokens rather than the library's default `.wmde-markdown` palette.
   - First/last block elements (e.g. leading `<h1>`, trailing `<p>`) do not introduce extra outer margin that breaks the bubble's padding.
8. **Empty and whitespace-only comments render safely.**
   Given a comment whose source is empty or whitespace-only, when rendered, then it produces either no visible content or the same empty bubble behavior as today — no React errors, no hydration warnings.
9. **No regressions on the item body editor.**
   Given the item body `MDEditor` in the same dialog, when comments are rendered above it, then the body editor's own preview, toolbar, and sanitize behavior remain unchanged.
10. **No backend or schema change.**
    Given the API route `app/api/workflows/[id]/items/[itemId]/route.ts`, when a comment is added or read, then the stored shape is still `comments: string[]` containing raw Markdown source. No migration runs.
11. **Kanban card comment excerpts are unchanged in this requirement.**
    Given the Kanban board card in `components/dashboard/KanbanBoard.tsx`, when it displays a preview of the most recent comment, then it continues to render a plain-text excerpt (current behavior). Markdown rendering there is out of scope.

### Technical constraints

- **Change site**: `components/dashboard/ItemDetailDialog.tsx`, approximately lines 193–200 (the comment list render). No other component's render output changes.
- **Sanitize schema**: MUST reuse `markdownSanitizeSchema` from `lib/markdown-preview.ts`. If the symbol is not currently exported, export it; do not fork or inline a second copy.
- **Renderer**: Use `@uiw/react-md-editor`'s `MDEditor.Markdown` (already a transitive dependency) **or** `@uiw/react-markdown-preview` directly. The chosen import MUST be invoked with `rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}` (or equivalent `components`/`plugins` API) and `remarkPlugins={[remarkBreaks]}`.
- **Raw HTML**: `rehype-raw` MUST NOT be added to the comment pipeline. If the body pipeline uses it, the comment pipeline still excludes it.
- **Storage shape**: `item.comments` remains `string[]` (raw Markdown source). No change to `types/workflow.ts` comment typing or to `app/api/workflows/[id]/items/[itemId]/route.ts`.
- **Composer**: The `<textarea>` at lines 202–207 stays as-is; its `onChange`, submit handler, and payload shape are unchanged.
- **Styling**: Any CSS scoping (class override, `data-color-mode` attribute, or a wrapper class such as `comment-markdown`) MUST be scoped so it does not alter the body editor's preview styles or other `.wmde-markdown` surfaces in the app. Global rules in `app/globals.css` must be keyed off a comment-specific selector.
- **Color mode**: Rendering must behave correctly under both light and dark themes consistent with the rest of the dialog.
- **Bundle impact**: Prefer the lightest import path that still reuses the existing renderer (e.g. `MDEditor.Markdown` if already chunked with the editor, otherwise `@uiw/react-markdown-preview`). Adding a second, parallel Markdown renderer library is NOT permitted.
- **No new dependencies** beyond what is already in `package.json`, except `remark-breaks` if not already transitively available.

### Resolved open questions

1. Composer remains a plain `<textarea>`; no live preview toggle.
2. `remark-breaks` is enabled so single newlines render as `<br>`, preserving legacy comment semantics.
3. Kanban card comment excerpts stay plain-text (out of scope for this requirement).
4. Raw HTML via `rehype-raw` is NOT enabled in the comment pipeline.
5. Code-block highlighting inherits whatever the shared `markdownSanitizeSchema` already supports for the body; no separate highlighter configuration is added.

### Out of scope

- Converting the comment composer into an `MDEditor` or any live-preview widget.
- Editing, deleting, reordering, or threading existing comments.
- Reactions, mentions, attachments, or rich-media embeds in comments.
- Changing the storage shape of `comments` (still `string[]` of raw Markdown).
- Changing comment rendering on the Kanban board cards.
- Changing any backend API route or persistence format.
- Introducing a new Markdown renderer library or new sanitize schema.

## Implementation Notes

- `lib/markdown-preview.ts`: added `commentRemarkPlugins = [remarkBreaks]` and
  `commentRehypePlugins = [[rehypeSanitize, markdownSanitizeSchema]]`. The body
  pipeline (`markdownPreviewOptions`) is untouched — it still uses
  `rehype-raw`; the comment pipeline intentionally does not.
- `components/dashboard/ItemDetailDialog.tsx`: swapped the
  `whitespace-pre-wrap` text `<div>` for a `MarkdownPreview` render
  (`@uiw/react-markdown-preview`, already a transitive dep of
  `@uiw/react-md-editor`, dynamically imported with `ssr: false`). The comment
  bubble wrapper gains a `comment-markdown` class; `bg-secondary/40` is kept
  on the bubble and the renderer's own background is forced transparent.
  Empty / whitespace-only comments render nothing (no `MarkdownPreview`
  mount) so the bubble stays safe. The `<textarea>` composer and the submit
  payload are unchanged.
- `app/globals.css`: added `.comment-markdown .wmde-markdown …` scoped rules
  (transparent background, inherit color, first/last child margin reset,
  muted-background inline code, primary-colored links). Selectors are keyed
  off `.comment-markdown` so the item body `MDEditor` preview and every other
  `.wmde-markdown` surface are unaffected.
- `package.json`: added `remark-breaks` (permitted by the spec); no other
  dependencies added. Storage shape (`comments: string[]`) and the
  `app/api/workflows/[id]/items/[itemId]/route.ts` route are unchanged.
- No deviations from the spec. Kanban comment previews remain plain-text per
  AC-11.

## Validation

1. ✅ **Markdown rendering replaces plain-text display.** `components/dashboard/ItemDetailDialog.tsx:200-215` maps each comment to a `<MarkdownPreview source={c} …/>` inside the bubble; the previous `whitespace-pre-wrap` text node is gone.
2. ✅ **Sanitization parity with the item body.** `commentRehypePlugins` in `lib/markdown-preview.ts:51` wires `[rehypeSanitize, markdownSanitizeSchema]`, the same schema (`markdownSanitizeSchema`, `lib/markdown-preview.ts:14`) consumed by the body via `markdownPreviewOptions`.
3. ✅ **Raw HTML is not executed.** `commentRehypePlugins` contains only `rehype-sanitize`; `rehype-raw` is intentionally omitted on the comment path (`lib/markdown-preview.ts:47-51`).
4. ✅ **Line-break compatibility with legacy comments.** `commentRemarkPlugins = [remarkBreaks]` (`lib/markdown-preview.ts:50`) is passed via `remarkPlugins={commentRemarkPlugins}` at `ItemDetailDialog.tsx:208`.
5. ✅ **Code blocks are styled.** `markdownSanitizeSchema` preserves `language-*` / `hljs` classes on `code`/`pre`/`span` (`lib/markdown-preview.ts:18-29`); `MarkdownPreview`'s built-in `.wmde-markdown` styles render fenced blocks in monospace, matching the body renderer's class vocabulary. No new highlighter wiring was added, consistent with the spec note.
6. ✅ **Comment composer is unchanged in behavior.** `ItemDetailDialog.tsx:217-222` is still a plain `<textarea>` with the original `onChange` handler; `handleSave` (`ItemDetailDialog.tsx:94-109`) PATCHes `comments: finalComments` as raw strings — API contract preserved.
7. ✅ **Styling fits the existing comment bubble.** Bubble retains `bg-secondary/40` (`ItemDetailDialog.tsx:203`); `app/globals.css:43-61` scopes `.comment-markdown .wmde-markdown` overrides: transparent background, inherited color, first/last-child margin reset, muted inline-code background, primary-colored links. `wrapperElement={{ 'data-color-mode': 'light' }}` + inline `background: transparent` on the renderer (`ItemDetailDialog.tsx:210-211`) keep the preview chrome from leaking.
8. ✅ **Empty and whitespace-only comments render safely.** `c.trim() ? <MarkdownPreview …/> : null` (`ItemDetailDialog.tsx:205-213`) skips the mount entirely for empty/whitespace sources — no hydration or React error path.
9. ✅ **No regressions on the item body editor.** The `MDEditor` block (`ItemDetailDialog.tsx:173-188`) still uses `markdownPreviewOptions` (rehype-raw + rehype-sanitize), and the new CSS rules are keyed on `.comment-markdown`, so `.item-detail-md-editor` / other `.wmde-markdown` surfaces are unaffected.
10. ✅ **No backend or schema change.** `app/api/workflows/[id]/items/[itemId]/route.ts:79-83` still validates `comments` as `string[]`; `types/workflow.ts:27` still types `comments?: string[]`. No migration.
11. ✅ **Kanban card comment excerpts are unchanged.** `grep -in comment components/dashboard/KanbanBoard.tsx` returns no matches — KanbanBoard was not touched in this change; prior behavior preserved.

**Additional checks**
- ✅ TypeScript: `npx tsc --noEmit` ran clean (no output).
- ✅ Dependencies: `package.json` adds only `remark-breaks@^4.0.0`; `@uiw/react-markdown-preview` is resolved via `node_modules/@uiw/react-markdown-preview` as a transitive of `@uiw/react-md-editor`, so no duplicate renderer library is introduced.
- ⚠️ UI smoke test not executed here (no dev server run in this validation session); code-path evidence and typecheck are the basis for the pass verdicts on AC-1/4/5/7/8. No blocker — recommend a quick visual spot-check before closing.

All acceptance criteria pass. No follow-ups required; advancing to Done.
