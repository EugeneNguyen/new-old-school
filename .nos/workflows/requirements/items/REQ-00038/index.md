## Analysis

### Scope

**In scope**

* Remove the optional "ID" input field from the New Item dialog (`components/dashboard/NewItemDialog.tsx`, lines 119–129) and its associated state/reset logic (`id`, `setId`, the `id` entries in `useEffect` and the POST body at lines 41, 51, 72).
* The dialog should always rely on server-side auto-generation of the item ID; the user can no longer specify one from this UI.

**Out of scope**

* The POST `/api/workflows/[id]/items` endpoint still accepts an optional `id` in its JSON body (route.ts:29–31, 50). No server contract change is required — other callers (scripts, future dialogs, API consumers) can keep supplying explicit IDs.
* The auto-ID generation algorithm inside `createItem` (`lib/workflow-store.ts`) is unchanged.
* No migration of existing items; this is a UI-only change.
* No removal of the capability to hand-author an item directory under `.nos/workflows/<id>/items/<ID>/` on disk.

### Feasibility

* Low technical risk. The change is localized to one component; the back end already treats `id` as optional and the POST call spreads it conditionally.
* No new dependencies, no schema changes, no data migration.
* Bundle/perf impact: negligible (one `<Input>` and a small `useState` removed).
* Accessibility: the removed field has a visible label and no other control references it, so nothing else needs rewiring.
* Risk: none identified. There is no automated UI test for this dialog in the repo today, so a manual smoke test (open dialog → create item → confirm auto-generated ID like `REQ-xxxxx` appears) is the validation step.

### Dependencies

* `components/dashboard/NewItemDialog.tsx` — the only file that must change.
* `app/api/workflows/[id]/items/route.ts` — read-only dependency; confirms `id` is optional, no change needed.
* `lib/workflow-store.ts#createItem` — read-only dependency; owns ID auto-generation and is already exercised when `id` is omitted.
* No other component currently imports or reuses the ID input, so there is no ripple into `KanbanBoard`, `ItemDetailDialog`, or the sidebar.

### Open questions

1. Should the auto-generated ID be surfaced to the user after creation (e.g. a toast, or focus the new card) now that they no longer see/choose it up front? The current behavior just closes the dialog and relies on the new card appearing in the Kanban column.
2. Do we want to keep the API's optional `id` parameter for power users / scripting, or is this requirement a signal to eventually tighten the server side as well? Current analysis assumes we keep the API flexible.
3. Is there any existing workflow or requirement item whose process relies on humans picking the ID (for example, to encode a topic prefix)? A quick grep of `.nos/workflows/requirements/items/` shows only `REQ-NNNNN` numeric IDs, suggesting no such convention — worth confirming with the product owner before removing the field.

## Specification

### User stories

1. As a user creating a new workflow item, I want the New Item dialog to only ask for the information I actually need (title, description, stage), so that I am not distracted by an optional technical field.
2. As a user creating a new workflow item, I want the item's ID to be assigned automatically, so that I do not have to invent or look up a free ID myself.
3. As a power user or script author, I want the `POST /api/workflows/[id]/items` endpoint to keep accepting an optional `id` in the request body, so that existing tooling and hand-authored item directories continue to work unchanged.

### Acceptance criteria

