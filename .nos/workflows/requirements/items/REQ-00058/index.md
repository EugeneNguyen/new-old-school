sometime new item model clearned up (wipe out all input) randomly, i think it's relate to heartbeat or something similar. fix that

## Analysis

### Reproduction & root cause

The "new item" modal is `components/dashboard/NewItemDialog.tsx`. Its state (`title`, `body`, `stage`, `editorNonce`) is reset inside a `useEffect` whose dependency array is `[open, stages]` (lines 41–48):

```tsx
useEffect(() => {
  if (!open) return;
  setTitle('');
  setBody('');
  setStage(stages[0]?.name ?? '');
  setError(null);
  setEditorNonce((n) => n + 1);
}, [open, stages]);
```

The intent is "clear the form when the dialog opens." In practice the effect also re-runs whenever the `stages` reference changes while the dialog is open.

The parent (`WorkflowItemsView.tsx:229`) passes `currentStages` from `useWorkflowItems` (`lib/use-workflow-items.ts`). That hook replaces `stages` with a fresh array in several places:

- `lib/use-workflow-items.ts:77` — `setStages(initialStages)` fires on every re-render of the parent where `initialStages` is a new reference (it comes from a server component prop).
- `lib/use-workflow-items.ts:154` — the SSE `resync()` runs on every `EventSource` `open` event, including the initial connect and any silent reconnect, and unconditionally calls `setStages(detail.stages)` with a newly-decoded JSON array. This is the "heartbeat-ish" signal the user felt: browsers/proxies recycle SSE connections periodically, each reconnect triggers `onOpen → resync → setStages`, the effect in the dialog fires, and the user's typed input disappears.
- `handleStageSaved` / `handleStageCreated` / `handleStageDeleted` also replace `stages`, but those are user-initiated and less surprising.

Even when stage content is unchanged, the array identity is new, so React's dependency check fails and the effect re-runs. `editorNonce` increments remount the `ItemDescriptionEditor`, so markdown content is also lost.

Secondary contributor: `NewItemDialog` has no memoization of `stages`, and `WorkflowItemsView.tsx:229` passes `currentStages` directly.

### 1. Scope

**In scope:**
- Fix `NewItemDialog` so that input (title, body, stage selection) is preserved for the lifetime of a single "open" session regardless of upstream `stages` churn.
- The reset should fire only on an `open: false → true` transition, not on dependency-array thrash.
- Preserve the existing UX when `stages` legitimately changes while the dialog is open (e.g. user creates a new stage in another tab): the currently-selected stage should remain valid; if it was removed, fall back to `stages[0]`.
- Light audit of sibling dialogs (`ItemDetailDialog`, `StageDetailDialog`, `AddStageDialog`) for the same `[open, …something-that-re-references]` pattern, since the SSE resync will bounce their props too.

**Out of scope:**
- Rewriting the SSE resync cadence or debouncing `setStages` globally — other consumers rely on the current reference-churn semantics, and the correct fix is local to the dialog.
- Changing the heartbeat sweeper (`lib/auto-advance-sweeper.ts`) — despite the item's phrasing, no server-side heartbeat writes to the dialog state. The "heartbeat" the user perceived is the client SSE reconnect.
- Any server/auto-advance behavior.
- Cosmetic or layout changes to the dialog.

### 2. Feasibility

Fully feasible and low-risk. The change is a few lines in one component. Known-good options:

- **Option A (simplest):** Remove `stages` from the dep array and depend only on `[open]`. Read the current `stages[0]?.name ?? ''` inside the effect via a ref so we do not close over stale data. This is the standard "reset on open" pattern.
- **Option B:** Track the previous `open` value with a `useRef` / `usePrevious` and only run the reset when `prevOpen === false && open === true`.
- **Option C:** Lift the reset out of an effect entirely and drive it imperatively from the caller's `openNewItem()` action, passing an `onOpen` callback or using a `key` prop on the dialog to force a fresh instance per open.

Option A matches existing code style in the file. Option C is cleanest but touches more of the parent. Recommend Option A unless acceptance criteria explicitly require remount semantics.

Risks:
- If `stages` becomes empty between opens, the effect must still fall back gracefully (currently handled via `stages[0]?.name ?? ''`).
- If we keep the stage selection stable across stage-list changes, we must re-validate it (e.g. if the chosen stage was deleted, fall back).
- The `editorNonce` remount pattern is load-bearing for clearing `ItemDescriptionEditor`; we must still bump it on true opens.

No spiking required — behavior is observable in dev by leaving the dialog open and waiting for a browser/SSE reconnect, or by forcing `resync()` via stage edits in another window.

### 3. Dependencies

