---
name: req-pipeline
description: >-
  Processes a new requirement through the full lifecycle: analyzes it, documents it
  following the project's requirement management structure (TSV index + markdown detail +
  JSON metadata in docs/requirements/), then implements it in code. Use when the user
  provides a new feature request, requirement, or spec to be added and built.
disable-model-invocation: true
argument-hint: "[requirement description]"
---

# Requirement Pipeline

Analyze, document, and implement a requirement end-to-end.

## Input

`$ARGUMENTS` — the requirement description provided by the user. If empty, ask the user to describe the requirement.

## Workflow

Track progress with this checklist:

```
Pipeline Progress:
- [ ] Phase 1: Analyze requirement
- [ ] Phase 2: Assign ID and document
- [ ] Phase 3: Plan implementation
- [ ] Phase 4: Implement
- [ ] Phase 5: Validate and update status
```

### Phase 1: Analyze Requirement

1. Parse the user's input to extract:
   - **Core intent**: What the user actually needs.
   - **Acceptance criteria**: Concrete, testable conditions for "done".
   - **Technical constraints**: Framework, compatibility, performance limits.
   - **Priority**: Infer from urgency cues or ask (Critical / High / Medium / Low).
   - **Category**: Feature, Bug, or TechnicalDebt.
2. Present the analysis to the user for confirmation before proceeding.

### Phase 2: Assign ID and Document

Follow the project's requirement management structure in `docs/requirements/`.

1. **Read `docs/requirements/requirements.tsv`** to determine the next ID (e.g., if REQ-004 exists, next is REQ-005).
2. **Add a row** to `requirements.tsv`:
   ```
   REQ-NNN\tTitle\tIn-Progress\tYYYY-MM-DD
   ```
3. **Create `docs/requirements/REQ-NNN.md`** with this structure:
   ```markdown
   # REQ-NNN: Title

   ## Description
   High-level summary of the requirement.

   ## Acceptance Criteria
   - [ ] Criterion 1
   - [ ] Criterion 2
   - [ ] ...

   ## Technical Constraints
   - Constraint 1
   - Constraint 2
   ```
4. **Create `docs/requirements/REQ-NNN.json`** with this schema:
   ```json
   {
     "id": "REQ-NNN",
     "priority": "High|Medium|Low|Critical",
     "category": "Feature|Bug|TechnicalDebt",
     "createdAt": "ISO-8601",
     "updatedAt": "ISO-8601"
   }
   ```

### Phase 3: Plan Implementation

1. **Explore the codebase** to understand:
   - Existing patterns and conventions (see [PROJECT-CONTEXT.md](PROJECT-CONTEXT.md)).
   - Which files need to change or be created.
   - Impact on existing functionality.
2. **Enter plan mode** (`EnterPlanMode`) to design the implementation approach.
3. Get user approval before writing code.

### Phase 4: Implement

1. Write the code following project conventions:
   - TypeScript with `@/*` path aliases.
   - Next.js App Router for pages/API routes.
   - shadcn/ui + Tailwind for UI components.
   - Update `config/tools.json` if adding a new tool/page.
2. Check acceptance criteria off as each is satisfied in the `.md` file.
3. Run the dev server and verify the feature works in the browser when UI changes are involved.

### Phase 5: Validate and Update Status

1. **Run build**: `npm run build` — fix any errors.
2. **Update requirement docs**:
   - Mark all acceptance criteria as `[x]` in `REQ-NNN.md`.
   - Change status to `Completed` in `requirements.tsv`.
   - Update `updatedAt` in `REQ-NNN.json`.
3. **Commit** with message format: `Implement REQ-NNN: Title.`
   - Only commit if the user asks.

## Reference

For project structure and conventions, see [PROJECT-CONTEXT.md](PROJECT-CONTEXT.md).