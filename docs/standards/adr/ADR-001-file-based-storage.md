# ADR-001: File-Based Storage Over Database

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

NOS is a local-only workflow management tool. It needs to persist workflows, items, agents, settings, and activity logs. The system is designed for single-operator use on a local machine.

## Decision

Use the local filesystem as the sole persistence layer: YAML for metadata, Markdown for content, JSON for configuration, and JSONL for append-only activity logs. No external database.

## Consequences

**Positive:**
- Zero infrastructure dependencies; works anywhere Node.js runs
- Human-readable files; operators can inspect/edit with any text editor
- Git-friendly; workflow state can be version-controlled naturally
- Simple deployment; no database setup, migration, or connection management
- Agents can read/write files directly without API calls

**Negative:**
- No ACID transactions; relies on atomic write (temp + rename) for consistency
- No query engine; filtering/sorting done in application code
- Concurrent write safety limited to last-writer-wins (acceptable for single-user)
- Performance ceiling if item counts grow very large (thousands per workflow)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| SQLite | Adds a binary dependency; YAML/Markdown more readable for operators |
| PostgreSQL | Overkill for local tool; adds infrastructure burden |
| LevelDB / RocksDB | Key-value model less natural for structured workflow data |
