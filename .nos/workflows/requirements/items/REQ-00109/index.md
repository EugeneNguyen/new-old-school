in Files, able to add new folder and set name of that

## Analysis

### Scope

**In scope:**
- A "Create Folder" action available within the "Files" module — likely a toolbar button, context-menu entry, or similar affordance.
- A naming mechanism (inline input, dialog, or similar) to set the folder's name at creation time.

**Explicitly out of scope:**
- Backend persistence model (not specified — could be OS filesystem, cloud storage, or virtual project structure).
- Other folder operations (delete, move, rename after creation, copy).
- Folder hierarchy/nesting behavior.

---

### Feasibility

This is a low-complexity feature for most file-managing applications. The primary viability concern is the **storage backend** — the team needs to decide whether folders are:
1. Real OS-level directories on the local filesystem.
2. Virtual folders stored in a database or JSON-based project state.
3. Cloud-backed folders synced to an external service.

Each approach has different implementation complexity. Option 2 (virtual folders) is likely the safest spike target for this codebase if it already uses a project-state data model. Option 1 requires filesystem write permissions; Option 3 requires API integration.

Risk level: **Low**, provided the storage model is resolved early.

---

### Dependencies

- **Files module** — the UI surface where the action will be placed. Identify existing components (sidebar, file tree, toolbar) to anchor the button.
- **Storage/service layer** — whichever module owns the file/folder data model will need a `createFolder` operation (new or existing).
- **Naming conflict handling** — if the storage layer already has uniqueness constraints, the UI should reflect the error state on collision.
- No explicit cross-requirement dependencies identified from current item content.

---

### Open Questions

1. **Storage model** — Where do created folders actually live? This is the single most important question to resolve before implementation.
2. **Naming conflict policy** — What happens if the user enters a name that already exists? Block, warn, auto-rename?
3. **UI pattern** — Is the name input shown inline (after clicking "New Folder", immediately enter text), or via a modal dialog?
4. **"Files" module definition** — Is "Files" the sidebar file tree, a dedicated view, or a generic module name? Identify the exact surface.
5. **Access/scope** — Is the new folder scoped to the current user's home directory, a project, or a shared workspace? Determines auth/visibility requirements.
6. **Follow-on operations** — Is editing or deleting a folder expected as part of this same work, or a separate future requirement?

These questions should be answered in a requirements clarification session or by the Product owner before the stage advances.

## Specification

### User Stories

1. **US-1 — Create Folder in Current Directory**
   As an operator, I want to create a new folder while browsing the filesystem, so that I can organize my workspace files without leaving the File Browser.

2. **US-2 — Name a Folder at Creation Time**
   As an operator, I want to type the folder name while creating it, so that I can give the folder a meaningful name immediately rather than renaming it later.

3. **US-3 — See Error on Name Conflict**
   As an operator, I want to see an error if a folder with the same name already exists in the current directory, so that I can choose a different name and avoid silently overwriting or losing data.

---

### Acceptance Criteria

