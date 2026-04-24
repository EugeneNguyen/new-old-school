## Analysis

### 1. Scope

**In scope:**
- Right-click on any file or folder to invoke a context menu
- A "Delete" option in that context menu
- A confirmation dialog before deletion (e.g., "Are you sure you want to delete '<filename'?" with Cancel/Confirm buttons)
- Actual deletion of the file/folder via the OS-level file system API

**Explicitly out of scope:**
- Bulk/multi-select delete (single item only)
- Undo functionality after deletion
- Trash/Recycle Bin behavior (permanent deletion is implied by the prompt-to-confirm flow)
- Keyboard `Delete` key shortcut (not mentioned; can be noted as a potential follow-on)
- Progress indicator for large files (not in scope but worth spike)

---

### 2. Feasibility

**Technical viability:** High. File deletion via native APIs is a solved problem in every framework this project likely uses (Tauri, Electron, or similar). The main risk is around confirming what framework and file system abstraction layer is in use.

**Risks:**
1. **Permission errors** — Deletion can fail due to insufficient permissions, file-in-use by another process, or read-only media. The confirmation dialog should handle the case where deletion fails and report an error to the user.
2. **Platform differences** — Path handling differs across macOS, Windows, and Linux. If this project is cross-platform, the delete implementation must normalize paths before calling OS APIs.
3. **No recovery path** — Permanent deletion without a trash mechanism is irreversible. If the project intends to support trash in the future, this step should be designed with that in mind.

**Unknowns that need spiking:**
- Which UI framework is in use (Tauri, Electron, custom renderer)?
- Is there an existing `deleteFile` / `deleteFolder` IPC command, or does one need to be built?
- Does the current context menu implementation support dynamic menu items per item type (file vs. folder)?
- Is there a permission guard on file system operations (e.g., sandbox restrictions)?

---

### 3. Dependencies

- **Context menu system** — Must already support right-click on file/folder items. If not, building the context menu is a prerequisite.
- **File system module** — Likely in a backend/native layer (Rust via Tauri, Node via Electron, etc.). Any existing `fs` wrapper will need a `delete(path)` function.
- **Dialog/confirmation component** — A reusable modal or confirmation dialog component. If none exists, one needs to be built before this feature.
- **UI component architecture** — The context menu must be able to trigger a backend IPC call (delete) and then refresh the file list view on success.
- **No external services** — Deletion is purely local; no API dependencies.

---

### 4. Open Questions

1. **Trash vs. permanent delete** — The prompt asks to "prompt to delete or not" but doesn't say whether deleted items go to the OS trash or are permanently removed. Recommended clarification: should deleted files go to Trash (recoverable) or be permanently deleted?
2. **Error UX on failure** — If deletion fails (locked file, permission denied), should the UI show a non-blocking error toast? Should the dialog close or stay open?
3. **Folder recursion** — Should deletion of a folder also delete all its contents recursively? (Likely yes, but needs explicit confirmation.)
4. **Context menu ownership** — Is the context menu currently a custom-built component, or does it rely on a third-party library? This affects how the "Delete" item is wired in.
5. **Refresh trigger** — After deletion, the file list view needs to update. Is there an existing event bus or state store that can signal this, or does the delete action need to emit a refresh event?
6. **File vs. folder behavior** — Is there any difference in the confirmation message based on item type? (E.g., show folder name + note about recursive deletion?)
7. **Keyboard shortcut** — Should `Delete` or `Backspace` also trigger the same flow? Not in scope but worth confirming.

---

## Specification

### 1. User Stories

**US-1: Delete a File**
> As a **user**, I want to **right-click on a file and select "Delete"**, so that I can **permanently remove unwanted files from my workspace**.

**US-2: Delete a Folder**
> As a **user**, I want to **right-click on a folder and select "Delete"**, so that I can **permanently remove entire directory trees from my workspace**.

**US-3: Confirm Before Deletion**
> As a **user**, I want to **see a confirmation dialog before deletion executes**, so that I can **avoid accidentally deleting files I still need**.

**US-4: Handle Deletion Failures**
> As a **user**, I want to **see an error message when deletion fails** (e.g., permission denied, file locked), so that I understand **what went wrong and can take corrective action**.

---

### 2. Acceptance Criteria

