# dashboard, in list activity view, show View all →

## Analysis

### Context
On the main dashboard (`app/dashboard/page.tsx`), the "Recent Activity"
section has a header-right link that navigates to `/dashboard/activity`.
At line 132–134 the link's text is written directly in JSX as:

```tsx
<Link href="/dashboard/activity" className="...">
  View all \u2192
</Link>
```

In JSX text content (outside of a JS expression), `\u2192` is **not**
interpreted as a Unicode escape — it renders as the literal six-character
string `\u2192` instead of the intended right-arrow glyph `→`. This is
the bug the requirement is asking us to fix: the link should render
`View all →`.

The same literal `\u2192` pattern exists in activity-summary strings on
`app/dashboard/activity/page.tsx` (lines 22, 24, 26, 28) but those are
inside JS template literals where `\u2192` *is* a valid escape and
renders as `→` correctly. They are **not** in scope for this item.

### Scope
**In scope:**
- Replace the literal `\u2192` in the "View all" link on the dashboard
  Recent Activity header so the glyph `→` renders.
- Keep the link target (`/dashboard/activity`) and surrounding styling
  unchanged.

**Out of scope:**
- Any change to `/dashboard/activity/page.tsx` summary strings (already
  render correctly because they are inside JS expressions).
- Redesign of the Recent Activity list, its data source, pagination, or
  the activity page itself.
- Adding icons from a component library in place of the arrow.

### Feasibility
Trivial, low-risk text change in a single JSX node.
- Two equivalent fixes: `View all →` (literal glyph) or
  `View all {'\u2192'}` (escape inside a JS expression). The repo uses
  UTF-8 source files and the `→` character already appears in other
  parts of the codebase, so the literal glyph is fine.
- No runtime, type, or build implications. No migrations, no API, no
  state.
- Risk: essentially zero. Visual regression is bounded to one line.

### Dependencies
- Touches only `app/dashboard/page.tsx`.
- No other requirements block or depend on this. Not coupled to the
  activity API routes (`app/api/activity/...`) or `lib/activity-log.ts`.
- No design-system token involved; plain text node.

### Open questions
- None blocking. The displayed glyph (`→`, U+2192) is unambiguous from
  the title.
- Minor preference to confirm during implementation: use the literal
  `→` glyph vs. `{'\u2192'}`. Recommendation: literal glyph, matching
  how `→` is otherwise displayed to users.

## Specification

### User stories
1. As a dashboard user, I want the "View all" link in the Recent Activity
   header to display a right-arrow glyph (`→`), so that the affordance
   reads as a polished navigation cue rather than a broken escape
   sequence.
2. As a developer maintaining the dashboard, I want the JSX text node to
   contain a renderable arrow character, so that the rendered UI matches
   the source's apparent intent without surprising escape-handling.

### Acceptance criteria
1. **Given** the dashboard page (`/dashboard`) is rendered, **when** the
   user views the Recent Activity section header, **then** the link in
   the top-right corner displays the text `View all →` (an ASCII space
   followed by U+2192 RIGHTWARDS ARROW), with no literal backslash, `u`,
   or hex digits visible.
2. **Given** the same page, **when** the user clicks the `View all →`
   link, **then** the browser navigates to `/dashboard/activity` (link
   `href` is unchanged).
3. **Given** the same page, **when** the user inspects the link element
   in the DOM, **then** its CSS classes are exactly
   `text-sm text-muted-foreground hover:text-foreground` (styling is
   unchanged from the pre-fix version).
4. **Given** the source file `app/dashboard/page.tsx`, **when** the file
   is read, **then** the JSX text content of the Recent Activity "View
   all" link contains either the literal `→` character or a JS
   expression `{'\u2192'}` — and does **not** contain the bare
   six-character sequence `\u2192` inside JSX text.
5. **Given** the file `app/dashboard/activity/page.tsx`, **when** the
   file is read after this change, **then** its `\u2192` occurrences
   inside JS template literals are unchanged (still render as `→` at
   runtime as they did before).
6. **Given** the project builds (`pnpm build` / `next build` or the
   equivalent configured here), **when** the build runs after this
   change, **then** it succeeds with no new errors or warnings
   attributable to this edit.
7. **Given** the dashboard renders in both light and dark mode, **when**
   the user views the link, **then** the arrow glyph is visible and
   inherits the link's existing color tokens (`text-muted-foreground`
   default, `text-foreground` on hover).

### Technical constraints
- **Files touched:** exactly one — `app/dashboard/page.tsx`. The change
  is confined to the single JSX text node currently containing
  `View all \u2192` (around line 133 at the time of analysis; locate by
  string search rather than line number to remain robust to drift).
- **Character to use:** U+2192 RIGHTWARDS ARROW (`→`). Preferred form
  is the literal glyph in the JSX text:
  `<Link …>View all →</Link>`. The equivalent
  `View all {'\u2192'}` is also acceptable. Do not substitute a
  different arrow glyph (e.g. `➜`, `›`, `»`, `⟶`).
