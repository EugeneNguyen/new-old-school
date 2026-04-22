# ADR-007: YAML Metadata + Markdown Content Split

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

Workflow items and agents need both structured metadata (title, status, stage, comments, sessions) and free-form content (body text, prompt templates). The storage format must be human-readable, editable, and work well with version control.

## Decision

Split each entity into two files:
- `meta.yml` u2014 Structured metadata in YAML (parsed with `js-yaml`)
- `index.md` u2014 Free-form content in Markdown

This applies to both workflow items (`.nos/workflows/<id>/items/<itemId>/`) and agents (`.nos/agents/<id>/`).

## Consequences

**Positive:**
- Metadata is structured and type-safe when parsed; content is free-form
- Both files are human-readable and editable in any text editor
- Git diffs are clean u2014 metadata changes don't pollute content diffs and vice versa
- Markdown content can be rendered directly in the dashboard
- YAML is widely supported and familiar to operators

**Negative:**
- Two files per entity means more filesystem operations (two reads, two writes)
- YAML parsing is slower than JSON (mitigated by small file sizes)
- Mixed format project (YAML for metadata, JSON for config) u2014 see GAP-07

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Single JSON file | Markdown in JSON requires escaping; poor editing experience |
| Frontmatter in Markdown | Mixing structured data with content; harder to parse reliably |
| Single YAML file | Multi-line content in YAML is awkward; Markdown files more natural |
