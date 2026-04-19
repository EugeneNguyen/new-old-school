# Remove ID when create/edit item

## Analysis

### Scope
**In scope**
- Remove the optional **ID** input field from `components/dashboard/NewItemDialog.tsx` (lines 119–129) and the surrounding `id` state (`setId`, reset effect, request body).
- Stop sending `id` in the create-item request body so the server is the sole authority on item IDs.
- Confirm the edit dialog (`components/dashboard/ItemDetailDialog.tsx`) does not allow editing the ID. It currently renders `item.id` as read-only text on line 148 — keep that display, but verify no other affordance (rename, slug edit) leaks in.
- Tighten the create API route `app/api/workflows/[id]/items/route.ts` to ignore (or reject) a client-supplied `id` so the field cannot be set by other clients (curl, scripts) either.

**Out of scope**
- Changing the underlying ID generator in `lib/workflow-store.ts` (`createItem`) — auto-generation already exists; we are only removing the user-facing override.
- Migrating or renaming existing non-conforming item folders (e.g. `.nos/workflows/requirements/items/refactor heart beat/`).
- Any change to how IDs are displayed in Kanban cards, sidebar, or detail view.
- Comment IDs, stage IDs, workflow IDs.

### Feasibility
- **Technically trivial.** The change is a UI removal plus dropping one optional field from the POST body. Both files are already touched in the working tree, so no merge friction.
- **Risk: API contract.** The POST `/api/workflows/[id]/items` route currently validates and forwards `body.id`. Removing the UI field is harmless on its own, but to fully deliver the requirement the route should also stop honoring `id` — otherwise non-UI callers can still inject one. Need to decide between *silently ignore* vs. *reject with 400*. Silent ignore is safer for backward compatibility; reject is clearer.
- **Risk: agent/skill callers.** The NOS skills (`nos-set-status`, `nos-comment-item`, etc.) and any agent-adapter code may rely on creating items with a specific id. Need to grep `lib/agent-adapter.ts`, `.claude/skills/`, and `lib/auto-advance*.ts` for callers that pass `id` to the create endpoint before tightening the API.
- **Unknowns**
  - Whether any existing automation depends on supplying a custom ID.
  - Whether the spec wants the ID field hidden only from the UI, or fully removed from the API surface as well.

### Dependencies
- `components/dashboard/NewItemDialog.tsx` — primary UI surface to change.
- `components/dashboard/ItemDetailDialog.tsx` — verify no editable ID input exists.
- `app/api/workflows/[id]/items/route.ts` — owns server-side validation of the incoming `id`.
- `lib/workflow-store.ts` — `createItem` signature still accepts `id`; we may keep it (for tests/migration) or drop it depending on the scope decision below.
- `types/workflow.ts` — check whether the create payload type exposes `id` and adjust if so.
- Indirect: any caller that posts to `/api/workflows/<id>/items` (skills, scripts, tests).

### Open questions
1. Should the create API **reject** a client-supplied `id` (HTTP 400) or **silently ignore** it? The requirement title only says "remove" from the form — server behavior is ambiguous.
2. Same question for edit: should we explicitly forbid `id` in the PATCH/PUT body of `app/api/workflows/[id]/items/[itemId]/route.ts`, or is removing it from the UI sufficient since the route currently has no rename path?
3. Are there existing automated callers (skills, agent adapters, tests) that pass a custom `id` and would break if the server stopped honoring it?
4. Should we keep the `createItem({ id })` parameter in `lib/workflow-store.ts` for internal use (seeding, tests) or remove it entirely for symmetry?
5. Does this requirement also imply renaming or quarantining the existing non-conforming folder `refactor heart beat/`, or is cleanup explicitly a separate concern?

## Specification

### User stories

1. As an operator creating a new workflow item, I want the New Item dialog to ask me only for title, body, and stage, so that I don't have to invent or worry about an ID format.
2. As an operator editing an existing item, I want the item's ID to remain a stable, read-only identifier, so that links, comments, and folder paths never break under me.
3. As a maintainer of the workflow store, I want the server to be the single authority on item IDs, so that two clients cannot collide on a custom slug or smuggle in a malformed ID.
4. As a script or agent author calling the items API, I want a predictable contract — supplying `id` is harmless and silently dropped — so that older callers do not break when the field is retired.

### Acceptance criteria

