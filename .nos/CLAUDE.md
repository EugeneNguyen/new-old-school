# NOS Subsystem Guide

This document is a conceptual introduction to NOS — the Notion-Oriented System for managing items through a configurable stage pipeline.

## Documentation Stack

NOS has three related documentation files. Each has a distinct role:

- `.nos/system-prompt.md` — **Authoritative runtime spec.** Injected verbatim into every agent run. Defines agent behavior, failure handling, and available skills. Agents MUST follow this. For the authoritative runtime spec, see `.nos/system-prompt.md`.
- `CLAUDE.md` (project root) — **Project-level guide.** Covers how NOS fits the broader codebase, including the CEO agent framework and requirement management conventions.
- `.nos/CLAUDE.md` — **This document.** A conceptual overview that explains *what* NOS is and *how it's organized*. References the above but does not duplicate or contradict them.

When the three docs disagree, the authoritative runtime spec takes precedence.

## Directory Map

The `.nos/` directory contains the NOS subsystem:

```
.nos/
├── claude.md              # This document
├── system-prompt.md       # Agent runtime spec (do not modify during runs)
├── settings.yaml          # NOS-level settings (server URL, logging)
├── workflows/             # Workflow definitions and item storage
│   └── <id>/              # Per-workflow directory
│       ├── config.json    # Workflow-level settings (stages, agents, triggers)
│       └── items/         # Workflow items
├── agents/                # Agent adapter configurations
│   └── <name>/            # Per-agent adapter config directories
└── runtime/               # Runtime server state
    ├── server.json        # Active session tracking
    └── server.log         # Runtime server log
```

## Workflows

A workflow is a configurable stage pipeline. Each workflow has its own stages, agents, and items.

For details on workflows structure and configuration, see [workflows/CLAUDE.md](workflows/CLAUDE.md).

## Maintenance

This document describes stable structural concepts. When adding or removing subdirectories, update this guide to reflect the change. No single owner is assigned — contributors are expected to update it alongside structural changes, similar to a README convention.
