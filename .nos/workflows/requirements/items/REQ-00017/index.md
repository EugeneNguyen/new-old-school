Create a system prompt of NOS

- Put it to .nos/ as a markdown file
- in system prompt, request
  - Auto change status to In Progress when start the agent (using skill)
  - Auto chagne the status to Done when finish the agent run (using skill)
  - Comment to the item when finish run
- When trigger the agent, send the system prompt also to the agent

The structure of the message:

<system-prompt>
anything in system prompt
</system-prompt>
<stage-prompt>
anything in stage prompt
</stage-prompt>
<item-content>
the item content
</item-content>

## Analysis

### Context (observed)
- Agent trigger path: `lib/stage-pipeline.ts:17` builds the prompt as `${stage.prompt}\n\n# ${item.title}\n\n${item.body ?? ''}` and hands it verbatim to `getDefaultAdapter().startSession({ prompt })` (`lib/agent-adapter.ts:27-37`). There is no system prompt, no tag-delimited structure, and no explicit `workflowId` / `itemId` context passed to the agent.
- Stage prompts live in `.nos/workflows/<id>/config/stages.yaml` (see `stages.yaml:7-56`). They are per-stage; a **workflow-level** system prompt does not exist today.
- `.nos/` currently contains only `workflows/`; it has no `system-prompt.md` (or similar) file. Adding one is a new convention.
- Skills already exist (REQ-00014, now `Done`): `nos-set-status` (requires `--workflow <id> --item <itemId> --status <Todo|In Progress|Done>`) and `nos-comment-item` (requires `--workflow <id> --item <itemId> --text <string>`). Both call the running Next.js server at `NOS_BASE_URL` (default `http://localhost:30128`).
- Pipeline gating: `stage-pipeline.ts:11` returns early unless `item.status === 'Todo'`. So the agent starts with status `Todo`; flipping to `In Progress` and later `Done` is exactly what the new system prompt must instruct the agent to do via the existing skills.
- Session tracking: `appendItemSession` records `{stage, adapter, sessionId, startedAt}` in `meta.yml > sessions[]` (`stage-pipeline.ts:22-27`). There is no `finishedAt` or post-run hook today.

### 1. Scope

**In scope**
- Create a workflow-level system prompt markdown file under `.nos/` (e.g. `.nos/system-prompt.md`) containing the standing instructions every agent session should receive regardless of stage.
- The file's contents instruct the agent to, on every run:
  1. Call `nos-set-status` to set the item's status to `In Progress` before doing stage work.
  2. Perform the stage work (driven by the stage prompt + item content).
  3. Call `nos-set-status` to set the item's status to `Done` when finished.
  4. Call `nos-comment-item` with a summary of what was done.
- Change the prompt builder in `lib/stage-pipeline.ts` so the string sent to the agent is tag-delimited:
  ```
  <system-prompt>…contents of .nos/system-prompt.md…</system-prompt>
  <stage-prompt>…stage.prompt…</stage-prompt>
  <item-content># <title>\n\n<body>\n\nworkflowId: <id>\nitemId: <itemId></item-content>
  ```
  (The agent must receive the `workflowId` and `itemId` somehow; otherwise it cannot invoke the skills. Exact carrier is an open question.)
- Loader: add a small helper (likely in `lib/workflow-store.ts` or a new `lib/system-prompt.ts`) that reads `.nos/system-prompt.md` at pipeline trigger time. Missing file = empty system prompt section (or omit the tag entirely), not a hard error.
- Preserve current pipeline gating (`status === 'Todo'`), session recording, and the existing per-stage `prompt` field — this requirement *adds* a system prompt layer, it does not replace stage prompts.

**Out of scope**
- Per-workflow system prompts (`.nos/workflows/<id>/system-prompt.md`). Only a single top-level `.nos/system-prompt.md` is requested; a per-workflow override can be a follow-up.
- Editing `stages.yaml` or the per-stage prompt contents.
- New adapter-level features: streaming the system prompt as a real `--system-prompt` CLI flag to `claude`, structured messages, or tool-use configuration. The implementation stays string-based because `agent-adapter.ts` writes a single `child.stdin` string.
- Enforcing that the agent actually calls the skills (the instructions are cooperative; there is no pipeline-level verification in this requirement).
- Dashboard UI for editing `.nos/system-prompt.md`; editing is file-system-only for now.
- Changes to `nos-set-status` / `nos-comment-item` skill interfaces, or to any other skill.
- Automatic post-run detection of "finished" to flip status to `Done` from the server side — the requirement is explicitly that the *agent* does it.
- Adding `finishedAt` or other fields to `meta.yml > sessions[]`.

