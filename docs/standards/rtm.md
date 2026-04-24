# Requirement Traceability Matrix (RTM)

> Last updated: 2026-04-24

---

## Legend

- **Req ID**: Requirement identifier from `.nos/workflows/requirements/items/`
- **Source**: Origin of the requirement
- **Design Artifact**: Related documentation artifact
- **Implementation File(s)**: Key source files implementing the requirement
- **Test Coverage**: Test files or validation method
- **Status**: Done / In Progress / Deferred

---

## Traceability Matrix

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-011 | Workflow Engine | Internal spec | system-architecture.md, database-design.md | `lib/workflow-store.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/stage-pipeline.ts`, `lib/workflow-events.ts`, `lib/activity-log.ts`, `types/workflow.ts` | `lib/hooks/use-workflow-items.test.ts` | Done |
| REQ-012 | Agent System | Internal spec | system-architecture.md | `lib/agents-store.ts`, `lib/agent-adapter.ts`, `lib/system-prompt.ts`, `types/workflow.ts` (Agent) | Manual validation | Done |
| REQ-013 | Dashboard UI | Internal spec | ui-design.md, ux-design.md | `components/dashboard/*.tsx`, `components/ui/*.tsx` | Manual validation | Done |
| REQ-00014 | NOS Agent Skills | Feature request | wbs-dictionary.md (1.3), system-architecture.md | `lib/workflow-store.ts` (create/edit/move/comment), skill definitions in `config/skills.json` | Validation in req item | Done |
| REQ-00015 | Fix Terminal Double Scroll | Bug report | ux-design.md | `components/terminal/SessionPanel.tsx` | Visual regression check | Done |
| REQ-00016 | Item Detail Dialog + MD Editor | Feature request | ui-design.md, ux-design.md | `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/ItemDescriptionEditor.tsx` | Manual validation | Done |
| REQ-00017 | Fix React Unknown-Tag Warning | Bug report | — | `lib/markdown-preview.ts`, `rehype-sanitize` config | Manual validation | Done |
| REQ-00018 | Default System Prompt | Feature request | system-architecture.md | `.nos/system-prompt.md`, `lib/system-prompt.ts` | Manual validation | Done |
| REQ-00019 | Active Session Indicator | Feature request | ux-design.md | `components/terminal/SessionPanel.tsx`, `types/session.ts` (isRunning) | Manual validation | Done |
| REQ-00020 | Realtime Item Status | Feature request | system-architecture.md, ux-design.md | `lib/workflow-events.ts`, `app/api/workflows/[id]/events/route.ts`, `components/dashboard/KanbanBoard.tsx` | Manual validation | Done |
| REQ-00021 | Auto-Advance on Complete | Feature request | system-architecture.md | `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/settings.ts`, `app/api/settings/heartbeat/route.ts` | Manual validation | Done |
| REQ-00022 | Comment Markdown Rendering | Feature request | ui-design.md | `components/dashboard/ItemDetailDialog.tsx`, `lib/markdown-preview.ts`, `remark-breaks` | Manual validation | Done |
| REQ-00023 | System Prompt Settings UI | Feature request | ux-design.md | `app/dashboard/settings/page.tsx`, `app/api/settings/system-prompt/route.ts` | Manual validation | Done |
| REQ-00024 | Content to Claude Code Adapter should include item comments | Internal spec | system-architecture.md | `lib/agent-adapter.ts`, `lib/system-prompt.ts` | Manual validation | Todo |
| REQ-00025 | Fix Issue: Duplicated item when created | Bug report | database-design.md | `lib/workflow-store.ts` | Manual validation | Todo |
| REQ-00026 | System prompt should have "failed" status | Feature request | system-architecture.md | `.nos/system-prompt.md`, `lib/system-prompt.ts` | Manual validation | Todo |
| REQ-00027 | New item modal should mirror update item modal | Feature request | ui-design.md, ux-design.md | `components/dashboard/NewItemDialog.tsx` | Manual validation | Done |
| REQ-00028 | Use mdx-editor/editor for markdown editor | Feature request | ui-design.md | `components/dashboard/ItemDescriptionEditor.tsx` | Manual validation | Todo |
| REQ-00029 | Side menu should highlight selected menu item | Feature request | ux-design.md | `components/dashboard/Sidebar.tsx` | Manual validation | Todo |
| REQ-00030 | Add audio notification when task changes to done | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00031 | Workflow stage auto-advance indicator | Feature request | system-architecture.md | `components/dashboard/StageDetailDialog.tsx`, `lib/auto-advance.ts` | Manual validation | Todo |
| REQ-00032 | Setting heartbeat should be in seconds | Feature request | ux-design.md | `app/dashboard/settings/page.tsx` | Manual validation | Todo |
| REQ-00033 | Clear input form after adding new item | Feature request | ux-design.md | `components/dashboard/NewItemDialog.tsx` | Manual validation | Done |
| REQ-00034 | Introduce Member Agent | Feature request | system-architecture.md | `lib/agents-store.ts`, `lib/agent-adapter.ts` | Manual validation | Todo |
| REQ-00035 | Set max number of items in stage to display | Feature request | ui-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Done |
| REQ-00036 | Toggle between list and kanban view | Feature request | ui-design.md | `components/dashboard/ListView.tsx`, `components/dashboard/KanbanBoard.tsx` | Manual validation | Todo |
| REQ-00037 | Remove ID when create/edit item | Feature request | database-design.md | `lib/workflow-store.ts` | Manual validation | Failed |
| REQ-00038 | Remove ID when add item | Feature request | database-design.md | `components/dashboard/NewItemDialog.tsx` | Manual validation | Todo |
| REQ-00039 | Implement search item function | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00040 | Use npx nos in other project folders | Feature request | system-architecture.md | `bin/nos.ts`, `lib/project-root.ts` | Manual validation | Todo |
| REQ-00041 | Fix stage header layout (ai icon, auto icon, member agent) | Bug report | ui-design.md | `components/dashboard/StageDetailDialog.tsx` | Manual validation | Todo |
| REQ-00042 | Update member edit | Feature request | ux-design.md | `components/dashboard/AddStageDialog.tsx` | Manual validation | Todo |
| REQ-00043 | Fix the stage header layout | Bug report | ui-design.md | `components/dashboard/StageDetailDialog.tsx` | Manual validation | Todo |
| REQ-00044 | Implement mechanism to find items | Feature request | ux-design.md | `lib/workflow-store.ts` | Manual validation | Todo |
| REQ-00045 | Log activity somewhere | Feature request | system-architecture.md | `lib/activity-log.ts` | Manual validation | Todo |
| REQ-00046 | Use alternative indicator for item status | Feature request | ui-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00047 | Activity view should be clickable to view item | Feature request | ux-design.md | `app/dashboard/activity/page.tsx` | Manual validation | Todo |
| REQ-00048 | Rename system "NOS" to "New Old-school" in UI | Feature request | ui-design.md | `components/ui/logo.tsx`, `app/layout.tsx` | Manual validation | Todo |
| REQ-00049 | Make the system mobile friendly | Feature request | ui-design.md | Responsive design (all components) | Manual validation | Todo |
| REQ-00050 | MDXEditor not showing bullet points | Bug report | ui-design.md | `components/dashboard/ItemDescriptionEditor.tsx` | Manual validation | Todo |
| REQ-00051 | Fix status indicator in modal (layout broken) | Bug report | ui-design.md | `components/dashboard/ItemDetailDialog.tsx` | Manual validation | Todo |
| REQ-00052 | Activity view list should show "View all" link | Feature request | ux-design.md | `app/dashboard/activity/page.tsx` | Manual validation | Todo |
| REQ-00053 | Add mechanism to add/remove stages in frontend | Feature request | ux-design.md | `components/dashboard/AddStageDialog.tsx`, `app/api/workflows/[id]/stages/route.ts` | Manual validation | Todo |
| REQ-00054 | Add mechanism to add/remove workflow in frontend | Feature request | ux-design.md | `components/dashboard/Sidebar.tsx`, `app/api/workflows/route.ts` | Manual validation | Todo |
| REQ-00055 | Config default adapter and model in settings | Feature request | ux-design.md | `app/dashboard/settings/page.tsx`, `app/api/settings/default-agent/route.ts` | Manual validation | Todo |
| REQ-00056 | Settings page should have multiple tabs | Feature request | ux-design.md | `app/dashboard/settings/page.tsx` | Manual validation | Todo |
| REQ-00057 | Custom model ID input field missing | Bug report | ux-design.md | `app/dashboard/settings/page.tsx` | Manual validation | Todo |
| REQ-00058 | New item modal should be cleaned in heartbeat | Feature request | system-architecture.md | `lib/auto-advance-sweeper.ts` | Manual validation | Todo |
| REQ-00059 | Implement search item function | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00060 | In edit item/add item, improve form handling | Feature request | ux-design.md | `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/NewItemDialog.tsx` | Manual validation | Todo |
| REQ-00061 | Notification system | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00062 | Change behaviour of npx nos command | Feature request | system-architecture.md | `bin/nos.ts` | Manual validation | Todo |
| REQ-00063 | Implement search item function | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00064 | Implement a live chat widget | Feature request | ui-design.md | `components/dashboard/ChatWidget.tsx` | Manual validation | Todo |
| REQ-00065 | Setup the page title | Feature request | ui-design.md | `app/dashboard/layout.tsx` | Manual validation | Todo |
| REQ-00066 | Create workflow management UI (add/edit/delete) | Feature request | ux-design.md | `components/dashboard/Sidebar.tsx` | Manual validation | Todo |
| REQ-00067 | Implement search item function | Feature request | ux-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00068 | Add NOS Agent chatbox in workflow screen | Feature request | ui-design.md | `components/dashboard/ChatWidget.tsx` | Manual validation | Todo |
| REQ-00069 | Implement edit/delete comment in item | Feature request | ux-design.md | `app/api/workflows/[id]/items/[itemId]/comments/[index]/route.ts` | Manual validation | Todo |
| REQ-00070 | Fix error in markdown view | Bug report | ui-design.md | `lib/markdown-preview.ts` | Manual validation | Todo |
| REQ-00071 | Make chatbox in ChatWidget taller | Bug report | ui-design.md | `components/dashboard/ChatWidget.tsx` | Manual validation | Todo |
| REQ-00072 | Fix markdown view in update item screen | Bug report | ui-design.md | `lib/markdown-preview.ts`, `components/dashboard/ItemDetailDialog.tsx` | Manual validation | Todo |
| REQ-00073 | Fix status change to done in other workspaces | Bug report | database-design.md | `lib/auto-advance.ts` | Manual validation | Todo |
| REQ-00074 | Fix event conflict between workspaces | Bug report | system-architecture.md | `lib/workflow-events.ts` | Manual validation | Todo |
| REQ-00075 | Order items by last updated (newest first) | Feature request | ui-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00076 | Make the system dark mode compatible | Feature request | ui-design.md | All components (tailwind dark mode) | Manual validation | Todo |
| REQ-00077 | Create .nos/claude.md to instruct agent | Feature request | system-architecture.md | `.nos/claude.md` | Manual validation | Todo |
| REQ-00078 | Fix status not changing to done after session ends | Bug report | system-architecture.md | `lib/auto-advance.ts` | Manual validation | Todo |
| REQ-00079 | Create routine mode (auto-create item on cron) | Feature request | system-architecture.md | `lib/routine-scheduler.ts`, `lib/workflow-store.ts` | Manual validation | Todo |
| REQ-00080 | Order items by last updated (newest first) | Feature request | ui-design.md | `components/dashboard/WorkflowItemsView.tsx` | Manual validation | Todo |
| REQ-00081 | Update README of this project | Feature request | ui-design.md | `README.md` | Manual validation | Todo |
| REQ-00082 | Make the system dark mode compatible | Feature request | ui-design.md | All components (tailwind dark mode) | Manual validation | Todo |
| REQ-00083 | Sidemenu footer layout fix (remove copyright) | Bug report | ui-design.md, ux-design.md | `components/dashboard/Sidebar.tsx` (lines 162u2013178) | Manual validation u2014 all 6 ACs pass | Done |
| REQ-00084 | Create logo for app and navicon (with "nos" text) | Feature request | ui-design.md | `components/ui/Logo.tsx`, `public/favicon.svg`, `app/icon.svg`, `app/apple-icon.tsx`, `app/layout.tsx`, `components/dashboard/Sidebar.tsx`, `app/page.tsx` | Manual validation u2014 7/9 ACs pass (AC-5 FAIL: raster favicons missing; AC-6 PARTIAL) | Done |
| REQ-00085 | Update README of this project | Feature request | u2014 | `README.md` | Manual validation u2014 all 11 ACs pass | Done |
| REQ-00086 | Show tool use in Claude Terminal (collapsible) | Feature request | ux-design.md, ui-design.md | `types/tool.ts`, `types/session.ts`, `app/dashboard/terminal/page.tsx`, `components/terminal/ToolUseCard.tsx` | Manual validation u2014 7/8 ACs pass (AC-7 FAIL: replay parser) | Done |
| REQ-00087 | Convert toolbar buttons to icon-only | Feature request | ui-design.md | `components/dashboard/WorkflowItemsView.tsx` (lines 111u2013186) | Manual validation u2014 all 9 ACs pass | Done |
| REQ-00088 | Implement scaffolding function (nos init / nos update) | Internal requirement | system-architecture.md, wbs-dictionary.md (1.7), glossary.md | `bin/cli.mjs`, `lib/scaffolding.mjs`, `lib/scaffolding.ts` | `lib/scaffolding.test.ts` (15/15 pass) | Done |
| REQ-00089 | ChatWidget show tool call and other messages | Feature request | ui-design.md, ux-design.md | `components/dashboard/ChatWidget.tsx`, `components/terminal/ToolUseCard.tsx`, `components/terminal/QuestionCard.tsx` | Stalled u2014 runtime API errors prevented validation | In Progress |
| REQ-00090 | Fix EADDRINUSE :30128 on npx nos init | Bug report | system-architecture.md | `bin/cli.js` (remove legacy), `bin/cli.mjs` | Stalled u2014 runtime connection errors prevented validation | In Progress |
| REQ-00091 | When choose workflow, go back to dashboard | Feature request | ux-design.md, ui-design.md | `app/dashboard/workflows/[id]/page.tsx`, `app/dashboard/workflows/page.tsx` | Manual validation u2014 7/8 ACs pass (AC-3 partial: current page is plain text, not Link) | Done |
| REQ-00092 | File System Browser UI | Feature request | ui-design.md, api-reference.md, security-design.md | `app/dashboard/workspaces/page.tsx` (FileExplorer), `app/api/workspaces/browse/route.ts`, `app/api/workspaces/preview/route.ts` | Manual validation u2014 all 11 ACs pass | Done |
| REQ-00093 | Refactor chat components (extract shared) | Internal refactoring | ui-design.md, ux-design.md, project-standards.md | `components/chat/ChatBubble.tsx`, `components/chat/MessageList.tsx`, `components/chat/TypingIndicator.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ToolUseCard.tsx`, `components/chat/QuestionCard.tsx`, `components/chat/index.ts`, `types/chat.ts`, `app/dashboard/terminal/page.tsx`, `components/dashboard/ChatWidget.tsx` | tsc clean; AC-6 partial (ChatWidget input inline) | In Progress |
| REQ-00094 | Add mechanism to restart a workflow item | Feature request | api-reference.md, error-handling-strategy.md, ux-design.md | `app/api/workflows/[id]/items/[itemId]/restart/route.ts`, `lib/workflow-store.ts` (`restartItem`), `lib/activity-log.ts` (`restart` type), `components/dashboard/ItemDetailDialog.tsx`, `lib/hooks/use-workflow-items.ts` | Manual validation u2014 all 8 ACs pass | Done |
| REQ-00095 | Add sidemenu entry for file browser | Feature request | ui-design.md, ux-design.md | `config/tools.json` | Manual validation u2014 all 7 ACs pass | Done |
| REQ-00096 | Create dedicated file system browser | Feature request | ui-design.md, api-reference.md, security-design.md | `app/dashboard/files/page.tsx`, `app/dashboard/files/loading.tsx`, `app/dashboard/files/error.tsx`, `components/dashboard/FileBrowser.tsx`, `components/dashboard/FileViewer.tsx`, `app/api/workspaces/serve/route.ts`, `app/api/workspaces/active/route.ts`, `lib/file-types.ts`, `config/tools.json` | Manual validation u2014 all 12 ACs pass; 3 defects fixed during validation | Done |
| REQ-00097 | Remove workspace sidebar entry | Feature request | ux-design.md, wbs.md (1.7.3) | `config/tools.json` | Manual validation u2014 all 6 ACs pass | Done |
| REQ-00098 | Routine-enabled workflow visual indicator | Feature request | ui-design.md, ux-design.md | `types/workflow.ts`, `app/api/workflows/route.ts`, `components/dashboard/Sidebar.tsx` | Manual validation u2014 all 7 ACs pass | Done |
| REQ-00099 | Reorder sidemenu | Feature request | ux-design.md, wbs.md (1.4.1) | `components/dashboard/Sidebar.tsx` | Visual regression check u2014 all 8 ACs pass | Done |
| REQ-00100 | Update sidemenu (workflow order) | Feature request | ux-design.md, wbs.md (1.4.1) | `components/dashboard/Sidebar.tsx` | Visual regression check u2014 all 6 ACs pass | Done |
| refactor heart beat | Update heartbeat sweeper | Internal refactoring | system-architecture.md | `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/workflow-store.ts` | Manual validation u2014 all 21 ACs pass | Done |
| REQ-00101 | Fix YAML date-quoting guidance & defensive coercion | Bug report | system-architecture.md, database-design.md | `.nos/system-prompt.md`, `.nos/workflows/CLAUDE.md`, `.nos/CLAUDE.md`, `lib/workflow-store.ts` | Manual validation u2014 all 6 ACs pass | Done |
| REQ-00102 | Structured comment metadata (author, timestamps) | Operator request | `docs/standards/api-reference.md`, `docs/standards/system-architecture.md` | `types/workflow.ts` (Comment interface), `lib/workflow-store.ts` (CRUD + migration), `lib/system-prompt.ts` (rendering), `lib/system-prompt.test.ts` (tests), `lib/auto-advance.ts` (runtime author), `app/api/workflows/[id]/items/[itemId]/comments/route.ts` (POST), `app/api/workflows/[id]/items/[itemId]/comments/[index]/route.ts` (PATCH/DELETE), `app/api/workflows/[id]/items/[itemId]/route.ts` (PATCH validation), `components/dashboard/ItemDetailDialog.tsx` (UI), `.claude/skills/nos-comment-item/nos-comment-item.mjs` (skill) | `lib/system-prompt.test.ts` (9 passing), `tsc --noEmit` (clean) | Done |
| REQ-00103 | File system — allow download file | Feature request | `docs/standards/api-reference.md`, `docs/standards/security-design.md`, `docs/standards/ui-design.md` | `app/api/workspaces/serve/route.ts`, `components/dashboard/FileViewer.tsx` | Manual validation — all 6 ACs pass | Done |
| REQ-00105 | Dashboard: Adding visualization | Feature request | `docs/standards/api-reference.md`, `docs/standards/ui-design.md`, `docs/standards/rtm.md` | `app/api/analytics/sessions/route.ts`, `components/dashboard/SessionsChart.tsx`, `app/dashboard/page.tsx`, `package.json` (recharts) | `app/api/analytics/sessions/route.test.ts` (integration); manual validation — all 9 ACs pass | Done |
| REQ-00107 | Create workflow-templates system | Feature request | `docs/standards/system-architecture.md`, `docs/standards/ui-design.md` | `app/api/templates/route.ts`, `app/api/templates/[id]/route.ts`, `app/api/templates/[id]/install/route.ts`, `app/api/workspaces/update/route.ts`, `app/dashboard/templates/page.tsx`, `components/dashboard/Sidebar.tsx`, `app/dashboard/settings/page.tsx` | Manual validation — all 12 ACs pass (see REQ-00107 Validation section) | Done |
| REQ-00108 | Workspace switch redirects to dashboard instead of showing 404 | Bug report | `docs/standards/ux-design.md`, `docs/standards/system-architecture.md` | `components/dashboard/WorkspaceSwitcher.tsx` | Manual validation — all 6 ACs pass (see REQ-00108 Validation section) | Done |
| REQ-00109 | File system — Create Folder function | Feature request | `docs/standards/api-reference.md`, `docs/standards/system-architecture.md`, `docs/standards/rtm.md`, `docs/standards/glossary.md` (FileBrowser), `docs/standards/ui-design.md` | `app/api/workspaces/mkdir/route.ts` (new), `components/dashboard/FileBrowser.tsx` (modified) | Manual validation — all 8 ACs pass (see REQ-00109 Validation section) | Done |
| REQ-00110 | Allow setting slash command/skill in the stages | Feature request | `docs/standards/wbs.md` (1.1.2, 1.3.3, 1.4.5), `docs/standards/glossary.md` (Stage) | `types/workflow.ts` (`Stage`), `lib/workflow-store.ts` (`StagePatch`, `readStages`, `updateStage`, `addStage`), `app/api/workflows/[id]/stages/[stageName]/route.ts`, `lib/system-prompt.ts` (`buildAgentPrompt`), `lib/stage-pipeline.ts` (`triggerStagePipeline`), `components/dashboard/StageDetailDialog.tsx` | Manual validation — all 7 ACs pass (see REQ-00110 Validation section) | Done |
| REQ-00106 | File system: Able to upload file | Feature request | `docs/standards/ui-design.md`, `docs/standards/security-design.md`, `docs/standards/api-reference.md` | `app/api/workspaces/upload/route.ts`, `components/dashboard/FileBrowser.tsx` | Manual validation — all 9 ACs pass (see REQ-00106 Validation section) | Done |
| REQ-00104 | NOS server stability & diagnostics | Operator report | `docs/standards/system-architecture.md`, `docs/standards/error-handling-strategy.md` | `lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`, `lib/stage-pipeline.ts`, `bin/cli.mjs`, `app/api/health/route.ts` | Manual validation — all 6 ACs pass | Done |
| REQ-00111 | File system: delete file/folder | Feature request | `docs/standards/api-reference.md`, `docs/standards/system-architecture.md`, `docs/standards/security-design.md`, `docs/standards/glossary.md` (FileBrowser) | `app/api/workspaces/delete/route.ts`, `components/dashboard/FileBrowser.tsx` | Manual validation — all 12 ACs pass (see REQ-00111 Validation section) | Done |

