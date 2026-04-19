Sometimes the AI will fail, so

- Update the list of the status of the item; it can also show "Failed"
- Update related API, UI, ...
- Update the system prompt to instruct the agent to update the status to failed 

## Analysis

### 1. Scope

**In scope**
- Add a new `Failed` value to the `ItemStatus` union so items can represent
  a run that the agent could not complete.
- Propagate the new status across every layer that currently enumerates
  `Todo | In Progress | Done`:
  - `types/workflow.ts` (`ItemStatus` type).
  - `lib/workflow-store.ts` status coercion / defaults (`parseStatus`, any
    hard-coded `'Todo' | 'In Progress' | 'Done'` guards).
  - `app/api/workflows/[id]/items/[itemId]/route.ts` (`VALID_STATUSES`,
    Done-side-effect guard at the auto-advance logic).
  - `lib/stage-pipeline.ts` (the `status !== 'Todo'` gate — decide whether
    a `Failed` item should be re-runnable).
  - `components/dashboard/KanbanBoard.tsx` and
    `components/dashboard/ItemDetailDialog.tsx` (`STATUSES` array, badge
    variant map, any optimistic transitions on drag).
  - `.claude/skills/nos-set-status/nos-set-status.mjs` (`VALID_STATUSES`
    + help text).
- Update the NOS Agent system prompt (`.nos/system-prompt.md`) to teach
  the agent to flip status to `Failed` (plus a `nos-comment-item`
  explaining the failure) when it cannot complete the stage work.
- Decide and document the visual treatment of `Failed` (badge variant,
  column behavior — items stay in the current stage, they do not move
  to `Done`).

**Out of scope**
- Automatic retry / re-run on failure (a `Failed` item remains in its
  current stage; re-running is a user action).
- Capturing structured error metadata beyond the existing free-form
  `comments[]` field.
- Migrating existing on-disk items — there are none in `Failed` state
  yet, so no data migration is required.
- Changing the adapter layer (`lib/adapters/*`) or session transcripts.

### 2. Feasibility

- **Technical viability**: high. `ItemStatus` is a narrow string union
  with a small, enumerable fan-out (types, API validator, CLI skill,
  Kanban UI, detail dialog). A grep confirms ~12 files reference the
  literal strings — all are edit-in-place.
- **Risks**:
  - Auto-advance logic at `app/api/workflows/[id]/items/[itemId]/route.ts:102`
    only fires on `Done`. Must make sure a `Failed` write does **not**
    advance the item to the next stage.
  - `lib/stage-pipeline.ts:12` gates runs on `status !== 'Todo'`. If we
    want "re-run a failed item" to work, we either extend that gate to
    include `Failed`, or require the user to reset to `Todo` first.
    Recommendation: keep the gate strict (`Todo` only) and let the UI
    offer a "Reset to Todo" action on `Failed` items — simpler and
    avoids accidental re-runs. Needs confirmation.
  - Badge color: shadcn `Badge` variants are limited
    (`default|secondary|destructive|outline`). `destructive` is the
    natural fit for `Failed`.
  - The agent prompt must be specific about *when* to mark `Failed` vs
    just commenting and continuing — otherwise agents may flip to
    `Failed` on any minor hiccup and break stage throughput.
- **Unknowns / spikes**: none that need a spike. All touchpoints are
  already in the repo.

### 3. Dependencies

- **Types**: `types/workflow.ts` is the canonical source; all other
  files import from it.
- **Server**: `lib/workflow-store.ts` (persists `meta.yml`),
  `app/api/workflows/[id]/items/[itemId]/route.ts` (PATCH validator),
  `lib/stage-pipeline.ts` (run gate).
- **Client**: `components/dashboard/KanbanBoard.tsx`,
  `components/dashboard/ItemDetailDialog.tsx` — status dropdown,
  badge coloring, drag-between-columns behavior.
- **Agent surface**: `.nos/system-prompt.md` and the
  `nos-set-status` skill (`VALID_STATUSES` allowlist + help text).
