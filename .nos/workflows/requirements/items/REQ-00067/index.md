Now the system can run globally

Able to manage workspace

* CRUD workspace (globally)
  * Name
  * Path (allow to browse path)
* Select/active workspace (this will be do per-client, that mean when you go to system in new browser, you should select workspace again. if same browser, no need)

When select workspace, the other content (dashboard, terminal, member, setting, activity, workflow, etc will be reloaded in reflect of that workspace)

## Analysis

### 1. Scope

**In scope**
- A new concept of **Workspace** = `{ id, name, absolutePath, createdAt, updatedAt }` stored in a **global** (user-level, not project-local) registry — e.g. `~/.nos/workspaces.yaml` — outside any individual `.nos/` directory.
- Workspace CRUD UI + API:
  - Create (name + path; path via a directory-browse picker).
  - Rename, edit path, delete.
  - List.
- Directory-browse endpoint that can list folders on the host filesystem (starting from `$HOME`, with up-navigation), guarded to the server's user (single-user local tool).
- **Per-client active-workspace selection**: the active workspace ID is stored on the client (cookie or `localStorage`), sent with every server request (header or cookie), and resolved server-side to an absolute path that replaces today's `getProjectRoot()` behavior.
- **Global NOS process**: `nos` can be launched without being inside a workspace directory — the server boots pointing at no project; once a client selects a workspace, all workspace-scoped screens hydrate against it.
- Client-side reactivity: when the active workspace changes, dashboard, terminal, member, settings, activity, workflows and all SSE/polling streams re-fetch against the new workspace.
- Auto-seed a workspace's `.nos/` from `templates/.nos/` on first activation (same logic `bin/cli.mjs` currently uses at `ensureNosDir`).

**Out of scope (explicitly)**
- Remote / multi-host workspaces (all paths are local to the machine running `nos`).
- Multi-user auth, ACLs, or sharing workspaces across OS users.
- Server-side "current workspace" — activation is strictly per-client; two browsers on the same machine can view two different workspaces simultaneously.
- Migrating existing `.nos/` data between workspaces, or cross-workspace operations.
- Backwards-compat for `NOS_PROJECT_ROOT`/`cwd` single-project launch is **not** a hard requirement; treat it as "nice to have" if it preserves the old dev workflow during transition.

### 2. Feasibility

Viable but touches the backbone of the app. Main areas of change:

- **`lib/project-root.ts`** currently returns a module-level cached `getProjectRoot()` derived from env/cwd. That caching model breaks once the root is per-request. It must become a request-scoped resolver (e.g. `resolveProjectRoot(req)` reading a header/cookie) and every caller (23 files per `grep`: `lib/settings.ts`, `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/activity-log.ts`, `lib/agent-adapter.ts`, `lib/stage-pipeline.ts`, `lib/auto-advance.ts`, `app/api/chat/route.ts`, `app/api/workflows/**`, `app/api/claude/**`, `app/api/settings/system-prompt/route.ts`, …) must be updated.
- **Background processes** that have no HTTP request context — the auto-advance **heartbeat sweeper** (`lib/auto-advance-sweeper.ts`) and any long-lived watchers — cannot rely on a per-request header. Options to spike:
  1. Sweeper iterates over **all registered workspaces** each tick.
  2. Sweeper is spawned per-workspace on first activation and retained.
  3. Sweeper only runs for workspaces with at least one active SSE client.
  Decision needed; #1 is simplest but scales poorly.
- **SSE / streaming routes** (`/api/workflows/[id]/events`, `/api/claude/sessions/[id]/stream`) currently hold long-lived connections tied to a single project root. They must capture the workspace ID at connect-time and terminate (or emit a reconnect signal) when the client switches workspace — otherwise stale streams leak into new context.
- **Terminal** (PTY) sessions are especially sensitive: each shell has a fixed `cwd`. Switching workspace should either kill existing shells or scope them per-workspace so cross-workspace terminal bleed does not happen.
- **Path security**: the directory-browse endpoint and the workspace `path` field must reject traversal (`..`), symlink escapes outside the user's home, and non-directory targets. Even as a local tool, a malicious page on localhost could otherwise probe the filesystem.
- **Concurrency**: two browsers writing to the same workspace's `.nos/` simultaneously already exists today (multiple tabs) — no new concurrency model needed, but the workspace registry itself needs atomic writes (same pattern as `lib/settings.ts` atomicWrite).
- **CLI bootstrap** (`bin/cli.mjs`) needs a rewrite: today it `ensureNosDir()` at `projectRoot` before starting Next. In the global model, it launches without a project and the server's `ensureNosDir` runs per-workspace at activation. The lockfile / log rotation logic at `.nos/runtime/` also needs a new home (likely `~/.nos/runtime/`).