1. **AC1 — UI: ID field removed from create dialog.**
   Given the user opens the New Item dialog (`components/dashboard/NewItemDialog.tsx`), when the dialog renders, then no input labeled "ID" (or equivalent) is visible, and the form contains only the fields needed for title, body, and stage selection.
2. **AC2 — UI state: id state removed.**
   The component must not declare `id` / `setId` state, must not include `id` in its reset effect, and must not include `id` in the JSON body of its create-item POST.
3. **AC3 — Create POST body shape.**
   When the New Item dialog submits, the request body sent to `POST /api/workflows/[id]/items` must not contain an `id` key.
4. **AC4 — Server ignores client-supplied id on create.**
   Given a POST to `/api/workflows/[id]/items` with a body that includes an `id` field, when the server handles the request, then the supplied `id` is ignored and the server-generated ID (from `lib/workflow-store.ts → createItem`) is used. The request must succeed with 2xx; no 400 is returned for the presence of `id`.
5. **AC5 — Server ignores client-supplied id on edit.**
   Given a PATCH/PUT to `/api/workflows/[id]/items/[itemId]` with a body that includes an `id` field, when the server handles the request, then `id` is silently dropped from the update payload and the existing item ID is preserved. The response must reflect the unchanged `id`.
6. **AC6 — Edit dialog displays ID read-only.**
   Given the user opens the Item Detail dialog (`components/dashboard/ItemDetailDialog.tsx`), when the dialog renders, then `item.id` is shown as static, non-editable text (the existing line-148 display), and there is no input, contenteditable, or button affordance for renaming the ID.
7. **AC7 — Internal `createItem({ id })` is preserved.**
   The `createItem` function in `lib/workflow-store.ts` must continue to accept an optional `id` parameter so that seeding, tests, and internal migrations can still construct items with a known ID. Only the HTTP boundary stops honoring it.
8. **AC8 — Type definitions reflect the new payload.**
   If `types/workflow.ts` exposes a create-payload type used by the dialog or the route handler, the `id` field on that type must be removed (or marked as never accepted from clients) so TypeScript would flag any new caller that tries to send one.
9. **AC9 — No regression for non-UI callers.**
   Existing callers of `POST /api/workflows/[id]/items` and `PATCH /api/workflows/[id]/items/[itemId]` (NOS skills, agent adapter, auto-advance sweeper, tests) continue to work unchanged. If any current caller passes `id`, that call still succeeds; the server simply ignores the field.

### Technical constraints

- **Files in scope (edit):**
  - `components/dashboard/NewItemDialog.tsx` — remove ID input, `id` state, reset, and request-body field.
  - `app/api/workflows/[id]/items/route.ts` — drop `id` from the body before passing to `createItem`; do not return 400 if it is present.
  - `app/api/workflows/[id]/items/[itemId]/route.ts` — strip `id` from the update payload before applying.
  - `types/workflow.ts` — remove `id` from any client-facing create payload type, if present.
- **Files in scope (verify only, no behavior change):**
  - `components/dashboard/ItemDetailDialog.tsx` (line 148) — confirm read-only display, no editable ID affordance.
  - `lib/workflow-store.ts` — `createItem` signature retains the optional `id` parameter for internal callers.
- **API contract:** silent ignore (not 400 reject) for any client-supplied `id` on create or edit. This preserves backward compatibility for existing skills and agent callers per AC9.
- **ID generation:** continues to come from `lib/workflow-store.ts → createItem`'s existing auto-generator. This requirement does not change the format, sequence, or width of generated IDs.
- **Performance:** no measurable impact expected; this is a UI removal plus one field deletion in two route handlers.
- **Compatibility:** existing items, folders, and comments retain their current IDs unchanged. Existing non-conforming folders (e.g. `refactor heart beat/`) are untouched.

### Out of scope

