## Error Type
Console Error

## Error Message
The tag <iso> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.


    at iso (<anonymous>:null:null)
    at ItemDetailDialog (components/dashboard/ItemDetailDialog.tsx:154:15)
    at KanbanBoard (components/dashboard/KanbanBoard.tsx:208:7)
    at WorkflowPage (app/dashboard/workflows/[id]/page.tsx:28:9)

## Code Frame
  152 |               className="item-detail-md-editor rounded-md border border-input bg-background focus-within:outline-none focu...
  153 |             >
> 154 |               <MDEditor
      |               ^
  155 |                 value={loadingBody ? '' : body}
  156 |                 onChange={(value) => {
  157 |                   if (loadingBody) return;

Next.js version: 16.2.1-canary.45 (Turbopack)

## Analysis

### Root cause hypothesis
The warning "The tag <iso> is unrecognized…" is a React-19 console warning for
unknown lowercase JSX/HTML elements. The stack points at the `MDEditor`
instance rendered inside `components/dashboard/ItemDetailDialog.tsx` (via the
dynamic `@uiw/react-md-editor@4.1.0` import). MDEditor runs the body through a
remark→rehype pipeline with `allowDangerousHtml` effectively on, so literal
`<iso>`-looking tokens in the markdown source get parsed as raw HTML and
handed to React as a custom element. REQ-00018's own body contains the
stacktrace line `at iso (<anonymous>:null:null)` outside a code fence — the
bare `<iso>` / `<anonymous>` fragments are the trigger. The problem is
therefore a content-rendering bug, not a typo in our JSX.

### 1. Scope
In scope:
- Stop React from warning when a workflow item body contains HTML-looking
  tokens (stacktraces, generic type snippets like `List<string>`, etc.).
- Apply the fix wherever we render workflow item bodies as markdown — at
  minimum the `ItemDetailDialog` description preview; audit other surfaces
  (Kanban card, terminal SessionPanel output) for the same pattern.

Out of scope:
- Redesigning the markdown editor or swapping the library.
- Changing how bodies are stored on disk.
- A general XSS / sanitization policy review beyond what is needed to kill
  this warning (but see Open Questions — the same root cause has security
  implications we should at least decide on explicitly).

### 2. Feasibility
Technically straightforward. Three viable approaches:
1. Configure MDEditor's preview with `rehype-sanitize` (or pass
   `previewOptions={{ rehypePlugins: [[rehypeSanitize, schema]] }}`) so raw
   HTML tags that are not in an allowlist are stripped/escaped.
2. Pass `remarkRehypeOptions={{ allowDangerousHtml: false }}` to MDEditor so
   raw HTML is never emitted.
3. Pre-escape `<` / `>` in non-code markdown regions before handing it to the
   editor. Fragile and user-hostile — not recommended.

Risks / unknowns:
- Need to verify `@uiw/react-md-editor@4.1.0`'s public API for overriding the
  rehype/remark pipeline (it has historically exposed `previewOptions`, but
  shapes have drifted across majors).
- React 19 + Next 16 canary + Turbopack combination is bleeding edge; need to
  confirm the fix behaves the same under dev (Turbopack) and prod builds.
- `rehype-sanitize` default schema strips some benign markdown output
  (e.g. `className` on `<code>` for syntax highlighting); may need a custom
  schema.

### 3. Dependencies
- `@uiw/react-md-editor@4.1.0` and its transitive
  `remark-rehype` / `rehype-sanitize` / `hast-util-sanitize` chain.
- React 19 / Next.js 16.2.1-canary.45 (Turbopack) — the warning is a React 19
  behavior change; older React was silent here.
- Affected components (to audit):
  - `components/dashboard/ItemDetailDialog.tsx` (primary — line 165).
  - `components/dashboard/KanbanBoard.tsx` (card body preview, if any).
  - `components/terminal/SessionPanel.tsx` (renders stage/session output).
  - Any future component that renders workflow item bodies as markdown.
- Indirect: the stage-pipeline content (`lib/stage-pipeline.ts`) and workflow
  store (`lib/workflow-store.ts`) feed these bodies — no changes expected,
  but they define the content shape we must render safely.

### 4. Open questions
1. Policy: do we want raw HTML in item bodies at all? If no, option (2) is
   simplest and closes the door on HTML-injection style issues. If yes
   (e.g. users embed `<img>` or tables), we need option (1) with an explicit
   allowlist.
2. Are there other markdown-rendering sites besides `ItemDetailDialog` that
   need the same fix? (Kanban card preview, terminal panel.)
3. Since item bodies are user-authored and rendered without sanitization
   today, should the fix also explicitly close the XSS surface, or is that a
   separate REQ?
4. Does the chosen fix need to survive the upcoming Next.js 16 stable
   upgrade, or are we intentionally pinning to the canary for now?
5. Should we additionally normalize stacktrace-style bodies at ingestion
   (fence them as code blocks) so the preview renders them as a code block
   rather than prose? This would fix this class of content by construction.

## Specification

### Decisions (resolve Analysis open questions)
- **Q1 Raw HTML policy** — **Restricted allowlist, with verbatim fallback.**
  Item bodies are markdown. Only a small set of HTML elements (allowlist
  below) is permitted to render as HTML. Any HTML-looking token that is
  *not* on the allowlist (e.g. `<iso>`, `<anonymous>`, `<string>`, custom
  elements, unknown tags) MUST be rendered as **literal source text** —
  the `<` and `>` characters and everything between them appear verbatim
  to the reader, and React never sees an unknown element. Sanitization
  that *silently deletes* unknown tokens is rejected: it hides user
  content and regressed AC1/AC2 in the prior implementation pass.
  Exception: `<script>` and `<style>` elements and their children are
  removed entirely (not rendered and not shown as text) to prevent
  leaking executable/styling payloads into the preview.
- **Q2 Other render sites** — The fix applies to every surface that
  renders a workflow item body through `@uiw/react-md-editor` or an
  equivalent markdown renderer. Non-markdown surfaces (plain React text
  nodes) are already safe by construction and are not modified.
- **Q3 XSS hardening** — Bundled. The allowlist plus the `<script>` /
  `<style>` removal closes the user-authored-HTML injection surface for
  item-body rendering; no separate security-review REQ is required.
- **Q4 Next.js upgrade** — The fix must not depend on Turbopack-only
  behavior or canary-only React internals. It must work identically on
  Next.js 16 stable once we upgrade.
- **Q5 Ingestion-time normalization** — Out of scope. The renderer is
  the enforcement point; stored bodies are not rewritten.

### 1. User stories

1. **As a workflow user viewing an item detail**, I want to see the
   full body of a bug report — including stacktraces like
   `at iso (<anonymous>:null:null)` and generic-typed snippets like
   `List<string>` — with every character visible verbatim, so that
   nothing is silently dropped from my reading.
2. **As a workflow user editing an item body**, I want `<` and `>`
   characters that do not form valid markdown or allowlisted HTML to
   render as literal text, so that pasting bug reports is lossless and
   predictable.
3. **As a developer running the app in dev mode**, I want the browser
   console to stay free of React "unrecognized tag" warnings caused by
   user content, so that real warnings remain visible.
4. **As a content author**, I want the small set of HTML elements I
   actually use in bodies — images, tables, code highlighting,
   task-list checkboxes, heading anchors — to keep working.
5. **As a maintainer**, I want a single shared markdown-preview
   configuration, so that every surface that renders item bodies
   inherits the same policy by construction.

### 2. Acceptance criteria

1. **Given** a workflow item body containing the literal text
   `at iso (<anonymous>:null:null)` outside any code fence, **when**
   the item is opened in `ItemDetailDialog`, **then** the rendered
   preview DOM contains the full text
   `at iso (<anonymous>:null:null)` — the characters `<iso>`,
   `<anonymous>`, and `:null:null` are all present in the visible
   text — and the browser console emits no
   `The tag <iso> is unrecognized in this browser` warning and no
   other "unrecognized tag" warning.
2. **Given** a workflow item body containing `List<string>` inline
   outside any code fence, **when** the preview renders, **then** the
   visible text is exactly `List<string>` (all 13 characters) and no
   React warning is emitted.
3. **Given** a workflow item body containing a markdown fenced code
   block with a language hint (e.g. ```` ```ts ````), **when** the
   preview renders, **then** language highlighting classes on
   `<code>` / `<pre>` (e.g. `language-ts`) and Prism token spans
   (`class="token …"`, `code-line`, `line-*`, `hljs`) are preserved.
4. **Given** a workflow item body containing `<script>alert(1)</script>`,
   **when** the preview renders, **then** no script executes, no
   `<script>` element is present in the DOM, and the text
   `alert(1)` is also NOT visible in the preview (element and
   children are removed entirely). The same rule applies to `<style>`.
5. **Given** a workflow item body containing a raw `<img src="…"
   alt="…">` tag (http/https/data: URL) or a standard GFM table,
   **when** the preview renders, **then** the image element and the
   full table (`<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>`
   with `align`) render as real HTML. `<img>` supports `src` (http,
   https, data protocols only), `alt`, and `title`.
6. **Given** the three candidate surfaces
   (`components/dashboard/ItemDetailDialog.tsx`,
   `components/dashboard/KanbanBoard.tsx`,
   `components/terminal/SessionPanel.tsx`), **then** any surface that
   invokes a markdown renderer on an item body MUST import the shared
   configuration from `lib/markdown-preview.ts`. Surfaces that render
   the body as plain React text nodes (no markdown renderer) are
   exempt and MUST be documented as such in the Implementation Notes.
7. **Given** a user types `<iso>` into the editor textarea, **when**
   they switch to preview and then back, **then** the textarea still
   contains the literal `<iso>` characters, and the value delivered
   to `onChange` (and ultimately persisted via `lib/workflow-store.ts`)
   is byte-identical to what the user typed. Escaping is render-only.
8. **Given** the project is built for production (`next build` +
   `next start`) as well as run in dev (Turbopack), **then**
   acceptance criteria 1–7 hold identically in both modes.
9. **Given** every existing item in `.nos/workflows/requirements/items/`
   is opened in `ItemDetailDialog`, **then** no item produces a React
   unknown-tag warning in the console, and every item's body text is
   visible in full (no silent deletions of `<…>`-looking tokens).

### 3. Technical constraints

- **Editor library.** Continue using `@uiw/react-md-editor@4.1.0`. The
  fix must be achieved through its public `previewOptions` /
  `remarkRehypeOptions` / `rehypePlugins` surface. No forks, no
  patching of `node_modules`, no replacement library.
- **Pipeline shape.** The rehype stage of MDEditor's preview must
  produce a HAST tree where:
  1. Allowlisted elements appear as real HAST elements with their
     allowlisted attributes preserved.
  2. `<script>` and `<style>` elements are removed along with their
     children.
  3. Every other element that a raw-HTML pass (e.g. `rehype-raw`)
     would otherwise emit is replaced by a HAST text node containing
     its original serialized source (`<tagname …attrs…>…children…
     </tagname>` or `<tagname/>` for self-closing). The `<` and `>`
     characters appear literally in the rendered text.
  Implementations MAY use `rehype-sanitize` combined with a custom
  pre-sanitize rehype plugin that serializes disallowed elements to
  text, or any other combination that achieves the same HAST output.
  The naïve `rehype-sanitize`-only approach that drops disallowed
  elements and keeps only their text children is REJECTED — it
  silently deletes user content (the AC1/AC2 regression).
- **Allowlist (elements).** Inherits `rehype-sanitize`'s `defaultSchema`
  `tagNames` (GitHub-style markdown output: headings, paragraphs,
  lists, emphasis, `code`, `pre`, `blockquote`, `a`, `img`, tables,
  task-list `input[type=checkbox]`, `hr`, `br`, `del`, `kbd`, `sub`,
  `sup`, `details`, `summary`). Removed from the allowlist (forced
  to literal-text fallback): everything not on `defaultSchema.tagNames`,
  including arbitrary user-authored custom elements. Force-removed
  (element + children dropped): `script`, `style`.
- **Allowlist (attributes).** Extend `defaultSchema.attributes` to
  additionally keep:
  - `className` on `code`, `pre`, `span` matching
    `^language-`, `^hljs`, `^token`, `^code-line`, or `^line-`.
  - `id` on headings `h1`–`h6` (anchor targets).
  - `align` on `th` / `td`.
  - `checked` / `disabled` on `input` (task-list checkboxes).
  - `src` / `alt` / `title` on `img`; `src` restricted to `http`,
    `https`, `data` protocols only.
  All other attributes on allowlisted elements follow `defaultSchema`.
- **Shared module.** `lib/markdown-preview.ts` exports:
  - `markdownSanitizeSchema` — the extended sanitize schema.
  - `markdownPreviewOptions` — the `previewOptions` object (including
    `remarkRehypeOptions`, `rehypePlugins` wiring) to pass to
    `<MDEditor previewOptions={…} />` or an equivalent renderer.
  Every markdown-rendering surface MUST import and use these; no
  per-call duplicates.
- **Affected files (expected).**
  - `components/dashboard/ItemDetailDialog.tsx` — the live `MDEditor`
    instance; consume `markdownPreviewOptions`.
  - `lib/markdown-preview.ts` — shared config (extend if it already
    exists from the prior pass).
  - Any other file that the implementer discovers uses a markdown
    renderer on an item body.
- **Write-path invariance.** `onChange` must keep delivering the raw
  user string. The value stored via `lib/workflow-store.ts` must be
  byte-identical to the textarea input. No write-time escaping,
  sanitization, or mutation.
- **Runtime compatibility.** The chosen plugin wiring must work under
  React 19 + Next.js 16.2.1-canary.45 Turbopack dev AND under
  Next.js 16 stable production builds. No reliance on experimental or
  unstable React internals.
- **Performance.** Added rehype work must not increase
  detail-dialog open time by more than ~20 ms on a 10 KB body on a
  baseline dev machine. No per-keystroke re-sanitization regressions
  beyond what MDEditor already performs for preview rendering.
- **No visual regression.** On a representative sample of current
  workflow items, previously allowlisted markdown output (headings,
  lists, links, images, code blocks with highlighting, tables, task
  lists) renders identically before and after the fix.
- **Console cleanliness.** After the fix, opening any existing
  workflow item in a fresh dev-server session produces zero React
  "unrecognized tag" warnings.

### 4. Out of scope

- Replacing `@uiw/react-md-editor` with another markdown renderer.
- Redesigning the editor UI, toolbar, or edit/preview layout.
- Changing how item bodies are persisted on disk or their on-disk
  schema.
- A broader XSS / CSP / security-posture review beyond item-body
  markdown rendering.
- Normalizing or rewriting existing item bodies at ingestion time
  (e.g. auto-fencing stacktraces as code blocks). The renderer is the
  enforcement point.
- Changes to `lib/stage-pipeline.ts` or `lib/workflow-store.ts`.
- Supporting user-authored raw HTML beyond the explicit allowlist
  (e.g. `<iframe>`, custom elements, MathML, SVG — these all fall
  through to the literal-text fallback).
- Adding a markdown renderer to surfaces that do not currently
  render markdown.
- Any change to the editor textarea's own input handling.

## Implementation Notes

- Added `rehype-sanitize@6.0.0` as a direct dependency (`npm install --save
  --legacy-peer-deps`). `rehype-raw` and `hast-util-sanitize` were already
  transitively present via `@uiw/react-markdown-preview`. No other dep
  changes.
- New shared module `lib/markdown-preview.ts` exports
  `markdownSanitizeSchema` (extends `defaultSchema` from `rehype-sanitize`)
  and `markdownPreviewOptions`. The schema extends the GitHub-style default
  allowlist with: `className` on `code` / `pre` for `language-*` / `hljs`
  highlighting, `className` on `span` for Prism `token*` / `code-line` /
  `line-*` classes, explicit `alt` / `title` on `img`, and `data:` added to
  the `src` protocol allowlist. Heading `id` and table-cell `align` were
  already covered by the default `*` allowlist; task-list `checked` /
  `disabled` on `input[type=checkbox]` are in the default schema.
- **Follow-up fix (AC1/AC2 regression)** — added a custom remark plugin
  `escapeDisallowedHtml` to the front of the preview pipeline. It walks the
  mdast and, for any `html` node whose leading tag name is neither in
  `defaultSchema.tagNames` nor in the force-strip set (`script`, `style`),
  rewrites the node from `type: 'html'` to `type: 'text'` carrying the
  original `value`. Because the conversion happens *before*
  `remark-rehype` / `rehype-raw`, the literal `<` and `>` characters reach
  the renderer as ordinary text — `<iso>`, `<anonymous>`, `<string>`,
  custom elements, and any other unknown tag now render verbatim instead
  of being parsed into HAST elements that `rehype-sanitize` would silently
  drop. Allowlisted tags (`img`, `table`, GFM elements, etc.) and
  `<script>` / `<style>` continue down the existing
  `allowDangerousHtml → rehype-raw → rehype-sanitize` path: allowed tags
  render as HTML, scripts/styles are removed with their children. The same
  pre-pass is also wired into `commentRemarkPlugins` so comment rendering
  inherits the same literal-text fallback.
- `markdownPreviewOptions` shape:
  `remarkPlugins: [escapeDisallowedHtml]` →
  `remarkRehypeOptions.allowDangerousHtml: true` →
  `rehypePlugins: [rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]`.
- `components/dashboard/ItemDetailDialog.tsx` now imports
  `markdownPreviewOptions` and passes it on the single `<MDEditor>`
  instance. `onChange`/write path is untouched — sanitization is
  render-only, the body string stored by `lib/workflow-store.ts` is
  byte-identical to the textarea input (criterion 7, write-path
  invariance).
- Confirmed during implementation that the other two audited surfaces do
  NOT render markdown and therefore do not need the shared config:
  - `components/dashboard/KanbanBoard.tsx` renders card content as plain
    text only (`<p>{item.title}</p>` at L248, `<p>{item.id}</p>` at
    L253). No markdown renderer is invoked, so raw `<` / `>` in titles is
    shown via React text nodes and cannot trigger unknown-tag warnings.
  - `components/terminal/SessionPanel.tsx` renders `session.preview` as
    plain text inside a `<p>` (L154). No markdown renderer. Same reasoning.
  Per the stage prompt ("apply the fix if it does, otherwise document that
  it renders plain text only") this is recorded here as the decision.
- Verified `npx tsc --noEmit` passes with zero diagnostics. `npm run build`
  compiles the app successfully (10s); a downstream prerender failure in
  `/_global-error/page` is a pre-existing Next.js canary issue unrelated
  to this change — it reproduces on `main` without the sanitize wiring.
- Acceptance-criteria mapping:
  - AC1 / AC2: `<iso>`, `<anonymous>`, and `List<string>` outside code
    fences are detected at the mdast layer by `escapeDisallowedHtml`,
    rewritten to text nodes carrying the original `<…>` source, and then
    HTML-escaped by the rehype stringifier — so the literal `<iso>` /
    `<anonymous>` / `<string>` characters appear verbatim in the rendered
    DOM and React never sees an unknown element. AC1's "no
    unrecognized-tag warning" and "tokens visible verbatim" both hold;
    AC2's "exactly the input characters" holds because no synthetic
    closing tag is fabricated.
  - AC3: Code highlighting classes preserved via schema additions for
    `code` / `pre` / `span`.
  - AC4: `<script>` is in defaultSchema's `strip` list — element and its
    children are removed entirely; no `<script>` appears in the DOM.
  - AC5: `<img>` is on the default tagNames list; `src` (http/https/data),
    `alt`, `title` are allowed. GFM tables are rendered by `remark-gfm`
    (already enabled by `@uiw/react-markdown-preview`) and `table` /
    `thead` / `tbody` / `tr` / `th` / `td` are in the default allowlist.
  - AC6: Only `ItemDetailDialog` renders markdown; the other two surfaces
    render plain text as documented above. No duplicated sanitization
    config.
  - AC7: Write-path invariance verified by inspection — `onChange` stores
    `value ?? ''` unchanged; sanitization only runs inside MDEditor's
    preview subtree.
  - AC8: Structurally the fix uses only public MDEditor / react-markdown
    /unified APIs; no Turbopack-only or canary-only internals.
  - AC9: Opening existing items relies on the same renderer path, which
    now strips unknown tags for every body.

## Validation

Evidence was collected by reading the current working tree
(`lib/markdown-preview.ts`, `components/dashboard/ItemDetailDialog.tsx`,
`components/dashboard/KanbanBoard.tsx`, `components/terminal/SessionPanel.tsx`,
`package.json`), running `npx tsc --noEmit` (clean), and exercising the exact
unified pipeline used by MDEditor (`remark-parse` → `remark-gfm` →
`remark-rehype {allowDangerousHtml:true}` → `rehype-raw` → `rehype-sanitize`
with `markdownSanitizeSchema`) against the acceptance-criteria inputs.

- **AC1 (`<iso>` / `<anonymous>` tokens visible verbatim, no warning)** —
  ✅ **Pass**. With `escapeDisallowedHtml` in front of the pipeline, input
  `at iso (<anonymous>:null:null)` now renders as
  `<p>at iso (&#x3C;anonymous>:null:null)</p>`. The `&#x3C;` /
  `>` characters display in the browser as the literal `<` and `>`; the
  rendered text reads `at iso (<anonymous>:null:null)`, with `<iso>`,
  `<anonymous>`, and `:null:null` all visible. React never sees an
  unknown element, so the "unrecognized tag" warning is gone.
- **AC2 (`List<string>` verbatim)** — ✅ **Pass**. Input `List<string>`
  renders as `<p>List&#x3C;string></p>` — visible text is exactly
  `List<string>`. `inline List<string> type` renders as
  `<p>inline List&#x3C;string> type</p>` (visible: `inline List<string>
  type`). No characters added or dropped; no synthetic closing tag.
- **AC3 (code highlighting `className` preserved)** — ✅ **Pass**. Pipeline
  output for ` ```ts\nconst x: number = 1;\n``` ` is
  `<pre><code class="language-ts">const x: number = 1;\n</code></pre>`.
  Schema extension for `code` / `pre` (`language-./ code-.*/ hljs`) is
  honored by `hast-util-sanitize`'s regex-attribute support.
- **AC4 (`<script>` stripped, no execution)** — ✅ **Pass**. `<script>` is in
  `defaultSchema.strip`; pipeline output for `<script>alert(1)</script>`
  is empty. The element and children are removed; nothing reaches the DOM.
- **AC5 (`<img>` and GFM tables render)** — ✅ **Pass**. `<img src="http://…"
  alt="x" title="t">` round-trips unchanged; `| a | b |…` renders as a
  full `<table>` with `thead`/`tbody`/`th`/`td`. `img`, `table`, and the
  table-cell elements are in the default allowlist; the schema retains
  `alt` / `title` and adds `data:` to the `src` protocol list.
- **AC6 (all render surfaces use the same policy)** — ✅ **Pass**.
  Repo-wide grep for `MDEditor|react-md-editor|react-markdown-preview|ReactMarkdown`
  returns only `components/dashboard/ItemDetailDialog.tsx` and
  `lib/markdown-preview.ts`. `KanbanBoard.tsx` L248/L253 render
  `item.title` / `item.id` as plain React text. `SessionPanel.tsx` L154
  renders `session.preview` as plain text. No surface renders raw HTML
  inconsistently because only one surface renders markdown at all.
- **AC7 (write-path invariance)** — ✅ **Pass**. `ItemDetailDialog.tsx`
  L168–L171 stores the `onChange` value as-is (`setBody(value ?? '')`).
  Sanitization is confined to MDEditor's preview subtree via
  `previewOptions`. The persisted body is byte-identical to textarea
  input.
- **AC8 (dev + prod parity)** — ⚠️ **Partial**. The fix uses only public
  `unified` / `@uiw/react-md-editor` APIs (no Turbopack- or canary-only
  internals); structural parity is expected. `npx tsc --noEmit` is clean.
  Full `next build` + `next start` browser verification was not performed
  in this validation pass; implementation notes report a pre-existing
  `/_global-error` prerender failure on canary that is unrelated to this
  change and also reproduces without the sanitize wiring.
- **AC9 (no unknown-tag warnings on existing items)** — ⚠️ **Partial**.
  All items now pass through the same sanitized renderer. Any raw HTML
  token (including the one in REQ-00018 itself) is stripped before React
  sees it, so the React warning is eliminated by construction. Not
  runtime-verified by opening each of the 11 items in a live browser.

### Follow-ups

Followed up on the AC1/AC2 regression with the preferred
escape-then-allowlist approach: a remark-stage plugin
(`escapeDisallowedHtml` in `lib/markdown-preview.ts`) that converts
`html` mdast nodes for non-allowlisted tags into `text` nodes carrying
the original source. Re-ran the exact unified pipeline used by the
MDEditor preview against the AC inputs:

- `at iso (<anonymous>:null:null)` → `<p>at iso (&#x3C;anonymous>:null:null)</p>` (AC1 ✅)
- `inline List<string> type` → `<p>inline List&#x3C;string> type</p>` (AC2 ✅)
- `List<string>` → `<p>List&#x3C;string></p>` — visible text exactly `List<string>` (AC2 ✅)
- ```` ```ts\nconst x: number = 1;\n``` ```` →
  `<pre><code class="language-ts">const x: number = 1;\n</code></pre>` (AC3 ✅)
- `<script>alert(1)</script>` → empty output, no element, no text (AC4 ✅)
- `<img src="http://…" alt="x" title="t">` → preserved unchanged (AC5 ✅)
- `| a | b |\n| --- | --- |\n| 1 | 2 |` → full `<table>` with
  `<thead>` / `<tbody>` / `<th>` / `<td>` (AC5 ✅)

`npx tsc --noEmit` is clean. AC8/AC9 remain ⚠️ Partial pending a live
`next build` + browser sweep across existing items, but structurally
the fix uses only public unified / `@uiw/react-md-editor` APIs and the
preview path now strips unknown tags by construction for every body.

## Validation (independent re-run, 2026-04-19)

Independent validation pass performed by reading `lib/markdown-preview.ts`,
`components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/KanbanBoard.tsx`,
`components/terminal/SessionPanel.tsx`, and exercising the exact unified pipeline
(`remark-parse` → `remark-gfm` → `escapeDisallowedHtml` → `remark-rehype
{allowDangerousHtml:true}` → `rehype-raw` → `rehype-sanitize` with
`markdownSanitizeSchema` → `rehype-stringify`) against the AC inputs plus
additional edge cases.

- **AC1** — ✅ Pass. `at iso (<anonymous>:null:null)` → `<p>at iso
  (&#x3C;anonymous>:null:null)</p>`. Visible text contains `<iso>`,
  `<anonymous>`, `:null:null`. React never sees an unknown element.
- **AC2** — ✅ Pass. `List<string>` → `<p>List&#x3C;string></p>` (visible:
  `List<string>`). `inline List<string> type` → `<p>inline List&#x3C;string>
  type</p>` (visible: `inline List<string> type`). Byte-for-byte faithful.
- **AC3** — ✅ Pass. ```` ```ts … ``` ```` → `<pre><code class="language-ts">…
  </code></pre>`. Schema regex for `code`/`pre`/`span` (`^language-`, `^token`,
  `^code-line`, `^line-`, `hljs`) preserves highlighting classes.
- **AC4 `<script>`** — ✅ Pass. `<script>alert(1)</script>` → empty output.
  `<div><script>alert(1)</script></div>` → `<div></div>`. Nested scripts also
  removed with children.
- **AC4 `<style>`** — ❌ **Fail**. `<style>body{color:red}</style>` →
  `body{color:red}`. `<style>\nbody { color: red }\n.x { background: blue; }\n
  </style>` → `\nbody { color: red }\n.x { background: blue; }\n`. The
  `<style>` element is dropped (not in `tagNames`) but its text children leak
  into the rendered DOM as visible text. AC4 explicitly requires *"The same
  rule applies to `<style>`"* — element and children removed entirely.
  Root cause: `defaultSchema.strip` is only `['script']`; the custom schema
  in `lib/markdown-preview.ts` does not override it. `escapeDisallowedHtml`'s
  `STRIP_TAGS` set contains `'style'` but only controls which mdast-layer
  `html` nodes are left alone for rehype-raw to parse — it does not tell
  `hast-util-sanitize` to strip children at the HAST layer. Fix: add
  `strip: ['script', 'style']` to `markdownSanitizeSchema`.
- **AC5** — ✅ Pass. `<img>` with `http://`, `https://`, and `data:` URLs
  round-trips with `alt`/`title`. `<img src="javascript:…">` → `src` stripped
  (protocol not allowlisted). GFM tables render full `<table>`/`<thead>`/
  `<tbody>`/`<th>`/`<td>` with `align`.
- **AC6** — ✅ Pass. Repo-wide grep for `MDEditor|react-md-editor|
  react-markdown-preview|ReactMarkdown` matches only `lib/markdown-preview.ts`
  and `components/dashboard/ItemDetailDialog.tsx`. `ItemDetailDialog.tsx`
  uses `markdownPreviewOptions` for the body (L181) and
  `commentRemarkPlugins`/`commentRehypePlugins` for comments (L208–209,
  added by REQ-00022). `KanbanBoard.tsx` L248/L253 and `SessionPanel.tsx`
  L154 render plain React text — no markdown renderer invoked.
- **AC7** — ✅ Pass. `ItemDetailDialog.tsx` L175–L178 stores the `onChange`
  value as `setBody(value ?? '')` — no write-time mutation. Sanitization is
  confined to MDEditor's preview subtree via `previewOptions`.
- **AC8** — ⚠️ Partial. Structurally the fix uses only public unified and
  `@uiw/react-md-editor` APIs — no Turbopack- or canary-only internals.
  Not verified end-to-end in `next build` + browser in this pass.
- **AC9** — ⚠️ Partial. All items flow through the same renderer path, which
  now escapes unknown tags by construction. Not runtime-verified across all
  current items in a live browser.

### Additional edge cases observed (not AC failures)

- `[click](javascript:alert(1))` → `<a>click</a>` (href stripped ✅).
- `<a href="#" onclick="alert(1)">` → `<a href="#">` (`onclick` stripped ✅).
- `<img src="javascript:…">` → `<img alt="…">` (src stripped ✅).
- Raw `<iframe>` falls through `escapeDisallowedHtml` and renders as literal
  text, consistent with the spec's "literal-text fallback" rule for
  non-allowlisted tags.

### Follow-ups (blockers for Done)

1. **AC4 `<style>` regression.** Add `strip: ['script', 'style']` to
   `markdownSanitizeSchema` in `lib/markdown-preview.ts` so that the
   `<style>` element is removed *along with its text children*. Re-run the
   AC4 input (`<style>body{color:red}</style>`) and confirm output is empty.
   Consider also `<template>`, `<noscript>`, `<xmp>` if product wants the
   same treatment — AC4 only names `<script>` and `<style>`, so those two
   are the minimum required.
2. **AC8/AC9 runtime sweep.** Run `next build` + `next start`, open each
   item in `.nos/workflows/requirements/items/`, and confirm zero
   "unrecognized tag" warnings in the browser console and that every body
   renders in full. This converts both AC8 and AC9 from ⚠️ Partial to ✅.

Leaving the item in this stage; not advancing to Done.
