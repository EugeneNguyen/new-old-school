
## Analysis

### 1. Scope

**In scope**
- The NOS dashboard web UI served by `app/dashboard/**` — the only user-facing surface of this repo. Concretely:
  - Shell: `app/dashboard/layout.tsx` + `components/dashboard/Sidebar.tsx` (currently a fixed 16rem/4rem aside that assumes desktop viewport width).
  - Workflow pages: `app/dashboard/workflows/**`, driven by `components/dashboard/WorkflowItemsView.tsx`, `KanbanBoard.tsx`, `ListView.tsx`.
  - Item surfaces: `ItemDetailDialog.tsx`, `NewItemDialog.tsx`, `StageDetailDialog.tsx`, `ItemDescriptionEditor.tsx` (MDX editor).
  - Activity, agents, settings, and terminal pages under `app/dashboard/{activity,agents,settings,terminal}` and `components/terminal/**`.
  - Root landing page `app/page.tsx` and dashboard index `app/dashboard/page.tsx`.
- Touch/pointer affordances for drag-and-drop on the Kanban board (currently HTML5 drag, which is unreliable on mobile).
- Viewport meta, safe-area insets, and Tailwind breakpoint strategy across the UI.

**Explicitly out of scope**
- Native iOS/Android apps — this stays a responsive web app.
- Offline / PWA install, push notifications, service workers.
- Redesigning the information architecture, navigation model, or feature set.
- Changes to the NOS runtime, CLI (`bin/cli.js`), workflow file format, or agent adapter logic — this requirement is UI-only.
- Server-rendered terminal/xterm behavior beyond making its chrome usable on small screens (a fully mobile terminal UX is a separate initiative).

### 2. Feasibility

Overall: **feasible and mostly incremental**. Tailwind is already configured and some components (`ListView`, `WorkflowItemsView`, `ItemDetailDialog`, `NewItemDialog`) already use `sm:` / `md:` breakpoints, so the pattern is established. Risk is concentrated in a few hotspots rather than in the codebase as a whole.

**Main risks / unknowns**
- **Sidebar on mobile.** `Sidebar.tsx` is a persistent `<aside>` inside a `flex h-screen` layout with no mobile drawer/hamburger; `SidebarContext` only exposes `collapsed`, not a separate open/closed state for an overlay. Needs a new responsive pattern (off-canvas drawer under a breakpoint + existing collapse behavior above it). Low technical risk, moderate design risk.
- **Kanban drag-and-drop.** `KanbanBoard.tsx` uses native HTML5 drag events (`draggable`, `onDragOver`, `onDrop`). These are known to be flaky/absent on mobile Safari and Chrome. Options: (a) keep DnD desktop-only and add a tap-to-move action for mobile, (b) adopt a library like `@dnd-kit/core` that supports pointer/touch sensors. Needs a spike to pick. The board also uses `flex gap-4 overflow-x-auto` — horizontal scroll works, but column width needs a mobile-friendly min-width.
- **Dialogs.** `ItemDetailDialog` and `NewItemDialog` use a `md:grid-cols-[1fr_220px]` two-pane layout and `max-h-[70vh]` on the aside; the underlying `components/ui/dialog.tsx` (not yet audited in depth) likely needs full-screen behavior under `sm`.
- **MDX editor.** `@mdxeditor/editor` toolbar is wide and not known to be mobile-optimized. May need toolbar truncation, overflow menu, or a switch to plain textarea on narrow viewports.
- **Markdown preview.** `@uiw/react-markdown-preview` output can overflow horizontally (wide tables, long code blocks). Need `overflow-x-auto` wrappers and word-break rules.
- **Terminal page.** `components/terminal/**` likely hosts an xterm/shell view that is intrinsically hard to use on phones; scope for this requirement is chrome/layout only, not the terminal itself.
- **Viewport meta & safe areas.** `app/layout.tsx` is currently 14 lines; need to confirm it sets `viewport` correctly and supports iOS safe-area insets (`env(safe-area-inset-*)`).
- **Tap-target sizing.** Many controls use `py-1.5` / `h-9`; minimum 44×44px touch targets may require size bumps under the `sm` breakpoint.
- **Global CSS.** `app/globals.css` and `tailwind.config.js` may need additional screen breakpoints or container queries; needs a quick audit before picking the strategy.

