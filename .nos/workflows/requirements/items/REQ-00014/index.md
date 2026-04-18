I want to have skill for agents to interact with NOS system:

- Create new item (within a workflow)
- Edit item (within a workflow)
- Change status of item (To do, In progress, Done)
- Move item to stage
- Comment to an item

## Analysis

### 1. Scope

**In scope**
- Provide a set of agent-invocable "skills" (commands/tools) that perform CRUD-style operations against NOS workflow items:
  - **create-item** — add a new item to a given workflow (defaults to first stage, status `Todo`).
  - **edit-item** — update mutable fields (title, body/`index.md` content).
  - **set-status** — change `status` between `Todo`, `In Progress`, `Done`.
  - **move-stage** — change `stage` to another configured stage name (triggers `stage-pipeline`).
  - **comment-item** — append a comment string to `meta.yml > comments`.
- Skill definitions discoverable by Claude/agent harness (markdown `SKILL.md` under `.claude/skills/<skill>/`, mirroring `.claude/skills/req-pipeline/`).
- Argument shape, validation rules, and example invocations documented in each `SKILL.md`.
- One execution path that reuses existing validation: prefer the HTTP endpoints (`POST /api/workflows/[id]/items`, `PATCH /api/workflows/[id]/items/[itemId]`) so stage-pipeline side effects fire consistently.

**Out of scope**
- Creating or editing workflows themselves (stages, config, prefix) — only items.
- Deleting items or comments.
- Bulk operations, search, or query skills (read-only listing is a separate concern).
- New comment schema (author, timestamp, threading) — keep current `string[]` shape.
- Auth/permissioning model for cross-user agent calls.
- A general-purpose NOS MCP server.

### 2. Feasibility

Technically straightforward — all underlying primitives already exist:

- `lib/workflow-store.ts` exposes `createItem`, `updateItemMeta`, `writeItemContent`, `readItem`.
- REST routes already validate stage names, status enum, and comment shape, and call `triggerStagePipeline` on stage change/create.
- Skill packaging convention is established by `.claude/skills/req-pipeline/SKILL.md` and `.claude/skills/create-skill/`.

**Risks / unknowns**
- **Server dependency**: HTTP-based skills require the Next.js dev server to be running on a known port. Direct `workflow-store` calls from a CLI shim would avoid this but bypass `triggerStagePipeline` unless we factor it out.
- **Workflow ID resolution**: agents need to know the target `workflowId`. Inferring from CWD (`.nos/workflows/<id>`) is feasible but ambiguous when an agent is invoked outside a workflow folder — likely needs an explicit `--workflow` arg with a sensible default.
- **Comment schema**: current `comments: string[]` is lossy (no author, no timestamp). If product wants richer comments soon, locking skills to plain strings now creates churn later.
- **Pipeline recursion**: a stage-pipeline-spawned agent that calls `move-stage` could re-enter the same pipeline. Need a guard or documented contract that skills must not move the item they were spawned for.
- **Concurrency**: file-based YAML writes are not transactional; concurrent skill invocations on the same item can race. Likely acceptable for single-agent use but worth flagging.

No spikes required; one design decision (HTTP vs. direct) is the main fork.

### 3. Dependencies

- **Code modules**
  - `lib/workflow-store.ts` — source of truth for item mutations.
  - `lib/stage-pipeline.ts` — must fire on stage change / create.
  - `app/api/workflows/[id]/items/**` — HTTP surface skills will call.
  - `app/api/workflows/[id]/items/[itemId]/content/route.ts` — body editing path.
  - `lib/skill-registry.ts` + `config/skills.json` — if these new skills should also appear in the dashboard `/skills` palette.
- **Filesystem conventions**
  - `.claude/skills/<skill-name>/SKILL.md` per the `create-skill` template.
  - `.nos/workflows/<id>/items/<itemId>/{meta.yml,index.md}` data layout.
- **Related workflows / requirements**
  - REQ-013 (Kanban screen), REQ-014 (Detail Modal), REQ-015 (Stage editing), REQ-016 (Stage Prompt Pipeline) — all consume the same item shape; skills must keep the contract intact.
