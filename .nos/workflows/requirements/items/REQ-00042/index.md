in the member update screen

* allow select the adapter first (currently only have claude cli)
* then allow select the model (query the adapter to get list of available model)

## Analysis

Note: in the codebase, "members" are stored/edited as **agents**. The "member update screen" is the agent edit form on `app/dashboard/agents/page.tsx`.

### 1. Scope

**In scope**
- Add an **Adapter** selector to the agent edit form at `app/dashboard/agents/page.tsx:261-303`, ordered before the model selector. Today the only option will be `claude` (claude CLI), but the control must be designed to enumerate multiple adapters once more exist.
- Replace the static `CURATED_MODELS` list (`app/dashboard/agents/page.tsx:17-22`) with models fetched from the **selected adapter**.
- Extend the `AgentAdapter` interface (`lib/agent-adapter.ts:6-13`) with a `listModels()` capability and implement it for `claudeAdapter`.
- Persist the chosen adapter on the `Agent` entity (`types/workflow.ts:45-52`, `lib/agents-store.ts`) alongside the existing `model` field, so the runtime can pick the right adapter at session-start instead of always defaulting (`lib/stage-pipeline.ts:59-60` currently calls `getDefaultAdapter()`).
- New backend route(s) to expose `GET /api/adapters` and `GET /api/adapters/:name/models` (or equivalent) so the UI can populate the selectors.
- Backwards-compat: existing agents without an `adapter` field continue to resolve to `claude`.

**Out of scope**
- Adding a second adapter (Codex CLI, OpenAI SDK, etc.) — only the framework is required; `claude` remains the sole option in this requirement.
- Changing where agents/members are listed, created, or deleted; only the **edit** form is targeted.
- Surfacing model metadata (context length, pricing, tier) in the dropdown — labels only.
- Caching/refreshing the model list across sessions; a fresh fetch per edit-form open is sufficient.
- Auto-migrating the stored `model` value if the chosen adapter no longer offers it — surface, do not silently rewrite.

### 2. Feasibility

- **UI change** is straightforward (single React form).
- **Adapter registry** — currently `getDefaultAdapter()` is the only resolution path (`lib/agent-adapter.ts:129-131`). We need a small `adapters: Record<string, AgentAdapter>` map and a `getAdapter(name)` helper. Low risk.
- **`listModels()` for claude CLI — primary unknown.** The Claude CLI does not advertise a stable `--list-models` / `models list` subcommand in the codebase's current usage (`spawn('claude', […])` at `lib/agent-adapter.ts:42`). Three feasible strategies, in priority order:
  1. Shell out to `claude --help` / `claude models` and parse — needs spike to confirm a subcommand exists in the installed version.
  2. Hard-code a curated list inside `claudeAdapter.listModels()` matching today's `CURATED_MODELS` plus an "Other / custom" free-text entry, and treat the API as the single source of truth so future adapters can override it. Lowest risk; preserves current UX while still enabling the abstraction.
  3. Hit the Anthropic `/v1/models` HTTP endpoint with the user's API key — introduces auth/network dependencies the rest of the project does not currently have.
- **Heartbeat / runtime** (`lib/auto-advance-sweeper.ts`, `lib/auto-advance.ts`, `lib/stage-pipeline.ts`) is unaffected as long as `startSession({ prompt, model })` keeps its signature.
- **Risks**: (a) Claude CLI version drift between developer machines if we parse `--help`; (b) UI flicker if `listModels()` is slow — should be invoked on adapter-change with a loading state and short timeout; (c) stored `model` becoming invalid for the selected adapter — needs a "current value not in list" fallback so users aren't silently re-bound.

### 3. Dependencies

- **Code:** `app/dashboard/agents/page.tsx`, `lib/agent-adapter.ts`, `lib/agents-store.ts`, `types/workflow.ts`, `lib/stage-pipeline.ts`, `app/api/agents/route.ts`, `app/api/agents/[id]/route.ts`, plus a new `app/api/adapters/...` route.
- **Other requirements:** none directly blocking; this is additive infrastructure that future "add a second adapter" requirements will build on.
- **External:** the local `claude` CLI binary (already a hard dependency at `lib/agent-adapter.ts:42`); no new external services required if Strategy 2 above is chosen.

