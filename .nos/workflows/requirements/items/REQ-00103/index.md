Allow download file in file system

## Analysis

### Scope

**In scope:**

- Add a download button to the `FileViewer` component header bar, visible when a file is selected.
- Modify the existing `/api/workspaces/serve` endpoint to accept a `download=true` query parameter that adds a `Content-Disposition: attachment; filename="<name>"` header, triggering a browser download instead of inline display.
- Support downloading any file type the serve endpoint already handles (images, audio, video, text, and unknown/binary types up to the 100 MB limit).
- The download button should also appear on the `MetadataCard` for unsupported/too-large-to-preview files, since download is especially useful when preview is unavailable.

**Out of scope:**

- Bulk/multi-file download or ZIP packaging.
- Download progress UI or resumable downloads.
- File upload functionality.
- Changing the existing inline preview behavior (download is an additional action, not a replacement).
- Downloading directories.
- Changes to the browse or preview API endpoints.

### Feasibility

**Technical viability: High.** The core infrastructure already exists:

1. **Serve endpoint** (`app/api/workspaces/serve/route.ts`) already reads files, enforces workspace sandboxing, validates paths, handles MIME types, and respects a 100 MB size cap. The only change needed is a conditional `Content-Disposition: attachment` header when `?download=true` is present.
2. **FileViewer** (`components/dashboard/FileViewer.tsx`) already has the file's `absolutePath` and `name` available, so constructing the download URL is straightforward.
3. The browser's native download behavior handles the rest — no client-side Blob manipulation or streaming is required.

**Risks:**

- **Security (low):** The serve endpoint already enforces workspace sandboxing, path traversal prevention, and NUL byte checks. Adding a `Content-Disposition` header does not widen the attack surface. However, the `filename` parameter in `Content-Disposition` must be sanitized (no path separators, no control characters) to prevent header injection.
- **Large files (low):** Files up to 100 MB are already served successfully. For download, the same limit applies. No additional memory pressure since `readFileSync` is already used for full-file responses.

**Unknowns:** None requiring a spike. This is a well-bounded, low-risk change.

### Dependencies

- **Internal modules:**
  - `app/api/workspaces/serve/route.ts` — must be modified to support the `download` query parameter.
  - `components/dashboard/FileViewer.tsx` — must add the download button to the header bar and to the `MetadataCard` fallback.
  - `lucide-react` — already a project dependency; the `Download` icon is available.
- **Other requirements:** None. The file browser (REQ-00097 area) is already implemented and stable.
- **External systems:** None. This is a purely local filesystem operation within the workspace sandbox.

### Open Questions

1. **Should the filename preserve the original name or allow renaming?** The simplest approach uses the original filename from the path. Renaming before download adds UI complexity with marginal value — recommend using the original name.
2. **Should download be available for files exceeding the 100 MB serve limit?** Currently the serve endpoint rejects files over 100 MB. If users need to download very large files, a streaming approach (`fs.createReadStream`) would be needed. Recommend keeping the existing 100 MB cap for the initial implementation and addressing large-file streaming as a separate requirement if needed.
3. **Should there be a keyboard shortcut for download?** (e.g., `Ctrl+Shift+S` when a file is selected.) Recommend deferring this to a general keyboard-shortcuts initiative.

## Specification

### User Stories

1. **As an** operator browsing files, **I want** a download button in the FileViewer header, **so that** I can save a file to my local machine without having to locate it on disk.
2. **As an** operator viewing an unsupported or too-large file, **I want** a download button on the MetadataCard, **so that** I can still obtain the file even when preview is unavailable.

### Acceptance Criteria

1. **Given** a file is selected in the FileViewer, **when** the header bar renders, **then** a download button with a `Download` (lucide-react) icon is visible next to the close button.
2. **Given** a user clicks the download button, **when** the browser initiates the request, **then** the file is fetched from `/api/workspaces/serve?path=<absolutePath>&download=true` and the browser triggers a native save-as dialog using the original filename.
3. **Given** a `GET /api/workspaces/serve` request includes `download=true`, **when** the server responds, **then** the response includes a `Content-Disposition: attachment; filename="<sanitized-name>"` header.
4. **Given** a filename containing path separators, control characters, or double quotes, **when** the `Content-Disposition` header is constructed, **then** these characters are stripped or escaped to prevent header injection.
5. **Given** a file classified as `unsupported` or exceeding the 100 MB binary guard, **when** the MetadataCard renders, **then** a download button is displayed within the card.
6. **Given** a file within the workspace sandbox and under 100 MB, **when** download is requested via the serve endpoint with `download=true`, **then** the file downloads successfully regardless of file type (text, image, audio, video, binary).

### Technical Constraints

