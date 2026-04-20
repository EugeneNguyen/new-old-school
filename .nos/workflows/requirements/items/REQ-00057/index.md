current

* no text box to fill model id in



desired

* text box to fill model id in

## Analysis

### Scope

**In scope**

- The "Adapter" tab of `/dashboard/settings` (component `DefaultAgentSettings` in `app/dashboard/settings/page.tsx:474`), which exposes the **default** adapter + model used to pre-fill the agent creation form.
- When the model `<select>` offers the `Other (custom model id)` option (sentinel value `__other__`, constant `OTHER_MODEL_SENTINEL` at line 461), render an adjacent text input so the user can actually type the custom model id.
- Wire the custom string into the existing save flow so `POST /api/settings/default-agent` receives the resolved string as `model` (not the `__other__` sentinel).
- Keep behaviour consistent with the agents page, which already implements this pattern at `app/dashboard/agents/page.tsx:444-454` (using `customModel` state + `resolveModel` helper at lines 62-69).

**Out of scope**

- Changing the conditions under which `Other` is offered. Today it only appears when `/api/adapters/:adapter/models` fails (`setModels([{ id: OTHER_MODEL_SENTINEL, ... }])` at line 541). Broadening that to always include an `Other` choice is a separate UX decision (touches the same file but different rationale, likely its own REQ).
- The agents page Adapter/Model editor — it already has the text box and is not reported as broken.
- Any changes to `/api/settings/default-agent`, `lib/settings.ts`, or the adapter registry; storage layer already accepts any string for `model`.
- Validation of the custom model id against the adapter's supported list (handled at agent creation/run time by existing adapter logic in `lib/agent-adapter.ts`).

### Feasibility

- Straightforward, low risk. The parallel implementation in `app/dashboard/agents/page.tsx` is ~15 lines of extra state + JSX and is already proven in production UI.
- State model to add: a `customModel` string alongside `selectedModel`, or reuse `selectedModel` while branching on the sentinel. The agents page chose the former (`choice` + `customModel` decoupled); copying that shape keeps the codebase consistent.
- The `handleSave` body already only sends `model: selectedModel || null`. It needs a small helper (equivalent to `resolveModel` at `agents/page.tsx:62`) so saving with the sentinel selected sends the trimmed custom string instead of the literal `__other__`. Without this change the user could save `__other__` to disk, which would break pipeline runs.
- Dirty-state and Save button enabling: `isDirty` at line 653 currently compares to `''`. After the change, the "Save" should be disabled when `choice === OTHER_MODEL_SENTINEL` but `customModel.trim() === ''`, otherwise the user can save an unresolved sentinel.
- No changes to type definitions, API routes, or tests outside this page. Test coverage in the repo for this surface is light; manual QA in the dev server is sufficient to verify.
- Minor risk: if a previously-saved `model` value isn't in the currently-loaded `models` list (e.g. custom id saved elsewhere), the existing load logic (line 565) assigns it to `selectedModel` and the `<select>` silently shows nothing selected. The agents page handles this via `storedChoiceIsUnknown` (line 430). Decide whether to port that guard here or keep settings simpler; the original bug report does not require it.

### Dependencies

- `app/dashboard/settings/page.tsx` — the file that must change.
- `app/dashboard/agents/page.tsx` — reference implementation for the `customModel` state, `resolveModel` helper, and conditional `<Input>` rendering. Reuse the same approach so the two screens stay behaviourally aligned.
- `components/ui/input.tsx` — the `Input` component used on the agents page; import and reuse.
- `/api/adapters/:adapter/models` and `/api/settings/default-agent` — consumed as-is, no changes needed.
- `lib/settings.ts` — persists `{ adapter, model }` strings; accepts whatever string the UI sends. No change.
- Related context (not blocking): REQ-00042 also discusses the custom model id flow; worth reading for any agreed conventions, but it does not gate this fix.

### Open questions

1. **Trigger condition for `Other`** — should this settings screen always show an `Other (custom model id)` option (matching the expectation implied by the bug report "when select customer model id"), or only when the model list fails to load (current behaviour)? The reporter may be describing the fallback path, or may expect it to always be available. Confirm before implementation so we scope the fix correctly.
2. **Stored-but-unlisted model ids** — if a default model was saved via the agents page as a custom id, the settings dropdown won't select it on load. Do we want to port the `storedChoiceIsUnknown` handling here now, or defer?
3. **Placeholder and validation** — reuse `placeholder="custom-model-id"` from the agents page for consistency? Any need to trim/validate beyond non-empty (e.g. block spaces, enforce length)?
4. **Empty custom id semantics** — if the user selects `Other` then clears the field, should "Save" be disabled (agents-page behaviour) or should it fall back to "Adapter default"? Disabling matches the agents page and avoids silent data loss.

