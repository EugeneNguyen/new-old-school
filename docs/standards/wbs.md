# Work Breakdown Structure (WBS)

> Last updated: 2026-04-21

---

## 1. NOS Platform

### 1.1 Core Workflow Engine
- 1.1.1 Workflow CRUD (create, read, update, delete workflows)
- 1.1.2 Stage Pipeline (ordered stage definitions, prompts, agent assignment)
- 1.1.3 Item Lifecycle (create items, status transitions, stage movement)
- 1.1.4 Auto-Advance System (heartbeat sweeper, session completion detection, auto-start)
- 1.1.5 Activity Logging (JSONL append-only log, per-workflow and per-item activity)
- 1.1.6 Event System (EventEmitter pub/sub, SSE streaming to clients)

### 1.2 Agent & Execution Layer
- 1.2.1 Agent Management (agent CRUD, prompt templates, adapter/model config)
- 1.2.2 Adapter Interface (pluggable `AgentAdapter`, Claude CLI implementation)
- 1.2.3 Stage Pipeline Trigger (prompt assembly, session spawning, deduplication)
- 1.2.4 System Prompt Management (load/save `.nos/system-prompt.md`, multi-tag prompt building)
- 1.2.5 Session Tracking (session ID extraction, output capture, stream registry)
- 1.2.6 Routine Scheduler (recurring task triggers for workflows)

### 1.3 REST API Surface (8 route groups, 37+ handlers)
- 1.3.1 Workflow Routes (`/api/workflows` — CRUD, list)
- 1.3.2 Item Routes (`/api/workflows/[id]/items` — CRUD, content, comments)
- 1.3.3 Stage Routes (`/api/workflows/[id]/stages` — CRUD, reorder)
- 1.3.4 Agent Routes (`/api/agents` — CRUD, reference checking)
- 1.3.5 Activity Routes (`/api/activity`, per-workflow, per-item, SSE events)
- 1.3.6 Session & Chat Routes (`/api/chat`, `/api/claude/sessions` — spawn, stream, status)
- 1.3.7 Settings Routes (`/api/settings/*` — system prompt, heartbeat, default agent)
- 1.3.8 System Routes (`/api/shell`, `/api/system`, `/api/adapters`, `/api/workspaces`)

### 1.4 Web Dashboard (UI)
- 1.4.1 Dashboard Shell (layout, sidebar, navigation, workspace switcher)
- 1.4.2 Kanban Board (drag-drop columns, stage grouping, maxDisplayItems cap)
- 1.4.3 List View (tabular item listing, sort/filter)
- 1.4.4 Item Detail Dialog (title, markdown body editor, comments, sessions, status)
- 1.4.5 Stage Configuration (stage detail dialog, prompt editor, agent assignment)
- 1.4.6 Workflow Settings (name/prefix editing, stage management, routine config)
- 1.4.7 Agent Management UI (members page, create/edit/delete agents)
- 1.4.8 Claude Terminal (session panel, streaming output, slash commands, question cards)
- 1.4.9 Settings Pages (system prompt editor, heartbeat config, default agent)
- 1.4.10 Activity Feed (global and per-workflow activity views)
- 1.4.11 Workspace Management (browse, create, activate workspaces)

### 1.5 UI Component Library
- 1.5.1 Primitive Components (Button, Input, Dialog, Select, Badge, ScrollArea, Toast)
- 1.5.2 Theme System (CSS variable tokens, light/dark mode, `next-themes` integration)
- 1.5.3 Markdown Rendering (preview with sanitization, MDXEditor integration)
- 1.5.4 Icon System (lucide-react icon library)

### 1.6 Data Layer
- 1.6.1 Workflow Store (file-backed YAML/Markdown CRUD, atomic writes)
- 1.6.2 Agent Store (file-backed agent management, slug generation)
- 1.6.3 Workspace Store (registry in `~/.nos/workspaces.yaml`)
- 1.6.4 Settings Store (YAML-backed global settings)
- 1.6.5 Workspace Context (cookie-based resolution, AsyncLocalStorage scoping)

### 1.7 CLI
- 1.7.1 CLI Entry Point (`bin/cli.mjs` via Commander.js)
- 1.7.2 Skill Registry (load/search skills from `config/skills.json`)
- 1.7.3 Tool Registry (load tools from `config/tools.json`)

### 1.8 Infrastructure & Quality
- 1.8.1 TypeScript Configuration (strict mode, path aliases, bundler resolution)
- 1.8.2 Tailwind CSS Setup (v3 config, CSS variable theming)
- 1.8.3 Next.js Configuration (external packages, dev port)
- 1.8.4 Middleware (API request logging)
- 1.8.5 Testing (Node.js built-in test runner, hook tests)
- 1.8.6 Error & Loading Boundaries (error.tsx/loading.tsx per route segment)
- 1.8.7 Standards & Auditing (project-standards.md, audit workflows)

### 1.9 NOS Agent Skills
- 1.9.1 nos-create-item (create workflow items via API)
- 1.9.2 nos-edit-item (edit item title/body)
- 1.9.3 nos-move-stage (move items between stages)
- 1.9.4 nos-comment-item (append comments to items)
