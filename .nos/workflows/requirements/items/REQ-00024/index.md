## Analysis

### Scope

**In scope**
- Extend the agent prompt assembly so that an item's `comments` array is rendered into the `<item-content>` section passed to the Claude Code Adapter (and, by extension, any other adapter driven by `buildAgentPrompt`).
- Touch points: `lib/system-prompt.ts` (`buildAgentPrompt`), and its sole caller `lib/stage-pipeline.ts` (needs to forward `item.comments`).
- Decide a deterministic rendering for comments (ordering, delimiter, placement relative to body / trailing `workflowId`/`itemId` lines) so the standing system prompt's "trailing lines" contract still holds.
- Update `types/workflow.ts` docs / callers if the `buildAgentPrompt` signature grows.

**Out of scope**
- Any change to how comments are authored, stored, or rendered in the UI (`ItemDetailDialog`, Kanban).
- Comment schema changes (e.g. author, timestamp, threading) — this requirement treats comments as the existing `string[]`.
- Retroactively re-running stages on items whose prior runs did not see comments.
- Changes to `nos-comment-item` skill behavior.

### Feasibility

Straightforward. `buildAgentPrompt` is a pure string-builder with one caller (`triggerStagePipeline`), and `WorkflowItem.comments` is already read/written by `workflow-store.ts`. No adapter-side change is required — the adapter receives a single `prompt` string.

Risks / unknowns:
- **Prompt-contract drift**: the system prompt tells the agent to read `workflowId:` / `itemId:` off the *trailing lines* of `<item-content>`. Comments must be placed **above** those trailing lines, not after, or the standing instructions break.
- **Prompt size**: long comment histories could bloat the prompt. For now comments are short and few; a truncation policy is probably premature but worth noting.
- **Injection surface**: comments are free-form user text and will now be inlined into the model prompt. That is already true of `title` and `body`, so no new trust boundary is crossed, but the rendering should clearly fence comments (e.g. a `## Comments` heading or numbered list) so the model can tell them apart from the original request.
- **Empty vs absent**: `comments` is optional and often `[]`. The renderer must emit nothing (not an empty `## Comments` block) when the array is empty, to avoid confusing the agent.

### Dependencies

- `lib/system-prompt.ts` — `buildAgentPrompt` signature and body.
- `lib/stage-pipeline.ts` — only caller; must pass `item.comments` through.
- `types/workflow.ts` — `WorkflowItem.comments` is the source field (no change expected).
- `lib/workflow-store.ts` — already persists and returns `comments` on reads; no change expected.
- `.nos/system-prompt.md` — standing instructions reference the `<item-content>` structure; may need a one-line note that comments appear there too (optional, non-blocking).
- Indirect: any future adapter added under `lib/agent-adapter*` inherits the new content automatically because they all consume the assembled `prompt` string.

### Open questions

1. **Ordering** — render comments oldest-first (chronological, matches the array order in `meta.yml`) or newest-first? Chronological is the expected default.
2. **Placement** — between `body` and the trailing `workflowId` / `itemId` lines (recommended, preserves the "trailing lines" contract), or as a separate sibling tag like `<item-comments>`? A `## Comments` subsection inside `<item-content>` is lower-risk.
3. **Format per comment** — plain bullets, numbered list, or fenced blocks? Comments can be multi-line markdown, so fenced blocks or a `---` separator per entry avoids list-item indentation mangling.
4. **Attribution / timestamps** — comments are currently stored as bare strings with no author or time metadata. Do we want to extend the schema now, or defer? Deferring keeps this requirement scoped; extending would be a separate REQ.
5. **Re-runs on Failed → Todo** — when an operator resets a failed item, should newly-added comments be visible to the re-run? Yes by construction if we read `item.comments` at pipeline-trigger time, but worth confirming that is the desired behavior.

## Specification

### User stories

1. As an operator running a workflow item through the stage pipeline, I want any comments I have left on the item to be included in the agent's prompt, so that the agent can react to clarifications, corrections, and follow-ups I have added after the original body was written.
2. As an operator resetting a `Failed` item back to `Todo` after adding a remediation comment, I want the re-run to see that new comment, so that I do not have to edit the body to communicate with the agent.
3. As an agent consuming `<item-content>`, I want comments to be clearly fenced and separated from the original request and from the trailing `workflowId`/`itemId` lines, so that I can still read identifiers off the trailing lines and can tell comments apart from the body.

### Acceptance criteria

