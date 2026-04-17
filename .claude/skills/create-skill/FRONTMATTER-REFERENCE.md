# Frontmatter Reference

All YAML frontmatter fields for SKILL.md files.

## Contents
- Required/recommended fields
- Invocation control
- Execution control
- String substitutions

## Required/Recommended fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No (defaults to dir name) | Lowercase letters, numbers, hyphens. Max 64 chars. No "anthropic" or "claude". |
| `description` | Recommended | What it does and when to use it. Max 1024 chars. Third person. |
| `when_to_use` | No | Additional trigger context. Appended to description (combined cap: 1536 chars). |
| `argument-hint` | No | Shown during autocomplete. E.g., `[issue-number]` or `[filename] [format]`. |

## Invocation control

| Field | Default | Description |
|-------|---------|-------------|
| `disable-model-invocation` | `false` | `true` = only user can invoke via `/name`. Removes from Claude's context. |
| `user-invocable` | `true` | `false` = hidden from `/` menu. Only Claude can invoke. |

Combination effects:

| Frontmatter | User can invoke | Claude can invoke | Description in context |
|-------------|-----------------|-------------------|------------------------|
| (default) | Yes | Yes | Yes |
| `disable-model-invocation: true` | Yes | No | No |
| `user-invocable: false` | No | Yes | Yes |

## Execution control

| Field | Default | Description |
|-------|---------|-------------|
| `allowed-tools` | (none) | Tools Claude can use without permission prompts. Space-separated or YAML list. |
| `model` | (inherited) | Override model for this skill. |
| `effort` | (inherited) | Effort level: `low`, `medium`, `high`, `xhigh`, `max`. |
| `context` | (inline) | `fork` = run in isolated subagent context. |
| `agent` | `general-purpose` | Subagent type when `context: fork`. Options: `Explore`, `Plan`, `general-purpose`, or custom. |
| `hooks` | (none) | Hooks scoped to this skill's lifecycle. |
| `paths` | (none) | Glob patterns limiting when skill auto-activates. |
| `shell` | `bash` | Shell for inline commands. `bash` or `powershell`. |

## String substitutions

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed to the skill. |
| `$ARGUMENTS[N]` / `$N` | Specific argument by 0-based index. |
| `${CLAUDE_SESSION_ID}` | Current session ID. |
| `${CLAUDE_SKILL_DIR}` | Directory containing this SKILL.md. |

Shell-style quoting applies: wrap multi-word values in quotes.

## Dynamic context injection

Use `` !`command` `` to run shell commands before content is sent to Claude:

```yaml
---
name: pr-summary
context: fork
agent: Explore
---

## PR Context
- Diff: !`gh pr diff`
- Comments: !`gh pr view --comments`
```

For multi-line commands, use a fenced block opened with ` ```! `.