- Changing the auto-ID generator in `lib/workflow-store.ts` (format, prefix, padding, or sequence).
- Renaming, migrating, or quarantining existing non-conforming item folders such as `.nos/workflows/requirements/items/refactor heart beat/`.
- Any changes to how IDs are displayed in Kanban cards, sidebar, or item detail view (other than verifying the detail view's read-only display).
- Comment IDs, stage IDs, workflow IDs, and skill/tool IDs — unchanged.
- Returning HTTP 400 when a client sends `id`. The contract is silent-ignore, not reject.
- Removing the optional `id` parameter from `createItem` in `lib/workflow-store.ts` (kept for seeding and tests).
- Any audit log or telemetry of dropped `id` fields.

## Validation

Verdict: **Implementation was not performed.** No `## Implementation Notes` section exists in `index.md`, and the in-scope source files still contain the pre-spec behavior. Five of nine ACs fail; three pass; one is N/A. Item must remain in Implementation/Validation until the work is done.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 — UI: ID field removed from create dialog | ❌ Fail | `components/dashboard/NewItemDialog.tsx:119-129` still renders the `<label htmlFor="new-item-id">ID</label>` and the corresponding `<Input id="new-item-id" …>`. |
| AC2 — UI state: `id`/`setId` removed | ❌ Fail | `NewItemDialog.tsx:41` declares `const [id, setId] = useState('')`; `:51` resets via `setId('')`; `:72` includes `...(id.trim() ? { id: id.trim() } : {})` in the POST body. |
| AC3 — Create POST body shape excludes `id` | ❌ Fail | Same line `:72` — when the user fills the ID field, the request body still contains an `id` key. |
| AC4 — Server ignores client-supplied `id` on create | ❌ Fail | `app/api/workflows/[id]/items/route.ts:48-53` passes `id: typeof body.id === 'string' ? body.id : undefined` straight to `createItem`, and `lib/workflow-store.ts:428-437` honors it as `explicitId`. The client-supplied id is *not* dropped. |
| AC5 — Server ignores client-supplied `id` on edit | ✅ Pass | `app/api/workflows/[id]/items/[itemId]/route.ts` PATCH handler (lines 36-112) only constructs `patch` from a fixed allow-list (`title`, `stage`, `status`, `comments`); any incoming `body.id` is dropped silently and the URL-derived `itemId` is preserved. |
| AC6 — Edit dialog displays ID read-only | ✅ Pass | `components/dashboard/ItemDetailDialog.tsx:148` renders `<p className="font-mono text-[11px] text-muted-foreground">{item.id}</p>` — static text, no input/contenteditable/button affordance for renaming. |
| AC7 — Internal `createItem({ id })` is preserved | ✅ Pass | `lib/workflow-store.ts:405-448` — `createItem` still accepts `input.id` and uses it as `explicitId` when provided. Signature is intact for seeding/tests. |
| AC8 — Type definitions reflect the new payload | ⚠️ N/A | `types/workflow.ts` exposes only `WorkflowItem` (which legitimately has `id` as the natural identifier of a stored item) and has no separate client-side create-payload type. There is no exported type to update. The create-route uses an inline `Record<string, unknown>` body shape; nothing in the type system would flag a stray client `id`. Treat as N/A unless the spec authors intend a new payload type to be introduced. |
| AC9 — No regression for non-UI callers | ✅ Pass (vacuously) | Because no behavioral change was made to either route, all existing callers continue to behave exactly as before. (This will need to be re-verified once AC4 is implemented.) |

### Regressions / adjacent checks
- No regressions detected in `ItemDetailDialog.tsx` — the read-only ID display is unchanged.
- The PATCH route's allow-list pattern (AC5) is robust against future field additions because it only forwards explicitly-named fields.
- No tests were added or modified for this requirement.

### Follow-ups required before this item can be marked Done
1. **Edit `components/dashboard/NewItemDialog.tsx`** — delete the ID `<label>`/`<Input>` block at lines 119-129, remove the `const [id, setId] = useState('')` declaration (line 41), remove `setId('')` from the reset effect (line 51), and remove the `...(id.trim() ? { id: id.trim() } : {})` spread from the POST body (line 72).
2. **Edit `app/api/workflows/[id]/items/route.ts`** — drop the `id: typeof body.id === 'string' ? body.id : undefined` line from the `createItem` call (line 50) so a client-supplied id is silently ignored. Keep the `body.id !== undefined && typeof body.id !== 'string'` type-check removed too, since `id` is no longer part of the contract; alternatively leave the type-check as a defensive no-op but do *not* return 400.
3. **(Optional) `types/workflow.ts`** — if the team wants AC8 to bite, introduce an explicit `CreateItemRequest` type (without `id`) and have both the dialog and the route reference it. Otherwise document AC8 as N/A in the spec.
4. **Re-run validation** after the edits above. AC4 should be re-verified with a `curl -X POST … -d '{"title":"x","id":"REQ-99999"}'` and confirmation that the response's `id` is the auto-generated one, not `REQ-99999`.

Item left in **Implementation/Validation** with status **Failed** so that the operator can reset it to Todo and re-run the pipeline once the implementation is performed.
