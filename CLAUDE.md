# nos Project Guide

## Workflows
When the user refers to "workflows", this relates to the `.nos/workflows/` directory.

When the user refers to the **"system prompt of nos"** (or any phrasing of it), that means the file at `.nos/system-prompt.md`.

### Workflow Item Status Protocol
Status transitions (`Todo` → `In Progress` → `Done`) are owned by the NOS runtime (the heartbeat sweeper in `lib/auto-advance-sweeper.ts` + `lib/auto-advance.ts`). Stage agents do **not** set status themselves — the runtime flips `In Progress` when it triggers a session and `Done` once the session's log file goes idle, attaching the agent's final output as a summary comment. Agents just do the stage work and end with a one-paragraph summary as their final message; prefix it with `FAILED:` if the stage work genuinely cannot be completed.

## CEO Agent Framework
The primary agent can act as a **CEO Agent (Recursive Orchestrator)** for complex tasks.

### Operational Protocol
1. **Decomposition**: Break requests into MECE sub-tasks.
2. **Resource Allocation**: Assign tasks to `Explore`, `Plan`, or `general-purpose` agents.
3. **Deployment**: Spawn agents in parallel using the **Worker Prompt Template**.
4. **Aggregation**: Track progress via a Project Ledger.
5. **Synthesis**: Cross-reference all results for a final unified answer.

### Worker Prompt Template
- **ROLE**: Specialized identity.
- **CONTEXT**: High-level project goal.
- **SPECIFIC OBJECTIVE**: Exact task assigned.
- **DEFINITION OF DONE**: Requirement checklist.
- **CONSTRAINTS**: Specific limits (e.g., "Read-only").

---

## Requirement Management Skill: `manage-requirements`
When asked to add, update, or track requirements, follow this strict structure in `docs/requirements/`.

### 1. The Index (`requirements.tsv`)
Maintain a Tab-Separated Values file acting as the source of truth.
Columns: `ID` | `Title` | `Status` (Pending/In-Progress/Completed) | `Last Updated`

### 2. Requirement Detail (`[ID].md`)
For every requirement ID, there must be a corresponding markdown file.
Content: Detailed explanation, user stories, acceptance criteria, and technical constraints.

### 3. Requirement Metadata (`[ID].json`)
For every requirement ID, there must be a corresponding JSON file.
Schema:
```json
{
  "id": "string",
  "priority": "High|Medium|Low",
  "category": "Feature|Bug|TechnicalDebt",
  "createdAt": "ISO-Date",
  "updatedAt": "ISO-Date"
}
```

### Workflow
- **Adding a requirement**: 
  1. Assign a unique ID (e.g., REQ-001).
  2. Add a row to `requirements.tsv`.
  3. Create `[ID].md` and `[ID].json`.
- **Updating**: Update the status in `.tsv` and the content in `.md`/`.json`.

