# In setting, we should have multiple tab

* System Prompt
* Heartbeat config
* Notification
* Adapter



can be more later

## Analysis

### 1. Scope

**In scope**
- A **tabbed interface** on the Settings page (`app/dashboard/settings/page.tsx`) allowing navigation between distinct settings categories.
- Four initial tabs as specified:
  1. **System Prompt** — moves the existing system prompt editor (currently Card #1) into this tab.
  2. **Heartbeat Config** — moves the existing heartbeat interval control (currently Card #3) into this tab.
  3. **Notifications** — moves the existing notification settings (currently Card #2) into this tab.
  4. **Adapter** — adds a new tab for adapter/model defaults (tracked by REQ-00055).
- The tab bar persists on the page — clicking a tab shows the relevant content without navigating away.
- Each tab's content is loaded/rendered on page load; no lazy loading required (the page is already small enough).
- The adapter defaults (REQ-00055) can be implemented as a future tab, or included now if that requirement progresses in parallel.

**Out of scope**
- Adding new settings categories beyond the four listed — "can be more later" implies extensibility but that's a future concern.
- Tab persistence in URL (e.g. `?tab=heartbeat`) — not requested, keep simple.
- Reordering tabs — the specified order is implied; add new tabs to the end.
- Per-workflow or per-stage settings views — only global settings.
- Backend changes to settings storage (YAML vs JSON) — stays as-is (heartbeat in `.nos/settings.yaml`, system prompt uses `.nos/system-prompt.md`).

### 2. Feasibility

**Technical viability: high.** This is a UI refactor with no backend changes.

- **Tab UI pattern** — standard React state (`useState<string>`) holding the active tab id. A semantic `<nav>` with `<button>` elements for each tab. Conditional rendering or CSS visibility for tab content.
- **Shadcn/ui availability** — check for a `Tabs` component in the existing codebase. If not present, implement with native `<nav>` + conditional rendering — simpler and no new dependencies.
- **Reorganizing existing cards** — move each Card into its own component or labeled section. Keep the Card wrappers for visual consistency.
- **Adapter tab** — if REQ-00055 (default adapter/model in settings) is implemented, that content goes into the fourth tab. If not yet implemented, the tab can show a placeholder: "Adapter defaults coming soon" or be hidden until the feature lands.
- **Risks**
  1. **Shadcn Tabs not available** — if no `Tabs` component exists in `@/components/ui/`, we build a simple tab switcher. Spikes: grep for `Tabs` in `components/ui/`.
  2. **REQ-00055 timeline** — if Adapter tab is added now but REQ-00055 isn't implemented yet, the tab shows a "Coming soon" message or is grayed out. Alternatively, omit the Adapter tab until REQ-00055 is ready.
  3. **Accessibility** — keyboard navigation between tabs, `aria-selected`, `aria-tabpanel`. Verify after implementation.

### 3. Dependencies

- **Code to touch**
  - `app/dashboard/settings/page.tsx` — restructure from three sequential Cards into a tabbed layout. Keep existing state/logic for each section.
  - No changes to API routes (`app/api/settings/heartbeat/route.ts`, `app/api/settings/system-prompt/route.ts`).
  - No changes to `lib/settings.ts` — storage layer unchanged.
- **Reused infrastructure**
  - Existing Card components (`Card`, `CardHeader`, `CardContent`, etc.).
  - Existing form controls (textarea, input, checkbox).
  - Existing API endpoints.
- **Related requirements**
  - REQ-00055 — provides the "Adapter" tab content. Can be implemented in parallel or sequenced after this refactor.
- **External** — none.

### 4. Open questions

1. **Shadcn Tabs availability** — does `@/components/ui/tabs` exist, or should we build a custom tab switcher? Spike: `ls components/ui/` to check.
2. **Adapter tab timing** — should the fourth tab be included now (with placeholder) or added only when REQ-00055 is ready? Decision: include now with a placeholder to fulfill "can be more later" extensibility, or omit until needed.
3. **Tab ordering** — is the specified order fixed, or can users reorder? Request says "System Prompt, Heartbeat config, Notification, Adapter" — treat as fixed.
4. **Mobile responsiveness** — should tabs collapse to a dropdown or vertical stack on narrow viewports? Request doesn't specify — implement basic responsive: horizontal on desktop, stack/select on mobile.

### Deviations
- **OQ-1 resolved**: check for shadcn Tabs; if absent, build a simple React state + semantic HTML tab switcher.
- **OQ-2 resolved**: include the Adapter tab now with a placeholder message "Adapter defaults — configure default adapter and model for new agents (see REQ-00055)". Links to the requirement for context.
- **OQ-3 resolved**: fixed order as specified.
- **OQ-4 resolved**: responsive: tabs wrap/hide on < 640px width, show vertical stack.

---

## Implementation Notes

- **File changed**: `app/dashboard/settings/page.tsx` only.
- **Tab switcher**: custom React state + semantic HTML. No `Tabs` component in `components/ui/` (confirmed absent). `role="tablist"`, `role="tab"`, `role="tabpanel"` wired per spec. `hidden` attribute on inactive panels preserves per-panel state (AC-6) and removes them from the accessibility tree.
- **Keyboard nav**: `handleTabKey` on tab buttons implements `ArrowRight`/`ArrowLeft` with wrapping, `Home`/`End` per AC-5 (automatic activation — arrow keys both move focus and set `activeTab`).
- **Panel IDs**: `panel-system-prompt`, `panel-heartbeat`, `panel-notifications`, `panel-adapter`.
- **DefaultAgentSettings**: relocated from direct render below Heartbeat card into `panel-adapter`, unchanged.
- **No new deps**: no `components/ui/tabs`, no package.json changes.
- **Deviation from spec**: none. All 15 ACs addressed as written.

---

## Implementation Notes

- **File changed**: `app/dashboard/settings/page.tsx` only.
- **Tab switcher**: custom React state + semantic HTML. No `Tabs` component in `components/ui/` (confirmed absent). `role="tablist"`, `role="tab"`, `role="tabpanel"` wired per spec. `hidden` attribute on inactive panels preserves per-panel state (AC-6) and removes them from the accessibility tree.
- **Keyboard nav**: `handleTabKey` on tab buttons implements `ArrowRight`/`ArrowLeft` with wrapping, `Home`/`End` per AC-5 (automatic activation — arrow keys both move focus and set `activeTab`).
- **Panel IDs**: `panel-system-prompt`, `panel-heartbeat`, `panel-notifications`, `panel-adapter`.
- **DefaultAgentSettings**: relocated from direct render below Heartbeat card into `panel-adapter`, unchanged.
- **No new deps**: no `components/ui/tabs`, no package.json changes.
- **Deviation from spec**: none. All 15 ACs addressed as written.

---

## Specification

### 1. User stories

1. **As a NOS operator**, I want to switch between distinct settings categories using a tab bar, **so that** the Settings page is organized into clear sections instead of a single long vertical scroll.
2. **As a NOS operator** editing the system prompt or heartbeat interval frequently, I want each category on its own tab, **so that** I can jump directly to the control I need without scrolling past unrelated settings.
3. **As a NOS operator** on a tablet or narrow window, I want the tab bar to remain usable without horizontal scrolling, **so that** I can configure the app on any reasonable screen size.
4. **As a NOS operator**, I want the "Default Agent Settings" control (REQ-00055) to live on a dedicated "Adapter" tab, **so that** adapter/model defaults are discoverable as a first-class category rather than buried below other settings.

---

### 2. Acceptance criteria

**Tab bar rendering**

1. **Given** the Settings page loads, **when** the initial render completes, **then** the page shows the existing `Settings` heading + subtitle, followed by a tab bar containing exactly four tabs in this fixed order: **System Prompt**, **Heartbeat Config**, **Notifications**, **Adapter**.
2. **Given** the page renders for the first time with no prior selection, **when** no tab has been clicked yet, **then** the **System Prompt** tab is active and its panel is the only visible tab panel.
3. **Given** the tab bar is rendered, **when** inspected in the DOM, **then** the bar uses `role="tablist"`, each tab uses `role="tab"` with `aria-selected="true"` on the active tab and `"false"` on the others, and each panel uses `role="tabpanel"` with `aria-labelledby` pointing to its tab's id.

**Tab switching**

4. **Given** any non-active tab, **when** the user clicks it, **then** the previously active panel hides, the clicked panel becomes visible, and the clicked tab gains the active visual state (distinct background, text color, or bottom border) while the other tabs show the inactive state.
5. **Given** focus is on a tab, **when** the user presses `ArrowRight` / `ArrowLeft`, **then** focus moves to the next / previous tab (wrapping at the ends) and that tab becomes active; `Home` / `End` move focus+activation to the first / last tab.
6. **Given** the user switches tabs, **when** the new panel mounts, **then** no in-flight fetch or form state from other panels is cancelled or reset — each panel's local state (e.g., unsaved system prompt edits, typed heartbeat value) survives tab switches within a single page load.

**Tab content parity (no behavioral regressions)**

7. **Given** the **System Prompt** tab is active, **when** the panel renders, **then** it contains the existing system prompt editor (textarea, byte counter, dirty indicator, `Save` button, `Saved`/`Save failed` feedback, `beforeunload` guard, in-page link confirm) wired to `GET`/`PUT /api/settings/system-prompt` and behaving identically to the pre-tab version.
8. **Given** the **Heartbeat Config** tab is active, **when** the panel renders, **then** it contains the existing "Auto-advance heartbeat" card (seconds input, validation "Must be a non-negative integer", `Save` button, `Saved`/`Save failed` feedback) wired to `GET`/`PUT /api/settings/heartbeat` and behaving identically.
9. **Given** the **Notifications** tab is active, **when** the panel renders, **then** it contains the existing "Play a sound when a task finishes" checkbox and `Test sound` button, reading/writing `localStorage` key `nos.notifications.audio.itemDone` as before.
10. **Given** the **Adapter** tab is active, **when** the panel renders, **then** it renders the existing `DefaultAgentSettings` component (REQ-00055) in place, unchanged — adapter dropdown, model dropdown, `Save`/`Clear` buttons, feedback — wired to `/api/adapters`, `/api/adapters/:name/models`, and `/api/settings/default-agent`.
11. **Given** the Settings page before and after this change, **when** the same user interactions are performed on each tab's controls, **then** network requests, success/error messages, and persisted values match byte-for-byte between versions.

**Responsive behavior**

12. **Given** the viewport is ≥ 640px wide, **when** the page renders, **then** the tabs are laid out horizontally in a single row with no horizontal scrollbar.
13. **Given** the viewport is < 640px wide, **when** the page renders, **then** the tabs remain usable without horizontal page scrolling — either the tab bar wraps onto multiple lines or becomes a vertical stack — and clicking any tab still shows its panel.

**Non-goals confirmed by absence**

14. **Given** the page is reloaded, **when** the reload completes, **then** the active tab resets to **System Prompt** (URL persistence is explicitly not implemented).
15. **Given** a user adjusts browser zoom or window width, **when** the tab bar re-flows, **then** no tab is ever clipped or hidden off-screen with no scroll affordance.

---

### 3. Technical constraints

**Files to modify**

- `app/dashboard/settings/page.tsx` — only file that changes. Restructure the current sequential Cards into a tabbed layout and keep every existing piece of state, effect, handler, and JSX inside its owning tab's panel.

**Files NOT to touch** (confirmed stable)

- `app/api/settings/system-prompt/route.ts`
- `app/api/settings/heartbeat/route.ts`
- `app/api/settings/default-agent/route.ts`
- `app/api/adapters/**`
- `lib/settings.ts`
- `.nos/settings.yaml`, `.nos/system-prompt.md`
- `components/ui/**` — no new shadcn component is added.

**Tab switcher implementation**

- No `Tabs` component exists under `components/ui/` (confirmed: only `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `scroll-area.tsx`). **Do not** add a new shadcn dependency; build a minimal custom switcher inside `page.tsx`.
- State: `const [activeTab, setActiveTab] = useState<TabId>('system-prompt')` where `type TabId = 'system-prompt' | 'heartbeat' | 'notifications' | 'adapter'`.
- Tab definitions live in a single const array `const TABS: { id: TabId; label: string }[] = [...]` in the order: `system-prompt` → `heartbeat` → `notifications` → `adapter`. Render the tab bar by mapping over this array.
- Panels: render all four panels unconditionally but hide inactive ones with the `hidden` attribute (or `className={activeTab === id ? '' : 'hidden'}`). This preserves per-panel state across switches (AC-6) and avoids remounting the heavy `DefaultAgentSettings` effects.
- Keyboard handling: attach `onKeyDown` to each tab button implementing `ArrowLeft`/`ArrowRight`/`Home`/`End` per the WAI-ARIA Authoring Practices "Tabs with manual activation" — but use **automatic activation** (arrow keys both move focus *and* set `activeTab`) to match AC-5.

**ARIA + DOM shape**

```tsx
<div role="tablist" aria-label="Settings sections" className="...">
  {TABS.map(t => (
    <button
      key={t.id}
      id={`tab-${t.id}`}
      role="tab"
      aria-selected={activeTab === t.id}
      aria-controls={`panel-${t.id}`}
      tabIndex={activeTab === t.id ? 0 : -1}
      onClick={() => setActiveTab(t.id)}
      onKeyDown={handleTabKey}
    >{t.label}</button>
  ))}
</div>
{TABS.map(t => (
  <div
    key={t.id}
    role="tabpanel"
    id={`panel-${t.id}`}
    aria-labelledby={`tab-${t.id}`}
    hidden={activeTab !== t.id}
  >
    {/* existing Card(s) for this tab, unchanged */}
  </div>
))}
```

**Styling**

- Reuse Tailwind utility classes already used elsewhere in the file (`flex`, `gap-*`, `border`, `rounded-md`, `text-sm`, `font-medium`, `text-muted-foreground`, `bg-background`, `focus:ring-2 focus:ring-ring`). Active-tab indicator = `border-b-2 border-primary text-foreground`; inactive = `text-muted-foreground hover:text-foreground`.
- Tab bar container: `flex flex-wrap gap-1 border-b` so it wraps rather than overflows on narrow viewports (satisfies AC-13 without a media query).
- Preserve the outer `<div className="p-8 space-y-8">` wrapper and the `Settings` heading block above the tab bar.

**State & data flow**

- No existing `useState`, `useEffect`, `useRef`, or handler declared in `SettingsPage` changes signature or dependencies. They remain at the `SettingsPage` top level; each panel's JSX references them as before. This keeps per-panel state alive across tab switches (AC-6) and guarantees behavioral parity (AC-7 – AC-11).
- `DefaultAgentSettings` stays a separate component and is rendered inside the Adapter panel exactly once.
- No URL query param, `localStorage`, or session storage is read/written for `activeTab` (AC-14).

**Accessibility**

- The `hidden` attribute on inactive panels hides them from both the accessibility tree and layout, avoiding duplicate form-field IDs being exposed to AT.
- Focus ring on tab buttons uses the existing `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` pattern.
- Tab labels are static strings; no `aria-label` needed beyond the tablist.

**Performance / build**

- No new dependencies added to `package.json`. No new files added under `components/`.
- Must compile cleanly under the existing `tsc` / `next build` pipeline with no new `any`, no new ESLint disables.

---

### 4. Out of scope

- Adding a **fifth or later** settings tab — extensibility is implicit in the `TABS` array but no new categories are introduced here.
- Persisting the active tab in the URL (`?tab=heartbeat`), `localStorage`, or server session.
- Reordering tabs at runtime (drag-and-drop or user preference).
- Converting the tab bar into a `<select>` dropdown on mobile — flex-wrap is sufficient per AC-13.
- Lazy-loading or code-splitting panel content.
- Moving storage of heartbeat / notifications / adapter defaults between files or formats.
- Per-workflow, per-stage, or per-agent settings views.
- Adding automated unit/E2E tests for the tab switcher.
- Internationalization of tab labels (English only; labels are literal strings).
- Introducing a shadcn `Tabs` primitive or any other new `components/ui/*` component.
- Changes to `DefaultAgentSettings` behavior (REQ-00055 is complete; this requirement only relocates it into a tab panel).

---

## Validation

Evidence gathered by reading `app/dashboard/settings/page.tsx` (1–750), running `npx tsc --noEmit` (no errors in settings files; unrelated pre-existing errors in workflows routes / StageDetailDialog / WorkflowItemsView), and curling the live dev-server at `http://localhost:30128/dashboard/settings`.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | Heading + subtitle then tab bar with exactly 4 tabs in order System Prompt → Heartbeat Config → Notifications → Adapter | ✅ | `TABS` const at lines 15–20 has the four entries in the specified order; heading rendered at lines 251–256 before the tablist at lines 258–283. DOM-scrape of the live page returned the four labels in order. |
| 2 | On first render System Prompt tab is active and its panel is the only visible one | ✅ | `useState<TabId>('system-prompt')` at line 23; inactive panels use `hidden={activeTab !== t.id}` (lines 289, 346, 408, 453). |
| 3 | `role="tablist"`, each tab `role="tab"` with `aria-selected` true/false, each panel `role="tabpanel"` with `aria-labelledby` → tab id | ✅ | tablist at 258–262; buttons at 264–282 with `role="tab"`, `aria-selected={activeTab === t.id}`, `aria-controls={'panel-' + id}`; four panels with `role="tabpanel"`, matching `id` + `aria-labelledby` at 286–288, 344–345, 406–407, 451–452. Live DOM confirms `role="tablist"`, `role="tab"`, `role="tabpanel"`, `id="tab-*"`, `id="panel-*"`. |
| 4 | Clicking a non-active tab switches panels and flips visual active state | ✅ | `onClick={() => setActiveTab(t.id)}` at 271; active class `'border-b-2 border-primary text-foreground'` vs inactive `'text-muted-foreground hover:text-foreground'` at 275–278. |
| 5 | ArrowRight/Left wrap; Home/End jump to first/last; automatic activation | ✅ | `handleTabKey` lines 189–210 implements all four keys, wraps with modulo math, and calls `setActiveTab` + `.focus()` for each. |
| 6 | Per-panel state (unsaved edits, typed heartbeat value) survives tab switches | ✅ | All state (`content`, `heartbeatSeconds`, `audioDoneEnabled`, etc.) lives on `SettingsPage`; all panels rendered unconditionally with `hidden` attr so no unmount. `DefaultAgentSettings` mounts once at line 455. |
| 7 | System Prompt panel: textarea, byte counter, dirty indicator, Save, Saved/Save failed, beforeunload, link-confirm — wired to `/api/settings/system-prompt` | ✅ | Textarea 305–315; byte counter 317–319; dirty indicator 320–322; Save button 325–330; savedFlash 331–333; saveError 334–336; `beforeunload` listener 138–146; link-click confirm 148–162; GET/PUT wired in load effect 87–110 and `handleSave` 164–187. |
| 8 | Heartbeat panel: seconds input, non-negative integer validation, Save, Saved/Save failed — wired to `/api/settings/heartbeat` | ✅ | Input 368–380; `heartbeatValid` check 215–220; Save 384–389; `"Must be a non-negative integer"` message 396–398; GET/PUT at 112–136 and 222–247. |
| 9 | Notifications panel: sound checkbox + Test sound button using `localStorage` key `nos.notifications.audio.itemDone` | ✅ | Checkbox 420–426; Test-sound button 436–443; `AUDIO_DONE_KEY = 'nos.notifications.audio.itemDone'` at line 9 used by `handleAudioDoneToggle` 57–64 and `handleTestSound` 66–85. |
| 10 | Adapter panel renders `DefaultAgentSettings` unchanged | ✅ | Single `<DefaultAgentSettings />` at line 455 inside `panel-adapter`; component definition 474–750 is the same REQ-00055 implementation (adapter select, model select, Save/Clear, `/api/adapters`, `/api/adapters/:name/models`, `/api/settings/default-agent`). |
| 11 | Network requests, messages, persisted values match pre-tab version byte-for-byte | ✅ | No handler, fetch call, header, or body construction changed between sections 7–10; effects still run once on mount. API route files untouched (verified by git status: only `page.tsx` in the settings path is modified). |
| 12 | ≥ 640px: tabs horizontal in a single row, no horizontal scrollbar | ✅ | `flex flex-wrap gap-1 border-b` at line 261. Four short labels fit trivially on a single row at ≥ 640 px. |
| 13 | < 640px: tab bar wraps or stacks, no horizontal page scroll | ✅ | Same `flex-wrap` class allows the row to wrap when the container narrows; all tabs remain clickable since they're all rendered. |
| 14 | Reload resets active tab to System Prompt (no URL/storage persistence) | ✅ | `useState<TabId>('system-prompt')` with no URL, localStorage, or session-storage read/write for `activeTab`. |
| 15 | Zoom/resize never clips a tab off-screen with no scroll affordance | ✅ | `flex-wrap` ensures tabs reflow onto additional rows; no fixed-width container or overflow hidden. |

### Constraint verification

- **Files changed**: `git diff --name-only` shows `app/dashboard/settings/page.tsx` as the only file touched for this requirement (plus unrelated workflow/stage work from other REQs already in the tree).
- **No new deps**: `package.json` unchanged; no `components/ui/tabs` added.
- **TypeScript**: `npx tsc --noEmit` reports zero errors in `app/dashboard/settings/` (all errors are pre-existing in `app/api/workflows/**` and `components/dashboard/*`, not introduced by this change).
- **Live render**: DOM-scrape of `GET /dashboard/settings` returns the four tab buttons in the correct order with `role="tab"` and matching `id="tab-*"` / `id="panel-*"` pairs.

### Regressions / adjacent functionality

- System prompt editor, heartbeat input, and notifications toggle all retain their original handlers, IDs, and API wiring (lines 300–447). No change to `beforeunload` / link-confirm semantics.
- `DefaultAgentSettings` moves from a top-level render to inside `panel-adapter` but stays mounted at all times, so its initial-load `useEffect` still fires exactly once.
- No test suite exists for these components (per "no automated tests" in Out-of-scope), so regression coverage is by code inspection.

### Verdict

**All 15 acceptance criteria pass.** REQ-00056 is validated and ready for Done.