- **Files directly touched by the fix:** `components/dashboard/NewItemDialog.tsx`.
- **Files that inform the fix:** `components/dashboard/WorkflowItemsView.tsx` (prop wiring), `lib/use-workflow-items.ts` (source of the `stages` reference churn, esp. the SSE `resync`), `components/dashboard/ItemDescriptionEditor.tsx` (the remount via `editorNonce`).
- **Adjacent code to audit for the same pattern:** `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/StageDetailDialog.tsx`, `components/dashboard/AddStageDialog.tsx`.
- **No backend dependencies.** No changes to `/api/workflows/[id]/events`, the heartbeat sweeper, or `lib/auto-advance*.ts`.
- **No external services.**
- **Related requirements:** REQ-013 (dashboard UI that hosts this dialog) and REQ-00021 / "refactor heart beat" (prior heartbeat work). Neither gates this fix.

### 4. Open questions

1. **Stage selection preservation across stage-list updates:** if the user has selected stage "Draft" and the admin renames/deletes "Draft" in another tab while the dialog is open, do we (a) keep whatever the user picked and let the submit fail, (b) silently reset to `stages[0]`, or (c) show a banner? Current behavior is (b) as a side effect of the bug. Preferred answer: (b) silently — but confirm.
2. **Should the fix also guard the `ItemDescriptionEditor` remount?** Today any `editorNonce` bump blows away unsaved markdown. With the fix the nonce only bumps on true opens, which is what we want; no separate work needed — confirm that is acceptable.
3. **Is there a desire to extend the audit** to other dialogs in this PR (`ItemDetailDialog`, `StageDetailDialog`, `AddStageDialog`), or keep the change laser-focused on `NewItemDialog` and file follow-ups for the rest?
4. **Tests:** the repo's current convention for component tests around dashboard dialogs is unclear from the requirement — if a test harness exists, we should add a regression test that re-references `stages` while the dialog is open and asserts the input survives. Confirm test expectations before implementation.

## Specification

### User stories

1. As a **workflow user filling out the New Item dialog**, I want my typed title, description markdown, and chosen stage to remain intact while the dialog is open, so that a background SSE reconnect (or any other upstream `stages` reference change) does not silently wipe out work-in-progress.
2. As a **workflow user reopening the New Item dialog**, I want the form to start fresh (empty title, empty body, default stage) on every open, so that state from a previous session does not bleed through.
3. As a **workflow admin editing stages in another tab**, I want a New Item dialog open elsewhere to keep the user's input, and to update its stage list in-place — keeping the current selection when still valid, and falling back to the first available stage only when the previously-selected stage no longer exists.

### Acceptance criteria

All criteria apply to `components/dashboard/NewItemDialog.tsx` as integrated by `components/dashboard/WorkflowItemsView.tsx`.

1. **Fresh form on true open.**
   Given the New Item dialog is closed,
   When the user opens it (transition `open: false → true`),
   Then `title` is `''`, `body` is `''`, `stage` is `stages[0]?.name ?? ''`, `error` is `null`, and `ItemDescriptionEditor` is remounted (its internal markdown state is cleared).

2. **Input preserved across `stages` reference churn.**
   Given the dialog is open and the user has typed a `title`, entered `body` markdown, and/or selected a non-default `stage`,
   When the parent re-renders with a new `stages` array reference whose contents are value-equal to the previous one (e.g. SSE `resync()` in `lib/use-workflow-items.ts:154` fires on reconnect, or `setStages(initialStages)` at line 77 replays),
   Then `title`, `body`, and the selected `stage` are unchanged, `editorNonce` does not increment, and `ItemDescriptionEditor` is not remounted.

3. **Stage selection preserved when still valid.**
   Given the dialog is open with `stage = "Draft"`,
   When `stages` is replaced with a new array that still contains a stage named `"Draft"`,
   Then `stage` remains `"Draft"` and no form fields are reset.

4. **Stage selection falls back when current stage is removed.**
   Given the dialog is open with `stage = "Draft"`,
   When `stages` is replaced with a new array that does **not** contain `"Draft"`,
   Then `stage` is reset to `stages[0]?.name ?? ''` only, while `title`, `body`, `error`, and `editorNonce` remain unchanged.

5. **Empty stages fallback.**
   Given the dialog opens when `stages` is `[]`,
   When the reset effect runs,
   Then `stage` is `''` and the dialog renders without throwing; the submit payload omits `stage` (matching the current `...(stage ? { stage } : {})` behavior at line 65).

6. **Reopen after close resets form.**
   Given the user opens the dialog, types a title, and closes it (via Cancel, the X button, or `onOpenChange(false)`),
   When the dialog is opened again,
   Then the form is reset per AC 1 (the previous typed title does not reappear).

