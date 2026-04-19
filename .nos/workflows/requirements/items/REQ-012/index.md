Establish the .nos/ directory, stages config, and item schema.

## Analysis

### 1. Scope

**In scope**

* Define the on-disk layout under `.nos/` that the workflow engine (REQ-011) reads and writes:
  * `.nos/workflows/<workflowId>/config.json` — workflow identity (`name`, `idPrefix`).
  * `.nos/workflows/<workflowId>/config/stages.yaml` — ordered list of stages with `name`, `description`, `prompt`, `autoAdvanceOnComplete`, optional `agentId`, optional `maxDisplayItems`.
  * `.nos/workflows/<workflowId>/items/<itemId>/index.md` — human-authored body (title H1 optional + free text + per-stage appended sections).
  * `.nos/workflows/<workflowId>/items/<itemId>/meta.yml` — machine-managed metadata: `title`, `stage`, `status`, `comments`, `updatedAt`, `sessions`.
* Specify the canonical field set, value enums, and lifecycle rules for `meta.yml` (status: `Todo` | `In Progress` | `Done` | `Failed`; sessions appended one-per-stage-run).
* Specify how IDs are minted from `idPrefix` (zero-padded, monotonically increasing) and how the items directory enumerates them.
* Define top-level `.nos/settings.yaml` (e.g. `autoAdvanceHeartbeatMs`) and the `.nos/agents/` directory used by per-stage `agentId`.
* Document the read/write contract: `index.md` is append-only across stages; `meta.yml` is rewritten as a whole by the engine.

**Out of scope**

* The runtime engine that consumes the schema (REQ-011) — only the *shape* it consumes is defined here.
* The Kanban UI that renders items by stage (REQ-013).
* Adapter/agent invocation mechanics, comment storage format beyond the `comments: []` slot, and stream/event plumbing.
* Migration tooling for pre-existing `docs/requirements/` content (the legacy TSV/JSON layout in `CLAUDE.md`).

### 2. Feasibility

* **Technical viability: high.** The layout already exists in-tree (`.nos/workflows/requirements/`, `.nos/settings.yaml`, `.nos/agents/`) and is being exercised by the live engine, so the schema is proven by construction. This requirement effectively *codifies* the existing convention.
* **Risks**
  * **Schema drift.** `meta.yml` is touched by multiple writers (engine, auto-advance sweeper, status/comment skills, manual edits). Without a documented schema + a single serializer, fields can diverge silently (extra keys, reordered lists, lost `sessions` entries).
  * **YAML/Markdown parsing edge cases.** Item titles or comments containing YAML-significant characters (`:` `#` `-`) can corrupt `meta.yml` if not quoted; `index.md` sections appended by stages can collide if two stages reuse the same heading.
  * **ID collisions.** Concurrent item creation against the same workflow can mint duplicate IDs unless minting is gated by a single writer or filesystem-level check.
* **Unknowns to spike**
  * Whether `comments` should remain inline in `meta.yml` or move to a sibling `comments.yml` once volume grows (current shape is `comments: []` — empty across the tree).
  * Whether `sessions` should be capped/rotated, since each re-run appends another entry.
  * Whether `Failed` status should be a first-class enum value or surfaced via a sentinel session entry (current standing instructions treat it as a status).

### 3. Dependencies

* **REQ-011 — Workflow Engine**: consumes `stages.yaml`, `config.json`, `meta.yml`, and writes `meta.yml` updates / appends to `index.md`. The schema defined here is its contract.
* **REQ-013 — Workflow Kanban Screen**: renders columns from `stages.yaml` and cards from `items/*/meta.yml`; depends on stable field names (`stage`, `status`, `title`).
* **REQ-014 — Skills (`nos-set-status`, `nos-comment-item`)**: write `status` and append `comments` via the dev-server API; depend on the meta schema.
* **`lib/workflow-store.ts`** — the single in-process reader/writer of these files; any schema clarification here must round-trip through it.
* **`lib/stage-pipeline.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`** — depend on the `sessions` array shape and `autoAdvanceOnComplete` flag.
* **`config/tools.json`, `lib/system-prompt.ts`** — consume the on-disk layout to brief agents about file locations.
* External: filesystem only. No DB, no network. YAML library (`js-yaml`-equivalent) is the one runtime dependency for parsing `stages.yaml` / `meta.yml`.