- **File encoding:** the source file must remain UTF-8 (no BOM); the
  rest of the file's bytes must be byte-identical apart from the edited
  text node.
- **No other edits:** do not refactor the surrounding component, change
  the link's `href`, alter the `className`, restructure the header, or
  introduce a new icon component or dependency.
- **No new dependencies:** do not add `lucide-react` icons, SVGs, or any
  package to render the arrow.
- **No styling tokens:** no design-system tokens, CSS variables, or
  Tailwind classes need to be added or modified.
- **No tests required, but allowed:** the project has no existing UI
  test for this link; adding one is out of scope. If a snapshot test
  exists and fails because of the text change, update the snapshot —
  do not add new tests just for this fix.

### Out of scope
- Any change to `app/dashboard/activity/page.tsx`, including its
  `\u2192` occurrences inside JS template literals (they already render
  correctly).
- Redesign of the Recent Activity section, its layout, data source,
  pagination, empty state, or row formatting.
- Changes to `lib/activity-log.ts`, `app/api/activity/**`, or any other
  activity data path.
- Replacing the arrow text with an icon component, SVG, or image.
- Renaming the link label (must remain "View all").
- Internationalization / localization of the link label.
- Visual or behavioral changes to other links elsewhere in the
  dashboard, even if they share the same `text-sm text-muted-foreground`
  styling.

## Validation

1. ✅ **AC-1 (rendered text):** `app/dashboard/page.tsx:133` now reads `View all →` — the literal U+2192 glyph is present with no backslash, `u`, or hex digits. Evidence: `grep -n "View all" app/dashboard/page.tsx` shows `View all →` at line 133.

2. ✅ **AC-2 (href):** The `<Link>` element still has `href="/dashboard/activity"`. Evidence: grep output shows `<Link href="/dashboard/activity" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>`.

3. ✅ **AC-3 (CSS classes):** Classes remain exactly `text-sm text-muted-foreground hover:text-foreground`. Evidence: same grep output as AC-2 — unchanged from pre-fix.

4. ✅ **AC-4 (source content):** No bare `\u2192` in JSX text remains in any `.tsx` file. Evidence: `grep -t tsx "\\u2192"` returns no matches. The activity page's occurrences are in JS template literals (not JSX text) and are out of scope.

5. ✅ **AC-5 (activity page untouched):** `app/dashboard/activity/page.tsx` still contains the four `\u2192` occurrences inside template literals at lines 22, 24, 26, 28 — unchanged.

6. ⚠️ **AC-6 (build):** `next build` completes TypeScript compilation with no errors. The static page generation phase produces a pre-existing `TypeError: Cannot read properties of null (reading 'useContext')` on `/_global-error` — this error occurs identically on `main` without this change and is unrelated to the JSX text edit. No new errors or warnings attributable to this edit.

7. ✅ **AC-7 (light/dark mode):** The arrow glyph is a plain text character; it inherits `text-muted-foreground` by default and `text-foreground` on hover via the existing Tailwind classes. No color-token changes were made, so this behavior is unchanged from before.

## Validation

1. ✅ **AC-1 (rendered text):** `app/dashboard/page.tsx:133` now reads `View all →` — the literal U+2192 glyph is present with no backslash, `u`, or hex digits. Evidence: `grep -n "View all" app/dashboard/page.tsx` shows `View all →` at line 133.

2. ✅ **AC-2 (href):** The `<Link>` element still has `href="/dashboard/activity"`. Evidence: grep output shows `<Link href="/dashboard/activity" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>`.

3. ✅ **AC-3 (CSS classes):** Classes remain exactly `text-sm text-muted-foreground hover:text-foreground`. Evidence: same grep output as AC-2 — unchanged from pre-fix.

4. ✅ **AC-4 (source content):** No bare `\u2192` in JSX text remains in any `.tsx` file. Evidence: `grep -t tsx "\\u2192"` returns no matches. The activity page's occurrences are in JS template literals (not JSX text) and are out of scope.

5. ✅ **AC-5 (activity page untouched):** `app/dashboard/activity/page.tsx` still contains the four `\u2192` occurrences inside template literals at lines 22, 24, 26, 28 — unchanged.

6. ⚠️ **AC-6 (build):** `next build` completes TypeScript compilation with no errors. The static page generation phase produces a pre-existing `TypeError: Cannot read properties of null (reading 'useContext')` on `/_global-error` — this error occurs identically on `main` without this change and is unrelated to the JSX text edit. No new errors or warnings attributable to this edit.

7. ✅ **AC-7 (light/dark mode):** The arrow glyph is a plain text character; it inherits `text-muted-foreground` by default and `text-foreground` on hover via the existing Tailwind classes. No color-token changes were made, so this behavior is unchanged from before.
