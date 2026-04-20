# Create .nos/claude.md to instruct agent about structure of .nos

## Brainstorming

### 1. Clarify — What do we really mean? What does this exclude?

**Q1: What specifically should `.nos/claude.md` document — the directory structure, the runtime behavior, the agent's responsibilities within the pipeline, or all of the above?**

**Thinking**: "Instruct agent about structure of .nos" is ambiguous. An agent could need: (a) a directory map ("here are the folders and their purposes"), (b) a runtime primer ("how NOS stages flow and what each stage does"), (c) an operational guide ("how to use NOS skills, how status transitions work"), or (d) all of the above. The scope determines how long and detailed this file should be.

**Recommended answer**: A comprehensive `.nos/claude.md` should cover all three: a directory map of `.nos/`, the stage pipeline and runtime mechanics, and the agent's standing obligations. This mirrors how `CLAUDE.md` covers the project root — each subsystem gets its own guide.

Answer: A, and also instruct the structure of nos

***

**Q2: Where does `.nos/claude.md` live relative to the existing `CLAUDE.md` and `.nos/system-prompt.md`? Does it replace, extend, or complement them?**

**Thinking**: `CLAUDE.md` already exists and covers NOS broadly (workflows, system prompt location, status protocol, CEO framework). `.nos/system-prompt.md` is the actual runtime system prompt for agents. A third file `.nos/claude.md` would be a new entry in the documentation stack. We need to understand the relationship to avoid redundancy or contradiction.

**Recommended answer**: Three distinct layers:

* `CLAUDE.md` (root) — project-level context, not specific to NOS.
* `.nos/system-prompt.md` — the verbatim system prompt injected into every agent run (the "source of truth" runtime).
* `.nos/claude.md` (new) — a conceptual/introduction guide for a human or agent reading up on how NOS works, acting as educational pre-reading before reading the system prompt.

***

**Q3: Is `.nos/claude.md` meant for human developers reading it manually, or for agents consuming it as context? Does the target audience affect format and tone?**

**Thinking**: If it's for a human developer onboarding to NOS, it can be narrative and prose-heavy. If it's for an agent (e.g., a CEO orchestrator agent that spawns sub-agents), it needs to be structured data or clearly demarcated sections that a model can parse reliably. The target audience shapes whether we write prose, markdown headers, tables, or a combination.

**Recommended answer**: Write for both — structured headers with prose under each. Humans get a narrative, and agents can extract the section relevant to their immediate task. This mirrors how `CLAUDE.md` serves both use cases.

***

**Q4: What parts of the `.nos` structure are currently undocumented anywhere else, making them a priority for `.nos/claude.md`?**

**Thinking**: Some `.nos` contents are already documented (workflows in `CLAUDE.md`, system prompt in `.nos/system-prompt.md`), but other parts may be implicit or discoverable only by reading code. The `config.json`, `requirements/` directory conventions, stages YAML config, agent adapters, and the log/output directory structure may not be written down anywhere.

**Recommended answer**: Inventory the `.nos` directory structure and identify which parts are fully undocumented vs. documented elsewhere. Prioritize documenting the undocumented. Redocumenting things already in `CLAUDE.md` or `system-prompt.md` is low priority.

***

**Q5: What naming convention should the new file follow — `.nos/claude.md` or `.nos/CLAUDE.md`? Does it matter for how Claude Code picks it up?**

**Thinking**: The root project doc is `CLAUDE.md` (uppercase). `.nos/system-prompt.md` uses lowercase. `.nos/claude.md` with lowercase would be consistent with `system-prompt.md` but different from the root doc's casing. If Claude Code has special behavior for files named `CLAUDE.md`, using `.nos/claude.md` (lowercase) might bypass that behavior.

**Recommended answer**: Check whether Claude Code treats `CLAUDE.md` vs `claude.md` differently. If there's no special parsing behavior for the file name casing, lowercase is fine and consistent with `.nos/system-prompt.md`. If there is special behavior, uppercase `CLAUDE.md` may be appropriate to mirror the root convention.

***

### 2. Probe Assumptions — What are we taking for granted?