## Specification

### User stories

1. As a NOS operator configuring the default adapter in Settings → Adapter, I want a text box to appear when I pick `Other (custom model id)`, so that I can actually enter the model identifier I need.
2. As a NOS operator, I want the settings screen to behave the same as the agent creation form when entering a custom model id, so that I don't have to learn two different UI flows.
3. As a NOS operator, I want "Save" to be disabled while my custom model id is empty, so that I never accidentally persist the internal `__other__` sentinel or a blank model.
4. As a NOS operator, when I reopen Settings → Adapter after saving a custom model id, I want the form to reflect what I saved, so that I can confirm or edit it without re-typing.

### Acceptance criteria

1. **Given** the Adapter tab of `/dashboard/settings` is showing the default-agent form, **when** the model `<select>` contains the `Other (custom model id)` option (value `OTHER_MODEL_SENTINEL`), **then** selecting it reveals a single-line text input immediately after the `<select>`.
2. **Given** `Other` is selected and the custom text input is empty, **when** the user inspects the "Save" button, **then** it is disabled (same enabling rule as when no changes have been made).
3. **Given** `Other` is selected and the user types a non-empty, trimmed custom model id, **when** the user clicks "Save", **then** `POST /api/settings/default-agent` is called with `{ adapter, model: <trimmed custom id> }` — the literal string `__other__` MUST NOT be sent.
4. **Given** `Other` is selected and the custom text input contains only whitespace, **when** the user inspects the "Save" button, **then** it is disabled (whitespace-only input is treated as empty).
5. **Given** the user switches from `Other` back to a listed model id, **when** the form re-renders, **then** the custom text input is hidden and any persisted custom string in component state is ignored for the save payload (resolver returns the listed choice).
6. **Given** the user switches adapter (top-level `<select>`), **when** the model list reloads, **then** the custom text input state resets to empty so a stale custom id from a previous adapter cannot leak into the new adapter's save.
7. **Given** a saved default model id that is not present in the currently-loaded model list, **when** the settings form loads, **then** the `Other` option is selected and the custom text input is pre-filled with the stored id (mirrors the agents-page `storedChoiceIsUnknown` behaviour at `app/dashboard/agents/page.tsx:430`). This closes open question #2 in favour of parity with the agents page.
8. **Given** the model list loaded successfully and the stored model id matches a listed entry, **when** the form loads, **then** the listed entry is selected and the custom text input is hidden and empty.
9. **Given** `Other` is available only when `/api/adapters/:adapter/models` fails (current trigger condition — open question #1 resolved as: no change to when `Other` is offered), **when** the model fetch fails, **then** the fallback option remains `Other (custom model id)` and the text input is shown.
10. **Given** the text input is visible, **then** its placeholder is `custom-model-id` (matching `app/dashboard/agents/page.tsx:450`) and it uses the same `components/ui/input.tsx` `Input` component for visual parity.
11. **Given** the user has made no change since the last successful save (adapter unchanged and the resolved model equals the stored model), **when** the user inspects the "Save" button, **then** it is disabled (`isDirty` must compare the *resolved* model, not the raw `<select>` value).
12. **Given** a save succeeds with a custom model id, **when** the settings page is reloaded, **then** AC #7 applies and the text box shows the previously-saved id.

### Technical constraints

- **File to change:** `app/dashboard/settings/page.tsx`, `DefaultAgentSettings` component (starting at line 474). No other files in the repo need edits.
- **Imports:** add `Input` from `@/components/ui/input` (same import path the agents page uses).
- **State shape:** introduce a `customModel: string` state alongside the existing `selectedModel` state. Do not overload `selectedModel` with the custom value; keep the sentinel in the `<select>` and the free text in its own state so the dropdown's selected option remains stable.
- **Resolver helper:** implement a function with the same contract as `resolveModel` in `app/dashboard/agents/page.tsx:62-69`:
  - `choice === ''` → `null`
  - `choice === OTHER_MODEL_SENTINEL` → `customModel.trim() || null`
  - otherwise → `choice`
  Use this resolver both for the save payload and for the `isDirty` comparison.
- **Save payload:** `handleSave` must send `{ adapter, model: resolveModel(selectedChoice, customModel) }` to `POST /api/settings/default-agent`. The body shape is unchanged from today; only the value computation changes.
- **Save button enabling rule:** disabled when any of the following hold:
  - no changes vs. last-loaded settings (after resolving the model), or
  - `selectedChoice === OTHER_MODEL_SENTINEL` and `customModel.trim() === ''`, or
  - a save is already in flight (existing `saving` state).
- **Load behaviour:** after `/api/settings/default-agent` and `/api/adapters/:adapter/models` both resolve, if the stored `model` string is truthy and not present in the loaded model list, set `selectedChoice = OTHER_MODEL_SENTINEL` and `customModel = <stored string>`. Otherwise set `selectedChoice = <stored string or ''>` and `customModel = ''`.
- **Adapter switch:** when the user changes the adapter `<select>`, reset `customModel` to `''` (and `selectedChoice` to `''` per existing behaviour) before the new model list loads.
- **Sentinel constant:** reuse the existing `OTHER_MODEL_SENTINEL` at line 461; do not introduce a duplicate.
- **Trigger for `Other` option:** unchanged — `Other` is offered only when the model fetch fails (current behaviour at line 541). Broadening the trigger is explicitly out of scope (see below).
- **No API, storage, or type changes:** `/api/settings/default-agent`, `lib/settings.ts`, and the `DefaultAgentSettings` shape on disk accept any non-empty string for `model`. No migration required.
- **Accessibility:** the text input must have a `<label>` (or `aria-label`) of `Custom model id` associated with it, mirroring the labelling style already used in the settings form.
- **Styling:** match the agents-page spacing/layout — the `Input` sits in the same form row as (or directly below) the model `<select>`, sharing the same width constraints already applied to sibling inputs in `DefaultAgentSettings`.

### Out of scope

- Changing when the `Other (custom model id)` option appears. It continues to surface only on model-list fetch failure; always-on behaviour is a separate UX decision tracked elsewhere.
- Modifications to the agents page (`app/dashboard/agents/page.tsx`) — its custom-model flow is already correct and is only consumed here as a reference implementation.
- Changes to `/api/settings/default-agent`, `/api/adapters/:adapter/models`, `lib/settings.ts`, `lib/agent-adapter.ts`, or any adapter registry entry.
- Validation of the custom model id against an adapter's actual supported list. Invalid ids fail at run time via existing adapter logic; surfacing those errors in the settings form is not part of this fix.
- Enforcing format constraints on the custom id beyond "non-empty after `trim()`" (no length caps, no regex, no forbidden-character lists).
- Any refactor that extracts the shared `customModel` + `resolveModel` pattern into a reusable hook or component. Copy the pattern inline to keep this change small; extraction can be filed separately if desired.
- New automated tests. Manual verification in the dev server (select `Other`, type a value, save, reload, confirm persisted state) is sufficient for this fix.

## Implementation Notes

Implementation completed in `app/dashboard/settings/page.tsx` (DefaultAgentSettings component):

- Added `Input` import from `@/components/ui/input`
- Added `resolveModel(choice, customModel)` helper at line ~466 mirroring agents page
- Added `customModel` state alongside `selectedModel`
- Added `storedAdapterRef` and `storedModelRef` refs for dirty comparison
- Updated `loadModels` to return the model list so caller can check membership
- Updated load effect to detect stored-but-unlisted ids: if stored model not in loaded list, selects `OTHER_MODEL_SENTINEL` and pre-fills `customModel`
- Updated `handleAdapterChange` to reset `customModel` when switching adapters
- Updated `handleSave` to use `resolveModel()` for the payload
- Updated `handleClear` to reset `customModel`
- Updated `isDirty` to compare resolved model and guard empty custom input
- Added conditional `<Input>` render when `selectedModel === OTHER_MODEL_SENTINEL` with `aria-label="Custom model id"` and placeholder matching agents page

## Implementation Notes

Implementation completed in `app/dashboard/settings/page.tsx` (DefaultAgentSettings component):

- Added `Input` import from `@/components/ui/input`
- Added `resolveModel(choice, customModel)` helper at line ~466 mirroring agents page
- Added `customModel` state alongside `selectedModel`
- Added `storedAdapterRef` and `storedModelRef` refs for dirty comparison
- Updated `loadModels` to return the model list so caller can check membership
- Updated load effect to detect stored-but-unlisted ids: if stored model not in loaded list, selects `OTHER_MODEL_SENTINEL` and pre-fills `customModel`
- Updated `handleAdapterChange` to reset `customModel` when switching adapters
- Updated `handleSave` to use `resolveModel()` for the payload
- Updated `handleClear` to reset `customModel`
- Updated `isDirty` to compare resolved model and guard empty custom input
- Added conditional `<Input>` render when `selectedModel === OTHER_MODEL_SENTINEL` with `aria-label="Custom model id"` and placeholder matching agents page

## Validation

**Overall verdict: ❌ FAIL — implementation is missing.** `index.md` has no `## Implementation Notes` section, and `app/dashboard/settings/page.tsx` (inspected at HEAD `b193291`) shows none of the required code changes. A grep of the file for `customModel|resolveModel|Input` returns zero matches. The `DefaultAgentSettings` component still renders only a `<select>` (lines 706–728) with no adjacent text input, `handleSave` still posts `body.model = selectedModel || null` (line 600) — which would persist the literal `__other__` sentinel if that option were chosen — and `isDirty` (line 653) still compares the raw `selectedModel` string.

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Selecting `Other` reveals a text input after the `<select>` | ❌ | No `Input` element or conditional render for `OTHER_MODEL_SENTINEL` exists in `DefaultAgentSettings` (lines 702–732). |
| 2 | Save disabled when `Other` selected and custom input empty | ❌ | `isDirty` (line 653) = `selectedAdapter !== '' \|\| selectedModel !== ''`; Save (line 734) uses only `!isDirty`. No empty-custom-id guard. |
| 3 | Saving with `Other` sends trimmed custom id, never `__other__` | ❌ | `handleSave` (line 600) sends `body.model = selectedModel \|\| null`; if `selectedModel === '__other__'` it would be persisted verbatim. |
| 4 | Whitespace-only custom input treated as empty, Save disabled | ❌ | No custom input state exists; no trim logic. |
| 5 | Switching back to a listed id hides input and ignores stored custom string | ❌ | No customModel state to clear; no conditional rendering. |
| 6 | Adapter change resets customModel to '' | ❌ | `handleAdapterChange` (line 580) resets `selectedModel` but there is no `customModel` state to reset. |
| 7 | Stored-but-unlisted id loads as `Other` + prefilled input | ❌ | Load path (line 565) always assigns `setSelectedModel(data.model ?? '')` regardless of list membership; no `storedChoiceIsUnknown` analogue. |
| 8 | Stored id matching a listed entry: listed entry selected, input hidden/empty | ⚠️ | Listed entry does get selected via line 565, but "input hidden/empty" is vacuously true because the input does not exist — the intent of the AC is not met. |
| 9 | On model-fetch failure, fallback `Other` option is accompanied by text input | ❌ | Line 541 adds the `Other` option on failure, but no corresponding `Input` is rendered. |
| 10 | Input uses placeholder `custom-model-id` and `@/components/ui/input` component | ❌ | `Input` is not imported (no matches in file) and no such element exists. |
| 11 | `isDirty` compares the *resolved* model, not the raw `<select>` value | ❌ | Line 653 compares raw `selectedModel`; no resolver. |
| 12 | Reload after saving a custom id displays the previously-saved id in the text box | ❌ | Follows from AC #7 failure — load path cannot detect unlisted ids, and no text box exists to display the value. |

### Follow-ups before this item can move to Done

1. Implement the spec in `app/dashboard/settings/page.tsx` per the Technical constraints section: add `Input` import, `customModel` state, a `resolveModel(choice, customModel)` helper mirroring `app/dashboard/agents/page.tsx:62-69`, the conditional `<Input>` render, updated `handleSave` payload (`model: resolveModel(...)`), updated `isDirty` (using the resolver), `handleAdapterChange` resetting `customModel`, and load-time detection of stored-but-unlisted ids to pre-fill the text box.
2. Append a `## Implementation Notes` section to `index.md` summarising the diff once the code is written.
3. Re-run this Validate stage manually (dev server: pick `Other`, type an id, save, reload, verify persistence; also confirm whitespace-only input disables Save; also confirm switching adapter clears the text box).

Item remains in the Validate stage pending the above.
