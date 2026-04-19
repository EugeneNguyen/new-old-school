---
name: nos-move-stage
description: >-
  Move a NOS workflow item to a different configured stage via the running
  NOS dev server. Triggers the destination stage's pipeline.
disable-model-invocation: false
argument-hint: "--workflow <id> --item <itemId> --stage <stageName>"
---

# nos-move-stage

Change a workflow item's `stage`. The server fires the destination stage's
configured pipeline after the move.

## Execution

```
node .claude/skills/nos-move-stage/nos-move-stage.mjs \
  --workflow <workflowId> \
  --item <itemId> \
  --stage "<stageName>"
```

## Arguments

- `--workflow <id>` (required).
- `--item <itemId>` (required).
- `--stage <stageName>` (required) — must match a stage configured in
  `.nos/workflows/<id>/config/stages.yaml`.

If `<stageName>` is unknown, the skill exits non-zero with
`invalid_stage` and the server's message (which lists valid stages).

## Base URL

Reads `NOS_BASE_URL` (default `http://localhost:30128`). Server must be running.

## Success output

Prints `ok` on stdout and exits `0`.

## Errors

Codes: `missing_args`, `server_unreachable`, `workflow_not_found`,
`item_not_found`, `invalid_stage`, `http_error`.

## Recursion contract — IMPORTANT

An agent spawned by a stage-pipeline session **MUST NOT** call `nos-move-stage`
on the same `(workflowId, itemId)` that triggered its own pipeline. Doing so
would re-enter the pipeline and potentially loop.

This contract is documented only — there is no runtime guard in this iteration.

## Notes

- Underlying call: `PATCH /api/workflows/<id>/items/<itemId>` with `{ stage }`.
  Stage-pipeline side effects fire inside the API route.
- No locking; concurrent calls on the same item may race.
