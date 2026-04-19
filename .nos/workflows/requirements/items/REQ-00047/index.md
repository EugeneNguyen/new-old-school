# in activity view, able to click to view the item

## Analysis

### 1. Scope

**In scope**
- In the global Activity page (`app/dashboard/activity/page.tsx`), make each activity entry's item reference clickable so the user can open the referenced item's detail view without manually navigating the workflow board.
- Clicking the item reference must land the user on a view of the item that is visually and functionally equivalent to the existing `ItemDetailDialog` (title, markdown body, stage, comments, sessions, etc.).
- Update the activity row layout/affordances so it is obvious that the item target is clickable (hover underline / cursor, keyboard focusable, accessible label).
- Preserve the existing workflow ID link already present on each row.
- Apply the same treatment on any per-workflow activity list (e.g. `/api/workflows/[id]/activity` surfaces) if one is rendered as a UI today; confirm during implementation.

**Out of scope**
- Changes to activity ingestion, the `lib/activity-log.ts` schema, SSE transport, pagination, or filtering.
- Redesigning `ItemDetailDialog` itself or altering its editing behaviour.
- Deep-linking from external sources (emails, notifications); only in-app activity rows.
- Cross-workflow drag/move, bulk actions, or any write operation from the activity view.

### 2. Feasibility

Technically straightforward; the pieces already exist and just need to be wired together.

- `ItemDetailDialog` is rendered today inside `WorkflowItemsView` and is opened by `openItem` from `useWorkflowItems`. The activity page does **not** currently mount `WorkflowItemsView`, so it has no access to `openItem`.
- Two viable approaches:
  1. **Deep link into the workflow page** — activity rows link to `/dashboard/workflows/<workflowId>?item=<itemId>` (or a hash). Update `WorkflowItemsView` to read that param on mount and call `openItem` for the matching item; strip the param when the dialog closes. Lowest blast radius, matches existing routing, gives the user the surrounding kanban/list context.
  2. **Open the dialog in place on the Activity page** — import `ItemDetailDialog` directly into the Activity page, fetch the single item via `/api/workflows/[id]/items/[itemId]` on click, and render the dialog there. More self-contained, but duplicates item-loading/refresh logic and leaves the user on the Activity page afterwards.
- Recommendation: **option 1**; it reuses `useWorkflowItems`' existing fetch/SSE plumbing and keeps one owner of the dialog. Option 2 is a fallback if product wants to keep the user on the activity timeline.
- Risks / unknowns:
  - The target item may already be archived/deleted (activity entries outlive items). Need a graceful 404/"item no longer exists" path — probably fall through to the workflow page with a toast.
  - Auto-opening via query param must not fire on every re-render (guard with a ref or run only when param changes).
  - Keyboard/a11y: the whole row should not become a link; keep workflow ID and item ID as distinct focusable targets so screen readers announce them separately.
  - SSE updates while the dialog is open: existing `WorkflowItemsView` already handles this, so option 1 inherits the behaviour for free.

### 3. Dependencies

- `app/dashboard/activity/page.tsx` — add click affordance to the item reference.
- `components/dashboard/WorkflowItemsView.tsx` + `lib/use-workflow-items.ts` — accept and act on an initial `openItemId` (from `useSearchParams`), call `openItem` once, clear the URL param on close.
- `components/dashboard/ItemDetailDialog.tsx` — no changes expected; reuse as-is.
- `lib/activity-log.ts` / `types/workflow.ts` — read-only; activity entries already carry `workflowId` and `itemId`.
- Related/adjacent requirements that may share this UX pattern:
  - REQ-00045 (activity log implementation — still failing per recent validate commit `a1bfd5c`). This requirement depends on that activity view existing and working.
  - REQ-00046 (status indicator — also failing per `7f92677`); not a blocker but worth sanity-checking the Activity page renders correctly during implementation.
- No new external services, migrations, or config.

### 4. Open questions

1. **Target behaviour on click**: open the dialog in place on `/dashboard/activity` (option 2) or navigate to the item's workflow page with the dialog pre-opened (option 1)? Pick one before building.
2. **Click target granularity**: should the entire summary row be clickable, or only the item ID token? Product preference affects the markup and a11y.
3. **Missing items**: when an activity entry's target item has been deleted, should the link be disabled, show a toast, or silently no-op?
4. **Deep-link URL shape**: `?item=REQ-00047` vs `#item=REQ-00047` vs a dedicated route like `/dashboard/workflows/<id>/items/<itemId>`? Affects whether the URL should be shareable/bookmarkable.
5. **Per-workflow activity view**: is there (or will there be) an activity tab inside a single workflow that needs the same affordance, or is only the global Activity page in scope right now?

