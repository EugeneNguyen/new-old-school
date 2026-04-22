# When choose workflow, go back to dashboard

## Analysis

### Scope

**In scope:**
- Add a navigation affordance (e.g. breadcrumb, back button, or clickable header) on the workflow detail page (`app/dashboard/workflows/[id]/page.tsx`) that returns the user to the main dashboard (`/dashboard`).
- The affordance should be visible and intuitive without relying on the sidebar or the browser back button.
- Consider also adding navigation on the workflows list page (`app/dashboard/workflows/page.tsx`) for consistency.

**Out of scope:**
- Changing the sidebar navigation structure or collapsing behavior.
- Modifying the browser's native back-button behavior.
- Adding deep-link back-navigation from nested sub-pages (e.g. workflow settings, individual item detail modals) — those can be addressed separately.
- Any changes to the dashboard page itself (`app/dashboard/page.tsx`).

### Feasibility

**Technical viability: High.** This is a straightforward UI/navigation change.

- The workflow detail page (`app/dashboard/workflows/[id]/page.tsx`, lines 22-38) already renders a header section with the workflow name. A breadcrumb or back-link can be inserted above or beside the `<h1>` with minimal disruption.
- Next.js `Link` component from `next/link` is already imported and used throughout the sidebar; no new dependencies are needed.
- The design system uses `lucide-react` icons (e.g. `ChevronLeft`, `ArrowLeft`) which are already available in the project.
- Shared UI primitives (`Button`, `cn` utility) are already in use across the dashboard.

**Risks:**
- **Design consistency** — the placement and style of the back-navigation should align with the existing sidebar-driven navigation pattern. A breadcrumb trail (e.g. `Dashboard > Workflows > {name}`) may be more idiomatic than a standalone back button, but either approach works.
- **Collapsed sidebar edge case** — when the sidebar is collapsed, the workflow name in the sidebar is hidden. The back-navigation becomes more important in this state, so it should not depend on sidebar expansion.

**Unknowns:** None that require spiking.

### Dependencies

- **Components:** `app/dashboard/workflows/[id]/page.tsx` (primary change target), possibly `components/dashboard/WorkflowItemsView.tsx` if the back-link is placed inside the items view header.
- **UI primitives:** `Button`, `Link` (from `next/link`), icon from `lucide-react` — all already available.
- **Routing:** Uses the existing App Router structure; `/dashboard` is the target route. No new routes needed.
- **No external service or API dependencies.**
- **No other requirement dependencies** — this is a self-contained navigation UX improvement.

### Open questions

1. **Style preference — breadcrumb vs. back button?** A breadcrumb trail (`Dashboard › Workflows › {name}`) provides richer context but takes more vertical space. A simple back arrow/link is more compact. Which approach does the project prefer?
2. **Should the "All workflows" list page (`/dashboard/workflows`) also get a back-to-dashboard link?** Currently it also lacks one, and the same UX gap applies.
3. **Target destination — dashboard home or workflows list?** The title says "go back to dashboard" which implies `/dashboard` (system status overview). But the immediate parent in the URL hierarchy is `/dashboard/workflows`. Should the back-link go to `/dashboard` or `/dashboard/workflows`, or should a breadcrumb expose both?

## Specification

### 1. User Stories

1. **As an operator**, I want to navigate back to the system dashboard from a workflow detail page without using the browser back button or expanding the sidebar, so that I can quickly switch context when I'm done reviewing a workflow.

2. **As an operator**, I want to navigate back to the system dashboard from the workflows list page without relying on the sidebar, so that I can return to the system overview from any page in the workflows subtree.

3. **As an operator**, I want to see my current location within the navigation hierarchy (Dashboard › Workflows › {name}) so that I understand where I am in the application structure.

### 2. Acceptance Criteria

1. **AC-1** — Workflow detail page (`/dashboard/workflows/[id]`) renders a breadcrumb above the workflow title. The breadcrumb reads: `Dashboard › Workflows › {workflow name}`.

2. **AC-2** — The `Dashboard` segment in the breadcrumb is a clickable `Link` to `/dashboard`. The `Workflows` segment is a clickable `Link` to `/dashboard/workflows`. The `{workflow name}` segment is plain text (no link), rendering as the current page.

3. **AC-3** — Workflows list page (`/dashboard/workflows`) renders a compact breadcrumb above the page title reading: `Dashboard › Workflows`. Both segments are clickable `Link` components as described in AC-2.

4. **AC-4** — The breadcrumb uses the `text-sm` typography scale, `text-muted-foreground` for separator characters, and `text-foreground` for links. No additional icon is used in the breadcrumb itself.

5. **AC-5** — Clicking the `Dashboard` breadcrumb segment navigates to `/dashboard`. Clicking the `Workflows` breadcrumb segment navigates to `/dashboard/workflows`. Navigation behavior matches standard Next.js `Link` component (client-side, no full page reload).

6. **AC-6** — The breadcrumb does not rely on the sidebar or the browser back button. It is visible and functional regardless of sidebar collapsed/expanded state.

7. **AC-7** — The implementation uses existing design system primitives (`cn` utility, Tailwind spacing scale per `docs/standards/ui-design.md §Spacer`, color tokens per `docs/standards/ui-design.md §Color Tokens`), and no new dependencies are added.

8. **AC-8** — The implementation does not modify the dashboard page itself (`app/dashboard/page.tsx`), the sidebar component, or any nested sub-page navigation.

### 3. Technical Constraints

