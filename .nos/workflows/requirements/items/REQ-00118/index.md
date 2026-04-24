# Item detail > comment should have send button when commenting

## Analysis

### Scope

**In scope:**
- Add a dedicated "Send" button adjacent to the comment textarea in `ItemDetailDialog.tsx` (~line 490) so users can submit a comment immediately without clicking the global Save button.
- The send button should POST the comment independently to `/api/workflows/[id]/items/[itemId]/comments` (the existing endpoint), decoupling comment submission from the Save flow that also persists title/stage/status/body changes.
- Button should be disabled when the textarea is empty.

**Out of scope:**
- Changes to the backend comment API (already supports independent POST).
- Adding keyboard shortcuts (e.g., Ctrl+Enter to send) — could be a follow-up.
- Modifying the existing Save button behavior or the comment edit/delete UI.

### Feasibility

**Viability: High** — this is a straightforward UI addition.

- The comment POST logic already exists inside `handleSave()` (lines 187–201 of `ItemDetailDialog.tsx`). It can be extracted into a standalone `handleCommentSubmit()` function.
- The project already has a Send button pattern in `ChatInput.tsx` (lines 68–74) using a `Send` icon from `lucide-react` that can be referenced for visual consistency.
- The backend route (`app/api/workflows/[id]/items/[itemId]/comments/route.ts`) accepts `{ text, author }` — no server changes needed.

**Risks:**
- After submitting a comment independently, the local `item.comments` state needs to be refreshed or optimistically updated so the new comment appears in the list without a full dialog reload.
- The Save button currently also submits pending comments; once a dedicated send button exists, the Save flow should skip re-submitting an already-posted comment (the `newComment` state will already be cleared, so this is naturally handled).

### Dependencies

- **`components/dashboard/ItemDetailDialog.tsx`** — the only file that needs modification.
- **`lucide-react`** — already a project dependency; provides the `Send` or `SendHorizontal` icon.
- **Comment API route** — existing, no changes required.
- **No other requirements are blocked or blocking.**

### Open Questions

1. **Button placement** — should the send button appear inline to the right of the textarea, or below it? The `ChatInput.tsx` pattern places it inline-right; this likely works here too, but UX confirmation would be ideal.
2. **Optimistic UI** — after sending, should the comment appear instantly in the list (optimistic update), or should the dialog re-fetch the full item? Optimistic is snappier but requires appending to the local comments array.
3. **Loading state** — should the button show a spinner while the POST is in flight, or is the operation fast enough to skip that?

## Specification

### User Stories

1. **As a** user viewing an item's detail dialog, **I want** a dedicated Send button next to the comment textarea, **so that** I can submit a comment immediately without clicking the global Save button.

2. **As a** user composing a comment, **I want** the Send button to be visually disabled when the textarea is empty, **so that** I don't accidentally submit blank comments.

3. **As a** user who just submitted a comment, **I want** the new comment to appear in the comment list immediately, **so that** I have instant confirmation my comment was posted.

### Acceptance Criteria

1. **AC-1: Send button renders.** Given the ItemDetailDialog is open, when the user views the comments section, then a Send button with a `Send` (or `SendHorizontal`) icon from `lucide-react` is rendered inline to the right of the comment textarea.

2. **AC-2: Disabled when empty.** Given the comment textarea is empty or contains only whitespace, when the user views the Send button, then the button is visually disabled and not clickable (`disabled` attribute is `true`).

3. **AC-3: Enabled when text present.** Given the comment textarea contains non-whitespace text, when the user views the Send button, then the button is enabled and clickable.

4. **AC-4: Independent POST on click.** Given the textarea contains a non-empty comment, when the user clicks the Send button, then a `POST` request is sent to `/api/workflows/[id]/items/[itemId]/comments` with `{ text, author: "user" }` — independent of the Save button flow.

5. **AC-5: Textarea clears after send.** Given a comment was successfully submitted, when the POST returns `2xx`, then the `newComment` state is cleared and the textarea is empty.

6. **AC-6: Optimistic comment list update.** Given a comment was successfully submitted, when the POST returns `2xx`, then the new comment appears in the rendered comment list without requiring a full dialog reload or clicking Save.

7. **AC-7: Error handling.** Given the POST request fails (non-2xx response), when the user clicks Send, then the comment text is preserved in the textarea (not cleared), and a toast notification or inline error indicates the failure.

8. **AC-8: Save button does not re-submit.** Given a comment was already sent via the Send button (and `newComment` state is empty), when the user clicks Save, then no duplicate comment POST is issued.

9. **AC-9: Visual consistency with ChatInput.** The Send button's icon, sizing, and disabled styling must be consistent with the existing `ChatInput.tsx` pattern (`components/chat/ChatInput.tsx`, lines 68–74): same `Send` icon from `lucide-react`, similar button dimensions.

### Technical Constraints

1. **Single file modification.** Only `components/dashboard/ItemDetailDialog.tsx` requires changes. No backend or API route modifications are needed.

2. **Comment API contract.** The existing `POST /api/workflows/[id]/items/[itemId]/comments` endpoint accepts `{ text: string, author: string }` and returns the created comment. Per `docs/standards/api-reference.md`.

3. **State management.** Extract the comment POST logic from `handleSave()` (lines 187–201 of `ItemDetailDialog.tsx`) into a standalone `handleCommentSubmit()` function. After a successful POST, either:
   - Append the new Comment object to the local `item.comments` array (optimistic update), or
   - Re-fetch the item to refresh the comments list.
   The optimistic approach is preferred for responsiveness.

