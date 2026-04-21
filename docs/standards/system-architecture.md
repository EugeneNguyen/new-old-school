# System Architecture

> Last updated: 2026-04-21

---

## High-Level Component Diagram

```mermaid
C4Context
    title NOS System Architecture

    Person(user, "Operator", "Human user managing workflows")
    Person(agent, "Agent", "Claude CLI agent executing stage work")

    System_Boundary(nos, "NOS Platform") {
        Container(webapp, "Web Dashboard", "Next.js 16 / React 19", "Kanban board, item management, terminal, settings")
        Container(api, "REST API", "Next.js API Routes", "35+ endpoints for CRUD, streaming, events")
        Container(engine, "Workflow Engine", "TypeScript", "Stage pipeline, auto-advance sweeper, event system")
        Container(adapter, "Agent Adapter", "TypeScript", "Pluggable adapter interface; Claude CLI implementation")
        ContainerDb(fs, "File System", "YAML/MD/JSON/JSONL", "Workflows, items, agents, settings, activity logs")
    }

    System_Ext(claude, "Claude CLI", "External AI agent runtime")

    Rel(user, webapp, "Uses", "HTTPS / localhost:30128")
    Rel(webapp, api, "Calls", "fetch / SSE")
    Rel(api, engine, "Invokes", "Function calls")
    Rel(engine, adapter, "Triggers", "Stage pipeline")
    Rel(engine, fs, "Reads/Writes", "Atomic file I/O")
    Rel(adapter, claude, "Spawns", "Child process")
    Rel(claude, fs, "Reads/Writes", "Session output")
    Rel(agent, api, "Calls", "NOS skills (HTTP)")
```

---

## Component Architecture

```mermaid
flowchart TB
    subgraph Client ["Web Dashboard (Client)"]
        KB[KanbanBoard]
        LV[ListView]
        ID[ItemDetailDialog]
        SD[StageDetailDialog]
        CT[Claude Terminal]
        SB[Sidebar]
        ST[Settings]
    end

    subgraph API ["API Layer (Next.js Routes)"]
        WR["/api/workflows"]
        IR["/api/workflows/.../items"]
        SR["/api/workflows/.../stages"]
        AR["/api/agents"]
        CR["/api/chat"]
        ER["/api/activity/events"]
        SE["/api/settings"]
        SH["/api/shell"]
    end

    subgraph Engine ["Workflow Engine (lib/)"]
        WS[workflow-store]
        AS[agents-store]
        SP[stage-pipeline]
        AA[auto-advance]
        SW[auto-advance-sweeper]
        WE[workflow-events]
        AL[activity-log]
        RS[routine-scheduler]
    end

    subgraph Adapter ["Agent Adapter"]
        AI[AgentAdapter Interface]
        CA[claudeAdapter]
        SR2[stream-registry]
    end

    subgraph Storage ["File System"]
        WF[".nos/workflows/"]
        AG[".nos/agents/"]
        ST2[".nos/settings.yaml"]
        SY[".nos/system-prompt.md"]
        SS[".claude/sessions/"]
    end

    Client -->|HTTP/SSE| API
    API --> Engine
    Engine --> Adapter
    Engine --> Storage
    Adapter -->|spawn| CLAUDE[Claude CLI]
    CLAUDE --> SS
    SW -->|periodic| AA
    AA --> SP
    WE -->|emit| ER
```

---

## Data Flow

### Item Creation Flow
```mermaid
sequenceDiagram
    participant U as User/Agent
    participant API as API Route
    participant WS as workflow-store
    participant SP as stage-pipeline
    participant CA as claudeAdapter
    participant FS as File System
    participant WE as workflow-events

    U->>API: POST /api/workflows/{id}/items
    API->>API: Validate input (title, stage)
    API->>WS: createItem(workflowId, title, stage)
    WS->>FS: Write meta.yml + index.md
    WS->>WE: Emit item-created
    WS-->>API: Return item
    API->>SP: triggerStagePipeline(workflowId, itemId)
    SP->>FS: Read system prompt + stage prompt
    SP->>SP: Build full prompt (system + member + stage + item)
    SP->>CA: startSession(prompt, cwd, model)
    CA->>CA: Spawn claude CLI process
    CA-->>SP: Return sessionId
    SP->>WS: Update item (status=In Progress, add session)
    WS->>FS: Write updated meta.yml
    WS->>WE: Emit item-updated
    API-->>U: Return created item (201)
```