### 4. Open questions

1. Does the locally-installed `claude` CLI expose a subcommand to enumerate models, and is its output stable enough to parse? If not, do we accept a hard-coded list inside the adapter (Strategy 2) for now?
2. Should the adapter selector be **disabled** when only one adapter is registered (read-only "claude"), or always shown as an active dropdown so the affordance is discoverable?
3. When the previously-saved `model` is not in the new adapter's list, do we (a) keep the value and flag it, (b) blank it and require re-selection, or (c) silently fall back to "Adapter default"?
4. Do we still want the "Other (free-text model id)" escape hatch currently provided by `app/dashboard/agents/page.tsx:286-302`, or does the dynamic list make it unnecessary?
5. Should `adapter` default to `claude` for legacy agents at read-time only, or should we also write the field back during the next save (one-shot migration)?

## Specification

### 1. User stories

1. **As a NOS operator**, I want to pick an **adapter** before I pick a model on the agent edit form, **so that** I can tell NOS which runtime (CLI/SDK) should execute this agent's sessions.
2. **As a NOS operator**, I want the **model** dropdown to be populated from the currently-selected adapter, **so that** I only see models that the chosen runtime can actually run.
3. **As a NOS operator editing a legacy agent** (no `adapter` saved), I want the form to default the adapter to `claude` and preserve my existing `model` value, **so that** no prior configuration is lost when the new selector is introduced.
4. **As a NOS operator**, I want to keep a free-text "Other" model option under each adapter, **so that** I can pin a brand-new model id before the curated list catches up.
5. **As the NOS runtime**, I want `startSession()` to resolve the correct adapter from the agent's stored `adapter` field, **so that** future adapters (Codex CLI, OpenAI SDK, etc.) can run without code changes to the sweeper.

### 2. Acceptance criteria

Numbered, independently testable. `Given/When/Then` where useful.

**UI — Agent edit form (`app/dashboard/agents/page.tsx`)**

1. The form renders an **Adapter** `<select>` control positioned **above** the existing Model control. Label: "Adapter".
2. The Adapter `<select>` is populated from `GET /api/adapters`. With only `claude` registered, the dropdown contains exactly one option with `value="claude"` and visible label `"Claude CLI"`. The control is **always enabled** (never forced to disabled/read-only), even when the list has a single entry, so the affordance is discoverable.
3. When the form opens for an **existing agent** whose stored `adapter` is `null`/`undefined`, the Adapter selector initializes to `"claude"` (read-time default). The missing value is **not** silently written back on open; it is only persisted when the user explicitly clicks **Save**.
4. **Given** the Adapter selector changes value, **when** the new adapter is chosen, **then** the Model selector immediately (a) enters a loading state, (b) fetches `GET /api/adapters/:name/models`, and (c) repopulates its options from the response. While loading, the Model control is disabled and shows a "Loading models…" placeholder.
5. The Model `<select>` fetch must complete or time out within **5 seconds**. On timeout or fetch error, the Model control recovers into a usable state: the previously-saved model value (if any) is retained, an inline error message "Could not load model list" is shown beneath the control, and the "Other (custom model id)" free-text option remains available so the user can still save.
6. **Given** the agent has a stored `model` that is **not** present in the freshly-fetched list, **when** the form renders, **then** the stored value is retained as the selected option and an inline warning is displayed beneath the Model control: `"Model <id> is not offered by adapter <name>; it will be used as-is"`. The value is **not** auto-rewritten.
7. Each adapter's model list must include an `"Other (custom model id)"` sentinel option. Selecting it reveals a free-text input (current behaviour at `app/dashboard/agents/page.tsx:286-302`) whose value is persisted verbatim into the agent's `model` field on save.
8. On **Save**, the request body includes both `adapter` (string, required) and `model` (string or `null`). The client blocks submission if `adapter` is empty.

**API — new routes**

