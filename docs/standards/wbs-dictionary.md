# WBS Dictionary

> Last updated: 2026-04-24 (updated skill field in stages per REQ-00110)

---

## 1.1 Core Workflow Engine

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.1.1 | Workflow CRUD | Create, read, update, and delete workflow definitions; validate id/name/idPrefix patterns | Backend | M | u2014 | Workflows persist as `config.json` + `config/stages.yaml` in `.nos/workflows/<id>/` |
| 1.1.2 | Stage Pipeline | Define ordered stages with name, description, prompt, agent assignment, skill/slash-command assignment, and auto-advance flag | Backend | M | 1.1.1 | Stages stored in YAML; order preserved; agent reference validated; skill injected as `[Skill: /<skill-name>]` directive |
| 1.1.3 | Item Lifecycle | Create items in stages, manage status transitions (Todou2192In Progressu2192Done/Failed), move between stages | Backend | L | 1.1.1, 1.1.2 | Items stored as `meta.yml` + `index.md`; status transitions validated; activity logged |
| 1.1.4 | Auto-Advance System | Heartbeat sweeper detecting session completion, auto-advancing Done items to next stage, auto-starting eligible Todo items | Backend | L | 1.1.3, 1.2.3 | Configurable interval (default 60s); completes sessions; advances items; triggers pipelines |
| 1.1.5 | Activity Logging | Append-only JSONL log per workflow tracking title/stage/status/body changes with timestamps and hashes | Backend | S | 1.1.3 | Activity entries include type, before/after values, timestamps; supports pagination |
| 1.1.6 | Event System | EventEmitter pub/sub for item-created/updated/deleted/activity events; SSE endpoint for real-time streaming | Backend | M | 1.1.3 | Events emitted on all mutations; SSE consumers receive events; chokidar watches external edits |

## 1.2 Agent & Execution Layer

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.2.1 | Agent Management | CRUD for agent configurations: displayName, adapter, model, prompt template | Backend | M | u2014 | Agents stored in `.nos/agents/<id>/`; slug validation; reference tracking on delete |
| 1.2.2 | Adapter Interface | Pluggable `AgentAdapter` interface with `startSession()` and `listModels()` methods; Claude CLI implementation | Backend | M | u2014 | Claude adapter spawns `claude` CLI; extracts session ID; captures output |
| 1.2.3 | Stage Pipeline Trigger | Assemble full prompt (system + member + stage + item), spawn agent session, prevent duplicate sessions | Backend | L | 1.2.1, 1.2.2 | Prompt built with XML-tagged sections; session recorded in item metadata; dedup by stage |
| 1.2.4 | System Prompt Management | Load/save `.nos/system-prompt.md`; build multi-tag prompt structure | Backend | S | u2014 | System prompt persisted to disk; available to all stage executions |
| 1.2.5 | Session Tracking | Track active child processes; manage listeners for streaming output; 30s cleanup timeout | Backend | M | 1.2.2 | Stream registry tracks PIDs; output files at `.claude/sessions/<id>.txt` |
| 1.2.6 | Routine Scheduler | Recurring task triggers configurable per workflow | Backend | M | 1.1.3 | Routine config in `routine.yaml`; state tracking in `routine-state.json` |

## 1.3 REST API Surface

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.3.1 | Workflow Routes | CRUD endpoints for workflows at `/api/workflows` | Backend | M | 1.1.1 | GET (list), POST (create with validation), GET/PATCH/DELETE by ID |
| 1.3.2 | Item Routes | CRUD endpoints for items including content and comments | Backend | L | 1.1.3 | POST (create + trigger pipeline), PATCH (update), GET/PUT content, comment CRUD |
| 1.3.3 | Stage Routes | CRUD and reorder endpoints for stages; skill assignment via PATCH | Backend | M | 1.1.2 | POST (add), PATCH (update with optional skill field), DELETE (must be empty), POST order (set validated) |
| 1.3.4 | Agent Routes | CRUD endpoints for agents with reference checking | Backend | M | 1.2.1 | GET (list), POST (create), GET/PATCH/DELETE by ID; DELETE blocked if referenced |
| 1.3.5 | Activity Routes | Activity log endpoints: global, per-workflow, per-item, SSE events | Backend | M | 1.1.5, 1.1.6 | Pagination via before/limit; SSE streaming; bounds-clamped limit (1u2013500) |
| 1.3.6 | Session & Chat Routes | Spawn agent sessions, stream output, check status | Backend | L | 1.2.2, 1.2.5 | POST to spawn; SSE streaming; status polling; stop command |
| 1.3.7 | Settings Routes | System prompt, heartbeat interval, default agent config | Backend | S | 1.2.4 | GET/PUT for each setting; validation on write |
| 1.3.8 | System Routes | Shell execution, system info, adapter listing, workspace management | Backend | M | 1.6.3 | Shell validates command type; adapters list models; workspace CRUD |
| 1.3.9 | Analytics Routes | Session count aggregation by time window | Backend | S | 1.1.3 | Bucketed counts from ItemSession.startedAt across all workflows |
| 1.3.10 | Template Routes | Template listing, detail, and installation | Backend | M | 1.7.5 | List from templates/.nos/workflows; install to workspace .nos/workflows |
| 1.3.11 | Health Routes | Server health check for monitoring and CLI restart | Backend | S | 1.1.4 | Returns uptime, heartbeat status, stale detection |

