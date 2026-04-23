How to reproduce

* Go to 1 workspace (for example BinhNguyenEdu)
* Go to workflow analyse book
* Select other workspace (for example new-old-school)



Current

* It will show 404 error as that new workspace don't have analyse book workflow

Desired

* It will return to dashboard screen of the new workspace

## Analysis

### Scope

**In scope:**
- When the user switches workspaces while viewing a workflow page (`/dashboard/workflows/<id>`), and the target workspace does not contain a workflow with that same `<id>`, the app should redirect to `/dashboard` (or `/dashboard/workflows`) instead of rendering a 404.
- The fix applies to the workspace activation flow in `WorkspaceSwitcher.tsx`.

**Out of scope:**
- Handling mismatched workflow *item* URLs (e.g., `/dashboard/workflows/foo?item=bar`) — this is a narrower edge case and can be addressed separately.
- Changes to the workspace activation API route itself (`/api/workspaces/[id]/activate/route.ts`).
- Workspace creation, deletion, or management flows.

### Feasibility

**Viable — low risk, small change surface.**

The root cause is well-understood: `WorkspaceSwitcher.activate()` (in `components/dashboard/WorkspaceSwitcher.tsx`, lines 41–57) sets the new workspace cookie and then reloads the current page via `router.refresh()` + `window.location.reload()`. If the current URL points to a workflow that doesn't exist in the new workspace, the server component at `app/dashboard/workflows/[id]/page.tsx` calls `notFound()` (line 19), producing a 404.

Two viable fix approaches:

1. **Client-side redirect on activate (recommended):** Change `WorkspaceSwitcher.activate()` to navigate to `/dashboard` (via `router.push('/dashboard')` or `window.location.href = '/dashboard'`) instead of reloading the current URL. This is the simplest fix — whenever you switch workspaces, you land on the dashboard of the new workspace. The sidebar re-fetches workflows from the new workspace automatically.

2. **Server-side fallback in the workflow page:** Modify `app/dashboard/workflows/[id]/page.tsx` to call `redirect('/dashboard')` instead of `notFound()` when the workflow doesn't exist. This catches the 404 more gracefully but is a broader change — it would also redirect for genuinely invalid workflow URLs (typos, deleted workflows), which may not be desirable.

**Risks:**
- Approach 1 changes the UX for *all* workspace switches (even when the workflow exists in both workspaces). If the user expects to stay on the same-named workflow after switching, they'd need to re-navigate. This is acceptable per the stated desired behavior ("return to dashboard screen").
- Approach 2 could mask legitimate 404s. A hybrid (redirect only when the workspace just changed) adds complexity for little gain.

### Dependencies

- **`components/dashboard/WorkspaceSwitcher.tsx`** — the `activate` callback is the primary change target.
- **`app/dashboard/workflows/[id]/page.tsx`** — secondary change target if approach 2 is chosen.
- **`lib/workspace-context.ts`** — provides `resolveWorkspaceRoot()` and `withWorkspace()`. No changes needed, but understanding these is required.
- **`lib/workflow-store.ts`** — provides `readWorkflowDetail()`. No changes needed.
- **`components/dashboard/Sidebar.tsx`** — re-fetches workflow list on pathname change. If the redirect changes the pathname, the sidebar will update automatically. No changes needed.

No external service or database dependencies.

### Open Questions

1. **Should the redirect always go to `/dashboard`, or to `/dashboard/workflows`?** The desired behavior says "dashboard screen" — confirming this means the root dashboard view, not the workflows listing.
2. **Should the app attempt to stay on the same workflow if it exists in both workspaces?** The current stated requirement says "return to dashboard", but a smarter approach could check whether the workflow exists in the target workspace first (would require an API call before navigating). This adds complexity and latency — likely not worth it for v1.
3. **Does this also apply to other deep-linked pages** (e.g., `/dashboard/files/...`)? If so, the fix scope widens. For now, treating this as workflow-specific based on the reproduction steps.

## Specification

### User Stories

1. **As an** operator, **I want** switching workspaces to land me on the dashboard of the new workspace, **so that** I never see a 404 error when the new workspace lacks the workflow I was viewing.

2. **As an** operator, **I want** the sidebar to show the new workspace's workflows immediately after switching, **so that** I can navigate to any workflow available in that workspace.

### Acceptance Criteria

1. **AC-1: Redirect to dashboard on workspace switch.**
   Given the operator is viewing `/dashboard/workflows/<id>`,
   when they activate a different workspace via the WorkspaceSwitcher,
   then the browser navigates to `/dashboard` (not the current URL).

2. **AC-2: Redirect applies regardless of workflow existence.**
   Given the operator activates a new workspace,
   when the new workspace contains a workflow with the same `<id>`,
   then the redirect still goes to `/dashboard` (no attempt to stay on the same workflow).

3. **AC-3: Redirect applies from any dashboard sub-route.**
   Given the operator is on any `/dashboard/**` sub-route (workflows, files, settings, activity, terminal),
   when they activate a different workspace,
   then the browser navigates to `/dashboard`.

4. **AC-4: Sidebar re-fetches after redirect.**
   Given the operator has switched workspaces and landed on `/dashboard`,
   when the page loads,
   then the Sidebar displays the new workspace's workflow list (not the old workspace's).

5. **AC-5: No 404 page rendered.**
   Given the operator switches from workspace A (which has workflow X) to workspace B (which does not have workflow X),
   when the activation completes,
   then no `notFound()` / 404 page is shown at any point during the transition.