**Non-risks (already OK-ish)**
- Tailwind + Next.js App Router make responsive work straightforward.
- Some list/filter surfaces already collapse to stacked layouts via `sm:` classes.

### 3. Dependencies

- **Internal components**: `Sidebar`, `SidebarContext`, `KanbanBoard`, `ListView`, `WorkflowItemsView`, `ItemDetailDialog`, `NewItemDialog`, `StageDetailDialog`, `ItemDescriptionEditor`, `components/ui/{dialog,button,input,card,scroll-area,badge}`, `components/terminal/**`.
- **Layout roots**: `app/layout.tsx`, `app/dashboard/layout.tsx`, `app/globals.css`, `tailwind.config.js`.
- **Third-party packages** with mobile-behavior implications:
  - `@mdxeditor/editor` (rich-text toolbar) — may drive a spike or a library swap.
  - `@uiw/react-markdown-preview` + `rehype-sanitize` + `remark-breaks` (overflow handling).
  - `@radix-ui/react-slot` / Radix primitives used by `components/ui/dialog.tsx` (full-screen variant).
  - `lucide-react` icons (already fine).
- **Possible new dependency**: `@dnd-kit/core` (only if we decide to support DnD on touch). Not required if we gate DnD to desktop.
- **Related prior requirements** that touched the same files and may conflict / compose:
  - REQ-00045 activity log, REQ-00046 status indicator, REQ-00047 click-to-open, REQ-00048 footer copy — the last four validated commits all landed in the same Sidebar/WorkflowItemsView/KanbanBoard surface, so coordinate merges carefully.
- **External**: none — no backend/API changes expected.

### 4. Open questions

1. **Target breakpoints.** What is the minimum supported viewport — 320px (iPhone SE) or 375px? And what is the tablet breakpoint cutover (Tailwind `md` = 768px by default)?
2. **Browser / device matrix.** iOS Safari + Android Chrome only, or also mobile Firefox / Samsung Internet? Any minimum iOS/Android version?
3. **Kanban on mobile.** Drag-and-drop via touch (pulls in `@dnd-kit` or similar), or replace with a tap-to-reveal "Move to…" menu on narrow viewports? This is the single biggest design decision.
4. **Navigation pattern.** Hamburger + off-canvas drawer, bottom tab bar, or top app bar? Affects `Sidebar.tsx` and `app/dashboard/layout.tsx`.
5. **Terminal page scope.** Is making the terminal *usable* on a phone in scope, or only "don't break layout / allow pinch-zoom"? Recommend the latter for this ticket.
6. **Rich-text editor on mobile.** Keep `@mdxeditor/editor` with a compacted toolbar, or degrade to a plain markdown `<textarea>` below `md`?
7. **Definition of done / acceptance criteria.** Is the bar "every page is scroll-usable at 375px with no horizontal overflow except the intentionally-scrollable Kanban" — or a stronger bar including touch-target audit, Lighthouse mobile score threshold, and manual test checklist per page?
8. **Testing approach.** No existing Playwright/visual-regression setup in this repo (tests are `node --test` on `lib/**`). Do we add a mobile-viewport smoke test, or rely on manual QA?
9. **Rollout.** Ship as one PR, or split per surface (shell → kanban → dialogs → editor → terminal)? Prior requirements in this workflow have shipped as single bundled commits.

These questions should be resolved (or explicitly deferred) before the Documentation stage writes acceptance criteria.

## Specification

### 0. Resolved decisions (from Analysis open questions)

These decisions turn the Analysis open questions into fixed inputs for this spec. Any change requires a new requirement.