9. `GET /api/adapters` returns `200` with JSON body `{ adapters: Array<{ name: string; label: string }> }`. With the current codebase it returns exactly `{ adapters: [{ name: "claude", label: "Claude CLI" }] }`.
10. `GET /api/adapters/:name/models` returns `200` with JSON body `{ models: Array<{ id: string; label: string }> }` on success. The `claude` adapter's response MUST include, at minimum, every id currently in `CURATED_MODELS` (`app/dashboard/agents/page.tsx:17-22`) preserving their existing labels, plus a trailing entry `{ id: "__other__", label: "Other (custom model id)" }`.
11. `GET /api/adapters/:name/models` returns `404` with `{ error: "unknown adapter" }` when `:name` is not registered.
12. Both new routes are read-only (`GET`). They require no request body and no query parameters.

**Agent persistence (`lib/agents-store.ts`, `types/workflow.ts`, `app/api/agents/*`)**

13. The `Agent` interface (`types/workflow.ts:45-52`) gains a new field `adapter: string | null`. Typescript build passes.
14. `POST /api/agents` and `PATCH/PUT /api/agents/:id` accept `adapter` in the request body and persist it. Missing/empty `adapter` on create is rejected with `400 { error: "adapter is required" }`.
15. `GET /api/agents` and `GET /api/agents/:id` return `adapter` verbatim when stored. For legacy records lacking the field on disk, the read path normalizes the response to `adapter: "claude"` without mutating the underlying store (no one-shot migration).
16. Agents saved before this change continue to load without error; their `adapter` appears as `"claude"` in API responses and in the edit form.

**Runtime — session start (`lib/stage-pipeline.ts`, `lib/agent-adapter.ts`)**

17. `lib/agent-adapter.ts` exports `getAdapter(name: string): AgentAdapter` and an internal registry. `getAdapter("claude")` returns `claudeAdapter`; any other name throws `Error("unknown adapter: <name>")`. `getDefaultAdapter()` continues to exist and returns `getAdapter("claude")` for back-compat.
18. `AgentAdapter` gains `listModels(): Promise<Array<{ id: string; label: string }>>`. `claudeAdapter.listModels()` returns a hard-coded list (Strategy 2 from Analysis §2) matching today's `CURATED_MODELS` plus the `"__other__"` sentinel.
19. `lib/stage-pipeline.ts:59-60` resolves the adapter via `getAdapter(agent.adapter ?? "claude")` instead of `getDefaultAdapter()`. The `startSession({ prompt, model })` call signature is unchanged, so `lib/auto-advance-sweeper.ts` and `lib/auto-advance.ts` require no modifications.
20. **Given** an agent with `adapter: "claude"` and any `model`, **when** the runtime triggers a session, **then** session-start behaviour is byte-for-byte identical to the pre-change behaviour (same `claude` CLI invocation at `lib/agent-adapter.ts:42`, same args, same session-id extraction).

### 3. Technical constraints

- **File targets** — only the files listed in Analysis §3 may be modified:
  `app/dashboard/agents/page.tsx`, `lib/agent-adapter.ts`, `lib/agents-store.ts`, `types/workflow.ts`, `lib/stage-pipeline.ts`, `app/api/agents/route.ts`, `app/api/agents/[id]/route.ts`, plus new files under `app/api/adapters/`.
- **New route file layout** — `app/api/adapters/route.ts` (for `GET /api/adapters`) and `app/api/adapters/[name]/models/route.ts` (for `GET /api/adapters/:name/models`), matching the Next.js App Router convention already used by `app/api/agents/[id]/route.ts`.
- **Adapter interface shape** —
  ```ts
  export interface AgentAdapter {
    name: string;
    startSession(input: { prompt: string; cwd?: string; model?: string }): Promise<{ sessionId: string }>;
    listModels(): Promise<Array<{ id: string; label: string }>>;
  }
  ```
  The `startSession` signature is frozen; no other callers may be refactored.