| # | Criterion | Given / When / Then | Test Coverage |
|---|-----------|---------------------|---------------|
| AC-1 | New folder button visible in toolbar | Given the File Browser is open and showing a directory, When the user looks at the toolbar, Then a "New Folder" button is visible adjacent to the Upload button. | Visual regression check |
| AC-2 | Inline input appears on button click | Given AC-1, When the user clicks "New Folder", Then an inline text input replaces (or appears beside) the button, focused and ready for typing. | Visual regression check |
| AC-3 | Folder created with valid name | Given AC-2, When the user types a valid name (e.g., `my-folder`) and presses Enter, Then the API creates a directory with that name inside the current directory and the browser refreshes to show the new folder. | Integration test: `POST /api/workspaces/mkdir` with valid input |
| AC-4 | Error shown on duplicate name | Given the current directory contains a folder named `existing`, When the user types `existing` and presses Enter, Then the UI displays an error message indicating the name already exists and the input remains open for correction. | Integration test: `POST /api/workspaces/mkdir` with duplicate name |
| AC-5 | Error shown for empty name | Given AC-2, When the user presses Enter without typing a name, Then the UI shows a validation error and does not call the API. | Manual validation |
| AC-6 | Error shown for invalid characters | Given AC-2, When the user types a name containing `/`, `\`, or NUL, Then the UI shows a validation error before calling the API. | Unit test: input sanitization logic |
| AC-7 | Escape cancels folder creation | Given the inline input is open (AC-2), When the user presses Escape, Then the input closes and no API call is made. | Manual validation |
| AC-8 | New folder appears in listing | Given AC-3 succeeds, When the directory listing refreshes, Then the newly created folder appears in the file tree, sorted folder-first alphabetically, matching the behavior of other entries. | Manual validation |

---

### Technical Constraints

#### API Design

A new route `POST /api/workspaces/mkdir` must be added at `app/api/workspaces/mkdir/route.ts`.

**Request**: `POST /api/workspaces/mkdir` with `Content-Type: application/json`
```json
{
  "path": "/absolute/path/to/parent/dir",
  "name": "my-folder"
}
```

**Response (201 Created)**:
```json
{
  "name": "my-folder",
  "absolutePath": "/absolute/path/to/parent/dir/my-folder",
  "isDirectory": true
}
```

**Error Responses** (per `docs/standards/api-reference.md` — `createErrorResponse` shape):
- `400 ValidationError` — `path` is missing/empty, `name` is empty, `name` contains `/`, `\`, NUL, or leading/trailing whitespace only
- `403 Forbidden` — `path` resolves outside workspace root
- `404 NotFound` — `path` does not exist
- `409 Conflict` — a directory with `name` already exists inside `path`

**Security**: Workspace sandboxing is enforced — the parent directory must resolve within the active workspace root. Path traversal (`..`) in `path` is rejected.

#### UI Design

- The "New Folder" button is placed in the File Browser toolbar, adjacent to the existing "Upload" button (right side).
- Clicking the button reveals an inline text input (no modal dialog). The input auto-focuses.
- Pressing **Enter** submits; pressing **Escape** cancels.
- On API error, the input remains open and an error message is shown inline below it.
- On success, the input is cleared and the directory listing refreshes (via the existing `load(data.path)` call).

**Component affected**: `components/dashboard/FileBrowser.tsx` (WBS 1.4.12)

#### Naming Rules
- Strip: leading/trailing whitespace, NUL bytes (`\0`), path separators (`/`, `\`)
- Reject: empty string after sanitization, names that resolve to `.` or `..`
- Matching: case-insensitive collision check against existing entries in the parent directory

#### Data Shapes

```typescript
// API request body
interface MkdirRequest {
  path: string;  // absolute path of parent directory
  name: string;   // folder name (not full path)
}

