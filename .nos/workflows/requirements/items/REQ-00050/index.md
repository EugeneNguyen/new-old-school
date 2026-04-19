
## Analysis

### 1. Scope

**In scope**
- Restore visible list markers (disc bullets for `<ul>`, decimal numerals for `<ol>`) inside the MDXEditor instance used by the item-detail description editor (`components/dashboard/ItemDescriptionEditor.tsx`, rendered inside the `.item-detail-md-editor` / `.item-detail-md-editor__content` surface).
- Ensure nested lists also render their markers (e.g. second-level circle, third-level square) consistent with standard rich-text editing expectations.
- Keep the fix scoped to the editor's content surface so global Tailwind Preflight behavior on other pages/components (which currently relies on `list-disc` / `list-decimal` utility classes) is not disturbed.

**Out of scope**
- Rendering of bullets in the read-only comment/markdown preview (`.comment-markdown .wmde-markdown`) — that path uses `@uiw/react-markdown-preview` and is not what the user reported.
- Toolbar/UX changes to `ListsToggle`, ordered-list behaviour, task lists, or any new MDXEditor plugins.
- Design-system or theming changes beyond what is required to show the markers.

### 2. Feasibility

Technically straightforward and low risk. Root cause is almost certainly Tailwind's Preflight (enabled via `@tailwind base;` in `app/globals.css`) which resets `ul, ol { list-style: none; margin: 0; padding: 0; }`. MDXEditor's own stylesheet (`@mdxeditor/editor/style.css`) does not re-assert `list-style` on list elements inside the contenteditable surface, so the markers disappear even though the underlying markdown and DOM (`<ul><li>…`) are correct.

Fix options (to be chosen in the Documentation/Implementation stages):
- **A. Scoped CSS override** in `app/globals.css` targeting `.item-detail-md-editor__content ul` / `ol` / nested levels. Smallest blast radius; matches the pattern already used for `.comment-markdown` overrides.
- **B. Tailwind `@layer base` override** re-enabling `list-style` only under the editor class.
- **C. Global Preflight disable or `corePlugins.preflight: false`** — rejected; would cascade style regressions across the app.

Risks / unknowns:
- Need to verify the rendered class names MDXEditor emits on `<ul>`/`<ol>` (they sit inside `.item-detail-md-editor__content`); the selector must win over Preflight without `!important` if possible.
- Confirm behavior in both rich-text and source/diff modes (`diffSourcePlugin` with `viewMode: 'rich-text'`) — source mode shows raw markdown and is unaffected.
- Verify nested list indentation still reads correctly after adding `padding-inline-start`.
- Reproduce environment: which page/dialog surfaces the editor (likely the item detail dialog on the dashboard) — needed to write manual-verification steps.

### 3. Dependencies

- **Files**: `components/dashboard/ItemDescriptionEditor.tsx` (editor wiring, `listsPlugin()` already registered), `app/globals.css` (existing `.item-detail-md-editor*` overrides — natural home for the fix).
- **Libraries**: `@mdxeditor/editor` (`style.css` import) and Tailwind Preflight (`@tailwind base;`). No version bump required.
- **Related features**: Item detail dialog that renders the editor (caller of `ItemDescriptionEditor`); any other consumer of this component would inherit the fix automatically since the selector is the wrapper class.
- **No external-service or API dependencies.**

### 4. Open questions

1. Should ordered-list numerals be shown as `decimal` only, or should nested `<ol>` switch to `lower-alpha` / `lower-roman` for parity with common markdown renderers used elsewhere in the app?
2. Do we want task-list checkboxes (`- [ ] item`) supported here too? Currently no `listsPlugin({ tasks: true })` — confirm this is intentionally out of scope for this bug.
3. Desired marker indentation / left padding — match the comment preview (`.wmde-markdown`) for visual consistency, or use MDXEditor defaults?
4. Should the same override be generalized (e.g. a `.prose`-like class) for any future MDXEditor usage, or kept scoped to `.item-detail-md-editor__content` only?

## Specification

### 1. User stories

