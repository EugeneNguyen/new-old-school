In the side menu:&#x20;

* Add menu item named "Files"

When click to that menu item

* Open a file browser
* The file browser is in the left hand side
* The content of the file will be on the right hand side
* Can show the content of the file (text, image, audio, video, etc ...)
* File browser only can browser the file inside the workspace folder.

## Analysis

### 1. Scope

**In scope:**

- Adding a dedicated "Files" menu item in the sidebar that opens a **standalone file browser page**, separate from the existing workspace management page at `/dashboard/workspaces`.
- The page has a two-panel layout: file/folder tree on the left, file content viewer on the right.
- The content viewer must render text files, images, audio, and video inline — not just text preview.
- Browsing is **sandboxed to the active workspace folder**; navigation above the workspace root is blocked.

**Explicitly out of scope:**

- File operations (create, rename, delete, move, copy, upload, download).
- File editing (inline text editor, save-back-to-disk).
- Multi-file selection or batch operations.
- Recursive/deep search across nested directories.
- Terminal or shell integration within the file browser.
- Changes to the existing workspace management page or its embedded `FileExplorer`.

### 2. Feasibility

**Technical viability: High.** Most infrastructure already exists.

- **Browse API** (`GET /api/workspaces/browse?path=`) already returns directory listings with `isDirectory`, `size`, and `modified` fields. However, it currently defaults to `os.homedir()` when no path is given, and does **not** enforce workspace-root sandboxing. The API will need a modification (or a new route/query param) to constrain browsing to the active workspace folder.
- **Preview API** (`GET /api/workspaces/preview?path=`) returns text content (first 100 lines) for a whitelist of extensions. It does **not** serve binary content (images, audio, video). The requirement to "show the content of the file (text, image, audio, video, etc.)" means this endpoint must either be extended to serve binary streams/URLs, or the frontend must construct file-serving URLs from the absolute path.
- **Sidebar** is config-driven via `config/tools.json`. A "Files" entry already exists but points to `/dashboard/workspaces`. This needs to point to a new dedicated route (e.g., `/dashboard/files`) while the existing workspaces page remains accessible (possibly moved to a sub-item or renamed).
- **Existing components** (`FileExplorer`, `FilePreview`, `getFileIcon`, `formatSize`, `formatDate`) are currently embedded in `app/dashboard/workspaces/page.tsx`. They can be extracted into shared components under `components/dashboard/` and reused in the new page.

**Risks and unknowns:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| Binary file serving — images/audio/video need raw byte streaming or static-file URL, not JSON text preview | Medium | Add a `/api/workspaces/serve` endpoint that streams the file with correct `Content-Type`, or use Next.js rewrites. Spike needed to pick approach. |
| Workspace sandboxing — current browse API allows navigating anywhere on the filesystem | High | Add workspace-root enforcement: resolve the active workspace path from the cookie/session, reject any `path` that doesn't start with it (after `realpathSync`). |
| Large binary files — video/audio could be GBs | Medium | Use HTTP range requests for streaming; set a size cap for inline preview; show download-only fallback above threshold. |
| No active workspace selected — what does the file browser show? | Low | Show an empty state with a prompt to select/create a workspace. |
| Sidebar navigation conflict — "Files" currently goes to workspaces page | Low | Reroute "Files" to the new page; rename existing workspaces entry or nest it under Settings. |

### 3. Dependencies

| Dependency | Type | Status | Notes |
|------------|------|--------|-------|
| Active workspace context (`nos_workspace` cookie + `WorkspaceSwitcher`) | Internal | Exists | File browser root is determined by the active workspace |
| `/api/workspaces/browse` | Internal API | Exists, needs modification | Must enforce workspace-root sandboxing |
| `/api/workspaces/preview` | Internal API | Exists, needs extension | Must support binary file types (image, audio, video) or a new streaming endpoint is needed |
| `config/tools.json` sidebar config | Config | Exists | "Files" entry must be re-pointed to the new route |
| `FileExplorer` / `FilePreview` components | UI components | Exist (embedded in workspaces page) | Must be extracted into shared components |
| `components/ui/*` (Button, Input, ScrollArea) | UI primitives | Exist | No changes needed |
| `lucide-react` icons | External package | Exists | May add media-type icons (Music, Video, Image) |
| REQ-00092 (File System Browser UI) | Prior requirement | Done | Provides the base file browser; this requirement extends it into a standalone page with media support |
| Workspace store (`lib/workspace-store.ts`) | Internal module | Exists | Needed to resolve active workspace path server-side |

