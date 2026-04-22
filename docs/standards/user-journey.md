# User Journey

> Last updated: 2026-04-21

---

## Primary User Journeys

### Journey 1: Manage Workflow Items (Operator)

```mermaid
flowchart TD
    START([Operator opens NOS Dashboard]) --> SIDEBAR[Select workflow from sidebar]
    SIDEBAR --> KANBAN{View mode?}
    KANBAN -->|Kanban| KB[View Kanban board with stage columns]
    KANBAN -->|List| LV[View list of all items]
    
    KB --> CREATE[Click + to create new item]
    LV --> CREATE
    CREATE --> FORM[Fill title, optional stage]
    FORM --> SUBMIT[Submit]
    SUBMIT --> PIPELINE{Stage has agent + prompt?}
    PIPELINE -->|Yes| AUTO[Pipeline auto-starts agent session]
    PIPELINE -->|No| TODO[Item appears as Todo in stage]
    AUTO --> PROGRESS[Item shows as In Progress]
    
    KB --> DRAG[Drag item to different stage]
    DRAG --> MOVE[Item moved, pipeline may trigger]
    
    KB --> CLICK[Click item card]
    LV --> CLICK
    CLICK --> DETAIL[Open Item Detail Dialog]
    DETAIL --> EDIT_TITLE[Edit title]
    DETAIL --> EDIT_BODY[Edit markdown body via MDXEditor]
    DETAIL --> ADD_COMMENT[Add comment]
    DETAIL --> VIEW_SESSION[View session history]
    DETAIL --> CHANGE_STATUS[Change status manually]
    
    PROGRESS --> HEARTBEAT[Heartbeat sweeper detects session complete]
    HEARTBEAT --> DONE[Item marked Done, summary comment attached]
    DONE --> ADVANCE{autoAdvanceOnComplete?}
    ADVANCE -->|Yes| NEXT[Item moves to next stage as Todo]
    ADVANCE -->|No| STAY[Item stays in current stage as Done]
    NEXT --> PIPELINE
```

### Journey 2: Configure Workflow Pipeline (Operator)

```mermaid
flowchart TD
    START([Navigate to workflow settings]) --> STAGES[View current stages]
    STAGES --> ADD_STAGE[Add new stage]
    ADD_STAGE --> NAME[Enter stage name]
    NAME --> PROMPT[Write stage prompt instructions]
    PROMPT --> ASSIGN{Assign agent?}
    ASSIGN -->|Yes| SELECT_AGENT[Select agent from dropdown]
    ASSIGN -->|No| SKIP[Leave unassigned]
    SELECT_AGENT --> CONFIG_AA{Enable auto-advance?}
    SKIP --> CONFIG_AA
    CONFIG_AA -->|Yes| ENABLE[Set autoAdvanceOnComplete: true]
    CONFIG_AA -->|No| DISABLE[Leave disabled]
    ENABLE --> SAVE[Save stage configuration]
    DISABLE --> SAVE
    SAVE --> REORDER{Reorder stages?}
    REORDER -->|Yes| DRAG_STAGES[Drag stages to reorder]
    REORDER -->|No| EXIT([Configuration complete])
    DRAG_STAGES --> EXIT
```

### Journey 3: Create and Assign Agents (Operator)

```mermaid
flowchart TD
    START([Navigate to Members page]) --> LIST[View existing agents]
    LIST --> CREATE[Click Create Agent]
    CREATE --> NAME[Enter display name]
    NAME --> ADAPTER[Select adapter: Claude CLI]
    ADAPTER --> MODEL[Select model: Opus / Sonnet / Haiku]
    MODEL --> PROMPT[Write agent prompt template]
    PROMPT --> SAVE[Save agent]
    SAVE --> ASSIGN{Assign to stage?}
    ASSIGN -->|Yes| GO_SETTINGS[Navigate to workflow settings]
    GO_SETTINGS --> EDIT_STAGE[Edit target stage]
    EDIT_STAGE --> SELECT[Select agent from agentId dropdown]
    SELECT --> DONE([Agent assigned to stage])
    ASSIGN -->|No| DONE2([Agent created, available for later])
```

### Journey 4: Monitor Agent Execution (Operator)

