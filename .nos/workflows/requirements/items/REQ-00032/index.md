in setting screen



* \- current: heart beat timing setting in minute
* \- desired: setting in second

## Analysis

### Scope

**In scope**
- Change the auto-advance heartbeat input on `app/dashboard/settings/page.tsx` (the "Auto-advance heartbeat" card) from minutes to seconds:
  - Label: "Interval (minutes)" → "Interval (seconds)".
  - State/var names (`heartbeatMinutes`, `initialHeartbeatMinutes`, `parsedMinutes`) renamed to the seconds equivalents.
  - GET load: convert stored `intervalMs` → seconds via `ms / 1000` (instead of `/ 60000`).
  - PUT save: convert entered value → ms via `seconds * 1000` (instead of `* 60000`).
  - Validation message ("Must be a non-negative integer") stays; `0 = disabled` hint stays.
- No storage/API change: `.nos/settings.yaml` keeps `autoAdvanceHeartbeatMs` in milliseconds, and `/api/settings/heartbeat` keeps its `intervalMs` contract (see `lib/settings.ts`, `app/api/settings/heartbeat/route.ts`).

**Out of scope**
- Renaming or changing the on-disk key `autoAdvanceHeartbeatMs` or the API field `intervalMs`.
- Changing the sweeper scheduling logic in `lib/auto-advance-sweeper.ts`.
- Migrating or rewriting previously saved heartbeat values (existing ms values continue to load correctly; they will just surface as seconds in the new input).
- Changing the `System Prompt` or `Notifications` cards on the settings page.

### Feasibility

- Technically trivial and low risk — a pure UI relabel + unit-conversion tweak in one file.
- Integer-second granularity is fine: existing saved values are multiples of 60000 ms (because the UI only allowed minutes), so `ms / 1000` produces whole seconds. Any future non-minute values still round cleanly through `Math.round`.
- `parsedMinutes * 60000` → `parsedSeconds * 1000` keeps the stored value a safe integer for any reasonable user input; overflow only at ~2.1 billion seconds, which is far beyond any sensible heartbeat.
- No spike needed.

### Dependencies

- `app/dashboard/settings/page.tsx` — the component being edited.
- `app/api/settings/heartbeat/route.ts` — read-only dependency; API contract unchanged.
- `lib/settings.ts` — read-only dependency; storage schema unchanged (`autoAdvanceHeartbeatMs` stays ms).
- `lib/auto-advance-sweeper.ts` / `instrumentation.ts` — read-only; sweeper continues to consume ms via `readHeartbeatMs()`.
- No other callers of the heartbeat setting were found.

### Open questions

1. **Minimum useful value.** A seconds-level input makes very small intervals (e.g. `1`) trivially settable. Should the UI enforce a soft floor (e.g. `>= 5` seconds except `0`) to prevent accidental tight-loop sweeping, or keep the current "any non-negative integer" rule?
2. **Default display.** The underlying default remains `DEFAULT_HEARTBEAT_MS = 60000` (1 minute) — after the change, this surfaces as `60` seconds in the field. Acceptable, or should the default also be revisited while we are here?
3. **Copy.** The card description mentions "How often the background sweeper looks for `Done` items…" — no unit is stated in prose, so no rewording is required, but confirm whether an explicit "e.g. 60 seconds" example should be added.

## Specification

### User stories

1. As an NOS operator, I want to set the auto-advance heartbeat in seconds, so that I can configure sub-minute sweep intervals without doing minute-to-second math in my head.
2. As an NOS operator returning to the settings page, I want to see my previously saved heartbeat shown in seconds, so that the displayed unit matches the input I typed it in.
3. As an NOS operator, I want my existing minute-based heartbeat values to keep working untouched after the unit change, so that switching the UI unit does not silently alter how often the sweeper actually fires.

### Acceptance criteria

1. **Label.** The input on the "Auto-advance heartbeat" card in `app/dashboard/settings/page.tsx` is labeled `Interval (seconds)` (replacing `Interval (minutes)`). The `htmlFor`/`id` pair is renamed to `heartbeat-seconds` so the label still associates with the input.
2. **Load — display in seconds.**
   - Given the `/api/settings/heartbeat` GET response returns `{ intervalMs: <n> }`,
   - When the settings page mounts,
   - Then the input shows `Math.round(n / 1000)` (or `'0'` when `n === 0`).
   - Examples: `intervalMs: 60000` → `60`; `intervalMs: 0` → `0`; `intervalMs: 5000` → `5`.