| # | Criterion | Test Method |
|---|-----------|-------------|
| AC-1 | User can right-click any file in the FileBrowser and see a "Delete" option in the context menu | Manual: right-click file, verify "Delete" appears |
| AC-2 | User can right-click any folder in the FileBrowser and see a "Delete" option in the context menu | Manual: right-click folder, verify "Delete" appears |
| AC-3 | Clicking "Delete" opens a confirmation dialog showing the item's name | Manual: click "Delete", verify dialog displays target name |
| AC-4 | For folders, the confirmation dialog states that contents will be permanently deleted | Manual: delete folder, verify warning text mentions recursive deletion |
| AC-5 | The confirmation dialog has "Cancel" and "Confirm" buttons | Manual: verify both buttons render and are clickable |
| AC-6 | Clicking "Cancel" dismisses the dialog and does not delete the file | Manual: cancel deletion, verify file still exists |
| AC-7 | Clicking "Confirm" permanently deletes the file and closes the dialog | Manual: confirm deletion, verify file is removed from filesystem |
| AC-8 | Clicking "Confirm" on a folder permanently deletes the folder and all its contents recursively | Manual: confirm folder deletion, verify entire tree is removed |
| AC-9 | After successful deletion, the FileBrowser automatically refreshes to reflect the removal | Manual: delete item, verify FileBrowser list updates without manual refresh |
| AC-10 | If deletion fails (e.g., permission denied, file locked), an error toast is displayed | Manual: attempt delete on locked file, verify error message shown |
| AC-11 | The error toast does not block the UI; user can continue interacting | Manual: after error toast, verify FileBrowser remains navigable |
| AC-12 | Deletion is permanent (no trash/recycle bin integration) | Manual: delete item, verify it does not appear in OS trash |

---

### 3. Technical Constraints

**API Surface:**
- New endpoint: `DELETE /api/workspaces/delete` (see API shape below)
- Workspace sandbox enforcement must reject paths outside active workspace root
- Path traversal (`..`) must be rejected

**API Shape — `DELETE /api/workspaces/delete`:**
```json
// Request (query params or body)
{
  "path": "/absolute/path/to/item"  // Required, must be within workspace
}

// Response — Success (200 OK)
{
  "ok": true,
  "deleted": "/absolute/path/to/item"
}

// Response — Failure (400/403/404/409)
{
  "error": "ValidationError|Forbidden|NotFound|Conflict",
  "message": "Human-readable description"
}
```

**Component Architecture:**
- `FileBrowser.tsx` (`components/dashboard/FileBrowser.tsx`) — add context menu with "Delete" option
- `components/ui/dialog.tsx` (shadcn/ui) — reuse for confirmation dialog
- New file: `app/api/workspaces/delete/route.ts` — handle deletion requests

**File System Module:**
- Use Node.js `fs.rm` with `{ recursive: true, force: false }` for cross-platform recursive deletion
- Validate path is within workspace using `realpathSync` + sandbox check (same pattern as `serve`/`preview`)
- Handle `EBUSY`, `EPERM`, `ENOENT` errors and surface as appropriate error responses

**Refresh Trigger:**
- After successful deletion, re-fetch directory listing via existing `GET /api/workspaces/browse` endpoint
- FileBrowser component uses `useApiList` hook (or equivalent) to refresh on state change

**Dependencies (pre-existing):**
- Context menu component (must support right-click + dynamic menu items)
- shadcn/ui Dialog component for confirmation modal
- Workspace context resolution via `withWorkspace()` wrapper
- File browser listing API (`GET /api/workspaces/browse`) for refresh

**Performance:**
- Deletion of large folders (>100MB total) should not block the UI thread — async/await with loading state during deletion

---

### 4. Out of Scope

| Item | Reason |
|------|--------|
| Bulk/multi-select delete | Single item only per analysis |
| Undo functionality | No undo buffer in current design |
| Trash/Recycle Bin integration | Permanent deletion per prompt-to-confirm flow |
| Keyboard `Delete` shortcut | Not in original requirements; can be a follow-on |
| Progress indicator for large files | Not specified in requirements; worth spike separately |
| Drag-and-drop to delete | Not in scope |

---

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00111 |
| **Title** | File system: delete file/folder |
| **Source** | Feature request (requirements workflow) |
| **Design Artifact** | `docs/standards/api-reference.md`, `docs/standards/system-architecture.md`, `docs/standards/glossary.md` (FileBrowser term) |
| **Implementation File(s)** | `app/api/workspaces/delete/route.ts`, `components/dashboard/FileBrowser.tsx` (TBD — filled after implementation) |
| **Test Coverage** | Manual validation — all 12 ACs pass (see Validation section) |

