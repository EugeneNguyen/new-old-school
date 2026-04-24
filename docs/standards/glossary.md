# Glossary / Domain Model

> Last updated: 2026-04-24

---

## Ubiquitous Language

The following terms have precise meanings within NOS. All code, documentation, and conversations should use these terms consistently.

---

## Core Domain Terms

### Workflow
A **workflow** is a named container that organizes work items into a sequence of stages. It represents a project, process, or track of work (e.g., "Requirements", "Bug Tracking", "Sprint"). Each workflow has:
- A unique lowercase `id` (e.g., `requirements`)
- A human-readable `name` (e.g., "Requirements")
- An uppercase `idPrefix` for auto-generated item IDs (e.g., `REQ`)
- An ordered list of **stages**

### Stage
A **stage** is a named step within a workflow pipeline. Items flow through stages sequentially (or non-sequentially via drag-drop). Each stage can have:
- A `prompt` with instructions for agents
- An optional assigned **agent** (`agentId`)
- An optional **skill** (slash command) to invoke when the stage runs
- An `autoAdvanceOnComplete` flag
- A `maxDisplayItems` cap for Kanban column display
- When `skill` is set, `[Skill: /<skill-name>]` is prepended to the assembled prompt

### WorkflowItem (Item)
A **workflow item** (or simply "item") is a unit of work within a workflow. It represents a task, requirement, or ticket. Each item has:
- An auto-generated `id` (e.g., `REQ-00042`)
- A `title` and optional `body` (Markdown)
- A `stage` (current position in the pipeline)
- A `status` (Todo / In Progress / Done / Failed)
- `comments` (array of Comment objects with text, createdAt, updatedAt, and author fields)
- `sessions` (history of agent executions on this item)

### ItemStatus
The **status** of an item indicates its lifecycle state:
- **Todo**: Item is waiting to be worked on
- **In Progress**: An agent session is active on this item
- **Done**: Work is complete; auto-advance may move it to the next stage
- **Failed**: Agent reported a failure; requires manual intervention

### Comment
A **comment** is a structured annotation on an item. Each comment has:
- `text` (string) — Markdown content
- `createdAt` (ISO 8601 string) — When the comment was created
- `updatedAt` (ISO 8601 string) — When the comment was last edited
- `author` (string) — Who created the comment: `"agent"`, `"runtime"`, or `"user"`
- Legacy plain-string comments are lazily migrated to this structure on read

### Agent
An **agent** is a persona that executes work on items. Agents are assigned to stages and receive prompts when items enter their stage. An agent has:
- A `displayName` (e.g., "Code Reviewer")
- An `adapter` (e.g., `claude` for Claude CLI)
- A `model` (e.g., `opus`, `sonnet`, `haiku`)
- A `prompt` template (Markdown)

### Adapter
An **adapter** is a runtime implementation that executes agent sessions. The only current adapter is `claudeAdapter`, which spawns the Claude CLI as a child process. The `AgentAdapter` interface defines `startSession()` and `listModels()`.

### Session
A **session** is an execution of an agent against a specific item at a specific stage. Sessions are tracked in `item.sessions[]` and produce output captured to `.claude/sessions/<id>.txt`.

### System Prompt
The **system prompt** is the root prompt loaded from `.nos/system-prompt.md`. It defines standing instructions for all NOS agents, including the NOS Agent System Prompt that all agents execute.

---

## Activity & Events

### ActivityLog
An **activity log** is an append-only JSONL file (`.nos/workflows/<id>/activity.jsonl`) that records all mutations to workflow items. Each entry captures the type of change, before/after values, and timestamps.

### ActivityEntry
A single line in an activity log. Types: `title-changed`, `stage-changed`, `status-changed`, `body-changed`, `routine-item-created`, `restart`.

### WorkflowEvent
An in-memory **event** emitted by the `workflow-events.ts` EventEmitter. Event types: `item-created`, `item-updated`, `item-deleted`, `item-activity`. Events are streamed to dashboard clients via SSE.

### SSE (Server-Sent Events)
A unidirectional streaming protocol used to push workflow events from the server to the dashboard in real-time.

---

## Auto-Advance System

### Heartbeat Sweeper
A periodic timer (default: every 60 seconds) that sweeps all workspaces, workflows, and items to:
1. Detect completed agent sessions
2. Mark items as Done and attach summaries
3. Auto-advance Done items to the next stage
4. Auto-start eligible Todo items

### autoAdvanceIfEligible
The logic that moves a Done item to the next stage if its current stage has `autoAdvanceOnComplete: true`.

### autoStartIfEligible
The logic that triggers a new agent session when an item enters a stage that has an assigned agent and prompt.

