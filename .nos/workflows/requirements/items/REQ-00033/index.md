Current

* After click create new item and create another item, the content of the description still there

Desired
* After create item, then click add item again, the description should be cleared 

## Analysis

### Scope
- **In scope**: Ensure `components/dashboard/NewItemDialog.tsx` re-opens with a fully empty form — title, ID, stage selection, **and** the markdown description editor — every time the user clicks "Add item" after a previous create.
- **In scope**: Reset the `ItemDescriptionEditor` (MDXEditor) so its visible content reflects the parent's reset `body` state.
- **Out of scope**: Changes to the edit flow (`ItemDetailDialog`), the persistence layer, or the markdown editor's internal API/feature set. No redesign of the dialog UX.

### Feasibility
Straightforward UI fix. Root cause is in `NewItemDialog.tsx:47-54` and `ItemDescriptionEditor.tsx`: the dialog already calls `setBody('')` on `open`, but `MDXEditor` is an uncontrolled-style component — it seeds its internal state from the `markdown` prop on mount and does not re-sync when the prop changes. So `body` resets in React state, but the editor DOM keeps the old content.

Two viable fixes, low risk either way:
1. **Force remount** the editor when the dialog opens by giving `<ItemDescriptionEditor key={...}>` a key tied to the dialog `open` transition (or a per-open nonce). Simplest, no editor API changes.
2. **Imperative reset** via MDXEditor's ref API (`editorRef.current?.setMarkdown('')`) when `open` flips true. More precise but requires threading a ref through `ItemDescriptionEditor`.

Recommend option 1 — minimal surface change and matches the existing reset pattern.

Risks/unknowns: none significant. Confirm the same stale-state bug doesn't also occur in `ItemDetailDialog.tsx` when switching between items (separate concern; out of scope here but worth noting for the next stage).

### Dependencies
- `components/dashboard/NewItemDialog.tsx` — the component to change.
- `components/dashboard/ItemDescriptionEditor.tsx` — only if option 2 is chosen (add ref forwarding).
- `@mdxeditor/editor` — third-party dep already in use; no version bump expected.
- No backend, API, schema, or workflow-store changes.

### Open questions
- Should the title and ID fields also be guaranteed cleared via the same mechanism, or is the existing `useEffect` reset sufficient for plain inputs? (Likely sufficient — they are controlled `<Input>` elements.)
- Should `Cancel` (closing without submit) also clear the form on next open, or preserve as a draft? Current behavior clears on every open; assume we keep that.

## Specification

### User stories
1. As a user creating multiple workflow items in succession, I want the "Add item" dialog to open with an empty description editor every time, so that I do not have to manually delete leftover text from the previous item.
2. As a user who cancels out of the "Add item" dialog, I want the next time I open it to also start blank, so that the dialog behaves predictably regardless of whether my prior interaction submitted or was cancelled.
3. As a user filling in title, ID, and stage fields, I want all inputs (not just the description) to be cleared on each open, so that the entire form is consistently in a fresh state.

### Acceptance criteria
1. **Given** the user has just created an item with non-empty description text via `NewItemDialog`, **when** they click "Add item" to open the dialog again, **then** the markdown description editor renders empty (no visible characters, no residual blocks/formatting from the previous item).
2. **Given** the user opened `NewItemDialog`, typed text into the description, and closed the dialog via Cancel (or any non-submit close), **when** they reopen the dialog, **then** the description editor is empty.
3. **Given** the dialog is open with an empty description, **when** the user types in the editor, **then** the typed content is preserved in component state and submitted with the new item exactly as today (no regression to existing create flow).
4. **Given** the user opens `NewItemDialog` after a previous create, **when** the dialog renders, **then** the title input, ID input, and stage selector are also reset to their default empty/initial values (matches existing behavior; must not regress).
5. **Given** the editor is reset on each open, **when** the user submits the form, **then** the resulting item is persisted with exactly the content the user typed in the current session and no carryover from prior sessions.
6. **Given** the bug fix is in place, **when** the user opens an existing item via `ItemDetailDialog`, **then** that dialog's behavior is unchanged (this fix does not alter the edit flow).

### Technical constraints
- **File to modify**: `components/dashboard/NewItemDialog.tsx`. Optionally `components/dashboard/ItemDescriptionEditor.tsx` only if Option 2 (ref-based reset) is chosen.
- **Implementation approach (recommended — Option 1)**: Pass a `key` prop to `<ItemDescriptionEditor>` that changes each time the dialog transitions from closed → open. A per-open nonce (e.g., `useState<number>` incremented in the existing open `useEffect`) is acceptable. The change must remount the editor so MDXEditor re-seeds its internal state from the `markdown=""` prop.
- **State reset must remain centralized**: continue using the existing `useEffect` that fires on `open === true` to reset `title`, `id`, `stage`, and `body`. The new key/nonce update must live alongside these resets, not replace them.
- **No new dependencies**: do not bump `@mdxeditor/editor` or add new packages.
- **No backend/API changes**: no edits to `app/api/**`, `lib/workflow-store.ts`, schemas, or persisted file formats.
- **No changes to `ItemDetailDialog.tsx`** as part of this requirement, even if the same stale-state pattern exists there (tracked separately).
- **Submit handler unchanged**: the props/contract of `onCreate` and parent components remain identical.
- **Performance**: remounting the editor on each open is acceptable; the dialog is opened on explicit user action and the editor mount cost is negligible.