### 4. Open questions

1. **Status enum.** Is the canonical set `Todo | In Progress | Done | Failed`, or does the engine also recognize intermediate states (e.g. `Blocked`, `Review`)? The standing system prompt names only the four; should the schema reject anything else?
2. **`sessions` retention.** Should the engine prune session entries on success, or keep an unbounded audit log? Affects file size for long-lived items.
3. **Comments shape.** What is the per-comment record format (author, timestamp, body, stage)? `comments: []` is empty everywhere — define it before REQ-014's comment skill writes anything non-trivial.
4. **ID minting authority.** Is ID assignment owned by `workflow-store.ts` (server-side, atomic) or by the client/CLI? Padding width (`REQ-00018` vs `REQ-011`) is currently inconsistent in-tree — pick one rule and document it.
5. **Stage section conventions in `index.md`.** Each stage appends a `## <StageName>` section (Analysis, Specification, Implementation Notes, Validation). Should this be enforced by the engine (idempotent re-run replaces the existing section) or left as an agent-side convention (re-runs duplicate)?
6. **`agentId` resolution.** When `stages.yaml` names an `agentId`, where does the engine look it up — `.nos/agents/<id>.{md,yml}`? Schema should pin the location and required fields.
7. **`config.json` vs `config/stages.yaml` split.** Why is workflow identity JSON while stages are YAML? Worth either unifying or documenting the rationale (e.g. JSON for programmatic write, YAML for human edit of long prompts).
8. **Validation timing.** Should the engine validate the schema on load (fail fast on malformed `meta.yml`) or be permissive and self-heal (rewrite missing fields)? Affects how forgiving the format is to manual edits.

## Specification

### User stories

1. As a workflow author, I want a canonical `.nos/` directory layout, so that workflows can be created and maintained with predictable file locations and field names.
2. As the workflow engine, I want stable schemas for `config.json`, `config/stages.yaml`, `index.md`, and `meta.yml`, so that I can read and write workflow state deterministically.
3. As an implementer of workflow tooling, I want explicit rules for item ID minting and item enumeration, so that item creation is monotonic and collision-resistant.
4. As a stage agent or skill author, I want a documented contract for how `index.md` and `meta.yml` are updated, so that I can append stage output without corrupting workflow state.
5. As a UI consumer, I want stable metadata fields such as `title`, `stage`, and `status`, so that Kanban and detail views can render workflow items reliably.
6. As an operator debugging workflow runs, I want each stage run recorded in `sessions`, so that I can audit how an item reached its current state.

### Acceptance criteria

1. **Workflow root layout**
   * Given a workflow with ID `<workflowId>`, when it exists on disk, then it shall live under `.nos/workflows/<workflowId>/`.
   * And the workflow directory shall contain `config.json`, `config/stages.yaml`, and an `items/` directory.
2. **Workflow identity file**
   * Given `.nos/workflows/<workflowId>/config.json`, when parsed, then it shall contain exactly the workflow identity fields required by this specification: `name` and `idPrefix`.
   * And `name` shall be a human-readable workflow name.
   * And `idPrefix` shall be a non-empty string used as the prefix for item IDs in that workflow.
3. **Stages configuration file**
   * Given `.nos/workflows/<workflowId>/config/stages.yaml`, when parsed, then it shall define an ordered list of stages.
   * And each stage entry shall include `name`, `description`, `prompt`, and `autoAdvanceOnComplete`.
   * And each stage entry may include `agentId` and `maxDisplayItems`.
   * And stage names shall be unique within a workflow.
   * And the order in `stages.yaml` shall be the canonical workflow stage order.
