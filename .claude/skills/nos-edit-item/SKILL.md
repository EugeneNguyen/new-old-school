---
name: nos-edit-item
description: >-
  Edit a NOS workflow item's title and/or markdown body via the running NOS
  dev server. Use when an agent needs to refine an item's spec in place.
disable-model-invocation: false
argument-hint: "--workflow <id> --item <itemId> [--title <title>] [--body <markdown>]"
---

# nos-edit-item

Update a workflow item's title and/or `index.md` body. At least one of
`--title` or `--body` must be provided. Body edits are **full replacements**
of `index.md` — append mode is not supported in this iteration.

## Execution

```
node .claude/skills/nos-edit-item/nos-edit-item.mjs \
  --workflow <workflowId> \
  --item <itemId> \
  [--title "<new title>"] \
  [--body "<new full markdown body>"]
```

## Arguments

- `--workflow <id>` (required) — target workflow id.
- `--item <itemId>` (required) — existing item id (e.g. `REQ-00017`).
- `--title <string>` (optional) — new title.
- `--body <string>` (optional) — full markdown body that replaces `index.md`.

At least one of `--title` / `--body` is required; otherwise the skill exits
non-zero with `missing_args` and message `no fields to update`.

## Base URL

Reads `NOS_BASE_URL` (default `http://localhost:30128`). The Next.js server
must be running.

## Success output

Prints `ok` on stdout and exits `0`.

## Errors

On failure, writes a single JSON object to stderr and exits non-zero:

```
{"error": "<code>", "message": "<human>"}
```

Codes: `missing_args`, `server_unreachable`, `workflow_not_found`,
`item_not_found`, `http_error`.

## Notes

- Title updates go through `PATCH /api/workflows/<id>/items/<itemId>`.
- Body updates go through `PUT /api/workflows/<id>/items/<itemId>/content`.
- No locking; concurrent calls on the same item may race.