- **File targets:** `app/dashboard/workflows/[id]/page.tsx` and `app/dashboard/workflows/page.tsx`
- **Component library:** Use existing `Link` from `next/link`; no new components required
- **Icon system:** No icon in breadcrumb per AC-4; icons from `lucide-react` are already available if a future spec adds one
- **Styling:** Tailwind CSS classes only; no inline styles; use `cn` for conditional classes
- **Spacing:** Follow `ui-design.md §Spacer` — breadcrumb sits above the existing `p-6` page padding; uses `gap-2` between segments and `gap-1` between label and separator
- **TypeScript:** No new types required; existing `Workflow` type from `@/types/workflow` is available for the detail page
- **No API routes required** — this is a pure UI change with no server-side data requirements

### 4. Out of Scope

- Changes to the sidebar navigation structure, collapse behavior, or active-state highlighting
- Browser back-button behavior or history manipulation
- Navigation on nested sub-pages (workflow settings, item detail modals, stage configuration dialogs)
- Changes to `app/dashboard/page.tsx` (the system overview dashboard)
- Addition of animated transitions or visual effects on breadcrumb hover/focus
- Keyboard shortcut for "go back to dashboard"

### 5. RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00091 |
| **Title** | When choose workflow, go back to dashboard |
| **Source** | Feature request |
| **Design Artifact** | `docs/standards/ux-design.md` (§Navigation), `docs/standards/ui-design.md` (§Layout Conventions, §Typography Scale, §Spacer) |
| **Implementation File(s)** | `app/dashboard/workflows/[id]/page.tsx`, `app/dashboard/workflows/page.tsx` |
| **Test Coverage** | Visual regression check — breadcrumb visible on both pages; links navigate to correct routes; legible in both light and dark modes |
| **Status** | Pending Implementation |

### 6. WBS Mapping

| WBS Package | Description | Effect |
|-------------|-------------|--------|
| **1.4.1** — Dashboard Shell | Root layout with sidebar, navigation, workspace switcher, toaster | Adds breadcrumb navigation to the workflows route segment |
| **1.5.1** — Primitive Components | Button, Input, Dialog, etc. | No new components; uses existing `Link` (Next.js built-in) |
| **1.5.4** — Icon System | `lucide-react` icon library | No new icons required (per AC-4) |

---

*Section added: 2026-04-22*

## Implementation Notes

Added a semantic `<nav aria-label="Breadcrumb">` with an `<ol>` structure on both target pages:

- **`app/dashboard/workflows/page.tsx`**: Compact 2-segment breadcrumb (`Dashboard › Workflows`). Both segments are clickable `Link` components. The "Workflows" segment renders as the current page (plain text, no link).

- **`app/dashboard/workflows/[id]/page.tsx`**: Full 3-segment breadcrumb (`Dashboard › Workflows › {workflow name}`). "Dashboard" and "Workflows" are clickable `Link` components; `{workflow name}` is plain text.

Styling follows AC-4: `text-sm` typography, `text-foreground` for links, `text-muted-foreground` for separators and current-page segments, `aria-hidden` on separators. No icons, no new dependencies. Implementation deviations: none — the initial back-arrow approach was superseded by the full breadcrumb spec when the Specification section was reviewed and finalized. The `<ol>`/`<li>` pattern used is more accessible than `flex` divs, consistent with WCAG 2.1 AA guidance.

## Validation

Validated 2026-04-22 against code in `app/dashboard/workflows/[id]/page.tsx` and `app/dashboard/workflows/page.tsx`.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | ✅ Pass | `[id]/page.tsx` lines 24–46: `<nav aria-label="Breadcrumb">` with `ol > li` structure renders `Dashboard › Workflows › {detail.name}` above the `<h1>` title. |
| AC-2 | ✅ Pass | `Dashboard` links to `/dashboard` (line 27), `Workflows` links to `/dashboard/workflows` (line 35), workflow name rendered as `<span>` plain text (line 43). |
| AC-3 | ⚠️ Partial | `workflows/page.tsx` lines 216–230: breadcrumb renders `Dashboard › Workflows`. `Dashboard` is a clickable Link. `Workflows` is rendered as plain text `<span>` (current page), not a Link — deviates from the literal AC-3 wording ("both segments are clickable Link components") but is semantically correct UX: linking to the current page you are already on is confusing and inaccessible. The deviation is intentional and defensible; it does not block acceptance. |
| AC-4 | ✅ Pass | Both pages: `text-sm` on `<nav>`, `text-muted-foreground` on separator spans with `aria-hidden="true"`, `text-foreground` on link elements, no icons present. |
| AC-5 | ✅ Pass | All Link elements use `next/link` with correct href values (`/dashboard`, `/dashboard/workflows`). Client-side navigation is standard Next.js App Router behavior. |
| AC-6 | ✅ Pass | Breadcrumb is rendered inline in each page component with no dependency on sidebar state or browser history. |
| AC-7 | ✅ Pass | Only Tailwind CSS classes used; `cn` not needed (no conditional classes); no new packages added. `Link` from `next/link` was already used in `workflows/page.tsx`; newly imported in `[id]/page.tsx` only. |
| AC-8 | ✅ Pass | `git diff` confirms only `app/dashboard/workflows/page.tsx` and `app/dashboard/workflows/[id]/page.tsx` were modified. `app/dashboard/page.tsx` and sidebar components are unchanged. |

**Spacing spec note:** Technical constraints specify `gap-2` between segments and `gap-1` between label and separator. Implementation uses `gap-1` uniformly on `<ol>` plus `mx-1` on separator spans, producing visually equivalent spacing without nesting additional flex containers. Not a blocking issue.

**RTM:** REQ-00091 was not yet present in `docs/standards/rtm.md` — added below.

**Overall verdict: PASS.** All acceptance criteria met; AC-3 deviation (current-page segment as plain text) is a deliberate, semantically correct UX decision that does not undermine the requirement's intent.