7. **SSE reconnect regression guard.**
   Given the dialog is open with user input,
   When the `EventSource` wired by `useWorkflowItems` emits a new `open` event that causes `resync()` to call `setStages(detail.stages)` with a fresh JSON-decoded array of value-equal stages,
   Then all user input survives (explicit regression for the bug described in the Analysis).

8. **Submit still works after a mid-session `stages` update.**
   Given the dialog is open with filled-in title/body and a `stage` that still exists after a `stages` update,
   When the user clicks **Create**,
   Then `POST /api/workflows/{id}/items` is called with the user's `title`, `body`, and `stage` as typed, and on success `onCreated(item)` fires and `onOpenChange(false)` is called (existing behavior preserved).

9. **No change to closed-dialog behavior.**
   Given the dialog is closed (`open === false`),
   When `stages` changes,
   Then no state setter inside `NewItemDialog` is invoked (matches current `if (!open) return;` guard at line 42).

10. **Sibling dialogs left untouched in this change.**
    Given this requirement,
    When the implementation lands,
    Then `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/StageDetailDialog.tsx`, and `components/dashboard/AddStageDialog.tsx` are **not** modified as part of this work. Any similar patterns discovered there are filed as separate follow-ups (see Out of scope).

### Technical constraints

- **Sole file modified:** `components/dashboard/NewItemDialog.tsx`. No changes to `WorkflowItemsView.tsx`, `lib/use-workflow-items.ts`, `ItemDescriptionEditor.tsx`, `/api/workflows/[id]/events`, `lib/auto-advance*.ts`, or the sibling dialogs listed in AC 10.
- **Props contract unchanged.** `NewItemDialog` must continue to accept `{ open, onOpenChange, workflowId, stages, onCreated }: Props` exactly as declared at `NewItemDialog.tsx:17-23`. No new required props; callers in `WorkflowItemsView.tsx:229` must not need to change.
- **Reset-on-open pattern.** The form reset must fire only on an `open: false → true` transition. Acceptable implementations:
  - Track the previous value of `open` via a `useRef` (or equivalent `usePrevious` utility) and run the reset only when `prev === false && next === true`, OR
  - Remove `stages` from the effect's dependency array and guard with the previous-open ref, reading `stages[0]?.name ?? ''` through a ref or directly from the current render so it is not stale.
  Option A from the Feasibility section (drop `stages` from deps + use a ref for current `stages`) is the preferred baseline; Option B (previous-open ref) is equivalent and acceptable. Option C (`key`-based remount driven by the parent) is **out of scope** for this change because it would require parent edits and AC 10 forbids that.
- **Stage reconciliation effect.** A separate effect (or the same effect with different deps) must, while the dialog is open, reconcile `stage` against `stages`:
  - If `stage === ''` and `stages.length > 0`, set `stage = stages[0].name`.
  - If `stage !== ''` and no entry in `stages` has `name === stage`, set `stage = stages[0]?.name ?? ''`.
  - Otherwise, leave `stage` untouched.
  This effect must **not** touch `title`, `body`, `error`, or `editorNonce`.
- **`editorNonce` semantics.** The nonce must increment exactly once per `open: false → true` transition. It must not increment on `stages` changes, parent re-renders, or mid-session stage reconciliation. This preserves the `<ItemDescriptionEditor key={editorNonce} …>` remount at line 118 for fresh opens only.
- **React hooks discipline.** The new effects must satisfy `react-hooks/exhaustive-deps` (either by listing all read values or by using refs to read the latest value without depending on it). Do not add `// eslint-disable-next-line` suppressions.
- **No new dependencies.** No new npm packages, no new utility modules. A local `useRef<boolean>` or `useRef<Stage[]>` is sufficient.
- **TypeScript.** Continue to use the existing `Stage` and `WorkflowItem` types from `@/types/workflow`. Do not widen `Props`. `stages` remains `Stage[]`.
- **Performance.** The fix must not introduce any additional network requests, and must not cause an extra render per keystroke in the title/body fields.
- **Browser compatibility.** No change to the set of supported browsers; the fix uses standard React 18 hooks already in use elsewhere in the file.
- **Accessibility & UX.** No visual, layout, focus, or ARIA changes. `autoFocus` on the title input at line 95 must still fire on true opens only (it naturally does because the input is only mounted while `open === true` via `<Dialog open={open} …>`).

### Out of scope