4. **Top-level settings**
   * Given `.nos/settings.yaml`, when present, then it may define installation-wide NOS settings including `autoAdvanceHeartbeatMs`.
   * And absence of workflow-specific settings from `.nos/settings.yaml` shall not change the schema of individual workflow files.
5. **Agents directory**
   * Given a stage entry with `agentId`, when the engine resolves it, then the referenced agent definition shall live under `.nos/agents/`.
   * And this requirement defines `.nos/agents/` as the reserved directory for per-stage agent assets.
   * And the exact agent file schema is not defined here beyond the location contract.
6. **Item directory layout**
   * Given an item with ID `<itemId>`, when it exists on disk, then it shall live under `.nos/workflows/<workflowId>/items/<itemId>/`.
   * And the item directory shall contain `index.md` and `meta.yml`.
7. **`index.md` contract**
   * Given `index.md`, when authored or updated across stages, then it shall be the human-readable source document for the item.
   * And it shall contain the initial item body followed by appended stage sections.
   * And stage output shall be appended as Markdown sections using `## <Stage Name>` headings.
   * And the engine and stage writers shall treat `index.md` as append-only; this requirement does not require in-place replacement of prior sections on re-run.
8. **`meta.yml` required fields**
   * Given `meta.yml`, when parsed, then it shall contain `title`, `stage`, `status`, `comments`, `updatedAt`, and `sessions`.
   * And `title` shall be the human-readable item title.
   * And `stage` shall equal one of the stage names defined in the owning workflow's `stages.yaml`.
   * And `status` shall equal one of: `Todo`, `In Progress`, `Done`, `Failed`.
   * And values outside that status enum shall be invalid.
9. **Comments field**
   * Given `meta.yml`, when `comments` is present, then it shall be a YAML sequence.
   * And an empty comments list shall be represented as `comments: []` or an equivalent empty YAML sequence.
   * And this requirement reserves the field for comment storage but does not define a richer per-comment object schema beyond requiring the field to exist.
10. **Updated timestamp**

* Given `meta.yml`, when any machine-managed metadata changes, then `updatedAt` shall be rewritten to the current timestamp.
* And `updatedAt` shall be stored as an ISO-8601 timestamp string.

1. **Sessions audit log**

* Given a stage run starts, when the engine records execution metadata, then it shall append one new entry to `sessions` for that stage run.
* And each session entry shall include at minimum `stage`, `adapter`, `sessionId`, and `startedAt`.
* And successful completion, failure, or re-run of later stages shall not delete prior session entries.

1. **Metadata write model**

* Given machine-managed item metadata, when the engine or a trusted workflow skill updates it, then `meta.yml` shall be rewritten as a whole-file write.
* And partial line-oriented patching of `meta.yml` is not part of the contract.

1. **Item creation and ID minting**

* Given a new item is created in a workflow, when the next ID is minted, then the ID shall be formed as `<idPrefix>-<number>`.
* And `<number>` shall be zero-padded to at least three digits.
* And if any existing item for that workflow uses a wider numeric width, newly minted IDs shall preserve the widest width already present for that workflow.
* And numeric portions shall increase monotonically and shall not reuse prior values, even if earlier items are deleted.

1. **Item enumeration**

* Given the engine enumerates workflow items from disk, when it reads `.nos/workflows/<workflowId>/items/`, then each immediate child directory with both `index.md` and `meta.yml` shall be treated as an item.
* And directories missing either required file shall be invalid item directories.

1. **Stage compatibility contract**

* Given a consumer such as the workflow engine, Kanban UI, or workflow skills, when it reads workflow data, then it shall rely on the field names and file paths defined in this specification as the canonical storage contract.
* And adding undocumented required fields to these files would be a schema change and is outside this requirement.

1. **Validation behavior**

