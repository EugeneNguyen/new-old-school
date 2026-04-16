# nos Project Guide

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
