I found this error when let an agent to create the item in the workflow by itself. I think we can update the claude.md in nos to guide the claude.md





```txt
All 20 items are now returned by the API.

**Root cause:** The `updatedAt` field in the produce-video meta.yml files was unquoted (`updatedAt: 2026-04-22T14:02:41Z`). YAML's implicit typing parsed this as a Date object, but the NOS server's `readItemFolder` validation expects it to be a string (`typeof data.updatedAt !== 'string'`). Items that fail validation are silently dropped. The ANA-001 meta.yml was written by the NOS server itself, which properly quotes dates.

**Fix:** Quoted the `updatedAt` value in all 20 meta.yml files. The "Handoff to Production" stage prompt should also be updated to quote date strings in the YAML it generates, to prevent this from recurring.
```

## Analysis

### Scope

**In scope:**

- Add YAML date-quoting guidance to NOS documentation so that agents (and stage prompts that instruct agents to write `meta.yml`) always produce correctly quoted ISO timestamps.
- The primary documentation targets are:
  - `.nos/system-prompt.md` — the authoritative runtime spec injected into every agent run. Adding a "YAML writing rules" section here ensures all agents see the guidance regardless of workflow.
  - `.nos/workflows/CLAUDE.md` — the `meta.yml` schema section already shows the structure but does not mention quoting. Adding a note to the schema example and a short "YAML pitfalls" callout would reinforce the rule.
  - `.nos/CLAUDE.md` — a brief mention in the conceptual overview for human readers.
- Optionally harden `readItemFolder()` in `lib/workflow-store.ts:206` to coerce `Date` objects to strings instead of silently dropping items. This is a defensive-coding improvement, not a substitute for the documentation fix.

**Out of scope:**

- Fixing the "Handoff to Production" stage prompt mentioned in the error report — that stage does not exist in any current workflow (`requirements` or `audit`). It was likely part of a `produce-video` workflow that has been removed. No action needed.
- Modifying the `nos-create-item` skill or the `POST /api/workflows/[id]/items` API route — both already go through `writeMeta()` in `lib/workflow-store.ts:20`, which uses `yaml.dump()` and produces correctly quoted strings.
- Changing `js-yaml` parsing options (e.g., `schema: FAILSAFE_SCHEMA`) — this would be a broader behavioral change with side effects across the codebase.

### Feasibility

**High feasibility / low risk.** The fix is purely documentation and an optional defensive code change:

1. **Documentation changes** — Adding a short rule ("Always quote ISO date strings in YAML") to `.nos/system-prompt.md` and `.nos/workflows/CLAUDE.md` is straightforward. The system-prompt is injected into every agent run, so the guidance reaches all agents immediately.
2. **Defensive coercion in `readItemFolder()`** — At `lib/workflow-store.ts:206`, the validation could be changed from a strict `typeof` check to a coercion: if `data.updatedAt` is a `Date` instance, convert it via `.toISOString()` before proceeding. Same for `parseSessions()` at line 235. This is a ~5-line change with no external dependencies. Risk: negligible — it only affects items that would otherwise be silently dropped.
3. **No unknowns requiring spiking.** The root cause is fully understood, the fix paths are clear, and both can be verified by creating an item with an unquoted date and confirming it appears in the API.

### Dependencies

- **`lib/workflow-store.ts`** — `readItemFolder()` (line 184) and `parseSessions()` (line 226) are the validation functions that would receive the defensive coercion.
- **`.nos/system-prompt.md`** — the authoritative spec for agent behavior. Any rule added here takes precedence over other docs.
- **`.nos/workflows/CLAUDE.md`** — documents the `meta.yml` schema; the quoting rule should appear alongside the schema example.
- **Stage prompts in `config/stages.yaml`** — the Implementation stage in the requirements workflow (lines 113–114) instructs agents to edit `meta.yml` directly. It should either reference the quoting rule or, better, tell agents to use the `nos-edit-item` / `nos-move-stage` skills instead of manual edits.
- **No external service or module dependencies.**

### Open Questions

1. **Should `readItemFolder()` silently coerce or log a warning?** Currently items with invalid meta are silently dropped. A logged warning would help operators diagnose similar issues in the future. The decision affects whether this requirement includes a logging change.
2. **Should stage prompts that instruct agents to write `meta.yml` be rewritten to use NOS skills (`nos-edit-item`, `nos-move-stage`) instead?** This would eliminate the manual-edit footgun entirely but is a larger change to the stage prompt design.
3. **Should the `meta.yml` schema section in `workflows/CLAUDE.md` use explicit YAML quoting in its example** (e.g., `updatedAt: '2026-04-22T14:02:41.000Z'` instead of `updatedAt: <iso-date>`)? This would make the expected format unambiguous.