## Specification

### 1. User stories

- **US-1**: As a workflow user reviewing the global Activity page, I want to click an activity row's item reference so that I can open the referenced item's detail view without hunting for it in the kanban/list board.
- **US-2**: As a keyboard/screen-reader user, I want the workflow ID and the item ID on each activity row to be independently focusable and announced with clear affordances, so that I can navigate to either the workflow or the specific item without mousing.
- **US-3**: As a user whose activity row points at an item that has since been deleted, I want a clear, non-destructive message when I click it, so that I understand the item is gone and I am not stuck in a broken state.
- **US-4**: As a user who just opened an item from the Activity page, I want to close the dialog and return to a clean workflow URL, so that reloading the page does not keep re-opening the same item.
- **US-5**: As a user sharing a link to an activity target, I want the deep link to be a shareable URL, so that a teammate loading the link lands on the same item detail view.

### 2. Acceptance criteria

Resolved design choices (locking the Analysis open questions):
- **Q1** → Option 1 (deep link into the workflow page with the dialog pre-opened). No in-place dialog on `/dashboard/activity`.
- **Q2** → Only the **item ID token** is the item click target. The existing workflow ID remains its own separate link. The surrounding row is **not** a link.
- **Q3** → When the target item no longer exists, the user is navigated to the workflow page and shown a non-blocking toast "Item `<itemId>` no longer exists". No dialog is opened.
- **Q4** → URL shape is a query parameter: `?item=<itemId>` on `/dashboard/workflows/<workflowId>`. Shareable and bookmarkable.
- **Q5** → Only the **global** Activity page (`app/dashboard/activity/page.tsx`) is in scope. A per-workflow activity UI is not in scope for this requirement; if one ships later it can reuse the same `openItemId` query param convention.

Numbered acceptance criteria:

1. **AC-1** — Given the user is on `/dashboard/activity`, when activity entries are rendered, then every row's item ID token (the existing `{entry.itemId}` span) is rendered as a link pointing to `/dashboard/workflows/<encodeURIComponent(entry.workflowId)>?item=<encodeURIComponent(entry.itemId)>`.
2. **AC-2** — The item ID link uses the same visual treatment as the existing workflow ID link (`hover:underline`, monospace, `text-muted-foreground`) and is a standard anchor (`<Link href=…>` from `next/link`), so middle-click / cmd-click opens in a new tab.
3. **AC-3** — The item ID link is keyboard focusable and visually distinguishable from the surrounding plain-text summary on `:focus-visible` (relying on the default browser/Tailwind focus ring is acceptable as long as it is visible against `hover:bg-secondary/40`).
4. **AC-4** — The item ID link has an accessible label such that assistive tech announces "Open item `<itemId>`" (via `aria-label` or visually-hidden text). The workflow ID link is similarly labelled "Open workflow `<workflowId>`". The two links are announced as separate elements.
5. **AC-5** — The activity row itself is **not** a link or button. Clicking blank space, the timestamp, the summary text, or the actor badge does not navigate.
6. **AC-6** — Given a user clicks the item ID link, when the workflow page loads, then `ItemDetailDialog` opens automatically with the targeted item and its content visible (title, markdown body, stage, comments, sessions) — equivalent to opening the item from the kanban/list view.
7. **AC-7** — When the dialog auto-opens from the `?item=<id>` param, the URL is replaced (via `router.replace`) to drop the `item` param so the param does not re-trigger on refresh, browser back/forward, or re-render. The browser history entry is not duplicated.
8. **AC-8** — The auto-open effect fires **once per param value**: navigating to `?item=A` then `?item=B` (without unmounting) opens B; re-rendering while the param is the same value does not re-open a closed dialog.
9. **AC-9** — Given the user closes the dialog, when the close completes, the URL remains clean (no `item` param is re-added) and no further auto-open occurs.
10. **AC-10** — Given the target item ID is not present in the workflow's items (deleted or never existed), when the page loads, then the workflow page renders normally (no dialog), the `item` param is cleared from the URL, and a toast with text "Item `<itemId>` no longer exists" is shown. No console error is thrown.
11. **AC-11** — Given the workflow ID in the URL does not exist, the existing workflow-not-found behaviour is preserved (this requirement does not change 404 handling for workflows).
12. **AC-12** — SSE updates received while the auto-opened dialog is visible continue to reconcile item state as they do today for dialogs opened via the kanban/list; no regression in `WorkflowItemsView`'s existing SSE handling.
13. **AC-13** — Real-time new activity entries pushed via SSE to the Activity page render their item ID link identically to entries loaded from `/api/activity` (same markup, same target URL).
14. **AC-14** — Paginated "Load older" entries also render the item ID link identically.
15. **AC-15** — The Activity page continues to function when `ItemDetailDialog` is unavailable or errors on the target workflow page; the Activity page itself must not import or depend on `ItemDetailDialog`.

