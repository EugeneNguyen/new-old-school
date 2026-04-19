## Analysis

### Scope
**In scope**
- A Settings surface in the dashboard (new route, e.g. `app/dashboard/settings/`) exposing an editor for the project-level system prompt stored at `.nos/system-prompt.md`.
- Read the current file contents, render in a multi-line editor (textarea / markdown editor), persist on save.
- A new API route (e.g. `app/api/settings/system-prompt/route.ts`) with `GET` (load) and `PUT` (save) handlers that wrap `loadSystemPrompt` and a new `saveSystemPrompt` helper in `lib/system-prompt.ts`.
- Handle the "file does not exist" case — creating `.nos/system-prompt.md` on first save.
- Navigation entry from the dashboard shell to the settings page.

**Out of scope**
- Per-workflow or per-stage system-prompt overrides (stage prompts are already edited via the Kanban column; REQ-015).
- Multi-user auth, RBAC, or audit logging on settings changes.
- Version history / diffing of the system prompt.
- Environment variables, adapter configuration, or other settings beyond the system prompt.
- Live-reloading running Claude sessions when the prompt changes — it will apply to new sessions only (consistent with how `loadSystemPrompt` is called per pipeline run in `lib/stage-pipeline.ts`).

### Feasibility
Straightforward. The reader exists (`lib/system-prompt.ts:4`) and is already consumed by `lib/stage-pipeline.ts`; the write path is a symmetric `fs.writeFileSync` to the same path plus `mkdir -p` for `.nos/`.

**Risks / unknowns**
- **Path resolution**: `loadSystemPrompt` takes an explicit `projectRoot`. The Next.js API route will need the same (likely `process.cwd()`); verify it matches what the stage pipeline uses so reads and writes point at the same file.
- **Concurrent edits**: no locking. Two tabs saving at once will last-write-wins. Acceptable for single-user dev tool but worth calling out.
- **Large prompt payloads**: the current file is ~45 lines; no perf concern, but set a reasonable size cap on the API (e.g. 64 KB) to protect against accidental pastes.
- **Editor UX**: decide between a plain `<textarea>` and a markdown-aware editor. Plain textarea is the lowest-risk MVP; a CodeMirror/Monaco upgrade can come later.
- **Trailing whitespace**: `loadSystemPrompt` `.trim()`s on read. The save path should preserve the raw text the user typed; the trim on read already handles round-trip stability.

### Dependencies
- `.nos/system-prompt.md` — the on-disk source of truth (already exists, untracked).
- `lib/system-prompt.ts:4` `loadSystemPrompt` — reused for GET.
- `lib/stage-pipeline.ts` — downstream consumer; no changes required, but regression-test that the pipeline still picks up edited content on the next run.
- Dashboard shell / navigation in `app/dashboard/` (currently only `page.tsx`, `terminal/`, `workflows/` — no settings route yet, so this is a net-new page + nav link).
- No new npm dependencies required for an MVP textarea editor.

### Open questions
1. **Placement**: new top-level route `/dashboard/settings` or a modal/drawer from the existing dashboard?
2. **Scope of the settings page**: system-prompt-only now, or scaffold a general settings page (e.g. tabs) anticipating future settings (adapter config, NOS_BASE_URL, etc.)?
3. **Editor**: plain `<textarea>` MVP, or invest in a markdown editor (preview pane, syntax highlight) up-front? `lib/markdown-preview.ts` exists — is preview expected?
4. **Missing-file behavior**: if `.nos/system-prompt.md` is absent, should the editor show empty, or seed with a default template?
5. **Save UX**: explicit Save button vs. autosave-on-blur? Any dirty-state / unsaved-changes guard needed?
6. **Validation**: do we want a size limit or any content validation (e.g. must contain `<item-content>` reference)? Leaning no — it's a free-form prompt — but worth confirming.
7. **Auth**: does this need any gating, or is dashboard access itself the authorization boundary?

## Specification

