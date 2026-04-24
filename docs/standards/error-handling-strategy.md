# Error Handling & Logging Strategy

> Last updated: 2026-04-24 (updated to reflect resolved audit gaps)

---

## Error Taxonomy

### API Error Types

| Error Type | HTTP Code | When Used | User-Facing? |
|-----------|-----------|-----------|-------------|
| `ValidationError` | 400 | Invalid JSON body, missing required fields, pattern mismatch | Yes (toast) |
| `NotFoundError` | 404 | Workflow/item/agent/stage not found | Yes (toast) |
| `ConflictError` | 409 | Duplicate ID, agent still referenced, stage has items | Yes (toast) |
| `InternalError` | 500 | Unexpected server errors, filesystem failures | Yes (generic toast) |

### Error Response Shape

All API errors use `createErrorResponse()` from `app/api/utils/errors.ts`:

```json
{
  "error": "ValidationError",
  "message": "Title is required",
  "code": 400,
  "timestamp": "2026-04-21T12:00:00.000Z"
}
```

Implementation uses `NextResponse.json()` for consistent headers and serialization.

### Client-Side Error Handling

| Error Type | Handling |
|-----------|----------|
| Network failure | Toast notification; no automatic retry |
| HTTP 4xx | Toast with error message from response body |
| HTTP 5xx | Generic "Something went wrong" toast |
| Component render error | Caught by nearest `error.tsx` boundary |
| Unhandled rejection | Falls through to root error boundary |

---

## Log Levels

### Middleware Logging

The `middleware.ts` logs all API requests:

```
[2026-04-21T12:00:00.000Z] GET /api/workflows
[2026-04-21T12:00:00.000Z] POST /api/workflows/requirements/items
```

Fields: timestamp, HTTP method, URL path.

### Activity Logging

The activity JSONL (`activity.jsonl`) records workflow mutations:

| Entry Type | Fields | Purpose |
|-----------|--------|--------|
| `title-changed` | itemId, before, after | Track title edits |
| `stage-changed` | itemId, before, after | Track stage moves |
| `status-changed` | itemId, before, after | Track status transitions |
| `body-changed` | itemId, beforeHash, afterHash, lengthDiff | Track content edits (hashed for privacy) |
| `routine-item-created` | itemId, workflowId | Track routine-created items |
| `restart` | itemId, before (stage), after (first stage) | Track item restarts |

### Console Logging

- **Stage pipeline**: Logs pipeline triggers, agent spawning, session IDs
- **Auto-advance sweeper**: Logs sweep start/end, items processed
- **Agent adapter**: Logs session start, process spawn, output capture

---

## What Gets Surfaced to Users

| Event | User Notification | Silent Log |
|-------|-------------------|------------|
| Item created | Toast (success) | Activity JSONL |
| Item updated | Toast (success) | Activity JSONL |
| Item deleted | Toast (success) | Activity JSONL |
| Validation error | Toast (error message) | Middleware log |
| Not found | Toast (error message) | Middleware log |
| Agent session started | Green dot indicator | Console + activity log |
| Agent session completed | Comment on item | Console + activity log |
| Agent session failed | FAILED: comment on item | Console + activity log |
| Filesystem error | Generic error toast | Console error |
| Malformed JSON body | Toast ("Invalid JSON body") | Middleware log |

---

## What Gets Logged Silently

| Event | Log Destination |
|-------|-----------------|
| API request metadata | Middleware (stdout) |
| Activity mutations | `activity.jsonl` |
| Pipeline execution | Console (stdout) |
| Heartbeat sweep cycles | Console (stdout) |
| File watch events | Console (stdout) |
| Session output | `.claude/sessions/<id>.txt` |

---

## Alerting Thresholds

NOS is a local-only tool with no external alerting infrastructure.

| Condition | Current Behavior | Recommended |
|-----------|-----------------|-------------|
| Agent session fails | FAILED: prefix in summary comment | Sufficient for local use |
| Heartbeat sweep error | Console error | Sufficient for local use |
| Filesystem write failure | 500 error to client | Add retry with exponential backoff |
| Stale session (>30min) | Detected by sweeper | Consider adding a dashboard warning indicator |

---

## Correlation ID Conventions

### Current State
- **No correlation IDs** are implemented across API requests
- Session IDs serve as a partial correlation mechanism for agent execution flows
- Activity log entries include `itemId` for per-item correlation

### Recommended Approach
If correlation IDs were added:

1. Generate UUID per API request in middleware
2. Pass via `X-Request-Id` header
3. Include in all log entries and error responses
4. Thread through `AsyncLocalStorage` alongside workspace context

Priority: Low (single-user local tool; request volume is minimal)

---

## Error Recovery Patterns

| Scenario | Recovery |
|----------|---------|
| Partial file write | Atomic write pattern (temp + rename) prevents corruption |
| Stale `.tmp` files | Overwritten on next write to same path |
| Dead agent session | Heartbeat sweeper detects and marks Done |
| Failed stage pipeline | Item stays as Todo; operator can re-trigger |
| Corrupted YAML | `js-yaml` throws; caught and returned as 500 |
| Missing `.nos/` directory | Created on first write (store functions) |
| Item restart at first stage | No-op: API returns 400 when item already at first stage with Todo status |
| File preview too large | 100MB guard: FileViewer shows metadata card instead of loading binary content |
| Workspace path escape | API returns 400 when browse/serve/preview path escapes workspace root (path-separator suffix check) |

## Process-Level Error Handling

The NOS server installs process-level error handlers during startup (via `instrumentation.ts`) for resilience:

| Event | Handler Action | Process Exit? |
|-------|----------------|---------------|
| `uncaughtException` | Log `[UNCAUGHT]` + stack trace to `~/.nos/runtime/server.log` + stderr | No (best-effort) |
| `unhandledRejection` | Log `[UNHANDLED]` + reason to `~/.nos/runtime/server.log` + stderr | No (best-effort) |

The handlers do **not** terminate the process — this is intentional for a local dev tool. The goal is graceful degradation rather than hard crash.

Heartbeat sweeper self-healing:
- If `readHeartbeatMs()` throws, falls back to 60 000 ms
- If `tick()` rejects, catches the error and reschedules anyway
- Logs `[heartbeat] next tick in Xms` after every schedule call

Health-check endpoint (`GET /api/health`):
- Returns `{ status: "ok", uptime: <seconds>, heartbeat: { lastTickAt, nextTickIn, stale } }`
- `stale: true` when last tick was more than 3× the heartbeat interval ago
- Used by the CLI TUI for auto-restart detection