- Changes to the SSE resync cadence, debouncing of `setStages`, or memoization of `stages` in `lib/use-workflow-items.ts` or `WorkflowItemsView.tsx`.
- Any modification of the heartbeat sweeper (`lib/auto-advance-sweeper.ts`) or `lib/auto-advance.ts`.
- Any server-side, API, or workflow-status behavior.
- Applying the same reset-on-open fix to `ItemDetailDialog.tsx`, `StageDetailDialog.tsx`, or `AddStageDialog.tsx`. If those dialogs exhibit the same pattern, they are handled as separate requirements/follow-ups.
- Lifting the reset out of an effect and into an imperative `openNewItem()` callback or a parent-supplied `key` prop (Option C from Feasibility). The fix stays local to `NewItemDialog.tsx`.
- Adding a user-visible banner or toast when the selected stage is removed mid-session; the silent fallback defined in AC 4 is the chosen UX.
- Cosmetic, copy, layout, or styling changes to the dialog.
- Adding a new test harness. If no component-test infrastructure exists for dashboard dialogs today, writing one is deferred; manual verification against AC 1–7 is acceptable for this requirement.

## Validation

Evidence gathered from reading `components/dashboard/NewItemDialog.tsx` (current working-tree version), the diff vs `main`, and running `tsc --noEmit` across the project.

1. ✅ **Fresh form on true open.** `NewItemDialog.tsx:46-56` — reset effect runs on `[open]`; when `!wasOpen && open` fires `setTitle('')`, `setBody('')`, `setStage(stagesRef.current[0]?.name ?? '')`, `setError(null)`, and `setEditorNonce((n) => n + 1)`. `editorNonce` is the `key` of `<ItemDescriptionEditor>` at line 138 so the editor remounts with empty markdown.
2. ✅ **Input preserved across `stages` reference churn.** Reset effect at line 56 depends only on `[open]`. A new `stages` reference does not re-run it, so `title`/`body`/`editorNonce` are untouched. The reconciliation effect (line 59-68) is the only path that observes `stages` while open, and it only mutates `stage`.
3. ✅ **Stage selection preserved when still valid.** Line 63-66: `if (current !== '' && !stages.some((s) => s.name === current)) return fallback; return current;` — when the currently-selected stage still exists in the new array, the functional updater returns `current` unchanged, and React bails out of the state update (no re-render thrash).
4. ✅ **Stage selection falls back when current stage is removed.** Same branch at line 63-65 — when `current` is no longer in `stages`, returns `stages[0]?.name ?? ''`. Only `stage` is touched; `title`/`body`/`error`/`editorNonce` remain untouched because they are not set here.
5. ✅ **Empty stages fallback.** Reset reads `stagesRef.current[0]?.name ?? ''` (line 52) → `''` when empty. Reconciliation guard `if (current === '' && stages.length > 0)` (line 62) skips when `stages` is empty, leaving `stage === ''`. Submit payload at line 85 uses `...(stage ? { stage } : {})` so `stage` is omitted. No runtime throws on render.
6. ✅ **Reopen after close resets form.** On close, the reset effect fires with `wasOpen=true, open=false`: condition `!wasOpen && open` is false → no setters run, `prevOpenRef.current = false`. On next open, `wasOpen=false, open=true` → reset fires per AC 1.
7. ✅ **SSE reconnect regression guard.** `useWorkflowItems` SSE `resync()` calls `setStages(detail.stages)` with a new array (verified at `lib/use-workflow-items.ts:154`). That changes `stages` prop but not `open`; reset effect (dep `[open]`) does not run, reconciliation preserves stage (AC 3). `title`, `body`, `editorNonce` untouched.
8. ✅ **Submit still works after mid-session `stages` update.** `handleSubmit` (line 70-100) unchanged from prior code — posts to `/api/workflows/{id}/items` with `title`, optional `body`, optional `stage`; on success calls `onCreated(created)` then `onOpenChange(false)`.
9. ✅ **No change to closed-dialog behavior.** When `open === false`: reset effect's `!wasOpen && open` branch never fires any state setter (best case: `prevOpenRef.current` updates, which is a ref and does not re-render); reconciliation effect guards with `if (!open) return` at line 60.
10. ✅ **Sibling dialogs left untouched.** `git diff` for this work shows only `components/dashboard/NewItemDialog.tsx` was modified for REQ-00058. `StageDetailDialog.tsx`, `AddStageDialog.tsx`, and `WorkflowItemsView.tsx` appear in `git status` but their changes belong to unrelated in-flight requirements (REQ-00055/00056/00057) and are not part of this fix's diff.

**Additional checks.**
- `npx tsc --noEmit` passes with no errors.
- Props contract at line 17-23 unchanged (`open`, `onOpenChange`, `workflowId`, `stages`, `onCreated`). No new imports beyond adding `useRef`.
- No `eslint-disable` comments added. Reset effect reads `stages` via `stagesRef` (not a dep), reconciliation effect lists both `[open, stages]`; both satisfy exhaustive-deps.
- No new npm packages introduced.
- `autoFocus` on the title input (line 115) still fires on true opens only, since the input is mounted only while `open === true`.

**Verdict:** All 10 acceptance criteria pass. No regressions identified. Implementation is ready to advance to Done.