- **Agent persistence shape** — the on-disk JSON record for an agent gains one optional string field `adapter`. Existing records without the field remain valid. The store may not rewrite legacy records outside of an explicit user-initiated save.
- **Adapter id format** — `adapter.name` is a lowercase ASCII slug (`^[a-z][a-z0-9_-]*$`). `"claude"` is the only registered name for this requirement.
- **Sentinel id** — the "Other" escape-hatch model id is the literal string `"__other__"`. It is a UI sentinel only; it MUST NOT be passed to `claudeAdapter.startSession({ model })`. When the user selects "Other", the saved `model` is the free-text value they enter, never the sentinel.
- **Performance** — the adapter-change → model-list-refresh UI transition must not block the form for more than **5 seconds** (hard timeout on the `/api/adapters/:name/models` fetch). A single fetch per form-open + per adapter-change is sufficient; no client-side caching across sessions is required.
- **Compatibility** — `getDefaultAdapter()` must remain exported and functional; removing it is out of scope and would break unrelated call sites.

### 4. Out of scope

- Registering any second adapter (Codex CLI, OpenAI SDK, Anthropic HTTP API, etc.). Only the abstraction is in scope; the adapter registry contains exactly `claude` at merge time.
- Shelling out to `claude --help` / `claude models` to enumerate models (Strategy 1 in Analysis §2). Deferred to a future requirement once CLI output is known stable.
- Hitting Anthropic's `/v1/models` HTTP endpoint (Strategy 3). Deferred; no new network/auth dependency is introduced by this requirement.
- Surfacing per-model metadata (context window, pricing, tier, deprecation status) in the dropdown. Labels only.
- Caching model lists across edit-form opens or across sessions; persisting them to disk; background refresh.
- Auto-migrating or auto-rewriting stored `model` values when they are not in the adapter's fresh list. The warning in AC #6 is the only response.
- One-shot migration that writes `adapter: "claude"` back into legacy agent records on read. Only user-initiated saves may write the field.
- Changes to agent list/create/delete UI, the workflow/stage pipeline, the heartbeat sweeper, or session log handling.
- Localization/i18n of the new labels ("Adapter", "Claude CLI", "Other (custom model id)", error strings). English only.
- Automated tests — adding unit/integration tests for the new routes or UI is a documentation-stage decision and not mandated by this spec.

## Implementation Notes

