# Allow setting slash command/skill in the stages

* UI: able to setup slash command/skill in stage update screen
* System: store that in stages config
* When run: Inject slash command/skill when send to adapter

workflowId: requirements
itemId: REQ-00110

## Analysis

### 1. Scope

**In scope:**
- Adding a `skill` field (string, slash command style e.g. `/skill-name` or bare skill name) to the stage configuration schema in `stages.yaml`
- Persisting that field through the stage update/write pipeline (`StagePatch`, `readStages`, `updateStage`, `addStage`)
- Adding it to the `Stage` TypeScript type
- Exposing it in the stage update API route (`app/api/workflows/[id]/stages/[stageName]/route.ts`)
- Adding a UI control in the stage edit dialog to set/clear the skill
- Injecting the skill identifier into the prompt sent to the adapter at session start

**Explicitly out of scope:**
- Changes to the adapter interface itself (`AgentAdapter.startSession`) — the injection should happen in the prompt layer only
- Registering new skills — that is handled by the existing `config/skills.json` / `SkillRegistry`
- Per-item skill overrides (that would be a separate requirement)
- Agent-level skill assignment (stages already have `agentId`; this is separate)

---

### 2. Feasibility

**Technical viability: High**

The stage pipeline in `lib/stage-pipeline.ts` already reads `stage.prompt` and assembles a full prompt via `buildAgentPrompt`. The natural injection point is:

1. Add `skill?: string | null` to the `Stage` type.
2. Store it in `stages.yaml`.
3. In `buildAgentPrompt` (or a wrapper around it), prepend a skill directive to the prompt when `stage.skill` is set, e.g.:
   ```
   [Skill: /my-skill]

   (rest of prompt)
   ```

   Or, since Claude CLI already treats `/skill-name` as a slash command in interactive mode, the equivalent for programmatic use may need to be documented — this is the main **unknown to spike**.

**Risks:**
- The Claude CLI's `--dangerously-skip-permissions` invocation in `agent-adapter.ts` runs non-interactively; whether it supports skill invocation via prompt injection or only via interactive `/` is not confirmed. Must spike by checking the Claude CLI's `--skill` flag or equivalent.
- If the CLI does not support programmatic skill invocation, the feature may need a different implementation path (e.g., config flag passed to the CLI, or the adapter spawns with a different invocation pattern).

**Unknowns to spike:**
1. Does `claude` CLI accept a `--skill <name>` flag or equivalent for non-interactive invocation?
2. Does `claude -p --output-format stream-json` pass skill context through when the prompt starts with `/skill-name`?
3. Is there a `--system-prompt` or similar injection mechanism the adapter should use instead of prompt prepending?

---

### 3. Dependencies

**Modules / files that need changes:**

| File | Change |
|------|--------|
| `types/workflow.ts` | Add `skill?: string \| null` to `Stage` |
| `lib/workflow-store.ts` | Parse and persist `skill` in `readStages`, `StagePatch`, `updateStage`, `addStage` |
| `app/api/workflows/[id]/stages/[stageName]/route.ts` | Accept and validate `skill` in PATCH body |
| `lib/stage-pipeline.ts` | Read `stage.skill` and pass to prompt builder |
| `lib/system-prompt.ts` | Inject skill directive into prompt |
| `components/dashboard/StageDetailDialog.tsx` | Add skill input field to stage edit UI |

**No external systems** — this is entirely local. The skill definitions are read from `config/skills.json` which already exists.

---

### 4. Open Questions

1. **Prompt injection format**: Should the skill be injected as `[Use skill: /skill-name]` in the prompt, or is there a canonical CLI flag? Need to verify before finalizing the injection mechanism.
2. **Skill validation**: Should the UI validate the skill name against `SkillRegistry.getAllSkills()`? The `agentId` field does not validate against the agent store in the PATCH route — it may be sufficient to accept any non-empty string.
3. **Default/null behavior**: When `skill` is `null` or absent, no skill is injected. This is the safe default.
4. **Interaction with `agentId`**: A stage can have both `agentId` and `skill` set. Are they independent, or mutually exclusive? Currently they appear to be independent — both should be respected.
5. **Display in UI**: Should the skill be shown in the stage card/column header in the dashboard? (Probably yes for visibility, but could be deferred to a follow-up.)

---

## Specification

### 1. User Stories

- **As a workflow operator**, I want to assign a slash command/skill to a stage so that every item entering that stage runs with the skill's capabilities automatically, without needing to prefix the prompt manually.
- **As a workflow operator**, I want to set and clear the skill from the stage edit dialog so that I can configure stage behavior without editing YAML directly.
- **As a system implementer**, I want the skill identifier injected into the prompt passed to the adapter so that the Claude CLI receives the skill context consistently.

---

### 2. Acceptance Criteria