## 1.4 Web Dashboard (UI)

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.4.1 | Dashboard Shell | Root layout with sidebar, navigation, workspace switcher, toaster | Frontend | M | 1.5.1, 1.5.2 | Persistent sidebar; workspace dropdown; responsive layout |
| 1.4.2 | Kanban Board | Drag-drop stage columns with item cards; maxDisplayItems cap; expand/collapse | Frontend | L | 1.3.2, 1.1.6 | Items grouped by stage; drag between columns; SSE real-time updates |
| 1.4.3 | List View | Tabular view of workflow items | Frontend | M | 1.3.2 | Sortable/filterable; toggle with Kanban |
| 1.4.4 | Item Detail Dialog | Full item editor with title, markdown body (MDXEditor), comments, sessions, status | Frontend | L | 1.3.2, 1.5.3 | Edit title/body/status; add/edit/delete comments; view sessions |
| 1.4.5 | Stage Configuration | Dialog for configuring stage settings: prompt, agent, auto-advance, max items | Frontend | M | 1.3.3 | All stage fields editable; agent selection dropdown |
| 1.4.6 | Workflow Settings | Workflow name/prefix editing, stage management, routine configuration | Frontend | M | 1.3.1, 1.3.3 | Update metadata; manage stage order; configure routines |
| 1.4.7 | Agent Management | Members page for creating, editing, deleting agents | Frontend | M | 1.3.4 | CRUD operations; reference warning on delete |
| 1.4.8 | Claude Terminal | Session panel with streaming output, slash commands, question/tool-use cards | Frontend | L | 1.3.6 | SSE streaming; interactive questions; slash command palette |
| 1.4.9 | Settings Pages | System prompt editor, heartbeat config, default agent selector | Frontend | M | 1.3.7 | Read/write settings; immediate feedback |
| 1.4.10 | Activity Feed | Global and per-workflow activity timeline | Frontend | M | 1.3.5 | Paginated activity list; real-time updates |
| 1.4.11 | Workspace Management | Browse filesystem, create, activate workspaces | Frontend | M | 1.3.8 | Directory browser; create workspace; activate via cookie |
| 1.4.12 | File System Browser | Two-panel layout: FileBrowser tree + FileViewer with text/image/audio/video preview; workspace sandboxing; 100MB binary guard; metadata card for unsupported types | Frontend | L | 1.3.8, 1.6.7 | `/dashboard/files` page renders; file types classified; preview works for text/image/audio/video; sandbox enforced at API level |
| 1.4.12a | Create Folder | "New Folder" button in FileBrowser toolbar; inline name input; `POST /api/workspaces/mkdir` endpoint; duplicate-name conflict handling; Escape to cancel | Frontend + Backend | S | 1.4.12, 1.3.8 | Inline input creates OS directory in current workspace path; 409 on duplicate name; UI refreshes listing on success |

## 1.5 UI Component Library

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.5.1 | Primitive Components | shadcn/ui-pattern components: Button, Input, Dialog, Select, Badge, ScrollArea, Toast | Frontend | M | u2014 | CVA variants; Radix primitives; ref-as-prop (React 19); accessible |
| 1.5.2 | Theme System | CSS variable tokens for 12+ semantic colors; light/dark mode via `next-themes` | Frontend | M | u2014 | `:root` and `.dark` tokens defined; `ThemeProvider` wraps app |
| 1.5.3 | Markdown Rendering | Preview with rehype-sanitize; MDXEditor for editing; remark-breaks for line breaks | Frontend | M | u2014 | Safe HTML rendering; scoped styles; consistent across dialogs |
| 1.5.4 | Icon System | lucide-react icons used throughout the dashboard | Frontend | S | u2014 | Consistent icon usage; tree-shakeable imports |
| 1.5.5 | Chat Components | Shared chat UI components extracted from Terminal and ChatWidget: ChatBubble, MessageList, TypingIndicator, ChatInput, ToolUseCard, QuestionCard | Frontend | M | 1.5.1 | Components reused across Terminal and ChatWidget; barrel export via `components/chat/index.ts` |

