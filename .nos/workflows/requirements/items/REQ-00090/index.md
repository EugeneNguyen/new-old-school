Error

```txt
Launching nos...
⨯ Failed to start server
Error: listen EADDRINUSE: address already in use :::30128
    at <unknown> (Error: listen EADDRINUSE: address already in use :::30128)
    at new Promise (<anonymous>) {
  code: 'EADDRINUSE',
  errno: -48,
  syscall: 'listen',
  address: '::',
  port: 30128
}
```

When run the nos init, don't need to start web server, just run the init. similar to nos update

## Analysis

### 1. Scope

**In scope:**

- Fix `nos init` so it performs scaffolding only and exits — no web server startup, no port binding.
- Align `nos init` behavior with `nos update`, which already exits cleanly without starting a server.
- Address the root cause: the legacy `bin/cli.js` (CommonJS entry point) unconditionally starts the Next.js dev server on line 53, regardless of the command passed. It has no command dispatch at all — it always calls `ensureNosDir()` then `spawn(nextBin, 'dev', ...)`. This is the file producing the `"Launching nos..."` message and the `EADDRINUSE` error.

**Out of scope:**

- Changing the default port (30128) or adding port-conflict recovery.
- Modifying `nos update` — it already works correctly via `cli.mjs`.
- Refactoring the TUI or detached server management.

### 2. Feasibility

**Technical viability: Straightforward.**

The modern entry point `bin/cli.mjs` (ESM) already handles `init` correctly — it dispatches to `handleInit()` at line 440, which calls the scaffolding module and exits via `process.exit()` without touching the server. The bug only manifests when the *old* `bin/cli.js` (CJS) is the resolved entry point.

Two possible fixes:

1. **Remove `bin/cli.js` entirely.** The `package.json` `"bin"` field already points to `./bin/cli.mjs`. The CJS file is a legacy leftover. If no external consumer depends on it, deleting it is the cleanest fix.
2. **Add command dispatch to `bin/cli.js`.** Mirror the `cli.mjs` command routing so `init` and `update` short-circuit before server startup. This is a fallback if the CJS entry must be preserved for backward compatibility.

**Risks:**

- Users who installed or linked an older version of the package may have `npx` or a global install cached pointing at `cli.js`. After removing it, they'd need to clear their npx cache or reinstall.
- If `cli.js` is referenced from any other script, CI config, or documentation, those references must be updated.

### 3. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| `bin/cli.js` | Internal (legacy) | The file producing the bug — unconditionally starts the server |
| `bin/cli.mjs` | Internal (current) | Already has correct `init` dispatch at lines 440-442 |
| `lib/scaffolding.mjs` | Internal | The actual init logic — works correctly, no changes needed |
| `package.json` `"bin"` field | Config | Already points to `cli.mjs` — no change needed |
| `npx` / npm cache | External | Users may have a cached resolution pointing to the old `cli.js` |

### 4. Open Questions

1. **Can `bin/cli.js` be deleted outright?** Is anything outside `package.json` `"bin"` referencing it (CI scripts, documentation, other packages)? A codebase grep for `cli.js` references is needed before removal.
2. **Is the user running a locally-linked or globally-installed copy?** The `package.json` `"bin"` already points to `cli.mjs`, so `npx nos init` *should* resolve to the correct file. The bug may only reproduce with a stale npx cache or a global install from before the `cli.mjs` migration.
3. **Should `cli.js` be kept as a thin redirect?** E.g., `require('./cli.mjs')` or just `exec` forwarding — to avoid breaking anyone who hardcodes the `.js` path.

## Specification

### User Stories

1. As a **developer setting up NOS in a new project**, I want `npx nos init` to scaffold the `.nos/` workspace directory and exit cleanly, so that I can initialize NOS without encountering port conflicts or unexpected server startup.

2. As a **CLI user familiar with `nos update`**, I want `nos init` to behave consistently — performing its task and exiting immediately — so that command behavior is predictable across the NOS toolchain.

### Acceptance Criteria

1. **Command Execution**: `npx nos init [target-dir]` completes successfully and exits with code 0; no web server process is spawned or running on port 30128 after completion.

2. **No Port Binding**: Running `lsof -i :30128` after `npx nos init` exits shows no `nos` or Node.js process bound to the port.

3. **No Server Messages**: The output does not contain `"Launching nos..."`, `"Failed to start server"`, or `EADDRINUSE` error messages.

4. **Scaffolding Completes**: The `.nos/` directory structure is created with all required files (`config.json`, `config/stages.yaml`, `system-prompt.md`) in the target workspace.

5. **No Regression**: `npx nos` (without arguments) continues to launch the Next.js dev server on port 30128 and display the dashboard UI.

6. **Update Behavior Unchanged**: `npx nos update` continues to function as currently implemented — scaffolding template updates and exiting cleanly.

### Technical Constraints

- **CLI Entry Point** (per `docs/standards/wbs-dictionary.md` 1.7.1): `package.json` `"bin"` field must point to `./bin/cli.mjs` (ESM entry point) as the primary resolved command. The legacy `bin/cli.js` (CommonJS) must not be the fallback or alternative entry point.

- **Workspace Scaffolding** (per `docs/standards/wbs-dictionary.md` 1.7.4): Scaffolding logic is implemented in `lib/scaffolding.mjs` and must be called via `handleInit()` dispatch in `bin/cli.mjs` at lines 440–442, which exits via `process.exit(code)` without touching the server.

- **No Command Dispatch in Legacy CJS**: `bin/cli.js` has no command routing logic and unconditionally calls `spawn(nextBin, 'dev', ...)` on line 53. This file must either be removed or rewritten to include command dispatch mirroring `cli.mjs`.

- **Template Management** (per `docs/standards/wbs-dictionary.md` 1.7.5): Templates are resolved via `getNosTemplatesRoot()` and enumerated relative to the CLI install path; the scaffolding module must respect `NOS_TEMPLATES_ROOT` environment variable if set.

### Out of Scope

- Changing the default dev server port (30128) or implementing port auto-discovery / conflict recovery.
- Refactoring the TUI (Terminal User Interface) or detached server management architecture.
- Modifying `nos update` — it already works correctly via the `cli.mjs` dispatch at line 443.

### RTM Entry

| Req ID | Title | Source | Design Artifact | Implementation File(s) | Test Coverage | Status |
|--------|-------|--------|-----------------|----------------------|---------------|--------|
| REQ-00090 | Fix `npx nos init` EADDRINUSE error | User issue report | wbs-dictionary.md (1.7.1, 1.7.4), glossary.md (Workspace Scaffolding, Adapter) | `bin/cli.mjs`, `bin/cli.js` (remove or update), `lib/scaffolding.mjs` | `lib/scaffolding.test.ts` (init/update scenarios) | In Progress |

### WBS Mapping

This requirement spans **two WBS packages** per `docs/standards/wbs.md`:

1. **1.7.1 CLI Entry Point** — Ensures `bin/cli.mjs` is the only resolved entry point and handles `init` command dispatch before server startup.
   - Deliverable affected: Next.js/CLI package; `package.json` `"bin"` field validity and fallback behavior.

2. **1.7.4 Workspace Scaffolding** — Ensures `handleInit()` in `cli.mjs` invokes the scaffolding module (already correct) and exits cleanly without server startup.
   - Deliverable affected: Scaffolding initialization behavior; template resolution and `.nos/` directory creation.