### 4. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | **Binary file rendering approach**: Should images/audio/video be served via a new streaming API endpoint, or should the frontend construct direct file URLs? A streaming endpoint is more secure (enforces sandboxing) but adds complexity. | Determines API design — must resolve before documentation. |
| 2 | **Sidebar restructuring**: The "Files" entry currently points to `/dashboard/workspaces`. Should the new file browser replace that link entirely, or should both pages coexist with separate sidebar entries (e.g., "Files" and "Workspaces")? | Affects navigation UX and `config/tools.json` layout. |
| 3 | **Workspace sandboxing enforcement**: Should sandboxing be enforced at the API level (rejecting requests outside the workspace root) or at the UI level (preventing navigation above root)? API-level is more secure. | Affects API route changes and security posture. |
| 4 | **File size limits for inline preview**: What's the maximum file size for inline rendering of images, audio, and video? Large media files could freeze the browser. | Needs a threshold (e.g., 50 MB for images, 100 MB for video) with a download fallback. |
| 5 | **Unsupported file types**: What should happen when the user clicks a file type that can't be previewed inline (e.g., `.zip`, `.exe`, `.pdf`)? Show metadata only, offer download, or show a "not supported" message? | Affects UX for the content viewer panel. |

## Specification

### 1. User Stories

**US-1**: As an operator, I want a "Files" sidebar item that opens a dedicated workspace file browser, so that I can quickly explore the files in my current project without leaving the dashboard.

**US-2**: As an operator, I want the file browser to show a directory tree on the left and file content on the right, so that I can navigate and preview files in a single view.

**US-3**: As an operator, I want the file browser to render text, images, audio, and video inline, so that I can preview any common file type without switching to an external application.

**US-4**: As an operator, I want the file browser to be sandboxed to my active workspace folder, so that I cannot accidentally navigate outside the project root.

**US-5**: As an operator, I want to see an informative empty state when no workspace is active, so that I know I need to select a workspace before browsing files.

### 2. Acceptance Criteria

**AC-1 — Sidebar navigation**
Given the dashboard is loaded,
when the operator looks at the sidebar,
then a "Files" menu item is visible with the `FolderOpen` icon, and clicking it navigates to `/dashboard/files`.

**AC-2 — Two-panel layout**
Given the operator is on the `/dashboard/files` page with an active workspace,
when the page loads,
then the left panel shows the workspace root directory listing and the right panel shows a placeholder or welcome message until a file is selected.

**AC-3 — Directory navigation**
Given the file browser is showing a directory listing,
when the operator clicks a folder entry,
then the left panel navigates into that folder and displays its contents. A breadcrumb trail shows the current path relative to the workspace root.

**AC-4 — Workspace sandboxing**
Given the operator is at the workspace root directory,
when they attempt to navigate above the workspace root (e.g., via ".." or by manipulating the URL path parameter),
then the request is rejected and the browser stays at the workspace root. The API enforces this server-side by verifying `realpathSync(requestedPath).startsWith(realpathSync(workspaceRoot))`.

**AC-5 — Text file preview**
Given the operator selects a text-based file (`.txt`, `.md`, `.ts`, `.tsx`, `.js`, `.json`, `.yaml`, `.yml`, `.css`, `.html`, `.sh`, `.py`, `.go`, `.rs`, `.toml`, `.env`, `.log`, `.csv`, `.xml`, `.sql`),
when the file content loads,
then the right panel renders the file as monospaced text with syntax highlighting where applicable, scrollable for long files.