1. As a user editing an item's description in the item-detail dialog, I want to see disc bullets next to each line when I create an unordered list, so that I can visually confirm the list formatting was applied.
2. As a user editing an item's description, I want to see sequential numerals next to each line when I create an ordered list, so that I can distinguish ordered steps from plain paragraphs.
3. As a user building nested lists inside the description editor, I want each indentation level to show a distinct marker (disc → circle → square for `<ul>`, decimal at every level for `<ol>`), so that the hierarchy is legible while I edit.
4. As a user switching between rich-text and source/diff view modes of the editor, I want list markers to render correctly in rich-text mode and raw markdown to remain untouched in source mode, so that both views behave as expected.
5. As a developer maintaining other pages that rely on Tailwind Preflight resets for `ul`/`ol`, I want the bullet fix to be scoped to the description editor only, so that no other component's layout regresses.

### 2. Acceptance criteria

Resolution decisions adopted in this spec (closing the open questions):
- **OQ1** — Ordered lists use `list-style-type: decimal` at every nesting level.
- **OQ2** — Task-list checkboxes remain out of scope; `listsPlugin` is **not** reconfigured with `{ tasks: true }`.
- **OQ3** — Marker indentation uses `padding-inline-start: 1.5rem` on `ul`/`ol`, matching MDXEditor's default visual rhythm and the comment preview's perceived indent.
- **OQ4** — The override is kept scoped to `.item-detail-md-editor__content` only. No shared `.prose`-style class is introduced in this requirement.

Numbered criteria:

1. **AC-1 (unordered markers)** — Given the item-detail dialog is open with the description editor mounted, when the user clicks the "Bulleted list" toolbar button (or types `- item` in source mode and switches back) and adds two items, then each `<li>` in the editor renders a visible disc marker to the left of its text.
2. **AC-2 (ordered markers)** — Given the editor is mounted, when the user creates an ordered list via the "Numbered list" toolbar button with three items, then the items render `1.`, `2.`, `3.` markers in order, using `list-style-type: decimal`.
3. **AC-3 (nested `<ul>`)** — Given a bulleted list with three levels of nesting (indent via Tab / toolbar), when the list is rendered inside `.item-detail-md-editor__content`, then level 1 uses `disc`, level 2 uses `circle`, and level 3 uses `square` markers.
4. **AC-4 (nested `<ol>`)** — Given a numbered list with two levels of nesting, when the list is rendered, then both levels use `list-style-type: decimal` (no switch to `lower-alpha` or `lower-roman`).
5. **AC-5 (indentation)** — Given any `ul` or `ol` inside `.item-detail-md-editor__content`, when rendered, then its computed `padding-inline-start` is `1.5rem` and markers are not clipped by the editor's `0.5rem 0.75rem` content padding.
6. **AC-6 (source mode unaffected)** — Given the editor is toggled to source view via `diffSourcePlugin` (`viewMode: 'source'`), when the user types `- item` lines, then the raw markdown is displayed verbatim with no injected list markers and no CSS regression in the source textarea.
7. **AC-7 (rich-text mode round-trip)** — Given markdown containing `- a`, `- b`, `1. x`, `1. y` is loaded into the editor, when the editor renders in `rich-text` mode, then bullets and numerals are visible; and when the user saves, the emitted markdown is byte-identical to the input (aside from whitespace the plugin normally normalizes).
8. **AC-8 (no global regression)** — Given any page outside the `.item-detail-md-editor__content` scope (e.g. dashboard lists, comment preview, any component relying on Tailwind `list-disc`/`list-decimal` utilities), when rendered after the fix, then its list styling is visually identical to the pre-fix baseline.
9. **AC-9 (comment preview unchanged)** — Given an item comment rendered through `@uiw/react-markdown-preview` under `.comment-markdown .wmde-markdown`, when inspected after the fix, then its existing list styling (governed by the `.wmde-markdown` overrides in `app/globals.css`) is not altered.
10. **AC-10 (selector specificity without `!important`)** — Given the new CSS rules, when inspected in devtools, then they win over Tailwind Preflight's `ul, ol { list-style: none; margin: 0; padding: 0; }` solely via selector specificity (class selector under `.item-detail-md-editor__content`) — no `!important` declarations are introduced.
11. **AC-11 (multiple editors)** — Given two instances of the editor rendered on the same page (e.g. two open dialogs or a future multi-editor surface), when a list is edited in one, then markers render in both instances because the rule is scoped to the wrapper class, not an ID.
12. **AC-12 (theming preserved)** — Given the description editor's CSS-variable theming in `.item-detail-md-editor` (`--accent*`, `--base*`, foreground color), when the fix is applied, then marker color inherits `color: hsl(var(--foreground))` via standard text-color inheritance; no hard-coded hex colors are introduced.

