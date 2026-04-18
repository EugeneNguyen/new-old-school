---
name: nos-comment-item
description: >-
  Append a comment to a NOS workflow item's `meta.yml > comments` list via the
  running NOS dev server.
disable-model-invocation: true
argument-hint: "--workflow <id> --item <itemId> --text <comment>"
---

# nos-comment-item

Append a plain-string comment to an item's comment list. The current schema
keeps comments as `string[]` (no author, no timestamp, no threading).

## Execution

```
node .claude/skills/nos-comment-item/nos-comment-item.mjs \
  --workflow <workflowId> \
  --item <itemId> \
  --text "<comment body>"
```

## Arguments

- `--workflow <id>` (required).
- `--item <itemId>` (required).
- `--text <string>` (required) — non-empty after trim.

## Base URL

Reads `NOS_BASE_URL` (default `http://localhost:30128`). Server must be running.

## Success output

Prints `ok` on stdout and exits `0`.

## Errors

Codes: `missing_args`, `empty_comment`, `server_unreachable`,
`workflow_not_found`, `item_not_found`, `http_error`.

## Notes

- Underlying call: `POST /api/workflows/<id>/items/<itemId>/comments`
  with `{ text }`.
- Duplicates are **not** deduped; repeated identical calls append multiple
  entries (matches the underlying store).
- No locking; concurrent calls on the same item may race.