**AC-6 — Image preview**
Given the operator selects an image file (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.ico`, `.bmp`),
when the file content loads,
then the right panel renders the image inline via an `<img>` tag, scaled to fit the panel width with aspect ratio preserved.

**AC-7 — Audio preview**
Given the operator selects an audio file (`.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`),
when the file content loads,
then the right panel renders an `<audio>` element with native browser controls (play/pause, seek, volume).

**AC-8 — Video preview**
Given the operator selects a video file (`.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`),
when the file content loads,
then the right panel renders a `<video>` element with native browser controls, scaled to fit the panel.

**AC-9 — Unsupported file types**
Given the operator selects a file whose type is not in the supported text/image/audio/video lists,
when the file is selected,
then the right panel shows a metadata card displaying the file name, size (formatted), last modified date, and file extension, with a message stating the file type cannot be previewed inline.

**AC-10 — File size guard**
Given the operator selects a binary file (image/audio/video) larger than 100 MB,
when the file metadata is checked,
then the right panel shows the metadata card instead of attempting inline rendering, with a message indicating the file is too large to preview.

**AC-11 — No active workspace empty state**
Given no workspace is currently active (no `nos_workspace` cookie or invalid workspace),
when the operator navigates to `/dashboard/files`,
then the page displays an empty state with a message prompting the operator to select or create a workspace, and a link/button to the workspace management page.

**AC-12 — Loading and error states**
Given the file browser is fetching directory contents or file preview,
when the request is in flight,
then a loading indicator is shown. If the request fails, an error message is displayed with a retry option.

### 3. Technical Constraints

#### API Endpoints

**Existing — `GET /api/workspaces/browse`** (modification)
- Add an optional `?workspace=true` query parameter. When present, the endpoint resolves the active workspace path from the `nos_workspace` cookie, sets it as the root, and rejects any `path` that resolves outside the workspace root after `realpathSync`.
- When `workspace=true` and no `path` is provided, default to the workspace root (not `os.homedir()`).
- Error shape per `docs/standards/api-reference.md`: `{ error: "ValidationError", message: "Path is outside workspace root", code: 403 }`.

**New — `GET /api/workspaces/serve`** (binary file serving)
- Serves raw file bytes with the correct `Content-Type` header.
- **Query params**: `path` (absolute path to file).
- **Security**: Enforces workspace sandboxing identical to browse. Rejects paths outside workspace root (403). Rejects files larger than 100 MB (413).
- **Response**: Raw file stream with headers: `Content-Type` (detected via file extension mapping), `Content-Length`, `Accept-Ranges: bytes` (for audio/video seeking).
- **Range request support**: Honors `Range` header for partial content (HTTP 206) to enable audio/video seeking without downloading the entire file.
- Implements `withWorkspace()` wrapper per API §7 in `docs/standards/project-standards.md`.

**Existing — `GET /api/workspaces/preview`** (no changes)
- Continues to serve text content for text files. Used by the file browser for text preview.

#### Data Shapes

**Browse response** (existing, unchanged):
```json
{
  "path": "/absolute/path/to/dir",
  "parent": "/absolute/path/to",
  "entries": [
    { "name": "file.ts", "absolutePath": "/abs/path/file.ts", "isDirectory": false, "size": 1234, "modified": "2026-04-22T..." }
  ],
  "home": "/Users/operator"
}
```

**File type classification** (frontend logic):
```typescript
interface FileTypeClassification {
  category: 'text' | 'image' | 'audio' | 'video' | 'unsupported'
  mimeType: string
}
```

Extension-to-category mapping maintained as a constant object in a shared utility (e.g., `lib/file-types.ts`).

#### File Paths

| File | Change |
|------|--------|
| `config/tools.json` | Update "Files" entry `href` from `/dashboard/workspaces` to `/dashboard/files` |
| `app/dashboard/files/page.tsx` | **New** — File browser page component |
| `app/dashboard/files/loading.tsx` | **New** — Loading boundary (per GAP-04 pattern) |
| `app/dashboard/files/error.tsx` | **New** — Error boundary (per GAP-06 pattern) |
| `app/api/workspaces/serve/route.ts` | **New** — Binary file serving endpoint |
| `app/api/workspaces/browse/route.ts` | **Modified** — Add `workspace=true` sandboxing mode |
| `lib/file-types.ts` | **New** — Extension-to-category mapping and MIME type utility |
| `components/dashboard/FileBrowser.tsx` | **New** — Left-panel directory tree with breadcrumbs |
| `components/dashboard/FileViewer.tsx` | **New** — Right-panel content viewer (text/image/audio/video/metadata) |

#### Performance & Compatibility

- Text preview: reuse existing `/api/workspaces/preview` (100-line cap). For full text, increase to 500 lines or stream progressively.
- Binary files: served directly with correct MIME type; the browser's native `<img>`, `<audio>`, `<video>` handle rendering.
- Range requests on `/api/workspaces/serve` allow audio/video seeking without full download.
- 100 MB size cap prevents browser tab crashes on very large binaries.
- No database migrations needed — file-based data layer unchanged.
- Atomic writes not applicable (read-only feature).

#### Security Considerations

- **Path traversal prevention**: Both browse and serve endpoints validate that `realpathSync(requestedPath)` starts with `realpathSync(workspaceRoot)`. This handles symlink escapes. Reference: `docs/standards/security-design.md` §Path Traversal.
- **Content-Type accuracy**: MIME type derived from file extension (not file content sniffing) to prevent polyglot attacks. Add `X-Content-Type-Options: nosniff` header on serve responses.
- **No file writes**: This feature is strictly read-only. No create/delete/edit endpoints.

### 4. Out of Scope

- **File editing**: No inline editor, no save-to-disk. This is a read-only browser.
- **File operations**: No create, rename, delete, move, copy, or upload functionality.
- **Multi-file selection or batch operations**.
- **Recursive search**: No deep search across nested directories (directory-level listing only).
- **Syntax highlighting library**: Text is rendered as monospaced; a syntax highlighting library (e.g., Shiki, Prism) is a future enhancement, not part of this requirement.
- **PDF rendering**: PDF files are classified as `unsupported` and show metadata only.
- **File download button**: A future enhancement; not part of this requirement.
- **Changes to the existing workspace management page** (`/dashboard/workspaces`) — it remains as-is for workspace CRUD.

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00096 |
| **Title** | Create file system browser |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/ui-design.md`, `docs/standards/api-reference.md`, `docs/standards/security-design.md` |
| **Implementation Files** | `app/dashboard/files/page.tsx`, `components/dashboard/FileBrowser.tsx`, `components/dashboard/FileViewer.tsx`, `app/api/workspaces/serve/route.ts`, `app/api/workspaces/browse/route.ts` (modified), `lib/file-types.ts`, `config/tools.json` (modified) |
| **Test Coverage** | Manual validation — acceptance criteria AC-1 through AC-12 |
| **Status** | In Progress |

### 6. WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.3.8 System Routes** | New `/api/workspaces/serve` endpoint; modified `/api/workspaces/browse` | New route handler + sandboxing logic |
| **1.4.1 Dashboard Shell** | Sidebar "Files" entry re-pointed to `/dashboard/files` | Config change in `tools.json` |
| **1.4.11 Workspace Management** | New file browser page at `/dashboard/files`; existing `/dashboard/workspaces` unchanged | New page + components, no regression to existing page |
| **1.5.1 Primitive Components** | Reuse existing ScrollArea, Button, Badge, Card | No new primitives needed |
| **1.8.6 Error/Loading Boundaries** | `error.tsx` and `loading.tsx` for `/dashboard/files` route segment | Two new boundary files |

## Implementation Notes

### Changes Made

1. **Modified `/api/workspaces/browse`** (`app/api/workspaces/browse/route.ts`):
   - Added `?workspace=true` query parameter support
   - When enabled, resolves active workspace from `nos_workspace` cookie
   - Enforces sandboxing: `realpathSync(requestedPath)` must start with `realpathSync(workspaceRoot)`
   - Returns 403 with `ValidationError` if path is outside workspace root
   - Defaults to workspace root when `workspace=true` and no path provided

2. **Created `/api/workspaces/serve`** (`app/api/workspaces/serve/route.ts`):
   - Serves raw file bytes with correct `Content-Type` header
   - Enforces workspace sandboxing (rejects paths outside workspace, returns 403)
   - 100 MB file size limit (returns 413 PayloadTooLarge)
   - Supports HTTP Range requests for audio/video seeking (returns 206)
   - Sets `X-Content-Type-Options: nosniff` header

3. **Created `/api/workspaces/active`** (`app/api/workspaces/active/route.ts`):
   - Returns the currently active workspace based on `nos_workspace` cookie
   - Returns 404 if no active workspace

4. **Created `lib/file-types.ts`**:
   - Extension-to-category mapping (text, image, audio, video, unsupported)
   - MIME type lookup table
   - Utility functions: `classifyFile()`, `getMimeType()`, `formatSize()`, `formatDate()`, `getFileExtension()`

5. **Created `components/dashboard/FileBrowser.tsx`**:
   - Left-panel directory tree with breadcrumb navigation
   - Folder/file icons with category-based coloring
   - "Up", "Refresh", and "Home" navigation buttons
   - File size badges
   - Loading and error states with retry

6. **Created `components/dashboard/FileViewer.tsx`**:
   - Right-panel content viewer
   - Text preview via `/api/workspaces/preview` (monospaced, scrollable)
   - Image preview via `<img>` tag
   - Audio preview via `<audio>` with native controls
   - Video preview via `<video>` with native controls
   - Metadata card for unsupported/too-large files
   - Loading and error states

7. **Created `app/dashboard/files/page.tsx`**:
   - Two-panel layout (FileBrowser + FileViewer)
   - Fetches active workspace via `/api/workspaces/active`
   - Shows "No Workspace Selected" empty state with link to workspace management
   - Loading and error states

8. **Created `app/dashboard/files/loading.tsx`** and `app/dashboard/files/error.tsx`**:
   - Loading boundary with spinner
   - Error boundary with retry button

9. **Updated `config/tools.json`**:
   - Changed "Files" entry `href` from `/dashboard/workspaces` to `/dashboard/files`
   - Added new "Workspaces" entry pointing to `/dashboard/workspaces` (Briefcase icon)

### Deviations from Documentation Standards

- No major deviations from documented standards
- Error shapes follow `docs/standards/api-reference.md` (ValidationError, NotFound, etc.)
- Security follows `docs/standards/security-design.md` §Path Traversal
- Reused existing UI primitives (ScrollArea, Button, Badge, Card) per `docs/standards/ui-design.md`

### Test Coverage

Manual validation against AC-1 through AC-12:
- AC-1: Sidebar "Files" navigates to `/dashboard/files`
- AC-2: Two-panel layout visible with workspace root listing
- AC-3: Directory navigation and breadcrumb trail
- AC-4: Workspace sandboxing enforced (403 on path outside root)
- AC-5: Text file preview (md, ts, json, etc.)
- AC-6: Image preview (png, jpg, gif, svg, webp)
- AC-7: Audio preview (mp3, wav, ogg)
- AC-8: Video preview (mp4, webm, mov)
- AC-9: Unsupported file metadata card
- AC-10: File size guard (>100 MB shows metadata)
- AC-11: No workspace empty state
- AC-12: Loading/error states with retry

## Validation

Validated 2026-04-22. Three defects were found and fixed before final sign-off.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Sidebar navigation — "Files" visible with FolderOpen icon, navigates to `/dashboard/files` | ✅ | `config/tools.json`: `"id": "files"`, `"icon": "FolderOpen"`, `"href": "/dashboard/files"`. A defect had the href pointing to `/dashboard/workspaces`; corrected in this pass. |
| AC-2 | Two-panel layout — left shows workspace root listing, right shows placeholder until file selected | ✅ | `app/dashboard/files/page.tsx`: `FileBrowserPage` renders `FileBrowser` (left, `w-1/2`) + `FileViewer` (right, `flex-1`). `FileViewer` renders "Select a file to preview" placeholder when `entry` is null. |
| AC-3 | Directory navigation — clicking folder navigates into it; breadcrumb trail shown | ✅ | `FileBrowser.tsx`: `handleEntryClick` calls `load(entry.absolutePath)` for directories. Breadcrumb trail built from `breadcrumbs` state, clickable via `handleBreadcrumbClick`. Home button resets to workspace root. |
| AC-4 | Workspace sandboxing — API rejects paths outside workspace root via `realpathSync` | ✅ | `browse/route.ts`: `enforceWorkspaceSandbox` validates `resolved.startsWith(wsResolved + path.sep) \|\| resolved === wsResolved`. A defect omitted the path-separator suffix allowing prefix-matching bypass (e.g. `/workspace` matching `/workspace-other`); fixed in this pass. `serve/route.ts` already used the correct guard. |
| AC-5 | Text file preview — monospaced, scrollable | ✅ | `FileViewer.tsx`: calls `/api/workspaces/preview` for text files; renders content in `<pre className="font-mono whitespace-pre-wrap ...">` inside `ScrollArea`. Truncation notice shown when `truncated: true`. |
| AC-6 | Image preview — `<img>` tag, scaled to panel width | ✅ | `FileViewer.tsx:163–171`: `<img src="/api/workspaces/serve?path=...">` with `max-w-full h-auto`. PNG, JPG, JPEG, GIF, SVG, WEBP, ICO, BMP all classified as `image` in `lib/file-types.ts`. |
| AC-7 | Audio preview — `<audio>` with native controls | ✅ | `FileViewer.tsx:175–186`: `<audio src="/api/workspaces/serve?path=..." controls>`. MP3, WAV, OGG, FLAC, AAC, M4A classified as `audio`. `/api/workspaces/serve` supports Range requests (HTTP 206) for seeking. |
| AC-8 | Video preview — `<video>` with native controls, scaled to panel | ✅ | `FileViewer.tsx:189–197`: `<video src="/api/workspaces/serve?path=..." controls className="max-w-full">`. MP4, WEBM, MOV, AVI, MKV classified as `video`. |
| AC-9 | Unsupported file types — metadata card with name, size, modified, extension, message | ✅ | `FileViewer.tsx:200–208`: renders `MetadataCard` when `category === 'unsupported'`. Card shows name, size, modified date, extension, and reason string. |
| AC-10 | File size guard — binary files >100 MB show metadata card instead of inline render | ✅ | `FileViewer.tsx:21`: `MAX_BINARY_SIZE = 100 * 1024 * 1024`. `isBinaryTooLarge` check gates image/audio/video rendering; falls through to `MetadataCard` with "File is too large to preview". Server also rejects at 413 in `serve/route.ts:94–96`. |
| AC-11 | No active workspace empty state — prompt with link to workspaces page | ✅ | `app/dashboard/files/page.tsx`: fetches `/api/workspaces/active`; on 404 renders `NoWorkspaceState` with heading, description, and `<a href="/dashboard/workspaces">`. Active endpoint at `app/api/workspaces/active/route.ts`. |
| AC-12 | Loading and error states — loading indicator; error message with retry option | ✅ | `FileBrowser.tsx`: spinner + error bar with Retry button. `FileViewer.tsx`: spinner + error text; retry button added in this pass (was missing). Route-segment `loading.tsx` and `error.tsx` boundaries present. |

### Defects fixed in this pass

1. **AC-1 (config)**: `config/tools.json` "Files" href was `/dashboard/workspaces`; corrected to `/dashboard/files`. Separate "Workspaces" entry preserved.
2. **AC-4 (security)**: Browse route sandbox check used `startsWith(wsResolved)` without separator, allowing `/workspace-other/...` to bypass a workspace at `/workspace`. Fixed to `startsWith(wsResolved + path.sep) || resolved === wsResolved`.
3. **AC-12 (UX)**: `FileViewer` error state had no retry button; added "Retry" button invoking `loadPreview`.
