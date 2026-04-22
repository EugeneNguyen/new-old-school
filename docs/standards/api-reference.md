# API Reference

> Last updated: 2026-04-21

All endpoints are served from `localhost:30128`. Workspace context is resolved from the `nos_workspace` cookie via the `withWorkspace()` wrapper.

---

## Error Response Shape

All errors use `createErrorResponse()` and return:

```json
{
  "error": "ErrorType",
  "message": "Human-readable description",
  "code": 400,
  "timestamp": "2026-04-21T12:00:00.000Z"
}
```

Error types: `ValidationError`, `NotFoundError`, `ConflictError`, `InternalError`

---

## Workflows

### `GET /api/workflows`
List all workflows in the current workspace.

- **Auth**: None (local only)
- **Response**: `200 OK`
```json
[
  { "id": "requirements", "name": "Requirements", "idPrefix": "REQ" }
]
```

### `POST /api/workflows`
Create a new workflow.

- **Request Body**:
```json
{
  "id": "requirements",
  "name": "Requirements",
  "idPrefix": "REQ"
}
```
- **Validation**: `id` matches `^[a-z0-9][a-z0-9_-]{0,63}$`, `name` required (max 128 chars), `idPrefix` matches `^[A-Z0-9][A-Z0-9_-]{0,15}$`
- **Response**: `201 Created` with workflow object
- **Errors**: `400` (validation), `409` (workflow already exists)

### `GET /api/workflows/[id]`
Get workflow detail including stages and items.

- **Response**: `200 OK`
```json
{
  "id": "requirements",
  "name": "Requirements",
  "stages": [...],
  "items": [...]
}
```
- **Errors**: `404` (workflow not found)

### `PATCH /api/workflows/[id]`
Update workflow metadata.

- **Request Body**: Partial `{ "name": "...", "idPrefix": "..." }`
- **Response**: `200 OK` with updated workflow
- **Errors**: `400` (invalid JSON), `404`

### `DELETE /api/workflows/[id]`
Delete a workflow and all its items.

- **Response**: `204 No Content`
- **Errors**: `404`

---

## Items

### `GET /api/workflows/[id]/items`
List all items in a workflow.

- **Response**: `200 OK` with array of `WorkflowItem`

### `POST /api/workflows/[id]/items`
Create a new item. Triggers stage pipeline if stage has agent + prompt.

- **Request Body**:
```json
{
  "title": "Add dark mode",
  "stage": "Backlog"
}
```
- **Response**: `201 Created` with item object
- **Errors**: `400` (invalid JSON, missing title), `404` (workflow/stage not found), `500` (internal)

### `PATCH /api/workflows/[id]/items/[itemId]`
Update item title, stage, or status.

- **Request Body**: Partial `{ "title": "...", "stage": "...", "status": "Done" }`
- **Response**: `200 OK` with updated item
- **Errors**: `400` (invalid JSON), `404`

### `GET /api/workflows/[id]/items/[itemId]/content`
Read item body (Markdown content from `index.md`).

- **Response**: `200 OK`
```json
{ "content": "# Item body\n\nMarkdown content here" }
```

### `PUT /api/workflows/[id]/items/[itemId]/content`
Replace item body.

- **Request Body**:
```json
{ "content": "# Updated body" }
```
- **Response**: `200 OK`
- **Errors**: `400` (invalid JSON), `404`

---

## Comments

### `GET /api/workflows/[id]/items/[itemId]/comments`
List all comments on an item.

- **Response**: `200 OK` with string array

### `POST /api/workflows/[id]/items/[itemId]/comments`
Append a comment.

- **Request Body**: `{ "text": "Comment content" }`
- **Response**: `201 Created`
- **Errors**: `400` (invalid JSON)

### `PATCH /api/workflows/[id]/items/[itemId]/comments/[index]`
Update a comment by index.

- **Request Body**: `{ "text": "Updated comment" }`
- **Response**: `200 OK`
- **Errors**: `400` (invalid JSON), `404` (index out of range)

### `DELETE /api/workflows/[id]/items/[itemId]/comments/[index]`
Delete a comment by index.

- **Response**: `204 No Content`
- **Errors**: `400` (invalid JSON), `404`

---

## Stages

### `GET /api/workflows/[id]/stages`
List all stages for a workflow (ordered).

- **Response**: `200 OK` with Stage array

### `POST /api/workflows/[id]/stages`
Add a new stage.

- **Request Body**:
```json
{
  "name": "Review",
  "description": "Code review stage",
  "prompt": "Review the code changes...",
  "agentId": "reviewer",
  "autoAdvanceOnComplete": true,
  "maxDisplayItems": 10
}
```
- **Validation**: `name` matches `^[A-Za-z0-9 _-]+$`, max 64 chars, unique within workflow
- **Response**: `201 Created`
- **Errors**: `400` (validation), `409` (name exists)

### `PATCH /api/workflows/[id]/stages/[stageName]`
Update stage configuration.

- **Request Body**: Partial stage fields
- **Response**: `200 OK`
- **Errors**: `400` (invalid JSON), `404`

### `DELETE /api/workflows/[id]/stages/[stageName]`
Delete a stage (must have no items).

- **Response**: `204 No Content`
- **Errors**: `409` (stage has items), `404`

### `POST /api/workflows/[id]/stages/order`
Reorder stages.