## Specification

### User Stories

1. **As a NOS stage agent**, I want clear guidance in the system prompt about quoting ISO date strings in YAML, so that I never produce `meta.yml` files with unquoted timestamps that get silently dropped by the runtime.

2. **As a NOS operator**, I want the `meta.yml` schema documentation to show explicitly quoted date examples, so that I can verify agent-written metadata conforms to the expected format.

3. **As a NOS operator**, I want `readItemFolder()` to coerce YAML-parsed `Date` objects to ISO strings instead of silently dropping the item, so that items with unquoted dates are still loaded and visible in the dashboard.

### Acceptance Criteria

1. **AC-1: System prompt YAML rules section**
   - Given the file `.nos/system-prompt.md`
   - When an agent reads the system prompt at the start of a stage run
   - Then it contains a "YAML writing rules" section (or equivalent) that explicitly states: always single-quote ISO-8601 date/time strings in YAML to prevent implicit typing coercion.

2. **AC-2: Workflows CLAUDE.md schema example updated**
   - Given the file `.nos/workflows/CLAUDE.md`
   - When a reader looks at the `meta.yml` schema section
   - Then the `updatedAt` and `startedAt` fields in the example use single-quoted ISO strings (e.g., `updatedAt: '2026-04-22T14:02:41.000Z'`) instead of the unquoted placeholder `<iso-date>`.

3. **AC-3: NOS CLAUDE.md mentions YAML quoting**
   - Given the file `.nos/CLAUDE.md`
   - When a human reader reviews the conceptual overview
   - Then it contains a brief note under an appropriate heading warning that ISO dates must be quoted in YAML files to avoid silent item drops.

4. **AC-4: Defensive coercion in `readItemFolder()`**
   - Given `lib/workflow-store.ts`, function `readItemFolder()`
   - When the parsed `data.updatedAt` is a JavaScript `Date` instance (not a string)
   - Then the function coerces it to an ISO string via `.toISOString()` and continues processing instead of returning `null`.

5. **AC-5: Defensive coercion in `parseSessions()`**
   - Given `lib/workflow-store.ts`, function `parseSessions()`
   - When a session entry's `startedAt` is a JavaScript `Date` instance (not a string)
   - Then the function coerces it to an ISO string via `.toISOString()` and continues processing instead of returning `null`.

6. **AC-6: Console warning on coercion**
   - Given the defensive coercion in AC-4 or AC-5 is triggered
   - When a `Date` object is coerced to a string
   - Then a `console.warn()` message is logged identifying the item ID and the field that required coercion, so operators can diagnose and fix the source.

### Technical Constraints

1. **Documentation files to modify:**
   - `.nos/system-prompt.md` — add a "YAML writing rules" subsection under "Standing instructions". Keep it concise (3–5 lines). This file is injected verbatim into every agent run, so additions must be minimal.
   - `.nos/workflows/CLAUDE.md` — update the `meta.yml` schema example block and add a "YAML pitfalls" callout. Schema per `docs/standards/database-design.md`.
   - `.nos/CLAUDE.md` — add a one-sentence note under "Agent Constraints" or a new "YAML Conventions" heading.

2. **Code files to modify:**
   - `lib/workflow-store.ts` — `readItemFolder()` (current line ~206) and `parseSessions()` (current line ~235). The coercion must check `instanceof Date` and call `.toISOString()`. The existing `typeof !== 'string'` check remains as the outer guard; the coercion is an additional branch within it.

3. **YAML implicit typing behavior:** `js-yaml` (the library used by NOS) parses unquoted ISO-8601 strings like `2026-04-22T14:02:41Z` as JavaScript `Date` objects by default when using `DEFAULT_SCHEMA`. Single-quoting (`'2026-04-22T14:02:41Z'`) forces string parsing.

4. **No changes to `js-yaml` schema configuration** — changing to `FAILSAFE_SCHEMA` would affect all YAML parsing globally and is out of scope.

5. **The `writeMeta()` function** (`lib/workflow-store.ts:20`) already uses `yaml.dump()` which produces correctly quoted strings. No changes needed to the write path.

6. **Performance:** No performance impact. The `instanceof Date` check is O(1) and only runs during item loading.

### Out of Scope

