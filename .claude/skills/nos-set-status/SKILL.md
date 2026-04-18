---
name: nos-set-status
description: >-
  Change a NOS workflow item's status between `Todo`, `In Progress`, and
  `Done` via the running NOS dev server.
disable-model-invocation: true
argument-hint: "--workflow <id> --item <itemId> --status <Todo|In Progress|Done>"
---

# nos-set-status

Change the `status` field on a workflow item. This updates the Kanban view
but does **not** trigger the stage-pipeline — only stage changes and item
creation do.

## Execution

```
node .claude/skills/nos-set-status/nos-set-status.mjs \
  --workflow <workflowId> \
  --item <itemId> \
  --status "Todo" | "In Progress" | "Done"
```

## Arguments

- `--workflow <id>` (required).
- `--item <itemId>` (required).
- `--status <value>` (required) — one of `Todo`, `In Progress`, `Done`.

## Base URL

Reads `NOS_BASE_URL` (default `http://localhost:30128`). The Next.js server
must be running.

## Success output

Prints `ok` on stdout and exits `0`.

## Errors

On failure, writes a single JSON object to stderr and exits non-zero.
Codes: `missing_args`, `invalid_status`, `server_unreachable`,
`workflow_not_found`, `item_not_found`, `http_error`.

## Notes

- Underlying call: `PATCH /api/workflows/<id>/items/<itemId>` with `{ status }`.
- No locking; concurrent calls on the same item may race.
