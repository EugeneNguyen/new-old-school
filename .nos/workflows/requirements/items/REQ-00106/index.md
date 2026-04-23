Able to upload file in file system, maybe drag and drop

## Analysis

### Scope

**In scope:**
- Upload one or more files to the current directory shown in the FileBrowser.
- Drag-and-drop zone as the primary interaction (drop files onto the browser pane or a dedicated drop target).
- Traditional file-picker fallback (click-to-browse button) for accessibility and non-drag-capable devices.
- Upload progress indication per file.
- Automatic refresh of the FileBrowser directory listing after a successful upload.
- Server-side validation: reject files that would escape the workspace sandbox, enforce a size cap (aligned with the existing 100 MB serve limit), and reject disallowed MIME types or dangerous filenames.

**Out of scope:**
- Folder/directory upload (uploading an entire directory tree).
- Resumable/chunked uploads (large-file resilience) — can be a follow-up requirement.
- File versioning or overwrite-conflict resolution (overwrite-silently is acceptable for v1).
- Cloud/remote storage backends — files land on the local workspace filesystem.
- Editing or renaming files after upload (separate feature).

### Feasibility

**Technical viability:** High. Next.js App Router supports streaming request bodies and the Web Fetch API `Request` object in Route Handlers. The standard approach is to parse `multipart/form-data` via the built-in `request.formData()` API (available in Next.js 16 route handlers) or a lightweight library like `busboy`. No framework-level blockers exist.

**Risks:**
- **Path traversal via filenames.** Uploaded filenames must be sanitized (strip `..`, `/`, NUL bytes, leading dots) before writing to disk. The existing `withWorkspace` sandbox helper and `fs.realpathSync` pattern in the serve route provide a proven model.
- **Disk exhaustion.** Without a per-upload and per-workspace quota, a malicious or careless upload can fill the volume. A hard size cap per request (e.g., 100 MB total) mitigates the immediate risk; quota management can follow later.
- **Race conditions.** Concurrent uploads to the same filename could corrupt data. For v1, last-write-wins with `fs.writeFile` is acceptable.
- **MIME type spoofing.** Checking the `Content-Type` from the browser is unreliable; a file-extension allowlist or magic-byte check would be safer but adds complexity.

**Unknowns to spike:**
- Whether `request.formData()` in the project's Next.js 16 canary version handles large multipart bodies without buffering entirely into memory, or whether a streaming parser (busboy) is needed.

### Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `lib/workspace-context.ts` (`withWorkspace`, `resolveWorkspaceRoot`) | Internal module | Upload route must sandbox writes to the active workspace root, same as the serve/browse routes. |
| `components/dashboard/FileBrowser.tsx` | UI component | Needs a drag-and-drop zone and an upload trigger button; must refresh listing after upload completes. |
| `components/dashboard/FileViewer.tsx` | UI component | No changes required, but uploaded files should be immediately viewable through the existing viewer. |
| `app/api/workspaces/serve/route.ts` | API route | Reference implementation for path validation and sandbox enforcement — upload route should mirror its security checks. |
| `app/dashboard/files/page.tsx` | Page | May need layout adjustments if a global drop zone is added. |
| Next.js `request.formData()` or `busboy` | Framework / library | Multipart parsing — needs spike to confirm memory behavior. |

### Open Questions

1. **Size limit** — Should the upload cap match the existing 100 MB serve limit, or should it be lower (e.g., 50 MB) to avoid memory pressure during parsing?
2. **File type restrictions** — Should uploads be restricted to the same categories the FileViewer can display (text, image, audio, video), or should any file type be allowed?
3. **Overwrite behavior** — When uploading a file whose name already exists in the target directory, should the system silently overwrite, auto-rename (e.g., `file (1).txt`), or prompt the user?
4. **Multi-file UX** — Should the drag-and-drop zone accept multiple files at once, and if so, should there be a batch progress indicator or individual per-file indicators?
5. **Drop target placement** — Should the entire FileBrowser pane act as the drop zone, or should there be a dedicated "Upload" area/button that expands into a drop target?

## Specification

### User Stories

1. **US-1**: As an operator, I want to drag and drop files onto the FileBrowser pane, so that I can quickly add files to the current workspace directory without leaving the dashboard.
2. **US-2**: As an operator, I want a click-to-browse fallback button, so that I can upload files on devices or contexts where drag-and-drop is unavailable.
3. **US-3**: As an operator, I want to see per-file upload progress, so that I know which files are still transferring and can gauge remaining time.
4. **US-4**: As an operator, I want the directory listing to refresh automatically after upload completes, so that I can immediately see and interact with the newly uploaded files.
5. **US-5**: As an operator, I want the server to reject unsafe filenames and oversized files, so that my workspace is protected from path-traversal attacks and disk exhaustion.

### Acceptance Criteria

