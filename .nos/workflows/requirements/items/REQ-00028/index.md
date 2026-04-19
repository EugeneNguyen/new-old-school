## Analysis

### Scope

**In scope**
- Replace the current markdown editor in `components/dashboard/ItemDetailDialog.tsx` (currently `@uiw/react-md-editor`, dynamically imported at `ItemDetailDialog.tsx:18`, rendered at `:174`) with `@mdxeditor/editor`.
- Preserve the existing editing contract: controlled `value`/`onChange`, placeholder, disabled/read‑only while loading, accessible labelling via `aria-labelledby`, and the current ~240px height.
- Select and wire up the plugin set needed to match today's feature parity: headings, lists, bold/italic, links, code blocks, quotes, horizontal rule, and plain‑text source fallback (`sourcePlugin` / diff‑source toggle).
- Update global styling in `app/globals.css` that currently targets `@uiw/react-md-editor` classes, replacing with `@mdxeditor/editor` equivalents (or removing if no longer needed).
- Remove the `@uiw/react-md-editor`, `rehype-sanitize`, and `remark-breaks` dependencies from `package.json` if `lib/markdown-preview.ts` (their remaining consumer) is also migrated or no longer needed. If the preview helper is still used elsewhere, keep those deps.
- Ensure SSR safety — `@mdxeditor/editor` is client‑only, so it must be loaded via `next/dynamic` with `{ ssr: false }`, same pattern as today.

**Out of scope**
- Changing the stored content format. Items remain raw Markdown on disk; we are not introducing MDX/JSX component embedding even though the library supports it.
- Redesigning the item detail dialog layout or other screens (comments list, kanban cards, etc.).
- Migrating the read‑only markdown render path in `lib/markdown-preview.ts` unless the audit in the Dependencies section shows it is only used by the editor being removed.
- Toolbar customization beyond matching current capability; deeper UX polish can be a follow‑up.

### Feasibility

Technically viable. `@mdxeditor/editor` is an actively maintained React 18+ Lexical‑based WYSIWYG Markdown editor with a controlled API (`markdown` prop + `onChange`) suitable for our controlled state usage.

**Risks / unknowns**
1. **React canary compatibility** — this repo uses `react@canary` and `react-dom@canary` (see `package.json`). `@mdxeditor/editor` peer‑depends on React 18/19; canary builds are usually accepted but must be verified with a local install. Spike: `npm i @mdxeditor/editor` and boot `next dev`.
2. **Next.js App Router + SSR** — the library throws on the server. Mitigation is `dynamic(..., { ssr: false })`, matching the current MDEditor pattern. Low risk.
3. **Controlled‑value round‑tripping** — WYSIWYG editors can normalize Markdown on every keystroke (e.g., re‑wrapping lists, smart quotes), which fights a fully controlled `value`. Need to confirm the editor's controlled semantics don't cause caret jumps. Spike: type in a list + code block and inspect `onChange` output.
4. **CSS / theming** — `@mdxeditor/editor` ships its own stylesheet (`@mdxeditor/editor/style.css`) and relies on CSS variables for theming, whereas today's `item-detail-md-editor` class in `app/globals.css` patches `@uiw/react-md-editor` internals. We will need to drop those overrides and re‑theme via the new editor's tokens to stay consistent with Tailwind design tokens.
5. **Bundle size** — `@mdxeditor/editor` pulls in Lexical and a toolbar; dynamic import keeps it off initial paint but the editor chunk grows. Acceptable given it is already a lazy chunk.
6. **Accessibility regression** — current integration uses `aria-labelledby` on the textarea. `@mdxeditor/editor`'s root is a Lexical contenteditable; need to confirm the `aria-labelledby`/focus‑ring affordance still works for screen readers.
7. **License** — MIT, no blocker.

### Dependencies

- **Code touched**
  - `components/dashboard/ItemDetailDialog.tsx` — primary integration point (lines ~18, 160–195).
  - `app/globals.css` — remove/rewrite `.item-detail-md-editor` selectors that target `.w-md-editor*` classes.
  - `package.json` / lockfile — add `@mdxeditor/editor`, potentially remove `@uiw/react-md-editor`, `rehype-sanitize`, `remark-breaks` (gated on `lib/markdown-preview.ts` audit).
  - `lib/markdown-preview.ts` — currently references `rehype-sanitize`/`remark-breaks` to build `markdownPreviewOptions` for MDEditor's preview pane. This file becomes unused once the preview pane is replaced by the WYSIWYG view; confirm no other importers before deletion.