6. **AC-6: Loading state during switch.**
   Given the operator clicks a workspace in the switcher dropdown,
   when the activation request is in flight,
   then the switcher button remains disabled (existing `loading` state) until navigation completes.

### Technical Constraints

1. **Primary change file:** `components/dashboard/WorkspaceSwitcher.tsx` — the `activate` callback (lines 41–57).
2. **Navigation method:** Replace `router.refresh()` + `window.location.reload()` with `window.location.href = '/dashboard'`. Using `window.location.href` ensures the full page reloads with the new workspace cookie, which is necessary because server components read the cookie at request time. A client-side `router.push('/dashboard')` alone would not force the server components to re-execute with the new cookie.
3. **No changes to the workflow page:** `app/dashboard/workflows/[id]/page.tsx` retains its `notFound()` call for genuinely invalid workflow URLs (typos, deleted workflows). The fix prevents the user from ever hitting that path during a workspace switch.
4. **No new API calls:** The fix does not require checking whether a workflow exists in the target workspace before navigating. This avoids added latency and API complexity.
5. **Cookie mechanism unchanged:** The `nos_workspace` cookie is still set by the `/api/workspaces/[id]/activate` POST endpoint. No changes to `lib/workspace-context.ts` or the activation API route.
6. **Sidebar auto-refresh:** `components/dashboard/Sidebar.tsx` already re-fetches the workflow list when the pathname changes. Navigating to `/dashboard` triggers this automatically.

### Out of Scope

1. **Smart same-workflow detection:** Checking whether the target workspace has a workflow with the same ID and staying on it if so. This adds latency and complexity for minimal UX benefit and can be revisited as a future enhancement.
2. **Mismatched item URLs:** Handling `/dashboard/workflows/foo?item=bar` where the item doesn't exist — a separate, narrower edge case.
3. **Workspace activation API changes:** The `/api/workspaces/[id]/activate` route is not modified.
4. **Non-dashboard routes:** If the operator is outside `/dashboard/**` when switching workspaces, no redirect is needed (the workspace switcher is only rendered within the dashboard shell).
5. **Workspace creation, deletion, or management flows.**

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00108 |
| **Title** | Workspace switch redirects to dashboard instead of showing 404 |
| **Source** | Bug report (operator reproduction steps) |
| **Design Artifact** | `docs/standards/ux-design.md`, `docs/standards/system-architecture.md` |
| **Implementation File(s)** | `components/dashboard/WorkspaceSwitcher.tsx` |
| **Test Coverage** | Manual validation against AC-1 through AC-6 |
| **Status** | In Progress |

### WBS Mapping

| WBS Package | Deliverable | Relationship |
|-------------|-------------|--------------|
| **1.4.1 Dashboard Shell** | Workspace switcher navigation behavior | Primary — the fix modifies the workspace activation callback within the dashboard shell |
| **1.4.11 Workspace Management** | Workspace switch UX | Secondary — the fix ensures workspace switching produces a valid navigation target |
| **1.6.5 Workspace Context** | Cookie-based workspace resolution | Reference only — no changes, but the fix relies on cookie being set before navigation |

## Implementation Notes

- **File changed:** `components/dashboard/WorkspaceSwitcher.tsx`
- **Change summary:** Replaced `router.refresh()` + `setTimeout(() => window.location.reload(), 50)` with `window.location.href = '/dashboard'` in the `activate` callback. This ensures the browser always navigates to `/dashboard` after activating a new workspace, regardless of what URL the operator was on — eliminating the 404 when the target workspace lacks the current workflow. The `useRouter` import and `router` variable were removed as they are no longer used. No other files were modified. All acceptance criteria are satisfied by this single change.

## Validation

**Evidence method:** Code inspection of `components/dashboard/WorkspaceSwitcher.tsx` (the sole changed file) plus structural review of `components/dashboard/Sidebar.tsx`.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Redirect to `/dashboard` on workspace switch | u2705 Pass | `activate` callback sets `window.location.href = '/dashboard'` unconditionally after `res.ok`. |
| AC-2 | Redirect applies regardless of workflow existence in new workspace | u2705 Pass | Navigation is unconditional — no check on whether the workflow exists in the target workspace. |
| AC-3 | Redirect from any `/dashboard/**` sub-route | u2705 Pass | `window.location.href = '/dashboard'` is an absolute URL assignment; it works from any current URL. |
| AC-4 | Sidebar re-fetches new workspace's workflows after redirect | u2705 Pass | `Sidebar.tsx` fetches `/api/workflows` on mount (`useEffect` with `[]` dep). Full-page reload via `window.location.href` causes re-mount → re-fetch with the new `nos_workspace` cookie already set. |
| AC-5 | No 404 rendered during transition | u2705 Pass | User is navigated to `/dashboard` before any sub-page is rendered with the old workflow URL. The `notFound()` path in the workflow page is never reached during a switch. |
| AC-6 | Button disabled during activation request | u2705 Pass | `setLoading(true)` fires before `fetch`; button has `disabled={loading}`; `window.location.href` starts navigation immediately after `res.ok`, so the page unloads while the button is still disabled. |

**Additional checks:**
- `useRouter` import and `router` variable are absent — confirmed removed as specified.
- No other files were modified — scope kept minimal.
- `tsc` clean; no new type errors introduced.

**Conclusion:** All 6 acceptance criteria pass. Implementation is correct and minimal.