### 3. Technical constraints

- **Files to change**:
  - `app/dashboard/activity/page.tsx` — wrap the `{entry.itemId}` span in a `next/link` `<Link>` with `href={`/dashboard/workflows/${encodeURIComponent(entry.workflowId)}?item=${encodeURIComponent(entry.itemId)}`}` and an `aria-label`. Do not change row layout, ordering, SSE, or pagination logic.
  - `components/dashboard/WorkflowItemsView.tsx` — on mount / when search params change, read `item` via `useSearchParams()`; if present, pass it to `useWorkflowItems` as an initial target or call `openItem(id)` once the item list contains the matching ID. On dialog close (or when the item cannot be found), call `router.replace` with the same path but without the `item` param.
  - `lib/use-workflow-items.ts` — accept an optional `initialOpenItemId?: string | null` in `UseWorkflowItemsOptions`. When the items list first contains a match for that ID, set `detailItemId` to it. Guard with a `ref` so this fires at most once per distinct `initialOpenItemId` value. If, after load settles, the ID is still not present, surface a callback / flag so the caller can show the toast.
- **Files not to change**: `components/dashboard/ItemDetailDialog.tsx`, `lib/activity-log.ts`, `types/workflow.ts`, `app/api/activity/**`, `/api/workflows/[id]/activity`, SSE transport, any stage pipeline code.
- **URL shape**: `?item=<itemId>` query param on the existing `/dashboard/workflows/<workflowId>` route. Values must be URL-encoded in both the href and when reading them back. No new route segments; no hash.
- **Routing APIs**: use the Next.js App Router client hooks already in use in the codebase (`useRouter`, `usePathname`, `useSearchParams` from `next/navigation`). Use `router.replace` (not `push`) when clearing the `item` param so back/forward is not polluted.
- **Toast surface**: reuse whatever toast utility `WorkflowItemsView` (or its parent layout) already uses for user-visible feedback. If no toast utility is in use on that page today, fall back to a lightweight inline banner at the top of the workflow view — do **not** introduce a new toast library for this requirement.
- **Accessibility**: the two links on each row (workflow ID and item ID) must be distinct `<a>` / `<Link>` elements with unique `aria-label`s. The surrounding row must not use `role="button"` or `onClick` navigation.
- **Performance**: no additional network calls on the Activity page — the item ID link is a pure client-side anchor. Auto-opening the dialog must not trigger an extra item fetch beyond the normal workflow load.
- **Compatibility**: behaviour of kanban/list dialog opening remains unchanged. Existing tests and callers of `useWorkflowItems` that do not pass `initialOpenItemId` continue to compile and behave identically.

### 4. Out of scope

- Changes to activity ingestion, the `ActivityEntry` schema, the `/api/activity` endpoints, SSE transport, filtering, or pagination.
- Any change to `ItemDetailDialog` (styling, editing behaviour, comments UI, sessions UI).
- Rendering the dialog in place on `/dashboard/activity` (Option 2 from the Analysis is explicitly rejected).
- A per-workflow activity tab/view and any UX pattern sharing between it and the global Activity page.
- Deep-linking from outside the app (email, Slack, notifications).
- Cross-workflow navigation, drag/move, bulk actions, or any write operation initiated from the Activity page.
- New toast libraries or a redesigned feedback system — reuse existing utilities only.
- Recovering deleted items or adding an "archived items" view; missing items are handled purely by a toast + URL cleanup.
- Changes to REQ-00045 (activity log) or REQ-00046 (status indicator); those are tracked separately even though this requirement depends on REQ-00045 being shipped.

## Validation

**Summary**: The implementation was not performed. `index.md` has no `## Implementation Notes` section, and none of the three files named in the spec's Technical Constraints carry the changes required.