* Given malformed workflow files, when the engine loads them, then it shall fail validation rather than silently self-healing missing required fields or invalid enum values.
* And corrective rewriting is allowed only after a valid in-memory representation has been produced from compliant input.

### Technical constraints

* Workflow files shall be stored under `.nos/` only; no database or external service is part of this requirement.
* Canonical file paths are:
  * `.nos/settings.yaml`
  * `.nos/agents/`
  * `.nos/workflows/<workflowId>/config.json`
  * `.nos/workflows/<workflowId>/config/stages.yaml`
  * `.nos/workflows/<workflowId>/items/<itemId>/index.md`
  * `.nos/workflows/<workflowId>/items/<itemId>/meta.yml`
* `config.json` shall be JSON and `stages.yaml` / `meta.yml` shall be YAML.
* The format split is intentional in this requirement: JSON is reserved for compact workflow identity data written programmatically; YAML is reserved for human-edited stage definitions and metadata.
* `stage` values in `meta.yml` must match the workflow's configured stage names exactly, including case and spacing.
* `status` is limited to the four-value enum `Todo | In Progress | Done | Failed`.
* `comments` must remain present even when empty.
* `sessions` is an append-only audit log and is not rotated or capped by this requirement.
* Writers shall quote or serialize scalar YAML values safely so titles or comments containing YAML-significant characters do not corrupt `meta.yml`.
* Parsing and serialization must round-trip through the workflow store without dropping required fields.
* The engine is the authority for machine-managed writes; user-authored changes are limited to the human-readable content in `index.md` and intentional manual edits to config files.
* Consumers must tolerate Markdown content growth in `index.md`; no size cap is defined here.
* This requirement defines the storage contract only; execution behavior, UI rendering, event streaming, and agent adapter behavior are specified elsewhere.

### Out of scope

* Implementing the runtime workflow engine that consumes these files.
* Defining the Kanban UI behavior or presentation.
* Defining the full agent definition schema under `.nos/agents/`.
* Defining a richer comment object model beyond reserving the `comments` field.
* Defining migration tooling for legacy `docs/requirements/` data.
* Defining concurrency control or locking mechanics beyond requiring monotonic, collision-resistant ID assignment.
* Defining re-run deduplication or replacement semantics for existing stage sections in `index.md`.
* Defining transport, streaming, or dev-server APIs used by workflow skills.

## Implementation Notes

* Tightened `lib/workflow-store.ts` to enforce the documented storage contract instead of silently normalizing malformed workflow data.
* Required `config.json` to contain exactly `name` and `idPrefix`, enforced unique/fully-typed stage entries, and rejected invalid item directories that lack either `index.md` or `meta.yml`.
* Updated prefixed ID minting to use the widest existing numeric width with a minimum width of three digits, kept `meta.yml` whole-file writes, and made new items initialize `sessions: []`.
* Preserved the append-only `sessions` audit log by removing the prior session-pruning behavior when an item returns to `Todo`.

## Validation