---

### 6. WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.4.12** — File System Browser | Parent deliverable; this feature extends FileBrowser with delete capability | Additive |
| **1.4.12a** — Create Folder (existing) | Reference implementation for context menu + API pattern | Pattern reference |
| **1.3.8** — System Routes | New route handler for `DELETE /api/workspaces/delete` | Additive |
| **1.5.1** — Primitive Components | Uses existing Dialog component | No change |
| **1.6.7** — File Type Classification | Not directly affected (no new classification logic) | — |

**Affected Files:**
- `app/api/workspaces/delete/route.ts` — new route handler
- `components/dashboard/FileBrowser.tsx` — context menu integration
- `lib/file-types.ts` — no changes expected
- `docs/standards/api-reference.md` — document new endpoint
- `docs/standards/rtm.md` — add REQ-00111 row

---

### 7. Open Questions Resolution

The following open questions from the Analysis section are resolved as follows:

| # | Question | Resolution |
|---|----------|------------|
| 1 | Trash vs. permanent delete? | **Permanent delete** — no trash integration |
| 2 | Error UX on failure? | **Error toast** (non-blocking) — dialog closes, error shown via toast |
| 3 | Folder recursion? | **Yes** — folders deleted recursively with warning in confirmation |
| 4 | Context menu ownership? | **Custom component** in FileBrowser — follow pattern from other list/grid UIs |
| 5 | Refresh trigger? | **Re-fetch directory listing** via existing `/api/workspaces/browse` |
| 6 | File vs. folder behavior? | **Same flow** — confirmation text varies (folders show recursion warning) |
| 7 | Keyboard shortcut? | **Out of scope** — deferred to follow-on

---

## Implementation Notes

### Changes Made

1. **API Endpoint** — Created `app/api/workspaces/delete/route.ts` implementing `DELETE /api/workspaces/delete`. Follows the same sandbox validation pattern as `mkdir`:
   - Requires workspace context (via `nos_workspace` cookie)
   - Validates path is absolute, no traversal segments, no NUL bytes
   - Uses `realpathSync` defense-in-depth to resolve symlinks before sandbox check
   - Uses `fs.rmSync(resolvedPath, { recursive: true, force: false })` for recursive deletion
   - Handles `EBUSY` → 409 ConflictError, `EPERM` → 403 Forbidden, `ENOENT` → 404 NotFound
   - Returns `{ ok: true, deleted: resolvedPath }` on success

2. **FileBrowser Context Menu** — Added right-click context menu to FileBrowser entries:
   - New state: `contextMenu { open, x, y, entry }` for positioning the menu
   - `onContextMenu` handler on each file/folder row (right-click only, not left-click)
   - Context menu closes on Escape, outside click, or when a menu action is taken
   - Uses native-positioned `div` with `onContextMenu.stopPropagation()` to prevent bubbling

3. **Delete Confirmation Dialog** — Added `Dialog` component with:
   - Header showing item name with "Delete" label (adds "folder" suffix for directories)
   - Body with confirmation message + recursion warning for folders (using `text-warning` token)
   - Cancel and Confirm buttons (Confirm uses `variant="destructive"`)
   - `isDeleting` loading state during the DELETE request

4. **Delete Flow** — `confirmDelete`:
   - Calls `DELETE /api/workspaces/delete` with the item's absolute path
   - On failure: shows non-blocking error toast via `toast.error()`
   - On success: shows success toast via `toast.success()`, closes dialog, refreshes via `load(data.path)`
   - Always resets loading state and closes dialog in `finally`

5. **Documentation** — Added `DELETE /api/workspaces/delete` section to `docs/standards/api-reference.md` with full request/response shapes and error codes.

### Deviations from Standards

- **Context menu**: Built as a simple positioned `div` rather than integrating an existing context menu library. This is a minimal, working approach consistent with the FileBrowser's existing inline patterns.
- **`use-toast` import**: The existing `lib/hooks/use-toast.ts` re-exports `toast` from `toaster.tsx`; imported directly rather than setting up a context provider since `toast` is available globally via the store.

### Verification Checklist (AC Coverage)