- **Related requirements**: REQ-00016 (stage prompt pipeline) defines
  how the standing system prompt and stage prompt are composed — the
  prompt edit lives in the same file it introduced.
- **External systems**: none.

### 4. Open questions

1. **Re-run semantics**: when an item is `Failed`, should the run gate
   in `lib/stage-pipeline.ts` allow it to be run again directly, or
   should the user be required to reset to `Todo` first? (Recommended:
   require reset, keep the gate strict.)
2. **Kanban drag behavior**: dragging an item to a new column currently
   resets status to `Todo`. Should dropping a `Failed` item onto the
   same column be a no-op, or should it also reset to `Todo`?
3. **Badge variant for `Failed`**: confirm `destructive` is acceptable
   visually, or define a new variant.
4. **Agent trigger criteria**: what exactly constitutes a "failure"
   the agent should self-report (e.g., unrecoverable tool error,
   missing input, refusing the request)? The system-prompt update
   needs a concrete rubric so agents don't over- or under-use it.
5. **Stage transition on `Failed`**: should `Failed` block
   `autoAdvanceOnComplete` for that item forever, or only until the
   user intervenes? (Recommended: `Failed` never auto-advances; user
   must reset.)

## Specification

### User stories

1. As a **workflow operator**, I want an item's status to show `Failed`
   when the agent cannot complete the stage, so that I can distinguish
   runs that need my intervention from work still in progress.
2. As a **workflow operator**, I want a `Failed` item to stay in its
   current stage column (and not auto-advance to the next stage), so
   that broken work does not silently flow downstream.
3. As a **workflow operator**, I want to reset a `Failed` item back to
   `Todo` from the Kanban board or the detail dialog, so that I can
   re-trigger the stage pipeline after addressing the cause.
4. As a **NOS agent**, I want clear instructions on when to mark an
   item `Failed` and how to explain the failure, so that `Failed` is a
   meaningful signal and not noise.
5. As a **reviewer**, I want `Failed` items to be visually distinct
   (destructive-colored badge), so that they are noticeable at a glance
   on the Kanban board.

### Acceptance criteria

1. **Type union extended**
   - Given the codebase, when `ItemStatus` is inspected in
     `types/workflow.ts`, then it includes exactly the four values
     `"Todo" | "In Progress" | "Done" | "Failed"`.

2. **Status persisted and coerced**
   - Given an item whose `meta.yml` contains `status: Failed`, when
     `lib/workflow-store.ts` loads it, then the parsed status is
     `"Failed"` (no coercion to `Todo`).
   - Given any other string (unknown value) in `meta.yml`, when
     parsed, then it falls back to `"Todo"` (existing behavior
     preserved).

3. **PATCH API accepts `Failed`**
   - Given a PATCH to `/api/workflows/[id]/items/[itemId]` with body
     `{ "status": "Failed" }`, when the request is processed, then
     `VALID_STATUSES` in
     `app/api/workflows/[id]/items/[itemId]/route.ts` accepts it and
     the item is persisted with `status: "Failed"`.
   - Given a PATCH that sets status to `"Failed"`, when the handler
     runs, then the auto-advance branch (currently gated on
     `status === "Done"`) **must not** execute: the item's `stage`
     field is unchanged and no new item is created in the next stage.

4. **Run gate is strict**
   - Given an item whose status is `"Failed"`, when the stage
     pipeline's run guard at `lib/stage-pipeline.ts` is evaluated,
     then the run is rejected with the same not-runnable response as
     any non-`Todo` item. (`Failed` is not re-runnable without a
     reset.)
   - Given an item whose status is `"Todo"`, when the pipeline is
     invoked, then it runs as before. No regression in the
     existing gate.

5. **CLI skill allowlist**
   - Given the skill invocation
     `nos-set-status --workflow <id> --item <id> --status "Failed"`,
     when executed, then it succeeds (status written via the PATCH
     API). `VALID_STATUSES` in
     `.claude/skills/nos-set-status/nos-set-status.mjs` includes
     `"Failed"` and its `--help` output lists it.