### Heartbeat Auto-Advance Flow
```mermaid
sequenceDiagram
    participant SW as Sweeper (recursive setTimeout)
    participant AA as auto-advance
    participant WS as workflow-store
    participant SP as stage-pipeline
    participant FS as File System

    loop Every heartbeatMs (default 60s)
        SW->>AA: Sweep all workspaces
        AA->>FS: Read all workflow items
        loop Each item
            AA->>AA: completeSessionIfFinished()
            alt Session idle (log file stale)
                AA->>WS: Update status to Done
                AA->>WS: Attach final output as comment
            end
            AA->>AA: autoAdvanceIfEligible()
            alt Item Done + autoAdvance + next stage exists
                AA->>WS: Move to next stage, reset to Todo
            end
            AA->>AA: autoStartIfEligible()
            alt Item Todo + no session for stage
                AA->>SP: triggerStagePipeline()
            end
        end
    end
```

### Real-Time Event Flow
```mermaid
sequenceDiagram
    participant FS as File System
    participant CH as chokidar watcher
    participant WE as workflow-events
    participant SSE as SSE Endpoint
    participant UI as Dashboard UI

    FS-->>CH: File change detected
    CH->>WE: Emit item-updated
    WE->>SSE: Push event to listeners
    SSE->>UI: SSE message
    UI->>UI: Reconcile state (last-writer-wins)
```

---

## Deployment Topology

```mermaid
flowchart LR
    subgraph Local Machine
        subgraph "Node.js Process"
            NX[Next.js Server :30128]
            HB[Heartbeat Sweeper]
            CK[Chokidar Watcher]
        end
        subgraph "Child Processes"
            CL1[Claude CLI Session 1]
            CL2[Claude CLI Session 2]
            CLn[Claude CLI Session n]
        end
        subgraph "File System"
            NOS[".nos/ directory tree"]
            CLAUDE[".claude/sessions/"]
        end
    end

    NX --> NOS
    NX --> CLAUDE
    HB --> NOS
    CK --> NOS
    CL1 --> CLAUDE
    CL2 --> CLAUDE
    CLn --> CLAUDE
    NX -.->|spawn| CL1
    NX -.->|spawn| CL2
```

NOS is a **local-only application**. All components run on the operator's machine:
- **Single Node.js process**: Next.js server handling HTTP/SSE + heartbeat sweeper + file watcher
- **Child processes**: Claude CLI agents spawned on demand per stage pipeline trigger
- **File system**: All state persisted locally in `.nos/` directory tree
- **No external services**: No database, no cloud APIs (except Claude CLI's own API calls)

---

## Integration Points

| Integration | Protocol | Direction | Description |
|-------------|----------|-----------|-------------|
| Web Dashboard u2192 API | HTTP/SSE | Client u2192 Server | Dashboard fetches data and subscribes to events |
| API u2192 Workflow Engine | Function call | Internal | API routes invoke store/pipeline functions directly |
| Workflow Engine u2192 Claude CLI | Process spawn | Server u2192 Child | Agent adapter spawns `claude` as child process |
| Claude CLI u2192 NOS API | HTTP | Child u2192 Server | Agents use NOS skills (nos-create-item, etc.) via HTTP |
| Chokidar u2192 Event System | File watch | FS u2192 Server | External file edits detected and emitted as events |
| Heartbeat Sweeper u2192 Engine | Timer | Internal | Periodic sweep for session completion and auto-advance |

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| File-based storage | Local-only tool; no need for database; human-readable YAML/Markdown |
| Atomic writes | Prevent corruption from partial writes; temp file + rename pattern |
| SSE for real-time | Simpler than WebSockets; uni-directional server-to-client sufficient |
| Claude CLI adapter | Leverage existing Claude Code CLI; avoid direct API integration |
| Heartbeat sweeper | Catch stranded sessions; complement event-triggered auto-advance |
| AsyncLocalStorage | Thread workspace context through API handlers without prop drilling |
| Last-writer-wins | Simple conflict resolution for concurrent edits (single user expected) |