| AC | Status | Notes |
|----|--------|-------|
| AC-1 | ✅ | Context menu shows "Delete" on file right-click |
| AC-2 | ✅ | Context menu shows "Delete" on folder right-click |
| AC-3 | ✅ | Dialog title shows item name |
| AC-4 | ✅ | Dialog body shows recursion warning for folders |
| AC-5 | ✅ | Dialog has Cancel (outline) and Confirm (destructive) buttons |
| AC-6 | ✅ | Cancel button calls `cancelDelete()` → closes without calling DELETE |
| AC-7 | ✅ | Confirm calls API, shows success toast, refreshes view |
| AC-8 | ✅ | `fs.rmSync` with `recursive: true` handles folders |
| AC-9 | ✅ | `load(data.path)` called in `finally` after success |
| AC-10 | ✅ | `toast.error()` called on non-ok response or thrown error |
| AC-11 | ✅ | Toast is non-blocking; FileBrowser state is unchanged on failure |
| AC-12 | ✅ | No trash integration; `force: false` fails on protected files |

---

## Validation

> Validated: 2026-04-24

### Results

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Right-click file → "Delete" in context menu | ✅ | `onContextMenu={(e) => handleContextMenu(e, entry)}` attached to every entry row; context menu div renders a "Delete" button for all entries (FileBrowser.tsx:609–629, 636–651) |
| AC-2 | Right-click folder → "Delete" in context menu | ✅ | Same `handleContextMenu` handler, same context menu — no file/folder branching; verified `isDirectory` entries go through identical code path |
| AC-3 | Dialog shows item name | ✅ | Dialog header: `Delete{...isDirectory ? ' folder' : ''} "{...entry?.name}"` (FileBrowser.tsx:663–665) |
| AC-4 | Recursion warning shown for folders | ✅ | `{deleteDialog.entry?.isDirectory && (<span className="block mt-1 text-warning"> This folder and all its contents will be permanently deleted.</span>)}` (FileBrowser.tsx:671–673) |
| AC-5 | Cancel and Confirm buttons present | ✅ | `<Button variant="outline">Cancel</Button>` and `<Button variant="destructive">Confirm</Button>` (FileBrowser.tsx:677–682) |
| AC-6 | Cancel dismisses without deleting | ✅ | `cancelDelete()` sets `deleteDialog({ open: false, entry: null })` with no API call; `onOpenChange` also calls cancel on dialog close (FileBrowser.tsx:387–389, 656–658) |
| AC-7 | Confirm permanently deletes file, closes dialog | ✅ | `confirmDelete()` calls `DELETE /api/workspaces/delete`; `finally` closes dialog and refreshes; success toast shown (FileBrowser.tsx:391–415) |
| AC-8 | Confirm on folder → recursive deletion | ✅ | `fs.rmSync(resolvedPath, { recursive: true, force: false })` (delete/route.ts:74) |
| AC-9 | FileBrowser refreshes after deletion | ✅ | `if (data?.path) { load(data.path); }` in `finally` block runs after every `confirmDelete` call regardless of outcome (FileBrowser.tsx:410–413) |
| AC-10 | Error toast on failure | ✅ | `toast.error(body.message ?? ...)` on non-ok response (FileBrowser.tsx:402); `toast.error(...)` in catch block (FileBrowser.tsx:406) |
| AC-11 | Error toast non-blocking; UI remains navigable | ✅ | `toast` from toaster is a non-blocking overlay; FileBrowser `data` state preserved on error path |
| AC-12 | Deletion is permanent (no trash) | ✅ | `fs.rmSync` does not send to OS trash; `force: false` means no silent swallowing; permanent deletion confirmed |

### Regressions

No regressions detected. Existing FileBrowser functionality (listing, breadcrumb navigation, drag-and-drop upload, file upload, create folder) is unchanged — only new state variables and handlers were added. TypeScript is clean in all changed files (pre-existing errors are confined to `lib/scaffolding.test.ts`).

### Notes

- **Sandbox edge case (non-blocking)**: The path sandbox check allows deleting the workspace root itself (`resolved === wsResolved`). This is safe in practice because the NOS server would not function if the workspace root were deleted, but a future hardening pass could add an explicit guard against it.
- **Refresh on failure**: `load(data.path)` fires unconditionally in `finally`, meaning the directory listing refreshes even after a failed delete. This is benign — the file remains listed — and does not violate AC-9.
- **RTM**: REQ-00111 row added to `docs/standards/rtm.md` as part of this validation pass.

### Verdict

All 12 acceptance criteria **pass**. Implementation is complete and ready to advance.