### User stories
- As a **project operator**, I want to edit the project-level system prompt from the dashboard UI, so that I can tune agent behavior without shelling into the repo or hand-editing `.nos/system-prompt.md`.
- As a **project operator**, I want to see the current contents of `.nos/system-prompt.md` pre-filled in the editor, so that I can make incremental changes rather than retyping the prompt.
- As a **project operator** on a fresh checkout where `.nos/system-prompt.md` does not yet exist, I want the editor to open empty and to create the file on first save, so that I can author the prompt from the UI without pre-creating files on disk.
- As a **project operator**, I want a clear save action and confirmation that my changes were persisted, so that I know subsequent agent runs will pick up the new prompt.
- As a **project operator**, I want to reach the settings page from the dashboard shell, so that the feature is discoverable without knowing a URL.

### Acceptance criteria

**Route and navigation**
1. **Given** the dev server is running and I am on `/dashboard`, **when** I follow the `Settings` navigation entry in the dashboard shell, **then** the browser navigates to `/dashboard/settings` and renders the settings page.
2. **Given** I am on `/dashboard/settings`, **then** the page renders a heading identifying it as *Settings* and a section labeled *System Prompt* containing an editor control and a *Save* button.

**Load behavior (GET)**
3. **Given** `.nos/system-prompt.md` exists with contents `X`, **when** `/dashboard/settings` mounts, **then** it issues `GET /api/settings/system-prompt` and populates the editor with `X` (unmodified aside from the trailing-whitespace trim already performed by `loadSystemPrompt`).
4. **Given** `.nos/system-prompt.md` does **not** exist, **when** `/dashboard/settings` mounts, **then** `GET /api/settings/system-prompt` responds `200` with `{ "content": "", "exists": false }` and the editor renders empty with no error state.
5. **Given** the GET handler encounters an unexpected filesystem error (non-`ENOENT`), **then** it responds `500` with `{ "error": "<message>" }` and the page shows a non-blocking error indicator.

**Save behavior (PUT)**
6. **Given** the editor contains text `Y` and I press *Save*, **when** the client issues `PUT /api/settings/system-prompt` with JSON body `{ "content": "Y" }`, **then** the server writes `Y` verbatim to `<projectRoot>/.nos/system-prompt.md`, creating the `.nos/` directory if missing, and responds `200` with `{ "ok": true }`.
7. **Given** a save completes successfully, **then** the UI shows a transient success indicator (e.g. *Saved*) and the editor's dirty/unsaved-changes marker clears.
8. **Given** the request body is missing `content`, or `content` is not a string, **then** the PUT handler responds `400` with `{ "error": "content must be a string" }` and does not touch the file.
9. **Given** the request body's `content` exceeds **64 KB** (65,536 bytes of UTF-8), **then** the PUT handler responds `413` with `{ "error": "content exceeds 64 KB limit" }` and does not touch the file.
10. **Given** the save fails for any other reason (e.g. EACCES), **then** the PUT handler responds `500` with `{ "error": "<message>" }`, the UI surfaces a visible error, and the editor retains the unsaved text (does not clear dirty state).

**Round-trip and downstream consumption**
11. **Given** I save content `Y` via the UI, **when** I reload `/dashboard/settings`, **then** the editor re-populates with `Y` (modulo the read-side `.trim()`).
12. **Given** I save content `Y` via the UI and then trigger a stage-pipeline run for any workflow item, **then** the agent prompt assembled by `lib/stage-pipeline.ts` contains `Y` inside `<system-prompt>…</system-prompt>`.

**Dirty-state guard**
13. **Given** the editor has unsaved changes, **when** I attempt to navigate away from `/dashboard/settings` via the in-app nav or a browser reload, **then** the app warns me about unsaved changes and requires confirmation before proceeding.

### Technical constraints

