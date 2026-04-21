# NOS

**NOS** is a workflow and requirements management system designed to streamline project organization and task execution. It provides a CLI tool for launching a local dev environment and a web dashboard for managing requirements, workflows, and tasks through a configurable stage pipeline.

## Prerequisites

- **Node.js >= 18** — Required to run the project and CLI tool.

## Installation

### Global Installation (via npx)

Install and run NOS globally:

```bash
npx nos
```

This launches the NOS dashboard locally in your browser.

### Local Development Setup

Clone the repository and set up the project locally:

```bash
git clone <repository-url>
cd new-old-school
npm install
npm run dev
```

The dev server starts on **port 30128** and opens automatically at `http://localhost:30128`.

## Available Scripts

Run these scripts from the project root:

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the Next.js dev server on port 30128 |
| `npm run build` | Build the Next.js application for production |
| `npm run start` | Start the Next.js production server (requires build first) |
| `npm run lint` | Run ESLint to check code quality and formatting |
| `npm run test` | Run unit tests using Node's built-in test runner |

## Directory Layout

```
.
├── app/                      # Next.js App Router pages and layouts
├── components/               # React components
│   ├── dashboard/           # Dashboard UI components
│   ├── terminal/            # Terminal/REPL components
│   └── ui/                  # Reusable UI components
├── .nos/                     # NOS workflow subsystem
│   ├── workflows/           # Workflow definitions and items
│   ├── agents/              # Agent configurations
│   ├── system-prompt.md     # NOS runtime specification
│   └── CLAUDE.md            # NOS subsystem overview
├── bin/                      # Executable scripts
│   └── cli.mjs              # CLI entry point
├── config/                   # Configuration files
├── docs/                     # Project documentation
├── hooks/                    # React hooks
├── lib/                      # Utility libraries and core logic
├── public/                   # Static assets
├── types/                    # TypeScript type definitions
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── CLAUDE.md                # Project-level guide
```

## NOS Subsystem Overview

The `.nos/` directory contains the **NOS workflow system** — a configurable stage pipeline for managing requirements, tasks, and project items.

### What is NOS?

NOS organizes work into **workflows**, where each item flows through **stages** (e.g., Analysis → Specification → Implementation → Done). Each stage has:

- A defined **purpose** and acceptance criteria
- An assigned **agent** to perform the work
- A **prompt** guiding the agent's execution

Items are tracked in `meta.yml` with title, status, stage, and comments. Workflows are fully configurable and can be adapted for different project needs (requirements management, feature implementation, bug triage, etc.).

### Documentation

For deeper understanding of NOS, see:

- [`.nos/system-prompt.md`](.nos/system-prompt.md) — **Authoritative runtime spec** for how agents execute workflow stages
- [`.nos/CLAUDE.md`](.nos/CLAUDE.md) — **Conceptual overview** of the NOS architecture and directory structure
- [`CLAUDE.md`](CLAUDE.md) — **Project-level guide** covering the CEO agent framework and requirement management conventions

## Technology Stack

- **Frontend Framework**: [Next.js canary](https://nextjs.org/) — React meta-framework with App Router
- **UI Library**: [React canary](https://react.dev/) — Latest experimental React features
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) — Utility-first CSS framework
- **Component Library**: [Radix UI](https://www.radix-ui.com/) — Unstyled, accessible components
- **CLI Tool**: [Commander.js](https://github.com/tj/commander.js) — Node.js CLI library
- **Markdown Processing**: [MDXEditor](https://mdxeditor.dev/) and remark/rehype — Markdown rendering and transformation
- **Type Safety**: [TypeScript](https://www.typescriptlang.org/) — Static typing for JavaScript

## Entry Points

### CLI Tool

The CLI is located at `bin/cli.mjs` and is registered as the `nos` command in `package.json`:

```bash
nos                 # Launch the NOS dashboard
```

When run, the CLI:
- Starts a Next.js dev server (if not already running)
- Opens the dashboard in your default browser

You can override the default project root and port via environment variables:

```bash
NOS_PROJECT_ROOT=/path/to/project NOS_PORT=3000 npx nos
```

### Development Server

The dev server runs on **port 30128** and serves the Next.js application. Access it at:

```
http://localhost:30128
```

## Stability Note

This project uses **canary-channel dependencies** for Next.js and React. These are bleeding-edge, experimental releases with frequent updates and potential breaking changes. Use this setup for:

- **Development and experimentation** — testing the latest React and Next.js features
- **Internal tooling** — not for production deployments
- **Feature exploration** — evaluating experimental APIs before they stabilize

For production deployments, use stable release versions of Next.js and React.

## Getting Started

1. **Install dependencies**: `npm install`
2. **Start the dev server**: `npm run dev`
3. **Open the dashboard**: The browser opens automatically at `http://localhost:30128`
4. **Explore workflows**: Navigate to the dashboard to see requirements, workflows, and tasks managed by NOS

## Contributing

When contributing, ensure:

- Code passes linting: `npm run lint`
- Tests pass: `npm run test`
- Changes follow the project structure and conventions documented in [`CLAUDE.md`](CLAUDE.md)

For details on the NOS workflow system and how requirements are managed, see the project guide and NOS documentation referenced above.
