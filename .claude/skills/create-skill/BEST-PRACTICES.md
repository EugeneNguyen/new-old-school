# Skill Authoring Best Practices

## Contents
- Writing effective descriptions
- Structuring skill content
- Progressive disclosure
- Workflows and feedback loops
- Common patterns
- Anti-patterns to avoid

## Writing effective descriptions

- Write in **third person**: "Processes files" not "I process files"
- Include **what it does** AND **when to use it**
- Front-load the key use case (combined description + when_to_use capped at 1,536 chars)
- Include keywords users would naturally say

Good:
```yaml
description: Extracts text and tables from PDF files, fills forms, merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
```

Bad:
```yaml
description: Helps with documents
```

## Structuring skill content

- Keep SKILL.md body **under 500 lines**
- Only add context Claude **doesn't already know**
- Match specificity to task fragility:
  - **High freedom**: multiple approaches valid, use text instructions
  - **Medium freedom**: preferred pattern exists, use pseudocode/scripts with params
  - **Low freedom**: operations are fragile, provide exact scripts

## Progressive disclosure

- SKILL.md = overview and navigation (Level 2, loaded when triggered)
- Reference files = detailed docs (Level 3, loaded as needed)
- Scripts = utility code (Level 3, executed not loaded)
- Keep references **one level deep** from SKILL.md
- For files >100 lines, include a table of contents

## Workflows and feedback loops

For complex tasks, provide checklists:
```
Task Progress:
- [ ] Step 1: Analyze
- [ ] Step 2: Plan
- [ ] Step 3: Execute
- [ ] Step 4: Validate
- [ ] Step 5: Verify
```

Use validation loops: run validator -> fix errors -> repeat.

## Common patterns

### Template pattern
Provide output templates. Match strictness to requirements.

### Examples pattern
Provide input/output pairs for style-dependent output.

### Conditional workflow
Guide through decision points: "Creating new? -> follow A. Editing? -> follow B."

### Dynamic context injection
Use `` !`command` `` to inject live data before Claude sees the prompt.

## Anti-patterns to avoid

- Windows-style paths (use forward slashes)
- Too many options without a default
- Time-sensitive information without "old patterns" section
- Inconsistent terminology
- Deeply nested file references
- Vague names: `helper`, `utils`, `tools`
- Over-explaining what Claude already knows
- Magic numbers in scripts without justification