3. **Save — persist as ms.**
   - Given the user enters a non-negative integer `s` in the input and clicks **Save**,
   - When the page issues `PUT /api/settings/heartbeat`,
   - Then the request body is `{ intervalMs: s * 1000 }` (replacing the previous `s * 60000`).
   - Examples: input `60` → `intervalMs: 60000`; input `0` → `intervalMs: 0`; input `5` → `intervalMs: 5000`.
4. **Validation unchanged.** The Save button stays disabled, and the `Must be a non-negative integer` message renders, exactly when the entered value is empty, non-numeric, non-integer, or negative — same predicate as today, just applied to the seconds value. The `0 = disabled` hint stays beside the input.
5. **State renames.** The local component state `heartbeatMinutes`, `initialHeartbeatMinutes`, `isHeartbeatDirty`, `parsedMinutes` (and the matching setters) are renamed to the `…Seconds` equivalents. No `Minutes`-suffixed identifier remains in `app/dashboard/settings/page.tsx`.
6. **Storage and API contract unchanged.** No edits are made to `lib/settings.ts`, `app/api/settings/heartbeat/route.ts`, `lib/auto-advance-sweeper.ts`, or `instrumentation.ts`. The on-disk key in `.nos/settings.yaml` remains `autoAdvanceHeartbeatMs` and the API field remains `intervalMs`, both in milliseconds.
7. **Backward-compatible load.** Given a `.nos/settings.yaml` previously written by the minutes UI (e.g. `autoAdvanceHeartbeatMs: 300000`), when the settings page loads, then the input shows `300` and saving without changes round-trips the same `intervalMs: 300000`.
8. **Default unchanged.** When `intervalMs` is missing or non-numeric in the GET response, the input falls back to `60` (derived from the existing `DEFAULT_HEARTBEAT_MS = 60000`).
9. **Other cards untouched.** The `System Prompt` and `Notifications` cards on the same page render and behave identically to before this change.

### Technical constraints

- **File touched (only one):** `app/dashboard/settings/page.tsx`.
- **Conversion constants:** load uses `ms / 1000`, save uses `seconds * 1000`. No use of `60`/`60000` in the heartbeat block remains after the change.
- **Input element attributes:** keep `type="number"`, `min={0}`, `step={1}`. Do not introduce `max`, `pattern`, or any soft floor.
- **Validation predicate:** keep `Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0` against the trimmed-non-empty string — re-bound to the seconds value. No new error states.
- **API contract (unchanged, asserted here):** `GET /api/settings/heartbeat` returns `{ intervalMs: number }`; `PUT /api/settings/heartbeat` accepts `{ intervalMs: number }` (non-negative integer ms). See `app/api/settings/heartbeat/route.ts` and `lib/settings.ts`.
- **Sweeper consumer (unchanged, asserted here):** `lib/auto-advance-sweeper.ts` continues to read milliseconds via `readHeartbeatMs()`; no scheduling changes.
- **Performance / overflow:** `seconds * 1000` stays within `Number.MAX_SAFE_INTEGER` for any plausible user input (safe up to ~9.0e15 seconds), so no clamping is required.
- **Copy:** the card title (`Auto-advance heartbeat`), the card description prose, the `0 = disabled` hint, and the `Must be a non-negative integer` message are unchanged.

### Out of scope

- Renaming the on-disk key `autoAdvanceHeartbeatMs` or the API field `intervalMs`.
- Migrating, rewriting, or normalizing previously saved heartbeat values in `.nos/settings.yaml`.
- Changing `DEFAULT_HEARTBEAT_MS` or otherwise revisiting the default heartbeat.
- Introducing a soft minimum (e.g. "must be ≥ 5 seconds") or any other validation rule beyond the existing non-negative-integer check.
- Adding a unit example (e.g. "e.g. 60 seconds") to the card description.
- Any change to `lib/auto-advance-sweeper.ts`, `instrumentation.ts`, the heartbeat API route, or the `System Prompt` / `Notifications` cards.
- Tests — none are added or modified by this change.

## Implementation Notes