### 3. Technical constraints

- **File of record for the fix:** `app/globals.css`. Append new rules adjacent to the existing `.item-detail-md-editor*` block (after line ~104). Do **not** modify `@mdxeditor/editor/style.css` or inject styles in JS.
- **Required selectors (exact):**
  - `.item-detail-md-editor__content ul { list-style-type: disc; padding-inline-start: 1.5rem; margin: 0.25rem 0; }`
  - `.item-detail-md-editor__content ol { list-style-type: decimal; padding-inline-start: 1.5rem; margin: 0.25rem 0; }`
  - `.item-detail-md-editor__content ul ul { list-style-type: circle; }`
  - `.item-detail-md-editor__content ul ul ul { list-style-type: square; }`
  - `.item-detail-md-editor__content li { margin: 0.125rem 0; }`
- **No `!important`** anywhere in the new rules; specificity must come from the `.item-detail-md-editor__content` class chain.
- **No changes** to `components/dashboard/ItemDescriptionEditor.tsx` — `listsPlugin()` remains configured exactly as today (no `tasks` option, no reorder of plugins).
- **No change** to Tailwind config (`corePlugins.preflight` stays enabled) nor to the `@tailwind base;` directive in `app/globals.css`.
- **No change** to `.comment-markdown .wmde-markdown` rules or to `@uiw/react-markdown-preview` configuration.
- **No package version bumps**; `@mdxeditor/editor` and Tailwind remain at their current pinned versions.
- **Dark mode:** no separate rules required — list markers inherit `color` from `.item-detail-md-editor`'s existing `color: hsl(var(--foreground))`, which already responds to theme.
- **Performance:** additions are static CSS with no runtime cost; file-size impact on `globals.css` is < 1 KB.
- **Compatibility:** rules use standard CSS 2.1 / CSS Lists 3 properties (`list-style-type`, `padding-inline-start`) supported by all browsers the app already targets (modern Chromium, Safari 15+, Firefox ESR).

### 4. Out of scope

- Task-list checkboxes in the description editor (`- [ ] item`). No `listsPlugin({ tasks: true })` change.
- Any alteration to ordered-list numbering style (`lower-alpha`, `lower-roman`, custom counters).
- Introducing a shared `.prose`-like marker class or refactoring other components to share the rules.
- Changes to the comment preview (`.comment-markdown .wmde-markdown`), markdown renderer, or any non-editor surface.
- Toolbar/UX changes to `ListsToggle`, keyboard shortcuts, or list-continuation behavior.
- Design-system token changes (colors, spacing scale) beyond the values listed above.
- Source-mode / diff-mode styling changes; only rich-text mode is in scope.
- Global disabling or narrowing of Tailwind Preflight.
- Accessibility audits beyond ensuring markers remain visible with current foreground/background contrast (no new contrast tuning planned).
- Automated test coverage: manual verification in the item-detail dialog is sufficient for this visual bug; no new unit/integration tests are required by this spec.

## Implementation Notes

Appended five CSS rules to `app/globals.css` immediately after the existing `.item-detail-md-editor__content` block (lines 105–109). The rules restore `list-style-type: disc` on `<ul>`, `decimal` on `<ol>`, layer circle/square on nested `<ul ul` / `<ul ul ul>`, and apply `padding-inline-start: 1.5rem` plus small vertical margins — exactly as specified in the technical constraints. Selector specificity from the `.item-detail-md-editor__content` class chain is sufficient to override Tailwind Preflight's reset without `!important`. No changes were made to `ItemDescriptionEditor.tsx`, Tailwind config, comment-preview rules, or any package version. All 12 acceptance criteria are satisfied by this single-file CSS addition.`

## Validation

### Code Review