## 1.6 Data Layer

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.6.1 | Workflow Store | File-backed CRUD for workflows, stages, items with atomic writes | Backend | L | u2014 | Atomic write via temp+rename; YAML metadata; Markdown content |
| 1.6.2 | Agent Store | File-backed agent management with slug generation and reference tracking | Backend | M | u2014 | Agents in `.nos/agents/<id>/`; slug from displayName; reference check |
| 1.6.3 | Workspace Store | Registry at `~/.nos/workspaces.yaml`; path validation; 1MB cap | Backend | S | u2014 | CRUD operations; absolute path validation; size limit |
| 1.6.4 | Settings Store | YAML-backed global settings with 64KB cap and atomic writes | Backend | S | u2014 | Heartbeat and default agent settings; ENOENT-tolerant reads |
| 1.6.5 | Workspace Context | Cookie-based workspace resolution via AsyncLocalStorage + `withWorkspace()` wrapper | Backend | M | 1.6.3 | Routes resolve project root from cookie; falls back to env/cwd |
| 1.6.6 | Shared Utilities | `lib/fs-utils.ts` (atomicWriteFile, atomicWriteFileWithDir, readYamlFile, META_FILE/CONTENT_FILE constants) and `lib/validators.ts` (WORKFLOW_ID_REGEX, WORKFLOW_PREFIX_REGEX) | Backend | S | — | Imported by workflow-store, agents-store, routine-scheduler, settings, workspace-store; eliminates duplication across 5+ files |
| 1.6.7 | File Type Classification | `lib/file-types.ts` — MIME type detection and category classification (text, image, audio, video, binary) for file browser preview | Backend | S | — | Correct MIME for common extensions; used by FileBrowser and FileViewer |

## 1.7 CLI

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.7.1 | CLI Entry Point | `bin/cli.mjs` using Commander.js; scaffold detection; Next binary resolution; `NOS_PROJECT_ROOT` / `NOS_PORT` env vars | Backend | S | u2014 | `npx nos` serves from correct project root; `getProjectRoot()` used by all lib files |
| 1.7.2 | Skill Registry | Load and search skills from `config/skills.json` | Backend | S | u2014 | Skills loadable by id; search by name/description |
| 1.7.3 | Tool Registry | Load tools from `config/tools.json` with icon resolution | Backend | S | u2014 | Tools with href, icon, endpoint, category |
| 1.7.4 | Workspace Scaffolding | `initWorkspace()` and `updateWorkspace()` functions for NOS workspace initialization and version updates; templates stored at `templates/.nos/` | Backend | S | u2014 | Detects existing `.nos/` dir; copies skeleton files; respects `--force` flag; reports progress via InitResult/UpdateResult types |
| 1.7.5 | Template Management | List and resolve template files (`listTemplateFiles`, `getTemplatesRoot`, `getNosTemplatesRoot`); templates root configurable via `NOS_TEMPLATES_ROOT` | Backend | S | u2014 | Templates enumerated relative to CLI install path; fallback to bundled defaults |

## 1.8 Infrastructure & Quality

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.8.1 | TypeScript Config | Strict mode, path aliases, bundler module resolution | DevOps | S | u2014 | `strict: true`; `@/*` path alias; ES2017 target |
| 1.8.2 | Tailwind CSS Setup | v3 config with CSS variable theming and custom color tokens | Frontend | S | u2014 | 12+ semantic colors; dark mode via `class`; border-radius utilities |
| 1.8.3 | Next.js Config | External packages, dev port, server configuration | DevOps | S | u2014 | chokidar/fsevents externalized; port 30128 |
| 1.8.4 | Middleware | API request logging for all `/api/*` routes | Backend | S | u2014 | Logs method, URL, timestamp |
| 1.8.5 | Testing | Node.js built-in test runner; test file colocation | QA | M | u2014 | `node --test lib/**/*.test.ts`; tests pass |
| 1.8.6 | Error/Loading Boundaries | `error.tsx` and `loading.tsx` at all dashboard sub-routes | Frontend | S | u2014 | 8 route segments covered; client error boundary with retry |
| 1.8.7 | Standards & Auditing | `project-standards.md`; audit workflow with stage pipeline | QA | M | u2014 | Standards documented; audits tracked; gaps inventoried |

## 1.9 NOS Agent Skills

| ID | Name | Description | Owner | Est. Effort | Dependencies | Acceptance Criteria |
|----|------|-------------|-------|-------------|--------------|--------------------|
| 1.9.1 | nos-create-item | Create workflow items programmatically via API | Backend | S | 1.3.2 | Skill callable by agents; item created with title and optional body |
| 1.9.2 | nos-edit-item | Edit item title and/or markdown body | Backend | S | 1.3.2 | Title and body independently updatable |
| 1.9.3 | nos-move-stage | Move items to a different configured stage | Backend | S | 1.3.2 | Stage validated; item moved; pipeline triggered if applicable |
| 1.9.4 | nos-comment-item | Append comments to item metadata | Backend | S | 1.3.2 | Comment appended to meta.yml comments array |

---

**Effort Key:** S = Small (u22641 day), M = Medium (2u20133 days), L = Large (4u20137 days)