### triggerStagePipeline
The function that assembles the full agent prompt (system + member + stage + item) and spawns a new session via the adapter.

---

## UI Terms

### Kanban Board
The primary dashboard view showing workflow items grouped by stage in horizontal columns. Supports drag-drop to change stages.

### List View
An alternative dashboard view showing all workflow items in a table with sorting and filtering.

### ItemDetailDialog
A modal dialog for editing an item's title, body (Markdown), comments, sessions, and status.

### StageDetailDialog
A modal dialog for configuring a stage's name, prompt, agent assignment, auto-advance, and display limits.

### MDXEditor
The `@mdxeditor/editor` component used for editing item body content with a rich toolbar and live preview.

### SlashPopup
A command palette for slash commands (e.g., `/new`, `/help`, `/status`) in the Claude Terminal.

### QuestionCard
A UI card that renders an interactive question from an agent, allowing the operator to select from multiple-choice options.

### ToolUseCard
A UI card that displays a tool invocation made by an agent, showing the tool name, input, and result.

### FileBrowser
The left panel of the file system browser (`/dashboard/files`) that shows a directory tree with folder-first alphabetical sorting, file type icons, and human-readable size formatting.

### FileViewer
The right panel of the file system browser that previews file content: text (syntax-highlighted), images, audio, and video. Shows a metadata card for unsupported types and enforces a 100MB binary guard.

### ChatBubble
A shared chat message component in `components/chat/` used by both the Claude Terminal and the ChatWidget. Renders user and assistant messages with consistent styling.

### Restart (Item)
The action of resetting a workflow item to its initial state: moving it back to the first stage, clearing sessions, setting status to Todo, and truncating index.md at `## Analysis`. Preserves title, body preamble, and comments. Logged as a `restart` activity event.

---

## Data Layer Terms

### meta.yml
The YAML file within each item/agent directory that stores structured metadata. Parsed with `js-yaml`.

### index.md
The Markdown file within each item/agent directory that stores free-form content.

### config.json
The JSON file within each workflow directory that stores workflow-level metadata.

### stages.yaml
The YAML file within each workflow's `config/` directory that stores the ordered stage definitions.

### activity.jsonl
The append-only JSON Lines file that logs all workflow mutations.

### Atomic Write
The write strategy of writing to a `.tmp` file then renaming it, preventing partial-write corruption.

---

## Workspace Terms

### Workspace
A workspace maps to a project root directory. The workspace registry at `~/.nos/workspaces.yaml` tracks all known workspaces by their absolute paths. The active workspace is set via the `nos_workspace` cookie.

### withWorkspace()
A wrapper function that extracts the workspace ID from the `nos_workspace` cookie, resolves the project root, and makes it available via AsyncLocalStorage.

### AsyncLocalStorage
Node.js mechanism for threading context (workspace project root) through async operations without prop drilling.

---

## Shared Utilities

### fs-utils
The shared file system utility module (`lib/fs-utils.ts`) providing `atomicWriteFile`, `atomicWriteFileWithDir`, `readYamlFile`, and the `META_FILE`/`CONTENT_FILE` constants. Imported by 5+ store modules, eliminating local duplicates.

### validators
The shared validation module (`lib/validators.ts`) exporting `WORKFLOW_ID_REGEX` and `WORKFLOW_PREFIX_REGEX`. Used by both the API route handler and the dashboard workflows page.

### file-types
The file type classification module (`lib/file-types.ts`) that maps file extensions to MIME types and content categories (text, image, audio, video, binary). Used by the file browser components.

---

## Standards & Audit Terms

### NOS
**NOS** (Notion-Oriented System) is the name of this project.

### AUDIT-00X
Sequential audit items created in `.nos/workflows/audit/`. Each audit item contains findings against the project standards and a fix log.

### GAP-XX
A gap in the documented project standards. Gaps are tracked in `docs/standards/project-standards.md` with remediation priorities.

### Finding (F-XX)
A specific violation of a documented standard found during an audit. Each finding has a severity (High/Medium/Low) and a fix status.

### ADR
An **Architecture Decision Record** documenting a significant architectural decision, its context, consequences, and alternatives considered.

---

## Relationships Summary

```
Workspace
  contains many Workflow
Workflow
  has ordered Stages
  contains many WorkflowItem
  emits ActivityLog
Stage
  assigned to zero-or-one Agent
  has autoAdvanceOnComplete
WorkflowItem
  belongs to one Stage
  has ItemStatus
  has many ItemSession
  has many Comment
ItemSession
  executed by Agent (via adapter)
  produces SessionOutput
Agent
  defined by prompt template
  executed via Adapter
Settings
  configures heartbeat interval
  sets default Agent
```
