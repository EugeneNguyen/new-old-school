# NOS — AI Orchestration You Control

**No more "trust me bro".** NOS gives you a configurable stage pipeline where every AI prompt is yours to see, set, and own.

[![npm](https://img.shields.io/npm/v/nos.svg)](https://www.npmjs.com/package/nos)
[![License](https://img.shields.io/github/license/EugeneNguyen/new-old-school)](https://github.com/EugeneNguyen/new-old-school)
[![GitHub Stars](https://img.shields.io/github/stars/EugeneNguyen/new-old-school)](https://github.com/EugeneNguyen/new-old-school/stargazers)

---

## The Problem

AI tools are powerful — until they're not. You paste a prompt, cross your fingers, and hope the model does what you meant. When it doesn't, you debug blind. When it does, you're not even sure *why*.

**Sound familiar?**

- "I have no idea what prompt the agent is actually using."
- "My PM keeps asking what the AI is doing — I can't show them."
- "I'm tired of doing the same multi-step AI dance every single day."

The industry is leaning hard into "magic" — opaque agents that do stuff. We're building the opposite: ** NOS** — the AI harness that makes you the operator, not the passenger.

---

## The Solution

**NOS** is an AI orchestration layer that puts you in the cockpit.

Instead of one-shot prompts, you define a **stage pipeline** — a configurable sequence of steps your work flows through. Each stage has a prompt, an agent, and clear acceptance criteria. Every prompt that fires is visible to you. Every result is logged. Every step is yours to adjust.

```
Requirements → Analysis → Specification → Implementation → Done
     ↓
  [Agent]    [Agent]       [Agent]        [Agent]
```

You're not delegating to an AI. You're **orchestrating one**.

---

## Why NOS?

### 🎯 You see every prompt

NOS assembles each agent prompt from your system prompt, the stage instructions, and the item content — then logs the full prompt before it fires. No black boxes.

### 🔧 Fully configurable

Stage pipelines, agent personas, prompts, and auto-advance rules are all defined in plain YAML/Markdown files. No lock-in. No magic config. You own the system.

### 📊 Visibility for everyone

The web dashboard shows every workflow, every item, every agent session — in real time. Your PM can see what's in flight. Your marketing team can track campaigns. No privileged access required.

### 📁 Everything is a file

Workflows and items live in plain Markdown and YAML files on disk — version-controlled, diff-able, and editable with any tool. No database, no vendor lock-in.

### 🔁 Apply to everything, on your schedule

Not just code. Requirements, content pipelines, bug triage, campaign planning — any staged process is a workflow in NOS. Set a routine schedule and NOS creates and runs items automatically.

### 📊 Kanban view out of the box

The web dashboard renders every workflow as a live Kanban board. Drag items between stages, inspect agent sessions, and watch progress update in real time.

---

## Who is this for?

### 🛠️ Engineers running 100 Claude Code sessions a day

Stop losing context between sessions. NOS tracks every item, every prompt, every result. Refactor confidently with a full audit trail.

### 📋 Project managers who need visibility into AI work

You don't need to be technical to understand what's happening. The Kanban board shows every item's stage, status, and agent — in plain English.

### 📣 Solo marketers tired of guiding AI step by step

Build a content pipeline once, let NOS drive it. Stage 1: brief. Stage 2: draft. Stage 3: review. Stage 4: publish. Repeat on a schedule.

---

## Quickstart

### One command to rule them all

```bash
npx nos
```

That's it. The CLI starts the dev server and opens the dashboard at [http://localhost:30128](http://localhost:30128).

### Three steps to your first workflow

1. **Open the dashboard** — The browser launches automatically. You'll see the Requirements workflow with sample items.
2. **Create an item** — Click "New Item" in the Kanban board. Give it a title and body. It'll land in the first stage.
3. **Watch it flow** — NOS auto-advances items through stages when the agent completes. Drag items manually or let the pipeline run on its schedule.

### Deeper dive

- [`.nos/system-prompt.md`](.nos/system-prompt.md) — Authoritative runtime spec for agents
- [`.nos/CLAUDE.md`](.nos/CLAUDE.md) — NOS architecture overview
- [`CLAUDE.md`](CLAUDE.md) — Project guide with CEO agent framework

---

## Contributing

Contributions welcome. Before opening a PR:

- Run `npm run lint` — code must pass Biome checks
- Run `npm run test` — all unit tests must pass
- Changes must follow the conventions in [`CLAUDE.md`](CLAUDE.md)

For questions about the workflow system, see the NOS documentation linked above.

---

## Technical Reference

<details>
<summary>Available Scripts, Directory Layout & Tech Stack (click to expand)</summary>

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server on port 30128 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run Biome linter |
| `npm run test` | Run Node test suite |

### Directory Layout

```
.
├── app/                      # Next.js App Router pages
├── components/              # React components
│   ├── dashboard/            # Dashboard UI components
│   ├── terminal/            # Terminal/REPL components
│   └── ui/                  # Reusable UI components
├── .nos/                     # NOS workflow subsystem
│   ├── workflows/           # Workflow definitions and items
│   ├── agents/              # Agent configurations
│   ├── system-prompt.md    # NOS runtime specification
│   └── CLAUDE.md           # NOS subsystem overview
├── bin/                      # Executable scripts
│   └── cli.mjs              # CLI entry point
├── config/                   # Configuration files
├── docs/                     # Project documentation
├── hooks/                    # React hooks
├── lib/                      # Utility libraries and core logic
├── public/                   # Static assets
├── types/                    # TypeScript type definitions
└── CLAUDE.md                # Project-level guide
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | [Next.js canary](https://nextjs.org/) — React App Router |
| UI | [React canary](https://react.dev/) — Experimental React |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Components | [Radix UI](https://www.radix-ui.com/) — Accessible primitives |
| CLI | [Commander.js](https://github.com/tj/commander.js) |
| Markdown | [MDXEditor](https://mdxeditor.dev/) + remark/rehype |
| Type Safety | [TypeScript](https://www.typescriptlang.org/) |

### Entry Points

**CLI Tool** (`bin/cli.mjs`):

```bash
nos                          # Launch the NOS dashboard
NOS_PROJECT_ROOT=/path/to/project nos  # Override project root
NOS_PORT=3000 nos            # Override port
```

**Development Server**:
- Port: `30128`
- URL: `http://localhost:30128`

### Stability Note

This project uses **canary-channel** Next.js and React. These are bleeding-edge, experimental releases. Use this for development, internal tooling, and feature exploration — not production deployments.

</details>