1. **Signature** — `buildAgentPrompt` in `lib/system-prompt.ts` accepts an additional optional field `comments?: string[]` on its input object. Existing callers that omit it continue to compile and produce byte-identical output to today.
2. **Caller wiring** — `triggerStagePipeline` in `lib/stage-pipeline.ts` passes `item.comments` (the array as returned by `workflow-store.ts`) into `buildAgentPrompt`. No other call site is added.
3. **Empty / absent** — Given `comments` is `undefined`, `null`, an empty array, or an array that contains only blank/whitespace-only strings, When `buildAgentPrompt` runs, Then the rendered `<item-content>` MUST be byte-identical to the current output (no `## Comments` heading, no extra blank lines).
4. **Placement** — Given at least one non-blank comment, When `<item-content>` is rendered, Then the `## Comments` section MUST appear **after** the body and **before** the trailing `workflowId:` and `itemId:` lines. The last two lines of `<item-content>` remain `workflowId: <id>` and `itemId: <id>` in that order, preserving the standing system prompt's "trailing lines" contract.
5. **Ordering** — Comments MUST be rendered in array order (oldest-first / chronological, matching `meta.yml`). No sorting, filtering, or de-duplication is performed.
6. **Per-comment format** — Each comment is rendered as a numbered subsection so multi-line markdown inside a comment is not mangled by list-item indentation:
   ```
   ## Comments

   ### Comment 1
   <raw comment text, verbatim>

   ### Comment 2
   <raw comment text, verbatim>
   ```
   Separator between entries is a single blank line. Comment text is inserted verbatim — no escaping, trimming of internal whitespace, or markdown transformation. Trailing whitespace/newlines on an individual comment MAY be trimmed to keep spacing consistent.
7. **Blank filtering** — Individual comments that are empty or whitespace-only are skipped and do not consume a `Comment N` number. Numbering is over rendered comments only and starts at 1.
8. **Fencing** — The `## Comments` heading is the sole delimiter; no new XML tag (`<item-comments>` or similar) is introduced. Everything stays inside the existing `<item-content>` block so downstream adapters and the standing system prompt do not change.
9. **Unit-test coverage** — `lib/system-prompt.ts` is covered by tests (new or extended) that assert, at minimum: (a) no-comments output equals the pre-change golden, (b) multi-comment output places `## Comments` between body and the trailing ID lines in the documented format, (c) empty-array and all-blank-array inputs produce the no-comments output, (d) a comment containing its own markdown headings, code fences, or blank lines is preserved verbatim.
10. **No regressions** — `npm run lint` and `npm run typecheck` (or the project-standard equivalents already wired into CI) pass. No changes to `.nos/workflows/**` fixtures are required for this requirement.

### Technical constraints

- **Files touched**
  - `lib/system-prompt.ts` — extend `buildAgentPrompt` input type and rendering.
  - `lib/stage-pipeline.ts` — forward `item.comments` into the `buildAgentPrompt` call.
  - Test file alongside `lib/system-prompt.ts` (new or existing) covering the rules above.
- **Files NOT touched**
  - `types/workflow.ts` (`WorkflowItem.comments: string[]` already exists and is reused as-is).
  - `lib/workflow-store.ts` (already reads/writes `comments`).
  - `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/KanbanBoard.tsx`, or any other UI file.
  - `.claude/skills/nos-comment-item/` — skill behavior is unchanged.
- **Data contract** — `comments` is treated as `string[] | undefined`. Each element is an opaque UTF-8 string that may contain newlines and markdown. No author, timestamp, or threading fields are read or introduced.
- **Prompt-contract invariant** — The last two non-empty lines inside `<item-content>` MUST remain exactly `workflowId: <id>` and `itemId: <id>`. This is required by the standing system prompt in `.nos/system-prompt.md` and by the stage prompt's references to those trailing lines.
- **No truncation** — All non-blank comments are rendered, in full. A size-limit/truncation policy is explicitly deferred; if it becomes needed it will be filed as a separate requirement.
- **Trust boundary** — Comments are free-form user text inlined into the model prompt. This is the same trust level as `title` and `body` today; no new sanitization layer is added.
- **Pipeline trigger timing** — `triggerStagePipeline` reads the current `item.comments` at the moment the stage is triggered. Comments added after the agent spawn do not retroactively reach the agent; comments added before a re-run (including `Failed → Todo` resets) do.

### Out of scope

- Any UI change to how comments are authored, displayed, edited, or ordered.
- Any schema change to comments (author, timestamp, id, threading, markdown-vs-plain flag).
- Truncation, summarization, or size-capping of long comment histories.
- Filtering comments by author, by stage, or by any "visible to agent" flag.
- Changes to `nos-comment-item` skill — comments written by agents continue to append via the existing skill path and will naturally appear on the *next* stage run.
- Retroactive re-runs of items whose prior stage executions did not see comments.
- Introducing a new XML tag such as `<item-comments>` as a sibling of `<item-content>`; the system prompt contract is preserved by keeping comments inside `<item-content>`.
- Updating `.nos/system-prompt.md` to describe the new `## Comments` subsection — treated as a non-blocking follow-up doc tweak, not part of this requirement's Definition of Done.

## Implementation Notes