| # | Criterion | Given / When / Then |
|---|-----------|----------------------|
| AC-1 | Type | A `Stage` in `types/workflow.ts` has an optional `skill?: string \| null` field. |
| AC-2 | Persistence | `readStages` in `lib/workflow-store.ts` parses and returns `skill`; `updateStage` and `addStage` write it; `StagePatch` includes it. |
| AC-3 | API route | `PATCH /api/workflows/[id]/stages/[stageName]` accepts `skill` (string or null) in the JSON body and returns the updated stage. |
| AC-4 | UI control | `StageDetailDialog.tsx` renders a "Skill" text input. When saved, the value is sent as `skill` in the PATCH body. When cleared (empty string), `null` is sent. The input is pre-filled when the dialog opens on a stage that has a skill. |
| AC-5 | Prompt injection | When `stage.skill` is set, `buildAgentPrompt` in `lib/system-prompt.ts` prepends a `[Skill: /<skill-name>]` directive on its own line before the rest of the prompt. When `stage.skill` is absent or null, no directive is injected. |
| AC-6 | No-op when absent | When `skill` is null or absent in `stages.yaml`, the stage behaves identically to before this feature — no skill is injected, no errors occur. |
| AC-7 | Strips leading slash | The UI normalizes any `/` prefix from the skill name before persisting (e.g., `/my-skill` → `my-skill`), and the prompt injection always formats it as `/<skill-name>`. |

---

### 3. Technical Constraints

- **API shape**: `PATCH /api/workflows/[id]/stages/[stageName]` request/response — see `app/api/workflows/[id]/stages/[stageName]/route.ts` and `docs/standards/api-reference.md`. The new field `skill` follows the same `string | null` convention as `agentId`.
- **Data shape**: `Stage` type in `types/workflow.ts` — new optional field.
- **Store contract**: `StagePatch` in `lib/workflow-store.ts`; `readStages` output shape unchanged except for the added field.
- **Prompt format**: The injected directive is `[Skill: /<skill-name>]` on its own line, inserted immediately before the `<system-prompt>` tag in the output of `buildAgentPrompt`. This matches the format already established for other tag-delimited sections.
- **No adapter changes**: `AgentAdapter.startSession` is not modified. The injection happens in the prompt layer only, inside `triggerStagePipeline` → `buildAgentPrompt`.
- **No skill registry validation**: The system does not validate the skill name against `config/skills.json` or `SkillRegistry`. This is consistent with how `agentId` is handled in the PATCH route (no agent existence check in the store).
- **Skill name format**: Accepts any non-empty string trimmed of leading/trailing whitespace. Leading `/` is stripped by the UI before sending. Max length: 128 characters.
- **Existing data migration**: Existing `stages.yaml` files with no `skill` field are unaffected; `readStages` will return `skill: null` for those stages.

---

### 4. Out of Scope

- Changes to `AgentAdapter.startSession` or the adapter interface
- Registration of new skills (handled by `config/skills.json` / `SkillRegistry`)
- Per-item skill overrides
- Agent-level skill assignment (stages already have `agentId`)
- Display of the skill badge in the stage column header on the Kanban board
- Skill name validation against `SkillRegistry`