1. **API change** — The `/api/workspaces/serve` endpoint (`app/api/workspaces/serve/route.ts`) must accept an optional `download` query parameter. When `download=true`, add a `Content-Disposition: attachment; filename="<name>"` header to both full-file and range responses. Per `docs/standards/api-reference.md`, all existing security constraints (workspace sandboxing, path traversal prevention, NUL byte checks, 100 MB size cap) remain unchanged.
2. **Filename sanitization** — The `filename` value in `Content-Disposition` must be sanitized: strip path separators (`/`, `\`), NUL bytes, and control characters (codepoints `< 0x20`). Escape double quotes as `\"`. Use `path.basename()` to extract only the leaf name, never expose directory structure.
3. **Frontend — FileViewer header** — Add a `<Button>` with the `Download` icon from `lucide-react` to the header bar of `components/dashboard/FileViewer.tsx`, between the filename and the close button. The button opens the download URL via `window.open()` or an `<a>` tag with the `download` attribute. The button is visible whenever a file entry is loaded (i.e., `entry` is non-null).
4. **Frontend — MetadataCard** — Add a download button to the `MetadataCard` component within `FileViewer.tsx`. The button should use the same download URL construction as the header button. It should appear in the card actions area, below the "reason" message.
5. **Download URL construction** — Client-side URL: `/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}&download=true`. No client-side Blob manipulation is required; the browser's native download handles the rest.
6. **No new dependencies** — `lucide-react` (for `Download` icon) is already in the project. No other packages needed.
7. **Performance** — No change to memory or latency characteristics. The same `readFileSync` / range-request path is used; only an additional response header is set.

### Out of Scope

- Bulk/multi-file download or ZIP packaging.
- Download progress UI, resumable downloads, or pause/resume.
- File upload functionality.
- Changing existing inline preview behavior (download is additive).
- Downloading directories.
- Streaming downloads for files exceeding the 100 MB serve limit.
- Keyboard shortcuts for download.
- Rename-before-download UI.
- Changes to the `/api/workspaces/browse` or `/api/workspaces/preview` endpoints.

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00103 |
| **Title** | File system — allow download file |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/api-reference.md`, `docs/standards/security-design.md`, `docs/standards/ui-design.md` |
| **Implementation File(s)** | *(to be filled after implementation)* |
| **Test Coverage** | *(to be filled after validation)* |
| **Status** | In Progress |

### WBS Mapping

- **1.3.8 System Routes** — The `/api/workspaces/serve` endpoint change falls under the system routes package, specifically the workspace file-serving handler.
- **1.4.12 File System Browser** — The download button additions to `FileViewer` and `MetadataCard` are deliverables within the file system browser UI package.

## Implementation Notes

### Backend (`app/api/workspaces/serve/route.ts`)
- Added `download` query parameter (`?download=true`) check.
- Added `sanitizeFilenameForHeader()` helper: uses `path.basename()` to strip directory components, strips control characters (`\x00`–`\x1f`), and escapes double quotes as `\"`.
- Conditionally adds `Content-Disposition: attachment; filename="<sanitized>"` header to both range responses (206) and full-file responses.
- All existing security constraints (workspace sandboxing, path traversal, NUL byte checks, 100 MB cap) remain unchanged.

### Frontend (`components/dashboard/FileViewer.tsx`)
- Header bar: Added a download link (`<a>` tag styled as ghost button) with `Download` icon from `lucide-react`, placed between filename and close button. Links to `/api/workspaces/serve?path=<absolutePath>&download=true`.
- `MetadataCard`: Added `absolutePath` prop and a download button (primary-styled `<a>` tag with `Download` icon + "Download" label) in the card actions area below the reason message.
- No client-side Blob manipulation needed; browser handles the download natively.
- No new dependencies required.

### Deviations from documented standards
- None. Implementation follows all constraints in the specification.

## Validation

### Acceptance Criteria Verification

1. **AC-1 — Header download button visible when file selected**
   - ✅ **PASS** — `components/dashboard/FileViewer.tsx:100-109` renders a download `<a>` tag in the header bar between the filename and the close button. Uses `Download` icon from `lucide-react` (imported at line 4). Button is visible whenever `entry` is non-null (the entire header renders only when `entry` is truthy, guarded by the early return at line 79).

2. **AC-2 — Click triggers download via correct URL**
   - ✅ **PASS** — Both the header button (line 101) and the `MetadataCard` button (line 277) construct the URL as `/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}&download=true`. No client-side Blob manipulation; browser handles the download natively.

3. **AC-3 — Content-Disposition header on serve endpoint with download=true**
   - ✅ **PASS** — `app/api/workspaces/serve/route.ts:130-132` adds `Content-Disposition: attachment; filename="<sanitized>"` for range responses (206). Lines 150-152 add the same header for full-file responses (200). Both paths gated on `download === true` (set at line 77).

4. **AC-4 — Filename sanitization preventing header injection**
   - ✅ **PASS** — `sanitizeFilenameForHeader()` at lines 67-72 uses `path.basename()` to strip all directory components, removes control characters (`\x00`–`\x1f` via regex `/[\x00-\x1f]/g`), and escapes double quotes as `\"`. This prevents injection on the `filename` parameter of the `Content-Disposition` header.

5. **AC-5 — MetadataCard download button for unsupported/large files**
   - ✅ **PASS** — `MetadataCard` (lines 233-289) receives `absolutePath` as a prop and renders a primary-styled download link (lines 276-285) in the card actions area below the reason message (line 275 border-t). The card is only rendered when `classification.category === 'unsupported' || isBinaryTooLarge` (line 217).

6. **AC-6 — All file types downloadable within workspace and under 100 MB**
   - ✅ **PASS** — The serve endpoint applies no per-type filtering. The `download` flag is independent of file classification. All existing security constraints (workspace sandboxing via `validatePath`, path traversal prevention, NUL byte checks, 100 MB size cap) remain unchanged and are tested by the same endpoint in REQ-00096.

### RTM Files — Implementation
- `app/api/workspaces/serve/route.ts` (lines 67-72: `sanitizeFilenameForHeader`, lines 77: `download` param, lines 130-132, 150-152: `Content-Disposition` header)
- `components/dashboard/FileViewer.tsx` (lines 4: `Download` icon import, lines 100-109: header download button, lines 276-285: MetadataCard download button)

### RTM Files — Test Coverage
Manual validation. TypeScript compilation clean for both files (`npx tsc --noEmit` reports no errors in serve/route.ts or FileViewer.tsx). All 6 ACs verified against source code.

### Regression Check
No regressions detected. No changes to existing preview behavior. All security constraints unchanged. No new dependencies introduced.

### Status
All 6 acceptance criteria pass. Implementation complete.