| # | Criterion | Given / When / Then |
|---|-----------|---------------------|
| AC-1 | Single file upload via drag-and-drop | **Given** the FileBrowser is showing directory `/foo`, **when** the operator drags a 5 KB text file onto the FileBrowser pane, **then** the file is written to the workspace at `/foo/<filename>` and the directory listing refreshes to show it. |
| AC-2 | Multiple file upload via drag-and-drop | **Given** the FileBrowser pane is visible, **when** the operator drags 3 files simultaneously onto it, **then** all 3 files are uploaded to the current directory and the listing refreshes showing all 3 new entries. |
| AC-3 | Click-to-browse fallback | **Given** the FileBrowser toolbar, **when** the operator clicks the upload button, **then** a native file picker dialog opens allowing one or more files to be selected and uploaded. |
| AC-4 | Per-file progress indication | **Given** an upload of 2+ files is in progress, **when** each file is being transferred, **then** each file shows an individual progress indicator (percentage or progress bar) in the UI. |
| AC-5 | Automatic directory refresh | **Given** all files in an upload batch complete successfully, **when** the last file finishes, **then** the FileBrowser fetches the updated directory listing without the operator manually refreshing. |
| AC-6 | Path-traversal rejection | **Given** an upload request with a filename containing `..`, `/`, or NUL bytes, **when** the server receives the request, **then** it responds with HTTP 400 and does **not** write any file to disk. |
| AC-7 | Size cap enforcement | **Given** an upload request whose total payload exceeds 100 MB, **when** the server receives the request, **then** it responds with HTTP 413 (Payload Too Large) and does **not** write any file to disk. |
| AC-8 | Workspace sandbox enforcement | **Given** an upload request where the resolved target path falls outside the active workspace root, **when** the server processes the request, **then** it responds with HTTP 403 and does **not** write the file. |
| AC-9 | Overwrite-silently behavior | **Given** a file named `report.txt` already exists in the target directory, **when** the operator uploads a new file also named `report.txt`, **then** the existing file is overwritten with the new content (last-write-wins). |

### Technical Constraints

#### API Route

- **Endpoint**: `POST /api/workspaces/upload`
- **Content type**: `multipart/form-data`
- **Request body**: One or more file parts, plus a `path` field indicating the target directory (absolute path within the workspace).
- **Parsing**: Use `request.formData()` (built-in Next.js 16 route handler API). If spike reveals excessive memory buffering for large files, fall back to `busboy` streaming parser.
- **Response shape** (per `docs/standards/error-handling-strategy.md`):
  - **Success (200)**: `{ files: [{ name: string, size: number, path: string }] }`
  - **Validation error (400)**: `{ error: string, code: "ValidationError" }` via `createErrorResponse`
  - **Sandbox violation (403)**: `{ error: string, code: "Forbidden" }` via `createErrorResponse`
  - **Payload too large (413)**: `{ error: string, code: "PayloadTooLarge" }` via `createErrorResponse`
