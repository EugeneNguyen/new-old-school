# REQ-00092: File System Browser UI

## Description

Enhance the workspace file browser to allow users to browse both files and folders inside the workspace. Currently, the `FolderBrowser` component only shows subdirectories; this extension adds file display, file type icons, and navigation capabilities.

## Specification

> **Note:** This requirement was implemented and validated in prior pipeline runs. The formal specification below is written retrospectively for completeness as the item re-enters the Documentation stage.

### 1. User Stories

- **US-1**: As a workspace operator, I want to see files alongside folders in the file browser, so that I can understand the full contents of a directory without switching tools.
- **US-2**: As a workspace operator, I want to identify file types at a glance via icons, so that I can quickly locate the file I need.
- **US-3**: As a workspace operator, I want to preview a file's content by clicking on it, so that I can inspect files without opening an external editor.
- **US-4**: As a workspace operator, I want to filter the file list by name, so that I can find files quickly in large directories.
- **US-5**: As a workspace operator, I want to navigate into folders and back to the parent, so that I can traverse the workspace directory tree.

### 2. Acceptance Criteria

1. **Given** the file browser is open on a directory containing both folders and files, **when** the entries load, **then** folders are listed first followed by files, both sorted alphabetically by name.
2. **Given** a directory entry is a file, **when** it renders, **then** the file displays an icon matching its extension: `FileText` for `.md`/`.txt`, `FileCode` for `.js`/`.ts`/`.tsx`/`.jsx`/`.json`, `FileImage` for `.png`/`.jpg`/`.gif`/`.svg`, and `File` (generic) for all other extensions.
3. **Given** a directory entry is a file, **when** it renders, **then** its size is displayed in human-readable format (B, KB, MB, GB) using 1024-byte units.
4. **Given** the user clicks a folder entry, **when** the click handler fires, **then** the browser navigates into that folder and reloads its contents.
5. **Given** the user clicks a file entry, **when** the click handler fires, **then** a preview panel appears showing the file's name, size, last-modified date, and up to 100 lines of text content (for previewable types: `.md`, `.txt`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`).
6. **Given** the preview panel is open, **when** the user clicks the close (X) button, **then** the preview panel is hidden.
7. **Given** the browser is not at the workspace root, **when** the user clicks the Up button, **then** the browser navigates to the parent directory. The Up button is disabled when at the root.
8. **Given** the browser is displaying a directory, **when** the user clicks the Refresh button, **then** the current directory's contents are reloaded from the server.
9. **Given** the browser is displaying entries, **when** the user types into the search input, **then** the displayed entries are filtered in real-time to show only those whose names contain the search string (case-insensitive).
10. **Given** the browser is displayed on a desktop viewport (≥ `md` breakpoint), **when** a file is selected for preview, **then** the preview panel appears to the right of the file list. On mobile viewports (< `md`), the preview panel appears below.
11. **Given** the file browser renders, **when** inspecting its styles, **then** it uses the project's design tokens (`border-border`, `bg-muted/40`, `text-muted-foreground`, `bg-card`), `cn()` class merging, shadcn/ui primitives (Button, Input, ScrollArea), `w-4 h-4` icon sizing, and `text-sm`/`text-xs` typography — per `docs/standards/ui-design.md`.

### 3. Technical Constraints

| Constraint | Detail | Reference |
|------------|--------|-----------|
| Framework | Next.js App Router + TypeScript, `@/*` path aliases | `tsconfig.json` |
| UI toolkit | shadcn/ui + Tailwind CSS + Lucide icons | `docs/standards/ui-design.md` |
| Browse API | `GET /api/workspaces/browse?path=<abs>` — returns `{ path, parent, entries: BrowseEntry[], home }` | `docs/standards/api-reference.md` §System Routes |
| Preview API | `GET /api/workspaces/preview?path=<abs>` — returns `{ name, size, modified, content, previewable }` (new endpoint) | Per API shape conventions in `docs/standards/api-reference.md` |
| BrowseEntry shape | `{ name: string; absolutePath: string; isDirectory: boolean; size?: number }` | `app/api/workspaces/browse/route.ts` |
| Security | Both APIs must validate: NUL-byte rejection, absolute-path enforcement, `..` traversal-segment rejection, `fs.realpathSync` resolution | `docs/standards/security-design.md` §Path Traversal |
| Overflow | File list and preview content must use `ScrollArea` for overflow containment | `components/ui/scroll-area.tsx` |
| Preview cap | Server returns at most 100 lines of file content to bound memory and transfer size | — |
| Responsive | Preview panel: side-by-side on `md:` breakpoint, stacked below on mobile | `docs/standards/ui-design.md` |
| Component contract | `FileExplorer` must expose the same `value`/`onChange` interface as the replaced `FolderBrowser` to maintain `WorkspaceForm` compatibility | `app/dashboard/workspaces/page.tsx` |

### 4. Out of Scope