| # | Question | Decision |
|---|---|---|
| 1 | Minimum supported viewport | **375 × 667 CSS px** (iPhone SE 2nd gen). Tablet breakpoint at Tailwind `md` (≥ 768px). Desktop at Tailwind `lg` (≥ 1024px). |
| 2 | Browser / device matrix | iOS Safari ≥ 15, Android Chrome last 2 stable versions. Mobile Firefox and Samsung Internet best-effort (must not be broken, polish not required). |
| 3 | Kanban on mobile | **Tap-to-move menu** below `md`. Native HTML5 drag-and-drop stays as-is at `md` and above. No new `@dnd-kit` dependency. |
| 4 | Navigation pattern | **Hamburger + off-canvas drawer** below `md`. Existing collapse/expand aside behavior retained at `md` and above. |
| 5 | Terminal page scope | Chrome/layout only — page must not visually break and must allow the user to pinch-zoom or horizontally scroll the xterm region. Input ergonomics, on-screen keyboards, and full-mobile terminal UX are deferred. |
| 6 | Rich-text editor on mobile | Keep `@mdxeditor/editor`. Toolbar must collapse into a horizontally-scrollable row below `md`. No library swap, no textarea fallback. |
| 7 | Definition of done bar | Every dashboard route is usable at 375 px width with no unintentional horizontal overflow, all interactive controls meet a 44 × 44 CSS px tap target, and every acceptance criterion below passes manual QA. No Lighthouse score gate. |
| 8 | Testing approach | Manual QA against a checklist of routes × viewports (see AC-22). No Playwright / visual-regression harness added in this requirement. |
| 9 | Rollout | **Single bundled PR**, matching the pattern of REQ-00045…REQ-00048. |

### 1. User stories

1. **As a** NOS user on my phone, **I want** to open the dashboard at `https://<host>/dashboard` on a 375 px-wide viewport, **so that** I can triage workflow items away from my desk without pinch-zooming to read or tap controls.
2. **As a** NOS user on my phone, **I want** to open a hamburger menu to access Workflows, Activity, Agents, Settings and Terminal, **so that** the sidebar does not consume horizontal space I need for content.
3. **As a** NOS user on my phone, **I want** to see the Kanban board as a horizontally-scrollable row of columns with readable cards, **so that** I can browse per-stage item lists at a glance.
4. **As a** NOS user on my phone, **I want** to move a Kanban item between stages via a tap-and-choose "Move to…" menu, **so that** I don't depend on drag-and-drop which is unreliable on touch.
5. **As a** NOS user on my phone, **I want** the List view's filter and sort controls to stack vertically and remain tappable, **so that** I can narrow down items without losing the result list under controls.
6. **As a** NOS user on my phone, **I want** the Item Detail dialog to open full-screen with the metadata aside moved below the body, **so that** I can read the description and still reach metadata without a 220 px-wide desktop sidebar crammed into my viewport.
7. **As a** NOS user on my phone, **I want** the New Item dialog to open full-screen, **so that** the form fields are at a comfortable tap size and the submit buttons are always visible.
8. **As a** NOS user on my phone, **I want** the MDX editor to show a horizontally-scrollable toolbar and a full-width editing area, **so that** I can still apply formatting without the toolbar overflowing the screen or breaking layout.
9. **As a** NOS user on my phone, **I want** rendered Markdown previews (wide tables, long code blocks, long URLs) to stay within the content column or scroll horizontally inside their own container, **so that** the page itself never scrolls sideways.
10. **As a** NOS user on my phone, **I want** the Activity and Agents pages to reflow into single-column lists, **so that** I can read them without pinching or horizontal scroll.
11. **As a** NOS user on my phone, **I want** the Terminal page's chrome (header, toolbar, sidebar trigger) to stay usable even though the xterm content is desktop-first, **so that** I can at least navigate away from it on mobile.
12. **As a** NOS user on an iPhone with a notch / home indicator, **I want** safe-area insets respected on the top and bottom of the app shell, **so that** nothing important is hidden under the notch or swipe bar.
13. **As a** NOS user on a tablet (≥ 768 px), **I want** the layout to behave like the current desktop experience (persistent collapsible sidebar, two-pane dialogs, native Kanban drag), **so that** we don't regress anyone currently using the app at tablet widths.
14. **As a** NOS user on desktop (≥ 1024 px), **I want** the existing layout and interactions (expanded sidebar, HTML5 drag on Kanban, two-pane dialogs) preserved unchanged, **so that** this requirement is additive and causes no desktop regression.

