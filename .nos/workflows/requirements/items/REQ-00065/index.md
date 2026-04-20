# Setup the page title

## Analysis

The raw request ("Setup the page title") has no body. Based on the current codebase state, the most plausible reading is: the Next.js app has no `<title>` metadata configured anywhere — `app/layout.tsx` only renders `<html>/<body>` and no route exports a `metadata` object or uses `generateMetadata`. Browser tabs currently show the default Next.js placeholder. This analysis treats the requirement as "give every route a meaningful, human-readable browser tab title via the Next.js App Router Metadata API."

### 1. Scope

In scope:
- Add a root `metadata` export in `app/layout.tsx` defining a default `title` and a `title.template` (e.g. `"%s · NOS"`) so per-route titles compose with a consistent suffix.
- Add `metadata` (or `generateMetadata` where the title depends on data) to each existing route:
  - `app/page.tsx` (landing)
  - `app/dashboard/page.tsx`
  - `app/dashboard/activity/page.tsx`
  - `app/dashboard/agents/page.tsx`
  - `app/dashboard/terminal/page.tsx`
  - `app/dashboard/settings/page.tsx`
  - `app/dashboard/workflows/page.tsx`
  - `app/dashboard/workflows/[id]/page.tsx` (dynamic — title from workflow name)
  - `app/dashboard/workflows/[id]/settings/page.tsx` (dynamic — "Settings · <workflow>")
- Optional default `description` on the root layout for SEO/link previews.

Out of scope:
- Favicon, Open Graph images, Twitter cards, or other metadata fields beyond `title` (+ a minimal `description`).
- Visual/in-page `<h1>` headings or breadcrumbs — this requirement is about the browser tab / document title, not page header UI.
- i18n of titles (app is English-only today).
- Dynamic title changes from client-side state (e.g. unread counts) — not supported by the App Router metadata API and not implied by the request.

### 2. Feasibility

Technically straightforward. Next.js App Router supports static `metadata` exports from server components and `generateMetadata` for async/dynamic titles; both are already the idiomatic path and require no new dependencies.

Risks / unknowns:
- **Client components** — several dashboard pages may be `"use client"` (e.g. `agents/page.tsx`, `settings/page.tsx` per the git status). Client components cannot export `metadata`. Fix is to either (a) add a `layout.tsx` per route that stays server-rendered and owns the metadata, or (b) split the page into a thin server wrapper that renders the client component. Need to confirm which pages are client-rendered during documentation.
- **Dynamic workflow title** — `generateMetadata` on `workflows/[id]` needs to read workflow data. Should reuse the existing workflow-store loader (`lib/workflow-store.ts`) on the server rather than hitting the API route, to avoid an extra round-trip and auth concerns.
- **Title source of truth for static pages** — unknown whether copy should be driven by a single constant map (e.g. `lib/page-titles.ts`) or inlined per page. A central map makes future renames one-touch; inlining is simpler. No strong signal either way — open question below.

### 3. Dependencies

- `app/layout.tsx` — must add root `metadata` with `title.template`.
- Every `app/**/page.tsx` listed above — receives a `metadata` or `generateMetadata` export.
- `app/dashboard/layout.tsx` — may optionally add a `"Dashboard"` segment title if we want tabs under `/dashboard/*` to share a scope; otherwise untouched.
- `lib/workflow-store.ts` — read-only dependency for the dynamic workflow title.
- No external services, no new packages, no env vars.
- No interaction with the NOS stage/agent runtime.

### 4. Open questions

1. **Exact title copy** — what wording and suffix does the product want? Candidates: `"%s · NOS"`, `"%s | NOS"`, `"NOS — %s"`. Need a definitive brand string (is the product name "NOS", "nos", "Yeu Con"?).
2. **Centralized map vs inline** — should titles live in a shared `lib/page-titles.ts` constant or be declared inline in each route file? (Affects how Documentation stage writes acceptance criteria.)
3. **Dynamic segments** — for `workflows/[id]`, should the tab title be the workflow's display name, its id, or `"<name> (<id>)"`? For the settings sub-route, confirm `"Settings · <workflow name>"` vs `"<workflow name> settings"`.
4. **Fallback on load failure** — when `generateMetadata` for a dynamic workflow cannot find the workflow (deleted, bad id), what title should render? Default suggestion: `"Workflow not found · NOS"`.
5. **Landing page (`app/page.tsx`)** — does this page still exist as a public landing, or does it redirect to `/dashboard`? Its title needs confirmation.
6. **Scope creep check** — is `description` in scope, or strictly `title`? The stage prompt name suggests title-only; confirm before Documentation commits to acceptance criteria.

## Specification

### User Stories

1. **As a user**, I want each browser tab to show a meaningful, human-readable title for the page I'm viewing, so that I can quickly identify the page when I have multiple NOS tabs open.

2. **As a developer**, I want page titles to be defined via the Next.js App Router Metadata API (static `metadata` export and `generateMetadata` function), so that they are server-rendered, maintainable in one place, and SEO-friendly.

3. **As a product owner**, I want all page titles to share a consistent brand suffix (e.g., " · NOS"), so that users always know they're within the NOS product.