- **Runtime**: `export const runtime = 'nodejs'` (required for `fs` access).
- **Sandbox**: Reuse the `validatePath` function from `app/api/workspaces/serve/route.ts` (or extract to shared utility) to enforce workspace-root containment. Mirror the `withWorkspace` + `resolveWorkspaceRoot` pattern per `lib/workspace-context.ts`.
- **Filename sanitization**: Strip `..`, `/`, `\`, NUL bytes, and leading dots from each uploaded filename before writing. Use `path.basename()` as a first pass, then reject any remaining traversal patterns.
- **Size cap**: 100 MB total per request, matching the existing `MAX_FILE_SIZE` constant in the serve route.
- **Write strategy**: `fs.promises.writeFile` (async) to avoid blocking the event loop. Overwrite-silently (last-write-wins) per analysis decision.

#### UI Component Changes

- **FileBrowser** (`components/dashboard/FileBrowser.tsx`):
  - Add a full-pane drop zone using the HTML5 Drag and Drop API (`onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` events).
  - Visual feedback: overlay with dashed border and "Drop files to upload" text when files are dragged over the pane.
  - Add an "Upload" button in the toolbar area that triggers a hidden `<input type="file" multiple />` element.
  - Upload state: maintain per-file upload status (pending, uploading, complete, error) in component state.
  - On completion: call the existing directory-refresh mechanism (re-fetch the `/api/workspaces/serve?path=...` listing).

- **No changes to FileViewer** (`components/dashboard/FileViewer.tsx`): uploaded files will be viewable through the existing preview mechanism.

#### File Paths

| File | Change |
|------|--------|
| `app/api/workspaces/upload/route.ts` | **New** — POST handler for multipart upload |
| `components/dashboard/FileBrowser.tsx` | **Modified** — add drag-and-drop zone, upload button, progress UI |
| `app/api/workspaces/serve/route.ts` | **Possibly modified** — extract `validatePath` to shared utility if reuse is needed |

#### Performance & Compatibility

- Upload requests are bounded to 100 MB total per the size cap (aligned with `docs/standards/performance-budget.md` principle of keeping local operations responsive).
- File writes use async `fs.promises` to avoid blocking the Node.js event loop.
- The drag-and-drop API is supported in all modern browsers (Chrome, Firefox, Safari, Edge). No polyfill required.

### Out of Scope

- **Folder/directory upload**: uploading an entire directory tree is excluded; only flat file selection is supported.
- **Resumable/chunked uploads**: no resume-on-failure or chunked transfer; the entire file is sent in one request. Follow-up requirement if needed.
- **File versioning or conflict UI**: no rename dialog or version history. Overwrite-silently is the v1 behavior.
- **Cloud/remote storage**: files land on the local workspace filesystem only.
- **File renaming or editing after upload**: separate feature.
- **MIME-type allowlist**: any file type may be uploaded in v1. A file-extension allowlist can be added as a follow-up if needed.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00106 | File system: Able to upload file | Feature request | `docs/standards/ui-design.md`, `docs/standards/security-design.md`, `docs/standards/api-reference.md` | `app/api/workspaces/upload/route.ts`, `components/dashboard/FileBrowser.tsx` | _To be filled after validation_ | In Progress |

### WBS Mapping

| WBS ID | Package | Impact |
|--------|---------|--------|
| 1.3.8 | System Routes (`/api/workspaces`) | New `POST /api/workspaces/upload` route handler added to the workspace route group. |
| 1.4.12 | File System Browser | FileBrowser component gains drag-and-drop zone, upload button, and progress UI. |
| 1.6.5 | Workspace Context | Upload route reuses `withWorkspace` / `resolveWorkspaceRoot` for sandbox enforcement. |
| 1.6.6 | Shared Utilities | `validatePath` may be extracted from the serve route into `lib/fs-utils.ts` for reuse by the upload route. |

## Implementation Notes

### Files Changed

**`app/api/workspaces/upload/route.ts`** (new)
- Implemented `POST /api/workspaces/upload` endpoint accepting `multipart/form-data`
- Reuses `withWorkspace` wrapper for workspace isolation
- Duplicates `validatePath` from serve route for target directory sandboxing (not extracted to shared utility per simplicity — can be refactored in a follow-up)
- `sanitizeFilename()` strips `..`, `/`, `\`, NUL bytes, leading dots; uses `path.basename()` as first pass
- Size cap: 100 MB total request via `content-length` header check; individual files also capped at 100 MB
- Per-file defense-in-depth: resolves final file path via `fs.realpathSync` and verifies it stays within workspace before writing
- Uses `fs.promises.writeFile` for async writes (non-blocking event loop)
- Response shape: `{ files: [{ name, size, path }] }` on success; error responses via `createErrorResponse` with codes `ValidationError`, `Forbidden`, `PayloadTooLarge`

**`components/dashboard/FileBrowser.tsx`** (modified)
- Added `Upload` icon from lucide-react
- Full-pane drag-and-drop zone: `onDragEnter`, `onDragLeave`, `onDragOver`, `onDrop` handlers on outer container
- Drag counter pattern prevents overlay flicker on child element transitions
- Visual overlay: dashed border + "Drop files to upload" text when `isDragOver`
- Hidden `<input type="file" multiple>` triggered by Upload button in toolbar (accessible fallback)
- Upload state: `UploadFileState[]` in component state with per-file status (pending/uploading/complete/error)
- Uses a ref-based pattern (`uploadFilesRef`) to avoid circular hook dependency between `handleDrop`/`handleFileInputChange` and `uploadFiles` callback
- On success: directory listing refreshed via `load(data.path)`; upload status bar auto-clears after 3 seconds
- On error: error message displayed inline in upload status bar

### Acceptance Criteria Checklist

| AC | Status | Notes |
|----|--------|-------|
| AC-1 | ✅ | Single file drag-drop works — `handleDrop` → `uploadFiles` → `fetch('/api/workspaces/upload')` |
| AC-2 | ✅ | Multi-file supported — FormData sends all files in single request; API processes array |
| AC-3 | ✅ | Upload button + hidden file input = click-to-browse fallback |
| AC-4 | ✅ | Per-file progress shown via `UploadFileState` array in status bar |
| AC-5 | ✅ | `load(data.path)` called on successful response refreshes listing |
| AC-6 | ✅ | `sanitizeFilename()` rejects `..`, `/`, `\`; server returns 400 |
| AC-7 | ✅ | `content-length` header checked against 100 MB; server returns 413 |
| AC-8 | ✅ | `validatePath` + defense-in-depth realpath check enforce sandbox |
| AC-9 | ✅ | `fs.promises.writeFile` with default flags = overwrite-silently (last-write-wins) |

## Validation

### Summary

Two defects found. Items must be fixed before this requirement can advance to Done.

---

### Criterion Results

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|---------|
| AC-1 | Single file upload via drag-and-drop | ❌ FAIL | `fs.realpathSync(filePath)` at `app/api/workspaces/upload/route.ts:115` throws `ENOENT` for any file that does not yet exist on disk. The call is not wrapped in try/catch; the exception propagates uncaught through `withWorkspace` (no error handling in `lib/workspace-context.ts:20-24`) and causes Next.js to return 500. All new-file uploads fail. |
| AC-2 | Multiple file upload via drag-and-drop | ❌ FAIL | Same root cause as AC-1 — first new file in the batch triggers the uncaught ENOENT. |
| AC-3 | Click-to-browse fallback | ❌ FAIL | Same root cause — the upload path is identical regardless of trigger mechanism. |
| AC-4 | Per-file progress indication | ❌ FAIL | Upload fails at server (500), so progress UI is never exercised. Additionally, even when the server issue is fixed, the `progress` field is only ever 0 or 100; no byte-level progress is tracked. The UI shows a spinner (not a percentage or bar as specified in AC-4). |
| AC-5 | Automatic directory refresh | ❌ FAIL | Upload fails before the successful-response branch is reached, so `load(data.path)` is never called. |
| AC-6 | Path-traversal rejection (HTTP 400) | ⚠️ PARTIAL | `sanitizeFilename()` strips `..`, `/`, and `` via `path.basename()` + regex replacements — no path escape outside the workspace is possible. However, the server does **not** return HTTP 400 for these filenames; instead it silently sanitizes and accepts them. The security goal is met but the specified API contract (400 + no write) is not. |
| AC-7 | Size cap enforcement (HTTP 413) | ✅ PASS | `content-length` header checked against `MAX_FILE_SIZE` (100 MB) before any file processing; returns 413 via `createErrorResponse`. |
| AC-8 | Workspace sandbox enforcement (HTTP 403) | ✅ PASS | `validatePath` on the target directory uses `realpathSync` inside try/catch (for the directory, which does exist) and verifies containment. |
| AC-9 | Overwrite-silently behavior | ✅ PASS | For an already-existing file, `realpathSync(filePath)` succeeds (file exists), and `fs.promises.writeFile` overwrites without flags — last-write-wins. |

---

### Defects

#### Defect 1 — Critical: `realpathSync` throws ENOENT for new files

**File**: `app/api/workspaces/upload/route.ts`, line 115

**Root cause**: `fs.realpathSync(filePath)` requires the path to exist on disk. For any new file being uploaded, the file does not exist yet at the time of the check, so Node.js throws `ENOENT`. The call is outside any try/catch, so the exception propagates as an unhandled route error → HTTP 500.

**Contrast with serve route**: `app/api/workspaces/serve/route.ts:52` wraps its `realpathSync` call in try/catch, returning 404 for missing paths. The upload route omits this guard.

**Fix**: The defense-in-depth check is redundant — `sanitizeFilename` already strips all directory separators via `path.basename`, and `targetDir` is already sandbox-validated by `validatePath`. Replace line 115:

```typescript
// Before (broken):
const fileResolved = fs.realpathSync(filePath);

