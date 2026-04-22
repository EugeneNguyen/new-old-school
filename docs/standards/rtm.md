# Requirement Traceability Matrix (RTM)

> Last updated: 2026-04-22

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
| REQ-00083 | Create .nos/claude.md to instruct agent | Feature request | system-architecture.md | `.nos/claude.md` | Manual validation | Todo |
| REQ-00084 | Create logo for app and navicon (with "nos" text) | Feature request | ui-design.md | `components/ui/logo.tsx` | Manual validation | Todo |
| REQ-00085 | Show tool use in Claude Terminal (collapsible) | Feature request | ux-design.md | `components/terminal/SessionPanel.tsx` | Manual validation | Todo |
| REQ-00086 | Fix status not changing to done after session ends | Bug report | system-architecture.md | `lib/auto-advance.ts` | Manual validation | Todo |
| REQ-00087 | Create routine mode (auto-create item on cron) | Feature request | system-architecture.md | `lib/routine-scheduler.ts`, `lib/workflow-store.ts` | Manual validation | Todo |
| REQ-00088 | Implement scaffolding function to init NOS in a new workspace, and also can update the updated version of NOS | Internal requirement | system-architecture.md (CLI), wbs-dictionary.md (1.7), glossary.md | `bin/cli.mjs`, `lib/scaffolding.mjs`, `lib/scaffolding.ts` (TS reference, not used at runtime) | `lib/scaffolding.test.ts` | Done |
| REQ-00089 | Audit with the project-standards.md | Internal requirement | project-standards.md | `.nos/workflows/audit/items/AUDIT-004/*` | Routine audit | Done |
| REQ-00091 | When choose workflow, go back to dashboard | Feature request | `docs/standards/ux-design.md` (u00a7Navigation), `docs/standards/ui-design.md` (u00a7Layout Conventions, u00a7Typography Scale, u00a7Spacer) | `app/dashboard/workflows/[id]/page.tsx`, `app/dashboard/workflows/page.tsx` | Visual regression check u2014 breadcrumb visible on both pages; links navigate to correct routes | Done |
| REQ-00092 | File System Browser UI | Feature request | `docs/standards/ui-design.md`, `docs/standards/api-reference.md`, `docs/standards/security-design.md` | `app/dashboard/workspaces/page.tsx` (FileExplorer, FilePreview), `app/api/workspaces/browse/route.ts`, `app/api/workspaces/preview/route.ts`, `docs/requirements/REQ-00092.md`, `docs/requirements/REQ-00092.json` | Manual validation u2014 all 11 acceptance criteria verified | Done |
| REQ-00093 | Refactor Claude Terminal chat, reuse component bubbles and others from the chat widget | Internal refactoring | `docs/standards/ui-design.md`, `docs/standards/ux-design.md`, `docs/standards/project-standards.md` | `components/chat/ChatBubble.tsx`, `components/chat/MessageList.tsx`, `components/chat/TypingIndicator.tsx`, `components/chat/ChatInput.tsx`, `components/chat/ToolUseCard.tsx`, `components/chat/QuestionCard.tsx`, `components/chat/index.ts`, `types/chat.ts`, `app/dashboard/terminal/page.tsx` (modified), `components/dashboard/ChatWidget.tsx` (modified) | Visual regression check (AC-8, AC-9 passed); tsc --noEmit clean for refactored files. AC-6 partial: ChatWidget input form still inline. | In Progress |

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
| GAP-02 | Tailwind CSS v3 (v4 available) | Tailwind §5 | Open |
| GAP-03 | No linter config | Infra §8 | Open (High) |
| GAP-04 | Incomplete Suspense boundaries | Next.js §2 | Resolved |
| GAP-05 | Synchronous fs in routes | Data §10 | Open |
| GAP-06 | Incomplete error boundaries | Next.js §2 | Resolved |
| GAP-07 | Mixed config formats | Data §10 | Open |
| GAP-08 | Limited test coverage | Testing §6 | Open |
| GAP-09 | forwardRef deprecation | React §3 | Resolved |
| GAP-10 | Canary dependency pinning | Next.js §2 | Partial |
| GAP-11 | @types/react v18 mismatch | TS §4 | Open |
| GAP-12 | Logo.tsx naming | File Org §8 | Resolved |
| GAP-13 | Broken lint script | Next.js §2 | Open (High) |
| GAP-14 | React Compiler not enabled | Next.js §2 | Open |
| GAP-15 | next-themes phantom dep | Infra §8 | Open |
