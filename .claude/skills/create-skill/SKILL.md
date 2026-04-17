---
name: create-skill
description: Scaffolds new Claude Code skills with proper structure, frontmatter, and best practices. Use when creating a new skill, adding a slash command, or setting up a SKILL.md file.
argument-hint: "[skill-name] [optional: description]"
disable-model-invocation: true
---

# Create Skill

Scaffold a new Claude Code skill with proper structure and best practices.

## Workflow

1. **Gather requirements** from arguments or ask the user:
   - Skill name (lowercase, hyphens, max 64 chars, no "anthropic" or "claude")
   - Description (what it does AND when to trigger it, max 1024 chars)
   - Scope: project (`.claude/skills/`) or personal (`~/.claude/skills/`)
   - Type: reference, task, or visual (determines template)

2. **Choose the right template** based on type:
   - **Reference**: Background knowledge Claude applies inline (conventions, patterns, domain knowledge)
   - **Task**: Step-by-step workflow, usually invoked manually with `/name` (`disable-model-invocation: true`)
   - **Visual**: Generates HTML/visual output via bundled scripts

3. **Create the skill directory and files**:
   ```
   <scope-path>/<skill-name>/
   ├── SKILL.md           # Required: frontmatter + instructions
   ├── [reference files]   # Optional: detailed docs loaded on-demand
   └── scripts/            # Optional: utility scripts executed by Claude
   ```

4. **Write SKILL.md** with proper YAML frontmatter and content.

5. **Verify** the skill appears in the available skills list.

## Frontmatter fields

For the complete frontmatter reference with all fields and their descriptions, see [FRONTMATTER-REFERENCE.md](FRONTMATTER-REFERENCE.md).

## Templates

Use these as starting points. Read the appropriate template file:

| Type | Template | When to use |
|------|----------|-------------|
| Reference | [templates/reference.md](templates/reference.md) | Conventions, patterns, domain knowledge |
| Task | [templates/task.md](templates/task.md) | Deployments, commits, multi-step workflows |
| Visual | [templates/visual.md](templates/visual.md) | HTML reports, diagrams, visualizations |
| Basic | [templates/basic.md](templates/basic.md) | Simple skills with minimal config |

## Best practices

For detailed authoring guidance, see [BEST-PRACTICES.md](BEST-PRACTICES.md).

Key rules:
- Write descriptions in **third person** ("Processes files", not "I process files")
- Keep SKILL.md body **under 500 lines**; split large content into separate files
- Use **progressive disclosure**: SKILL.md is the overview, reference files hold details
- Reference files should be **one level deep** from SKILL.md (no nested chains)
- For files over 100 lines, include a **table of contents**
- Use **forward slashes** in all file paths
- Only include context Claude **doesn't already know**
- Prefer **bundled scripts** over asking Claude to generate code

## Argument parsing

If invoked as `/create-skill my-skill-name A description here`:
- `$ARGUMENTS[0]` → skill name
- Remaining args → initial description

If no arguments provided, ask the user interactively.

## After creation

Remind the user:
- The skill is live immediately (no restart needed for existing skill directories)
- Test with `/skill-name` or by asking something that matches the description
- Iterate: observe Claude's behavior, refine instructions
