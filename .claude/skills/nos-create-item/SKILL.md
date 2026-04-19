---
name: nos-create-item
description: >-
  Create a new item inside a NOS workflow via the running NOS dev server.
  Use when an agent needs to add a requirement/task to `.nos/workflows/<id>/`
  without touching the dashboard UI.
disable-model-invocation: false
argument-hint: "--workflow <id> --title <title> [--body <markdown>] [--stage <stage>]"
---

# nos-create-item

Create a new item in a NOS workflow. The new item defaults to status `Todo`
and, unless `--stage` is provided, lands in the workflow's first configured stage.
Creation triggers the workflow's stage-pipeline for the landing stage.

## Execution

Run the script:

```
node .claude/skills/nos-create-item/nos-create-item.mjs \
  --workflow <workflowId> \
  --title "<title>" \
  [--body "<markdown body>"] \
  [--stage "<stageName>"]
```

## Arguments

- `--workflow <id>` (required) — target workflow id (folder name under `.nos/workflows/`).
- `--title <string>` (required) — non-empty title for the new item.
- `--body <string>` (optional) — full markdown body for `index.md`.
- `--stage <stageName>` (optional) — name of a configured stage; defaults to the workflow's first stage.

## Base URL

The skill talks to the NOS Next.js server. It reads the base URL from the
`NOS_BASE_URL` environment variable and defaults to `http://localhost:30128`
(matches `npm run dev`). Start the server (`npm run dev`) before invoking.

## Success output

On success, prints the new item id (for example `REQ-00017`) as the only line
on stdout and exits with code `0`. Nothing else is written to stdout.

## Errors

On failure, exits non-zero and prints a single JSON object to stderr:

```
{"error": "<machine-code>", "message": "<human-readable>"}
```

Possible codes: `missing_args`, `server_unreachable`, `workflow_not_found`,
`invalid_stage`, `http_error`.

## Notes

- Stage-pipeline side effects fire inside the API route; this skill does not
  invoke them directly.
- File writes under `.nos/workflows/` are not locked; concurrent skill calls on
  the same workflow may race.
