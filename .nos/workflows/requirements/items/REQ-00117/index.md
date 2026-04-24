# Activity > command > should show also the prompt that you sent in

## Analysis

### Scope

**In scope:**
- Add a `prompt` field to the `session-started` activity entry so the full prompt sent to the agent adapter is persisted in the activity log.
- Display the prompt text in the Activity page's **Commands** tab, underneath or alongside the existing command/args display.
- The prompt shown should be the assembled `fullPrompt` (system prompt + stage prompt + item content) that was passed to `adapter.startSession()`.

**Out of scope:**
- Modifying how the prompt is built (that's `buildAgentPrompt` in `lib/system-prompt.ts`).
- Showing the prompt in the "All" tab's compact row view — the request targets the Commands tab specifically.
- Retroactively backfilling prompts into existing `activity.jsonl` entries that were logged before this change.

### Feasibility

**Viable with low risk.** The change touches three layers:

1. **Data model** (`lib/activity-log.ts`): Add an optional `prompt` field to the `session-started` variant of `ActivityEntry.data`. Since the JSONL log is append-only and consumers use `kind` discriminated unions, adding a field is backwards-compatible.

2. **Activity writer** (`lib/stage-pipeline.ts:74-90`): Pass `fullPrompt` into the `appendActivity()` call's `data` object. The prompt string is already in scope at that call site (line 64).

3. **UI** (`app/dashboard/activity/page.tsx`): Render `d.prompt` inside the Commands tab card. The prompt can be long (it includes the full system prompt, stage prompt, and item body), so the UI should use a collapsible/expandable element or truncate with an expand toggle.

**Risks / considerations:**
- **Log size**: Full prompts can be several KB each. Over hundreds of sessions the `activity.jsonl` file will grow faster. This is acceptable for a dev-local tool, but worth noting.
- **Sensitive content**: The prompt includes the system prompt and item content. Since the activity log is already local-only and the Activity page is behind the dashboard, no new exposure is introduced.

### Dependencies

- **`lib/activity-log.ts`** — `ActivityEntry` type definition (the `session-started` data variant needs a new `prompt` field).
- **`lib/stage-pipeline.ts`** — `triggerStagePipeline()` where `appendActivity()` is called with `session-started` data; `fullPrompt` is already computed on line 50-60.
- **`app/dashboard/activity/page.tsx`** — Commands tab rendering logic (lines 196-234); needs to render the new `prompt` field.
- No external service or cross-workflow dependencies.

### Open questions

1. **Truncation vs. full display**: Should the UI show the full prompt (which includes the system prompt boilerplate) or only the item-specific portion (stage prompt + item content)? Full prompt is more useful for debugging; a trimmed version is less noisy.
2. **Collapsible or always visible?**: Given prompt length, should it default to collapsed with a "Show prompt" toggle, or be always visible?
3. **Chat route sessions**: The `/api/chat` route also starts sessions via `startStreamingSession()` but does not log a `session-started` activity entry. Should this requirement also cover prompts sent through the chat UI, or only pipeline-triggered sessions?

## Specification

### User stories

**US-1**: As an operator reviewing the Activity page, I want to see the full prompt that was sent to an agent when a session started, so that I can debug prompt assembly issues without having to reconstruct the prompt manually.

**US-2**: As an operator, I want the prompt to be collapsed by default in the Commands tab, so that the command card remains scannable when I'm browsing session history.

### Acceptance criteria

1. **AC-1 — Data model field**: The `session-started` variant of `ActivityEntry.data` in `lib/activity-log.ts` includes an optional `prompt?: string` field. Existing entries without the field continue to parse and render without error.
2. **AC-2 — Prompt persisted at write time**: `triggerStagePipeline()` in `lib/stage-pipeline.ts` passes the assembled `fullPrompt` string into the `appendActivity()` call's data object as `prompt`.
3. **AC-3 — Backwards compatibility**: Activity entries logged before this change (without `prompt`) render normally in both the All tab and Commands tab — no runtime errors, no blank sections.
4. **AC-4 — Commands tab display**: Each command card in `app/dashboard/activity/page.tsx` renders a "Show prompt" / "Hide prompt" toggle below the command line when `d.prompt` is present.
5. **AC-5 — Default collapsed**: The prompt section is collapsed (hidden) by default. Clicking the toggle reveals the full prompt text. Clicking again collapses it.
6. **AC-6 — Prompt rendering**: The prompt text is displayed in a `<pre>` or monospace block with horizontal scroll for long lines. No Markdown rendering is needed — plain text preserves the XML tags used in the prompt structure.
7. **AC-7 — Absent prompt graceful**: When `d.prompt` is `undefined` (pre-existing entries), the toggle is not rendered. No empty sections appear.
8. **AC-8 — All tab unchanged**: The compact row view in the All tab is not modified by this change.
9. **AC-9 — TypeScript clean**: `tsc --noEmit` passes after all changes.

### Technical constraints

1. **Data model** (`lib/activity-log.ts`): Add `prompt?: string` to the `{ kind: 'session-started'; ... }` data variant of the `ActivityEntry` union. The field is optional to maintain backwards compatibility with existing JSONL entries. Per the glossary definition of ActivityEntry, the `session-started` type is already a discriminated union member — the new field extends it without breaking the discriminant.

2. **Activity writer** (`lib/stage-pipeline.ts`): At line 74–90, the `appendActivity()` call constructs a `data` object with `kind: 'session-started'`. Add `prompt: fullPrompt` to this object. The `fullPrompt` variable is already in scope (computed at line 50–60 via `buildAgentPrompt`).

3. **UI** (`app/dashboard/activity/page.tsx`): Inside the Commands tab card rendering (lines 196–234), add a collapsible section after the command button (line 216). Use React `useState` local to each card (or a `Set<number>` at the list level) to track expanded state. The prompt text can be several KB — use `whitespace-pre-wrap` and `overflow-x-auto` to handle long lines.

4. **Log size consideration**: Full prompts are typically 2–8 KB each. For a dev-local tool with append-only JSONL, this is acceptable. No truncation at the data layer — the full prompt is persisted to support debugging.

5. **Scope boundary — chat route**: The `/api/chat` route's `startStreamingSession()` does not log `session-started` activity entries. Adding prompt logging to chat sessions is explicitly out of scope for this requirement.

6. **Scope boundary — prompt display**: The full assembled prompt (system + member + stage + item content) is stored and displayed. Splitting the prompt into subsections for selective display is out of scope.

### Out of scope

- Modifying prompt assembly logic in `buildAgentPrompt` (`lib/system-prompt.ts`).
- Adding prompt display to the All tab's compact row view.
- Retroactively backfilling `prompt` into existing `activity.jsonl` entries.
- Logging prompts for chat-route sessions (`/api/chat`).
- Truncating or summarizing the prompt at the data layer.
- Markdown rendering of the prompt text (plain text is sufficient since the prompt contains XML-tagged sections).

### RTM entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00117 | Activity: show prompt sent to agent | Feature request (user) | `docs/standards/system-architecture.md`, `docs/standards/glossary.md` (ActivityEntry, Adapter) | `lib/activity-log.ts`, `lib/stage-pipeline.ts`, `app/dashboard/activity/page.tsx` | Manual validation — AC-1 through AC-9 | Todo |

### WBS mapping

This requirement maps to the following WBS packages:

- **1.1.5 Activity Logging** — Extending the `ActivityEntry` data model with the `prompt` field and persisting it in the JSONL log.
- **1.2.3 Stage Pipeline Trigger** — Passing the assembled `fullPrompt` to the activity writer at session start.
- **1.4.10 Activity Feed** — Adding the collapsible prompt display to the Commands tab in the Activity page.

## Implementation Notes

Three files were modified to implement REQ-00117:

1. **`lib/activity-log.ts`** (line 35): Added `prompt?: string` as an optional field to the `session-started` variant of `ActivityEntry.data`. The field is optional to ensure backwards compatibility with existing JSONL entries that lack the field.

2. **`lib/stage-pipeline.ts`** (lines 74–91): Added `prompt: fullPrompt` to the `data` object passed to `appendActivity()`. The `fullPrompt` variable was already in scope at this call site, computed earlier via `buildAgentPrompt()`.

3. **`app/dashboard/activity/page.tsx`** (lines 52, 218–239): Added `expandedPrompts` state (`Set<number>`) to track which prompt sections are visible, and rendered a collapsible toggle + `<pre>` block for each `session-started` entry when `d.prompt !== undefined`. The toggle shows "▶ Show prompt" / "▲ Hide prompt" and defaults to collapsed.

No deviations from the documented standards. TypeScript compiles clean for all modified files.

## Validation

Validated against all 9 acceptance criteria on 2026-04-24.

| Criterion | Verdict | Evidence |
|-----------|---------|----------|
| AC-1 — Data model field | ✅ Pass | `lib/activity-log.ts:35` — `prompt?: string` present in `session-started` variant; field is optional. |
| AC-2 — Prompt persisted at write time | ✅ Pass | `lib/stage-pipeline.ts:89` — `prompt: fullPrompt` included in `appendActivity()` data object; `fullPrompt` computed at line 50. |
| AC-3 — Backwards compatibility | ✅ Pass | Field is optional in type; UI guard `d.prompt !== undefined` at `page.tsx:218` prevents rendering for old entries. |
| AC-4 — Commands tab display | ✅ Pass | `app/dashboard/activity/page.tsx:218–239` — toggle rendered per card only when `d.prompt !== undefined`; labels "▶ Show prompt" / "▲ Hide prompt". |
| AC-5 — Default collapsed | ✅ Pass | `expandedPrompts` state initialised as `new Set()` (`page.tsx:53`); no indices pre-populated. |
| AC-6 — Prompt rendering | ✅ Pass | `<pre>` block at `page.tsx:234` uses `whitespace-pre-wrap overflow-x-auto` for long-line handling; monospace via `font-mono`. |
| AC-7 — Absent prompt graceful | ✅ Pass | Guard `{d.prompt !== undefined && (...)}` at `page.tsx:218` ensures no toggle or empty block for pre-existing entries. |
| AC-8 — All tab unchanged | ✅ Pass | All-tab rendering block (`page.tsx:262–298`) is unmodified; `expandedPrompts` state is only consumed in the Commands tab branch. |
| AC-9 — TypeScript clean | ✅ Pass | `tsc --noEmit` reports zero errors in the three modified files; all 61 remaining errors are pre-existing in `lib/scaffolding.test.ts` (introduced in commit 1b6ae25, unrelated to this requirement). |