- `lib/system-prompt.ts` — `buildAgentPrompt` gained an optional `comments?: string[] | null` field. A new internal `renderCommentsSection` helper renders `## Comments` with numbered `### Comment N` subsections between the body and the trailing `workflowId:` / `itemId:` lines. Returns `''` for `undefined`, `null`, `[]`, and all-blank arrays, so the no-comments output is byte-identical to the pre-change golden. Trailing whitespace per comment is trimmed; internal content is preserved verbatim.
- `lib/stage-pipeline.ts` — `triggerStagePipeline` now forwards `item.comments` into `buildAgentPrompt`. No other call sites added.
- `lib/system-prompt.test.ts` (new) — `node --test` suite covering: no-comments golden, empty/null/all-blank equivalence, placement/numbering of multi-comment output, blank-skipping with numbering over rendered comments only, verbatim preservation of multi-line markdown comments (headings + code fences), and the body-absent path.
- `tsconfig.json` — added `allowImportingTsExtensions: true` so the test file can `import … from './system-prompt.ts'` (required by Node 25's native TypeScript strip-types runner, which resolves by actual on-disk filename under ESM).
- `package.json` — added `"test": "node --test lib/**/*.test.ts"` script.
- Deviations: none from the spec. AC #10 calls for `npm run lint` to pass; `next lint` is currently broken on `main` with `Invalid project directory provided, no such directory: …/lint` (reproduced on a clean stash), so it is a pre-existing failure unrelated to this change. `npx tsc --noEmit` passes and `npm test` passes 7/7.
- Deferred per spec: no update to `.nos/system-prompt.md`, no UI changes, no comment schema changes, no truncation.

## Validation

1. **Signature** — ✅ Pass. `lib/system-prompt.ts:25` declares `comments?: string[] | null`; callers that omit it (or pass `undefined`/`null`/`[]`) produce output byte-identical to the pre-change golden, verified by the `no-comments output is unchanged (undefined)` and `empty array produces byte-identical output to undefined` tests.
2. **Caller wiring** — ✅ Pass. `lib/stage-pipeline.ts:23` forwards `item.comments` into `buildAgentPrompt`; `grep -n buildAgentPrompt` finds no other production call sites (only the test file).
3. **Empty / absent** — ✅ Pass. `renderCommentsSection` (`lib/system-prompt.ts:43–51`) returns `''` for non-array, empty, and all-blank inputs; tests `empty array produces byte-identical output to undefined` and `all-blank comments produce byte-identical output to undefined` cover `undefined`, `null`, `[]`, and `['', '   ', '\n\t\n']`.
4. **Placement** — ✅ Pass. Rendered at `lib/system-prompt.ts:32` between `bodySection` and the trailing `workflowId:`/`itemId:` lines. The `comments render between body and trailing ID lines, numbered from 1` test asserts the literal last two lines of `<item-content>` remain `workflowId: wf` / `itemId: it`.
5. **Ordering** — ✅ Pass. `.filter(...).map((c, i) => ...)` preserves array order; no sort/dedup in `renderCommentsSection`. Test asserts `Comment 1 = first comment`, `Comment 2 = second comment` in input order.
6. **Per-comment format** — ✅ Pass. Entries joined by `'\n\n'` as `### Comment N\n<text>`; matches spec layout exactly. Trailing whitespace trimmed via `c.replace(/\s+$/, '')`; internal content untouched, confirmed by `multi-line markdown inside a comment is preserved verbatim` (headings, fenced code, blank lines round-trip).
7. **Blank filtering** — ✅ Pass. `.filter(c => typeof c === 'string' && c.trim().length > 0)` runs before numbering; test `blank comments are skipped and do not consume a number` asserts `['first','','   ','second']` renders as Comment 1/2 with no Comment 3/4.
8. **Fencing** — ✅ Pass. Only the `## Comments` heading is emitted; no new XML tag is introduced. `lib/system-prompt.ts` still emits exactly `<system-prompt>` / `<stage-prompt>` / `<item-content>`; adapter layer (`lib/stage-pipeline.ts:30`) still receives a single `prompt` string.
9. **Unit-test coverage** — ✅ Pass. `lib/system-prompt.test.ts` has 7 `node --test` cases covering (a) no-comments golden, (b) multi-comment placement+numbering, (c) empty/null/all-blank equivalence, (d) verbatim multi-line markdown with headings and code fences. `npm test` → 7 pass / 0 fail.
10. **No regressions** — ⚠️ Partial. `npx tsc --noEmit` passes cleanly with this change applied. `npm run lint` fails with `Invalid project directory provided, no such directory: …/lint`, but I reproduced the identical failure on a clean `git stash` of `main`, so this is a pre-existing broken `next lint` script unrelated to this requirement. No workflow fixtures under `.nos/workflows/**` were modified.

**Regressions / adjacent checks**
- `types/workflow.ts:27` — `comments?: string[]` unchanged; no schema drift.
- `lib/workflow-store.ts` — untouched; `readItem`-returned `comments` flows straight through.
- UI files (`ItemDetailDialog.tsx`, `KanbanBoard.tsx`) — untouched.
- `.claude/skills/nos-comment-item/` — untouched.
- Prompt-contract invariant (last two lines of `<item-content>` are `workflowId:` / `itemId:`) — upheld in both the body-present (test #4) and body-absent (`comments render even when body is absent`) paths.

**Verdict:** all ten ACs met; AC #10 is partial only because of a pre-existing broken `next lint` script on `main`. Advancing to Done.