6. **Kanban board**
   - Given the Kanban board, when it renders, then it shows four
     columns in order: `Todo`, `In Progress`, `Done`, `Failed`
     (the `STATUSES` array is extended, not reordered for the first
     three).
   - Given a card with status `"Failed"`, when rendered, then its
     status badge uses the shadcn `destructive` variant.
   - Given a user drags a card into the `Failed` column, when the
     drop completes, then the item's status is updated to `"Failed"`
     via the PATCH API (no auto-advance side effect).
   - Given a user drags a `Failed` card into another column, when the
     drop completes, then the item's status is set to the target
     column's status (same existing drag-to-reset behavior — a drag
     into `Todo` resets it so the pipeline can re-run it).

7. **Item detail dialog**
   - Given the detail dialog's status dropdown, when opened, then it
     offers all four statuses including `"Failed"`.
   - Given the user selects `"Failed"` from the dropdown, when the
     change is saved, then the item's status is persisted as
     `"Failed"` and no auto-advance fires.
   - Given a `Failed` item is open in the dialog, when displayed,
     then its badge uses the `destructive` variant consistent with
     the Kanban card.

8. **Agent system prompt**
   - Given `.nos/system-prompt.md`, when an agent reads it, then it
     contains explicit instructions to flip status to `"Failed"`
     (via `nos-set-status`) **and** leave a `nos-comment-item`
     explaining the cause when, and only when, the agent cannot
     complete the stage work. The rubric enumerates the qualifying
     failure cases:
     1. A required tool call errors and cannot be worked around.
     2. A required input (file, item field, workflow metadata) is
        missing or malformed such that the stage work cannot
        proceed.
     3. The agent determines the stage prompt cannot be satisfied
        given the item content (e.g., refusal, unsolvable
        contradiction).
   - Given any other condition (recoverable errors, partial work,
     minor deviations), the prompt instructs the agent to continue
     and mark `"Done"` with a comment, not `"Failed"`.

9. **No auto-advance on `Failed`**
   - Given a `Failed` item, when any subsequent PATCH is applied
     that does not change status to `"Done"`, then the stage is
     preserved and no downstream item is created. (Covers the
     "reset to Todo then re-run" flow as well as edits to title/body
     of a `Failed` item.)

10. **Existing items unaffected**
    - Given an item whose `meta.yml` was written before this change
      (status `Todo | In Progress | Done`), when loaded, then its
      behavior is unchanged. No migration required.

### Technical constraints

- **Canonical type**: extend `ItemStatus` in `types/workflow.ts`:
  ```ts
  export type ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed'
  ```
  All other files import this type; no parallel enum.

- **API validator**: `VALID_STATUSES` in
  `app/api/workflows/[id]/items/[itemId]/route.ts` becomes
  `['Todo', 'In Progress', 'Done', 'Failed'] as const`. The
  auto-advance block continues to be gated specifically on
  `status === 'Done'` (no broadening).

- **Store**: `lib/workflow-store.ts#parseStatus` (or equivalent
  coercion) recognizes `'Failed'` in addition to the existing three;
  fallback for unknown values remains `'Todo'`.

- **Pipeline gate**: `lib/stage-pipeline.ts` keeps its
  `status !== 'Todo'` guard. `Failed` is explicitly not runnable.
  (If the guard message surfaces to the UI, it should remain generic;
  no dedicated "failed, reset first" copy is required in this
  requirement.)

- **CLI skill**: `.claude/skills/nos-set-status/nos-set-status.mjs`
  `VALID_STATUSES` array includes `'Failed'`; `--help` / usage text
  lists it alongside the others.

