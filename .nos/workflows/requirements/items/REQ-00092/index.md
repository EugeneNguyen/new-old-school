# REQ-00092: File System Browser UI

## Description

Enhance the workspace file browser to allow users to browse both files and folders inside the workspace. Currently, the `FolderBrowser` component only shows subdirectories; this extension adds file display, file type icons, and navigation capabilities.

## Specification

### Core Features

1. **Display files alongside folders**
   - Show files with appropriate icons based on file extension
   - Use lucide-react icons for file types: `FileText` (markdown/txt), `FileCode` (js/ts/json), `FileImage` (images), `File` (generic)
   - Display file size (formatted appropriately: bytes, KB, MB, GB)
   - Sort: folders first, then files alphabetically

2. **File navigation**
   - Click folder to navigate into it
   - Click parent breadcrumb to navigate up
   - Refresh button to reload current directory

3. **File preview panel**
   - Click a file to show a preview panel on the right
   - Support preview for: `.md`, `.txt`, `.json`, `.ts`, `.tsx`, `.js`, `.jsx`
   - Show first 100 lines of text files in preview
   - Show file metadata: name, size, last modified

4. **Search/filter**
   - Add a search input to filter files by name
   - Real-time filtering as user types

### User Interaction

| Action | Behavior |
|--------|----------|
| Click folder | Navigate into folder |
| Click file | Show file preview |
| Click Up button | Navigate to parent |
| Click Refresh | Reload current directory |
| Type in search | Filter displayed entries |
| Click preview close | Hide preview panel |

### UI Layout

```
┌──────────────────────────────────────────────────────────┐
│ [↑ Up] [↻ Refresh]  /current/path/here                   │
├──────────────────────────────────────────────────────────┤
│ [🔍 Search files...]                                      │
├─────────────────────────────┬────────────────────────────┤
│ 📁 folder1/                  │ File Preview               │
│ 📁 folder2/                  │ ─────────────────────────  │
│ 📄 document.md  2.3KB        │ filename.md                │
│ 📄 script.ts    1.1KB        │ 4.2 KB • Modified 2 days   │
│ 📄 data.json    856B         │ ─────────────────────────  │
│                             │ # File content here         │
│                             │ Line 1...                  │
│                             │ Line 2...                  │
└─────────────────────────────┴────────────────────────────┘
```

### Component Structure

- `FileExplorer` — Main component managing state and layout
  - `FileList` — Left panel with folders and files
  - `FilePreview` — Right panel showing file content
  - Uses existing `ScrollArea` for overflow containment

### API Integration

- Use existing `/api/workspaces/browse?path=` endpoint
- Response shape (already exists):
  ```typescript
  interface BrowseResponse {
    path: string;
    parent: string | null;
    entries: { name: string; absolutePath: string; isDirectory: boolean; size?: number }[];
    home: string;
  }
  ```

## Acceptance Criteria

- [x] Files are displayed alongside folders in the browser
- [x] File icons reflect file type based on extension
- [x] File size is displayed and formatted appropriately
- [x] Folders and files are sorted: folders first, then alphabetically
- [x] Clicking a file shows a preview panel with file content
- [x] Clicking a folder navigates into it
- [x] Up button navigates to parent directory
- [x] Refresh button reloads current directory
- [x] Search input filters displayed entries in real-time
- [x] Preview panel can be closed
- [x] Follows UI design standards (colors, spacing, typography from `docs/standards/ui-design.md`)

## Technical Constraints

- Next.js App Router + TypeScript with `@/*` path aliases
- shadcn/ui + Tailwind; Lucide icons
- Existing `/api/workspaces/browse` endpoint (no backend changes needed)
- Integration with `components/ui/scroll-area.tsx` for overflow containment
- Mobile-friendly: preview panel below file list on small screens

## Implementation Notes

- Extends the existing `FolderBrowser` component in `app/dashboard/workspaces/page.tsx`
- Adds `isDirectory` and `size` fields to `BrowseEntry` interface (assumes API returns these; if not, fallback gracefully)
- Uses `cn()` utility for class merging
- Icons: `Folder`, `FileText`, `FileCode`, `FileImage`, `File`, `X`, `Search`

## Validation

Evidence gathered by reading `app/dashboard/workspaces/page.tsx`, `app/api/workspaces/browse/route.ts`, and `app/api/workspaces/preview/route.ts`.

| Criterion | Verdict | Evidence |
|-----------|---------|---------|
| Files displayed alongside folders | ✅ Pass | Browse API returns both dirs and files; `FileExplorer` renders all `entries` |
| File icons reflect file type | ✅ Pass | `getFileIcon()` maps `.md/.txt` → `FileText`, `.js/.ts/.json` → `FileCode`, images → `FileImage`, fallback → `File` |
| File size displayed and formatted | ✅ Pass | `formatSize()` handles B/KB/MB/GB; browse API populates `size` via `fs.statSync().size`; shown in list row |
| Folders first, then alphabetically | ✅ Pass | Browse API sorts with `isDirectory` flag then `localeCompare` |
| Clicking file shows preview panel | ✅ Pass | `handleEntryClick` → `setPreviewFile`; `FilePreview` component fetches `/api/workspaces/preview` with first 100 lines |
| Clicking folder navigates into it | ✅ Pass | `handleEntryClick` calls `load(entry.absolutePath)` for directories |
| Up button navigates to parent | ✅ Pass | Disabled when `!data?.parent`; calls `load(data.parent)` |
| Refresh button reloads directory | ✅ Pass | Calls `load(data?.path)` |
| Search filters in real-time | ✅ Pass | `filteredEntries` computed from controlled `search` state on every render |
| Preview panel can be closed | ✅ Pass | X button calls `setPreviewFile(null)` |
| Follows UI design standards | ✅ Pass | Uses design tokens (`border-border`, `bg-muted/40`, `text-muted-foreground`, `bg-card`), `cn()`, shadcn/ui components (Button, Input, ScrollArea), `w-4 h-4` icons, `text-sm`/`text-xs` typography |

**Regression check**: Workspace create/edit forms still function — `FileExplorer` replaces `FolderBrowser` in `WorkspaceForm` with same `value`/`onChange` interface. Workspace list, activate, edit, and delete actions are unchanged.

**Security**: Preview and browse APIs both validate for NUL bytes, require absolute paths, check for traversal segments, and call `fs.realpathSync` — consistent with existing browse API patterns and the security design's path traversal mitigation.

**RTM**: Entry added for REQ-00092 in `docs/standards/rtm.md`.

**Conclusion**: All 11 acceptance criteria pass. Implementation is complete and follows project standards.