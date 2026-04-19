## Analysis

### 1. Scope

**In scope**

* Redesign `components/dashboard/NewItemDialog.tsx` so its layout, sizing, and control set mirror `components/dashboard/ItemDetailDialog.tsx`:
  * Larger dialog (`max-w-4xl`) with a main content area (title + description) and a right-hand sidebar (stage, status).
  * Title input in the header.
  * Markdown description editor (`MDEditor`) wired to the same `@uiw/react-md-editor` component and styling as the detail dialog.
  * Stage picker in the sidebar showing all workflow stages; **default selection is the first stage**.
  * Status shown in the sidebar, fixed to **Todo** (rendered, not user-editable) on creation.
  * Optional `ID` field kept (auto-generated when blank) — this is the only new-only field the detail dialog does not have.
* Send the new fields (`title`, `body`, `stage`, optional `id`) to `POST /api/workflows/[id]/items`, which already accepts all of them (see `app/api/workflows/[id]/items/route.ts:25-53`).
* Keep the existing callback contract (`onCreated(item)`) so `KanbanBoard` continues to work without changes.

**Out of scope**

* Changing the backend item-creation API or `createItem` in `lib/workflow-store.ts`.
* Making `status` selectable on creation — the requirement pins it to `Todo`.
* Editing comments on a not-yet-created item (comments section is detail-only, since there is no item id to attach to).
* Triggering the stage pipeline differently; the existing `triggerStagePipeline` call on POST remains unchanged.
* Restructuring `ItemDetailDialog` or extracting a shared component in this pass (see Open questions #1).

### 2. Feasibility

Technically straightforward. All required pieces already exist:

* The POST route accepts `title`, `id`, `body`, and `stage` and validates `stage` against `readStages` (`app/api/workflows/[id]/items/route.ts:32-46`).
* `ItemDetailDialog` already demonstrates the exact visual pattern (MDEditor + sidebar stage/status list).
* `KanbanBoard` passes `firstStageName` into the dialog today, so the "default first stage" can be derived the same way — or from a `stages` prop for the full picker list.

**Risks / unknowns**

* **Markdown editor on create**: `MDEditor` is dynamically imported with `{ ssr: false }`; first open will incur a small load. Acceptable since the detail dialog already pays this cost.
* **Dialog size jump**: Going from `max-w-md` to `max-w-4xl` is a visible UX change. Confirm this is desired (it is implied by "similar to update item modal").
* **Auto-pipeline trigger on create**: `POST /items` already runs `triggerStagePipeline` after creation. If a user picks a non-first stage, the pipeline fires for that stage immediately. This mirrors current behavior when creating in the first stage; flag in docs but no code change needed.
* **Duplication vs. shared component**: The two dialogs will share \~70% of their markup. We can either accept duplication now or extract an `ItemFormFields` component. Recommend duplication for this requirement (smaller blast radius) and revisit later.

### 3. Dependencies

* `components/dashboard/NewItemDialog.tsx` — primary file to edit.
* `components/dashboard/ItemDetailDialog.tsx` — reference for layout, MDEditor config, and sidebar styling.
* `components/dashboard/KanbanBoard.tsx` — caller; currently passes `firstStageName`. Likely needs to also pass the full `stages` array (already available there).
* `app/api/workflows/[id]/items/route.ts` — target endpoint, no changes expected.
* `lib/workflow-store.ts` — `createItem` already supports `body` and `stage`.
* `@uiw/react-md-editor`, `@uiw/react-markdown-preview`, `lib/markdown-preview` — reused as-is.
* `types/workflow.ts` — `WorkflowItem`, `Stage`, `ItemStatus` types reused.

No DB/schema migration, no new npm dependency, no API contract change.

### 4. Open questions

1. **Shared component now or later?** Should we extract a common `<ItemForm />` used by both dialogs, or duplicate the layout in `NewItemDialog` and plan a refactor ticket? (Recommendation: duplicate now, refactor later.)
2. **Status control**: Show status as a read-only "Todo" badge in the sidebar, or omit it entirely from the new-item dialog? (Recommendation: show it disabled/read-only so the layout visually matches the detail dialog.)
3. **ID field placement**: Keep the optional `ID` input as a small field under the title, move it into the sidebar as metadata, or hide behind an "Advanced" disclosure? (Recommendation: keep visible under title, matching current simple input.)
4. **Auto-focus target**: Title (current behavior) or description? (Recommendation: title — users almost always type a title first.)
5. **Comments section**: Render an empty "Comments" placeholder in new-item mode for visual parity, or omit? (Recommendation: omit — no item exists yet, and it would be confusing.)
6. **Stage change triggers pipeline on create**: If a user selects a non-first stage, the pipeline runs for that stage immediately on POST. Is that desired, or should first-stage creation be enforced when created from this dialog? (Recommendation: allow any stage; matches detail-dialog parity and existing API behavior.)

## Specification

### 1. User stories

1. **As a** workflow user, **I want** the "New item" dialog to look and feel like the item-detail dialog, **so that** creating and editing items use the same mental model and muscle memory.
2. **As a** workflow user, **I want** to enter a rich markdown description when creating an item, **so that** I don't have to create it empty and then immediately re-open it to add details.
3. **As a** workflow user, **I want** to pick the starting stage from a sidebar list (pre-selected to the first stage), **so that** I can drop the item into the right column without dragging it afterwards.
4. **As a** workflow user, **I want** the status area to visibly show "Todo" at creation time, **so that** the sidebar mirrors the detail dialog and I understand new items always start in Todo.
5. **As a** workflow user, **I want** the optional ID field preserved, **so that** I can still pin a specific identifier (e.g. `REQ-00031`) when needed without losing the parity with the detail dialog layout.

### 2. Acceptance criteria

#### Layout & sizing

1. **Given** the user opens the new-item dialog, **When** it renders, **Then** the `Dialog` root uses `max-w-4xl` (matching `ItemDetailDialog`) instead of `max-w-md`.
2. The dialog is organized with a header (title input), a two-column body (main content + right-hand sidebar), and a footer (Cancel / Create buttons), visually consistent with `ItemDetailDialog`.

#### Title

1. **Given** the dialog is open, **When** it first appears, **Then** the title input is rendered in the header row and receives auto-focus.
2. **Given** the user tries to submit with an empty or whitespace-only title, **When** they click "Create", **Then** submission is blocked and an inline error `"Title is required"` is shown; no network call is made.

#### Description (markdown editor)

1. **Given** the dialog is open, **When** the main content area renders, **Then** a markdown editor is present using the same component/configuration as the detail dialog (`ItemDescriptionEditor`, dynamically imported with `{ ssr: false }`).
2. **Given** the user types markdown in the description editor, **When** they submit, **Then** the entered string is sent as `body` on the POST request.
3. **Given** the user leaves the description empty, **When** they submit, **Then** `body` is either omitted or sent as an empty string; the server must accept the request (current backend already tolerates this).

#### Stage picker (sidebar)

1. **Given** the dialog opens, **When** the sidebar renders, **Then** it shows a `Stage` section listing **all** workflow stages (passed in via props, not just the first stage name).
2. **Given** the sidebar renders on open, **When** no stage has been manually chosen yet, **Then** the first stage from the `stages` array is pre-selected.
3. **Given** the user clicks a different stage row, **When** the click completes, **Then** that stage becomes the selected stage and is visually highlighted (same active-row styling pattern as `ItemDetailDialog`).
4. **Given** the user submits, **When** the POST body is built, **Then** it includes `stage: <selectedStageName>`.

#### Status (sidebar, read-only)

1. **Given** the dialog opens, **When** the sidebar renders, **Then** it shows a `Status` section displaying a single `Todo` badge using the same `Badge` variant as in `ItemDetailDialog` (`STATUS_VARIANT.Todo = 'secondary'`).
2. **Given** the status is rendered, **When** the user clicks it, **Then** nothing happens — status is not user-editable in the new-item dialog.
3. The POST body does **not** include a `status` field (status defaults are set by `createItem` / `POST` route; current behavior preserved).

#### ID field

1. **Given** the dialog opens, **When** the main content area renders, **Then** an optional `ID` input is displayed beneath the title input area (keeping its current placement), labeled `ID (optional, auto-generated)`.
2. **Given** the user enters a non-empty ID, **When** they submit, **Then** `id` is included (trimmed) in the POST body; if blank, `id` is omitted and the server auto-generates one.

#### Submit flow

1. **Given** the user clicks "Create" with a valid title, **When** the request is sent, **Then** it goes to `POST /api/workflows/<workflowId>/items` with JSON body `{ title, body?, stage, id? }`.
2. **Given** the POST succeeds, **When** the response returns a `WorkflowItem`, **Then** `onCreated(item)` is invoked and the dialog closes.
3. **Given** the POST fails (non-2xx), **When** the error is received, **Then** the dialog stays open and shows the server error text (or a generic message) in the same inline-error pattern as today.

#### Reset behavior

1. **Given** the dialog closes and re-opens, **When** it appears, **Then** title, ID, body, and error are reset; stage selection resets to the first stage; status display resets to `Todo`.

#### Caller wiring

1. `KanbanBoard.tsx` passes a `stages: Stage[]` prop to `NewItemDialog` alongside or in place of `firstStageName`; the dialog derives the default stage from `stages[0].name`.
2. Existing external behavior (`onCreated` callback signature, kanban refresh on creation) is unchanged.

#### Comments section

1. The new-item dialog does **not** render a comments area. No empty placeholder, no input.

### 3. Technical constraints

* **Files**
  * Primary edit: `components/dashboard/NewItemDialog.tsx`.
  * Caller update: `components/dashboard/KanbanBoard.tsx` (add `stages` prop to the `<NewItemDialog />` usage).
  * Reference only (no edits): `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/ItemDescriptionEditor.tsx`.
  * No changes to `app/api/workflows/[id]/items/route.ts` or `lib/workflow-store.ts`.
* **Props (new shape)**
  ```ts
  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workflowId: string;
    stages: Stage[];                 // NEW — full stage list for picker + default
    onCreated: (item: WorkflowItem) => void;
  }
  ```
  The previous `firstStageName` prop may be removed; the first stage is derived from `stages[0]`.
* **Types**: reuse `WorkflowItem`, `Stage`, `ItemStatus` from `types/workflow.ts`. Status literal `'Todo'` is used for display only.
* **API contract (unchanged)**
  * `POST /api/workflows/:id/items` accepts `{ title: string; id?: string; body?: string; stage?: string }`.
  * Response: newly created `WorkflowItem`.
  * Server-side `triggerStagePipeline` continues to fire for the created item's stage; no client-side change required.
* **UI components**: `Dialog`, `Button`, `Input`, `Badge` from `components/ui/*`. Markdown editor must be imported via `dynamic(() => import('./ItemDescriptionEditor'), { ssr: false })` — do not import statically (Next.js SSR constraint; MDEditor has no SSR support).
* **Styling**
  * Dialog width: `max-w-4xl`.
  * Sidebar: right-side column using the same layout classes as `ItemDetailDialog` (border, padding, section headings, stage row active/hover states).
  * Status badge variant map: reuse `STATUS_VARIANT` or an equivalent local constant; `Todo` → `'secondary'`.
* **State reset**: title, id, body, stage, and error are reset inside a `useEffect` keyed on `open` (and on `stages[0]?.name` changing while open, to cover the edge case of stages changing between opens).
* **Validation**: client-side `title.trim()` non-empty; server handles `id` collision and `stage` validity (returns 4xx, surfaced as inline error).
* **Accessibility**: preserve `aria-label="Close"` on the close button; title input retains `autoFocus`; stage picker rows should be focusable buttons (`<button type="button">`) so keyboard users can select a stage.
* **No new dependencies** added to `package.json`.

### 4. Out of scope

* Extracting a shared `ItemForm` component between `NewItemDialog` and `ItemDetailDialog` (tracked separately).
* Making status editable at creation time.
* Rendering or enabling comments in the new-item dialog.
* Changes to the items POST route, `createItem`, `triggerStagePipeline`, or any workflow-store logic.
* Restricting creation to the first stage only — any stage in `stages[]` is selectable, matching current API behavior.
* Changes to the detail dialog's layout, styles, or behavior.
* Visual redesign beyond the layout/control parity described above (no new icons, color tokens, or spacing tokens).
* Migration of older callers — `KanbanBoard` is the only caller of `NewItemDialog`.

## Implementation Notes

* `components/dashboard/NewItemDialog.tsx` rewritten:
  * `Dialog` widened to `max-w-4xl`; layout is now header (title input + close) / two-column body (main + sidebar) / footer (Cancel / Create), mirroring `ItemDetailDialog`.
  * Title input lives in the header, autofocused; client-side `Title is required` inline error preserved.
  * Optional `ID` input kept under the title in the main column (per spec recommendation, not in the sidebar).
  * Markdown description editor uses `dynamic(() => import('./ItemDescriptionEditor'), { ssr: false })`; body is sent on the POST when non-empty.
  * Sidebar `Stage` section lists every workflow stage as focusable buttons with the same active/hover styling as `ItemDetailDialog`; default selection is `stages[0].name`, reset whenever the dialog opens or `stages` changes.
  * Sidebar `Status` section renders a single non-interactive `Todo` row with the `secondary` `Badge` variant; status is never sent in the POST body.
  * Reset `useEffect` clears `title`, `id`, `body`, `stage`, and `error` on open and when `stages` changes.
* `components/dashboard/KanbanBoard.tsx` now passes `stages={stages}` to `<NewItemDialog />` in place of `firstStageName`.
* No backend, store, or dependency changes. Comments section intentionally omitted from the new-item dialog (acceptance criterion 23).
* Deviation: spec text in §2 acceptance #5 says "same component/configuration as the detail dialog (`ItemDescriptionEditor`...)", but `ItemDetailDialog` still uses `@uiw/react-md-editor` directly. Followed the explicit technical constraint that names `./ItemDescriptionEditor` and the dynamic-import requirement; `ItemDetailDialog` was intentionally left untouched per the "Reference only (no edits)" constraint.

## Validation

Evidence sources: static read of `components/dashboard/NewItemDialog.tsx` (rewritten), `components/dashboard/KanbanBoard.tsx` (caller), `components/dashboard/ItemDetailDialog.tsx` (reference), `app/api/workflows/[id]/items/route.ts` (unchanged); `npx tsc --noEmit` on the full project; live dev server on `http://localhost:30128` returning the `requirements` workflow with populated stages.

### Layout & sizing
- ✅ **AC1 — `max-w-4xl`**: `Dialog` receives `className="max-w-4xl"` at `NewItemDialog.tsx:90`, matching `ItemDetailDialog.tsx:145`.
- ✅ **AC2 — header / two-col body / footer**: header at `NewItemDialog.tsx:92-113`, two-column grid `md:grid-cols-[1fr_220px]` at `:115`, footer at `:192-204`, mirroring the detail dialog structure.

### Title
- ✅ **AC1 — autoFocus in header**: `<Input ... autoFocus />` inside the header div at `NewItemDialog.tsx:97-103`.
- ✅ **AC2 — required validation**: `handleSubmit` short-circuits with `setError('Title is required')` when `title.trim()` is empty at `:58-61`; no `fetch` is issued in that branch.

### Description (markdown editor)
- ✅ **AC1 — `ItemDescriptionEditor` via dynamic import**: `const ItemDescriptionEditor = dynamic(() => import('./ItemDescriptionEditor'), { ssr: false })` at `:13-15`, rendered at `:136-141`.
- ✅ **AC2 — body sent**: request body spreads `...(body ? { body } : {})` at `:71`; non-empty markdown is forwarded as `body`.
- ✅ **AC3 — empty body tolerated**: when `body` is falsy the key is omitted, and `app/api/workflows/[id]/items/route.ts:32-33` only rejects `body` when it is defined and non-string.

### Stage picker (sidebar)
- ✅ **AC1 — renders all stages from props**: sidebar maps `stages.map((s) => ...)` at `:151`, matching the detail dialog's stage list.
- ✅ **AC2 — default is `stages[0].name`**: `const defaultStage = stages[0]?.name ?? ''` and the reset `useEffect` sets `setStage(stages[0]?.name ?? '')` at `:52`.
- ✅ **AC3 — click selects + highlights**: each row is a `<button type="button" onClick={() => setStage(s.name)}>` with `active` styling `border-primary bg-primary/10 font-medium text-primary`, identical to `ItemDetailDialog.tsx:236-249`.
- ✅ **AC4 — `stage` in POST**: request body spreads `...(stage ? { stage } : {})` at `:72`.

### Status (sidebar, read-only)
- ✅ **AC1 — single Todo badge, `secondary` variant**: rendered at `:177-180` with `<Badge variant={STATUS_VARIANT.Todo}>Todo</Badge>`; `STATUS_VARIANT.Todo = 'secondary'` at `:26`.
- ✅ **AC2 — not interactive**: wrapper is a `<div>`, not a `<button>`; no `onClick` handler exists.
- ✅ **AC3 — no `status` in POST body**: the JSON.stringify payload at `:68-73` only includes `title`, optional `id`, optional `body`, optional `stage`.

### ID field
- ✅ **AC1 — labeled ID input beneath title**: `<label>ID <span>(optional, auto-generated)</span></label>` + `<Input id="new-item-id" ... />` in the main column at `:117-127`; the main column sits directly under the header that contains the title input.
- ✅ **AC2 — trimmed pass-through, omitted when blank**: `...(id.trim() ? { id: id.trim() } : {})` at `:70`.

### Submit flow
- ✅ **AC1 — correct URL + body shape**: `fetch('/api/workflows/${encodeURIComponent(workflowId)}/items', { method: 'POST', ... })` at `:65`; the body contains only `title`, `body?`, `stage`, `id?`.
- ✅ **AC2 — `onCreated` + close on 2xx**: `onCreated(created); onOpenChange(false);` at `:79-80`.
- ✅ **AC3 — inline error on non-2xx**: `throw new Error((await res.text()) || 'Request failed: ${res.status}')` at `:76`, surfaced via `setError(...)` and rendered at `:186-190`; dialog is not closed in the catch branch.

### Reset behavior
- ✅ **AC1 — reset on open / stages change**: `useEffect` keyed on `[open, stages]` clears `title`, `id`, `body`, `stage` (to `stages[0]?.name`), and `error` at `:47-54`. Status display is constant `'Todo'` so it is always visually reset.

### Caller wiring
- ✅ **AC1 — `stages` prop passed**: `KanbanBoard.tsx:359-365` renders `<NewItemDialog ... stages={stages} onCreated={handleItemCreated} />`; no `firstStageName` prop remains.
- ✅ **AC2 — callback signature unchanged**: `handleItemCreated(created: WorkflowItem)` at `KanbanBoard.tsx:201-203` calls `mergeItem`, preserving the prior merge-into-items behaviour.

### Comments section
- ✅ **AC1 — no comments area**: no occurrence of `comment`/`Comments` / textarea in `NewItemDialog.tsx`.

### Cross-cutting checks
- ✅ **Typecheck**: `npx tsc --noEmit` completes with no errors (entire repo).
- ✅ **API contract preserved**: `app/api/workflows/[id]/items/route.ts` unchanged on disk (git status clean for this file); accepts exactly `{ title, id?, body?, stage? }`.
- ✅ **No new dependencies**: request payload uses components and libraries already imported; `package.json` diff unrelated to this item.
- ✅ **Dev server smoke**: `GET /api/workflows/requirements` returns 200 with the stage list, so the `stages` prop source path is healthy.

### Regression scan
- ✅ **KanbanBoard caller**: the only consumer of `NewItemDialog`; now compiles against the new props shape.
- ✅ **ItemDetailDialog**: untouched by this change (reference only); its layout and props remain intact.
- ✅ **Keyboard a11y**: stage rows are real `<button type="button">`s; close button keeps `aria-label="Close"`.

All acceptance criteria pass — item is ready to advance.