Evidence surveyed:
- `app/dashboard/activity/page.tsx:138-141` — the item ID is still rendered as `<span className="font-mono text-muted-foreground">{entry.itemId}</span>`, not a `<Link>`. No `href`, no `aria-label`, no encoding.
- `components/dashboard/WorkflowItemsView.tsx` — no `useSearchParams`, no `useRouter`, no `usePathname`, no `item` query-param handling, no `router.replace` to strip `?item=`, no toast / inline banner for missing items.
- `lib/use-workflow-items.ts` — searched for `initialOpenItemId`, `useSearchParams`, `item=`: zero matches across all three target files.
- No "Item `<id>` no longer exists" toast surface exists on the workflow page.
- The only link on each activity row today is the workflow ID (lines 131-136) which also lacks an `aria-label` (so AC-4 fails even for the workflow link side).

Acceptance criteria verdicts:

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | ❌ fail | `entry.itemId` is a plain `<span>`, not a `<Link>` (`app/dashboard/activity/page.tsx:139`). |
| AC-2 | ❌ fail | No `<Link href=…>` wraps the item ID; middle-click/cmd-click cannot open anything because the token is non-interactive. |
| AC-3 | ❌ fail | Non-interactive element cannot receive keyboard focus. |
| AC-4 | ❌ fail | No `aria-label` on the item ID (which is not a link); the existing workflow ID link also has no `aria-label` "Open workflow `<id>`". |
| AC-5 | ✅ pass | Row is not a button/link and has no `onClick` navigation — this is the existing (pre-change) behaviour (`app/dashboard/activity/page.tsx:120-145`). |
| AC-6 | ❌ fail | `WorkflowItemsView` has no logic to auto-open `ItemDetailDialog` from a query param; `useWorkflowItems` has no `initialOpenItemId` option. |
| AC-7 | ❌ fail | No `router.replace` call exists to strip the `item` param (no `?item=` handling at all). |
| AC-8 | ❌ fail | No auto-open effect exists, so the "once per param value" guard does not exist. |
| AC-9 | ❌ fail | No URL param management on dialog close. |
| AC-10 | ❌ fail | No missing-item handling, no toast, no inline banner for "Item `<id>` no longer exists". |
| AC-11 | ⚠️ partial | Pre-existing workflow-not-found behaviour is untouched (because nothing was changed), so technically preserved — but only trivially, since the feature was not built. |
| AC-12 | ⚠️ partial | Existing SSE reconciliation in `WorkflowItemsView` is untouched; there is simply no auto-opened dialog to test against. |
| AC-13 | ❌ fail | SSE-pushed activity entries render the item ID as a plain span, same as paginated entries — consistent, but inconsistent with the required `<Link>` markup. |
| AC-14 | ❌ fail | "Load older" entries render the item ID as a plain span (same code path as AC-1). |
| AC-15 | ✅ pass | The Activity page does not import `ItemDetailDialog` (verified by reading the imports block, `app/dashboard/activity/page.tsx:1-6`). |

**Overall**: 2 pass, 2 partial, 11 fail. The feature is not implemented.

### Follow-ups required before this item can advance

1. Wrap `{entry.itemId}` in `app/dashboard/activity/page.tsx` in a `<Link href={`/dashboard/workflows/${encodeURIComponent(entry.workflowId)}?item=${encodeURIComponent(entry.itemId)}`} aria-label={`Open item ${entry.itemId}`} className="hover:underline">...</Link>`.
2. Add `aria-label={`Open workflow ${entry.workflowId}`}` to the existing workflow ID `<Link>` on the same row.
3. Extend `useWorkflowItems` in `lib/use-workflow-items.ts` with an `initialOpenItemId?: string | null` option; use a ref to fire `setDetailItemId` at most once per distinct value, and expose a `missingInitialOpenItemId` flag or callback when the ID cannot be found after load.
4. In `components/dashboard/WorkflowItemsView.tsx`, read `item` via `useSearchParams()`, pass it to `useWorkflowItems`, and on dialog close / missing item call `router.replace(pathname)` to clear the param.
5. Surface a toast ("Item `<id>` no longer exists") via the existing toast utility; if none exists on the workflow page, add a lightweight inline banner as permitted by the spec.
6. Manually verify in the running dev server: click from `/dashboard/activity`, refresh the resulting URL, cmd-click for a new tab, close the dialog and verify the URL is clean, and test against a deleted/missing item ID.
7. Add an `## Implementation Notes` section to this `index.md` describing the changes made, then re-run validate.

Because the validation failed, this item remains in the Validate stage. No code changes were committed by this validation run (there is nothing to commit).