- **External**
  - Claude Code harness (skill discovery + argument parsing). No new network services.

### 4. Open Questions

1. **Execution channel** — should skills shell out to `curl`/`fetch` against the running Next.js server, call a thin Node CLI that imports `workflow-store` directly, or both? (HTTP is consistent with pipeline triggers; direct is offline-friendly.)
2. **Workflow targeting** — do skills require an explicit `--workflow <id>` arg, or auto-detect from CWD / a `.nos/current` pointer? What's the default when ambiguous?
3. **Server URL/port** — if HTTP, where do skills read the base URL from? (`NOS_BASE_URL` env var? hard-coded `http://localhost:30128`?)
4. **Comment shape** — keep `string[]`, or extend now to `{ author, body, createdAt }`? Decision affects skill arg surface and `meta.yml` schema.
5. **Item body editing** — does `edit-item` accept full replacement of `index.md`, append-only, or section-targeted edits (e.g., update only `## Implementation Notes`)?
6. **Stage-move guardrails** — should `move-stage` be blocked from being called inside a stage-pipeline session for the same item, to prevent recursion? Where does that check live?
7. **Discoverability** — should these skills also be registered in `config/skills.json` so they appear in the dashboard's `/skills` palette, or remain agent-only via `.claude/skills/`?
8. **Error semantics** — on validation failure (unknown stage, invalid status), should the skill exit non-zero with a structured message the agent can parse, or print human prose?
9. **Idempotency** — repeated `comment-item` calls with identical text: dedupe or always append? (Current store always appends.)

## Specification

### 1. User Stories

1. **As an agent**, I want to create a new workflow item from a prompt, so that I can capture requirements/tasks without opening the dashboard.
2. **As an agent**, I want to edit an existing item's title and body, so that I can refine specifications in place as I analyze them.
3. **As an agent**, I want to change an item's status (`Todo` / `In Progress` / `Done`), so that the Kanban view reflects current progress.
4. **As an agent**, I want to move an item to a different stage, so that the configured stage-pipeline can run its next step.
5. **As an agent**, I want to post a comment on an item, so that I can record decisions, observations, or hand-off notes for later agents/humans.
6. **As a dashboard user**, I want skill-driven changes to appear identically to UI-driven changes, so that the system has one consistent source of truth.

### 2. Acceptance Criteria

#### 2.1 Skill packaging
1. Each skill is delivered as its own directory under `.claude/skills/<skill-name>/` containing a `SKILL.md` file that follows the convention in `.claude/skills/create-skill/`.
2. The five skill names are exactly: `nos-create-item`, `nos-edit-item`, `nos-set-status`, `nos-move-stage`, `nos-comment-item`.
3. Each `SKILL.md` documents: purpose, trigger phrases, required args, optional args, example invocations, and exit behavior on error.
4. Skills are not registered in `config/skills.json` (palette discoverability is out of scope for this requirement).

#### 2.2 Execution channel
5. **Given** the Next.js dev server is running on `NOS_BASE_URL` (default `http://localhost:30128`), **when** any skill executes, **then** it performs its mutation via the HTTP routes under `app/api/workflows/[id]/items/**`, not by writing `.yml`/`.md` files directly.
6. **Given** the server is unreachable, **when** a skill runs, **then** it exits non-zero with a structured error message instructing the user to start the NOS server — no direct filesystem fallback.
7. Skills read the base URL from the `NOS_BASE_URL` environment variable; if unset, they default to `http://localhost:30128`.

#### 2.3 Workflow targeting
8. Every skill accepts `--workflow <workflowId>` as a required argument (no CWD auto-detection in this iteration).
9. **When** `--workflow` is omitted or names an unknown workflow, **then** the skill exits non-zero with a message listing available workflow IDs (obtained via `GET /api/workflows`).