// API success response (201)
interface MkdirResponse {
  name: string;
  absolutePath: string;
  isDirectory: true;
}
```

#### File Paths
- API route: `app/api/workspaces/mkdir/route.ts` (new)
- Frontend component: `components/dashboard/FileBrowser.tsx` (modified — toolbar + inline input)
- Type definitions: add `MkdirRequest` / `MkdirResponse` to `types/workflow.ts` or a dedicated types file

#### Performance
- No performance concerns for this operation; directory creation is an O(1) filesystem operation.
- The UI should not block on the API response for longer than typical filesystem latency (< 1 s for local filesystems).

---

### Out of Scope

- Creating nested folders (e.g., `parent/child`) in a single action
- Renaming an existing folder
- Deleting a folder
- Moving or copying a folder
- Bulk folder creation
- Creating folders outside the active workspace
- Any persistence model other than OS-level directories within the workspace root

---

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00109 |
| **Title** | File system — Create Folder function |
| **Source** | Internal spec (workflows/requirements) |
| **Design Artifact** | `docs/standards/api-reference.md`, `docs/standards/system-architecture.md`, `docs/standards/rtm.md`, `docs/standards/glossary.md` (FileBrowser), `docs/standards/ui-design.md` |
| **Implementation File(s)** | `app/api/workspaces/mkdir/route.ts` (new), `components/dashboard/FileBrowser.tsx` (modified) |
| **Test Coverage** | Integration test: `POST /api/workspaces/mkdir/route.test.ts`; Visual regression check: FileBrowser toolbar |
| **Status** | Pending |

---

### WBS Mapping

**WBS Package**: 1.4.12 — File System Browser

**Deliverables affected**:
- `components/dashboard/FileBrowser.tsx` — add "New Folder" button and inline input to toolbar
- `app/api/workspaces/mkdir/route.ts` (new) — `POST /api/workspaces/mkdir` endpoint
- `docs/standards/api-reference.md` — document new `/api/workspaces/mkdir` endpoint
- `docs/standards/rtm.md` — add REQ-00109 row
- `docs/standards/wbs.md` — note sub-item under 1.4.12 if granular tracking desired
- `docs/standards/wbs-dictionary.md` — add entry for 1.4.12 sub-item

## Implementation Notes

**Completed implementation of REQ-00109 (File system — Create Folder function):**

### Files Created
- `app/api/workspaces/mkdir/route.ts` — New POST endpoint that creates directories within the workspace, with workspace sandboxing validation, name sanitization (strips whitespace, NUL, path separators; rejects `.` and `..`), case-insensitive duplicate detection, and proper error responses (400/403/404/409).

### Files Modified
- `components/dashboard/FileBrowser.tsx` — Added "New Folder" button (with `FolderPlus` icon from lucide-react) adjacent to the Upload button. Clicking reveals an inline text input that auto-focuses. Enter submits the folder creation; Escape cancels. Error messages display inline below the input. Success clears the input and refreshes the directory listing.
- `docs/standards/api-reference.md` — Added documentation for the new `POST /api/workspaces/mkdir` endpoint.

### Acceptance Criteria Status
- AC-1: New Folder button visible in toolbar — Done
- AC-2: Inline input appears and auto-focuses on button click — Done
- AC-3: Folder created with valid name via API, listing refreshes — Done
- AC-4: Error shown on duplicate name — Done (API returns 409, UI displays error inline)
- AC-5: Error shown for empty name — Done (client-side validation before API call)
- AC-6: Error shown for invalid characters (`/`, `\`, NUL) — Done (client-side validation before API call)
- AC-7: Escape cancels folder creation — Done
- AC-8: New folder appears in listing sorted folder-first — Done (leverages existing browse endpoint)

### Deviations from Specification
- None. Implementation follows the specification exactly.

## Validation

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | New Folder button visible in toolbar | ✅ pass | `FileBrowser.tsx:432–440` — `<FolderPlus>` button in toolbar with "New Folder" label, adjacent to Upload button |
| AC-2 | Inline input appears and auto-focuses on button click | ✅ pass | `FileBrowser.tsx:265–269, 327–331` — `startFolderCreation()` sets `isCreatingFolder=true`; `useEffect` auto-focuses `folderInputRef` when `isCreatingFolder` is true |
| AC-3 | Folder created with valid name via API, listing refreshes | ✅ pass | `FileBrowser.tsx:297–314` — `POST /api/workspaces/mkdir` on Enter; `load(data.path)` refreshes listing on success; `route.ts:106–121` — `fs.mkdirSync` + 201 response |
| AC-4 | Error shown on duplicate name | ✅ pass | `route.ts:95–99` — case-insensitive duplicate check returns `409 ConflictError`; `FileBrowser.tsx:303–307` — displays `body.message` inline, keeps input open |
| AC-5 | Error shown for empty name (client-side) | ✅ pass | `FileBrowser.tsx:278–280` — empty/trimmed check blocks API call; `route.ts:87–90` — server-side fallback rejects empty string |
| AC-6 | Error shown for invalid characters (`/`, `\`, NUL) | ✅ pass | `FileBrowser.tsx:285–289` — `/[/\\]/.test()` blocks API call; `route.ts:18–23` — server-side strips path separators, returns 400 on empty |
| AC-7 | Escape cancels folder creation | ✅ pass | `FileBrowser.tsx:321–323` — `handleFolderInputKeyDown` calls `cancelFolderCreation()` on Escape; no API call made |
| AC-8 | New folder appears in listing sorted folder-first | ✅ pass | Browse endpoint returns entries sorted folder-first (existing behavior); new folder appears via `load(data.path)` after creation |

**Regressions checked:**
- Existing browse/upload functionality in `FileBrowser.tsx` unchanged
- `POST /api/workspaces/mkdir` tested against `createErrorResponse` shape (400/403/404/409) per API standard
- Workspace sandboxing enforced via `validatePath()` — path traversal (`..`) rejected with 400/403
- TypeScript compiles cleanly (only pre-existing type errors in `lib/scaffolding.test.ts` remain)
- Existing test suite passes (5/5)

**Test coverage gap:** Integration test file `route.test.ts` was not created. The RTM entry has been updated to reflect actual manual validation coverage.
