# ADR-003: SSE Over WebSockets for Real-Time Events

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

The dashboard needs real-time updates when workflow items change (status transitions, stage moves, content edits, external file changes). The communication is uni-directional: server pushes events to the client.

## Decision

Use Server-Sent Events (SSE) via the `/api/workflows/[id]/events` and `/api/activity/events` endpoints. An `EventEmitter`-based broker connects internal mutations and chokidar file-watch events to SSE consumers.

## Consequences

**Positive:**
- Simple implementation; native browser `EventSource` API
- Uni-directional (server-to-client) matches the use case exactly
- Works with Next.js API routes without additional infrastructure
- Auto-reconnection built into the EventSource spec
- Lower complexity than WebSocket connection management

**Negative:**
- Text-only protocol (JSON serialized per event)
- No client-to-server channel (mutations use separate HTTP calls)
- Limited to ~6 concurrent connections per domain in some browsers
- No binary data support (not needed for this use case)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| WebSockets | Bi-directional not needed; more complex server setup |
| Long polling | Higher latency and request overhead |
| Socket.io | Heavy dependency; SSE sufficient for the use case |