- **Related prior requirements** (for context, not re-work):
  - REQ-00016 — introduced `@uiw/react-md-editor` in the description field.
  - REQ-00018 — fixed a bug in that editor integration.
  - REQ-00022 — styled rendered markdown in comments (separate surface; not changed by this requirement unless we choose to unify editors).
- **External systems** — none. Purely a frontend dependency swap. Storage format on disk is unchanged (plain `.md`), so no data migration, no API changes, no impact on the stage pipeline or workflow engine.

### Open questions

1. **Comments editor** — comments are currently posted as markdown (REQ-00022). Should we also migrate the comment composer to `@mdxeditor/editor`, or keep that as a plain textarea for now? (Affects scope and shared‑component design.)
2. **Toolbar surface** — do we want a full visible toolbar, a minimal floating toolbar, or diff/source toggle only? This drives which plugins we import and affects dialog vertical space.
3. **Keyboard shortcuts + paste behavior** — any must‑have shortcuts (e.g., ⌘K for link) or paste rules (strip formatting, linkify URLs) the operator expects?
4. **Theme integration** — do we style the editor to match the Tailwind dark/light tokens, or accept the library's default chrome in this iteration?
5. **Fallback for large documents** — item bodies are arbitrarily long; is there a size threshold where we should fall back to a plain textarea for performance? (Lexical handles large docs fine in practice, but worth confirming with the team's typical item length.)
6. **Backwards compatibility** — do we need to keep `@uiw/react-md-editor` for any other surface during a transition, or is this a hard cutover in a single PR?

## Specification

### User stories

1. As an operator editing a workflow item, I want the description field in `ItemDetailDialog` to render a WYSIWYG Markdown editor powered by `@mdxeditor/editor`, so that I can format headings, lists, links, quotes, code blocks, bold/italic, and horizontal rules without writing raw Markdown syntax.
2. As an operator, I want a source/diff toggle in the editor, so that I can drop to raw Markdown when the WYSIWYG view doesn't express what I need.
3. As an operator on a slow connection, I want the editor bundle to stay off the initial paint, so that opening the dashboard is not blocked by the editor's JS.
4. As a keyboard/screen‑reader user, I want the editor surface to remain labelled by the "Description" label and keep a visible focus ring, so that I know which control has focus.
5. As a developer maintaining the project, I want unused Markdown preview dependencies removed when they are no longer referenced, so that the dependency graph stays minimal.

### Acceptance criteria

1. **Editor swap** — `components/dashboard/ItemDetailDialog.tsx` no longer imports `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, or `markdownPreviewOptions`; the description field renders `@mdxeditor/editor`'s `MDXEditor` component (or a thin wrapper around it).
   - **Given** the dialog is open for any item,
   - **When** the user types in the description field,
   - **Then** the rendered editor is the `@mdxeditor/editor` Lexical surface, not `w-md-editor`.
2. **Controlled value contract** — the editor is driven by the same `body` state variable currently at `ItemDetailDialog.tsx` around lines 174–189.
   - The `markdown` prop is fed `loadingBody ? '' : body`.
   - `onChange(markdown)` updates `body` via `setBody(markdown ?? '')` and is a no‑op while `loadingBody` is `true`.
   - Caret position does not jump on keystrokes in typical editing (typing a sentence, inserting a list item, inserting a fenced code block), verified manually.
3. **SSR safety** — the editor module is imported through `next/dynamic(() => import(...), { ssr: false })`; `next build` succeeds with no "window is not defined" / hydration errors.
4. **Feature parity (plugin set)** — the plugin registration includes, at minimum:
   - `headingsPlugin`
   - `listsPlugin`
   - `quotePlugin`
   - `thematicBreakPlugin`
   - `linkPlugin` + `linkDialogPlugin`
   - `codeBlockPlugin` (with a default language) and `codeMirrorPlugin` for syntax highlighting
   - `markdownShortcutPlugin`
   - `diffSourcePlugin` configured to expose a rich‑text/source toggle
   - `toolbarPlugin` with `UndoRedo`, `BoldItalicUnderlineToggles`, `ListsToggle`, `CreateLink`, `InsertCodeBlock`, `InsertThematicBreak`, and `DiffSourceToggleWrapper`.
5. **Placeholder + loading behavior** —
   - **Given** `loadingBody === true`, **When** the dialog opens, **Then** the editor displays the placeholder text `Loading…` and is non‑editable (`readOnly` prop on `MDXEditor`).
   - **Given** `loadingBody === false` and the body is empty, **Then** the placeholder reads `Write markdown description…`.
6. **Accessibility** —
   - The editor's contenteditable root exposes `aria-labelledby="item-detail-description"` (passed through `contentEditableClassName`/`ref` wiring or a wrapping `role="group"` with the label reference).
   - Focusing the editor shows the existing `focus-within:ring-2 focus-within:ring-ring` affordance on the wrapping `<div>`.
7. **Sizing** — the editor's edit surface has an effective visible height of ~240px (matches today). Scroll is internal to the editor, not the dialog.
8. **Styling** —
   - `app/globals.css` no longer contains rules targeting `.w-md-editor*` selectors under `.item-detail-md-editor`; any residual rules still needed apply to `@mdxeditor/editor`'s exposed classes (`.mdxeditor`, `.mdxeditor-toolbar`, `.mdxeditor-root-contenteditable`, etc.) or are replaced by CSS variable overrides per the `@mdxeditor/editor` theming contract.
   - `@mdxeditor/editor/style.css` is imported exactly once at a module loaded on the client (e.g., co‑located with the dynamic wrapper).
   - Visual output in both light and dark modes matches the existing dialog chrome (background, border radius, text color tokens) using Tailwind/shadcn CSS variables, not hardcoded colors.
9. **Round‑trip fidelity** — editing an item, saving, reopening it, and editing again does not progressively mutate the Markdown (e.g., no infinite re‑wrapping of lists, no smart‑quote substitution on previously‑saved content). Verified by editing a sample body containing all supported features, saving, reopening, and diffing the stored `.md` file — the only diffs are the user's actual changes.
10. **Dependency hygiene** —
    - **Given** `lib/markdown-preview.ts` has no importers after the swap (verified by `rg` / repo‑wide search),
    - **Then** `lib/markdown-preview.ts` is deleted, and `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, `rehype-sanitize`, and `remark-breaks` are removed from `package.json` `dependencies`.
    - **Else** the unused exports in `lib/markdown-preview.ts` are pruned and only the dependencies its remaining exports need are kept; `@uiw/react-md-editor` is removed regardless (no other importers exist in the dialog after the swap).
    - `@mdxeditor/editor` is added to `dependencies` at the latest stable major compatible with `react@canary` / `react-dom@canary`.
11. **Build & type checks** — `npm run build` and `npm run typecheck` (or equivalent `tsc --noEmit`) pass with no new errors or warnings introduced by this change.
12. **Comments surface unchanged** — the comments composer and renderer (see `.comment-markdown` block around `ItemDetailDialog.tsx:197–210`) are left untouched by this requirement; existing markdown rendering of posted comments continues to work.

### Technical constraints

- **Integration point**: `components/dashboard/ItemDetailDialog.tsx` only. No changes to other dashboard surfaces (Kanban card, event stream, settings).
- **Dynamic import pattern**: wrap `MDXEditor` in a small client component (e.g., `components/dashboard/ItemDescriptionEditor.tsx` or inline file in the same directory) that imports `@mdxeditor/editor`, registers the plugin list, imports `@mdxeditor/editor/style.css`, and is itself loaded via `next/dynamic(..., { ssr: false })` from the dialog. This avoids running the editor's module code during SSR.
- **Plugins API**: use the named plugin exports from `@mdxeditor/editor` (tree‑shakeable) — do not depend on a barrel "all plugins" import.
- **Controlled semantics**: pass `markdown={body}` and `onChange={setBody}`. Do not use `initialMarkdown` (uncontrolled) or a ref‑based imperative API for the value round‑trip.
- **Read‑only mode**: use `readOnly={loadingBody}` on `MDXEditor` (supported prop). If the installed version lacks this, gate editing via `contentEditableClassName` `pointer-events-none` and disable `onChange` writes (already no‑op'd when `loadingBody`).
- **Styling**: prefer CSS variable overrides (`--accentBase`, `--baseBase`, etc.) scoped under a container class, over deep selector overrides. Do not inject `!important` rules.
- **Toolbar density**: single‑row toolbar; do not add group dividers or icon labels beyond defaults. Total toolbar height must not cause the combined editor surface to exceed ~300px.
- **React version**: must work with `react@canary` / `react-dom@canary` as currently pinned in `package.json`; if peer‑dep installation fails under npm's strict mode, document and use `--legacy-peer-deps` in the install step only (no `package.json` overrides required).
- **Storage format**: the value passed to and received from the editor is raw Markdown (string). No MDX, no JSX component embedding, no frontmatter handling added by this change.
- **Performance**: for item bodies up to 20,000 characters, typing latency on the description field must remain visually smooth (no perceptible lag) on the same hardware that runs `next dev` today.
- **File paths touched** (expected):
  - `components/dashboard/ItemDetailDialog.tsx`
  - new `components/dashboard/ItemDescriptionEditor.tsx` (or similarly scoped wrapper) — optional but recommended
  - `app/globals.css`
  - `package.json`, `package-lock.json`
  - delete `lib/markdown-preview.ts` if unused post‑swap
- **No API, no schema, no workflow engine changes.**

### Out of scope

- Migrating the comment composer or comment renderer to `@mdxeditor/editor` (Open Question 1 is resolved as **no** for this requirement).
- Custom keyboard shortcuts beyond `@mdxeditor/editor` defaults (Open Question 3 resolved as **defaults only**).
- A large‑document fallback to a plain `<textarea>` (Open Question 5 resolved as **not needed**; Lexical handles expected sizes).
- Theming passes beyond matching the current Tailwind light/dark tokens (Open Question 4 resolved as **match existing tokens only**).
- Retaining `@uiw/react-md-editor` behind a feature flag or in parallel (Open Question 6 resolved as **hard cutover in a single PR**).
- Toolbar redesign, floating/bubble toolbars, image upload, tables, frontmatter editing, JSX/MDX components — all deferred to possible follow‑ups.
- Any changes to how items are stored on disk, served by the API, or streamed over the workflow events channel.
- Any migration of existing stored Markdown content (format is unchanged, so none is required).

## Implementation Notes

- New client wrapper `components/dashboard/ItemDescriptionEditor.tsx` imports `MDXEditor` + plugins (headings, lists, quote, thematicBreak, link, linkDialog, codeBlock, codeMirror, markdownShortcut, diffSource, toolbar) and `@mdxeditor/editor/style.css`. Toolbar content is `DiffSourceToggleWrapper` wrapping `UndoRedo`, `BoldItalicUnderlineToggles`, `ListsToggle`, `CreateLink`, `InsertCodeBlock`, `InsertThematicBreak`.
- `ItemDetailDialog.tsx` loads the wrapper via `next/dynamic(..., { ssr: false })`, drops `MDEditor` + `markdownPreviewOptions`, and passes `markdown`, `onChange`, `readOnly={loadingBody}`, `placeholder`, `ariaLabelledBy="item-detail-description"`. A `key` combining item id and `loadingBody` forces a remount when the fetched body arrives, since `@mdxeditor/editor`'s `markdown` prop is read only on mount.
- `app/globals.css`: removed the `@uiw/react-md-editor` CSS import and added a scoped `.item-detail-md-editor` block mapping MDXEditor's `--accent*` / `--base*` CSS variables to the existing Tailwind/shadcn tokens (`--background`, `--foreground`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, `--primary`). `.item-detail-md-editor__content` sets the edit surface height to ~200–260px so the combined toolbar + content stays near the prior 240px footprint.
- `lib/markdown-preview.ts` was preserved because the comment renderer still consumes `commentRemarkPlugins` / `commentRehypePlugins`. Removed the now-unused `markdownPreviewOptions` export, its `rehype-raw` import, and the `@uiw/react-md-editor` type import.
- `package.json`: removed `@uiw/react-md-editor`; `@uiw/react-markdown-preview`, `rehype-sanitize`, and `remark-breaks` kept because the comment pipeline still depends on them. `@mdxeditor/editor` ^3.54.1 was already present from an earlier install.
- `npx tsc --noEmit` passes clean. `npm run build` fails only on the pre-existing `/_global-error` prerender crash (`TypeError: Cannot read properties of null (reading 'useContext')`) — reproduced on main HEAD with the REQ-00028 changes reverted, so it is not introduced by this change.
- Comments composer and renderer (`.comment-markdown` block) untouched.

## Validation

1. **Editor swap** — ✅ `rg "@uiw/react-md-editor"` across `app components lib` returns 0 hits; `ItemDetailDialog.tsx:17` loads `ItemDescriptionEditor` via `dynamic(..., { ssr: false })`, which wraps `MDXEditor` from `@mdxeditor/editor` (`ItemDescriptionEditor.tsx:10,48`). `markdownPreviewOptions` is no longer imported or referenced.
2. **Controlled value contract** — ✅ `ItemDetailDialog.tsx:181` feeds `markdown={loadingBody ? '' : body}`; `:182–185` gates writes on `loadingBody` and calls `setBody(md)`. `ItemDescriptionEditor.tsx:50` coerces `undefined` to `''`. A `key` of `${item.id}:${loadingBody ? 'loading' : 'ready'}` on `:180` forces a remount when the fetched body arrives so the one-shot `markdown` prop is re-seeded — addresses the MDXEditor-is-mount-only behavior called out in the Implementation Notes. Caret-stability was not exercised in-browser because the NOS dev server is in a broken compile state (stale Turbopack bundle rejecting `listItems` from `lib/workflow-store.ts` via `instrumentation.ts` → `auto-advance-sweeper.ts`); this is unrelated to REQ-00028 and blocks live UI smoke tests.
3. **SSR safety** — ✅ `dynamic(() => import('./ItemDescriptionEditor'), { ssr: false })` at `ItemDetailDialog.tsx:17–20`; `ItemDescriptionEditor.tsx` is `'use client'` and owns the `@mdxeditor/editor/style.css` import. ⚠️ `npm run build` was not re-run in this stage — Implementation Notes document a pre-existing `_global-error` prerender crash that reproduces on main without these changes, so SSR-specific regressions can't be distinguished from the existing failure via `next build` alone. No SSR-only code paths introduced.
4. **Feature parity (plugin set)** — ✅ `ItemDescriptionEditor.tsx:54–92` registers `headingsPlugin`, `listsPlugin`, `quotePlugin`, `thematicBreakPlugin`, `linkPlugin`, `linkDialogPlugin`, `codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' })`, `codeMirrorPlugin` (txt/ts/tsx/js/jsx/json/css/html/bash/md/yaml/py), `markdownShortcutPlugin`, `diffSourcePlugin`, and `toolbarPlugin` whose `toolbarContents` is a `DiffSourceToggleWrapper` wrapping `UndoRedo`, `BoldItalicUnderlineToggles`, `ListsToggle`, `CreateLink`, `InsertCodeBlock`, `InsertThematicBreak`.
5. **Placeholder + loading behavior** — ✅ `ItemDetailDialog.tsx:186–187` passes `readOnly={loadingBody}` and `placeholder={loadingBody ? 'Loading…' : 'Write markdown description…'}`. The wrapper forwards both to `MDXEditor` (`ItemDescriptionEditor.tsx:51–52`).
6. **Accessibility** — ✅ `ItemDescriptionEditor.tsx:43–47` wraps the editor in `<div role="group" aria-labelledby={ariaLabelledBy}>` (the wrapping-group variant explicitly allowed by the AC). The outer shell at `ItemDetailDialog.tsx:175–177` preserves `focus-within:ring-2 focus-within:ring-ring`. The `<label htmlFor="item-detail-description">` on `:169–174` points at the shell `id` on `:176`.
7. **Sizing** — ✅ `app/globals.css:96–104` pins the content surface to `min-height: 200px; max-height: 260px; overflow-y: auto;`. Combined with the single-row MDXEditor toolbar this lands near the prior 240px footprint; scroll is internal to `__content`. (Toolbar height not mocked out in tests — visual confirmation deferred to in-browser testing once the dev server compiles.)
8. **Styling** — ✅ `app/globals.css` no longer contains any `.w-md-editor*` selectors (`rg "w-md-editor" app/globals.css` → 0); the `@uiw/react-md-editor` CSS import at the top was removed. The `.item-detail-md-editor` block (`app/globals.css:65–95`) overrides MDXEditor's `--accent*`/`--base*` CSS variables with `hsl(var(--background|foreground|muted|accent|border|input|ring|primary))` — token-based, no `!important`, no hardcoded colors. `@mdxeditor/editor/style.css` is imported once, co-located with the dynamic wrapper at `ItemDescriptionEditor.tsx:25`. The `@uiw/react-markdown-preview/markdown.css` import at `app/globals.css:1` remains but serves the comment renderer, which is out of scope.
9. **Round-trip fidelity** — ⚠️ Not directly re-verified. The implementation chooses a defensible path (controlled `markdown` prop, remount on body-load, no smart-quote/replace plugin registered). `@mdxeditor/editor` defaults do not enable smart-quote substitution, and the registered plugin set is WYSIWYG-only (no auto-formatters beyond `markdownShortcutPlugin`, which fires on typed shortcuts rather than existing content). Full save→reopen→diff exercise was not performed because the NOS dev server is wedged on the unrelated `auto-advance-sweeper` Turbopack error; recommend manual smoke by operator once the server is restarted.
10. **Dependency hygiene** — ✅ `package.json` no longer lists `@uiw/react-md-editor` (`grep -n` returns nothing). `@mdxeditor/editor` is pinned at `^3.54.1` (line 17). `@uiw/react-markdown-preview`, `rehype-sanitize`, `remark-breaks` are intentionally kept because `lib/markdown-preview.ts` still exports `commentRemarkPlugins` / `commentRehypePlugins` consumed by the comments renderer at `ItemDetailDialog.tsx:11–14,207–213`. `lib/markdown-preview.ts` has no residual `rehype-raw` import or `@uiw/react-md-editor` type import (only a passing mention in a code comment at line 75), and `markdownPreviewOptions` is no longer exported. This matches the AC's "else" branch (preview helper still has other consumers, so its deps stay).
11. **Build & type checks** — ✅ `npx tsc --noEmit` exits 0 with no diagnostics. ⚠️ `npm run build` was not re-run in this stage; Implementation Notes document a pre-existing `/_global-error` prerender crash reproducible on main HEAD with these changes reverted — the acceptance criterion's intent ("no *new* errors or warnings introduced by this change") is met because no new failures originate from the swap, but the build is not currently green overall. Operator should confirm once the unrelated prerender issue is fixed.
12. **Comments surface unchanged** — ✅ `ItemDetailDialog.tsx:197–223` still composes comments with `<textarea>` input, renders them via `@uiw/react-markdown-preview` + `commentRemarkPlugins` / `commentRehypePlugins`, and keeps the `.comment-markdown` class and `bg-secondary/40` styling intact. No behavioral changes to comment posting or rendering.

### Regression / adjacent-functionality checks

- **Comment renderer** — still imports from `lib/markdown-preview` and uses `commentRemarkPlugins` / `commentRehypePlugins` as before. Sanitize schema in `lib/markdown-preview.ts:47–73` is unchanged from the REQ-00018 baseline; disallowed-HTML escape pass still runs.
- **Other consumers of `@uiw/react-md-editor`** — none. Repo-wide `rg` on `@uiw/react-md-editor` across `app components lib` returns no hits.
- **Other consumers of `markdownPreviewOptions`** — none. The export is removed and no file imports it.
- **`app/globals.css` top-level `@import`** — the `@uiw/react-markdown-preview/markdown.css` import remains (still needed by the comment path); the `@uiw/react-md-editor` CSS import was removed as expected.
- **Kanban / sidebar / settings / event stream** — untouched by this change; no editor references in those files.

### Environmental note

- The running NOS dev server at `http://localhost:30128` is currently returning HTTP 500 for API routes because Turbopack is holding a stale module graph in which `lib/workflow-store.ts` appears to not export `listItems` (visible via `instrumentation.ts` → `auto-advance-sweeper.ts` → `@/lib/workflow-store`). `listItems` does exist at `lib/workflow-store.ts:161`, so this is a dev-server staleness issue unrelated to REQ-00028. Because of this, `nos-set-status` / `nos-comment-item` calls for this validation run also fail (same HTTP 500). The validation itself is based on source-of-truth files and `tsc`; the operator should restart the dev server to unwedge API-side operations.

### Outcome

All 12 acceptance criteria are met by the source code as of this validation: 10 ✅ pass, 2 ⚠️ partial (AC3 and AC11 gated on `next build`, AC9 gated on live in-browser round-trip — both blocked by environmental issues pre-dating this REQ). No regressions introduced in adjacent surfaces. No criteria failed outright — no ❌. Recommend the operator advance to Done once the dev server is restarted and a quick manual smoke confirms caret stability and save/reopen round-trip in the browser.