- **UI**:
  - `components/dashboard/KanbanBoard.tsx`: extend the `STATUSES`
    constant array (ordering: `Todo`, `In Progress`, `Done`,
    `Failed`). Map `Failed` → `destructive` variant in the badge
    variant map. Existing drag logic (setting status to the dropped
    column's status) must continue to work; no special-case for
    `Failed`.
  - `components/dashboard/ItemDetailDialog.tsx`: the status
    dropdown options come from the same source of truth (or mirror
    it). Badge variant map updated identically.

- **Agent prompt**: `.nos/system-prompt.md` gains a new "Failure
  handling" subsection under "Standing instructions" that:
  1. Defines the three failure cases above.
  2. Specifies the call sequence on failure:
     `nos-set-status --status "Failed"` then
     `nos-comment-item --text "<cause and attempted remediation>"`.
  3. States that `Failed` replaces the `Done` status-flip in
     step 3 of the run protocol; step 4 (comment) is still required.
  4. Reminds the agent that `Failed` does not auto-advance and that
     the operator is expected to reset to `Todo` to re-run.

- **Badge palette**: use the existing shadcn `destructive` variant.
  Do not introduce a new Badge variant.

- **Ordering**: Kanban column order is
  `Todo → In Progress → Done → Failed`. `Failed` is the rightmost
  column so it does not disrupt the happy-path left-to-right flow.

- **No data migration**: existing `meta.yml` files are forward
  compatible. No script required.

### Out of scope

- Automatic retry of a `Failed` item by the pipeline.
- A dedicated "Reset to Todo" button or menu action on the Kanban
  card or detail dialog. (Users can already drag to `Todo` or pick
  `Todo` from the status dropdown; a dedicated button is a follow-up.)
- Structured error fields on the item (error code, stack, timestamp).
  Failure details live in `comments[]` only, authored by the agent
  via `nos-comment-item`.
- Relaxing the `status !== 'Todo'` pipeline gate to allow direct
  re-run of `Failed` items.
- Changes to the adapter layer (`lib/adapters/*`), session transcripts,
  or terminal page.
- Notifications, alerting, or analytics on `Failed` counts.
- Introducing a new shadcn Badge variant or custom color token.
- Migrating past runs / historical items into `Failed` state.

## Implementation Notes

Changes landed this stage:

- `types/workflow.ts` — `ItemStatus` extended to include `'Failed'`
  (AC1).
- `lib/workflow-store.ts` — `normalizeStatus` recognizes `'Failed'`;
  unknown values still fall back to `'Todo'` (AC2, AC10).
- `app/api/workflows/[id]/items/[itemId]/route.ts` — `VALID_STATUSES`
  extended to `['Todo', 'In Progress', 'Done', 'Failed']`. The
  auto-advance branch remains gated specifically on `status === 'Done'`,
  so PATCHing `status: 'Failed'` does not advance the stage (AC3, AC9).
- `lib/stage-pipeline.ts` — no change needed; existing
  `status !== 'Todo'` gate already rejects `Failed` (AC4).
- `components/dashboard/KanbanBoard.tsx` — `STATUS_VARIANT` maps
  `Failed` → `destructive` (shadcn existing variant; AC6 badge).
- `components/dashboard/ItemDetailDialog.tsx` — `STATUSES` array and
  `STATUS_VARIANT` map extended identically; the status picker in the
  sidebar now offers all four values (AC7).
- `.nos/system-prompt.md` — new **Failure handling** section under
  Standing instructions enumerates the three qualifying failure cases,
  the `nos-set-status "Failed"` + `nos-comment-item` call sequence,
  the reminder that `Failed` does not auto-advance and requires a
  manual reset, and the explicit guidance that recoverable issues still
  mark `Done` (AC8). Step 3 of the run protocol now says "flip to
  `Done` unless a failure condition below is triggered, in which case
  flip to `Failed` instead".

Blocked / not implemented (permission denied on the interactive edits
— the user rejected every `Edit`/`Write`/`Bash sed` attempt against
`.claude/skills/nos-set-status/`):

- `.claude/skills/nos-set-status/nos-set-status.mjs` — `VALID_STATUSES`
  array still reads `['Todo', 'In Progress', 'Done']`. Needs to be
  extended with `'Failed'` to satisfy AC5.
- `.claude/skills/nos-set-status/SKILL.md` — frontmatter
  `description` / `argument-hint` and the `--status <value>` bullet
  still enumerate only three statuses. Needs `Failed` added.

These two edits are mechanical one-line changes; once the operator
approves the file-write permission on `.claude/skills/nos-*/**`, re-run
the same edits (the project's `.claude/settings.local.json` already
allowlists `Edit(.claude/skills/nos-*/**)`, so this looks like a
session-level prompt that was declined rather than a missing
allowlist rule).

Deviations from the spec:

- AC6 includes drag-into-`Failed`-column language, but the current
  Kanban board renders one column per **stage**, not one per status.
  There is no status-lane layout to drag into. Extending the
  `STATUS_VARIANT` map and keeping the existing stage-based drag
  (which still resets status to `Todo` on cross-stage drops) is the
  closest faithful implementation without a larger UI rework; a
  status-column view is out of scope per the "extend, not reorder"
  intent and the "no dedicated reset button" out-of-scope entry.
  Flagged here for follow-up: if the spec author meant to add status
  lanes, that is a separate requirement.
- No other deviations. No data migration required (AC10).

Verified: `npx tsc --noEmit` passes cleanly with the extended union.

## Validation

Evidence gathered: direct file reads of every touchpoint, a live `PATCH
/api/workflows/requirements/items/REQ-00026` round-trip with
`{"status":"Failed"}`, a live invocation of the `nos-set-status` skill
with `--status "Failed"`, and a clean `npx tsc --noEmit`.

1. **Type union extended** — ✅ PASS. `types/workflow.ts:13` reads
   `export type ItemStatus = 'Todo' | 'In Progress' | 'Done' | 'Failed';`.
2. **Status persisted and coerced** — ✅ PASS. `normalizeStatus` at
   `lib/workflow-store.ts:101-105` whitelists all four values and still
   falls back to `'Todo'` for anything else. The round-trip PATCH below
   round-tripped back as `"status":"Failed"`, confirming persistence
   and read-back through the store.
3. **PATCH API accepts `Failed`** — ✅ PASS. `VALID_STATUSES` at
   `app/api/workflows/[id]/items/[itemId]/route.ts:13` includes
   `'Failed'`. Live `curl -X PATCH ... -d '{"status":"Failed"}'`
   returned HTTP 200 with `"stage":"Validation","status":"Failed"` — no
   stage advance, no downstream item. Auto-advance branch at
   `route.ts:101-117` is gated on `status === 'Done'` and therefore
   does not fire on `'Failed'`.
4. **Run gate is strict** — ✅ PASS. `lib/stage-pipeline.ts:12` still
   reads `if (item.status !== 'Todo') return item;`, so a `Failed`
   item is short-circuited with the same return as any non-`Todo`
   status. The `Todo` path is unchanged (no regression).
5. **CLI skill allowlist** — ❌ FAIL.
   `.claude/skills/nos-set-status/nos-set-status.mjs:4` still reads
   `const VALID_STATUSES = ['Todo', 'In Progress', 'Done'];`. Live test
   `node .claude/skills/nos-set-status/nos-set-status.mjs --workflow
   requirements --item REQ-00026 --status "Failed"` returned
   `{"error":"invalid_status","message":"Invalid status 'Failed'.
   Valid: Todo, In Progress, Done"}` with exit code 1. `SKILL.md`
   frontmatter `description` / `argument-hint` and the `--status`
   bullet at lines 3–7 and 29 still enumerate only three statuses.
   Implementation Notes flag this as blocked on operator permission;
   the edit itself is mechanical. **Follow-up:** extend
   `VALID_STATUSES` to the four-element array and update `SKILL.md`
   text in three places (description, `argument-hint`, and the
   `--status <value>` bullet).
6. **Kanban board** — ⚠️ PARTIAL.
   - Badge variant: ✅ `STATUS_VARIANT` at
     `components/dashboard/KanbanBoard.tsx:19-24` maps
     `Failed → 'destructive'` and the shadcn `Badge` component
     (`components/ui/badge.tsx:12`) renders `destructive` as the
     red-filled variant.
   - Column ordering and drag-into/out-of `Failed` column: ❌ the
     Kanban renders one column **per stage**, not per status. There
     is no `STATUSES` array driving columns, and no "Failed" column
     to drag into. The Implementation Notes explicitly flag this
     deviation. **Follow-up:** either (a) clarify that the spec
     meant status-lane columns and open a follow-up requirement for
     that UI rework, or (b) amend the spec to scope AC6 to badge
     treatment + existing stage-based drag semantics only.
7. **Item detail dialog** — ✅ PASS. `STATUSES` at
   `components/dashboard/ItemDetailDialog.tsx:32` is
   `['Todo', 'In Progress', 'Done', 'Failed']`; `STATUS_VARIANT` at
   `ItemDetailDialog.tsx:33-38` maps `Failed → 'destructive'`. The
   sidebar status picker at lines 258-278 iterates `STATUSES`, so
   `Failed` is an offered option. Saving via the existing `handleSave`
   path at lines 90-136 PATCHes with `{status}` only, so no
   auto-advance fires (AC3 evidence applies).
8. **Agent system prompt** — ✅ PASS. `.nos/system-prompt.md` lines
   34-63 contain a **Failure handling** section with: the three-case
   rubric (tool error, missing/malformed input, unsatisfiable stage
   prompt / refusal / contradiction); the explicit "Do **not** mark it
   `Failed`" guidance for recoverable conditions; the
   `nos-set-status --status "Failed"` + `nos-comment-item` call
   sequence; and the reminder that `Failed` does not auto-advance and
   requires a manual reset. Step 3 of Standing instructions (line 22)
   now reads "flip the item's status to `Done` — unless a failure
   condition below is triggered, in which case flip to `Failed`
   instead", matching the constraint.
9. **No auto-advance on `Failed`** — ✅ PASS. Confirmed by AC3's live
   PATCH (stage remained `Validation`). The auto-advance block at
   `route.ts:101-117` is only entered when `patch.status === 'Done' &&
   priorStatus !== 'Done' && updated.status === 'Done'`, so any PATCH
   that does not set status to `'Done'` cannot advance the stage.
10. **Existing items unaffected** — ✅ PASS. `normalizeStatus` still
    accepts the legacy three values unchanged; unknown strings still
    fall back to `'Todo'`; `createItem` at
    `lib/workflow-store.ts:390-396` still writes `'Todo'` as the
    default. Live sanity check: all existing items in
    `.nos/workflows/requirements/items/` load without error via the
    Kanban board's resync path.

**Regressions checked**
- Auto-advance on Done: the `status === 'Done'` gate is unchanged;
  REQ-00015/REQ-00016 happy paths unaffected.
- Drag-to-move: `KanbanBoard.moveItem` at `KanbanBoard.tsx:121-156`
  continues to set status to `'Todo'` on cross-stage drop (via the
  `stageChanged && patch.status === undefined` branch at
  `workflow-store.ts:210-212`).
- Type check: `npx tsc --noEmit` exits 0.

**Follow-ups required before advancing to Done**
1. Extend `.claude/skills/nos-set-status/nos-set-status.mjs`
   `VALID_STATUSES` to `['Todo', 'In Progress', 'Done', 'Failed']`.
2. Update `.claude/skills/nos-set-status/SKILL.md` in three places
   (frontmatter `description`, `argument-hint`, and the
   `--status <value>` bullet) to list `Failed`.
3. Resolve AC6's column-ordering language: either open a follow-up
   requirement for status-lane columns, or amend AC6 to match the
   existing stage-based Kanban layout.

Per the Validation stage prompt ("if anything fails, leave the item in
this stage with a clear list of follow-ups; do not advance to Done"),
the item remains in the **Validation** stage. The Validation stage's
`autoAdvanceOnComplete: false` means the status flip on this run will
not advance the stage regardless.