### 2. Acceptance criteria

Unless otherwise stated, "narrow viewport" means `< 768 px` CSS width (`< md`) and "wide viewport" means `≥ 768 px`. The reference mobile device for manual QA is 375 × 667 CSS px; the reference desktop is 1440 × 900.

#### Global shell & layout

- **AC-1** (Viewport meta) `app/layout.tsx` exports a Next.js `viewport` such that the rendered `<meta name="viewport">` resolves to `width=device-width, initial-scale=1, viewport-fit=cover`. Verified by viewing page source at `/` on mobile.
- **AC-2** (Safe-area insets) Given the dashboard is loaded on a device with non-zero `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` (simulated via DevTools iPhone profile), the app shell header and any fixed bottom chrome are padded by at least the corresponding safe-area inset value. No interactive control is clipped by the notch or home indicator.
- **AC-3** (No unintentional horizontal overflow) Given a 375 px viewport, when the user navigates to any of `/`, `/dashboard`, `/dashboard/workflows`, `/dashboard/workflows/<id>`, `/dashboard/activity`, `/dashboard/agents`, `/dashboard/settings`, `/dashboard/terminal`, then `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. The Kanban column row (AC-7) and the terminal region (AC-17) are the only permitted horizontally-scrollable children, and their overflow is contained within their own element — the page itself never scrolls sideways.
- **AC-4** (Tap-target size) Every interactive control rendered in the dashboard (buttons, links, form inputs, list-item click targets, Kanban card surfaces, sidebar nav items) has a hit area of at least 44 × 44 CSS px at narrow viewports. Tested by sampling each surface in DevTools with the "Show tap targets" inspector.

#### Sidebar / navigation

- **AC-5** (Hamburger visible under md) When viewport width is `< 768 px`, a hamburger button is rendered in the top-left of the dashboard header and the persistent `<aside>` sidebar is hidden from layout (no width reservation).
- **AC-6** (Drawer open/close) Given a narrow viewport, when the user taps the hamburger, then an off-canvas drawer slides in from the left containing the same nav items as the desktop sidebar (Workflows list, Activity, Agents, Settings, Terminal). When the user taps outside the drawer, taps a nav item, or presses `Escape`, the drawer closes. Drawer state is separate from the existing `SidebarContext.collapsed` flag (so desktop collapse behavior is unaffected).
- **AC-6a** (Desktop preserved) When viewport width is `≥ 768 px`, the sidebar renders as today (expanded by default, collapsible via the existing toggle, no hamburger visible, no drawer overlay).

#### Workflow list (ListView)

- **AC-7** (Stacked filter bar) At narrow viewports, the filter / search / sort row in `ListView.tsx` stacks vertically (each control on its own line, full width) with at least 8 px gap. At `md` and above, the existing horizontal layout is preserved.
- **AC-8** (List rows) At narrow viewports, each list row shows title, status badge, and stage on a single row or wraps cleanly onto two rows without truncating the title mid-character. Tapping the row opens the Item Detail dialog (preserving REQ-00047 click-to-open behavior).

#### Kanban board

- **AC-9** (Horizontal scroll) At narrow viewports, the Kanban board renders columns in a single horizontally-scrollable row with `min-width` per column of at least 280 px and `gap` of at least 12 px. The page itself does not scroll horizontally (AC-3); only the Kanban's inner container does.
- **AC-10** (Touch-friendly cards) Each Kanban card at narrow viewports has vertical padding such that its hit area is ≥ 44 px tall (AC-4) and its title is readable without zoom (≥ 14 px effective font-size).
- **AC-11** (Tap-to-move menu) At narrow viewports, each Kanban card exposes a "Move to…" affordance (either a dedicated icon button on the card, or a bottom-sheet / menu triggered by long-press or overflow menu — implementation's choice provided it meets AC-4). Selecting a destination stage calls the same move handler as the desktop drag-and-drop and moves the item.
- **AC-12** (Desktop DnD preserved) At `md` and above, HTML5 drag-and-drop behavior in `KanbanBoard.tsx` is unchanged — cards are draggable between columns and the drop handler fires as before.
- **AC-13** (No touch-DnD regression) At narrow viewports, the card element does **not** have `draggable="true"` (avoids conflict with native scrolling) OR DnD is gated such that a `touchstart`-initiated drag does not start a ghost image over the scroll gesture.

#### Dialogs (Item Detail, New Item, Stage Detail)

- **AC-14** (Full-screen under md) At narrow viewports, `ItemDetailDialog`, `NewItemDialog`, and `StageDetailDialog` render as full-viewport sheets: 100 vw × 100 vh (minus safe-area insets), with a visible close button in the top-right reachable without scrolling.
- **AC-15** (Aside below body) At narrow viewports, the two-pane `md:grid-cols-[1fr_220px]` layout in `ItemDetailDialog` / `NewItemDialog` collapses to a single column with metadata / side controls appearing **below** the main body (not hidden). The `max-h-[70vh]` constraint on the aside does not apply at narrow viewports.
- **AC-16** (Dialog preserved wide) At `md` and above, the two-pane layout and existing `max-h-[70vh]` behavior are unchanged.

#### Markdown editing and preview

- **AC-17** (Editor toolbar) At narrow viewports, the `@mdxeditor/editor` toolbar is wrapped in a container with `overflow-x: auto` such that the toolbar can scroll horizontally if its contents exceed viewport width; the editable region remains full-width below it.
- **AC-18** (Preview overflow) Rendered markdown from `@uiw/react-markdown-preview` never forces the page to scroll horizontally. Wide tables, long code blocks, and long inline URLs are contained by an ancestor with `overflow-x: auto` and/or `word-break: break-word` such that the page-level invariant in AC-3 holds on all item bodies.

#### Activity, Agents, Settings

- **AC-19** (Activity page) At narrow viewports, `/dashboard/activity` entries render in a single column; timestamps and item references wrap within the row without horizontal overflow.
- **AC-20** (Agents page) At narrow viewports, `/dashboard/agents` cards or table rows reflow to a single column.
- **AC-21** (Settings page) At narrow viewports, `/dashboard/settings` form fields render full-width with label-above-input layout.

#### Terminal page

- **AC-22a** (Terminal chrome usable) At narrow viewports, `/dashboard/terminal`'s page chrome (header, back/close affordance, any toolbar buttons outside the xterm region) is reachable and tappable per AC-4. The xterm region itself may remain desktop-sized; it is allowed to extend beyond the viewport provided it is contained in an `overflow: auto` region and the page-level invariant in AC-3 still holds.

#### Cross-cutting

- **AC-22** (Manual QA matrix) The implementer records, as part of the PR description or a `docs/` note, a pass/fail entry for each of the following combinations: {iPhone SE 375 px, iPhone 14 390 px, Pixel 7 412 px, iPad Mini 768 px, Desktop 1440 px} × {`/dashboard`, `/dashboard/workflows`, `/dashboard/workflows/<id>` in both Kanban and List modes, item detail dialog open, new item dialog open, `/dashboard/activity`, `/dashboard/agents`, `/dashboard/settings`, `/dashboard/terminal`}. Any failure that is not covered by an explicit out-of-scope note in §4 blocks merge.
- **AC-23** (No desktop regression) At ≥ 1024 px viewport, every feature that worked before this change still works: sidebar expanded by default and collapsible, Kanban HTML5 drag-and-drop, two-pane dialogs, MDX editor toolbar layout, click-to-open (REQ-00047), footer copy (REQ-00048), status indicator (REQ-00046), activity log (REQ-00045).

### 3. Technical constraints

#### Files expected to change

- `app/layout.tsx` — add `export const viewport` (Next.js 14 metadata API) with `width: 'device-width', initialScale: 1, viewportFit: 'cover'`. Add safe-area padding utilities if needed.
- `app/dashboard/layout.tsx` — wrap shell in a container that coordinates the new mobile drawer state; render hamburger trigger in the header slot under `md`.
- `components/dashboard/Sidebar.tsx` — split into "desktop aside" (existing behavior) and "mobile drawer" (new). Both render the same nav item list from a shared config so there's no duplication.
- `contexts/SidebarContext` (or equivalent — verify exact path during implementation) — add a `mobileDrawerOpen: boolean` + `toggleMobileDrawer()` / `setMobileDrawerOpen(open)` alongside the existing `collapsed` state. The two states are independent.
- `components/dashboard/KanbanBoard.tsx` — add narrow-viewport branch that renders a "Move to…" affordance per card and gates `draggable` appropriately (see AC-13). Ensure columns use a `min-w-[280px]` or similar.
- `components/dashboard/ListView.tsx` — stack the filter row at narrow viewports.
- `components/dashboard/ItemDetailDialog.tsx`, `components/dashboard/NewItemDialog.tsx`, `components/dashboard/StageDetailDialog.tsx` — responsive layout (single column below `md`, aside moves below body, full-screen sheet under `md`).
- `components/ui/dialog.tsx` — if Radix Dialog wrapper enforces a fixed max-width, add a `size` prop or class hook so dialogs can go full-screen under `md` without a fork.
- `components/dashboard/ItemDescriptionEditor.tsx` — wrap the MDX toolbar in a horizontally-scrollable container at narrow viewports.
- `app/globals.css` — add any required global overrides (e.g. `html, body { overflow-x: hidden }` if necessary, safe-area utilities, `.prose img { max-width: 100% }`).
- `tailwind.config.js` — only if new screen sizes or safe-area plugin are needed; the default `sm / md / lg / xl` breakpoints are sufficient.
- `app/dashboard/activity/**`, `app/dashboard/agents/**`, `app/dashboard/settings/**`, `app/dashboard/terminal/**` — responsive adjustments per AC-19 / AC-20 / AC-21 / AC-22a.

#### Breakpoint strategy

- Use Tailwind breakpoints unchanged: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`, `2xl: 1536px`.
- "Narrow viewport" in acceptance criteria always means `< md` (i.e. `< 768 px`). Implementations should prefer `md:` prefixed utilities (i.e. mobile-first) over negation classes.
- Do **not** introduce custom pixel breakpoints for one-off components — if a component needs a break at a non-Tailwind value, justify it in a code comment and prefer `@container` queries where the container, not the viewport, is the signal.

#### Dependencies

- **Must not add** `@dnd-kit/core` or any other DnD library — decision #3 resolves this.
- **Must not swap** `@mdxeditor/editor` for a different editor — decision #6 resolves this.
- Any new runtime dependency requires a follow-up spec change; this requirement is intended to be pure CSS / React layout work on top of the existing stack.

#### Performance / compatibility

- No regression to Lighthouse Performance on desktop (sampled before/after on `/dashboard/workflows/requirements`).
- First interactive on a throttled mobile profile (Slow 4G, 4× CPU slowdown) at `/dashboard/workflows/requirements` must remain within 150% of the pre-change baseline. (Baseline captured as part of manual QA in AC-22.)
- All CSS must work in iOS Safari 15+ and Android Chrome latest-2. Avoid features gated behind newer engines (e.g. `:has()` in older iOS Safari) unless given a fallback.

#### Testing

- Manual QA per AC-22. No Playwright or visual-regression harness added.
- Existing `node --test` suite under `test/**` must continue to pass. No new UI unit tests are required by this spec; if the implementer adds React component tests, they are welcome but not gated.

### 4. Out of scope

The following are **explicitly not** part of this requirement and must not ship in the same PR:

1. Native iOS or Android apps, or any Capacitor / Expo wrapper.
2. PWA install prompt, service worker, offline mode, push notifications, web app manifest beyond what Next.js already emits.
3. Information-architecture redesign: no new routes, no renamed routes, no reordering of nav items, no bottom tab bar, no new dashboard home.
4. A dedicated mobile terminal UX (on-screen keyboard handling inside xterm, gesture-based terminal controls, mobile-optimized shell). Only the **chrome** around the terminal page (AC-22a) is addressed.
5. Replacing `@mdxeditor/editor` with a different rich-text or markdown editor, or introducing a textarea fallback editor.
6. Adding `@dnd-kit/core` or any other DnD library; touch-DnD on Kanban stays unsupported in favor of the tap-to-move menu (decision #3).
7. Changes to the NOS runtime (`lib/**`), CLI (`bin/cli.js`), workflow file format (`.nos/workflows/**`), agent adapters, or `system-prompt.md`.
8. Backend / API changes. No endpoint shapes, request/response bodies, or persistence logic are modified.
9. Visual redesign / rebrand: no new color palette, typography scale, iconography, or component library swap. Tailwind + existing `components/ui/**` primitives stay.
10. Accessibility beyond what the acceptance criteria mandate (44 × 44 tap targets, safe areas, `Escape` to close drawer). A full WCAG 2.1 AA audit is a separate initiative.
11. Lighthouse mobile score floor or any automated performance budget.
12. Automated visual-regression or Playwright harness — testing is manual per decision #8.

## Validation

### Summary

**Implementation was not performed.** The Implementation stage session ran (see `meta.yml` sessions list, `1fed441b-…` at `2026-04-19T12:27:34Z`) but produced no code changes. `git status` at the start of this Validation run shows only `.nos/workflows/requirements/activity.jsonl` modified and the untracked REQ-00049 item directory — no files under `app/**` or `components/**` have been touched. `index.md` has no `## Implementation Notes` section.

Spot checks against the specification:

- `app/layout.tsx` is still the 14-line original and does not export `viewport` (AC-1 fails).
- `grep -r viewport app/` → no matches (AC-1 fails).
- `grep -rE 'mobileDrawer|hamburger|safe-area|Move to'` across `app/` and `components/` → no matches (AC-2, AC-5, AC-6, AC-11 fail).
- `components/dashboard/Sidebar.tsx` (168 lines), `SidebarContext.tsx` (29 lines), `KanbanBoard.tsx` (232 lines), `ItemDescriptionEditor.tsx` (96 lines), `ListView.tsx` (140 lines), `ItemDetailDialog.tsx` (407 lines), `NewItemDialog.tsx` (193 lines), `StageDetailDialog.tsx` (237 lines), `app/globals.css` (104 lines), `app/dashboard/layout.tsx` (20 lines) — none are in `git diff HEAD`.

Without any implementation, every mobile-specific acceptance criterion fails. AC-23 (no desktop regression) is the only criterion that technically holds — because nothing changed, desktop is unaffected.

### Per-criterion verdicts

| AC | Verdict | Evidence |
|---|---|---|
| AC-1 Viewport meta | ❌ fail | `app/layout.tsx` unchanged; no `export const viewport`; no `width=device-width` meta emitted. |
| AC-2 Safe-area insets | ❌ fail | No `env(safe-area-inset-*)` usage anywhere in `app/` or `components/`; `app/globals.css` untouched. |
| AC-3 No horizontal overflow @375px | ❌ fail | Dashboard shell still mounts a fixed-width `<aside>` (`w-64` / `w-16`) inside `flex h-screen`, which forces page-level horizontal scroll at 375 px. No responsive gating was added. |
| AC-4 44×44 tap targets | ❌ fail | Buttons, nav items, and card surfaces still use original `py-1.5` / `h-9` sizes with no narrow-viewport bump. |
| AC-5 Hamburger under md | ❌ fail | No hamburger button exists anywhere in `app/dashboard/layout.tsx` or `components/dashboard/Sidebar.tsx`. |
| AC-6 Drawer open/close | ❌ fail | `SidebarContext.tsx` still exposes only `collapsed`; no `mobileDrawerOpen` state, no drawer component. |
| AC-6a Desktop preserved | ✅ pass | Desktop sidebar behavior is unchanged because nothing was changed — incidental pass. |
| AC-7 Stacked filter bar | ❌ fail | `ListView.tsx` unchanged; no mobile-first stacking adjustments beyond what already existed before this requirement. |
| AC-8 List rows tappable | ⚠️ partial | Click-to-open behavior from REQ-00047 is present, but the row hit area is not sized for 44 px tap targets (AC-4). |
| AC-9 Kanban horizontal scroll | ❌ fail | `KanbanBoard.tsx` columns have no `min-w-[280px]` change; current column width is not validated for mobile. |
| AC-10 Touch-friendly cards | ❌ fail | Card padding/typography unchanged. |
| AC-11 Tap-to-move menu | ❌ fail | No "Move to…" affordance added; grep for "Move to" returns nothing. |
| AC-12 Desktop DnD preserved | ✅ pass | HTML5 drag-and-drop still works at desktop sizes — incidental pass because nothing was changed. |
| AC-13 No touch-DnD regression | ❌ fail | `draggable` attribute is still applied unconditionally at all viewports; touch scroll will conflict on mobile. |
| AC-14 Dialogs full-screen under md | ❌ fail | `ItemDetailDialog.tsx`, `NewItemDialog.tsx`, `StageDetailDialog.tsx` unchanged; still constrained by the desktop-max-width `components/ui/dialog.tsx` wrapper. |
| AC-15 Aside below body under md | ❌ fail | `md:grid-cols-[1fr_220px]` still collapses to a single column via Tailwind's default, but the aside is not explicitly moved to below the body and `max-h-[70vh]` still applies. No mobile-specific layout handling was added. |
| AC-16 Dialog preserved wide | ✅ pass | Incidental — no changes means desktop two-pane layout is preserved. |
| AC-17 Editor toolbar scroll | ❌ fail | `ItemDescriptionEditor.tsx` unchanged; no `overflow-x` wrapper around the MDX toolbar. |
| AC-18 Preview overflow | ❌ fail | No `overflow-x-auto` / `word-break` wrappers added around `@uiw/react-markdown-preview` output; wide tables and long code blocks still overflow the page. |
| AC-19 Activity page | ❌ fail | `app/dashboard/activity/**` unchanged. |
| AC-20 Agents page | ❌ fail | `app/dashboard/agents/**` unchanged. |
| AC-21 Settings page | ❌ fail | `app/dashboard/settings/**` unchanged. |
| AC-22a Terminal chrome | ❌ fail | `app/dashboard/terminal/**` and `components/terminal/**` unchanged. |
| AC-22 Manual QA matrix | ❌ fail | No QA note in PR or `docs/`; no PR exists. |
| AC-23 No desktop regression | ✅ pass | No changes means no desktop regression — incidental. |

**Tally:** 4 ✅ pass (all incidental, i.e. "nothing changed so nothing broke"), 1 ⚠️ partial, 20 ❌ fail.

### Follow-ups (blocking merge)

1. Reset REQ-00049 to `Todo` in the **Implementation** stage (spec is already in place, so Documentation does not need to re-run).
2. Re-run Implementation; the implementer should work through the "Files expected to change" list in §3 of the spec and deliver a single bundled PR per decision #9.
3. Attach the AC-22 manual QA matrix (device × route grid) to the PR description.
4. When the PR is merged, append an `## Implementation Notes` section to this `index.md` summarizing the approach taken for the sidebar drawer, the Kanban tap-to-move affordance, dialog full-screen behavior, and any deviations from the spec, then re-run Validation.

Per the stage instructions, item stays in **Validation** with the failures above. No commit / push was made because there is no implementation code to commit — only the spec's `index.md` has changed, and that commit will accompany the follow-up Implementation pass.