- Edited `app/dashboard/settings/page.tsx` only — no other files touched, matching the spec's single-file scope.
- Renamed local state: `heartbeatMinutes`/`setHeartbeatMinutes` → `heartbeatSeconds`/`setHeartbeatSeconds`; `initialHeartbeatMinutes`/`setInitialHeartbeatMinutes` → `initialHeartbeatSeconds`/`setInitialHeartbeatSeconds`; `parsedMinutes` → `parsedSeconds`. No `Minutes`-suffixed identifier remains (grep-verified).
- Swapped conversions: load uses `ms / 1000`; save uses `parsedSeconds * 1000`. No `60000` or `/60000` remains in the heartbeat block (grep-verified).
- Relabelled the input: `Interval (minutes)` → `Interval (seconds)`, and `htmlFor`/`id` renamed from `heartbeat-minutes` to `heartbeat-seconds` so the association is preserved.
- Validation predicate, `0 = disabled` hint, "Must be a non-negative integer" message, and input attributes (`type="number"`, `min={0}`, `step={1}`) are unchanged — only the identifier they bind against was renamed.
- API contract and storage untouched: `/api/settings/heartbeat` still exchanges `{ intervalMs }`, `.nos/settings.yaml` still stores `autoAdvanceHeartbeatMs` in milliseconds. Existing 300000 ms values now surface as `300`, and saving without changes round-trips the same ms — matches acceptance criterion 7.
- Default fallback is unchanged at 60000 ms, which now surfaces as `60` seconds.
- `npx tsc --noEmit` is clean; the `returnValue` deprecation warning at line 132 is pre-existing and unrelated.
- No deviations from the spec.

## Validation

1. ✅ **Label.** `app/dashboard/settings/page.tsx:330-334` — the label text reads `Interval (seconds)` with `htmlFor="heartbeat-seconds"`, and the input has `id="heartbeat-seconds"`. Pairing preserved.
2. ✅ **Load — display in seconds.** `page.tsx:112-115` — `const ms = typeof data?.intervalMs === 'number' ? data.intervalMs : 60000;` then `const seconds = ms === 0 ? '0' : String(Math.round(ms / 1000));`. Produces `60` for 60000, `0` for 0, `5` for 5000, as specified.
3. ✅ **Save — persist as ms.** `page.tsx:195-200` — `const intervalMs = parsedSeconds * 1000;` sent as the PUT body. Input `60` → `60000`, input `0` → `0`, input `5` → `5000`.
4. ✅ **Validation unchanged.** `page.tsx:182-187` keeps `Number.isFinite(parsedSeconds) && Number.isInteger(parsedSeconds) && parsedSeconds >= 0` with trimmed-non-empty check; Save is disabled via `!heartbeatValid` at line 351; the `Must be a non-negative integer` message renders at line 362; `0 = disabled` hint at line 346.
5. ✅ **State renames.** `heartbeatSeconds`/`setHeartbeatSeconds` (line 23), `initialHeartbeatSeconds`/`setInitialHeartbeatSeconds` (line 24), `isHeartbeatDirty` binds to the seconds state (line 33), `parsedSeconds` (line 182). Grepped `page.tsx` for `Minutes|minutes` — zero matches. No `Minutes`-suffixed identifier remains.
6. ✅ **Storage and API contract unchanged.** `git diff --stat HEAD` for `lib/settings.ts`, `app/api/settings/heartbeat/route.ts`, `lib/auto-advance-sweeper.ts`, `instrumentation.ts` reports zero edits vs. HEAD; only `app/dashboard/settings/page.tsx` changed (208 insertions). The API route still reads/writes `{ intervalMs }` (`route.ts:9-10,25-41`). Storage key and units unchanged.
7. ✅ **Backward-compatible load.** With `autoAdvanceHeartbeatMs: 300000`, the GET returns `intervalMs: 300000`; `Math.round(300000 / 1000) = 300` displays; saving without changes sends `300 * 1000 = 300000`. Round-trip is exact.
8. ✅ **Default unchanged.** `page.tsx:112` falls back to `60000` ms when `intervalMs` is missing/non-numeric, which surfaces as `60` via the same `ms / 1000` path.
9. ✅ **Other cards untouched.** `System Prompt` card (`page.tsx:225-273`) and `Notifications` card (`page.tsx:275-311`) contain no heartbeat-related changes; their handlers (`handleSave`, `handleAudioDoneToggle`, `handleTestSound`) are unaffected by the rename.

**Additional checks**
- **Type-check.** `npx tsc --noEmit` exits clean.
- **No residual `60000`/`* 60000`/`/ 60000` in heartbeat conversions.** Only remaining `60000` is the default-fallback constant at line 112, which is explicitly permitted by AC 8.
- **No regressions in adjacent functionality.** The `isDirty` unsaved-changes guards (beforeunload + in-page navigation prompt) bind only to the system-prompt `content`/`initialContent` pair (lines 128-152), untouched by this change.

**Verdict: PASS.** All 9 acceptance criteria are met; no follow-ups required.