---

## Audit Findings Traceability

| Finding | Standard Section | Implementation File(s) | Fix Status |
|---------|-----------------|----------------------|------------|
| F-01 | TS §4 (import type) | 13 files across `app/`, `lib/`, `components/` | Fixed |
| F-02 | TS §4 (explicit return types) | ~50+ exported functions | Deferred (GAP-03) |
| F-03 | TS §4 (non-null assertion) | `lib/hooks/use-workflow-items.ts:272` | Fixed |
| F-04 | API §7 (req.json validation) | 6 API route handlers | Fixed |
| F-05 | API §7 (shell input validation) | `app/api/shell/route.ts` | Fixed |
| F-06 | API §7 (limit bounds) | 3 activity route handlers | Fixed |
| F-07 | API §7 (HTTP status codes) | Comments POST, workspace DELETE, items POST | Fixed |
| F-08 | API §7 (business logic extraction) | 4 route handlers | Deferred |
| F-09 | API §7 (error response consistency) | `app/api/utils/errors.ts`, 5 routes | Fixed |
| F-10 | Data §10 (sync fs) | 5 route handlers | Deferred |
| F-11 | React §3 (forwardRef) | 5 UI component files | Fixed |
| F-12 | Tailwind §5 (cn() usage) | `WorkflowItemsView.tsx`, `SlashPopup.tsx` | Fixed |
| F-13 | File Org §8 (hook placement) | `lib/hooks/use-workflow-items.ts` | Fixed |
| F-14 | Next.js §2 (loading.tsx) | 8 dashboard sub-routes | Fixed |
| F-15 | Next.js §2 (error.tsx) | 8 dashboard sub-routes | Fixed |