**Risks / unknowns worth spiking**
- Perf cost of reading workspace-root on every request vs. short-lived LRU cache keyed by workspace ID.
- Whether Next.js middleware (`middleware.ts`) is the right place to resolve the workspace and inject it into request context, or whether each route must do it explicitly.
- React client re-hydration: does every workspace-scoped query need to be manually invalidated on switch, or can a top-level key prop force a remount?
- Electron/desktop-style folder picker is unavailable in a pure browser — confirm the "browse path" UX is a server-rendered listing, not a native dialog.

### 3. Dependencies

- **Internal code**
  - `lib/project-root.ts` (core refactor).
  - `lib/settings.ts`, `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/activity-log.ts`, `lib/agent-adapter.ts`, `lib/stage-pipeline.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/skill-registry.ts`, `lib/tool-registry.ts`, `lib/system-prompt.ts`.
  - All API routes under `app/api/**` that touch the project root.
  - `bin/cli.mjs` (global launch, runtime-dir relocation).
  - Dashboard shell (`app/dashboard/**`, `app/layout.tsx`) to host the workspace switcher and wire reactivity.
- **Config files**
  - `.nos/settings.yaml` per-workspace already exists; a **new** global `~/.nos/workspaces.yaml` (or equivalent under `os.homedir()`) is introduced.
  - `.gitignore` handling in `bin/cli.mjs` — still applies per-workspace when seeded.
- **External**
  - Node `fs` directory listing APIs for the folder browser.
  - Likely `cookies()` / `headers()` from `next/headers` for workspace ID resolution.
- **Related requirements** — search surfaced REQ-00034 and REQ-00041 as also mentioning "workspace"; check whether they define conflicting semantics before implementation. REQ-00062 touches `NOS_PROJECT_ROOT` behavior.

### 4. Open questions