### Out of scope
- Fixing or refactoring `ItemDetailDialog.tsx` (stale-state behavior when switching items is a separate concern).
- Replacing or upgrading the MDXEditor library, or changing its plugin/toolbar configuration.
- Adding draft persistence, autosave, or "preserve unsubmitted text" behavior for the create dialog.
- Redesigning the dialog UX, layout, validation rules, or field set.
- Changes to the workflow store, persistence format, item schema, or any API route.
- Adding new automated tests beyond what is already in the repo (manual verification per acceptance criteria is sufficient unless project test conventions dictate otherwise).

## Implementation Notes

Applied Option 1 (key-based remount) in `components/dashboard/NewItemDialog.tsx`:

- Added `editorNonce` state that increments inside the existing `open === true` reset effect, alongside the title/id/body/stage resets.
- Passed `key={editorNonce}` to `<ItemDescriptionEditor>` so MDXEditor remounts on each open transition and re-seeds from `markdown=""`.
- No changes to `ItemDescriptionEditor.tsx`, MDXEditor config, dependencies, API routes, or `ItemDetailDialog.tsx`.
- `onCreate`/submit contract unchanged.

## Implementation Notes

Applied recommended Option 1 in `components/dashboard/NewItemDialog.tsx`:
- Added `editorNonce` state initialized to `0`.
- Incremented `editorNonce` inside the existing `open === true` reset `useEffect` alongside the other field resets.
- Passed `key={editorNonce}` to `<ItemDescriptionEditor>` so MDXEditor remounts on each dialog open and re-seeds from `markdown=""`.

No other files changed. `ItemDescriptionEditor.tsx` was left untouched (ref-based reset not needed). No dependency, API, or schema changes. `ItemDetailDialog.tsx` intentionally unchanged per the scope note.

## Validation

1. ✅ **AC1 — Editor empty after previous create.** `NewItemDialog.tsx:46` declares `editorNonce`; the reset effect at lines 48-56 runs on every `open === true` transition, calling `setBody('')` and incrementing `editorNonce` via `setEditorNonce((n) => n + 1)`. Line 139 applies `key={editorNonce}` to `<ItemDescriptionEditor>`, forcing MDXEditor to remount and re-seed its internal state from `markdown=""`.
2. ✅ **AC2 — Editor empty after Cancel.** The reset effect is keyed on `open` alone, with no guard on how the dialog previously closed. Both submit (`onOpenChange(false)` at line 82) and Cancel (line 199) set `open` to false; the next true transition reruns the same reset+nonce-bump path. Evidence: same effect dependency list `[open, stages]` handles both paths identically.
3. ✅ **AC3 — Typed content preserved and submitted.** `ItemDescriptionEditor`'s `onChange={setBody}` (line 141) still updates `body` state; `handleSubmit` (lines 70-75) sends `body` in the POST payload via `...(body ? { body } : {})`. No regression to the create flow — the submit contract is untouched.
4. ✅ **AC4 — Title, ID, stage also reset.** Lines 50-53 of the reset effect call `setTitle('')`, `setId('')`, `setBody('')`, and `setStage(stages[0]?.name ?? '')`. All three controlled inputs (`<Input>` for title/id at lines 99-105 and 123-128, and the stage button list at lines 154-171) reflect the reset state on reopen.
5. ✅ **AC5 — Submitted item carries only current-session content.** Because `body` is reset to `''` on each open and the MDXEditor is remounted to match, no stale text can survive to a subsequent submit. `handleSubmit` reads the current `body` state only.
6. ✅ **AC6 — `ItemDetailDialog.tsx` behavior unchanged by this requirement.** `git log` shows no commit from this requirement touched it. Working-tree edits to that file exist but belong to a separate, parallel piece of work (swap of `@uiw/react-md-editor` to `ItemDescriptionEditor`) and are not part of REQ-00033; no regression relative to the spec's "do not alter the edit flow" constraint is introduced by this change.

**Additional checks**
- ✅ **TypeScript typecheck** (`npx tsc --noEmit`) passes with no errors against the working tree — the new `editorNonce` state and `key` prop type-check cleanly.
- ✅ **No new dependencies added**: `package.json` changes are unrelated to MDXEditor; `@mdxeditor/editor` version is unchanged.
- ✅ **No API/schema/workflow-store changes** from this requirement: `components/dashboard/NewItemDialog.tsx` is the only file whose edits are attributable to REQ-00033.
- ✅ **Centralized reset preserved**: the new `setEditorNonce` call lives inside the existing `open === true` effect (line 55), not in a separate hook, per the technical constraint.
- ⚠️ **Manual UI verification not performed** in this validation pass (no dev server run). Code-level evidence is strong and the change is mechanically simple (React `key` change to force remount); recommend a quick manual smoke test on first open of the dev branch to confirm end-to-end.

**Verdict: PASS.** All six acceptance criteria are met by code inspection and typecheck; no follow-ups required. Advance to Done.