4. **Icon dependency.** Use `Send` or `SendHorizontal` from `lucide-react` (already a project dependency). Match the `w-4 h-4` sizing used in `ChatInput.tsx`.

5. **Layout.** The Send button should be positioned inline-right of the textarea, consistent with the `ChatInput.tsx` layout pattern. Wrap the textarea and button in a flex container.

6. **Loading indicator.** Show a `Loader2` spinner (animated) on the Send button while the POST is in flight, matching the `ChatInput.tsx` spinner pattern.

### Out of Scope

- **Backend changes.** The comment API route already supports independent POST — no server modifications.
- **Keyboard shortcuts.** `Ctrl+Enter` or `Cmd+Enter` to send is a follow-up enhancement, not part of this requirement.
- **Save button refactoring.** The existing Save button behavior is unchanged. It naturally skips comment submission when `newComment` is empty.
- **Comment edit/delete UI.** Existing comment CRUD UI is not affected.
- **Textarea auto-resize or rich text.** The textarea remains a plain `<textarea>` element.

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00118 |
| **Title** | Item detail > comment should have send button when commenting |
| **Source** | Feature request (user) |
| **Design Artifact** | `docs/standards/ui-design.md`, `docs/standards/ux-design.md` |
| **Implementation File(s)** | `components/dashboard/ItemDetailDialog.tsx` (to be filled after implementation) |
| **Test Coverage** | Manual validation (to be filled after validation) |
| **Status** | In Progress |

### WBS Mapping

- **1.4.4 Item Detail Dialog** — This requirement directly extends the Item Detail Dialog (title, markdown body editor, comments, sessions, status). The Send button adds independent comment submission capability to the comments sub-section.
- **1.5.4 Icon System** — Uses existing `lucide-react` icon (`Send`/`SendHorizontal`); no new icons required.
- **Deliverables affected:** `components/dashboard/ItemDetailDialog.tsx` — the comment input area within the dialog.

## Implementation Notes

Implemented the Send button for the comment textarea in `ItemDetailDialog.tsx` with the following changes:

1. **Added imports**: `Send` and `Loader2` from `lucide-react` for the icon and loading spinner.

2. **Added state**: `submittingComment` boolean to track loading state during comment submission.

3. **Extracted handler**: Created `handleCommentSubmit()` function (lines 243-270) from the original `handleSave()` logic. The function:
   - Posts to `/api/workflows/[id]/items/[itemId]/comments` with `{ text, author: 'user' }`
   - Clears the textarea on success
   - Optimistically updates the comments list by appending the returned comment
   - Preserves text in textarea on error and sets an inline error message
   - Uses `Loader2` spinner while the request is in flight

4. **Added Send button**: Positioned inline-right of the textarea within a flex container (`flex items-start gap-2`). The button:
   - Uses `Send` icon (16px × 16px) matching `ChatInput.tsx` pattern
   - Is disabled when textarea is empty or while submitting
   - Shows `Loader2` spinner when `submittingComment` is true

5. **Save button behavior**: The existing `handleSave()` naturally skips comment submission when `newComment` is empty (after being cleared by `handleCommentSubmit()`), satisfying AC-8.

**Deviations from documented standards**: None. All acceptance criteria met using existing patterns and conventions.

## Validation

### Evidence

- Code reviewed: `components/dashboard/ItemDetailDialog.tsx` (full file)
- Reference reviewed: `components/chat/ChatInput.tsx` (visual consistency)
- API reviewed: `app/api/workflows/[id]/items/[itemId]/comments/route.ts` (response shape)
- TypeScript: `npx tsc --noEmit` — zero errors in implementation files (pre-existing errors in `lib/scaffolding.test.ts` only, unrelated to this change)

### Criteria Verdicts

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Send button renders inline-right of textarea | ✅ Pass | `flex items-start gap-2` container at line 515 wraps textarea + `<button>` with `<Send className="h-4 w-4" />` |
| AC-2 | Disabled when textarea empty/whitespace | ✅ Pass | `disabled={!newComment.trim() \|\| submittingComment}` at line 525 |
| AC-3 | Enabled when text present | ✅ Pass | Same condition — truthy `newComment.trim()` enables button |
| AC-4 | Independent POST on click | ✅ Pass | `handleCommentSubmit()` (lines 243–270) POSTs independently; called via `onClick` on button |
| AC-5 | Textarea clears after successful send | ✅ Pass | `setNewComment('')` at line 260 in try block after `res.ok` check |
| AC-6 | Optimistic comment list update | ✅ Pass | Lines 261–263: `setComments((prev) => [...prev, data.comment!])` appends returned comment |
| AC-7 | Error handling — text preserved, error shown | ✅ Pass | catch block sets `setError(...)` without clearing `newComment`; inline error banner at lines 611–613 (spec allows "toast or inline error") |
| AC-8 | Save does not re-submit already-sent comment | ✅ Pass | `handleSave()` guards with `if (trimmedNew)` (line 188); `newComment` already cleared by Send flow |
| AC-9 | Visual consistency with ChatInput | ✅ Pass | Same `Send`/`Loader2` icons from `lucide-react` at `h-4 w-4`; `h-9 w-9` button matches ChatInput's sizing; uses `disabled:opacity-50` matching disabled styling pattern |

### RTM

Entry added to `docs/standards/rtm.md` for REQ-00118.

**All 9 acceptance criteria pass. No regressions detected. Implementation complete.**