### 2. Feasibility

Technically straightforward. All required primitives exist:
- Reading a markdown file from `.nos/system-prompt.md` is trivial (`fs.readFileSync`, mirroring how `workflow-store.ts` reads other YAML/MD files).
- String-concatenating a new prompt shape in `stage-pipeline.ts` is a 5-line change.
- The skills exist and accept the exact operations the system prompt will describe.

**Risks / unknowns**
- **Skill invocation requires `workflowId` + `itemId`.** Today the agent receives neither explicitly — they happen to appear nowhere in the prompt. The system prompt cannot tell the agent to "run `nos-set-status --workflow X --item Y`" unless those IDs are in the message. Decision needed: embed them inside `<item-content>` (simplest), add a dedicated `<item-meta>` tag, or export them as env vars for the spawned `claude` process. Recommendation: include them in `<item-content>` as a trailing `workflowId: …` / `itemId: …` block (or in a new `<item-meta>` tag — open question below).
- **Pipeline recursion guard.** If the agent-invoked `nos-set-status` were to trigger a new pipeline run it would recurse, but the REST route only triggers the pipeline on *stage* changes or item creation, not status changes (per REQ-00014's design), so this is safe. Worth re-verifying in `app/api/workflows/[id]/items/[itemId]/route.ts` during implementation.
- **"Finish" semantics.** The agent has no built-in callback for "I'm done." The instruction relies on the agent itself deciding it is finished and then issuing the skill call. Non-compliant or crashed sessions will leave items stuck in `In Progress`. Acceptable for this requirement; flag as a known limitation and a candidate for a future server-side watcher.
- **Tag leakage / confusion.** The three XML-ish tags (`<system-prompt>`, `<stage-prompt>`, `<item-content>`) must be parsed by the LLM, not by the pipeline. They are plain text delimiters. Risk: if an item body contains a literal `</item-content>` string it breaks the delimiter. Low probability for internal use; can add an escape rule later if it ever bites.
- **Server availability at run time.** Skills speak to `http://localhost:30128`. Because the pipeline is itself spawned by the Next.js server, the server is by definition up when the agent starts — but the agent's run outlives the triggering request, so the server must remain running for the duration of the agent session. Already the case today; no new constraint.
- **Backwards compatibility.** Items currently in flight (e.g. sessions already running when the new prompt shape ships) are unaffected — the new prompt is only used for *new* pipeline triggers after the code change. No migration needed.
- **No unit-test harness today.** Verification will be manual: trigger a pipeline on a throwaway item and observe (a) the agent's first skill call flips status to `In Progress`, (b) the comment and `Done` flip land at the end. Worth noting.

No spikes required. One design fork: where to carry `workflowId` / `itemId` — see open questions.

### 3. Dependencies

- **Files to create**
  - `.nos/system-prompt.md` — the new workflow-level system prompt content.
- **Files to modify**
  - `lib/stage-pipeline.ts` — load the system prompt, reshape the final string with the three tags, include `workflowId` + `itemId` somewhere in the message.
  - Possibly `lib/workflow-store.ts` (or a new `lib/system-prompt.ts`) — helper to resolve and read `.nos/system-prompt.md` given the project root.
- **Files to read but not modify**
  - `lib/agent-adapter.ts` — confirm the `prompt` string is passed straight to `claude` stdin (it is); no adapter change required.
  - `.claude/skills/nos-set-status/SKILL.md`, `.claude/skills/nos-comment-item/SKILL.md` — to copy the exact argument shape into the system prompt's example block so the agent gets the calls right on the first try.
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — verify that `status` changes alone do NOT re-trigger the pipeline (prevents recursion).
  - `types/workflow.ts` — confirm no type changes are implied by this requirement.
- **No new packages**. Pure string / filesystem work.
- **Related requirements**
  - REQ-00014 (Skills) — this requirement is a consumer of those skills.
  - REQ-016 (Stage Prompt Pipeline) — this requirement layers a *workflow-level* prompt on top of the per-stage pipeline REQ-016 established.
- **External systems**: none. Everything runs locally.

### 4. Open Questions

1. **File location and name.** `.nos/system-prompt.md` (single global file) vs. `.nos/workflows/<id>/system-prompt.md` (per-workflow override) vs. both with cascade? Recommendation: start with a single global `.nos/system-prompt.md`; add per-workflow override later if needed.
2. **Where to carry `workflowId` / `itemId`.** Four viable options:
   a. Embed them inside `<item-content>` as trailing `workflowId: …` / `itemId: …` lines (simplest; matches today's body-is-free-text model).
   b. Introduce a fourth tag, e.g. `<item-meta>workflowId: …\nitemId: …</item-meta>`, keeping `<item-content>` strictly the user body.
   c. Expose them as env vars (`NOS_WORKFLOW_ID`, `NOS_ITEM_ID`) to the spawned `claude` process in `agent-adapter.ts`; the system prompt references them.
   d. Prepend them inside `<system-prompt>` dynamically (mixing standing instructions with per-run data — not recommended).
   Recommendation: **(b)** `<item-meta>` tag — keeps responsibilities clean and is easy for the LLM to parse. The requirement as written mentions only three tags; needs confirmation.
3. **What exactly should the comment say?** Options: fixed template ("Stage <name> completed by <adapter> at <ISO>"), free-form summary the agent chooses, or structured ("Summary: …\nFiles changed: …"). Recommendation: let the agent write a brief free-form summary; the system prompt can suggest a format without enforcing one.
4. **When to flip to `Done`.** On every stage run, or only when the *final* stage (`Validation`) completes? The raw request says "when finish the agent run" which implies every run. But flipping to `Done` after the `Analysis` stage would end the item prematurely. Recommendation: have the system prompt instruct the agent to flip to `Todo` (not `Done`) at the end of non-terminal stages so the next stage's pipeline can pick it up, and only flip to `Done` when the stage is `Validation` (or has `autoAdvanceOnComplete` set). This is the largest semantic question — must be resolved before writing the prompt text.
5. **Stage auto-advance interaction.** `stages.yaml` has an `autoAdvanceOnComplete` field (all `false` today). Should the system prompt also instruct the agent to call a stage-move skill (`nos-move-stage`) on completion, or leave stage advancement to a separate mechanism? Recommendation: out of scope; this requirement only touches status, not stage.
6. **Handling a missing `.nos/system-prompt.md`.** Silently omit the `<system-prompt>` block, fall back to the old prompt shape, or fail the pipeline trigger? Recommendation: silently omit — the system prompt is an additive layer.
7. **Concurrency / duplicate status flips.** If the agent re-sets status to `In Progress` while it already is `In Progress` (e.g. a retry), is that a no-op or an error? Per REQ-00014 the skill simply writes the field, so it's a safe no-op. Confirm this is acceptable.
8. **Skill discovery by the agent.** The agent must know these skills exist and how to invoke them. `.claude/skills/<name>/SKILL.md` should make them discoverable to Claude Code automatically, but the system prompt should still include explicit example commands for reliability. Confirm.
9. **Content of the system prompt beyond status/comment instructions.** Should it also carry project-wide guidance (e.g. "follow `CLAUDE.md`", "don't start implementation outside the Implementation stage")? The raw request lists three specific behaviors only. Recommendation: keep the file narrowly scoped to the three behaviors in this iteration; broaden later if useful.
10. **Editability.** Is `.nos/system-prompt.md` expected to be hand-edited only, or will a future UI edit it? Affects whether the file needs to tolerate absence (yes) and whether we should add it to any repo templates. Recommendation: hand-edited for now; no UI work in this requirement.

## Specification

### Resolved design decisions (from Open Questions)
- **Single global file.** One prompt at `.nos/system-prompt.md`; no per-workflow override in this iteration (OQ1).
- **Three tags only.** The message shape is exactly `<system-prompt>`, `<stage-prompt>`, `<item-content>` as written in the raw request. `workflowId` and `itemId` are embedded as trailing lines inside `<item-content>` (OQ2, option a).
- **Finish semantics.** The agent flips status to `Done` at the end of every pipeline run, per the raw request's literal wording (OQ4). Stage-aware "only on Validation" behavior is out of scope and can be revisited later.
- **Comment format.** Free-form one-paragraph summary written by the agent (OQ3).
- **Missing system-prompt file.** Silently omit the `<system-prompt>` block (OQ6).
- **Duplicate status writes.** Treated as idempotent no-op by the existing skill (OQ7).
- **Skill discovery.** System prompt includes explicit example CLI commands for both skills (OQ8).
- **System prompt scope.** Narrowly scoped to the three behaviors (status → In Progress, do work, status → Done + comment). No broader project guidance in this iteration (OQ9).
- **Stage movement.** Out of scope; system prompt touches `status` only, never stage (OQ5).

### 1. User stories
1. As a **workflow author**, I want a single `.nos/system-prompt.md` file, so that I can define standing instructions every agent session receives without editing each stage's prompt.
2. As an **agent run**, I want to receive the system prompt, the stage prompt, and the item content in three clearly delimited sections, so that I can tell standing instructions apart from per-stage work and per-item data.
3. As an **agent run**, I want the `workflowId` and `itemId` delivered inside the message, so that I can invoke `nos-set-status` and `nos-comment-item` with the correct targets.
4. As a **user watching the Kanban board**, I want an item's status to auto-flip to `In Progress` as soon as the agent starts and to `Done` when it finishes, so that the board reflects live progress without manual updates.
5. As a **user reviewing an item after a run**, I want a comment summarizing what the agent did, so that I can audit the run without reading session logs.
6. As a **pipeline operator**, I want the prompt builder to degrade gracefully if `.nos/system-prompt.md` is absent, so that deleting or forgetting the file does not break agent triggers.

### 2. Acceptance criteria

**AC-1 — System prompt file exists**
Given a fresh checkout, when the project is inspected, then `.nos/system-prompt.md` exists and contains (at minimum) the four standing instructions: (a) immediately call `nos-set-status` with `--status "In Progress"`, (b) execute the stage work, (c) call `nos-set-status` with `--status "Done"` at the end, (d) call `nos-comment-item` with a brief free-form summary at the end. The file also includes literal example command invocations for both skills showing the exact flag names (`--workflow`, `--item`, `--status` / `--text`).

**AC-2 — Prompt shape (happy path)**
Given `.nos/system-prompt.md` exists with content `S`, a stage with `prompt = P`, and an item with `title = T`, `body = B`, `id = I`, in workflow `W`, when the pipeline triggers an agent run, then the string passed to `getDefaultAdapter().startSession({ prompt })` equals exactly:

```
<system-prompt>
S
</system-prompt>
<stage-prompt>
P
</stage-prompt>
<item-content>
# T

B

workflowId: W
itemId: I
</item-content>
```

(with a single trailing newline; blank lines between tags and inner content as shown; no extra whitespace inside tag names).

**AC-3 — Missing system prompt file**
Given `.nos/system-prompt.md` does not exist, when the pipeline triggers an agent run, then the `<system-prompt>…</system-prompt>` block is omitted entirely (not replaced with an empty block), and the rest of the message (`<stage-prompt>`, `<item-content>`) is produced unchanged. The pipeline trigger does not throw.

**AC-4 — Empty body**
Given an item whose `body` is null or empty, when the pipeline builds the prompt, then `<item-content>` contains the `# T` heading, a blank line, the `workflowId:` / `itemId:` lines, and no stray whitespace between heading and metadata beyond a single blank line.

**AC-5 — Pipeline gating preserved**
Given an item whose `status` is not `Todo`, when the pipeline is invoked, then no agent session is started (existing behavior from `lib/stage-pipeline.ts:11` is unchanged).

**AC-6 — Session recording preserved**
Given a successful pipeline trigger under the new prompt shape, when the agent session starts, then `appendItemSession` still records `{stage, adapter, sessionId, startedAt}` in `meta.yml > sessions[]` exactly as before. No new fields are added in this requirement.

**AC-7 — Agent runs start → In Progress (manual verification)**
Given the new system prompt is in place and the skills from REQ-00014 are installed, when a pipeline is triggered on a `Todo` item with a live `claude` adapter, then the agent's first skill call is `nos-set-status --workflow <W> --item <I> --status "In Progress"` and the item's status becomes `In Progress` within the first few seconds of the run.

**AC-8 — Agent runs end → Done + comment (manual verification)**
Given the same setup as AC-7, when the agent completes its stage work, then it issues `nos-set-status --workflow <W> --item <I> --status "Done"` and `nos-comment-item --workflow <W> --item <I> --text "<summary>"`. After the run, the item's status is `Done` and the comment is visible in the item's comment list.

**AC-9 — No pipeline recursion from status changes**
Given the agent calls `nos-set-status`, when the status change is persisted, then the pipeline does not re-trigger (the item-update route only triggers the pipeline on stage changes or creation, per REQ-00014). Verified by inspecting `app/api/workflows/[id]/items/[itemId]/route.ts`.

**AC-10 — Idempotent status writes**
Given an item whose status is already `In Progress`, when the agent calls `nos-set-status --status "In Progress"`, then the call succeeds as a no-op (status remains `In Progress`, no error is returned).

**AC-11 — Backwards compatibility of in-flight runs**
Given an agent session was already running before the code change ships, when the new code is deployed, then that session's prompt is not rewritten mid-flight; only *new* pipeline triggers after the change use the new shape.

### 3. Technical constraints

**File to create**
- **Path:** `.nos/system-prompt.md` (project root, not under `workflows/`).
- **Format:** plain markdown, hand-edited.
- **Required content (prose form):** four numbered instructions corresponding to AC-1, plus a "Skill invocation examples" subsection showing the exact CLI form:
  ```
  nos-set-status --workflow <workflowId> --item <itemId> --status "In Progress"
  nos-set-status --workflow <workflowId> --item <itemId> --status "Done"
  nos-comment-item --workflow <workflowId> --item <itemId> --text "<summary>"
  ```
  The file must tell the agent that `<workflowId>` and `<itemId>` are found in the trailing lines of `<item-content>`.

**Files to modify**
- **`lib/stage-pipeline.ts`** — replace the current one-line `prompt` construction (`${stage.prompt}\n\n# ${item.title}\n\n${item.body ?? ''}`) with a function that emits the tag-delimited shape from AC-2. The `status === 'Todo'` gate (line 11) and the `appendItemSession` call (lines 22–27) are unchanged.
- **`lib/system-prompt.ts`** (new) — export `loadSystemPrompt(projectRoot: string): string | null`. Reads `<projectRoot>/.nos/system-prompt.md` synchronously; returns the file's trimmed contents on success, `null` on `ENOENT`. Any other filesystem error rethrows. Uses `fs.readFileSync` with `utf8`, matching the style of the existing `lib/workflow-store.ts` readers.

**Files to read but not modify**
- `lib/agent-adapter.ts` — must confirm the `prompt` argument is still passed straight to the adapter's stdin; no signature change.
- `.claude/skills/nos-set-status/SKILL.md`, `.claude/skills/nos-comment-item/SKILL.md` — source of truth for the example commands copied into `.nos/system-prompt.md`.
- `app/api/workflows/[id]/items/[itemId]/route.ts` — confirm that a `status`-only PATCH does not re-trigger the pipeline (prevents recursion per AC-9).
- `types/workflow.ts` — no type changes required.

**Prompt-building contract**
- The builder is a pure function: inputs (`systemPrompt: string | null`, `stagePrompt: string`, `title: string`, `body: string | null | undefined`, `workflowId: string`, `itemId: string`), output (`string`). Tag casing and whitespace match AC-2 byte-for-byte.
- Tag names are literal: `system-prompt`, `stage-prompt`, `item-content`. No attributes, no nesting.
- `body` values of `null` / `undefined` / `''` are all rendered the same way — empty string between the title line and the metadata lines (see AC-4).
- No escaping of `<` or `>` inside `body` is performed in this requirement (acceptable per Analysis §2 risk note).

**Project root resolution**
- Use the same project-root logic already used by `lib/workflow-store.ts` (i.e., `process.cwd()` when the Next.js server runs from the repo root). No new env vars.

**Performance / compatibility**
- Reading `.nos/system-prompt.md` happens once per pipeline trigger (synchronous, small file). No caching required.
- No new dependencies.
- Works on any OS the Next.js dev server currently supports; uses no platform-specific paths (always POSIX-style `.nos/system-prompt.md` under the project root).

### 4. Out of scope
- Per-workflow or per-stage system prompt overrides (e.g. `.nos/workflows/<id>/system-prompt.md`, `stages.yaml: systemPrompt`).
- Any UI (dashboard, terminal, kanban, or item dialog) for viewing or editing `.nos/system-prompt.md`.
- A fourth tag (`<item-meta>` or similar) to carry `workflowId` / `itemId`. These live inside `<item-content>`.
- Environment variables (`NOS_WORKFLOW_ID`, `NOS_ITEM_ID`) injected into the `claude` child process.
- Changes to `lib/agent-adapter.ts`, including any use of a native `--system-prompt` flag, structured messages, or tool-use configuration.
- Changes to the `nos-set-status` or `nos-comment-item` skill signatures, or creation of new skills (e.g. `nos-move-stage`).
- Stage advancement logic, including honoring or changing `autoAdvanceOnComplete` in `stages.yaml`.
- Server-side enforcement / watchdog that the agent actually called the skills (e.g. auto-flipping `Done` from `meta.yml > sessions[]`).
- Adding `finishedAt`, `endedBy`, or similar fields to `meta.yml > sessions[]`.
- Migration of items currently in flight at the moment the code ships.
- Escaping of literal `</item-content>` (or other tag-like strings) appearing inside an item body.
- Broadening the system prompt beyond the four standing instructions (e.g. project-wide guidance, CLAUDE.md references). Deferred to a later iteration.
- Automated tests. Verification for AC-7 and AC-8 is manual via a throwaway item on a live pipeline.

## Implementation Notes

- Added `.nos/system-prompt.md` with the four standing instructions (status → In Progress, do stage work, status → Done, comment summary) plus literal CLI examples for `nos-set-status` and `nos-comment-item`. Points the agent at the trailing `workflowId:` / `itemId:` lines inside `<item-content>` (AC-1).
- New module `lib/system-prompt.ts` exports two pure helpers:
  - `loadSystemPrompt(projectRoot)` — `fs.readFileSync` on `<root>/.nos/system-prompt.md`, returns trimmed contents or `null` on `ENOENT`; other errors rethrow (AC-3).
  - `buildAgentPrompt({ systemPrompt, stagePrompt, title, body, workflowId, itemId })` — emits the tag-delimited shape byte-for-byte per AC-2, omits the `<system-prompt>` block when `systemPrompt` is `null` (AC-3), and renders empty/null `body` with a single blank line between the `# title` heading and the trailing `workflowId:` / `itemId:` metadata lines (AC-4).
- `lib/stage-pipeline.ts` now calls `buildAgentPrompt(loadSystemPrompt(process.cwd()), …)` instead of the old one-line concatenation. The `status === 'Todo'` gate (AC-5) and `appendItemSession` call (AC-6) are untouched.
- No changes to `lib/agent-adapter.ts`, `types/workflow.ts`, or any API route — the new prompt string still flows straight into the adapter's stdin and item-update recursion remains blocked because status-only PATCHes don't re-trigger the pipeline (AC-9). Skill idempotency (AC-10) and in-flight session immunity (AC-11) are inherent to the change shape.
- Manual-verification ACs (AC-7, AC-8) deferred to a live run with the `claude` adapter; no automated tests added, per spec §4.
- No deviations from the Specification.

## Validation

Verified against commit-state files on 2026-04-18.

- **AC-1 — System prompt file exists** ✅ — `.nos/system-prompt.md` is present and contains all four standing instructions (immediate `In Progress` flip, stage work, `Done` flip, comment summary) plus literal CLI examples for both skills with the exact `--workflow` / `--item` / `--status` / `--text` flags. It also points the agent at the trailing `workflowId:` / `itemId:` lines inside `<item-content>`. (Evidence: `.nos/system-prompt.md:1-46`.)
- **AC-2 — Prompt shape (happy path)** ✅ — Byte-exact runtime check of `buildAgentPrompt({ systemPrompt:'S', stagePrompt:'P', title:'T', body:'B', workflowId:'W', itemId:'I' })` returns `"<system-prompt>\nS\n</system-prompt>\n<stage-prompt>\nP\n</stage-prompt>\n<item-content>\n# T\n\nB\n\nworkflowId: W\nitemId: I\n</item-content>\n"`, matching the spec's reference output with a single trailing newline. (Evidence: `lib/system-prompt.ts:14-33`; tsx runtime check.)
- **AC-3 — Missing system prompt file** ✅ — `loadSystemPrompt` returns `null` on `ENOENT` (rethrows other errors); `buildAgentPrompt` with `systemPrompt:null` emits only the `<stage-prompt>` and `<item-content>` blocks (no empty `<system-prompt></system-prompt>`). Runtime output: `"<stage-prompt>\nP\n</stage-prompt>\n<item-content>…</item-content>\n"`. (Evidence: `lib/system-prompt.ts:4-12,26-29`.)
- **AC-4 — Empty body** ✅ — `body:''`, `body:null`, and `body:undefined` all yield identical output: `<item-content>\n# T\n\nworkflowId: W\nitemId: I\n</item-content>` — exactly one blank line between the `# T` heading and the metadata lines, no stray whitespace. (Evidence: `lib/system-prompt.ts:23`; runtime check of all three inputs.)
- **AC-5 — Pipeline gating preserved** ✅ — `lib/stage-pipeline.ts:12` still returns early when `item.status !== 'Todo'`, unchanged from prior behavior.
- **AC-6 — Session recording preserved** ✅ — `appendItemSession` still records `{stage, adapter, sessionId, startedAt}` at `lib/stage-pipeline.ts:30-35`; no new fields were added.
- **AC-7 — Agent runs start → In Progress** ✅ *(indirect)* — Manual live-adapter check is deferred per spec §4, but this validation run itself successfully invoked `nos-set-status --workflow requirements --item REQ-00017 --status "In Progress"` and the skill returned `ok`, confirming the exact CLI form baked into `.nos/system-prompt.md` reaches the skill and flips status.
- **AC-8 — Agent runs end → Done + comment** ⚠️ *(manual, deferred)* — Will be verified at the end of this run when the stage-prompt's own completion steps invoke `nos-set-status --status "Done"` and `nos-comment-item`. Not something the validator can verify before it happens; the CLI surface used by both skills is proven by AC-7.
- **AC-9 — No pipeline recursion from status changes** ✅ — `app/api/workflows/[id]/items/[itemId]/route.ts:94-97` only calls `triggerStagePipeline` when `patch.stage !== undefined`. Status-only PATCHes fall through to `NextResponse.json(updated)` without re-triggering.
- **AC-10 — Idempotent status writes** ✅ — The PATCH route validates status membership and writes it unconditionally via `updateItemMeta`; re-sending the current value is a no-op write with a 200 response. The skill itself exits `ok` regardless. (Evidence: `app/api/workflows/[id]/items/[itemId]/route.ts:65-77,90-98`; `.claude/skills/nos-set-status/nos-set-status.mjs:54-69`.)
- **AC-11 — Backwards compatibility of in-flight runs** ✅ — The new prompt is constructed inside `triggerStagePipeline` only at trigger time; sessions already spawned retain whatever string they were started with. No prompt mutation path exists in the code.

Regression check: `npx tsc --noEmit` exits clean with no errors. `lib/agent-adapter.ts` signature unchanged (still receives a single `prompt` string). No changes to `types/workflow.ts`, API routes, or skill interfaces. No out-of-scope items from spec §4 were implemented.

All automatically verifiable criteria pass. AC-8 is the only remaining gate and will self-satisfy when this run closes. Advancing to Done.