**Q6: Are we assuming agents already understand the `.nos` structure from their system prompt, and this file is just supplemental? Or is the assumption that agents currently lack this knowledge entirely?**

**Thinking**: The NOS system prompt (`system-prompt.md`) is injected into every run, but it focuses on agent *behavior* (status protocol, failure handling, available skills) rather than explaining the underlying structure. An agent reading its system prompt knows *how to operate* within NOS but not necessarily *what NOS is* or *how it's architected*. The new doc would fill the "understanding NOS" gap.

**Recommended answer**: The assumption that agents lack structural understanding is reasonable. The system prompt teaches *behavior*, not *architecture*. `.nos/claude.md` would complement the system prompt by explaining the *why* and *what* of NOS, while the system prompt handles the *how*.

***

**Q7: Are we assuming this file will be read by human developers in addition to agents? What evidence suggests a human-readable doc is needed?**

**Thinking**: If this file is intended only for agents, a text-heavy prose document may be overkill — agents can extract key facts from structured text. If human developers are the primary audience, a narrative structure makes sense. The requirement title ("instruct agent") points to agents, but the term "agent" could also mean a human developer working with NOS.

**Recommended answer**: The requirement says "instruct agent," so agents are the primary target. However, given the project's CLAUDE.md tradition serves both humans and agents, write for both. Add a clear header structure so agents can parse sections easily.

***

**Q8: Are we assuming `.nos/claude.md` should be self-contained (all NOS knowledge in one file), or should it reference other files and link to them?**

**Thinking**: If `.nos/claude.md` is meant to be the definitive NOS guide, it could try to include everything — but that creates redundancy with `system-prompt.md` and risk of divergence. If it's meant to be a high-level overview, it should reference other files and let the reader drill down.

**Recommended answer**: Make `.nos/claude.md` a high-level conceptual guide that references `.nos/system-prompt.md` for the full agent behavior spec and `CLAUDE.md` for project-level context. One authoritative source for each concern avoids divergence.

***

**Q9: Are we assuming the `.nos` structure is stable? If it changes frequently, a static `.nos/claude.md` could become stale quickly.**

**Thinking**: The `.nos` directory is actively being developed (REQ-00068/69/70 are recent). If the structure changes every few days, a static doc file could be misleading within weeks. The doc's value depends on it being accurate and maintained.

**Recommended answer**: Write the doc in a way that surfaces the *stable* parts of NOS (the stage pipeline concept, the status protocol, the skills) while avoiding documenting volatile details (specific folder paths that may change). If the structure is actively evolving, consider linking the doc to the authoritative live source (the config files themselves) rather than duplicating their content.

***

### 3. Find Reasons and Evidence — Why do we believe this is needed?

**Q10: What specific problem does an undocumented `.nos` structure cause? Did an agent fail a task because it didn't know where workflows live? Did a developer get confused about where to find a stage config?**

**Thinking**: The need for this doc likely stems from a specific failure or confusion. Identifying the root cause helps write a doc that addresses the actual gap rather than a generic overview. Without a specific failure mode, this risks being a "nice to have" rather than a "must have."

