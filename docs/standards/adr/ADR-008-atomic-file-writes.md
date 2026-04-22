# ADR-008: Atomic File Writes via Temp-and-Rename

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

NOS persists all state to the filesystem. A crash or power loss during a write could leave a file in a corrupt, partially-written state. Since there's no database providing ACID guarantees, the application must ensure write safety itself.

## Decision

All file writes use the temp-and-rename pattern:
1. Write content to `<path>.tmp`
2. Call `fs.rename('<path>.tmp', '<path>')` (atomic on POSIX filesystems)

This is implemented centrally in `atomicWriteFile()` in `workflow-store.ts`.

## Consequences

**Positive:**
- Readers never see a partially-written file u2014 they get the old version or the new version
- Simple to implement; no external dependencies
- Works reliably on macOS/Linux (POSIX rename semantics)
- Protects against Node.js process crashes during write

**Negative:**
- Not truly atomic on all filesystems (Windows, network mounts)
- Doesn't protect against concurrent writers (last-writer-wins, acceptable for single-user)
- Leaves `.tmp` files on crash (cleaned up on next write)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Write-ahead log | Over-engineered for single-user local tool |
| File locking (flock) | Adds complexity; single-user means no contention |
| SQLite | Would replace the entire storage model (see ADR-001) |