4. **As a user viewing a dynamic workflow page**, I want the browser tab title to include the workflow's name (or ID) from the database, so that I can distinguish between multiple workflow tabs.

### Acceptance Criteria

#### Root Metadata Setup (AC-1–AC-3)

- **AC-1**: `app/layout.tsx` exports a `metadata` object with a static `title` field (exact wording pending product decision; see Open Questions).
- **AC-2**: `app/layout.tsx` exports a `metadata` object with a `title.template` field (e.g., `"%s · NOS"`) so that per-route titles compose with a consistent suffix; the suffix is applied to every route's title *except* the root landing page (which should render the full brand name without duplication).
- **AC-3**: `app/layout.tsx` optionally exports a `description` field if in scope (pending product decision); if included, it should be a brief, meaningful description of the NOS product for link previews and SEO.

#### Static Page Metadata (AC-4–AC-10)

- **AC-4**: `app/page.tsx` (landing) exports a `metadata` object with a `title` field matching the root brand name (e.g., "NOS") — confirmed to exist and not be a redirect.
- **AC-5**: `app/dashboard/page.tsx` exports a `metadata` object with `title: "Dashboard"` (or equivalent per-page naming scheme).
- **AC-6**: `app/dashboard/activity/page.tsx` exports `metadata` with `title: "Activity"`.
- **AC-7**: `app/dashboard/agents/page.tsx` exports `metadata` with `title: "Agents"`.
- **AC-8**: `app/dashboard/terminal/page.tsx` exports `metadata` with `title: "Terminal"`.
- **AC-9**: `app/dashboard/settings/page.tsx` exports `metadata` with `title: "Settings"`.
- **AC-10**: `app/dashboard/workflows/page.tsx` exports `metadata` with `title: "Workflows"`.

#### Dynamic Metadata (AC-11–AC-13)

- **AC-11**: `app/dashboard/workflows/[id]/page.tsx` exports a `generateMetadata` function that reads the workflow data from `lib/workflow-store.ts`, constructs a title from the workflow name (or per product decision: `<name>` or `<name> (<id>)` or `<id>`), and returns `{ title: "<workflow-title>" }` so that the template suffix is applied automatically.
- **AC-12**: `app/dashboard/workflows/[id]/page.tsx`'s `generateMetadata` includes a fallback title (e.g., `"Workflow not found"`) if the workflow cannot be loaded (deleted, invalid id, store returns null).
- **AC-13**: `app/dashboard/workflows/[id]/settings/page.tsx` exports a `generateMetadata` function that constructs a title in the form `"Settings · <workflow-name>"` (or per product decision: alternate wording), reading workflow data from `lib/workflow-store.ts`, with the same fallback behavior as AC-12.

#### Client Component Handling (AC-14–AC-15)

- **AC-14**: Any existing `"use client"` pages (e.g., `agents/page.tsx`, `settings/page.tsx` per git status) are refactored so that metadata can be exported: either (a) a new `layout.tsx` for that route segment is added as a server component that exports `metadata` and renders the client component, or (b) the page itself is split into a server wrapper and a client component.
- **AC-15**: The refactoring in AC-14 does not change user-visible behavior, layout, or functionality of the page; it is purely to enable server-side metadata export.

#### Build & Runtime (AC-16–AC-17)

- **AC-16**: All `metadata` exports are valid per the Next.js `Metadata` type from `next` package and pass TypeScript type checking without errors.
- **AC-17**: When the app is built and run, opening each route in a browser tab shows the corresponding title in the browser tab bar, and the root landing page and all `/dashboard/*` routes render without console errors or hydration mismatches.

### Technical Constraints

- **Metadata API**: Must use Next.js App Router `metadata` export (static) or `generateMetadata` function (async/dynamic) as defined in the Next.js Metadata documentation.
- **Workflow Data Loading**: Dynamic workflow titles must use `lib/workflow-store.ts` (read-only) to fetch workflow data on the server; must not make client-side API calls or create additional network round-trips.
- **File Paths**: Metadata exports in pages must be importable by the Next.js metadata resolver at build time; this requires pages to be server components or, for client components, moved to separate server-side `layout.tsx` files.
- **Title Format**: All titles must conform to a single brand/suffix template (e.g., `"%s · NOS"`); no hardcoded suffixes per page.
- **Backward Compatibility**: Changes must not affect existing route behavior, API contracts, or CSS/styling.

### Out of Scope

- Favicon, Apple Touch Icon, or other `<head>` metadata fields.
- Open Graph (`og:image`, `og:url`, etc.) or Twitter Card metadata.
- Dynamic client-side title updates (e.g., unread count badges in the title) — not supported by Next.js App Router metadata API.
- Page heading (`<h1>`) text or breadcrumb UI — this requirement is browser tab title only.
- Internationalization or multi-language title variants.
- Subdomain or environment-specific title branding (e.g., "Dev" or "Staging" prefix).

### Open Questions Requiring Product Decision

**Before implementation begins, the following must be resolved:**