- **Request Body**: `{ "order": ["Backlog", "Analysis", "Done"] }`
- **Validation**: Set of names must match existing stages exactly
- **Response**: `200 OK`
- **Errors**: `400` (set mismatch)

---

## Agents

### `GET /api/agents`
List all agents.

- **Response**: `200 OK` with Agent array

### `POST /api/agents`
Create a new agent.

- **Request Body**:
```json
{
  "displayName": "Code Reviewer",
  "adapter": "claude",
  "model": "opus",
  "prompt": "You are a code reviewer..."
}
```
- **ID generation**: Slugified from displayName (e.g., `code-reviewer`)
- **Response**: `201 Created`
- **Errors**: `400` (validation), `409` (slug conflict)

### `GET /api/agents/[id]`
Get agent detail.

- **Response**: `200 OK` with Agent object (includes prompt from `index.md`)
- **Errors**: `404`

### `PATCH /api/agents/[id]`
Update agent fields.

- **Response**: `200 OK`
- **Errors**: `400`, `404`

### `DELETE /api/agents/[id]`
Delete agent. Blocked if any stage references it.

- **Response**: `204 No Content`
- **Errors**: `404`, `409` (still referenced by stages)

---

## Activity

### `GET /api/activity`
Global activity log (across all workflows).

- **Query Params**: `limit` (default 50, clamped 1u2013500), `before` (ISO timestamp cursor)
- **Response**: `200 OK` with activity entry array

### `GET /api/activity/events`
SSE stream of real-time activity events.

- **Response**: `200 OK` with `text/event-stream` content type
- **Event format**: `data: {"type": "item-updated", ...}\n\n`

### `GET /api/workflows/[id]/activity`
Workflow-level activity log.

- **Query Params**: Same as global
- **Response**: `200 OK`

### `GET /api/workflows/[id]/items/[itemId]/activity`
Item-level activity log.

- **Query Params**: Same as global
- **Response**: `200 OK`

---

## Sessions & Chat

### `POST /api/chat`
Spawn a Claude CLI chat session.

- **Request Body**: `{ "message": "...", "model": "opus" }`
- **Response**: SSE stream of agent responses

### `POST /api/chat/stop`
Kill the active chat session.

- **Response**: `200 OK`

### `POST /api/chat/nos`
Spawn a NOS-specific agent chat (with system prompt and context).

- **Request Body**: `{ "message": "...", "model": "opus" }`
- **Response**: SSE stream

### `GET /api/claude/sessions`
List Claude sessions.

- **Response**: `200 OK` with SessionSummary array

### `POST /api/claude/sessions/[id]/stream`
Stream session output.

- **Response**: SSE stream of session events

### `GET /api/claude/sessions/[id]/status`
Check if session is still running.

- **Response**: `200 OK` with `{ "isRunning": true/false }`

---

## Settings

### `GET /api/settings/system-prompt`
Read the system prompt.

- **Response**: `200 OK` with `{ "content": "..." }`

### `PUT /api/settings/system-prompt`
Update the system prompt.

- **Request Body**: `{ "content": "..." }`
- **Response**: `200 OK`

### `GET /api/settings/heartbeat`
Read heartbeat interval.

- **Response**: `200 OK` with `{ "intervalMs": 60000 }`

### `PUT /api/settings/heartbeat`
Update heartbeat interval.

- **Request Body**: `{ "intervalMs": 60000 }`
- **Response**: `200 OK`

### `GET /api/settings/default-agent`
Read default agent config.

- **Response**: `200 OK` with `{ "adapter": "claude", "model": "opus" }`

### `PUT /api/settings/default-agent`
Update default agent config.

- **Request Body**: `{ "adapter": "claude", "model": "sonnet" }`
- **Response**: `200 OK`

---

## System

### `POST /api/shell`
Execute a shell command.

- **Request Body**: `{ "command": "ls -la" }`
- **Validation**: `command` must be a string (`typeof command !== 'string'`)
- **Response**: `200 OK` with `{ "output": "..." }`
- **Errors**: `400` (invalid JSON, non-string command)

### `GET /api/system`
System information.

- **Response**: `200 OK` with system details

### `GET /api/adapters`
List available agent adapters.

- **Response**: `200 OK` with adapter names

### `GET /api/adapters/[name]/models`
List models for an adapter.

- **Response**: `200 OK` with model list

---

## Workspaces

### `GET /api/workspaces`
List all workspaces.

- **Response**: `200 OK` with Workspace array

### `POST /api/workspaces`
Create a workspace.

- **Request Body**: `{ "name": "My Project", "absolutePath": "/path/to/project" }`
- **Response**: `201 Created`

### `DELETE /api/workspaces/[id]`
Delete a workspace.

- **Response**: `204 No Content`

### `POST /api/workspaces/[id]/activate`
Set active workspace (sets cookie).

- **Response**: `200 OK`

### `GET /api/workspaces/browse`
Browse filesystem directories.

- **Query Params**: `path` (directory to browse)
- **Response**: `200 OK` with directory listing

---

## Real-Time Events (SSE)

### `GET /api/workflows/[id]/events`
SSE stream for workflow item changes.

- **Content-Type**: `text/event-stream`
- **Events emitted**: `item-created`, `item-updated`, `item-deleted`, `item-activity`
- **Event data**: JSON-serialized WorkflowItem or activity entry
- **Reconnection**: Client uses `EventSource` with auto-reconnect