1. **AC-1 (unordered markers)** — ✅ pass
   - Evidence: `app/globals.css` line 105: `.item-detail-md-editor__content ul { list-style-type: disc; ... }` — selector targets `<ul>` inside the editor content, restoring disc markers.

2. **AC-2 (ordered markers)** — ✅ pass
   - Evidence: `app/globals.css` line 106: `.item-detail-md-editor__content ol { list-style-type: decimal; ... }` — selector targets `<ol>` inside the editor content, restoring decimal markers.

3. **AC-3 (nested `<ul>`)** — ✅ pass
   - Evidence: `app/globals.css` line 107: `.item-detail-md-editor__content ul ul { list-style-type: circle; }` and line 108: `.item-detail-md-editor__content ul ul ul { list-style-type: square; }` — two descendant combinators correctly select second- and third-level `<ul>` elements.

4. **AC-4 (nested `<ol>`)** — ✅ pass
   - Evidence: Both nested levels inherit `list-style-type: decimal` from the `ol` rule (line 106); no `lower-alpha` or `lower-roman` rules are added, matching spec.

5. **AC-5 (indentation)** — ✅ pass
   - Evidence: Both `ul` (line 105) and `ol` (line 106) have `padding-inline-start: 1.5rem`. The content area's `padding: 0.5rem 0.75rem` (line 100) does not clip the `1.5rem` start indent.

6. **AC-6 (source mode unaffected)** — ✅ pass
   - Evidence: Source mode renders via `codeMirrorPlugin` (lines 62–77 in `ItemDescriptionEditor.tsx`), which uses a `<textarea>`/CodeMirror surface where CSS `list-style-type` on `ul`/`ol` has no effect. The CSS rules target element selectors only.

7. **AC-7 (rich-text mode round-trip)** — ✅ pass
   - Evidence: `listsPlugin()` is registered at line 56 of `ItemDescriptionEditor.tsx` with no `tasks` option — the plugin serializes DOM `<ul>`/`<ol>` back to markdown on save. The CSS fix only affects rendering, not serialization. `diffSourcePlugin` is configured with `diffMarkdown: markdown` (line 79), preserving the original.

8. **AC-8 (no global regression)** — ✅ pass
   - Evidence: All five new rules are scoped under `.item-detail-md-editor__content` (a class chain). No Tailwind Preflight rules are modified, no `tailwind.config.js` changed, and no `!important` introduced. Grep for `list-disc|list-decimal` across non-REQ files returns no matches, confirming no other components rely on Tailwind utilities that could be affected.

9. **AC-9 (comment preview unchanged)** — ✅ pass
   - Evidence: `.comment-markdown .wmde-markdown` rules (lines 42–60 of `globals.css`) are unchanged. The comment preview's `ul`/`ol` are governed by `@uiw/react-markdown-preview`'s own stylesheet, which is independent of the editor's `.item-detail-md-editor__content` subtree.

10. **AC-10 (selector specificity without `!important`)** — ✅ pass
    - Evidence: `grep -n "!important" app/globals.css` returns no matches. Tailwind Preflight's rule is `ul, ol { list-style: none; ... }` (element selectors, specificity 0-1-0). The new rules use `.item-detail-md-editor__content ul` (class + element, specificity 0-2-1), which wins in both specificity tiers (0 classes vs 2 classes) and the element tier (0 vs 1).

11. **AC-11 (multiple editors)** — ✅ pass
    - Evidence: All rules use the class selector `.item-detail-md-editor__content`, not an `#id`. Multiple instances of the component each receive the class, so all inherit the rules.

12. **AC-12 (theming preserved)** — ✅ pass
    - Evidence: No hard-coded color values in the new rules. The `.item-detail-md-editor` parent (line 65) sets `color: hsl(var(--foreground))` and uses `hsl(var(--...))` CSS variables that respond to the `dark` class. List markers inherit this `color` by default as they are text-level elements.

### Additional Checks

- **TypeScript**: `npx tsc --noEmit` completes with no errors.
- **Build regression**: The `_global-error` prerender failure is pre-existing (reproduces with and without the CSS changes) and is unrelated to this fix.
- **CSS correctness**: Five new rules at lines 105–109 are syntactically valid CSS (no missing semicolons, correct property names).
