# NOS Subsystem Guide

This document is a conceptual introduction to NOS — the Notion-Oriented System for managing requirements through a stage pipeline.

## Documentation Stack

NOS has three related documentation files. Each has a distinct role:

- `.nos/system-prompt.md` — **Authoritative runtime spec.** Injected verbatim into every agent run. Defines agent behavior, failure handling, and available skills. Agents MUST follow this. For the authoritative runtime spec, see `.nos/system-prompt.md`.
- `CLAUDE.md` (project root) — **Project-level guide.** Covers how NOS fits the broader codebase, including the CEO agent framework and requirement management conventions.
- `.nos/claude.md` — **This document.** A conceptual overview that explains *what* NOS is and *how it's organized*. References the above but does not duplicate or contradict them.

When the three docs disagree, the authoritative runtime spec takes precedence.

## Directory Map

The `.nos/` directory contains the NOS subsystem:

```
.nos/
├── claude.md              # This document
├── system-prompt.md       # Agent runtime spec (do not modify during runs)
├── settings.yaml          # NOS-level settings (server URL, logging)
├── workflows/             # Workflow definitions and item storage
│   ├── config.json        # Per-workflow settings (stages, agents, triggers)
│   └── requirements/      # The requirements management workflow
├── agents/                # Agent adapter configurations
│   ├── claude/            # Claude adapter config
│   └── martin-senior-engineer/  # Senior engineer adapter config
└── runtime/               # Runtime server state
    ├── server.json        # Active session tracking
    └── server.log         # Runtime server log
```

## Requirements Workflow

The `.nos/workflows/requirements/` workflow manages requirements through a structured lifecycle:

- `config.json` — Workflow-level configuration.
- `config/stages.yaml` — Stage definitions (names, descriptions, prompts, auto-advance rules).
- `requirements/items/` — Per-item directories. Each item has:
  - `index.md` — Title, brainstorming, analysis, specification, implementation notes, validation.
  - `meta.yml` — Item metadata (stage, status, comments, sessions).
  - `meta.yml` (requirement files) — Requirement-specific metadata.
- `activity.jsonl` — Append-only audit log of all stage transitions.

## Pipeline Stages

Requirements flow through these stages in order:

1. **Backlog** — Initial capture of the requirement.
2. **Brainstorming** — Socratic exploration of the requirement's scope and assumptions.
3. **Analysis** — Feasibility study, dependency mapping, risk identification.
4. **Documentation** — Writing formal specifications with user stories and acceptance criteria.
5. **Implementation** — Building the feature according to the spec.
6. **Validation** — Verifying implementation against acceptance criteria.
7. **Done** — Requirement is complete.

Each stage has a `<stage-prompt>` that defines the agent's work for that stage.

## Status Protocol

Status transitions (Todo → In Progress → Done) are owned by the NOS runtime heartbeat sweeper, not by agents. The runtime automatically flips `In Progress` when it triggers a stage run and `Done` once the session exits.

## Available Skills

NOS skills communicate with the dev server at `http://localhost:30128`:

- `nos-comment-item` — Append a mid-run checkpoint comment.
- `nos-create-item` — Create a new workflow item.
- `nos-edit-item` — Edit an item's title or body.
- `nos-move-stage` — Move an item to a different stage.

## Maintenance

This document describes stable structural concepts. When adding or removing subdirectories, update this guide to reflect the change. No single owner is assigned — contributors are expected to update it alongside structural changes, similar to a README convention.