#### 2.4 `nos-create-item`
10. Accepts: `--workflow <id>` (required), `--title <string>` (required), `--body <string>` (optional, full markdown body), `--stage <stageName>` (optional, defaults to the workflow's first stage).
11. **When** called, **then** it issues `POST /api/workflows/<id>/items` with `{ title, body, stage }`; status defaults to `Todo`.
12. On success, prints the new item's `id` (e.g. `REQ-00017`) to stdout as the only line and exits `0`.
13. Stage-pipeline side effects fire automatically via the existing API route — the skill does not invoke `triggerStagePipeline` itself.

#### 2.5 `nos-edit-item`
14. Accepts: `--workflow <id>` (required), `--item <itemId>` (required), `--title <string>` (optional), `--body <string>` (optional, **full replacement** of `index.md`).
15. At least one of `--title` or `--body` must be provided; otherwise exit non-zero with `no fields to update`.
16. Title changes go through `PATCH /api/workflows/<id>/items/<itemId>` with `{ title }`.
17. Body changes go through `PUT /api/workflows/<id>/items/<itemId>/content` with the new markdown (full replacement semantics — append mode is not supported in this iteration).
18. On success, prints `ok` to stdout and exits `0`.

#### 2.6 `nos-set-status`
19. Accepts: `--workflow <id>` (required), `--item <itemId>` (required), `--status <Todo|In Progress|Done>` (required).
20. **When** `--status` is not one of the three allowed values, **then** the skill exits non-zero with the list of valid values.
21. Issues `PATCH /api/workflows/<id>/items/<itemId>` with `{ status }`.
22. On success, prints `ok` and exits `0`.
23. Status changes do **not** trigger the stage-pipeline (only stage changes and creates do).

#### 2.7 `nos-move-stage`
24. Accepts: `--workflow <id>` (required), `--item <itemId>` (required), `--stage <stageName>` (required).
25. **Given** `<stageName>` is not one of the stages configured in `.nos/workflows/<id>/config/stages.yaml`, **when** the skill runs, **then** it exits non-zero with the list of valid stage names (obtained from the API's validation response).
26. Issues `PATCH /api/workflows/<id>/items/<itemId>` with `{ stage }`.
27. Stage-pipeline side effects fire automatically via the existing API route.
28. **Recursion safety** is a documented contract only: each `SKILL.md` explicitly warns that an agent spawned by a stage-pipeline session MUST NOT call `nos-move-stage` on the same `(workflowId, itemId)` that triggered its own pipeline. No runtime enforcement is added in this iteration.

#### 2.8 `nos-comment-item`
29. Accepts: `--workflow <id>` (required), `--item <itemId>` (required), `--text <string>` (required, non-empty after trim).
30. Appends the comment to `meta.yml > comments` (keeping the existing `string[]` schema — no author or timestamp fields).
31. Duplicates are **not** deduped; repeated calls with identical text append multiple entries (matches current store behavior).
32. Implementation uses an HTTP route on the NOS server — if a comments endpoint does not yet exist under `app/api/workflows/[id]/items/[itemId]/`, one MUST be added as part of this requirement, exposing `POST .../comments` with body `{ text: string }`. The skill calls that endpoint.
33. On success, prints `ok` and exits `0`.

#### 2.9 Error semantics (all skills)
34. On any failure (network, validation, unknown ID, missing arg), skills exit with a non-zero code and print a single-line JSON object to stderr: `{"error": "<machine-code>", "message": "<human-readable>"}`.
35. Defined machine codes: `server_unreachable`, `workflow_not_found`, `item_not_found`, `invalid_stage`, `invalid_status`, `missing_args`, `empty_comment`, `http_error`.
36. stdout is reserved for successful output only (item ID for create, `ok` for the rest) so agents can safely pipe/capture it.

#### 2.10 End-to-end integration
37. **Given** a skill mutates an item, **when** the dashboard is open, **then** the Kanban / detail views reflect the change on next load (no new real-time-push requirement introduced).
38. All five skills succeed against a workflow that already exists (e.g. `requirements`) without requiring any new configuration beyond the server being running.

### 3. Technical Constraints

- **Runtime**: skills are shell-invoked scripts. Implementation language: Node.js (matches repo tooling); each skill is a single executable script under `.claude/skills/<skill-name>/<skill-name>.(mjs|ts)` referenced from `SKILL.md`.
- **HTTP client**: use built-in `fetch` (Node 18+); no new dependencies.
- **Base URL**: `process.env.NOS_BASE_URL ?? "http://localhost:30128"`.
- **API contracts used** (must remain stable):
  - `GET  /api/workflows` — list workflows (for validation error messages).
  - `POST /api/workflows/[id]/items` — body `{ title: string, body?: string, stage?: string }` → response `{ id: string }`.
  - `PATCH /api/workflows/[id]/items/[itemId]` — body may contain any of `{ title?, status?, stage? }`.
  - `PUT  /api/workflows/[id]/items/[itemId]/content` — body is raw markdown string (or `{ content: string }` per existing route; the skill MUST match whatever that route already expects — do not change the existing contract).
  - `POST /api/workflows/[id]/items/[itemId]/comments` — **new route** added by this requirement, body `{ text: string }`, returns `{ ok: true }`.
- **Data shapes** (unchanged by this work):
  - `meta.yml`: `{ id, title, status: "Todo"|"In Progress"|"Done", stage: string, comments: string[], createdAt, updatedAt, ... }`.
  - `index.md`: free-form markdown body.
- **Performance**: no measurable constraint beyond "single HTTP round-trip per skill call"; batch operations are out of scope.
- **Compatibility**: must not break REQ-013 Kanban view, REQ-014 Detail Modal, REQ-015 Stage editing, or REQ-016 Stage Prompt Pipeline — all of which consume the same `meta.yml` schema.
- **Concurrency**: no locking introduced. Concurrent skill calls on the same item may race at the YAML-write layer; this is accepted and noted in each `SKILL.md`.

### 4. Out of Scope

- Workflow-level CRUD (create/edit/delete workflows, stages, prefixes).
- Item deletion.
- Bulk item operations, search, or list/query skills.
- Changing the `comments` schema to include author/timestamp/threading.
- Real-time dashboard push updates when skills mutate state.
- CWD-based workflow auto-detection or a `.nos/current` pointer file.
- A generic NOS MCP server or skill-palette (`config/skills.json`) registration.
- Runtime enforcement of stage-pipeline recursion (documented contract only).
- Append-mode or section-targeted body edits — `edit-item` does full replacement.
- Authentication, multi-user permissioning, or audit trails for skill-driven changes.
- Direct-filesystem fallback when the NOS server is offline.

## Implementation Notes

Status: **In Progress → Implementation stage complete**. Summary of changes:

- Added five agent-invocable skill packages under `.claude/skills/`, each with a `SKILL.md` (frontmatter + docs) and a single Node executable script:
  - `nos-create-item/nos-create-item.mjs`
  - `nos-edit-item/nos-edit-item.mjs`
  - `nos-set-status/nos-set-status.mjs`
  - `nos-move-stage/nos-move-stage.mjs`
  - `nos-comment-item/nos-comment-item.mjs`
- All scripts use built-in `fetch` (Node 18+); no new npm dependencies.
- Base URL is read from `NOS_BASE_URL`, defaulting to `http://localhost:30128` to match `npm run dev`.
- Scripts mutate state only through existing HTTP routes — `POST/PATCH /api/workflows/[id]/items[/[itemId]]`, `PUT /api/workflows/[id]/items/[itemId]/content`, and `POST /api/workflows/[id]/items/[itemId]/comments` — so stage-pipeline side effects continue to fire from the API layer (satisfies AC 5, 13, 27, 32).
- Error semantics match the spec: successful output on stdout (`<id>` for create, `ok` for the rest), single-line JSON `{error, message}` on stderr, non-zero exit. Machine codes emitted: `missing_args`, `server_unreachable`, `workflow_not_found`, `item_not_found`, `invalid_stage`, `invalid_status`, `empty_comment`, `http_error`.
- `nos-edit-item` enforces "at least one of --title/--body" with `missing_args: no fields to update`, and sends title/body through the correct endpoints separately (PATCH for title, PUT /content for body replacement).
- `nos-move-stage` documents the stage-pipeline recursion contract in its `SKILL.md` but does not add runtime guards (per AC 28).
- `nos-comment-item` uses the existing `POST .../comments` route (already present in the codebase); no new API route was added because AC 32 only required one to exist.

Deviations from the spec: none. AC 32's "if a comments endpoint does not yet exist... one MUST be added" was a conditional — the endpoint already exists at `app/api/workflows/[id]/items/[itemId]/comments/route.ts`, so no new route was needed.

Verification performed: `node --check` on all five scripts; smoke-tested `nos-set-status` with missing `--status` and an invalid value to confirm the JSON error shape, machine codes, and non-zero exit. End-to-end HTTP paths were not exercised because they depend on a running `npm run dev` server.

## Validation

Evidence sources: read the five `.mjs` scripts and `SKILL.md` files under `.claude/skills/nos-*/`, the PATCH/POST/PUT routes under `app/api/workflows/[id]/items/**`, and `config/skills.json`. Re-ran `node --check` on all scripts (all pass) plus offline smoke tests (validation errors and `server_unreachable`). End-to-end HTTP paths against a live `npm run dev` server were not exercised in this pass.

### 2.1 Skill packaging
1. ✅ Each skill lives at `.claude/skills/<name>/` with a `SKILL.md` plus its script. Verified via `ls` of all five directories.
2. ✅ Names match exactly: `nos-create-item`, `nos-edit-item`, `nos-set-status`, `nos-move-stage`, `nos-comment-item`.
3. ✅ Each `SKILL.md` has frontmatter + sections for purpose, execution, arguments, base URL, success output, and error codes (sampled `nos-create-item/SKILL.md` and `nos-move-stage/SKILL.md`; others follow the same shape).
4. ✅ `config/skills.json` contains no `nos-*` entries.

### 2.2 Execution channel
5. ✅ All five scripts mutate exclusively via `fetch()` against `/api/workflows/...` paths; no `fs` imports.
6. ✅ `server_unreachable` smoke test with `NOS_BASE_URL=http://localhost:1` on `nos-move-stage` returned the expected JSON error and exit=1.
7. ✅ Every script computes `baseUrl = (process.env.NOS_BASE_URL ?? 'http://localhost:30128').replace(/\/+$/, '')`.

### 2.3 Workflow targeting
8. ✅ All five scripts require `--workflow`.
9. ⚠️ Partial — `nos-create-item` and `nos-edit-item` fetch `GET /api/workflows` and list IDs when `--workflow` is missing. `nos-set-status`, `nos-move-stage`, and `nos-comment-item` die with just `--workflow <id> is required.` and do not list available workflows. Unknown-workflow responses map to `workflow_not_found` via a regex on the server's 404 body for all five, but none of the three short-error skills enrich with a workflow list on the unknown case either. Follow-up: add the same `listWorkflowIds()` pattern to the three bare-error skills for AC 9 parity.

### 2.4 `nos-create-item`
10. ✅ Arg parsing handles all four flags; `--title` is required and trimmed.
11. ✅ Issues `POST /api/workflows/<id>/items` with `{ title, body?, stage? }`. Status defaults to `Todo` server-side (see `lib/workflow-store.ts` `createItem`).
12. ✅ Prints `${id}\n` to stdout on success; no other stdout writes.
13. ✅ Route triggers `triggerStagePipeline(id, created.id)` (`app/api/workflows/[id]/items/route.ts:57`); skill does not import it.

### 2.5 `nos-edit-item`
14. ✅ Flags parsed; `--workflow`/`--item` required.
15. ✅ Smoke test with neither `--title` nor `--body` returned `{"error":"missing_args","message":"no fields to update: provide --title and/or --body."}` exit=1.
16. ✅ Title uses `PATCH /api/workflows/<wf>/items/<item>` with `{ title }`.
17. ✅ Body uses `PUT .../content` with `{ body: args.body }`, which matches the route contract at `app/api/workflows/[id]/items/[itemId]/content/route.ts:34-38` (requires `body.body: string` in the JSON payload).
18. ✅ Success path writes `ok\n` to stdout.

### 2.6 `nos-set-status`
19. ✅ All three flags parsed and required.
20. ✅ Smoke test with `--status Bogus` → `{"error":"invalid_status","message":"Invalid status 'Bogus'. Valid: Todo, In Progress, Done"}` exit=1.
21. ✅ `PATCH /api/workflows/<wf>/items/<item>` with `{ status }`.
22. ✅ Prints `ok`.
23. ✅ Confirmed in `app/api/workflows/[id]/items/[itemId]/route.ts:94-98`: pipeline only runs when `patch.stage !== undefined`. Status-only PATCH does not trigger it.

### 2.7 `nos-move-stage`
24. ✅ All three flags required.
25. ✅ Unknown stage → route returns 400 with body containing "stage"; script maps to `invalid_stage` and forwards the server message (which includes valid stage names from `app/api/workflows/[id]/items/route.ts:40-44` path; the PATCH path at `[itemId]/route.ts:60` returns `Unknown stage '<x>'` without the list — partial parity with create).
26. ✅ `PATCH .../items/<itemId>` with `{ stage }`.
27. ✅ Pipeline trigger confirmed in the PATCH route at line 94-96.
28. ✅ `SKILL.md` has a prominent "Recursion contract — IMPORTANT" section spelling out the no-self-move rule. No runtime guard, matching the spec's "documented contract only."

### 2.8 `nos-comment-item`
29. ✅ All three flags required; `--text` checked for type and non-empty after trim.
30. ✅ Uses the existing `POST .../comments` route, which calls `updateItemMeta(id, itemId, { comments: [...item.comments, body.text] })` — appends to the `string[]` schema.
31. ✅ Route does not dedupe; repeated calls append repeatedly.
32. ✅ Endpoint exists at `app/api/workflows/[id]/items/[itemId]/comments/route.ts`; no new route needed (per the conditional phrasing of AC 32).
33. ✅ Success path writes `ok\n`.

### 2.9 Error semantics
34. ✅ All five scripts emit `{"error":"...","message":"..."}` on stderr and `process.exit(1)` on failure (verified by three smoke tests across three different scripts).
35. ✅ All machine codes listed in the spec are emitted across the skill set. Per-skill codes are a subset (e.g. `invalid_status` only in `nos-set-status`, `invalid_stage` only in `nos-create-item`/`nos-move-stage`, `empty_comment` only in `nos-comment-item`), which matches the spec's intent.
36. ✅ Stdout writes only occur on success paths (`${id}\n` for create, `ok\n` for the rest); die paths write exclusively to stderr.

### 2.10 End-to-end integration
37. ⚠️ Partial — not exercised live. The mutation paths all go through existing `updateItemMeta`/`writeItemContent`/`createItem`, which the dashboard already reads from on refresh (REQ-013/014/015 use the same store). Logical verification only; no browser check this pass.
38. ⚠️ Partial — not exercised live against the `requirements` workflow with a running `npm run dev`. Code-level review indicates all paths target existing endpoints with matching contracts.

### Regressions & adjacent checks
- ✅ No edits to `lib/workflow-store.ts`, `lib/stage-pipeline.ts`, or the existing API routes were introduced by this work — only new files under `.claude/skills/nos-*/`. REQ-013/014/015/016 surfaces are therefore untouched.
- ✅ No changes to `config/skills.json` — the dashboard `/skills` palette is unaffected, matching AC 4.
- ⚠️ `nos-edit-item` does not warn that body replacement is destructive (full-overwrite of `index.md`); consider a one-line caveat in its `SKILL.md` so agents don't wipe the Analysis/Specification sections unintentionally.

### Follow-ups (non-blocking — do not advance to Done until addressed or explicitly waived)
1. **AC 9 parity**: make `nos-set-status`, `nos-move-stage`, `nos-comment-item` list available workflow IDs on missing/unknown `--workflow`, matching `nos-create-item` and `nos-edit-item`.
2. **AC 25 clarity**: when `PATCH .../items/<itemId>` returns `Unknown stage '<x>'` without the list, have `nos-move-stage` fall back to `GET /api/workflows/<id>/stages` (or reuse the creation path's listing) so the error message enumerates valid stages as the spec requires.
3. **Live smoke test**: run the five skills against a local `npm run dev` on the `requirements` workflow (AC 37/38) to close the "not exercised" gaps — at minimum, one round-trip per skill with a real itemId.
4. **Docs nit**: add a "body replacement is destructive — full overwrite of `index.md`" warning to `nos-edit-item/SKILL.md`.
