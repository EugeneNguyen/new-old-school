# Deployment & Infrastructure Design

> Last updated: 2026-04-24

NOS is a **local-only** application. All components run on the operator's development machine. There is no cloud deployment, staging environment, or production infrastructure.

---

## Environments

| Environment | Purpose | URL | Notes |
|-------------|---------|-----|-------|
| **Development** | Primary usage | `localhost:30128` | `npm run dev` with Turbopack |
| **Build** | Verify compilation | N/A | `npm run build` (Next.js production build) |
| **Test** | Run test suite | N/A | `npm test` (Node.js built-in test runner) |

There is no staging or production environment. NOS is intended to run as a development tool on the operator's local machine.

---

## CI/CD Pipeline

### Current State
- **No CI/CD pipeline configured** (no GitHub Actions, no CircleCI, no Jenkins)
- Build and test are manual: `npm run build`, `npm test`
- No automated deployment

### Recommended Pipeline Steps
If CI/CD were added:

```
1. Install dependencies     npm ci
2. Type check               npx tsc --noEmit
3. Lint                     (blocked by GAP-03/13 u2014 no linter configured)
4. Unit tests               npm test
5. Build                    npm run build
6. Bundle analysis           (optional) @next/bundle-analyzer
```

---

## Hosting Platform

- **Runtime**: Node.js >= 18
- **Framework**: Next.js 16 (App Router + API Routes)
- **Process**: Single Node.js process running `next dev` or `next start`
- **Child processes**: Claude CLI sessions spawned on demand
- **File watchers**: chokidar for real-time file change detection

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOS_PROJECT_ROOT` | No | `process.cwd()` | Override project root directory |
| `NOS_PORT` | No | `30128` | Dev server port |
| `NOS_TEMPLATES_ROOT` | No | CLI install path | Override templates directory for scaffolding |
| `PORT` | No | `30128` | Dev server port (set via `-p` flag) |
| `NODE_ENV` | No | `development` | Next.js environment mode |

### Cookie-Based Configuration
| Cookie | Purpose |
|--------|---------|
| `nos_workspace` | Active workspace ID; determines project root context |

---

## External Dependencies

| Dependency | Purpose | Required |
|------------|---------|----------|
| Node.js >= 18 | Runtime | Yes |
| npm | Package management | Yes |
| Claude Code CLI | Agent execution adapter | Yes (for agent features) |
| Git | Version control (optional) | No |

---

## Startup Sequence

### Via npm
```
1. npm run dev
2. Next.js starts Turbopack dev server on :30128
3. middleware.ts registers API request logger
4. Auto-advance sweeper starts (heartbeat loop)
5. Routine scheduler starts (if workflows have routines enabled)
6. Chokidar file watchers initialize for active workflows
7. Dashboard accessible at localhost:30128
```

### Via npx nos (CLI)
```
1. npx nos (detects existing .nos/ or offers init)
2. nos init --if-needed (scaffolds workspace if absent)
3. Resolves Next.js binary from installed location
4. Launches Next.js dev server with NOS_PROJECT_ROOT set
5. Same startup sequence as npm run dev from step 2
```

---

## Rollback Procedure

Since NOS is a local tool with file-based storage:

1. **Code rollback**: `git checkout <previous-commit>` + `npm install` + restart dev server
2. **Data rollback**: If the `.nos/` directory is under version control, `git checkout .nos/`. Otherwise, restore from filesystem backup.
3. **Settings rollback**: Edit `.nos/settings.yaml` directly or restore from backup.
4. **No database migrations**: File-based storage has no migration step.

---

## File System Requirements

| Path | Type | Purpose |
|------|------|---------|
| `<project>/.nos/` | Directory | Workflow data, agents, settings |
| `<project>/.claude/sessions/` | Directory | Agent session output files |
| `~/.nos/` | Directory | Global workspace registry |
| `<project>/node_modules/` | Directory | npm dependencies |

### Disk Space
- NOS data is lightweight (YAML + Markdown + JSONL)
- Session output files may grow with heavy agent usage
- No automatic cleanup of old session files
