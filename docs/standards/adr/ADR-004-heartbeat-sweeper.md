# ADR-004: Heartbeat Sweeper for Session Lifecycle

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

Agent sessions are external processes (Claude CLI) that may complete, crash, or hang without cleanly notifying the NOS server. Items stuck in "In Progress" with dead sessions need to be detected and resolved.

## Decision

Implement a periodic heartbeat sweeper (`auto-advance-sweeper.ts`) that runs every N milliseconds (configurable, default 60s). On each tick it:
1. Checks all in-progress sessions for completion (via session log file staleness)
2. Marks completed sessions as Done and attaches the agent's final output as a comment
3. Auto-advances Done items to the next stage if `autoAdvanceOnComplete` is set
4. Auto-starts eligible Todo items that have no session for their current stage

## Consequences

**Positive:**
- Catches stranded sessions that event-triggered completion misses
- Provides a reliable fallback for crash recovery
- Drives the full auto-advance pipeline without manual intervention
- Configurable interval via settings API

**Negative:**
- Latency between session completion and detection (up to heartbeat interval)
- CPU overhead from periodic filesystem scanning (mitigated by local SSD, small file counts)
- Potential race with event-triggered completion (resolved by idempotent status updates)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Process exit handler only | Doesn't catch crashes, OOM kills, or process.exit(1) |
| File watcher (inotify) | Platform-dependent; doesn't handle session log staleness |
| Event-triggered only | Misses edge cases where events aren't emitted (external edits, crashes) |