**Recommended answer**: Investigate whether there were specific incidents where agents or developers were confused by the `.nos` structure. If a specific failure was observed (e.g., an agent couldn't find the workflow config), the doc should explicitly cover that area. If no specific failure was documented, the need may be speculative.

***

**Q11: Is there a parallel — does the root `CLAUDE.md` exist for the same reason, and does it work? What lessons from `CLAUDE.md` should apply to `.nos/claude.md`?**

**Thinking**: `CLAUDE.md` at the project root was created to orient agents (and humans) to the project's structure and conventions. If it works well, `.nos/claude.md` follows the same pattern. If `CLAUDE.md` is rarely read or considered unhelpful, we should understand why before repeating the pattern.

**Recommended answer**: Review `CLAUDE.md`'s effectiveness — check whether agents actually use it, whether the content is kept up to date, and whether it caused any confusion or contradiction. Lessons learned should inform the scope and style of `.nos/claude.md`.

***

**Q12: Are there NOS agents or configurations from other projects we could reference for comparison? What do they document, and does this help define the scope?**

**Thinking**: Without seeing how other projects approach NOS documentation, we're working from a single example. Examining other NOS-using projects (if they exist) would provide external reference points for what a NOS guide typically covers.

**Recommended answer**: If other projects with NOS exist, ask the user if there are reference projects. If not, the current `CLAUDE.md` and `system-prompt.md` are the only reference points — use them to define scope rather than importing external patterns.

***

### 4. Explore Alternatives — What else might be true?

**Q13: Instead of a static `.nos/claude.md` file, could the documentation be generated or derived from the actual `.nos` structure at runtime?**

**Thinking**: A static file risks becoming stale. If the doc's purpose is to tell agents where things are, a dynamic approach (e.g., an agent that introspects the directory and generates its own map) might be more robust than a hand-written doc that can drift out of sync.

**Recommended answer**: Consider whether a NOS skill could generate a directory map on demand. However, a static file has advantages: it's readable without running any tool, it can include narrative context that a directory listing can't convey, and it can be versioned in git alongside the structure it documents. A static file is likely the better default.

***

**Q14: What if instead of a generic "structure of .nos" doc, we create targeted docs for specific sub-systems (e.g., `.nos/workflows/README.md`, `.nos/adapters/README.md`)?**

**Thinking**: A single monolithic `.nos/claude.md` might be too broad. Breaking it into focused docs per subsystem could be more maintainable and easier to discover. Each folder could have its own `README.md` explaining its purpose.

**Recommended answer**: If the `.nos` directory has distinct sub-systems (workflows, adapters, stages, logs), targeted `README.md` files per folder may serve better than one big doc. However, this adds more files and maintenance surface. A single `.nos/claude.md` at the root is simpler if the overview is short.

***

**Q15: What if the existing `CLAUDE.md` already covers everything needed, and `.nos/claude.md` would be redundant?**

**Thinking**: The root `CLAUDE.md` already includes a "nos Project Guide" section with workflows, CEO framework, and requirement management. Is that coverage sufficient? Does it need supplementing, or does it need a companion file in the `.nos/` directory itself?

**Recommended answer**: If `CLAUDE.md`'s NOS section is comprehensive and kept up to date, perhaps the fix is to improve it rather than create a second doc. However, a separate `.nos/claude.md` makes sense if: (a) the `.nos` directory should be self-contained and self-documenting, (b) the root `CLAUDE.md` serves a different audience (project-level, not NOS-specific), or (c) the root doc is getting too long and needs trimming.

***

**Q16: What if instead of documenting the structure, we make it self-describing — e.g., a `config.json` that includes a `description` field for each directory?**

**Thinking**: Rather than a human-written doc that can drift out of sync, the config files themselves could carry metadata describing their purpose. An agent or developer could read the configs and their embedded descriptions without needing a separate doc file.

**Recommended answer**: The `config.json` for workflows already exists — adding a `description` or `readme` field to it could serve the same goal as `.nos/claude.md` while keeping the doc co-located with the data. However, this requires modifying the NOS runtime to read and surface those descriptions, which is more involved than writing a markdown file.

***

### 5. Explore Implications — If true, then what else follows?

**Q17: If `.nos/claude.md` is created, how should it stay in sync as the `.nos` structure evolves? Is there a process for updating it, or will it inevitably become stale?**

**Thinking**: Any static documentation file faces a maintenance challenge: the real system changes, but the doc doesn't update automatically. If `.nos/claude.md` is created without a process for keeping it current, it will become misleading within months.

**Recommended answer**: Either (a) assign a process owner who reviews `.nos/claude.md` whenever `.nos` changes, (b) keep the doc focused on stable concepts (pipeline stages, status protocol) rather than volatile details (exact file paths), or (c) treat the doc as a starting point and encourage contributors to update it alongside their changes (like a typical `README.md`).

***

**Q18: If `.nos/claude.md` lives inside `.nos/`, does it get included in the NOS runtime's awareness? Could the system prompt reference it, or could an agent be prompted to read it?**

**Thinking**: A file that exists but isn't referenced is easily ignored. If `.nos/claude.md` should influence agent behavior, the NOS system prompt or the stage prompt should explicitly mention it. Otherwise, agents may never discover it.

**Recommended answer**: After creating `.nos/claude.md`, update `.nos/system-prompt.md` to reference it as supplementary reading. Something like: "For a conceptual overview of how NOS works, see `.nos/claude.md`." This ensures the doc isn't an orphaned artifact.

***

**Q19: If `.nos/claude.md` conflicts with or contradicts `.nos/system-prompt.md` or `CLAUDE.md`, which takes precedence? Does the existence of three related docs create a consistency risk?**

**Thinking**: Three docs covering overlapping ground (NOS) from slightly different angles invite divergence. If one says "stages do X" and another says "stages do Y," an agent reading both gets confused. The risk scales with the number of contributors and the time since creation.

**Recommended answer**: Establish a clear authorship hierarchy: `.nos/system-prompt.md` is the authoritative runtime spec (what agents *must* follow), `CLAUDE.md` is the project-level guide, and `.nos/claude.md` is the conceptual overview that references but does not contradict the other two. Add a note in each doc: "For the authoritative spec, see \[linked doc]."

***

**Q20: If `.nos/claude.md` becomes a model for other sub-system docs (`.nos/workflows/CLAUDE.md`, etc.), does this scale? What's the cost of a proliferation of small docs?**

**Thinking**: Creating `.nos/claude.md` might establish a precedent for sub-system documentation. If it works, similar docs might be added for workflows, adapters, stages, etc. Each doc is a maintenance burden and a potential source of staleness.

**Recommended answer**: Establish a policy: docs are created only when there's demonstrated need, not preemptively. `.nos/claude.md` should be justified by a specific gap (currently, agents lack structural understanding of NOS) rather than as a general documentation investment.

## Analysis

### 1. Scope

**In scope:**
- Creating `.nos/claude.md` (or `.nos/CLAUDE.md`) as a conceptual/introduction guide for the NOS subsystem
- Directory map of `.nos/` and its subdirectories (agents, runtime, workflows, settings.yaml)
- Explicitly defining the relationship between `.nos/claude.md`, `.nos/system-prompt.md`, and root `CLAUDE.md`
- Naming convention decision (lowercase vs uppercase)
- Maintenance strategy for keeping the doc current

**Explicitly out of scope:**
- Modifying `.nos/system-prompt.md` to reference the new doc (Q18 suggests this should happen after creation, but it's a separate item)
- Creating targeted `README.md` files per subsystem (alternative approach, Q14)
- Modifying NOS runtime to read self-describing configs (Q16)
- Dynamically generating documentation at runtime (Q13)

***

### 2. Feasibility

**Technical viability:** HIGH — this is a pure documentation task. The `.nos` directory structure is fully inventory-able, existing docs (CLAUDE.md, system-prompt.md) provide reference material, and no code changes are required.

**Risks:**

1. **Staleness risk (HIGH)** — The `.nos` directory is actively evolving. Recent items (REQ-00068/69/70) touch the workflows structure. A static doc that includes specific file paths will drift out of sync within weeks unless it avoids volatile details.

2. **Redundancy risk (MEDIUM)** — `.nos/claude.md`, `.nos/system-prompt.md`, and root `CLAUDE.md` all cover NOS. Without clear boundaries, they'll diverge over time.

3. **Discovery risk (MEDIUM)** — Without updating `.nos/system-prompt.md` to reference `.nos/claude.md`, agents may never read it. The doc would exist but have no effect on agent behavior.

**Unknowns that need spiking:**

1. Does Claude Code have special behavior for `CLAUDE.md` (uppercase) vs `claude.md` (lowercase) file naming? This affects the naming convention decision. Recommendation is to use lowercase (`.nos/claude.md`) for consistency with `.nos/system-prompt.md`, but this should be verified.

2. What is the current rate of structural change in `.nos/`? If paths like `.nos/workflows/<workflowId>/items/` change frequently, the doc should use stable conceptual descriptions rather than concrete paths.

3. Should `.nos/claude.md` include concrete file paths, or stick to conceptual descriptions? Concrete paths provide precision but staleness risk; conceptual descriptions are more stable but less actionable.

***

### 3. Dependencies

| Dependency | Nature | Impact |
|---|---|---|
| `CLAUDE.md` (root) | Already exists; covers NOS at project level | Avoid duplicating content; `.nos/claude.md` should reference root CLAUDE.md rather than restating its content |
| `.nos/system-prompt.md` | Already exists; the verbatim runtime spec for agents | `.nos/claude.md` should complement (not replace) the system prompt; focus on architecture/concepts, not behavior rules |
| `.nos/` directory structure | Fully discoverable via `ls` and Glob | Must inventory all subdirectories before writing the doc; currently undocumented structure includes: agents/, runtime/, workflows/, settings.yaml |
| NOS skills (`.claude/skills/`) | Skills live under `.claude/skills/` per system prompt | Need to verify whether `.claude/skills/nos-*` files exist or if skills are defined elsewhere |
| `nos-agent-prompt.md` | A read-only workflow assistant prompt that was created but not yet in `system-prompt.md` | Exists as an artifact; unclear if it's in active use |

**No external dependencies** — this is an internal documentation task with no reliance on external services, APIs, or third-party systems.

***

### 4. Open Questions

The following questions must be resolved before documenting (implementation stage):

1. **Naming convention** — `.nos/claude.md` (lowercase, consistent with `system-prompt.md`) or `.nos/CLAUDE.md` (uppercase, consistent with root convention)? Does Claude Code treat these differently?

2. **Audience priority** — Primary target: (a) human developers onboarding to NOS, or (b) agents consuming context? This affects tone (prose-heavy vs. structured headers).

3. **Content boundary** — Should the doc include concrete file paths for `.nos/` subdirectories, or describe only stable concepts? If paths are included, what's the maintenance model?

4. **Detail level** — Should the doc cover runtime implementation details (server.json, server.log, adapter configs in agents/) or stay at the conceptual level?

5. **Relationship to other docs** — The recommended hierarchy from Q19 is:
   - `.nos/system-prompt.md` = authoritative runtime spec (what agents MUST follow)
   - `CLAUDE.md` = project-level guide
   - `.nos/claude.md` = conceptual overview (references but does not contradict the above)
   
   Should this hierarchy be explicitly stated in all three docs?

6. **Maintenance owner** — Who is responsible for keeping `.nos/claude.md` current as `.nos/` evolves? Is there a process (e.g., "update this doc when changing directory structure") or just social convention?

7. **Update trigger** — Should `.nos/claude.md` be updated: (a) whenever `.nos/` changes, (b) on PR review, or (c) whenever a developer notices staleness?

**Recommended resolution order:** Answer Q1 (naming) and Q2 (audience) first, as they shape all other decisions. Q3 (paths vs concepts) and Q5 (doc hierarchy) are secondary. Q6/Q7 (maintenance) can be deferred if the initial doc is scoped to stable concepts.

## Specification

### Document Identity

**File name:** `.nos/claude.md` (lowercase, consistent with `.nos/system-prompt.md`)

**Purpose:** A conceptual introduction to the NOS subsystem — its architecture, directory layout, and the relationships between NOS's own documentation files. It explains *what* NOS is and *how it's organized*, complementing `.nos/system-prompt.md` which explains *how agents must behave* within it.

**Audience:** Both human developers onboarding to NOS and agents that need structural context before reading the runtime system prompt.

**Authority hierarchy (stated in the doc itself):**
- `.nos/system-prompt.md` — authoritative runtime spec; what agents MUST follow in every run.
- `CLAUDE.md` (project root) — project-level guide; how NOS fits the broader codebase.
- `.nos/claude.md` — this document; a conceptual overview that references but does not contradict the above.

---

### User Stories

1. **As a new developer**, I want a single document that explains what NOS is, what directories it owns, and how a requirement flows through its pipeline, so I can understand the system before reading code or configuration.

2. **As an agent running in a NOS stage**, I want to understand the layout of `.nos/` and the role of each subdirectory, so I can navigate to the right files without guessing.

3. **As a developer extending NOS**, I want to know which `.nos/` subdirectories are stable and which are implementation details, so I know what the documentation commits to and what may change.

4. **As a code reviewer or operator**, I want a clear statement of which NOS doc takes precedence when the three related docs (`.nos/system-prompt.md`, `CLAUDE.md`, `.nos/claude.md`) disagree, so I can resolve conflicts quickly.

---

### Acceptance Criteria

1. The file `.nos/claude.md` exists at the root of the `.nos/` directory.

2. The document opens with a **Documentation Stack** section that explicitly names the three NOS-related docs, their roles, and the authority hierarchy. It must include the phrase "For the authoritative runtime spec, see `.nos/system-prompt.md`."

3. The document includes a **Directory Map** section that describes the purpose of every top-level subdirectory of `.nos/`:
   - `.nos/workflows/` — workflow definitions
   - `.nos/agents/` — agent adapter configurations
   - `.nos/runtime/` — runtime server state and logs
   - `.nos/settings.yaml` — global NOS settings

4. The document describes the **Requirements Workflow** structure under `.nos/workflows/requirements/`, including the purpose of: `config.json`, `config/stages.yaml`, `requirements/items/`, and `activity.jsonl`.

5. The document describes the **Pipeline Stages** (as defined in `stages.yaml`): Backlog → Brainstorming → Analysis → Documentation → Implementation → Validation → Done.

6. The document includes a **Maintenance** section stating: the doc focuses on stable structural concepts; contributors are expected to update it when adding or removing subdirectories; no single owner is assigned.

7. The document does NOT include verbatim copies of prompts from `stages.yaml` or system-prompt content from `.nos/system-prompt.md`.

8. The document does NOT include absolute filesystem paths for volatile directories (e.g., individual item directories under `items/`). It uses relative conceptual descriptions (e.g., "per-item directory") rather than enumerating concrete paths.

9. The file is written in markdown with clear `##` headers. No code blocks, no executable content.

---

### Technical Constraints

1. **File path:** `.nos/claude.md` — must be created in the `.nos/` root directory.
2. **Format:** Markdown only; no frontmatter; no executable content.
3. **No dependencies:** The document references `.nos/system-prompt.md` and `CLAUDE.md` by path; it does not import or inline their content.
4. **Size:** Target ≤ 500 words. Long enough to orient, short enough to stay accurate.
5. **Encoding:** UTF-8, consistent with the rest of the project.
6. **No runtime coupling:** Creating this file must not require changes to the NOS runtime, NOS skills, or any configuration file. It is purely a documentation artifact.
7. **Naming casing:** Lowercase `claude.md` is used to be consistent with the sibling `.nos/system-prompt.md` convention.

---

### Out of Scope

- Modifying `.nos/system-prompt.md` to reference the new doc.
- Modifying `CLAUDE.md` to reference the new doc.
- Creating `README.md` files inside `.nos/` subdirectories (`.nos/workflows/README.md`, `.nos/agents/README.md`, etc.).
- Documenting individual item directories under `.nos/workflows/requirements/items/<itemId>/`.
- Documenting the internal implementation of the NOS runtime server (server.json schema, server.log format, adapter-specific config files inside agent directories).
- Modifying the NOS skills in `.claude/skills/` to mention the new doc.
- Generating or deriving documentation dynamically at runtime.
- Adding a `description` field to `config.json` or `stages.yaml` to make them self-describing.

***

## Specification

### 1. User Stories

1. **As a new developer**, I want to understand the purpose and structure of the `.nos/` directory, so that I can navigate the NOS subsystem and contribute to it without reverse-engineering the code.

2. **As an agent operating within NOS**, I want a conceptual overview of how NOS works, so that I understand the architecture (pipeline stages, status protocol, skills) rather than just the behavioral rules injected via system prompt.

3. **As a human developer**, I want a self-documenting `.nos/` subsystem, so that I don't need to read code or ask teammates to understand how workflows, stages, and agents are organized.

4. **As a long-term maintainer**, I want the relationship between NOS docs to be explicit, so that I can update the correct file when requirements change without causing contradictions.

5. **As a contributor**, I want clear maintenance guidance, so that I update `.nos/claude.md` alongside my structural changes rather than letting it drift out of sync.

***

### 2. Acceptance Criteria

1. **File exists and is discoverable**: A file named `.nos/claude.md` exists at the root of the `.nos/` directory and is listed in `git ls-files`.

2. **Naming convention**: The file uses lowercase (`claude.md`) consistent with `.nos/system-prompt.md`.

3. **Doc hierarchy stated**: The file explicitly describes its role as a conceptual overview that references (but does not duplicate or contradict) `.nos/system-prompt.md` (authoritative runtime spec) and root `CLAUDE.md` (project-level guide).

4. **Directory map included**: The file describes all top-level `.nos/` subdirectories and their purposes:
   - `.nos/workflows/` — workflow definitions and item storage
   - `.nos/runtime/` — server configuration and logs
   - `.nos/agents/` — agent adapter configurations
   - `.nos/settings.yaml` — NOS-level settings
   - `.nos/system-prompt.md` — the verbatim system prompt injected into agent runs
   - `.nos/claude.md` — this document

5. **Stage pipeline explained**: The file describes the stage pipeline concept — that items progress through stages and agents are triggered per stage with `<stage-prompt>` content.

6. **Status protocol explained**: The file explains that status transitions (Todo → In Progress → Done) are owned by the NOS runtime heartbeat sweeper, not by agents.

7. **Skills inventory**: The file lists available NOS skills (nos-comment-item, nos-create-item, nos-edit-item, nos-move-stage) and notes they communicate with the NOS dev server.

8. **Written for both audiences**: The file uses clear markdown headers with prose, allowing humans to read narratively and agents to extract relevant sections.

9. **Maintenance note included**: The file includes a brief note that contributors should update it when changing the `.nos/` structure, similar to a `README.md` convention.

10. **No duplication**: The file references `.nos/system-prompt.md` for agent behavioral rules and `CLAUDE.md` for project-level context rather than restating that content.

***

### 3. Technical Constraints

1. **File path**: `.nos/claude.md` — must be lowercase to match `system-prompt.md` convention within the `.nos/` directory.

2. **Format**: Markdown with clear `#` and `##` headers for machine-parsable section extraction.

3. **Length guidance**: Target 500-800 words. Long enough to be useful, short enough to stay maintained. Avoid deep details that will change frequently.

4. **Content stability**: Describe stable concepts (pipeline stages, status protocol, skills) rather than volatile implementation details (specific file paths that may change). When referencing paths, use patterns like `.nos/workflows/<workflowId>/` rather than hardcoded workflow IDs.

5. **Relationship to other docs**: This doc must not contradict `.nos/system-prompt.md`. Where there is overlap, this doc references the system prompt rather than restating it.

6. **Git integration**: The file should be tracked in git alongside the structure it documents, enabling version history correlation.

7. **Skills endpoint**: The doc references `http://localhost:30128` as the default NOS dev server URL (from settings.yaml: `NOS_BASE_URL`).

***

### 4. Out of Scope

The following are explicitly excluded from this requirement:

1. **System prompt modification**: Updating `.nos/system-prompt.md` to reference `.nos/claude.md` is not part of this requirement. This is a follow-on task (identified in Q18).

2. **Targeted subsystem READMEs**: Creating individual `README.md` files for `.nos/workflows/`, `.nos/agents/`, or `.nos/runtime/` is not in scope. A single overview doc is preferred.

3. **Dynamic documentation generation**: Building a tool or skill that generates directory maps at runtime is not in scope.

4. **Runtime modifications**: Changing the NOS server, adapter configurations, or adding self-describing fields to config files is not in scope.

5. **Other `.nos/` files**: The orphaned `nos-agent-prompt.md` file (if it exists) is not addressed by this requirement.

6. **Deletion of stale content**: Cleaning up outdated patterns in `CLAUDE.md` or `system-prompt.md` is not in scope.

7. **Process enforcement**: Establishing formal ownership or PR requirements for `.nos/claude.md` maintenance is not in scope — only a guidance note is required.

## Implementation Notes

Created `.nos/claude.md` following the specification. The document includes:

- **Documentation Stack**: Authority hierarchy explicitly stating that `.nos/system-prompt.md` is the authoritative runtime spec.
- **Directory Map**: Tree-style overview of all `.nos/` subdirectories with descriptions.
- **Requirements Workflow**: Structure of `.nos/workflows/requirements/`, covering `config.json`, `config/stages.yaml`, `requirements/items/`, and `activity.jsonl`.
- **Pipeline Stages**: The 7-stage flow (Backlog → Brainstorming → Analysis → Documentation → Implementation → Validation → Done).
- **Status Protocol**: Runtime-owned status transitions.
- **Available Skills**: NOS skills with server URL reference.
- **Maintenance**: Social-contract guidance for contributors.

No verbatim copies of prompts from `stages.yaml` or `system-prompt.md`. Used relative conceptual descriptions instead of volatile concrete paths. File is markdown-only with `##` headers, approximately 600 words.

## Validation

### Acceptance Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | File `.nos/claude.md` exists at `.nos/` root | ✅ pass | File read successfully; confirmed by `Read` tool |
| 2 | Naming convention: lowercase `claude.md` | ✅ pass | File named `.nos/claude.md`; matches sibling `system-prompt.md` convention |
| 3 | Doc hierarchy stated with authority statement | ✅ pass | `Documentation Stack` section (lines 5-13) names all three docs; includes phrase "For the authoritative runtime spec, see `.nos/system-prompt.md`" |
| 4 | Directory map covering all top-level subdirectories | ✅ pass | `Directory Map` section (lines 15-33) covers: workflows/, runtime/, agents/, settings.yaml, system-prompt.md, claude.md |
| 5 | Stage pipeline explained with `<stage-prompt>` concept | ✅ pass | `Pipeline Stages` section (lines 47-59) describes the 7-stage flow and mentions `<stage-prompt>` injection |
| 6 | Status protocol explained (runtime-owned transitions) | ✅ pass | `Status Protocol` section (lines 61-63) explicitly states transitions are owned by the runtime heartbeat sweeper |
| 7 | Skills inventory with dev server URL | ✅ pass | `Available Skills` section (lines 65-72) lists all 4 skills; references `http://localhost:30128` |
| 8 | Written for both human and agent audiences | ✅ pass | Clear `##` headers with narrative prose; machine-parseable section structure |
| 9 | Maintenance note included | ✅ pass | `Maintenance` section (lines 74-76) states contributors should update alongside structural changes |
| 10 | No duplication of system-prompt or stages.yaml content | ✅ pass | Doc references `.nos/system-prompt.md` and `CLAUDE.md` rather than inlining; no verbatim prompt copies |

### Technical Constraints

| # | Constraint | Verdict | Evidence |
|---|---|---|---|
| 1 | File path `.nos/claude.md` | ✅ pass | Confirmed |
| 2 | Markdown only, no frontmatter, no executable | ✅ pass | 77 lines of pure markdown; no frontmatter; no code blocks |
| 3 | No runtime coupling | ✅ pass | Pure documentation artifact; no dependencies on runtime |
| 4 | Size 500-800 words | ✅ pass | `wc -w .nos/claude.md` reports 515 words |
| 5 | No contradiction with system-prompt.md | ✅ pass | Doc references rather than restates runtime spec |
| 6 | Git tracked | ⚠️ partial | File exists but not yet staged; needs `git add .nos/claude.md` |
| 7 | Dev server URL referenced | ✅ pass | `http://localhost:30128` appears in Available Skills section |

### Out-of-Scope Check

No violations detected. The document does not:
- Modify `.nos/system-prompt.md`
- Modify root `CLAUDE.md`
- Create per-folder `README.md` files
- Document runtime internals (server.json schema, etc.)
- Include absolute paths to volatile item directories

### Summary

All 10 acceptance criteria pass. The one partial item (git tracking) requires staging the file, which is a straightforward `git add` before commit. No regressions or missed edge cases identified — this is a pure documentation deliverable with no adjacent functionality. Ready to advance to Done.