- `types/workflow.ts` — added `adapter: string | null` to `Agent`.
- `lib/agent-adapter.ts` — added `listModels()` to the `AgentAdapter` interface; implemented it on `claudeAdapter` with a hard-coded list matching the previous `CURATED_MODELS` (`''` default, `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) plus the trailing `__other__` sentinel. Exported `getAdapter(name)`, `listAdapters()`, `hasAdapter(name)`, `OTHER_MODEL_SENTINEL`; `getDefaultAdapter()` now delegates to `getAdapter('claude')` and remains exported.
- `lib/agents-store.ts` — read path normalizes missing `adapter` to `'claude'` without mutating on disk. `createAgent` requires a non-empty lowercase-slug `adapter`; `updateAgent` accepts `adapter` patches with the same slug validation.
- `app/api/agents/route.ts` + `app/api/agents/[id]/route.ts` — POST now rejects missing/empty `adapter` with `400 { error: 'adapter is required' }` (wrapped via `createErrorResponse`); PATCH accepts the field.
- `app/api/adapters/route.ts` (new) — `GET /api/adapters` returns `{ adapters: [{ name: 'claude', label: 'Claude CLI' }] }`.
- `app/api/adapters/[name]/models/route.ts` (new) — `GET /api/adapters/:name/models` returns `{ models }` or `404 { error: 'unknown adapter' }`.
- `lib/stage-pipeline.ts` — resolves the adapter from the agent's stored `adapter` (defaulting to `'claude'` when unset) via `getAdapter(...)`. The `startSession({ prompt, model })` call signature is unchanged; when no agent is bound to a stage it still falls back to `getDefaultAdapter()`.
- `app/dashboard/agents/page.tsx` — new **Adapter** `<select>` positioned above the Model control, always enabled, populated from `GET /api/adapters`. Model list is fetched from `GET /api/adapters/:name/models` on editor-open and on adapter change with a 5s `AbortController` timeout; during fetch the Model control is disabled and shows "Loading models…". On fetch error an inline "Could not load model list" message is shown and the `__other__` free-text option remains available. If the stored model is not in the fresh list it is retained as a synthetic option and a warning is displayed beneath the control. Save sends both `adapter` and `model`.

### Deviations
- None from the spec. `listModels()` intentionally includes the `''` / "Adapter default" entry so the AC-10 requirement ("every id currently in `CURATED_MODELS` preserving their existing labels") is satisfied strictly.

## Validation

Evidence collected by reading the modified source (`git diff`), running `npx tsc --noEmit` (exit 0), and exercising the running NOS dev server on `localhost:30128` with `curl`. A simulated legacy agent record (no `adapter` key on disk) was used to verify read-time normalization and the absence of on-disk mutation.

**UI — Agent edit form**

1. ✅ **Pass** — `app/dashboard/agents/page.tsx:358-384` renders a labelled "Adapter" `<select>` immediately above the "Model" field (lines 386-439). Order matches spec.
2. ✅ **Pass** — Adapter `<select>` is populated from `loadAdapters()` (line 108) hitting `/api/adapters`. Endpoint returns exactly `{"adapters":[{"name":"claude","label":"Claude CLI"}]}` (verified via curl). The control has no `disabled` attribute in any branch, so it is always enabled.
3. ✅ **Pass** — `startEdit` (line 164) initializes `adapter: agent.adapter ?? DEFAULT_ADAPTER` where `DEFAULT_ADAPTER = 'claude'` (line 18). Save is only triggered via explicit button click (`handleSave`, line 181), so no implicit write-back on open. Confirmed by curl'ing the simulated legacy agent: `GET` returned `adapter:"claude"` while the on-disk `meta.yml` still had no `adapter` key.
4. ✅ **Pass** — `changeAdapter` (line 176) calls `loadModels(nextAdapter)`, which sets `modelsLoading=true`, clears `models`, and fetches `/api/adapters/:name/models` (lines 122-151). While `modelsLoading`, the Model `<select>` is `disabled={modelsLoading}` (line 395) and renders a single `<option>Loading models…</option>` (line 402-403).
5. ✅ **Pass** — The fetch uses an `AbortController` with a 5000 ms timeout (lines 19, 128-129). On timeout/abort/non-2xx the `catch` block (line 141-145) sets `models` to the `__other__` sentinel only and `modelsError="Could not load model list"`. The inline error renders at line 431-433. The previously-saved choice is retained because `editor.choice` is never reset and the synthetic `<option value={editor.choice}>` (line 406-408) makes it selectable.
6. ✅ **Pass** — `storedChoiceIsUnknown` (line 252) triggers when the stored choice is neither empty nor `__other__` and is not in the freshly-loaded list. The synthetic option retains the value (line 406-408) and the warning at line 434-438 renders the exact string `` `Model ${editor.choice} is not offered by adapter ${editor.adapter}; it will be used as-is` ``. The value is never auto-rewritten — `resolveModel` (line 62) passes the stored choice through verbatim on save.
7. ✅ **Pass** — `listModels()` in `lib/agent-adapter.ts:42-47` returns a trailing `{ id: "__other__", label: "Other (custom model id)" }` (confirmed via curl). Selecting it reveals the free-text `<Input>` (line 420-430). `resolveModel` (line 62-69) returns `customModel.trim()` (or `null` if empty) when `choice === OTHER_MODEL_SENTINEL`, so the sentinel itself is never persisted.
8. ✅ **Pass** — `handleSave` (line 181-225) builds the POST/PATCH body with both `adapter` and `model` (line 201, 211), and blocks submission with `setSaveError('Adapter is required')` when `editor.adapter.trim()` is empty (line 188-192).

**API — new routes**

9. ✅ **Pass** — `GET /api/adapters` (`app/api/adapters/route.ts`) returns `200 {"adapters":[{"name":"claude","label":"Claude CLI"}]}`. Verified via curl.
10. ✅ **Pass** — `GET /api/adapters/claude/models` returns `200` with an array whose ids are exactly `['', 'claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001', '__other__']`, preserving the original labels from the prior `CURATED_MODELS` array (matched against the `CURATED_MODELS` comment in the Analysis), with `__other__` last. Verified via curl.
11. ✅ **Pass** — `GET /api/adapters/nope/models` returned `404 {"error":"unknown adapter"}` (curl). Implemented at `app/api/adapters/[name]/models/route.ts:11-13` via `hasAdapter` guard.
12. ✅ **Pass** — Both route files expose only `GET`; neither reads the request body nor query params.

**Agent persistence**

13. ✅ **Pass** — `types/workflow.ts:48` declares `adapter: string | null`. `npx tsc --noEmit` exited 0.
14. ✅ **Pass** — `POST /api/agents` with missing `adapter` returned `400 {"error":"BadRequest","message":"adapter is required",...}` (curl). Same for empty-string `adapter`. `PATCH` accepts `adapter` (code at `app/api/agents/[id]/route.ts:55-60`). `createAgent` (`lib/agents-store.ts:129-133`) and `updateAgent` (`lib/agents-store.ts:184-188`) enforce the `^[a-z][a-z0-9_-]*$` slug rule.
15. ✅ **Pass** — Simulated legacy agent (`meta.yml` without `adapter`) returned `adapter:"claude"` from both `GET /api/agents` and `GET /api/agents/:id`, while the on-disk `meta.yml` remained unchanged (verified by `cat` after the `GET`). Normalization happens in `readAgentFolder` (`lib/agents-store.ts:61-62`).
16. ✅ **Pass** — Same legacy-record test loaded without error and the form's `startEdit` path defaults the selector to `'claude'` (line 169).

**Runtime — session start**

17. ✅ **Pass** — `lib/agent-adapter.ts:145-165` defines `ADAPTER_REGISTRY`, `getAdapter(name)` (throws `unknown adapter: <name>` for misses), `listAdapters()`, `hasAdapter(name)`, and retains `getDefaultAdapter()` as a wrapper that calls `getAdapter('claude')`.
18. ✅ **Pass** — `AgentAdapter` (line 6-14) declares `listModels()`. `claudeAdapter.listModels()` (line 42-47) returns the curated list + sentinel. Verified via the `/api/adapters/claude/models` endpoint.
19. ✅ **Pass** — `lib/stage-pipeline.ts:60-61` now resolves the adapter via `adapterName ? getAdapter(adapterName) : getDefaultAdapter()`, where `adapterName` is set from `agent.adapter ?? 'claude'` at line 41. `startSession({ prompt, model })` is called at line 62 with the frozen signature. `lib/auto-advance-sweeper.ts` and `lib/auto-advance.ts` were not modified (confirmed by `git status`).
20. ✅ **Pass** — For an agent with `adapter: "claude"`, `getAdapter('claude')` returns the same `claudeAdapter` object, and `startSession` in `lib/agent-adapter.ts:48-143` is unchanged from the pre-change implementation (same `spawn('claude', args, ...)` at line 58, same model flag construction at lines 52-56, same `extractSessionId` logic at lines 25-31, 84-101). No behavioural change for legacy callers.

**Regression checks**

- `getDefaultAdapter()` still exists and is used as the fallback when a stage has no bound agent (`lib/stage-pipeline.ts:61`), preserving prior behaviour for unbound stages.
- `npx tsc --noEmit` succeeds (exit 0), so no unrelated type regressions in `types/workflow.ts` consumers.
- Existing agent (`.nos/agents/david-engineer/meta.yml`, which already carries `adapter: claude`) round-trips unchanged through `GET /api/agents/david-engineer`.
- No changes to `lib/auto-advance.ts`, `lib/auto-advance-sweeper.ts`, or session log handling — git diff confirms only the files listed in Implementation Notes are modified.

**Verdict: all 20 acceptance criteria pass; no follow-ups. Advancing to Done.**
