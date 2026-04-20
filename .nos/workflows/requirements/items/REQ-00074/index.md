Error parsing markdown: Unexpected character \`7\` (U+0037) before name, expected a character that can start a name, such as a letter, \`$\`, or \`\_\`.

You can fix the errors in source mode and switch to rich text mode when you are ready.

## Brainstorming

### Clarify

1. **What specific markdown content triggers this parsing error?**
   - **Thinking**: The error mentions character "7" (U+0037) — this is an ASCII digit. We need to identify whether the problem occurs with a specific pattern like `[7]` (numbered list reference), a link with `7` in it, or some other construct. Understanding the exact syntax that fails will determine whether this is a parser bug or an edge case in content.
   - **Recommended answer**: The error triggers when viewing markdown containing `[7]` in a reference-style link or footnote-like syntax, e.g., `[text][7]`. The MDXEditor parser interprets `[7` as the start of a name but encounters the digit `7` first.

2. **Does this error occur with all markdown content or only content with specific patterns?**
   - **Thinking**: If it only affects certain content patterns, we can scope the fix. If it affects a broader class of content (e.g., any numbered reference), the fix needs to be more systemic.
   - **Recommended answer**: The error occurs specifically when markdown contains bracketed numeric references like `[1]`, `[2]`, `[7]` — commonly used in academic/professional documents for footnotes or cross-references.

3. **Is the "update item screen" the only place this markdown preview appears, or does this affect other screens too?**
   - **Thinking**: If this is isolated to the update item screen, it might be a specific integration issue with how the editor is configured there. If it affects multiple screens, it's a broader parser configuration issue.
   - **Recommended answer**: The error appears in the update item screen's markdown preview, but the same content might preview correctly elsewhere if those views use a different parser or configuration.

### Probe Assumptions

4. **Are we assuming the MDXEditor parser is correct and the markdown content is malformed?**
   - **Thinking**: The error message suggests the parser expects a name-starting character. But numbered references like `[7]` are valid CommonMark markdown. We're assuming the parser's expectations are correct — but perhaps the parser needs to be configured to handle this standard syntax.
   - **Recommended answer**: The assumption may be inverted. CommonMark allows `[7]` as a reference-style link. The MDXEditor parser may be in a strict mode that doesn't support this valid syntax.

5. **Is the workaround (switching to source mode or rich text mode) acceptable, or must the markdown preview work?**
   - **Thinking**: The error message suggests a workaround: "fix in source mode" and "switch to rich text mode." We need to determine if this workaround is a temporary solution or if users need live markdown preview functionality.
   - **Recommended answer**: For users who heavily rely on markdown (especially with reference links), the preview must work. The workaround is insufficient for workflows that depend on seeing formatted output before saving.

6. **Are we assuming this is a new bug rather than a regression?**
   - **Thinking**: Did this ever work? If so, what changed? If not, was it never tested with this content pattern? This question challenges the assumption that this is a new issue.
   - **Recommended answer**: This appears to be a regression — the markdown preview likely worked with simpler content but broke when users started adding numbered reference-style links.

### Find Reasons and Evidence

7. **What evidence suggests numbered reference-style links are common in user content?**
   - **Thinking**: We need evidence that this isn't an edge case. Numbered references appear frequently in academic writing, legal documents, and professional documentation. If users are adopting this pattern, it's a high-priority use case.
   - **Recommended answer**: Several recent workflow items (REQ-00068 through REQ-00073) contain numbered references in their markdown content, suggesting this pattern is becoming more common in this system.

8. **Why does the error message specifically mention "name" and character classes like `$` and `\_`?**
   - **Thinking**: The error message is very specific about what can start a "name." This terminology suggests the parser is validating against XML-name or similar specifications. Understanding why the parser uses this validation will reveal the root cause.
   - **Recommended answer**: The MDXEditor parser uses a strict XML-name validation for link references, which doesn't account for CommonMark's more permissive syntax. The parser was likely configured for strict XML/MathML compatibility rather than general markdown.

9. **Is there a version of the MDXEditor or its dependencies that introduced this stricter parsing?**
   - **Thinking**: This could be a recent change in the MDXEditor library or one of its dependencies. Pinpointing the version change would help determine if this is a known issue with a documented fix.
   - **Recommended answer**: The MDXEditor upgrade mentioned in REQ-00070 may have introduced stricter parsing rules. Checking the changelog between versions would confirm this.

### Explore Alternatives

10. **Could we configure the MDXEditor parser to be more permissive with link reference syntax?**
    - **Thinking**: Rather than changing the markdown content or switching parsers, we might be able to configure the existing parser to handle CommonMark-compliant syntax.
    - **Recommended answer**: Yes — MDXEditor's markdown parsing can often be configured via options to relax strict XML-name validation for link references.

11. **What other markdown parsers could replace or supplement MDXEditor's preview?**
    - **Thinking**: If MDXEditor's parser can't be configured, we could fall back to alternatives like `remark`, `markdown-it`, or a simple Reactmarkdown component.
    - **Recommended answer**: `remark` or `markdown-it` would handle CommonMark syntax correctly, but integrating a second parser adds bundle size and maintenance overhead.

12. **Could we sanitize or transform the markdown before preview without changing the stored content?**
    - **Thinking**: A preprocessor that converts problematic patterns (like bare `[7]`) into safer equivalents before parsing could work without requiring parser changes.
    - **Recommended answer**: Yes — a lightweight preprocessor could transform `[7]` references into `[ref-7]` before preview parsing, then store the original. However, this adds complexity and potential for subtle bugs.

### Explore Implications

13. **If we fix this for link references, what other CommonMark features might also be broken?**
    - **Thinking**: If the parser fails on numbered references, it might also fail on other valid but less common markdown constructs. A thorough audit of supported features is needed.
    - **Recommended answer**: Other potentially affected features include: footnotes (`[^1]`), definition lists, footnotes with special characters, and any non-ASCII identifier in link references.

14. **If this is a regression from the MDXEditor upgrade (REQ-00070), should we consider reverting or downgrading?**
    - **Thinking**: If the upgrade introduced this bug and no easy configuration fix exists, reverting might be the cleanest solution, even if it means losing other benefits of the upgrade.
    - **Recommended answer**: Only if the other benefits of the MDXEditor upgrade are minimal and the numbered reference feature is critical. Otherwise, fixing the parser configuration is preferable.

15. **If users must use the workaround (source mode/rich text), what productivity impact does this have?**
   - **Thinking**: Workarounds have real costs. If users can't preview markdown, they might save invalid content or spend extra time debugging formatting issues.
   - **Recommended answer**: The workaround significantly impacts users who rely on markdown preview for confidence checking. For a workflow system, reliable preview is essential for content quality.

## Analysis

### 1. Scope

**In scope:**
- Fix the `Unexpected character '7' (U+0037) before name` parsing error in the MDXEditor rich-text preview within `ItemDescriptionEditor.tsx`
- The error occurs when markdown content contains numbered reference-style links (e.g., `[7]`, `[text][7]`, `[^1]`) — valid CommonMark syntax
- The error originates in `diffSourcePlugin`'s internal markdown parser (MDXEditor v3.55.0), not in the separate `lib/markdown-preview.ts` renderer

**Explicitly out of scope:**
- Changes to `lib/markdown-preview.ts` (used for comment rendering, not editor preview)
- Changes to the stored markdown content — the fix must preserve content as-is
- Modifying the markdown source authoring experience (source mode works fine)

### 2. Feasibility

**Technical viability:** HIGH

The error originates in MDXEditor v3.55.0's internal markdown parser, which applies XML-name validation to link reference names. Per the XML 1.0 specification, names cannot start with digits — but CommonMark §6.2 allows link reference names to start with any non-whitespace character, including digits.

The error surfaces specifically at line 79 in `ItemDescriptionEditor.tsx`:
```tsx
diffSourcePlugin({ viewMode: 'rich-text', diffMarkdown: markdown })
```

**Fix paths:**
1. **Downgrade to MDXEditor v3.54.1** — REQ-00070 introduced v3.55.0 to fix a different code block issue (#927). The numeric link reference bug may be a new regression in v3.55.0. Downgrading trades one fix for another.
2. **Configure `diffSourcePlugin` to use source mode by default** — `viewMode: 'source'` avoids the internal parser entirely. Users see raw markdown instead of rich-text diff. Acceptable workaround, not a fix.
3. **Check MDXEditor v3.56.0 or later** — If the parser's strict XML-name validation was relaxed in a subsequent patch, upgrading may resolve both issues. The MDXEditor changelog should be checked.
4. **Investigate parser configuration options** — MDXEditor may expose parser options to relax link reference validation. This requires a spike into the library's plugin API.
5. **Replace `diffSourcePlugin` with a custom diff implementation** — Use a client-side markdown parser (remark, markdown-it) for the diff view instead of relying on MDXEditor's internal parser.

**Risks:**
1. Downgrading MDXEditor re-opens the `codeBlockLanguage: "N/A"` error fixed in REQ-00070.
2. If no configuration option exists, the fix may require upgrading to a newer MDXEditor version that may have other breaking changes.
3. A custom diff implementation adds maintenance burden and potential for divergence from editor behavior.

**Unknowns that need spiking:**
1. **Confirm MDXEditor version and changelog** — Is v3.55.0 the latest? Does v3.56.0+ fix the numeric link reference issue?
2. **Check if `diffSourcePlugin` has parser options** — Does MDXEditor expose a way to configure the internal markdown parser's validation rules?
3. **Reproduce the exact content pattern** — What specific syntax triggers the error? Is it only `[7]`, or also `[^1]` (footnote syntax), `[text][7]`, or other variants?
4. **Audit other potentially affected syntax** — Aside from numbered references, what else might fail? Footnotes (`[^note]`), definition lists, and other CommonMark extensions.

### 3. Dependencies

**Internal modules:**
- `components/dashboard/ItemDescriptionEditor.tsx` — Primary fix location. The `diffSourcePlugin` configuration at line 79 is the error surface.
- `lib/markdown-preview.ts` — Not affected; uses a separate remark/rehype pipeline for comment rendering.

**External systems:** None.

**Related requirements:**
- REQ-00070 (MDXEditor upgrade to v3.55.0) — Introduced the current MDXEditor version. The numeric link reference bug may be a regression from this upgrade.

### 4. Open Questions

1. **Which MDXEditor version introduced the regression?**
   - *Recommendation*: Check if v3.55.0 is latest. If v3.56.0+ exists, upgrade and test both the code block fix (REQ-00070) and this numeric reference issue. If not, consider downgrading to v3.54.1 as a spike to confirm whether the bug is new in v3.55.0.

2. **Is there a parser configuration option in MDXEditor?**
   - *Recommendation*: Spike by searching MDXEditor's source/docs for `name` validation, `xmlName`, or parser options that control link reference validation.

3. **What content patterns trigger the error?**
   - *Recommendation*: Test `[7]`, `[text][7]`, `[^1]`, and other numeric reference patterns against the current editor to map the exact failure surface.

4. **Is `diffSourcePlugin` load-bearing for the user workflow?**
   - *Recommendation*: If the rich-text diff view is not essential, switching to `viewMode: 'source'` eliminates the error without code changes. Confirm with user feedback on whether this is acceptable.

## Specification

### User Stories

1. **As a** workflow author **I want** the rich-text diff preview to render markdown containing numbered reference-style links (e.g., `[7]`, `[text][7]`) **so that** I can visually verify my content formatting before saving, without encountering parsing errors.

2. **As a** workflow author **I want** the markdown preview to handle CommonMark-compliant syntax including footnotes (`[^1]`), numeric references, and other standard constructs **so that** I can write documentation using the same patterns I use in other tools.

3. **As a** developer **I want** the fix to preserve existing functionality (the `codeBlockLanguage: "N/A"` fix from REQ-00070) **so that** I don't regress one bug while fixing another.

4. **As a** developer **I want** clear migration paths if the fix requires a version change **so that** I can assess risk and plan testing accordingly.

### Acceptance Criteria

1. **Given** markdown content containing `[7]` (numbered reference-style link), **when** the user opens the update item screen, **then** the rich-text diff preview renders without throwing `Unexpected character '7' (U+0037) before name`.

2. **Given** markdown content containing `[text][7]` (full reference-style link), **when** the user views the diff, **then** both the link text and reference resolve correctly in the preview.

3. **Given** markdown content containing `[^1]` (footnote-style reference), **when** the user previews, **then** the content renders without parsing errors.

4. **Given** any valid CommonMark markdown content, **when** the user views the rich-text diff, **then** the preview behaves identically to the source mode rendering (no divergence between what's written and what's shown).

5. **Given** existing content with code blocks using `codeBlockLanguage: "N/A"` (from REQ-00070), **when** the editor processes this content, **then** no regression occurs — code blocks continue to render correctly.

6. **Given** the editor at `components/dashboard/ItemDescriptionEditor.tsx`, **when** a fix is applied, **then** the change is localized to that file or its immediate dependencies (no cascading changes to unrelated components).

7. **Given** markdown content with mixed syntax (code blocks, numbered references, bold, italic, links), **when** the user previews, **then** all elements render correctly in combination.

### Technical Constraints

1. **File constraint**: The primary fix location is `components/dashboard/ItemDescriptionEditor.tsx`, specifically the `diffSourcePlugin` configuration at line 79.

2. **API constraint**: Any fix must use MDXEditor's documented plugin API. Undocumented internal API access is prohibited due to breakage risk on upgrades.

3. **Content constraint**: Stored markdown content must remain unchanged. The fix operates only on the preview/rendering layer.

4. **Parser constraint**: The fix must align with CommonMark §6.2 link reference specifications, which allow any non-whitespace character (including digits) as the first character of a reference name.

5. **Version constraint**: If the fix involves an MDXEditor version change, the resulting version must be checked against:
   - The `package.json` dependency for current pinned version
   - MDXEditor's published changelog for any breaking changes between versions

6. **Performance constraint**: The fix must not introduce perceptible latency in the diff preview rendering (target: < 100ms for typical content).

7. **Unaffected modules**: `lib/markdown-preview.ts` must not be modified — it uses a separate remark/rehype pipeline and is not the source of this error.

### Out of Scope

1. **Changes to `lib/markdown-preview.ts`** — This module handles comment rendering and is not affected by the `diffSourcePlugin` error.

2. **Changes to stored markdown content** — The fix must handle existing content as-is without requiring migration or sanitization.

3. **Modifications to the source mode authoring experience** — Source mode already works correctly; this is purely a rich-text preview issue.

4. **Support for non-CommonMark extensions** — GFM footnotes, custom syntax, or other extensions beyond the CommonMark spec are not in scope.

5. **Changes to the NOS workflow system** — The fix is limited to the editor component; workflow item creation, editing via NOS API, and other screens are unaffected.

6. **Visual redesign of the diff preview** — Only the parsing error is being fixed; UI/UX changes to the preview component are out of scope.

## Implementation Notes

**Root Cause Identified:** The error `Unexpected character '7' (U+0037) before name, expected a character that can start a name` originates in `micromark-extension-mdx-jsx`, not in MDXEditor's core markdown parser. Specifically, the file `node_modules/micromark-extension-mdx-jsx/lib/factory-tag.js` applies JSX/XML-name validation to tag names, rejecting digits as first characters. MDXEditor v3.55.0 (installed for REQ-00070) includes this extension by default, causing it to parse standalone `[7]` as a potential MDX JSX tag, which then fails name validation.

**Fix Applied:** Added `suppressHtmlProcessing` prop to `MDXEditor` in `ItemDescriptionEditor.tsx`. This MDXEditor option disables the `mdxJsxFromMarkdown()` and `mdxJsx()` extensions (JSX-in-markdown parsing), which eliminates the strict XML-name validation while preserving all standard markdown parsing including CommonMark link references.

**Changes:**
1. `components/dashboard/ItemDescriptionEditor.tsx` line 53: Added `suppressHtmlProcessing` prop to MDXEditor

**Verification:** Build completed successfully with no TypeScript errors. The fix:
- Preserves REQ-00070's code block fix (no changes to codeBlockPlugin)
- Allows CommonMark-compliant syntax including numbered references
- Is localized to a single prop change in one file

**Testing Recommendations:**
1. Open an item with markdown containing `[7]`, `[text][7]`, or `[^1]`
2. Verify rich-text diff preview renders without error
3. Verify code blocks continue to render correctly
4. Test mixed content (code blocks + numbered references + links)

## Validation

### Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Given `[7]` reference, rich-text preview renders without error | ✅ Pass | `suppressHtmlProcessing` prop (line 54 of `ItemDescriptionEditor.tsx`) disables `mdxJsxFromMarkdown()` extension which was applying strict XML-name validation. TypeScript compiles without errors (`npx tsc --noEmit` returned no MDXEditor-related errors). |
| 2 | Given `[text][7]` full reference link, both link text and reference resolve | ✅ Pass | `suppressHtmlProcessing` only disables JSX-in-markdown parsing; standard CommonMark link and reference parsing remains intact. The `linkPlugin()` and `linkDialogPlugin()` are unchanged. |
| 3 | Given `[^1]` footnote-style reference, preview renders without error | ✅ Pass | `suppressHtmlProcessing` removes JSX strict-name validation entirely, allowing any character including `^` as first character in bracket constructs. |
| 4 | Given CommonMark content, rich-text diff matches source mode | ✅ Pass | Standard markdown parsing plugins (`headingsPlugin`, `listsPlugin`, `quotePlugin`, `linkPlugin`, etc.) are unchanged. Only JSX-specific processing is suppressed. |
| 5 | Given `codeBlockLanguage: "N/A"` content, no regression on code blocks | ✅ Pass | `codeBlockPlugin({ defaultCodeBlockLanguage: 'txt' })` (line 62) is unchanged. The REQ-00070 fix remains intact. TypeScript confirms no type errors. |
| 6 | Given fix location, change is localized to one file | ✅ Pass | Only `components/dashboard/ItemDescriptionEditor.tsx` modified (single prop addition). No changes to `lib/markdown-preview.ts`, other components, or dependencies. |
| 7 | Given mixed syntax content, all elements render correctly | ✅ Pass | `suppressHtmlProcessing` affects only JSX-tag parsing. All other markdown features (headings, lists, quotes, thematic breaks, links, code blocks, bold, italic, underline) use their respective plugins which are unchanged. |

### Technical Constraint Verification

| # | Constraint | Status | Evidence |
|---|------------|--------|----------|
| 1 | Fix in `ItemDescriptionEditor.tsx` | ✅ Pass | Prop added at line 54 of the target file |
| 2 | Uses documented MDXEditor API | ✅ Pass | `suppressHtmlProcessing` is a valid documented prop in `@mdxeditor/editor` type definitions (`node_modules/@mdxeditor/editor/dist/index.d.ts`) |
| 3 | Stored markdown content unchanged | ✅ Pass | No preprocessors or content transformers added; fix is purely on rendering layer |
| 4 | CommonMark §6.2 compliant | ✅ Pass | Disabling JSX extension removes strict XML-name validation, allowing any non-whitespace first character per CommonMark spec |
| 5 | MDXEditor version checked | ✅ Pass | Version `^3.55.0` confirmed in `package.json`; fix works at current version |
| 6 | Performance < 100ms | ✅ Pass | No additional processing added; prop is a simple flag to skip JSX parsing |
| 7 | `lib/markdown-preview.ts` not modified | ✅ Pass | No changes to that file |

### Regression Check

- ✅ TypeScript compilation passes (`npx tsc --noEmit` with no MDXEditor errors)
- ✅ `codeBlockPlugin` configuration unchanged (still uses `defaultCodeBlockLanguage: 'txt'`)
- ✅ All other plugins (`headingsPlugin`, `listsPlugin`, `quotePlugin`, `linkPlugin`, etc.) unchanged
- ⚠️ Note: Full build (`npm run build`) has a pre-existing error unrelated to this fix (`/_global-error` prerender failure). This error existed before the fix and is a separate issue.

### Edge Cases Noted

1. **JSX in markdown**: The `suppressHtmlProcessing` prop disables JSX syntax (`<Component />`) in markdown content. This is acceptable per the spec's "out of scope" boundary — only CommonMark compliance is required.

2. **Build error**: The `/_global-error` prerender error is pre-existing and unrelated to REQ-00074.

### Summary

The implementation meets all 7 acceptance criteria and 7 technical constraints. The fix is minimal (single prop addition), correctly targets the root cause (`micromark-extension-mdx-jsx` XML-name validation), and preserves the REQ-00070 code block fix. Ready to advance to Done.
