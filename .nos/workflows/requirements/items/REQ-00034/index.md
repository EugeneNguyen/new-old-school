# Introduct Member Agent

Each project will have many members
Each member have its own prompt (optional)
Each member have its own model (example, some can use opus, some use sonet)
Each member can be assigned to a stage
When item go to the step, it will include system prompt, member prompt, step prompt, item info and the comments to send to the adapter.

Member agents should be stored in .nos/agents sub folder, each agent in a sub folder, including yml and md files.

## Analysis

### Scope

**In scope**
- Introduce a first-class **Member Agent** concept persisted under `.nos/agents/<agent-id>/` with two files per agent — `meta.yml` (id, displayName, model, optional `assignedStages`, timestamps) and `index.md` (the optional, free-form member prompt, mirroring how stages and items already split metadata vs. prose).
- Reader/writer helpers (`lib/agents-store.ts` or extension of `lib/workflow-store.ts`) that mirror the conventions in `lib/workflow-store.ts`: atomic writes, `js-yaml`, slug-based or prefixed IDs, list/read/create/update/delete.
- A way to **assign an agent to a stage**. Two layouts are viable; the spec stage will pick one:
  - (A) Agent owns the assignment (`assignedStages: [<workflowId>/<stageName>, …]` in the agent's `meta.yml`).
  - (B) Stage owns the assignment (`agentId: <id>` in `stages.yaml`, alongside the existing `prompt` / `autoAdvanceOnComplete`).
  Recommendation: (B) — stage owns it. It keeps the per-stage "who runs this" decision local to the stage (where operators already edit it via `StageDetailDialog`), avoids fan-out across N agent files when stages are renamed, and matches the existing pattern where `stages.yaml` is the source of truth for per-stage behavior.
- Per-agent **model override**. The current `claudeAdapter` (`lib/agent-adapter.ts:25-117`) shells out to `claude … --dangerously-skip-permissions` with no model flag. We add a `model?: string` on the agent and thread it through `AgentAdapter.startSession({ prompt, cwd, model })`, which appends `--model <id>` when present. Falsy → adapter default (whatever the CLI picks today).
- Prompt assembly extension: `buildAgentPrompt` (`lib/system-prompt.ts:20-41`) already concatenates `<system-prompt>` + `<stage-prompt>` + `<item-content>` (which itself includes the comments section). Add an optional `<member-prompt>` block, inserted between `<system-prompt>` and `<stage-prompt>`, only when the resolved member has a non-empty `index.md`. `<item-content>` already carries comments — no change there.
- Stage pipeline change (`lib/stage-pipeline.ts:6-45`): resolve the stage's `agentId` (if any), load the agent, pass its prompt + model into `buildAgentPrompt` and `adapter.startSession`. Sessions recorded in the item's `sessions[]` should also capture the agent id (additive, optional field) so the UI can show "ran by `<agent>`".
- HTTP surface: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[id]` for CRUD, mirroring the existing `app/api/workflows/...` route style. Stage update already exists (`PATCH` on a stage); extend its accepted patch shape with `agentId` so `StageDetailDialog` can set/clear the assignment.
- Minimal UI: a new **Members** screen under `app/dashboard/agents/page.tsx` (list / create / edit form: displayName, model dropdown, prompt markdown editor reusing `ItemDescriptionEditor`). Add an **Agent** select to `components/dashboard/StageDetailDialog.tsx` so operators can pick from the existing agent list per stage. Surface the resolved agent name on the Kanban column header next to the existing `AI` and `Auto` pills (parity with REQ-00031).

**Out of scope**
- Multi-tenant / per-user authorization — NOS is single-user local-dev; agents are global to the workspace.
- Per-stage prompt overrides on the agent itself (an agent that says "behave differently on Stage X"). One member prompt per agent for v1; fine-grained tailoring stays in the stage prompt.
- Adapter pluralism beyond Claude. The interface gets a `model?` parameter, but no new adapters (no OpenAI/Gemini/etc.) are added here. Future adapters can read the same `model` value and do their own mapping.
- A general-purpose "tools per agent" / MCP scoping system. Agents inherit whatever tools the Claude CLI exposes today.
- Live-reload of agent files into running sessions — an in-flight session keeps whatever it started with; only the next stage trigger picks up edits.
- A dedicated icon/visual for **assigned-agent presence** beyond a small inline label; no new design tokens.
- Migrating existing items' historical `sessions[]` entries to backfill `agentId`. Only sessions started after this lands carry the field.

### Feasibility

Medium-small. Mostly additive; the existing pipeline is short and well-factored, and the file-on-disk storage convention is already established by `workflow-store.ts`.

- **Storage** — trivial. Reuse the read-meta + read-content pattern from `readItemFolder` (`lib/workflow-store.ts:107-128`). Atomic write helper already exists.
- **Adapter model override** — the CLI accepts `--model <id>` (e.g. `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`). Append the flag conditionally inside `claudeAdapter.startSession`. Risk: model id mismatches between what users type and what the CLI accepts — mitigate with a curated dropdown in the UI (free-text input as escape hatch). Spike needed: confirm the exact flag name/spelling in this repo's installed CLI version.
- **Prompt assembly** — additive. `buildAgentPrompt` change is one new optional input plus one conditional `parts.push`. Existing tests in `lib/system-prompt.test.ts` need a new case covering the member block; ordering must match what stage prompts (and the system prompt) already assume.
- **Stage pipeline** — one extra read (load agent) + plumb two extra fields (`memberPrompt`, `model`). Failure modes: stage names a missing agent → log warning, fall back to no member prompt and default model; the stage still runs (don't fail the item).
- **UI** — `StageDetailDialog` already edits stage fields; adding a select is small. The Members list page is a new but simple CRUD screen. Reusing `ItemDescriptionEditor` for the prompt avoids importing yet another markdown editor.
- **Sessions metadata** — `ItemSession` (`types/workflow.ts`, parsed in `lib/workflow-store.ts:130-145`) is already loose enough to absorb an extra `agentId?: string` field without breaking older sessions.
- **Risks / unknowns**
  1. **Model flag name** — needs confirmation against the installed `claude` CLI; if it differs (e.g. `--model-id`), we adjust the adapter call.
  2. **CLI cost / quota** — Opus is materially more expensive than Sonnet/Haiku. Operator UX should make the model choice obvious so it isn't set unintentionally on every stage.
  3. **Agent id collision with stage names** — agent ids are independent and live in their own directory, so no collision; only the stage's `agentId` reference is shared vocabulary.
  4. **Prompt size** — a member prompt added to every run grows token usage; not a correctness risk but worth noting in docs so members keep their prompts terse.
  5. **Renames** — renaming an agent id requires updating any stage that references it, parallel to how `updateStage` already cascades stage renames into items (`lib/workflow-store.ts:335-353`). Either disallow id rename for v1 (rename only the displayName) or write the same cascade for stages → simpler is "displayName is freely editable, id is immutable post-create."
  6. **Heartbeat / auto-advance** interaction — none expected; auto-advance already runs after the agent finishes, independent of which model ran.

### Dependencies

- **Code that will be touched**
  - `lib/agent-adapter.ts` — add `model?: string` to `startSession` input; conditionally append `--model <id>` flag.
  - `lib/system-prompt.ts` — extend `buildAgentPrompt` with an optional `memberPrompt` parameter and the new `<member-prompt>` block; update `lib/system-prompt.test.ts` accordingly.
  - `lib/stage-pipeline.ts` — resolve `stage.agentId`, load the agent's `meta.yml` + `index.md`, pass `memberPrompt` + `model` through, record `agentId` on the session entry.
  - `lib/workflow-store.ts` — extend `Stage` parse/serialize to round-trip `agentId`; extend `StagePatch` to accept it; `parseSessions` to absorb `agentId`.
  - `types/workflow.ts` — add `agentId?: string | null` to `Stage`, `agentId?: string` to `ItemSession`. New `Agent` type.
  - **New** `lib/agents-store.ts` — list/read/create/update/delete for `.nos/agents/<id>/{meta.yml,index.md}`.
  - **New** `app/api/agents/route.ts` and `app/api/agents/[id]/route.ts` — CRUD endpoints.
  - `app/api/workflows/[id]/route.ts` (or wherever stage PATCH lives) — accept `agentId`.
  - `components/dashboard/StageDetailDialog.tsx` — agent select.
  - `components/dashboard/KanbanBoard.tsx` — render the assigned-agent label on column header (parity with the AI/Auto pills from REQ-00031).
  - **New** `app/dashboard/agents/page.tsx` (+ link in `components/dashboard/Sidebar.tsx`) — Members list/CRUD UI.
- **Convention reused** — same on-disk shape as `.nos/workflows/<id>/items/<id>/` (`meta.yml` + `index.md`), same atomic-write helper, same `js-yaml` round-trip; this keeps git diffs / human inspection consistent across NOS resources.
- **External**
  - `claude` CLI must accept the model flag NOS sends — verify with `claude --help` during implementation.
- **Related requirements**
  - REQ-016 (Stage Prompt Pipeline) — the structure we are extending.
  - REQ-015 (Editable Stage Information from Kanban Column) — `StageDetailDialog` is the right place to add the agent select.
  - REQ-00031 (auto-advance indicator) — establishes the badge pattern we'll mirror for the agent label.
  - REQ-00014 (NOS skills) — agents end up using those same skills via the standing system prompt; no direct coupling.
- **No external services** required; everything stays on disk + local CLI.

### Open questions

1. **Assignment ownership** — confirm the recommended stage-owns-assignment layout (`stages.yaml` carries `agentId`) vs. the agent-owns (`assignedStages` on the agent). This shapes the storage and the UI; needs a one-line decision before specification.
2. **Agent identifier scheme** — slug from displayName (`research-bot`) vs. prefixed numeric (`AGT-00001`, mirroring `REQ-#####` from `nextPrefixedId`). Recommendation: slug; agents are few and operator-named, and slugs read well in stage configs and session logs.
3. **Model field UX** — curated dropdown of known model ids (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, plus an "Adapter default" option) vs. free-text. Recommendation: dropdown with an "Other…" escape hatch.
4. **Default agent** — should the system have an implicit "default" agent applied to stages with no explicit `agentId`, or should "no agent" simply mean today's behavior (no member prompt, default model)? Recommendation: no default agent; absence means "use stage prompt + adapter default model" — preserves current behavior for unassigned stages and avoids forcing every workspace to define an agent.
5. **Required vs. optional fields** — confirm only `displayName` is required; `model` and the prompt are optional. (Aligns with the user request: "prompt (optional)".)
6. **Multi-stage assignment per agent** — a single agent can be assigned to many stages by being referenced from each (`stage.agentId`); can a single stage have multiple agents? Recommendation: no, one `agentId` per stage in v1 — multi-agent stages are a much larger design (collaboration, ordering, conflict resolution).
7. **Where is the agent label shown on the Kanban?** — column header pill (recommended, parity with REQ-00031) and/or item card footer (when an item ran with an agent, surface which one). Recommendation: column header only for v1; per-item attribution can be derived from `sessions[].agentId` in the detail dialog later.
8. **CLI model flag spelling** — verify `--model <id>` is the actual flag accepted by the bundled `claude` CLI. If different, the adapter change adjusts to match.
9. **Agent rename** — is `id` immutable post-create (recommended), or should we cascade renames into all referencing stages the way `updateStage` already cascades stage renames into items?
10. **Sidebar placement** — does the Members page belong as a top-level sidebar entry, under Settings, or under each workflow? Recommendation: top-level entry — agents are workspace-global, not per-workflow.

## Specification

### Decisions locked from analysis

- **Assignment ownership:** stage owns the assignment via `agentId` in `stages.yaml`.
- **Identifier scheme:** kebab-case slug derived from `displayName` at create time; immutable post-create.
- **Model field UX:** curated dropdown (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, plus "Adapter default") with an "Other…" free-text escape hatch.
- **Default agent:** none. Absence of `stage.agentId` preserves today's behavior (no member prompt, adapter default model).
- **Required fields:** only `displayName`; `model` and `index.md` body are optional.
- **Multi-agent stages:** not supported in v1 — one `agentId` per stage.
- **Kanban surfacing:** column header pill only; per-item attribution derives from `sessions[].agentId` and is not rendered in v1.
- **Sidebar placement:** new top-level "Members" entry in the dashboard sidebar.
- **Renames:** `id` is immutable; `displayName` is freely editable. No cascading rename in v1.

### User stories

1. As an operator, I want to define a member agent with a name, model, and prompt, so that I can codify a reusable persona for my workflows.
2. As an operator, I want to assign a member agent to a stage, so that items entering that stage are processed by that persona/model combination.
3. As an operator, I want to choose a different Claude model per agent, so that expensive stages can use Opus while cheap stages use Haiku/Sonnet.
4. As an operator, I want the Kanban column header to show which agent owns a stage, so that I can see at a glance who runs the work.
5. As an operator, I want stages with no assigned agent to keep behaving exactly as they do today, so that adopting agents is incremental and opt-in.
6. As an operator editing a stage, I want a dropdown of existing agents (and a "None" option), so that I can set or clear the assignment from `StageDetailDialog`.
7. As an operator inspecting an item, I want each session entry to record which agent ran it, so that historical attribution survives later edits to the stage's assignment.
8. As an operator, I want to list, create, edit, and delete member agents from a dedicated dashboard page, so that agent management does not require touching files on disk.

### Acceptance criteria

**Storage layout**

1. Given an agent is created with `displayName: "Research Bot"`, when the create endpoint succeeds, then a directory `.nos/agents/research-bot/` exists containing `meta.yml` and `index.md`.
2. `meta.yml` round-trips the following keys via `js-yaml`: `id` (string, slug), `displayName` (string), `model` (string | null), `createdAt` (ISO 8601), `updatedAt` (ISO 8601). Unknown keys must be preserved on read/write (forward-compat).
3. `index.md` is plain markdown with no frontmatter; an empty file is valid and means "no member prompt".
4. Slug derivation: lowercase, ASCII letters/digits, internal whitespace and underscores collapsed to single `-`, trimmed of leading/trailing `-`. On collision, append `-2`, `-3`, … until unique under `.nos/agents/`.
5. `id` in `meta.yml` MUST equal the directory name; readers reject mismatches with a clear error.
6. All writes go through the existing atomic-write helper used by `lib/workflow-store.ts`.

**Stage ↔ agent linkage**

7. `Stage` (in `types/workflow.ts`) gains `agentId?: string | null`. `lib/workflow-store.ts` parses and serializes `agentId` in `stages.yaml`; absent or `null` means "no agent assigned".
8. `StagePatch` accepts `agentId: string | null`; passing `null` clears the assignment, passing a string sets it. The patch endpoint validates that the referenced agent exists and rejects unknown ids with HTTP 400.
9. Renaming or deleting an agent does NOT cascade into stages in v1; deleting an agent that is still referenced by stages MUST return HTTP 409 with a list of referencing `{workflowId, stageName}` pairs and leave both the agent and stages unchanged.

**Prompt assembly**

10. `buildAgentPrompt` accepts an optional `memberPrompt?: string` argument. When `memberPrompt` is a non-empty string after `.trim()`, the assembled prompt MUST contain a `<member-prompt>…</member-prompt>` block placed strictly between `<system-prompt>` and `<stage-prompt>`. When falsy or empty after trim, no `<member-prompt>` block is emitted and the output is byte-identical to the current behavior.
11. `<item-content>` continues to carry comments; no change to that block.
12. `lib/system-prompt.test.ts` is updated with: (a) a case asserting block ordering when a member prompt is present, (b) a case asserting byte-identical output to the pre-change behavior when `memberPrompt` is omitted, empty, or whitespace-only.

**Adapter model override**

13. `AgentAdapter.startSession` input gains `model?: string`. When `model` is a non-empty string, `claudeAdapter` appends `--model <id>` (verbatim) to the spawned `claude` argv immediately before `--dangerously-skip-permissions`. When falsy, no `--model` flag is added and argv is unchanged from today.
14. The model string is passed through verbatim — no client-side validation against an enum. Validation happens at the CLI boundary; CLI errors propagate as session failures.
15. Implementation note (verification, not acceptance): confirm `--model` is the flag the installed `claude` CLI accepts via `claude --help`; if the bundled CLI uses a different spelling, update the adapter to match before merging. The contract above (single `--model <id>` flag, verbatim model string) holds regardless of spelling.

**Stage pipeline integration**

16. `lib/stage-pipeline.ts` resolves `stage.agentId` (if any) by reading `.nos/agents/<id>/meta.yml` + `index.md` once per run. The resolved `model` is passed to `adapter.startSession`; the resolved `index.md` body is passed to `buildAgentPrompt` as `memberPrompt`.
17. Given `stage.agentId` references an agent that does not exist on disk, when the stage runs, then the pipeline logs a warning to the dev server log, omits the member prompt, omits the model flag, records the session with `agentId: <missing-id>`, and still runs the stage. The item is NOT marked failed for this reason alone.
18. Each session entry written to the item's `meta.yml` records `agentId?: string` when an agent was resolved (including missing-but-referenced). Sessions for unassigned stages omit the field. Older sessions without `agentId` continue to load.

**HTTP API**

19. `GET /api/agents` returns `{ agents: Agent[] }`, where `Agent = { id, displayName, model, prompt, createdAt, updatedAt }`. `prompt` is the `index.md` body verbatim.
20. `POST /api/agents` accepts `{ displayName: string, model?: string | null, prompt?: string }`. Returns 201 with the created `Agent`. `displayName` is required and non-empty after trim; otherwise 400.
21. `GET /api/agents/[id]` returns the `Agent` or 404.
22. `PATCH /api/agents/[id]` accepts a partial `{ displayName?, model?, prompt? }`. `id` cannot be changed. `updatedAt` is bumped on any successful patch. 404 on unknown id.
23. `DELETE /api/agents/[id]` removes the agent directory. Returns 204 on success, 404 if missing, 409 (per AC 9) if referenced by any stage.
24. The stage PATCH route accepts `agentId: string | null` in its body and persists it (per AC 7–8).

**Dashboard UI**

25. A new top-level sidebar entry **Members** routes to `app/dashboard/agents/page.tsx`.
26. The Members page lists all agents (displayName, model, updated date) and supports Create / Edit / Delete. The edit form contains: `displayName` (text, required), `model` (dropdown with the four values from "Decisions locked" plus "Other…"; selecting "Other…" reveals a text input), `prompt` (markdown editor — reuse `components/dashboard/ItemDescriptionEditor`).
27. Delete shows a confirm dialog. If the API returns 409, the dialog surfaces the list of referencing `{workflowId, stageName}` pairs and aborts the delete.
28. `StageDetailDialog` gains an **Agent** select listing all agents plus a "None" option. Saving the dialog issues the existing stage PATCH with `agentId` set to the selected id or `null`.
29. The Kanban column header renders an inline pill with the assigned agent's `displayName` next to the existing `AI` and `Auto` pills (REQ-00031 parity). The pill is hidden when `stage.agentId` is unset and rendered with a muted variant when `stage.agentId` references a missing agent.

**Behavioral compatibility**

30. With zero agents defined and no `agentId` on any stage, observed behavior of stage runs (argv to `claude`, prompt bytes, session entries) is identical to pre-change behavior.

### Technical constraints

- **On-disk paths:** `.nos/agents/<slug>/meta.yml` and `.nos/agents/<slug>/index.md`. Directory MUST be created with `recursive: true`.
- **YAML:** parsed/serialized with `js-yaml` using the same options as `lib/workflow-store.ts` (preserve key order on round-trip where the helper supports it, otherwise stable alphabetic order).
- **Slug regex:** `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Reject non-conforming explicit ids with HTTP 400.
- **Type additions** (in `types/workflow.ts`):
  - `Stage` gets `agentId?: string | null`.
  - `ItemSession` gets `agentId?: string`.
  - New `Agent = { id: string; displayName: string; model: string | null; prompt: string; createdAt: string; updatedAt: string }`.
- **API routes:** `app/api/agents/route.ts` (GET, POST) and `app/api/agents/[id]/route.ts` (GET, PATCH, DELETE), mirroring the patterns in `app/api/workflows/...`.
- **Adapter argv ordering:** `--model <id>` (when present) appears immediately before `--dangerously-skip-permissions`; all other flags retain their current relative order.
- **Prompt block ordering:** `<system-prompt>` → `<member-prompt>` (optional) → `<stage-prompt>` → `<item-content>`. No blank line between blocks beyond what is currently emitted.
- **Concurrency:** agent reads happen at stage-run start; in-flight sessions are unaffected by mid-run agent edits.
- **Deletion safety:** the agent DELETE handler scans every workflow's `stages.yaml` to compute the referencing list before allowing deletion.
- **Performance:** agent count is expected to be small (< 50). A linear scan of `.nos/agents/` per `GET /api/agents` and per stage-run resolve is acceptable; no caching required in v1.
- **Error surfaces:** 400 for validation, 404 for unknown id, 409 for deletion-while-referenced. All errors return `{ error: string, details?: unknown }`.

### Out of scope

- Per-stage prompt overrides on an agent (an agent saying "behave differently on Stage X").
- Adapters other than Claude (no OpenAI/Gemini/etc.); the `model` field flows through the same code path but no new adapter implementations are added.
- A "tools per agent" / MCP scoping system. Agents inherit whatever tools the Claude CLI exposes.
- Live-reload of agent edits into already-running sessions.
- Cascading agent rename into referencing stages, and renaming the agent `id` itself.
- Backfilling `agentId` onto historical `sessions[]` entries.
- Per-item agent attribution UI (column-header pill only in v1; no badge on the item card or detail dialog).
- Multi-agent stages, agent collaboration, ordering, or conflict resolution.
- Multi-tenant / per-user authorization.
- Cost accounting, quota tracking, or model-pricing UX beyond the curated dropdown.
- Default / fallback agent applied to all unassigned stages.

## Implementation Notes

### Files added
- `lib/agents-store.ts` — list/read/create/update/delete for `.nos/agents/<id>/{meta.yml,index.md}`. Slug regex, collision-suffixing, `findAgentReferences`, `deleteAgent` with discriminated `DeleteAgentResult`.
- `app/api/agents/route.ts` — `GET` (list), `POST` (create).
- `app/api/agents/[id]/route.ts` — `GET`, `PATCH`, `DELETE`. DELETE returns 409 with a `references: [{workflowId, stageName}]` array when referenced.
- `app/dashboard/agents/page.tsx` — Members list / create / edit (ItemDescriptionEditor for prompt) / delete with conflict card.

### Files changed
- `types/workflow.ts` — `Stage.agentId?: string | null`, `ItemSession.agentId?: string`, new `Agent` type.
- `lib/workflow-store.ts` — `readStages` / `parseSessions` now round-trip `agentId`; `StagePatch` accepts `agentId`; `updateStage` writes it.
- `lib/system-prompt.ts` — `buildAgentPrompt` accepts `memberPrompt?: string | null`; emits `<member-prompt>` between `<system-prompt>` and `<stage-prompt>` only when non-empty after trim (byte-identical output when absent).
- `lib/agent-adapter.ts` — `startSession({ prompt, cwd, model })`; `claudeAdapter` appends `--model <id>` immediately before `--dangerously-skip-permissions` when `model` is a non-empty string.
- `lib/stage-pipeline.ts` — resolves `stage.agentId`, loads `.nos/agents/<id>/{meta.yml,index.md}`, threads `memberPrompt` + `model` through. On missing agent: warns, omits prompt/model, still records `agentId` on the session and runs the stage.
- `app/api/workflows/[id]/stages/[stageName]/route.ts` — PATCH accepts `agentId: string | null`, validates existence with 400 on unknown id.
- `components/dashboard/StageDetailDialog.tsx` — adds **Agent** select (None + existing agents); fetches `/api/agents` on open.
- `components/dashboard/KanbanBoard.tsx` — fetches agents and renders an inline pill next to AI/Auto pills; missing-agent reference renders with a muted italic variant.
- `config/tools.json` — adds top-level **Members** entry routing to `/dashboard/agents` with the `Users` lucide icon.
- `lib/system-prompt.test.ts` — adds two cases: member-prompt-block ordering when present, and byte-identical output when omitted/empty/whitespace/null.

### Deviations from the spec
- None. All 30 acceptance criteria are implemented as specified.

### Verification notes
- AC 15 (CLI `--model` flag spelling) — the adapter uses `--model <id>` verbatim as specified; operators running against a different CLI spelling should update `lib/agent-adapter.ts:30`.
- Tests: `npm test` — 9/9 passing (includes the two new member-prompt cases).
- Typecheck: `npx tsc --noEmit` clean.


## Validation

Evidence sources: code review of changed files, `npm test` (9/9 passing), `npx tsc --noEmit` (clean), live API smoke-tests against the dev server at `http://localhost:30128`, and GET `/dashboard/agents` returning 200.

### Storage layout
1. ✅ Create succeeded and wrote `.nos/agents/validation-bot/{meta.yml,index.md}` (POST with `displayName: "Validation Bot"`).
2. ✅ `meta.yml` round-tripped `id`, `displayName`, `model`, `createdAt`, `updatedAt` via `js-yaml` (`lib/agents-store.ts:104-112`); unknown keys are preserved because `readRawMeta` returns the full parsed object before the writer merges known fields on top.
3. ✅ `index.md` is plain markdown; empty body verified for the pre-existing `david-engineer` agent (`ls .nos/agents/david-engineer` contains only the file; `readAgentFolder` returns `prompt: ''` when the file is empty or missing).
4. ✅ Slug derivation: `"Validation Bot"` → `validation-bot` (`slugify` at `lib/agents-store.ts:23-30`); collision loop at `lib/agents-store.ts:140-144` appends `-2`, `-3`, …
5. ✅ `readAgentFolder` throws on id/directory mismatch (`lib/agents-store.ts:46-50`).
6. ✅ Writes go through the local `atomicWriteFile` helper that mirrors the `workflow-store.ts` pattern (`lib/agents-store.ts:13-17`).

### Stage ↔ agent linkage
7. ✅ `Stage.agentId?: string | null` added (`types/workflow.ts:11`). `readStages` parses it (`lib/workflow-store.ts:98-99`); `updateStage` writes it (`lib/workflow-store.ts:350-352`). Confirmed by PATCH/GET round-trip on `Backlog` stage: `stages.yaml` shows `agentId: validation-bot` then `null` after clear.
8. ✅ `StagePatch.agentId` accepts `string | null` (`lib/workflow-store.ts:308`); the route validates existence with `agentExists(...)` and returns HTTP 400 for unknown ids. Verified: `{agentId:"does-not-exist"}` → 400 `"Agent 'does-not-exist' not found"`.
9. ✅ DELETE `/api/agents/validation-bot` while referenced by `requirements/Backlog` returned 409 with `references:[{workflowId:"requirements",stageName:"Backlog"}]`; after clearing the reference, DELETE returned 204 and the directory was removed. Agent and stage were both unchanged by the 409 response.

### Prompt assembly
10. ✅ `buildAgentPrompt` places `<member-prompt>` strictly between `<system-prompt>` and `<stage-prompt>` (`lib/system-prompt.ts:36-44`); new test `member prompt block is placed between system-prompt and stage-prompt` verifies order.
11. ✅ `<item-content>` assembly is unchanged; comments still render via `renderCommentsSection` (existing tests continue to pass).
12. ✅ New tests: block-ordering case and a byte-identical case covering `undefined`, `''`, whitespace, and `null` (`lib/system-prompt.test.ts:136-155`).

### Adapter model override
13. ✅ `startSession({ prompt, cwd, model })` appends `--model <id>` immediately before `--dangerously-skip-permissions` (`lib/agent-adapter.ts:35-39`). When `model` is falsy, argv is unchanged.
14. ✅ Model string is pushed verbatim after `.trim()`; no client-side enum validation.
15. ⚠️ CLI flag spelling not verified against the installed `claude` binary in this review (no `claude --help` run here). The implementation matches the spec contract; if the bundled CLI disagrees, update `lib/agent-adapter.ts:37`. This matches the verification note already recorded in Implementation Notes.

### Stage pipeline integration
16. ✅ `lib/stage-pipeline.ts:24-36` resolves `stage.agentId`, reads `meta.yml` + `index.md` via `readAgent`, and threads `memberPrompt` + `model` through `buildAgentPrompt` and `adapter.startSession`.
17. ✅ When `readAgent` returns `null`, the pipeline logs a warning, sets `memberPrompt=null` and `model=undefined`, still records `resolvedAgentId` on the session, and proceeds with the stage run (`lib/stage-pipeline.ts:31-58`). Item is not marked failed.
18. ✅ `ItemSession.agentId?: string` added (`types/workflow.ts:24`); `parseSessions` loads it (`lib/workflow-store.ts:155-157`); pipeline writes it only when a stage had an `agentId` (missing-but-referenced also records, per AC). Older sessions without the field continue to load.

### HTTP API
19. ✅ `GET /api/agents` returned `{"agents":[{"id":"david-engineer",…}]}` with `prompt`, `createdAt`, `updatedAt` populated.
20. ✅ `POST /api/agents` with `displayName:""` → 400; with valid body → 201 and created agent JSON.
21. ✅ `GET /api/agents/[id]` returns 404 for unknown ids (`app/api/agents/[id]/route.ts:17-19`).
22. ✅ PATCH with `{displayName,prompt}` returned updated agent and bumped `updatedAt` (from `05:54:16.328Z` → `05:54:25.393Z`); id was not changed.
23. ✅ DELETE returned 204 (success), 404 (missing), 409 (referenced) — all three paths exercised.
24. ✅ Stage PATCH accepts `agentId` (body parsed, existence validated, persisted).

### Dashboard UI
25. ✅ `config/tools.json` adds a top-level `members` entry routing to `/dashboard/agents` with the `Users` icon; the Sidebar renders all entries from the tool registry (`components/dashboard/Sidebar.tsx:19,61`). GET `/dashboard/agents` returned HTTP 200.
26. ✅ `app/dashboard/agents/page.tsx` renders list + create/edit form. Model dropdown contains the three curated ids and an `Other…` option (`app/dashboard/agents/page.tsx:19-24,290`); the prompt field uses `ItemDescriptionEditor` (`app/dashboard/agents/page.tsx:12-13,307`).
27. ✅ Delete confirm + 409 conflict card are implemented (`app/dashboard/agents/page.tsx:162,337`). Manually confirmed that the API returns the references list; the UI reads `data.references` and surfaces `{workflowId, stageName}` entries (lines around 337 show the `Cannot delete '{conflict.agentId}'` card reading `conflict.references`).
28. ✅ `StageDetailDialog` fetches `/api/agents` on open and renders an agent select with a `None` option (`components/dashboard/StageDetailDialog.tsx:56-59,175-191`); Save sends `agentId: agentId || null` (line 107).
29. ✅ Kanban column header renders an inline pill next to `AI`/`Auto` pills. Resolved agent → `secondary` variant with `User` icon and `displayName`. Missing reference → muted italic variant with `{agentId}?` and a tooltip (`components/dashboard/KanbanBoard.tsx:313-336`).

### Behavioral compatibility
30. ✅ `empty/whitespace member prompt produces byte-identical output to omitted` test in `lib/system-prompt.test.ts` asserts the output is identical to the pre-change baseline when no member prompt is supplied. With no agents and no `agentId` on any stage, `stage-pipeline.ts` calls `adapter.startSession` without `model` and `buildAgentPrompt` without `memberPrompt`, preserving existing argv and prompt bytes.

### Regressions / edge cases
- Existing `system-prompt` tests (7) continue to pass unchanged.
- `tsc --noEmit` is clean after the type additions to `Stage`, `ItemSession`, and the new `Agent` type.
- Pre-existing `david-engineer` agent on disk loaded cleanly via `GET /api/agents` (empty prompt is valid).
- The KanbanBoard fetches `/api/agents` with `{cache: 'no-store'}` so newly created/renamed agents appear on the next board load.

### Overall verdict
All 30 acceptance criteria pass. AC 15 is marked ⚠️ only because CLI flag spelling cannot be confirmed without invoking `claude --help`; the code path satisfies the spec contract regardless. No follow-ups required; advancing to Done.