1. **Given** the New Item dialog is open, **when** the user inspects the form, **then** no input, label, or helper text referencing "ID" is rendered. (The `<label htmlFor="new-item-id">…</label>` block and its `<Input id="new-item-id" …>` at `components/dashboard/NewItemDialog.tsx` lines 119–129 are removed.)
2. **Given** the New Item dialog component source, **when** inspected, **then** the `id` local state, `setId` setter, the `setId('')` reset in the `useEffect`, and the `...(id.trim() ? { id: id.trim() } : {})` spread in the POST body are all removed. No other `id`/`setId` reference referring to the item ID remains in the file. (Unrelated `id` props such as `id="new-item-description-label"` or `encodeURIComponent(workflowId)` are unaffected.)
3. **Given** the New Item dialog is open with a valid title, **when** the user submits the form, **then** the request body sent to `POST /api/workflows/{workflowId}/items` is a JSON object containing `title` (trimmed), plus `body` and/or `stage` only when non-empty, and **does not** contain an `id` property.
4. **Given** a successful submission, **when** the server responds with a `WorkflowItem`, **then** the dialog closes, `onCreated(created)` is invoked with the returned item, and the new card appears in the appropriate Kanban column with an auto-generated ID in the form `REQ-NNNNN` (or the workflow's equivalent prefix from `lib/workflow-store.ts#createItem`).
5. **Given** the user submits the dialog with an empty or whitespace-only title, **when** the submit handler runs, **then** the error message "Title is required" is shown and no network request is made. (Existing behavior preserved.)
6. **Given** the server returns a non-OK response, **when** the submit handler runs, **then** the returned error text (or a status-based fallback) is displayed inline in the dialog and `submitting` returns to `false`. (Existing behavior preserved.)
7. **Given** the dialog is reopened after a prior session, **when** the reset `useEffect` fires, **then** `title`, `body`, `stage`, and `error` are reset to their initial values and the description editor is remounted (via `editorNonce`). No residual ID state exists to reset.
8. **Given** the API route `app/api/workflows/[id]/items/route.ts`, **when** a client (e.g. a script) sends a POST body containing an explicit `id`, **then** the endpoint still accepts it and uses that ID (no server-side change is made as part of this requirement).
9. **Given** the codebase after the change, **when** searched for references to the removed element, **then** no component imports, tests, or stories reference a `new-item-id` input or the dialog's former `id`/`setId` state.

### Technical constraints

* **File to change**: `components/dashboard/NewItemDialog.tsx` (only file in scope).
* **File contract — unchanged**: `app/api/workflows/[id]/items/route.ts` keeps accepting `{ title, id?, body?, stage? }` in the POST body and continues to delegate auto-ID generation to `lib/workflow-store.ts#createItem` when `id` is omitted.
* **Request shape after change**: the dialog's POST body must be exactly `{ title: string, body?: string, stage?: string }` (no `id`, no other new fields).
* **Framework/runtime**: Next.js App Router client component (`'use client'`); React hooks (`useState`, `useEffect`); existing `@/components/ui/*` primitives. No new dependencies may be added.
* **Styling/layout**: the remaining form fields (Description, Stage selector, etc.) should keep their current visual order and spacing. Removing the ID field must not leave an orphan gap `<div>` with no children.
* **Accessibility**: no other control references the removed `htmlFor="new-item-id"` label, so no `aria-*` wiring needs updating. Autofocus remains on the title input.
* **Types**: no change to `WorkflowItem`, `ItemStatus`, or `Stage` from `@/types/workflow`.
* **Performance/bundle**: net negative — one `<Input>`, one label block, one `useState<string>`, and one reset line are removed. No measurable runtime impact expected.
* **Validation**: a manual smoke test is the acceptance method — open the dialog, create an item, confirm the new card appears with an auto-generated `REQ-NNNNN`-style ID. There is no existing automated UI test for this dialog, and this requirement does not add one.

### Out of scope

* Changing the `POST /api/workflows/[id]/items` endpoint contract (the optional `id` body field stays).
* Changing the auto-ID generation algorithm in `lib/workflow-store.ts#createItem`.
* Data migration or renaming of any existing item on disk under `.nos/workflows/<id>/items/`.
* Removing the ability to hand-author an item directory with a chosen ID outside the UI.
* Surfacing the newly generated ID to the user post-creation (toast, focus-the-new-card, etc.) — current behavior of simply closing the dialog and letting the card appear in its column is preserved.
* Adding automated tests (unit, integration, or E2E) for the dialog.
* Any change to `KanbanBoard`, `ItemDetailDialog`, `Sidebar`, or other consumers — none import or depend on the removed field.

## Implementation Notes

Edited `components/dashboard/NewItemDialog.tsx` only:

- Removed the `id`/`setId` `useState` declaration.
- Removed `setId('')` from the open-reset `useEffect`.
- Removed the `...(id.trim() ? { id: id.trim() } : {})` spread from the POST body; request now sends `{ title, body?, stage? }`.
- Removed the `<label htmlFor="new-item-id">` block and its `<Input id="new-item-id" …>` from the form.

No server-side change (`app/api/workflows/[id]/items/route.ts` still accepts an optional `id`). No other consumers referenced the removed field; grep for `new-item-id`/`setId` in the file returns nothing. All 9 acceptance criteria satisfied; no deviations.

## Validation

Verified against `components/dashboard/NewItemDialog.tsx` (post-change), `app/api/workflows/[id]/items/route.ts`, and `lib/workflow-store.ts#createItem`. `npx tsc --noEmit` passes with no output.

- **AC1 — No ID input/label rendered** ✅ `components/dashboard/NewItemDialog.tsx` contains no `<label htmlFor="new-item-id">` or `<Input id="new-item-id" …>` block; repo-wide `grep new-item-id` returns only `.nos/workflows/requirements/items/**` docs, no source hits.
- **AC2 — `id` state, setter, reset, spread all removed** ✅ `grep -n '\bsetId\b'` in the file returns no matches; the useState block at lines 40–45 declares only `title/body/stage/submitting/error/editorNonce`; the reset `useEffect` at lines 47–54 has no `setId('')`; the POST body at lines 68–72 has no `id` spread.
- **AC3 — Request body is `{ title, body?, stage? }`** ✅ lines 68–72 build exactly `JSON.stringify({ title: title.trim(), ...(body ? { body } : {}), ...(stage ? { stage } : {}) })`; no `id` field.
- **AC4 — Auto-generated ID appears on new card** ✅ When `input.id` is omitted, `lib/workflow-store.ts#createItem` falls through to `finalId = nextPrefixedId(itemsRoot, config.idPrefix)` (line 466), producing the workflow's `REQ-NNNNN`-style ID; `onCreated(created)` is invoked at `NewItemDialog.tsx:78` with the server's returned item, and `onOpenChange(false)` closes the dialog.
- **AC5 — Empty-title validation preserved** ✅ `handleSubmit` at lines 56–61 sets `error = 'Title is required'` and returns before `setSubmitting(true)` or any `fetch` call when `!title.trim()`.
- **AC6 — Non-OK response shown inline** ✅ lines 74–76 throw `new Error((await res.text()) || 'Request failed: ${res.status}')`; the catch at 80–85 sets `error` to the message and the `finally` clause restores `submitting = false`; the error banner renders at lines 174–178.
- **AC7 — Reopen reset** ✅ `useEffect` at 47–54 resets `title`, `body`, `stage` (to `stages[0]?.name ?? ''`), `error`, and bumps `editorNonce` to remount the editor. No residual ID state exists.
- **AC8 — API still accepts optional `id`** ✅ `app/api/workflows/[id]/items/route.ts` lines 29–31 validate `body.id` only when provided; line 50 forwards `body.id` to `createItem` when it is a string. No change was made to the route.
- **AC9 — No lingering references** ✅ `grep -r 'new-item-id'` has zero source hits; `grep -n '\bsetId\b'` in `NewItemDialog.tsx` returns no matches.

No regressions observed: the adjacent Description editor, Stage selector, Status badge, Cancel/Create buttons, and close-X control are untouched by the diff; Kanban/ItemDetail/Sidebar consumers never imported the removed field. All 9 acceptance criteria pass; item ready to advance.