---

## Gap Traceability

| Gap ID | Description | Standard Section | Remediation Status |
|--------|-------------|-----------------|-------------------|
| GAP-01 | TypeScript strict: false | TS §4 | Resolved |
| GAP-02 | Tailwind CSS v3 (v4 available) | Tailwind §5 | Open (deferred) |
| GAP-03 | No linter config | Infra §8 | Resolved (Biome installed & configured) |
| GAP-04 | Incomplete Suspense boundaries | Next.js §2 | Resolved |
| GAP-05 | Synchronous fs in routes | Data §10 | Open (deferred, low priority) |
| GAP-06 | Incomplete error boundaries | Next.js §2 | Resolved |
| GAP-07 | Mixed config formats | Data §10 | Open (deferred, low priority) |
| GAP-08 | Limited test coverage | Testing §6 | Open |
| GAP-09 | forwardRef deprecation | React §3 | Resolved |
| GAP-10 | Canary dependency pinning | Next.js §2 | Resolved (pinned to stable ^16.0.0) |
| GAP-11 | @types/react v18 mismatch | TS §4 | Resolved (updated to 19.2.14) |
| GAP-12 | Logo.tsx naming | File Org §8 | Resolved |
| GAP-13 | Broken lint script | Next.js §2 | Resolved (Biome configured) |
| GAP-14 | React Compiler not enabled | Next.js §2 | Resolved (enabled in next.config.mjs) |
| GAP-15 | next-themes phantom dep | Infra §8 | Resolved (added to package.json) |
| GAP-16 | Remaining reuse opportunities | Code Quality | Partial (extractions adopted, remaining deferred) |
| GAP-17 | Null-safety in `createItem` | TS §4 | Resolved |
| GAP-18 | ListView EmptyState | UI §1 | Resolved |
| GAP-19 | mapStageError utility adoption | API §7 | Resolved |