- Multi-file selection, drag-and-drop, or batch operations.
- File upload, download, rename, delete, move, or copy operations.
- Binary file preview (inline image rendering, PDF viewer, video player).
- Recursive/deep search across nested directories.
- Pagination for large directories (acceptable for workspace-scale usage).
- Database schema changes or authentication changes.
- File editing within the browser.

### 5. RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00092 | File System Browser UI | Feature request | `docs/standards/ui-design.md`, `docs/standards/api-reference.md`, `docs/standards/security-design.md` | `app/dashboard/workspaces/page.tsx` (FileExplorer, FilePreview), `app/api/workspaces/browse/route.ts`, `app/api/workspaces/preview/route.ts` | Manual validation — all 11 acceptance criteria verified | Done |

### 6. WBS Mapping

| WBS Package | Deliverable | Impact |
|-------------|-------------|--------|
| **1.4.11 Workspace Management** | File browser within workspace page | Primary — this requirement extends the workspace management UI from directory-only browsing to full file+folder browsing with preview |
| **1.3.8 System Routes** | `/api/workspaces/browse` (extended), `/api/workspaces/preview` (new) | API extensions to serve file metadata and content |
| **1.5.1 Primitive Components** | Button, Input, ScrollArea | Consumed — no modifications to primitives |
| **1.5.4 Icon System** | lucide-react Folder, FileText, FileCode, FileImage, File, X, Search | Consumed — new icon imports, no library changes |

## Validation

Evidence gathered by reading `app/dashboard/workspaces/page.tsx`, `app/api/workspaces/browse/route.ts`, and `app/api/workspaces/preview/route.ts`.

| AC# | Criterion | Verdict | Evidence |
|-----|-----------|---------|---------|
| 1 | Folders listed first, both groups sorted alphabetically | ✅ Pass | `browse/route.ts` sort block: dirs first then `localeCompare` |
| 2 | File icon matches extension (FileText/FileCode/FileImage/File) | ✅ Pass | `getFileIcon()` (page.tsx:37-52) maps `.md/.txt` → `FileText`, `.js/.ts/.tsx/.json` → `FileCode`, image exts → `FileImage`, else `File` |
| 3 | File size in human-readable format using 1024-byte units | ✅ Pass | `formatSize()` uses `k=1024`; browse API sets `size` via `fs.statSync().size` |
| 4 | Clicking folder navigates into it | ✅ Pass | `handleEntryClick` calls `load(entry.absolutePath)` for directories (page.tsx:189) |
| 5 | Clicking file shows preview with name, size, modified, ≤100 lines | ✅ Pass | `setPreviewFile(entry)` (page.tsx:191); `FilePreview` fetches preview API capped at `MAX_PREVIEW_LINES=100` |
| 6 | Preview close (X) button hides the panel | ✅ Pass | `onClick={() => setPreviewFile(null)}` on X Button (page.tsx:113) |
| 7 | Up button navigates to parent; disabled at root | ✅ Pass | `disabled={!data?.parent ‖ loading}`; `onClick` calls `load(data.parent)` (page.tsx:202-205) |
| 8 | Refresh button reloads current directory | ✅ Pass | `onClick={() => load(data?.path)}` (page.tsx:210-213) |
| 9 | Search filters entries in real-time, case-insensitive | ✅ Pass | `filteredEntries` derived via `.toLowerCase().includes(search.toLowerCase())` (page.tsx:183-185) |
| 10 | Preview panel side-by-side on desktop (≥ md), below on mobile | ✅ Pass | Desktop: `hidden md:block` wrapper (page.tsx:256); Mobile: `md:hidden` wrapper (page.tsx:261) |
| 11 | Uses project design tokens, `cn()`, shadcn/ui, correct sizing | ✅ Pass | `border-border`, `bg-muted/40`, `text-muted-foreground`, `bg-card`; `cn()` throughout; Button/Input/ScrollArea from `components/ui/`; icons `w-4 h-4`; text `text-sm`/`text-xs` |

**Regression check**: Workspace create/edit forms still function — `FileExplorer` replaces `FolderBrowser` in `WorkspaceForm` with same `value`/`onChange` interface. Workspace list, activate, edit, and delete actions are unchanged.

**Security**: Preview and browse APIs both validate for NUL bytes, require absolute paths, check for traversal segments, and call `fs.realpathSync` — consistent with existing browse API patterns and the security design's path traversal mitigation.

**RTM**: Entry added for REQ-00092 in `docs/standards/rtm.md`.

**Conclusion**: All 11 acceptance criteria pass. Implementation is complete and follows project standards.

## Analysis

> **Note:** This requirement has already been implemented and validated in prior pipeline runs. The analysis below reflects the post-implementation state and is written for completeness as the item re-enters the Analysis stage.

### 1. Scope

**In scope:**
- Replacing the directory-only `FolderBrowser` with a full `FileExplorer` component in the workspace management page (`app/dashboard/workspaces/page.tsx`).
- Displaying files alongside folders with type-specific icons (FileText, FileCode, FileImage, File) and human-readable size formatting.
- Folder-first alphabetical sorting enforced server-side in the browse API.
- File preview panel (right/below depending on viewport) fetching the first 100 lines of text-previewable files via a new `/api/workspaces/preview` endpoint.
- Navigation controls: folder click, parent (Up) button, Refresh button.
- Real-time client-side search/filter by filename.
- Responsive layout: side-by-side on desktop (`md:` breakpoint), stacked on mobile.