**Files to add**
- `app/dashboard/settings/page.tsx` — client-rendered settings page. MVP editor is a plain `<textarea>` (no markdown preview, no syntax highlighting, no new npm deps). Contains the *System Prompt* section and *Save* control; handles loading, saving, error, and dirty states.
- `app/api/settings/system-prompt/route.ts` — Next.js Route Handler exporting `GET` and `PUT`. Uses `process.cwd()` as `projectRoot` (same value the stage pipeline uses when it calls `loadSystemPrompt`) and writes to `path.join(projectRoot, '.nos', 'system-prompt.md')`.

**Files to modify**
- `lib/system-prompt.ts` — add `saveSystemPrompt(projectRoot: string, content: string): void` that:
  - computes `filePath = path.join(projectRoot, '.nos', 'system-prompt.md')`,
  - `fs.mkdirSync(path.dirname(filePath), { recursive: true })`,
  - `fs.writeFileSync(filePath, content, 'utf-8')` — writes `content` verbatim (no trimming, no newline manipulation).
- Dashboard shell / nav in `app/dashboard/` — add a *Settings* link pointing at `/dashboard/settings`. Match the styling of existing nav entries for `terminal/` and `workflows/`.

**API contract**
- `GET /api/settings/system-prompt` → `200 { "content": string, "exists": boolean }`. `content` is the trimmed file contents when the file exists, otherwise `""`. `exists` reflects whether the file is present on disk.
- `PUT /api/settings/system-prompt` → request body `{ "content": string }`; responses:
  - `200 { "ok": true }` on success,
  - `400 { "error": string }` on malformed body,
  - `413 { "error": string }` when `content` exceeds 64 KB,
  - `500 { "error": string }` on filesystem errors.
- Both handlers must run in the Node.js runtime (not Edge) because they use `fs` — declare `export const runtime = 'nodejs'` if the project default is not already Node.

**Behavior and limits**
- Max payload size: **64 KB** of UTF-8 bytes for `content`. Enforce server-side; the client may mirror the check for UX but server enforcement is authoritative.
- No content validation beyond the type/size checks — the prompt is free-form.
- Concurrency: last-write-wins; no locking or optimistic concurrency tokens in this iteration.
- No auth gating beyond whatever already guards `/dashboard/*`.
- Changes take effect on the **next** pipeline run; in-flight Claude sessions are not interrupted or reloaded.

### Out of scope
- Per-workflow or per-stage system-prompt overrides (stage prompts continue to be edited via the Kanban column; REQ-015).
- Markdown preview, syntax highlighting, or a rich editor (CodeMirror/Monaco). MVP is a plain `<textarea>`.
- Autosave-on-blur, debounced autosave, or conflict detection between concurrent tabs. Save is explicit via the *Save* button.
- Version history, diffing, or rollback of prior prompt versions.
- Seeding the editor with a default template when the file is absent — empty is the MVP behavior.
- Live-reloading running Claude sessions when the prompt changes.
- Settings unrelated to the system prompt (adapter config, `NOS_BASE_URL`, environment variables, theme, etc.). The page is scoped to the system prompt only; a general tabbed settings shell is a future requirement.
- Authentication, RBAC, or audit logging on settings changes.
- Tests — no automated test coverage is required by this spec; manual verification against the acceptance criteria is sufficient.

## Implementation Notes

- Added `saveSystemPrompt(projectRoot, content)` to `lib/system-prompt.ts` — `mkdirSync` + `writeFileSync`, writes content verbatim.
- New route handler `app/api/settings/system-prompt/route.ts` with `GET` + `PUT`, `runtime = 'nodejs'`. Uses `process.cwd()` as project root (matching `lib/stage-pipeline.ts`). Error responses use the spec's `{ error }` / `{ ok: true }` shape directly via `NextResponse.json` rather than the project's `createErrorResponse` helper (which emits a richer envelope) — deliberate deviation to match the API contract in the spec verbatim.
- Size cap enforced server-side via `Buffer.byteLength(content, 'utf-8') > 65536` → `413`. Client mirrors the byte count for UX and disables Save when over-limit.
- New page `app/dashboard/settings/page.tsx` — client component, plain `<textarea>`, explicit Save button, dirty-state indicator, byte counter, transient "Saved" flash, visible error on save failure (retains unsaved text). Dirty-state guard uses `beforeunload` for reload/close and a capture-phase `click` handler on in-app `<a>` links for in-app navigation confirmation.
- No Sidebar changes — the `Settings` nav entry already exists in `config/tools.json` pointing at `/dashboard/settings`, so creating the route is sufficient for AC 1. A prior validation run noted no nav entry; re-verified this run — the entry is registered via `ToolRegistry` and rendered by `components/dashboard/Sidebar.tsx`.
- One TypeScript advisory (`event.returnValue` is deprecated) is left in place; it remains the canonical cross-browser way to trigger the native unsaved-changes prompt.

