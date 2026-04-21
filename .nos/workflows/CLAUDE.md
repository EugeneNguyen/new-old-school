# Workflows Guide

A workflow is a configurable stage pipeline. Each workflow has its own stages, agents, and items.

## Structure

```
workflows/<id>/
├── config.json              # Workflow-level settings
├── config/stages.yaml       # Stage definitions
└── items/                   # Per-item directories
    └── <item-id>/
        ├── index.md         # Item content (varies by workflow type)
        └── meta.yml         # Item metadata
```

## config.json

Workflow-level configuration (stages, agents, triggers).

## config/stages.yaml

Stage definitions. Each stage has:

```yaml
- name: <stage-name>           # Unique stage identifier
  description: <description>   # Human-readable description
  prompt: <prompt>              # Stage prompt injected into agent runs
  autoAdvanceOnComplete: bool  # Auto-advance when stage completes
  agentId: <agent-id>          # Agent to use (null = default)
```

See [agents/CLAUDE.md](../agents/CLAUDE.md) for agent configuration.

## items/

Each item has:

- `index.md` — Item content (structure varies by workflow type)
- `meta.yml` — Item metadata

### meta.yml Schema

```yaml
title: <item-title>
stage: <stage-name>     # Current stage
status: Todo            # Current status
comments:               # Append-only comments
  - >-
    Comment text...
sessions:               # Session history
  - stage: <stage>
    adapter: claude
    sessionId: <id>
    startedAt: <iso-date>
    agentId: <agent-id>
updatedAt: <iso-date>
```

## activity.jsonl

Append-only audit log of all stage transitions. Each line is a JSON object recording when an item moved between stages.

## Stage Protocol

Items flow through stages sequentially. Each stage has a `<stage-prompt>` that defines the agent's work for that stage.

To manually move an item to a different stage, edit its `meta.yml` file directly:
```yaml
stage: <stage-name>
```

## Status Protocol

Status transitions (`Todo` → `In Progress` → `Done`) are owned by the NOS runtime heartbeat sweeper. The runtime automatically flips `In Progress` when it triggers a stage run and `Done` once the session exits.

To manually update an item's status, edit its `meta.yml` file directly:
```yaml
status: Todo  # Valid: Todo, In Progress, Done
```