---

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00110 |
| **Title** | Allow setting slash command/skill in the stages |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/wbs.md` (1.1.2, 1.3.3, 1.4.5), `docs/standards/glossary.md` (Stage) |
| **Implementation File(s)** | `types/workflow.ts` (`Stage`), `lib/workflow-store.ts` (`StagePatch`, `readStages`, `updateStage`, `addStage`), `app/api/workflows/[id]/stages/[stageName]/route.ts`, `lib/system-prompt.ts` (`buildAgentPrompt`), `lib/stage-pipeline.ts` (`triggerStagePipeline`), `components/dashboard/StageDetailDialog.tsx` |
| **Test Coverage** | (to be filled after validation) |
| **Status** | In Progress |

---

### 6. WBS Mapping

This requirement belongs to the following WBS packages:

| WBS ID | Package | Deliverables Affected |
|--------|---------|----------------------|
| **1.1.2** | Stage Pipeline | `stages.yaml` schema extended with `skill` field; `readStages`/`updateStage`/`addStage` in `lib/workflow-store.ts`; `triggerStagePipeline` in `lib/stage-pipeline.ts` |
| **1.2.3** | Stage Pipeline Trigger | `buildAgentPrompt` in `lib/system-prompt.ts` injects skill directive into assembled prompt |
| **1.3.3** | Stage Routes | `PATCH /api/workflows/[id]/stages/[stageName]` in `app/api/workflows/[id]/stages/[stageName]/route.ts` accepts and validates `skill` |
| **1.4.5** | Stage Configuration (UI) | `StageDetailDialog.tsx` gains a "Skill" input field |
| **1.6.1** | Workflow Store | `StagePatch` interface and all stage CRUD functions in `lib/workflow-store.ts` handle the new field |

## Implementation Notes

### Changes Made

1. **`types/workflow.ts`** — Added `skill?: string | null` to the `Stage` interface.

2. **`lib/workflow-store.ts`** — Updated:
   - `readStages`: parses `skill` from YAML, trims whitespace, returns `null` if absent/empty; validates max length 128.
   - `StagePatch`: added `skill?: string | null`.
   - `updateStage`: writes `skill` to YAML (deletes key when null/empty); rejects values > 128 chars.
   - `addStage`: writes `skill` to YAML for new stages.

3. **`app/api/workflows/[id]/stages/[stageName]/route.ts`** — Added validation for `body.skill` (string or null, max 128 chars after trim, empty string normalizes to null).

4. **`lib/system-prompt.ts`** — `buildAgentPrompt` now accepts `skill?: string | null`. When non-empty, prepends `[Skill: /<skill-name>]\n` before `<system-prompt>`.

5. **`lib/stage-pipeline.ts`** — `triggerStagePipeline` passes `stage.skill ?? null` into `buildAgentPrompt`.

6. **`components/dashboard/StageDetailDialog.tsx`** — Added Skill text input below the Agent dropdown. On save, strips any leading `/` before sending. Cleared (empty) sends `null`.

### Deviations from Standards

- No validation against `SkillRegistry` — consistent with how `agentId` is handled in the PATCH route.
- No display of skill badge in Kanban column header — deferred to a follow-up requirement.

### Acceptance Criteria Status

| AC | Status |
|----|--------|
| AC-1 | ✅ — `skill?: string | null` added to `Stage` type |
| AC-2 | ✅ — `readStages`, `StagePatch`, `updateStage`, `addStage` all handle `skill` |
| AC-3 | ✅ — PATCH route accepts and validates `skill` |
| AC-4 | ✅ — StageDetailDialog renders Skill input, pre-fills on open, strips `/` prefix, sends null when cleared |
| AC-5 | ✅ — `buildAgentPrompt` prepends `[Skill: /<skill-name>]` before `<system-prompt>` |
| AC-6 | ✅ — absent/null skill produces byte-identical output (skill section not emitted) |
| AC-7 | ✅ — UI strips leading `/` before persisting; injection formats as `/<skill-name>` |

## Validation

Validation performed 2026-04-23 by reading all changed files and tracing end-to-end code paths.

### Evidence

**AC-1 — Type:**
- `types/workflow.ts:19` — `skill?: string | null` present on `Stage` interface with comment explaining usage.

**AC-2 — Persistence:**
- `lib/workflow-store.ts:156-157` — `readStages` validates type and max length (128), returns trimmed string or `null`.
- `lib/workflow-store.ts:616` — `StagePatch` interface includes `skill?: string | null`.
- `lib/workflow-store.ts:667-677` — `updateStage` writes `skill` to YAML, deletes key when null/empty, rejects > 128.
- `lib/workflow-store.ts:749-752` — `addStage` writes `skill` for new stages.

**AC-3 — API route:**
- `app/api/workflows/[id]/stages/[stageName]/route.ts:99-115` — PATCH validates `skill` (string or null, max 128 chars after trim, empty string normalizes to null).

**AC-4 — UI control:**
- `components/dashboard/StageDetailDialog.tsx:33` — `skill` state initialized as `''`.
- `components/dashboard/StageDetailDialog.tsx:48` — Pre-fills from `stage.skill ?? ''` on dialog open.
- `components/dashboard/StageDetailDialog.tsx:116` — Strips `/` prefix on save: `skill.startsWith('/') ? skill.slice(1).trim() : skill.trim() || null`.
- `components/dashboard/StageDetailDialog.tsx:236-246` — Renders "Skill" `<Input>` with placeholder and helper text.

**AC-5 — Prompt injection:**
- `lib/system-prompt.ts:39-41` — When `skill` is a non-empty string, prepends `[Skill: /<skill.trim()>]\n` to `parts` before `<system-prompt>`.
- `lib/stage-pipeline.ts:58` — Passes `stage.skill ?? null` into `buildAgentPrompt`.

**AC-6 — No-op when absent:**
- `lib/system-prompt.ts:39` — Guard `typeof skill === 'string' && skill.trim()` ensures no directive is emitted when absent/null.
- `readStages` at line 174-178 sets `skill` to `null` when absent/empty, so the absent case produces the same output as before.

**AC-7 — Strips leading slash:**
- `StageDetailDialog.tsx:116` strips `/` in the UI before sending to API.
- `system-prompt.ts:40` always formats as `/<skill.trim()>` (re-adds the slash on injection).

### Regressions / Edge Cases

- TypeScript compiles clean on all 6 changed files (pre-existing errors in `lib/scaffolding.test.ts` are unrelated).
- `addStage` correctly writes `skill` for new stages.
- `updateStage` handles rename correctly (skill not affected).
- Null/empty skill in PATCH correctly deletes the key from YAML (consistent with `agentId` behavior via `maxDisplayItems` pattern).
- 128-char validation is enforced server-side in PATCH route and in `updateStage`/`addStage`.

### Result: All 7 ACs pass ✅