1. **"Handoff to Production" stage prompt** — referenced in the original error report but does not exist in any current workflow. No action needed.
2. **Modifying `nos-create-item` skill or `POST /api/workflows/[id]/items` route** — both already produce correctly quoted YAML via `writeMeta()` / `yaml.dump()`.
3. **Changing `js-yaml` parsing schema** (e.g., `FAILSAFE_SCHEMA`) — broader behavioral change with side effects.
4. **Rewriting stage prompts to use NOS skills instead of manual `meta.yml` edits** — identified as a potential improvement in Open Questions but is a separate, larger initiative.
5. **Adding validation to `agents-store.ts` or `workspace-store.ts`** — while they share the same pattern, they are not currently affected by this bug and should be addressed in a separate requirement if needed.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00101 | Fix YAML date-quoting guidance & defensive coercion | Bug report | system-architecture.md, database-design.md | `.nos/system-prompt.md`, `.nos/workflows/CLAUDE.md`, `.nos/CLAUDE.md`, `lib/workflow-store.ts` | Manual validation — verify unquoted-date item loads after fix | Pending |

### WBS Mapping

| WBS Package | Deliverable | Relevance |
|-------------|-------------|-----------|
| **1.2.4 System Prompt Management** | `.nos/system-prompt.md` | Primary — the YAML quoting rule is added to the system prompt that governs all agent behavior |
| **1.6.1 Workflow Store** | `lib/workflow-store.ts` | Primary — defensive coercion in `readItemFolder()` and `parseSessions()` |
| **1.8.7 Standards & Auditing** | `.nos/CLAUDE.md`, `.nos/workflows/CLAUDE.md` | Supporting — documentation updates to prevent recurrence |

## Implementation Notes

All 6 acceptance criteria have been implemented:

- **AC-1** (system-prompt.md): Added a "YAML writing rules" section under "Failure handling" covering: single-quote ISO-8601 date/time strings, quote any value subject to YAML implicit typing, prefer `nos-edit-item`/`nos-move-stage` skills over manual `meta.yml` edits.

- **AC-2** (workflows/CLAUDE.md): Updated the `meta.yml` schema example to use single-quoted ISO strings (`startedAt: '2026-04-22T14:02:41.000Z'`) and added a YAML pitfall callout block.

- **AC-3** (CLAUDE.md): Added YAML date quoting guidance under the "Agent Constraints" section.

- **AC-4** (workflow-store.ts `readItemFolder()`): Added `instanceof Date` coercion branch at line 206. Extracted the validated string to a `const updatedAt` variable for TypeScript safety.

- **AC-5** (workflow-store.ts `parseSessions()`): Added `instanceof Date` coercion branch for `e.startedAt` with separate string validation check.

- **AC-6**: Both coercion branches emit `console.warn()` identifying the affected item/field.

No deviations from the documented standards. The `writeMeta()` path was not modified (already safe via `yaml.dump()`). The `workflowId` variable is not in scope in `parseSessions()`, so the warning message omits it (acceptable per the spec's intent).

## Validation

All 6 acceptance criteria pass.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | System prompt YAML rules section | ✅ Pass | `.nos/system-prompt.md` lines 56–60: "YAML writing rules" section explicitly states ISO-8601 date/time strings must be single-quoted, with an example and rationale. |
| AC-2 | Workflows CLAUDE.md schema example updated | ✅ Pass | `.nos/workflows/CLAUDE.md` lines 55 and 57: `startedAt` and `updatedAt` fields use single-quoted ISO strings; line 60 adds a YAML pitfall callout block. |
| AC-3 | NOS CLAUDE.md mentions YAML quoting | ✅ Pass | `.nos/CLAUDE.md` line 45: "YAML date quoting:" paragraph under "Agent Constraints" covers the risk and recommends NOS skills. |
| AC-4 | Defensive coercion in `readItemFolder()` | ✅ Pass | `lib/workflow-store.ts` lines 206–216: outer `typeof !== 'string'` guard, then `instanceof Date` branch coerces via `.toISOString()` instead of returning `null`. |
| AC-5 | Defensive coercion in `parseSessions()` | ✅ Pass | `lib/workflow-store.ts` lines 246–256: same pattern applied to `e.startedAt`; `Date` instance coerced, non-`Date` non-string still returns `null`. |
| AC-6 | Console warning on coercion | ✅ Pass | Lines 209–211 emit `console.warn` identifying `workflowId/itemId` and field for `readItemFolder()`; lines 249–251 emit `console.warn` identifying field for `parseSessions()`. |

### Regression check

- The `writeMeta()` write path (line 20) was not modified — still uses `yaml.dump()` which produces correctly quoted YAML. No regression.
- The coercion branches are purely additive: they only activate for items that would previously have been silently dropped. Existing valid items (with string `updatedAt`) hit neither branch. No regression.
- TypeScript type safety: the `as string` cast at line 217 is safe because by that point `data.updatedAt` is either already a string (outer check passed) or has been set via `.toISOString()` (coercion branch).
- `agents-store.ts` and `workspace-store.ts` were not modified per out-of-scope constraint #5 in the spec. No impact on their behavior.