1. ✅ **Workflow root layout** — Verified on disk: `.nos/workflows/requirements/` contains `config.json`, `config/stages.yaml`, and `items/`. Evidence: filesystem listing and reads of `.nos/workflows/requirements/config.json` and `.nos/workflows/requirements/config/stages.yaml`.
2. ✅ **Workflow identity file** — `config.json` contains exactly `name` and `idPrefix`, both non-empty strings. Evidence: `.nos/workflows/requirements/config.json:1-4` and validation in `lib/workflow-store.ts:55-71`.
3. ❌ **Stages configuration file** — The parser now requires every stage entry to have string `description`, string `prompt`, and boolean `autoAdvanceOnComplete`, but the live workflow data still contains `null` values for `prompt` and `autoAdvanceOnComplete` on `Backlog` and `Done`. This makes the requirements workflow itself non-compliant with the spec. Evidence: `.nos/workflows/requirements/config/stages.yaml:1-5`, `:107-112`, and enforcement in `lib/workflow-store.ts:99-129`.
4. ✅ **Top-level settings** — `.nos/settings.yaml` exists and defines installation-wide setting `autoAdvanceHeartbeatMs`; it does not affect per-workflow schema. Evidence: `.nos/settings.yaml:1`.
5. ✅ **Agents directory** — Stage `Implementation` references `agentId: david-engineer`, and `.nos/agents/` exists with that agent asset present. Evidence: `.nos/workflows/requirements/config/stages.yaml:56-84` and `.nos/agents/david-engineer` directory listing.
6. ✅ **Item directory layout** — REQ-012 exists under `.nos/workflows/requirements/items/REQ-012/` with both `index.md` and `meta.yml`. Evidence: filesystem listing and reads of both files.
7. ✅ **`index.md` contract** — The item body is followed by appended `## Analysis`, `## Specification`, `## Implementation Notes`, and now `## Validation` sections. The store writes content as a whole document and does not implement section replacement. Evidence: `.nos/workflows/requirements/items/REQ-012/index.md` and `lib/workflow-store.ts:322-335`.
8. ✅ **`meta.yml` required fields** — Reader enforces `title`, `stage`, `status`, `comments`, `updatedAt`, and `sessions`; `stage` must match configured stage names and `status` must be one of `Todo | In Progress | Done | Failed`. Evidence: `lib/workflow-store.ts:138-178` and `:132-136`.
9. ✅ **Comments field** — Reader requires `comments` to be an array, and created items initialize `comments: []`. Evidence: `lib/workflow-store.ts:156-158` and `:475-481`; current item also shows a YAML sequence in `.nos/workflows/requirements/items/REQ-012/meta.yml:4-22`.
10. ✅ **Updated timestamp** — All machine-managed writes route through `writeMeta`, which rewrites `updatedAt` to `new Date().toISOString()`. Evidence: `lib/workflow-store.ts:17-32`.
11. ✅ **Sessions audit log** — Stage runs append a new session entry with `stage`, `adapter`, `sessionId`, and `startedAt`; existing entries are preserved. Evidence: `lib/stage-pipeline.ts:49-60`, `lib/workflow-store.ts:307-319`, and current audit trail in `.nos/workflows/requirements/items/REQ-012/meta.yml:24-40`.
12. ✅ **Metadata write model** — `meta.yml` updates are whole-file writes via temp file + rename; no line patching is used. Evidence: `lib/workflow-store.ts:11-25`, `:281-305`, `:307-319`.
13. ✅ **Item creation and ID minting** — New IDs are formed as `<idPrefix>-<number>`, use a minimum width of three digits, preserve the widest existing width, and advance monotonically from the max observed number. Evidence: `lib/workflow-store.ts:73-87` and `:453-466`.
14. ✅ **Item enumeration** — Only immediate child directories containing both `index.md` and `meta.yml` are treated as items. Evidence: `lib/workflow-store.ts:221-237`.
15. ✅ **Stage compatibility contract** — Engine/API consumers read the documented file paths and field names from the workflow store types and routes. Evidence: `types/workflow.ts:6-43`, `app/api/workflows/[id]/items/route.ts:1-58`, and `app/api/workflows/[id]/items/[itemId]/route.ts:1-112`.
16. ✅ **Validation behavior** — Malformed configs/items fail reads instead of being silently normalized: invalid `config.json` returns `null`, invalid `stages.yaml` returns `[]`, and invalid item metadata returns `null`. Evidence: `lib/workflow-store.ts:55-71`, `:89-129`, and `:138-205`.

### Follow-ups

* Update `.nos/workflows/requirements/config/stages.yaml` so every stage complies with the documented schema, especially replacing `null` `prompt`/`autoAdvanceOnComplete` values on `Backlog` and `Done` with spec-compliant values.
* Re-run validation after the workflow data is brought into conformance.