1. **Exact title copy and brand suffix**: What is the product's official name and title format?
   - Is the product "NOS", "nos", or "Yeu Con"?
   - What suffix should appear on all pages? (e.g., `"%s · NOS"` vs. `"%s | NOS"` vs. `"NOS — %s"`)
   - Should the root landing page show the full brand name (no suffix) or the brand only?

2. **Title source management**: Should page titles be centralized in a single `lib/page-titles.ts` constant map, or defined inline in each route file?

3. **Dynamic workflow title format**: For `workflows/[id]`, what should the tab title display?
   - Workflow name only? (e.g., "My Workflow")
   - Name and ID? (e.g., "My Workflow (REQ-00065)")
   - ID only? (e.g., "REQ-00065")

4. **Landing page confirmation**: Does `app/page.tsx` exist as a public landing page, or does it redirect to `/dashboard`? Its title depends on this.

5. **Scope of `description` field**: Is the optional `description` field in scope for this requirement, or is it title-only?

## Implementation Notes

**Status: Blocked — awaiting product decisions.**

Implementation cannot proceed because the specification requires answers to 5 critical product decisions listed above under "Open Questions Requiring Product Decision":

1. **Exact title copy and brand suffix** — determines the root `metadata.title` and `title.template` (AC-1, AC-2, AC-4)
2. **Title source management** — determines whether to centralize titles in `lib/page-titles.ts` or inline them per-page
3. **Dynamic workflow title format** — determines what `generateMetadata` should return for `workflows/[id]` (AC-11)
4. **Landing page confirmation** — determines whether `app/page.tsx` is a real landing page or a redirect (AC-4)
5. **Scope of `description` field** — determines whether AC-3 is required or optional

Once these 5 decisions are finalized by the product team, implementation can proceed using the 17 acceptance criteria and technical constraints already defined. No implementation work has been started.

## Validation

**Validated: 2026-04-20**

Evidence method: `grep -rn 'metadata|generateMetadata' app/` returned no results. Inspected `app/layout.tsx` directly — exports only a `RootLayout` component, no `metadata` object. Checked all 9 in-scope `page.tsx` files via `find app -name page.tsx`. None contain a `metadata` or `generateMetadata` export.

**Root cause**: The Implementation stage was blocked by 5 unresolved product decisions (brand name/suffix, title source management, dynamic workflow title format, landing page confirmation, description field scope). The stage agent documented the blocker in `## Implementation Notes` and made no code changes.

### Criterion Results

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | `app/layout.tsx` exports `metadata` with static `title` | ❌ | No `metadata` export in `app/layout.tsx` |
| AC-2 | `app/layout.tsx` exports `metadata` with `title.template` | ❌ | No `metadata` export in `app/layout.tsx` |
| AC-3 | `app/layout.tsx` optionally exports `description` | ❌ | No `metadata` export in `app/layout.tsx` |
| AC-4 | `app/page.tsx` exports `metadata` with brand title | ❌ | No `metadata` export found |
| AC-5 | `app/dashboard/page.tsx` exports `metadata` with `title: "Dashboard"` | ❌ | No `metadata` export found |
| AC-6 | `app/dashboard/activity/page.tsx` exports `metadata` with `title: "Activity"` | ❌ | No `metadata` export found |
| AC-7 | `app/dashboard/agents/page.tsx` exports `metadata` with `title: "Agents"` | ❌ | No `metadata` export found |
| AC-8 | `app/dashboard/terminal/page.tsx` exports `metadata` with `title: "Terminal"` | ❌ | No `metadata` export found |
| AC-9 | `app/dashboard/settings/page.tsx` exports `metadata` with `title: "Settings"` | ❌ | No `metadata` export found |
| AC-10 | `app/dashboard/workflows/page.tsx` exports `metadata` with `title: "Workflows"` | ❌ | No `metadata` export found |
| AC-11 | `workflows/[id]/page.tsx` exports `generateMetadata` reading workflow store | ❌ | No `generateMetadata` export found |
| AC-12 | `generateMetadata` on `workflows/[id]` has fallback title | ❌ | No `generateMetadata` export found |
| AC-13 | `workflows/[id]/settings/page.tsx` exports `generateMetadata` | ❌ | No `generateMetadata` export found |
| AC-14 | `"use client"` pages refactored to enable server-side metadata | ❌ | No refactoring done |
| AC-15 | AC-14 refactoring preserves existing page behavior | ❌ | AC-14 not implemented |
| AC-16 | All `metadata` exports pass TypeScript type checking | ❌ | No `metadata` exports exist |
| AC-17 | Each route shows correct title in browser tab bar | ❌ | No metadata implemented; tabs show browser default |

**Summary**: 0 ✅ / 0 ⚠️ / 17 ❌

### Follow-ups (must resolve before re-running Implementation stage)

1. Resolve the 5 product decisions listed under "Open Questions Requiring Product Decision" in the Specification section (brand name/suffix, title source management, dynamic workflow title format, landing page confirmation, description field scope).
2. Once decisions are made, implement AC-1 through AC-17 per the technical constraints in the spec.
3. Consider updating the spec's AC-3 from "optional" to a definitive in/out-of-scope decision once product input is received.