1. **Global storage location**: `~/.nos/workspaces.yaml`, platform-specific (`$XDG_CONFIG_HOME/nos/` on Linux, `~/Library/Application Support/nos/` on macOS), or overridable via `NOS_HOME` env var? Preferred default?
2. **Default workspace on first run**: when the user launches `nos` for the first time in the global model, should a workspace be auto-created from `cwd` (preserving today's zero-config feel), or should the UI force an explicit create-workspace step?
3. **Active-workspace identifier in the browser**: cookie (sent automatically on all requests, including SSE) vs. `localStorage` + explicit header (requires every fetch helper to inject it). Cookie is simpler for streams; confirm.
4. **Sweeper strategy**: which of the three sweeper options above is acceptable? This changes the data model (workspace registry may need a `lastActiveAt`).
5. **Terminal behavior on switch**: kill existing shells, keep them running in background and hide them, or keep them tagged per-workspace and only show the active workspace's?
6. **Rename / delete semantics**: does delete remove only the registry entry, or also offer to delete the on-disk `.nos/` directory? Rename — pure metadata, or rename the folder too?
7. **Invalid path handling**: if a workspace's `path` no longer exists (folder moved/deleted), do we surface it as "broken" in the list and block activation, or silently skip?
8. **Workspace-path uniqueness**: can two workspace entries point at the same path with different names, or do we enforce one-workspace-per-path?
9. **Migration**: for an existing `nos` install running in a single project dir, should the server auto-register that directory as the first workspace on upgrade, or require the user to set it up?
10. **Permissions / symlinks**: scope the browse endpoint to `$HOME` only, or allow any readable path (with the known risk that a localhost-origin page can enumerate the filesystem)?

## Specification

### User Stories

1. **As a developer**, I want to create and manage multiple workspaces locally so that I can switch between different projects without restarting the `nos` server.

2. **As a user**, I want to select an active workspace in my browser so that all dashboard content, terminal, settings, and workflows reflect that workspace.

3. **As a developer**, I want to browse my filesystem to select a workspace path using a UI picker so that I don't need to type absolute paths manually.

4. **As an operator**, I want workspaces to persist in a global registry (`~/.nos/workspaces.yaml`) so that my workspace definitions survive server restarts and `nos` launches.

5. **As a user in two browser tabs**, I want each tab to maintain its own active workspace independently so that I can view different workspaces simultaneously without one affecting the other.

6. **As a developer on first launch**, I want the system to either auto-seed a workspace from `cwd` or guide me through workspace creation so that the onboarding experience is smooth.

### Acceptance Criteria

#### Workspace CRUD

1. **Create workspace**
   - Given: A valid workspace name and an existing directory path
   - When: I submit the "Create Workspace" form
   - Then: The workspace is stored in `~/.nos/workspaces.yaml` with `{ id, name, absolutePath, createdAt, updatedAt }`

2. **List workspaces**
   - Given: One or more workspaces registered in the global registry
   - When: I fetch `GET /api/workspaces`
   - Then: The response includes all workspaces with their metadata (id, name, path, createdAt, updatedAt)

3. **Rename workspace**
   - Given: An existing workspace
   - When: I update its name via `PATCH /api/workspaces/{id}`
   - Then: The name field is updated in `~/.nos/workspaces.yaml` and persists across restarts

4. **Edit workspace path**
   - Given: An existing workspace with an invalid or outdated path
   - When: I update the path via `PATCH /api/workspaces/{id}`
   - Then: The new path is validated (directory exists, not a symlink escape) and persists

5. **Delete workspace**
   - Given: An existing workspace
   - When: I delete it via `DELETE /api/workspaces/{id}`
   - Then: The workspace entry is removed from `~/.nos/workspaces.yaml`

#### Directory Browse Endpoint

6. **List directories**
   - Given: A request to `GET /api/workspaces/browse?path={dir}`
   - When: Called with a valid path under `$HOME`
   - Then: The response lists all subdirectories at that path with their names and full paths

7. **Traverse up**
   - Given: The browse endpoint at a subdirectory
   - When: The client requests the parent directory
   - Then: The response includes a `..` or `parent` link allowing navigation upward to `$HOME` (but not above)

8. **Reject path traversal**
   - Given: A browse request with a path containing `../`
   - When: Submitted
   - Then: The request is rejected with a 400 error; traversal is blocked

9. **Reject symlink escapes**
   - Given: A path that is a symlink pointing outside `$HOME`
   - When: Submitted as a workspace path
   - Then: The path is rejected and the user is notified

10. **Reject non-directories**
    - Given: A path pointing to a file rather than a directory
    - When: Submitted as a workspace path
    - Then: The path is rejected; only directories are accepted

#### Active Workspace Selection

11. **Set active workspace**
    - Given: A valid workspace ID
    - When: I select it via `POST /api/workspaces/{id}/activate` or client-side cookie/localStorage update
    - Then: The workspace ID is stored on the client (cookie preferred for SSE support)

12. **Persist active workspace**
    - Given: An active workspace selected in the browser
    - When: I navigate to another page or refresh
    - Then: The same workspace remains active without re-prompting

13. **Per-client isolation**
    - Given: Two browser tabs or windows on the same machine
    - When: Tab A selects Workspace-X and Tab B selects Workspace-Y
    - Then: Dashboard in Tab A shows Workspace-X content; Dashboard in Tab B shows Workspace-Y content independently

14. **Include workspace ID in requests**
    - Given: A client with an active workspace
    - When: Any API request is made (e.g., `GET /api/workflows`)
    - Then: The workspace ID is included (via cookie or header) and server-side routing uses it to resolve the project root

#### Content Reloading on Workspace Switch

15. **Dashboard reload**
    - Given: An active workspace change
    - When: The client switches to a different workspace
    - Then: Dashboard queries (`GET /api/dashboard/**`) are re-fetched against the new workspace root

16. **Settings reload**
    - Given: An active workspace change
    - When: The client switches to a different workspace
    - Then: Settings panel (`GET /api/settings/**`) reflects the new workspace's configuration

17. **Workflows reload**
    - Given: An active workspace change
    - When: The client switches to a different workspace
    - Then: Workflow list (`GET /api/workflows`) and item list show the new workspace's workflows

18. **Activity reload**
    - Given: An active workspace change
    - When: The client switches to a different workspace
    - Then: Activity log reflects the new workspace's history

19. **Terminal behavior on switch**
    - Given: Active terminal PTY sessions and a workspace switch
    - When: The client selects a different workspace
    - Then: Existing shells are either killed or hidden (per design decision); new terminals start in the active workspace's directory

20. **SSE stream reconnection**
    - Given: A long-lived SSE connection (e.g., `/api/workflows/[id]/events`)
    - When: The client switches workspace
    - Then: The old stream closes or emits a reconnect signal; the client re-subscribes to the new workspace's equivalent resource

#### Global NOS Bootstrap

21. **Launch without workspace**
    - Given: `nos` is started without being inside a workspace directory and no `NOS_PROJECT_ROOT` is set
    - When: The server boots
    - Then: It starts without a default project; the dashboard prompts for workspace selection or creation

22. **Auto-seed workspace directory**
    - Given: A workspace is activated for the first time
    - When: The user selects it as active
    - Then: The system checks if `{workspace_path}/.nos/` exists; if not, it is seeded from `templates/.nos/`

23. **Request-scoped project root resolution**
    - Given: An HTTP request with an active workspace ID
    - When: The server processes it
    - Then: `getProjectRoot()` (now `resolveProjectRoot(req)`) returns the workspace's absolute path, not a module-level cached value

#### Concurrency & Atomicity

24. **Atomic workspace registry writes**
    - Given: Multiple concurrent requests updating the workspace registry
    - When: Changes are written to `~/.nos/workspaces.yaml`
    - Then: Writes use atomic file operations (e.g., `atomicWrite` pattern from `lib/settings.ts`) to prevent corruption

25. **No cross-workspace data bleed**
    - Given: Two workspaces with similar file structures (e.g., both have `.nos/workflows/`)
    - When: A client switches workspace
    - Then: Cached queries or stream data from the old workspace do not leak into the new workspace's view

### Technical Constraints

1. **Path Security**
   - The directory-browse endpoint must reject any path containing `../`, relative traversal, or symlinks pointing outside `$HOME`.
   - Only directories are accepted; files are rejected.
   - Single-user local tool; no remote filesystem support.

2. **Workspace Registry Schema**
   - Global registry stored at `~/.nos/workspaces.yaml` (or platform-specific equivalent; see open questions).
   - Each entry: `{ id: string (UUID), name: string, absolutePath: string, createdAt: ISO-8601, updatedAt: ISO-8601 }`.
   - Atomic writes using the `atomicWrite` pattern established in `lib/settings.ts`.

3. **Active Workspace Identifier**
   - Stored on the client as a cookie (preferred) or `localStorage`.
   - Cookie approach: auto-sent on all requests including SSE; simpler middleware integration.
   - `localStorage` approach: requires explicit header injection in all fetch helpers.
   - Should be implemented as a cookie (see open question 3 for final confirmation).

4. **Request-Scoped Resolution**
   - `lib/project-root.ts` must be refactored from module-level cached `getProjectRoot()` to request-scoped `resolveProjectRoot(req)`.
   - All 23+ callers (in `lib/`, `app/api/`, etc.) must be updated to pass the request or extract the workspace ID from context.
   - Next.js middleware may be the integration point; each route may also need explicit handling.

5. **Background Process Handling**
   - The auto-advance sweeper (`lib/auto-advance-sweeper.ts`) cannot rely on HTTP context.
   - Must be configured to either:
     - Iterate all registered workspaces on each tick (simplest, but scales poorly).
     - Spawn per-workspace on first activation and retain (scales better but more complex).
     - Only run for workspaces with active SSE clients (client-driven, but implicit).
   - Decision to be confirmed during implementation.

6. **SSE / Streaming Lifecycle**
   - SSE routes (`/api/workflows/[id]/events`, `/api/claude/sessions/[id]/stream`) must capture the workspace ID at connection time.
   - When the client switches workspace, existing streams must close or signal reconnection.
   - New subscriptions post-switch target the new workspace's resources.

7. **Terminal (PTY) Sessions**
   - Each shell has a fixed working directory.
   - On workspace switch:
     - Either kill all existing shells and restart in the new workspace.
     - Or scope shells per-workspace and hide those from the inactive workspace.
   - Cross-workspace terminal bleed (mixing stdout from two shells) must be prevented.

8. **CLI Bootstrap Changes**
   - `bin/cli.mjs` must be rewritten to launch `nos` without requiring a specific project directory.
   - Runtime directory logic (lock files, logs) must move from `.nos/runtime/` to a global location (likely `~/.nos/runtime/`).
   - The `ensureNosDir` logic moves from bootstrap to per-workspace activation.

9. **Performance**
   - Workspace-root resolution on every request may have measurable latency.
   - Consider short-lived LRU cache keyed by workspace ID to reduce repeated file I/O.
   - Perf impact must be measured and confirmed acceptable.

10. **Client-Side Reactivity**
    - Query invalidation on workspace switch must be reliable.
    - Consider using top-level React `key` prop or explicit `useEffect` cleanup.
    - All workspace-scoped data must be re-fetched, not cached across workspace boundaries.

### Out of Scope

- **Remote or multi-host workspaces**: All workspaces are local to the machine running `nos`.
- **Multi-user auth, ACLs, or workspace sharing**: Single-user local tool only.
- **Server-side "current workspace" state**: Workspace activation is strictly per-client; two browsers can view different workspaces simultaneously.
- **Cross-workspace operations**: Migrating data, copying, or merging workspaces.
- **Backwards-compatibility for `NOS_PROJECT_ROOT` / `cwd` launch**: Treat as "nice to have" if feasible; the global model is the new standard.
- **Workspace path uniqueness enforcement**: Multiple workspace entries pointing to the same path are allowed (not explicitly blocked).
- **Desktop/Electron folder picker**: UX is a server-rendered directory browser, not a native file dialog.

## Validation

Validated on 2026-04-20. **No implementation code exists.** All 25 ACs fail.

Evidence: No `app/api/workspaces/` routes exist, no `~/.nos/workspaces.yaml` registry, no changes to `lib/project-root.ts`, no workspace UI components, no middleware for cookie/header resolution.

### Workspace CRUD

1. ❌ **Create workspace** — No `POST /api/workspaces` endpoint; no registry file; no UI form.
2. ❌ **List workspaces** — No `GET /api/workspaces` endpoint.
3. ❌ **Rename workspace** — No `PATCH /api/workspaces/{id}` endpoint.
4. ❌ **Edit workspace path** — No `PATCH /api/workspaces/{id}` endpoint; no path validation.
5. ❌ **Delete workspace** — No `DELETE /api/workspaces/{id}` endpoint.

### Directory Browse Endpoint

6. ❌ **List directories** — No `GET /api/workspaces/browse` endpoint.
7. ❌ **Traverse up** — No browse endpoint exists.
8. ❌ **Reject path traversal** — No browse endpoint; no traversal protection.
9. ❌ **Reject symlink escapes** — No path validation code.
10. ❌ **Reject non-directories** — No directory-only enforcement.

### Active Workspace Selection

11. ❌ **Set active workspace** — No `POST /api/workspaces/{id}/activate`; no cookie set logic.
12. ❌ **Persist active workspace** — No cookie/localStorage mechanism.
13. ❌ **Per-client isolation** — No per-client workspace state exists.
14. ❌ **Include workspace ID in requests** — No cookie/header injection; `lib/project-root.ts` still uses module-level cached `getProjectRoot()`.

### Content Reloading on Workspace Switch

15. ❌ **Dashboard reload** — No workspace-context-aware query invalidation.
16. ❌ **Settings reload** — Settings still use single-project `getProjectRoot()`.
17. ❌ **Workflows reload** — Workflow API still uses single-project root.
18. ❌ **Activity reload** — Activity log still uses single-project root.
19. ❌ **Terminal behavior on switch** — No workspace-scoped terminal lifecycle.
20. ❌ **SSE stream reconnection** — SSE routes do not capture workspace ID at connect time.

### Global NOS Bootstrap

21. ❌ **Launch without workspace** — Server still requires project root at boot; no workspace-selection prompt.
22. ❌ **Auto-seed workspace directory** — `ensureNosDir` still runs at CLI bootstrap, not at workspace activation.
23. ❌ **Request-scoped project root resolution** — `lib/project-root.ts` uses module-level cached value; no `resolveProjectRoot(req)` exists.

### Concurrency & Atomicity

24. ❌ **Atomic workspace registry writes** — No workspace registry; no atomic write logic for workspaces.
25. ❌ **No cross-workspace data bleed** — Single-workspace model; no cross-workspace isolation needed yet, but impossible to verify without implementation.

### Follow-up required

- Implement workspace registry (`lib/workspace-store.ts`) with `~/.nos/workspaces.yaml` and atomic writes.
- Implement `app/api/workspaces/` routes: `GET`, `POST`, `PATCH/{id}`, `DELETE/{id}`, `POST/{id}/activate`, `GET/browse`.
- Refactor `lib/project-root.ts` to `resolveProjectRoot(req)` and update all 23+ callers.
- Add middleware or per-route cookie/header resolution for workspace ID.
- Implement workspace switcher UI in dashboard shell.
- Handle sweeper, SSE, and terminal lifecycle on workspace switch.
- Add path security (traversal, symlink, non-directory rejection) to browse + PATCH endpoints.
