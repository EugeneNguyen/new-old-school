# ADR-002: Claude CLI as Agent Adapter

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

NOS needs to execute AI agents against workflow items. Agents receive a structured prompt (system + member + stage + item content) and produce output that gets captured as session logs and summary comments.

## Decision

Use the Claude Code CLI (`claude`) as the primary agent adapter, spawning it as a child process. The adapter extracts session IDs from the CLI's JSON stream output and captures stdout/stderr to session files.

## Consequences

**Positive:**
- Leverages existing Claude Code infrastructure (authentication, model selection, tool access)
- No direct API key management needed
- Agents get full Claude Code capabilities (file access, bash, web search, etc.)
- Session output naturally captured as files

**Negative:**
- Depends on Claude Code CLI being installed and authenticated
- Child process management adds complexity (10s session ID timeout, stream registry cleanup)
- Limited to models available through Claude Code
- Harder to test in CI without Claude Code installed

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Direct Anthropic API | Would need API key management, lose Claude Code tool access, more complex streaming |
| OpenAI-compatible adapter | Scope creep; Claude Code is the primary use case |
| In-process LLM | Not feasible for model sizes needed |