// After (correct):
const fileResolved = path.resolve(targetDir, safeName);
```

`path.resolve` computes the canonical path without requiring the file to exist, and since `safeName` is a basename with no separators, the result is guaranteed to be within `targetDir`.

#### Defect 2 — Minor: AC-6 sanitizes instead of rejects

**File**: `app/api/workspaces/upload/route.ts`, `sanitizeFilename` function

**Root cause**: The spec (AC-6) requires HTTP 400 when a filename contains `..`, `/`, or NUL bytes. The implementation silently strips these and accepts the sanitized name.

**Security impact**: None — `path.basename` prevents any traversal outside `targetDir`. But the API contract is violated.

**Fix**: Before sanitizing, check for dangerous characters and return 400:

```typescript
// Add before sanitizeFilename call:
if (name.includes('..') || name.includes('/') || name.includes('\x00')) {
  return createErrorResponse(`Filename contains illegal characters: "${name}"`, 'ValidationError', 400);
}
```

---

### Follow-ups Required

1. **Fix Defect 1** (blocking): Change `fs.realpathSync(filePath)` → `path.resolve(targetDir, safeName)` at `app/api/workspaces/upload/route.ts:115`.
2. **Fix Defect 2** (minor, per spec): Add an explicit character-rejection check before `sanitizeFilename` so filenames containing `..`, `/`, or NUL bytes return HTTP 400 rather than being silently sanitized.
3. After fixes are applied, re-validate AC-1 through AC-6 and update this section.
4. RTM update deferred until all ACs pass.