**Explicitly out of scope:**
- Multi-file selection, drag-and-drop, file upload/download, or file editing.
- Binary file preview (images rendered inline, PDFs, video).
- Backend changes beyond the browse and preview API routes (no database schema, no auth changes).
- Recursive/deep search across nested directories.
- File operations (rename, delete, move, copy).

### 2. Feasibility

**Technical viability:** Confirmed — the feature is implemented and passing validation.

- The existing `/api/workspaces/browse` endpoint was extended to return `isDirectory`, `size`, and `modified` metadata using `fs.statSync`. No new dependencies introduced.
- A new `/api/workspaces/preview` endpoint was added following the same security pattern (NUL-byte rejection, absolute path enforcement, traversal-segment check, `fs.realpathSync`).
- The `FileExplorer` component replaces `FolderBrowser` with the same `value`/`onChange` interface, so the `WorkspaceForm` integration is backward-compatible.

**Risks (realized and mitigated):**
- **Path traversal:** Both APIs validate inputs identically — NUL check, absolute-path check, `..` segment check, `realpathSync`. Consistent with the project's security design.
- **Large directories:** No pagination implemented. Directories with thousands of entries will load all at once. For typical workspace use this is acceptable, but could become a performance concern at scale.
- **Large file preview:** Capped at 100 lines server-side, so memory and transfer size are bounded.

**No unknowns requiring spiking** — all technical questions have been answered by the implementation.

### 3. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| `/api/workspaces/browse` endpoint | Internal API (extended) | Implemented |
| `/api/workspaces/preview` endpoint | Internal API (new) | Implemented |
| `components/ui/scroll-area.tsx` (shadcn/ui) | UI component | Exists |
| `components/ui/button.tsx`, `components/ui/input.tsx` | UI components | Exist |
| `lucide-react` icons | External package | Already in `package.json` |
| `@/lib/utils` (`cn()`) | Utility | Exists |
| `@/types/workspace` (`Workspace` type) | Type definition | Exists |
| `docs/standards/ui-design.md` | Design standards | Exists; implementation follows its tokens |
| REQ-00094 ("add item in sidemenu to access file browser") | Downstream requirement | Pending — depends on this feature existing |
| REQ-00079 (dark mode) | Cross-cutting | File browser uses theme-aware tokens (`border-border`, `bg-muted/40`, etc.) |
| REQ-00081 (mobile-friendly) | Cross-cutting | Responsive layout implemented via `md:` breakpoint |

### 4. Open Questions

All original ambiguities have been resolved through implementation. For the record:

| # | Question | Resolution |
|---|----------|------------|
| 1 | Does the browse API already return file metadata (`isDirectory`, `size`)? | It does now — the API was updated to include these fields via `fs.statSync`. |
| 2 | Should the preview endpoint be a separate route or a query param on browse? | Separate route (`/api/workspaces/preview`) — cleaner separation of concerns. |
| 3 | What happens when a non-previewable file is clicked? | Preview panel shows metadata only; `content` is `null` and `previewable` is `false`. |
| 4 | How does the FileExplorer integrate with WorkspaceForm? | Same `value`/`onChange` contract as the old `FolderBrowser` — drop-in replacement. |
| 5 | Pagination for large directories? | Not implemented — acceptable for workspace-scale directories. Could be added later if needed. |

## Implementation Notes

**Deviations from documented standards:**
None — implementation follows `docs/standards/ui-design.md`, `docs/standards/api-reference.md`, and `docs/standards/security-design.md` exactly.

**Files touched:**
- `app/dashboard/workspaces/page.tsx` — `FileExplorer` component (replaces prior `FolderBrowser`) and `FilePreview` sub-component; same `value`/`onChange` contract as replaced component for `WorkspaceForm` compatibility
- `app/api/workspaces/browse/route.ts` — extended `BrowseEntry` shape to include `isDirectory`, `size`, and `modified` fields; sorting enforced server-side (directories first, then `localeCompare`)
- `app/api/workspaces/preview/route.ts` — new endpoint following browse API security pattern (NUL rejection, absolute-path enforcement, traversal-segment check, `realpathSync`); returns at most 100 lines capped server-side

**Notable implementation details:**
- `getFileIcon()` maps extensions to Lucide icons: `.md/.txt` → `FileText`, `.js/.ts/.tsx/.json` + code extensions → `FileCode`, image extensions → `FileImage`, fallback → `File`
- `formatSize()` uses 1024-byte units (B/KB/MB/GB)
- Preview panel shows side-by-side on desktop (`md:` breakpoint) and below on mobile via conditional rendering
- Real-time search via controlled `search` state filtering `filteredEntries` on every render
- All shadcn/ui primitives consumed from `components/ui/`; `ScrollArea` used for overflow containment in file list and preview content