```mermaid
flowchart TD
    START([Agent session triggered]) --> TERMINAL[Open Claude Terminal]
    TERMINAL --> ACTIVE{Active session?}
    ACTIVE -->|Yes| STREAM[View streaming output with green dot indicator]
    ACTIVE -->|No| HISTORY[Browse session history]
    STREAM --> INTERACT{Agent asks question?}
    INTERACT -->|Yes| ANSWER[Answer via QuestionCard]
    INTERACT -->|No| WAIT[Continue watching]
    ANSWER --> STREAM
    WAIT --> COMPLETE{Session complete?}
    COMPLETE -->|Yes| SUMMARY[View summary comment on item]
    COMPLETE -->|No| STREAM
    
    HISTORY --> SELECT[Select past session]
    SELECT --> REPLAY[View session replay]
    
    SUMMARY --> CHECK[Check item status on Kanban]
    CHECK --> REVIEW{Review needed?}
    REVIEW -->|Yes| DETAIL[Open item detail, review output]
    REVIEW -->|No| NEXT([Move to next task])
```

### Journey 5: Interactive Chat with Agent (Operator)

```mermaid
flowchart TD
    START([Open Claude Terminal]) --> COMPOSE[Type message or slash command]
    COMPOSE --> SLASH{Slash command?}
    SLASH -->|Yes| POPUP[SlashPopup shows command palette]
    POPUP --> SELECT[Select command]
    SELECT --> EXECUTE[Execute skill]
    SLASH -->|No| SEND[Send message]
    SEND --> STREAM[SSE streaming response]
    STREAM --> TOOL{Agent uses tool?}
    TOOL -->|Yes| CARD[ToolUseCard shows invocation + result]
    TOOL -->|No| TEXT[Text response renders]
    CARD --> STREAM
    TEXT --> DONE{Conversation complete?}
    DONE -->|Yes| EXIT([End chat session])
    DONE -->|No| COMPOSE
```

### Journey 6: Workspace Management (Operator)

```mermaid
flowchart TD
    START([Open Workspace settings]) --> LIST[View current workspaces]
    LIST --> CHOOSE{Action?}
    CHOOSE -->|Create| BROWSE[Browse filesystem]
    BROWSE --> SELECT[Select directory]
    SELECT --> NAME[Enter workspace name]
    NAME --> CREATE[Create workspace]
    CREATE --> ACTIVATE[Activate new workspace]
    CHOOSE -->|Switch| SWITCHER[Open workspace switcher]
    SWITCHER --> PICK[Select workspace]
    PICK --> ACTIVATE
    ACTIVATE --> RELOAD[Dashboard reloads with workspace context]
    RELOAD --> EXIT([Working in new workspace])
```

---

## Entry Points

| Entry Point | URL | Description |
|-------------|-----|-------------|
| Home | `/` | Landing page, redirects to dashboard |
| Dashboard | `/dashboard` | Main dashboard with overview |
| Workflows | `/dashboard/workflows` | Workflow list |
| Workflow Detail | `/dashboard/workflows/[id]` | Kanban/List view for specific workflow |
| Workflow Settings | `/dashboard/workflows/[id]/settings` | Stage and workflow configuration |
| Terminal | `/dashboard/terminal` | Claude Terminal for agent interaction |
| Members | `/dashboard/agents` | Agent management |
| Settings | `/dashboard/settings` | Global settings (system prompt, heartbeat) |
| Activity | `/dashboard/activity` | Global activity feed |
| Workspaces | `/dashboard/workspaces` | Workspace management |

---

## Decision Points

| Decision | Options | Impact |
|----------|---------|--------|
| View mode | Kanban vs. List | Different UI for same data; persisted per session |
| Auto-advance | Enable vs. disable per stage | Controls whether Done items auto-move to next stage |
| Agent assignment | Assign agent or leave manual | Determines whether pipeline auto-triggers on items |
| Status override | Manual status change | Bypasses normal lifecycle; useful for stuck items |
| Workspace switch | Select different workspace | Changes project root; all data context switches |

---

## Exit States

| State | Condition | Next Action |
|-------|-----------|-------------|
| Item Done (final stage) | Item completed in last pipeline stage | Operator reviews and archives |
| Item Done (mid-pipeline) | Item completed with auto-advance enabled | System auto-moves to next stage |
| Item Failed | Agent reports FAILED: in summary | Operator investigates, may reset to Todo |
| Session Stranded | Agent process crashed without clean exit | Heartbeat sweeper detects and marks Done |
| Pipeline Idle | No Todo items in stages with agents | System quiescent until new items created |