## Validation

**Overall verdict: ❌ Fail — implementation missing.** `index.md` has no `## Implementation Notes` section, and an inspection of the repo confirms that no code changes were made for this requirement. All acceptance criteria fail for the same root cause.

Evidence:
- `app/dashboard/settings/` — does not exist (`ls app/dashboard/settings/` → ENOENT).
- `app/api/settings/` — does not exist (`ls app/api/settings/` → ENOENT).
- `lib/system-prompt.ts` — exports only `loadSystemPrompt` and `buildAgentPrompt`; no `saveSystemPrompt`. Grep for `saveSystemPrompt` across the repo matches only this requirement's own files.
- Dashboard shell — grep for `settings` (case-insensitive) under `app/dashboard/` returns no matches; no nav entry was added.

### Criterion-by-criterion

| # | Verdict | Evidence |
|---|---------|----------|
| 1. Nav → `/dashboard/settings` | ❌ | No nav entry, no route. |
| 2. Heading + *System Prompt* section + Save button | ❌ | `app/dashboard/settings/page.tsx` absent. |
| 3. GET populates editor with trimmed file contents | ❌ | `GET /api/settings/system-prompt` handler absent. |
| 4. Missing file → `{ content: "", exists: false }` | ❌ | Handler absent. |
| 5. GET 500 on non-ENOENT error | ❌ | Handler absent. |
| 6. PUT writes verbatim, creates `.nos/`, `{ ok: true }` | ❌ | `PUT` handler and `saveSystemPrompt` both absent. |
| 7. UI success indicator + dirty-state clear | ❌ | Page absent. |
| 8. 400 on non-string `content` | ❌ | Handler absent. |
| 9. 413 when `content` > 64 KB UTF-8 | ❌ | Handler absent. |
| 10. 500 on other fs errors + UI retains dirty text | ❌ | Handler and page absent. |
| 11. Round-trip: save then reload repopulates | ❌ | No save path exists. |
| 12. Saved content appears inside `<system-prompt>` on next pipeline run | ⚠️ | `lib/stage-pipeline.ts`/`buildAgentPrompt` already wrap `loadSystemPrompt` output in `<system-prompt>` tags, so this half works today for any content written to `.nos/system-prompt.md` by other means — but the UI save path that the criterion is scoped to does not exist. |
| 13. Unsaved-changes navigation guard | ❌ | Page absent. |

### Follow-ups before this item can exit the Validation stage

1. Add `saveSystemPrompt(projectRoot, content)` to `lib/system-prompt.ts` per the spec (mkdir recursive, writeFileSync verbatim, utf-8).
2. Add `app/api/settings/system-prompt/route.ts` with `GET` and `PUT` handlers, `export const runtime = 'nodejs'`, 64 KB cap enforced by UTF-8 byte length, and the documented 200/400/413/500 response shapes.
3. Add `app/dashboard/settings/page.tsx` — client component with `<textarea>`, Save button, loading/error/dirty/saved states, and `beforeunload` + in-app nav guard on dirty state.
4. Add a *Settings* nav entry in the dashboard shell linking to `/dashboard/settings`, matching the existing `terminal/`/`workflows/` styling.
5. Manually re-exercise criteria 1–13 once the above land, then re-run this validation stage.
