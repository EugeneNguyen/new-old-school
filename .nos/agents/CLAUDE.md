# Agents Guide

Agents are named adapters that power stage runs. Each agent has its own configuration and can be assigned to specific stages.

## Structure

```
agents/<name>/
├── index.md         # Agent-specific instructions or context
└── meta.yml         # Agent metadata
```

## meta.yml Schema

```yaml
id: <agent-id>           # Unique identifier
displayName: <name>      # Human-readable name
model: <model-id>        # Model to use (e.g., haiku-replacement)
adapter: claude          # Adapter type (currently always claude)
createdAt: <iso-date>
updatedAt: <iso-date>
```

## Assigning Agents to Stages

In `workflows/<id>/config/stages.yaml`, each stage can optionally specify an `agentId` to use a specific agent for that stage. If `agentId` is null, the default agent is used.

```yaml
- name: Implementation
  agentId: david-engineer  # Use this agent for Implementation stage
```
