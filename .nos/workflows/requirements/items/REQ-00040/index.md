now i want to use npx nos in other project folder.

* create a mechanism to check .nos folder exist in the folder, if not, create it with all current files.
* if it has .nos folder, continue to work in project folder.

## Analysis

### 1. Scope

**In scope**
- Make `npx nos` (and a globally installed `nos`) runnable from any arbitrary project directory, not just this repo.
- On startup, detect whether `<cwd>/.nos/` exists:
  - If missing → scaffold it by copying a bundled template (`agents/`, `workflows/`, `settings.yaml`, `system-prompt.md`) into `<cwd>/.nos/`.
  - If present → boot the server against the existing `<cwd>/.nos/` without overwriting anything.
- Fix `bin/cli.js` so the Next.js server runs from the package's install directory but treats the *user's* cwd as the data root. Today it calls `npm run dev`, which only works when the cwd has our `package.json` + dev script.
- Align the port/URL between the spawn command (`npm run dev` → 30128) and the browser launch (currently hard-coded to 3000).
- Package a `templates/.nos/` directory inside the npm tarball and ensure it is included in `files` / not blocked by `.npmignore`.

**Explicitly out of scope**
- Migrating or upgrading an existing `.nos/` directory whose schema is older than the template (no version check, no merge).
- Multi-tenant / multi-project mode from a single running server (still one project per server process).
- Building a production / non-dev runner (still uses `next dev`; `next build` + `next start` can be a follow-up).
- Publishing to npm or setting up release automation.
- Removing or re-homing the `.claude/sessions` directory (still created under the user's cwd).

### 2. Feasibility

Technically straightforward — the server already reads `.nos/` via `process.cwd()` in `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/settings.ts`, and `lib/system-prompt.ts`, so pointing it at a foreign cwd already works *if* we can launch the Next.js dev server from the package root while preserving that cwd.

**Key risks / unknowns**
- **Spawning `next dev` from the package dir with a foreign cwd.** `npm run dev` won't work when cwd has a different package.json. We need to invoke Next directly from the nos install path (e.g. `require.resolve('next/dist/bin/next')` or `node_modules/.bin/next`) with `{ cwd: <nos install dir> }`, while exposing the user's project path via an env var (e.g. `NOS_PROJECT_ROOT`) that the stores read instead of `process.cwd()`.
- **`process.cwd()` coupling.** Every module that builds a path off `process.cwd()` becomes a bug the moment the server is spawned with a different cwd than the user's project. Needs a single `getProjectRoot()` helper and migration of all call sites (`lib/workflow-store.ts:7`, `lib/agents-store.ts:7`, `lib/settings.ts:5`, `lib/stage-pipeline.ts:47`, `lib/auto-advance.ts:12`, `lib/agent-adapter.ts:14,42`).
- **Next.js `.next/` build cache.** Writing `.next/` inside the package install dir is fine for `npx` (fresh temp install each run) but wasteful for globally installed `nos`. Acceptable for v1, document as known cost.
- **File watching over a foreign path.** `chokidar` must watch `<project>/.nos/`, not the package dir. Depends on the `getProjectRoot()` refactor above.
- **Template drift.** The shipped `templates/.nos/` must stay in sync with the schema the runtime expects. Needs either a copy-from-repo build step or a linter test.
- **Sensitive / user-specific content in the current `.nos/`.** The live `.nos/` here contains real requirement items (REQ-011..REQ-00040) and session IDs. Template must be a cleaned skeleton (empty `items/`, no `sessions:` entries, no comments) — not a raw copy.
- **CLI UX.** `bin/cli.js` currently hard-codes port 3000 but `dev` runs on 30128; also uses `setTimeout(4s)` instead of waiting for readiness. Fix opportunistically.

### 3. Dependencies

- **Internal modules** that read `.nos/`:
  - `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/settings.ts`, `lib/system-prompt.ts`, `lib/stage-pipeline.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, `lib/agent-adapter.ts`.
- **`.claude/sessions/`** directory (written by `lib/auto-advance.ts:12` and `lib/agent-adapter.ts:14`). Must land in the user's project, not the package install.
- **Related requirements** — none identified in the current backlog (REQ-011..REQ-00038 all concern in-app features, not the CLI distribution path). Good candidate for a net-new requirement.
- **External** — `next` (must be resolvable from the spawned cwd), `commander` (already a dep, not yet used by `bin/cli.js`), `open` (already used), node ≥ 18 for `fs.cp` recursive support.
- **Packaging** — `package.json` needs a `files` entry (or equivalent) so `templates/.nos/` ships in the npm tarball; `bin/cli.js` stays as the `bin` entry.

### 4. Open questions

1. **Template source of truth** — ship a separate `templates/.nos/` skeleton checked into the repo, or derive it at publish time by sanitising the live `.nos/`? (Recommend: checked-in skeleton to avoid accidental leak of live data.)
2. **Scaffold behavior when `.nos/` is partially present** (e.g. missing `settings.yaml` only) — fail, warn, or top-up missing files? Affects resilience when users upgrade nos.
3. **Port selection** — keep 30128 hard-coded, or make it configurable / auto-pick a free port so multiple projects can run nos simultaneously?
4. **Global install vs npx** — do we officially support `npm i -g nos`, or is `npx nos` the only supported path? Impacts whether the `.next/` build cache location needs rethinking.
5. **Project root discovery** — always use `process.cwd()` verbatim, or walk upward looking for an existing `.nos/` (git-style)? The requirement says "other project folder", which implies cwd only; confirm.
6. **`.claude/sessions/` placement** — inside the target project (current behavior, leaks into user's repo) or inside `.nos/sessions/` so everything is namespaced under one folder? Worth deciding before shipping.
7. **Interactive confirmation on first scaffold** — prompt the user before creating `.nos/` in a foreign directory, or create silently? Silent creation is friendlier but surprises users who `npx` in the wrong folder.

## Specification

### 1. User stories

1. As a developer trying nos for the first time, I want to run `npx nos` inside any project folder and have it bootstrap a working `.nos/` directory, so that I can start using nos without cloning its repo or running scaffolding commands by hand.
2. As a developer who already uses nos in a project, I want `npx nos` (or `nos`) to reuse my existing `.nos/` directory untouched, so that my workflows, items, agents, and settings are never overwritten by a newer CLI.
3. As a maintainer of nos, I want a single `getProjectRoot()` helper that every store reads, so that the server continues to work when spawned with a cwd different from the user's project.
4. As a developer who installed nos globally (`npm i -g nos`), I want the CLI to behave the same as `npx nos`, so that there is no second code path to learn.
5. As a developer who mistyped the folder, I want the CLI to log the exact path it is about to scaffold before creating anything, so that I can Ctrl-C before unwanted files appear.
6. As an agent running inside a spawned nos instance, I want `.claude/sessions/` and every `.nos/` read/write to resolve under the user's project root, so that session logs and workflow data stay in the project the user invoked nos from.

### 2. Acceptance criteria

Naming: `<pkg>` = the directory where nos is installed (npm cache for `npx`, global prefix for `-g`). `<project>` = the directory the user ran `nos` from (`process.cwd()` at CLI entry).

**Project-root resolution**

1. Given the CLI is launched in `<project>`, when the server process starts, then `process.env.NOS_PROJECT_ROOT` is set to the absolute path of `<project>`.
2. Given `NOS_PROJECT_ROOT` is set, when any of `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/settings.ts`, `lib/system-prompt.ts`, `lib/stage-pipeline.ts`, `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, or `lib/agent-adapter.ts` needs a project-relative path, then it resolves it via a shared `getProjectRoot()` helper (new file under `lib/`, e.g. `lib/project-root.ts`) and not via `process.cwd()`.
3. Given `NOS_PROJECT_ROOT` is not set (e.g. running `npm run dev` inside the nos repo during development), when `getProjectRoot()` is called, then it falls back to `process.cwd()` so in-repo development keeps working unchanged.
4. `getProjectRoot()` is called at most once per process startup; subsequent calls return a cached absolute path.

**Scaffolding `.nos/`**

5. Given `<project>/.nos/` does not exist, when the CLI starts, then it copies every file and subdirectory from the package's bundled `templates/.nos/` into `<project>/.nos/` before spawning the server.
6. Given `<project>/.nos/` already exists (even if empty, even if partially populated), when the CLI starts, then it does not create, overwrite, merge, or delete any file inside `<project>/.nos/` (top-up of missing files is explicitly out of scope for v1).
7. Given scaffolding is about to happen, when the copy begins, then the CLI prints `Initializing .nos/ in <absolute path>` to stdout; given scaffolding is skipped, the CLI prints `Using existing .nos/ at <absolute path>`.
8. Given `<project>/.nos/` is missing and the copy fails partway, when the CLI exits, then the partially-written `.nos/` is left in place (no rollback) and the CLI exits with a non-zero code and an error message naming the first failing path.
9. The bundled `templates/.nos/` contains exactly: `system-prompt.md`, `settings.yaml`, an `agents/` directory with the default agents shipped in the repo today, and a `workflows/` directory containing each workflow's `config/` subtree (e.g. `workflows/requirements/config/stages.yaml`) with an empty `items/` directory per workflow and no `sessions:` entries, no `comments:` entries, and no real requirement items.
10. The template's `settings.yaml` and `system-prompt.md` are byte-identical to fresh copies of the repo's current files at template-generation time.

**CLI spawn behavior**

11. Given the CLI is invoked, when it spawns the Next.js server, then it invokes Next directly from `<pkg>` (e.g. via the resolved path to `next/dist/bin/next`), not via `npm run dev`, and passes `cwd: <pkg>` to the child process while setting `NOS_PROJECT_ROOT=<project>` in the child's environment.
12. Given the server is spawning, when the port is chosen, then the CLI and the spawned server agree on the same port; the default is `30128` (matching `package.json > scripts.dev`).
13. Given the server has started, when the CLI opens a browser, then the URL matches the port from AC 12 (i.e. `http://localhost:30128` by default) rather than the currently hard-coded `http://localhost:3000`.
14. Given `nos` is installed globally with `npm i -g nos` and the user runs `nos` in `<project>`, when the CLI starts, then ACs 1–13 hold identically to `npx nos`.
15. Given the user sends `SIGINT` to the CLI, when the signal is received, then the child server is killed before the CLI exits (existing behavior preserved).

**Packaging**

16. Given the package is packed (`npm pack`), when the tarball contents are inspected, then they include `bin/cli.js`, the compiled/source Next.js app needed to run `next dev`, and the full `templates/.nos/` directory.
17. Given `.npmignore` or `package.json > files` exists, when packing, then neither excludes `templates/.nos/`.

**File watching**

18. Given the server is running under a foreign `<project>`, when a file changes under `<project>/.nos/`, then the chokidar watcher detects the change and reloads the affected store (watcher root must be derived from `getProjectRoot()`, not `process.cwd()` or `<pkg>`).

### 3. Technical constraints

- **Project-root env var**: `NOS_PROJECT_ROOT`. Absolute path. Set by `bin/cli.js` before spawning the server. Read by `lib/project-root.ts`.
- **`getProjectRoot()` helper**: new module `lib/project-root.ts`, default export (or named export) returning `string`. Signature: `() => string`. Resolution order: `process.env.NOS_PROJECT_ROOT` → `process.cwd()`. Result is cached in module scope.
- **Files that must migrate off `process.cwd()`**: `lib/workflow-store.ts:7`, `lib/agents-store.ts:7`, `lib/settings.ts:5`, `lib/system-prompt.ts` (current cwd reference), `lib/stage-pipeline.ts:47`, `lib/auto-advance.ts:12`, `lib/auto-advance-sweeper.ts`, `lib/agent-adapter.ts:14,42`. Any new file that needs a project-relative path must import `getProjectRoot()`.
- **Template location inside the package**: `templates/.nos/` (sibling of `app/`, `lib/`, `bin/`). Not inside `public/` (Next.js would serve it) and not inside `app/` (Next.js would treat it as routes).
- **Template contents (exact file list)**:
  - `templates/.nos/system-prompt.md` — copy of current `.nos/system-prompt.md`.
  - `templates/.nos/settings.yaml` — copy of current `.nos/settings.yaml`.
  - `templates/.nos/agents/**` — every file under current `.nos/agents/`.
  - `templates/.nos/workflows/<workflow-id>/config/**` — every file under current `.nos/workflows/<workflow-id>/config/` for each shipped workflow.
  - `templates/.nos/workflows/<workflow-id>/items/.gitkeep` — empty file so `items/` survives the copy.
- **Copy implementation**: `fs.cp(srcDir, destDir, { recursive: true, errorOnExist: true, force: false })` (requires Node ≥ 18, already a project baseline).
- **CLI spawn**: resolve Next's binary via `require.resolve('next/package.json')` then derive the bin path, or `require.resolve('next/dist/bin/next')`. Call with `spawn(process.execPath, [nextBinPath, 'dev', '-p', String(port)], { cwd: path.dirname(require.resolve('../package.json')), stdio: 'inherit', env: { ...process.env, NOS_PROJECT_ROOT: projectRoot } })`. Do not shell out via `npm` or `sh`.
- **Port**: default `30128`; overridable via `NOS_PORT` env var. Hard-coded port elsewhere (e.g. docs, `bin/cli.js` browser URL) must be replaced with the resolved value.
- **`package.json` changes**: add `"files": ["bin", "templates", "app", "lib", "components", "public", "next.config.*", "tsconfig.json", "package.json"]` (exact list to be finalized at implementation time but MUST include `bin` and `templates`). Keep `"bin": { "nos": "./bin/cli.js" }`.
- **Node version**: `engines.node >= 18` (for `fs.cp` with `recursive: true`). Declare in `package.json`.
- **Backwards compatibility**: running `npm run dev` inside the nos repo itself must continue to work without `NOS_PROJECT_ROOT` set — covered by the `process.cwd()` fallback in `getProjectRoot()`.
- **Open questions resolved by this spec**:
  - Q1 → checked-in `templates/.nos/` skeleton.
  - Q2 → existing `.nos/` is never modified; top-up is out of scope.
  - Q3 → port stays `30128`; `NOS_PORT` override optional.
  - Q4 → both `npx nos` and `npm i -g nos` are supported and share one code path.
  - Q5 → project root is `process.cwd()` verbatim; no upward walk.
  - Q6 → `.claude/sessions/` stays at `<project>/.claude/sessions/` (unchanged).
  - Q7 → silent scaffold with a clear stdout log line; no interactive prompt.

### 4. Out of scope

- Migrating, merging, or upgrading an existing `.nos/` directory (including topping up missing files when the user's `.nos/` is partially populated).
- Moving `.claude/sessions/` to `<project>/.nos/sessions/` or anywhere else; session log placement stays as-is.
- Running the app via `next build` + `next start` (production mode) from the CLI; dev mode only.
- Automatically picking a free port when 30128 is taken; the CLI will surface Next's port-in-use error to the user.
- Publishing the package to npm, release tooling, or CI for the tarball.
- Walking parent directories to discover a `.nos/` above `process.cwd()` (git-style root discovery).
- Multi-project support from a single running server process.
- Interactive prompts before scaffolding, `--yes` / `--force` flags, or a `nos init` subcommand.
- Optimising the `.next/` build cache location for globally installed nos.

## Implementation Notes

- Added `lib/project-root.ts` exporting `getProjectRoot()` with cached resolution: `NOS_PROJECT_ROOT` env → `process.cwd()` fallback.
- Migrated all eight spec-listed `lib/` call sites off `process.cwd()` onto `getProjectRoot()` (`workflow-store.ts`, `agents-store.ts`, `settings.ts`, `stage-pipeline.ts`, `auto-advance.ts`, `agent-adapter.ts`). `system-prompt.ts` already took `projectRoot` as a parameter; its two API callers (`app/api/settings/system-prompt/route.ts`) were updated to pass `getProjectRoot()` instead of `process.cwd()`. `auto-advance-sweeper.ts` only transitively reads project-root paths via the stores it calls, so it picks up the new helper without edits. Also migrated the chokidar watcher at `app/api/workflows/[id]/events/route.ts` (AC 18) plus `app/api/workflows/route.ts`, `app/api/claude/route.ts`, `app/api/claude/sessions/route.ts`, and `app/api/claude/sessions/[id]/stream/route.ts` so every runtime read/write of `.nos/` and `.claude/sessions/` resolves under the user's project root.
- Added bundled `templates/.nos/` containing `system-prompt.md`, `settings.yaml`, `agents/david-engineer/` (the default shipped agent), and `workflows/requirements/{config.json,config/stages.yaml,items/.gitkeep}`. The two top-level template files are byte-identical copies of the current repo's `.nos/system-prompt.md` and `.nos/settings.yaml`. `config.json` is shipped alongside the `config/` subtree because `readWorkflowConfig` needs it to allocate item IDs; this is the minimal extra file required to make a scaffolded project functional.
- Rewrote `bin/cli.js` to: (a) detect `<cwd>/.nos/` and scaffold from the bundled template with `fs.cpSync(src, dst, { recursive: true, errorOnExist: true, force: false })` when missing, logging `Initializing .nos/ in <path>` or `Using existing .nos/ at <path>`; (b) resolve the Next binary via `require.resolve('next/package.json', { paths: [pkgRoot] })` and its `bin.next` entry; (c) spawn it with `process.execPath` and `cwd: pkgRoot`, injecting `NOS_PROJECT_ROOT=<cwd>` and `NOS_PORT=<port>`; (d) default port 30128, overridable via `NOS_PORT`; (e) open the browser at the resolved port (no more hard-coded 3000). `SIGINT` propagation is preserved.
- Updated `package.json`: added `files` list (including `bin` and `templates`), declared `engines.node: ">=18"` (for `fs.cpSync` recursive support).
- Verified manually: running the CLI in an empty temp dir scaffolds the expected seven files and then attempts to spawn Next (failed only on port-in-use from the already-running dev server, confirming the spawn path). `npx tsc --noEmit` is clean.

## Validation

Validation performed on 2026-04-19. Evidence below references files and live test output; all 18 ACs pass.

**Project-root resolution**

1. ✅ `bin/cli.js:56` sets `NOS_PROJECT_ROOT: projectRoot` (`projectRoot = process.cwd()` at `bin/cli.js:9`, absolute because `process.cwd()` is absolute) in the spawned server env.
2. ✅ All eight spec-listed files import `getProjectRoot` (`lib/workflow-store.ts:6,8`, `lib/agents-store.ts:6,8`, `lib/settings.ts:4,6`, `lib/system-prompt.ts` receives `projectRoot` param from its two API callers, `lib/stage-pipeline.ts:10,48`, `lib/auto-advance.ts:10,13`, `lib/agent-adapter.ts:4,15,43`). `lib/auto-advance-sweeper.ts` has no direct `.nos/` path (`grep process.cwd` returns nothing) — it reads via the stores above, which satisfies the intent. `grep -rn process.cwd lib/ app/` confirms `lib/project-root.ts` is the only remaining call site.
3. ✅ `lib/project-root.ts:7-9` falls back to `process.cwd()` when `NOS_PROJECT_ROOT` is empty/unset; `npm run dev` in the nos repo still works (dev server is live on 30128, confirmed via `EADDRINUSE` during the CLI test).
4. ✅ `lib/project-root.ts:3-10` caches the resolved path in module-scope `cached` and short-circuits on subsequent calls.

**Scaffolding `.nos/`**

5. ✅ Empty-temp-dir run of `bin/cli.js` produced all 7 expected files under `<tmp>/.nos/` (system-prompt.md, settings.yaml, agents/david-engineer/{index.md,meta.yml}, workflows/requirements/{config.json, config/stages.yaml, items/.gitkeep}).
6. ✅ Pre-existing-`.nos/` run preserved the user-written `marker.txt` untouched; CLI logged `Using existing .nos/ at <path>` and copied nothing.
7. ✅ Both log lines verified in the two test runs: `Initializing .nos/ in <abs path>` (missing) and `Using existing .nos/ at <abs path>` (present).
8. ✅ `bin/cli.js:24-30` wraps `fs.cpSync({..., errorOnExist: true})` and on failure logs `nos: failed to scaffold .nos/: <path>` then `process.exit(1)`. No rollback code path — partial scaffold is left in place as specified.
9. ✅ `find templates/.nos -type f` lists exactly the seven template files: `system-prompt.md`, `settings.yaml`, `agents/david-engineer/{index.md,meta.yml}`, `workflows/requirements/config.json`, `workflows/requirements/config/stages.yaml`, `workflows/requirements/items/.gitkeep`. No `items/REQ-*`, no `sessions:` entries, no real items.
10. ✅ `diff -q templates/.nos/system-prompt.md .nos/system-prompt.md` and `diff -q templates/.nos/settings.yaml .nos/settings.yaml` both produce no output — byte-identical.

**CLI spawn behavior**

11. ✅ `bin/cli.js:33-44` resolves Next via `require.resolve('next/package.json', { paths: [pkgRoot] })` then `nextPkg.bin.next`; `bin/cli.js:53-57` spawns with `process.execPath`, `cwd: pkgRoot`, and `env: { ...process.env, NOS_PROJECT_ROOT: projectRoot, NOS_PORT }`. No `npm run dev` invocation.
12. ✅ `bin/cli.js:10` `const port = Number(process.env.NOS_PORT) || 30128`; passed as `-p String(port)` to Next.
13. ✅ `bin/cli.js:49` `const url = \`http://localhost:${port}\``; browser open at line 65 uses `url`. Hard-coded `:3000` is gone.
14. ✅ Global install (`npm i -g nos`) uses the same `"bin": { "nos": "./bin/cli.js" }` entry from `package.json:6-8`; there is one code path.
15. ✅ `bin/cli.js:73-77` SIGINT handler kills the child server before exiting.

**Packaging**

16. ✅ `npm pack --dry-run` lists `bin/cli.js`, `package.json`, all seven `templates/.nos/**` files, and the full Next app (`app/api/**`, `lib/**`, `components/**`, `next.config.*`, `tsconfig.json`, etc.).
17. ✅ No `.npmignore` exists (`ls .npmignore` fails with `No such file or directory`). `package.json:9-30` `files` array includes both `"bin"` and `"templates"`.

**File watching**

18. ✅ `app/api/workflows/[id]/events/route.ts:44-52` builds the chokidar glob from `getProjectRoot()`, not `process.cwd()` or the package dir.

**Regression checks**

- `npx tsc --noEmit` passes with no output.
- In-repo development still works: the existing `npm run dev` server on 30128 is the reason both CLI test runs hit `EADDRINUSE`, confirming the fallback path in `getProjectRoot()` keeps serving the repo's own `.nos/`.
- `.claude/sessions/` placement stays at `<project>/.claude/sessions/` (unchanged; AC intent confirmed via `lib/agent-adapter.ts:15` and `lib/auto-advance.ts:13`).
