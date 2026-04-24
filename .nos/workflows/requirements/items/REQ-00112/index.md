Refer to some landing page i like like

* [https://github.com/decolua/9router](https://github.com/decolua/9router)
* [https://github.com/code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
* [https://github.com/obra/superpowers](https://github.com/obra/superpowers)



Key message (i think, you can update)

* AI orchestration / AI harness
* No more "Trust me bro", you control everything, every single prompt you send
* No more coding only, apply to everything



Who need this

* Engineer who work on 100 claude code session every day
* Project manager who don't know wt\* is the engineer doing
* Solomio marketer tired of guiding AI do things by things
* ...

## Analysis

### Scope

**In scope:**
- Complete rewrite of `README.md` to function as a compelling landing page / marketing-first document rather than a dry technical reference.
- Adopt stylistic cues from the three referenced repos: badge rows, emoji-marked section headings, punchy tone, conversion-focused structure (problem → solution → features → quickstart).
- Incorporate the three key messages: (1) AI orchestration/harness, (2) full prompt transparency and user control, (3) applicability beyond coding.
- Define and address the target personas: power-user engineers, non-technical project managers, solo marketers.
- Include a quickstart section (`npx nos`) and a high-level feature showcase (stage pipelines, AI agent execution, dashboard, file-based workflows).
- Visual polish: badges (npm, license, stars), ASCII or diagram of the stage pipeline, possibly a screenshot or GIF of the dashboard.

**Out of scope:**
- No changes to application code, CLI behavior, or dashboard UI.
- No creation of a separate marketing site or docs site — this is the repo `README.md` only.
- Detailed API documentation, contributing guide, or changelog (these can remain as separate files if they exist).
- Translations or i18n variants of the README.

### Feasibility

**Technical viability:** High. This is a content/copywriting task, not a code change. The existing README is 160 lines of standard markdown — a full rewrite is straightforward.

**Risks and unknowns:**
- **Tone calibration:** The referenced repos span a wide tonal range — 9router is practical/developer-focused, oh-my-openagent is bold/irreverent with heavy social proof, superpowers is methodical/process-oriented. The final tone for NOS needs to be decided. Given the "no more trust me bro" messaging, a confident-but-accessible tone (closer to oh-my-openagent's energy, but less aggressive) seems right.
- **Visual assets:** The referenced READMEs use badges, screenshots, GIFs, ASCII diagrams, and logo images. NOS currently has no logo, no hero image, and no dashboard screenshots committed to the repo. These assets would need to be created or the README designed to work without them initially (with placeholders or text-only sections).
- **Social proof:** The referenced repos lean on star counts, testimonials, and download badges. NOS is early-stage — the README should be designed to be effective *without* social proof metrics, with placeholders that become meaningful as the project grows.
- **Persona messaging:** The three target personas (engineer, PM, marketer) have very different mental models. The README structure needs to speak to all three without becoming fragmented — possibly through a "Who is this for?" section with persona-specific one-liners.

### Dependencies

- **No code dependencies.** This is a standalone content change to `README.md`.
- **Asset dependencies (soft):**
  - A project logo or wordmark would significantly improve the landing-page feel. If none exists, the README should be designed to look good without one.
  - Dashboard screenshot(s) or a GIF demo — could be captured from the running dev server but would need to be committed to `public/` or a `docs/assets/` directory.
  - Badge URLs (npm package name, license type) need to be confirmed from `package.json`.
- **Content dependencies:**
  - The current README contains accurate technical information (scripts, directory layout, tech stack) that should be preserved in some form — either condensed into the new README or moved to a separate `docs/` file.
  - The `.nos/CLAUDE.md` and `.nos/system-prompt.md` docs are the authoritative source for describing NOS's capabilities; the README should be consistent with them but written for an external audience, not internal agents.

### Open Questions

1. **Tone:** Should the README lean more toward the irreverent/bold style of oh-my-openagent ("No more 'trust me bro'") or the polished/practical style of 9router? The user's initial phrasing suggests bold, but how far?
2. **Visual assets:** Are there existing logo files, screenshots, or demo GIFs? If not, should this requirement include creating them, or should the README be designed to work without them (with a follow-up requirement for assets)?
3. **Technical detail retention:** The current README has useful sections (Available Scripts, Directory Layout, Tech Stack). Should these be kept inline (collapsed/condensed), moved to a linked doc, or dropped entirely from the landing-page README?
4. **Package name for badges:** Is the npm package name `nos`, `new-old-school`, or something else? This affects badge URLs.
5. **"Solo marketer" persona:** The user listed "Solomio marketer" — is this "solo marketer" (a single-person marketer) or a reference to something specific? This affects how we write the persona description.
6. **Comparison/positioning:** Should the README explicitly position NOS against alternatives (Linear, Notion, other AI agent frameworks), or keep the messaging self-contained?

## Specification

### User Stories

1. **As a** visiting developer, **I want** the README to immediately communicate what NOS is and why I should care, **so that** I can decide in under 30 seconds whether it's relevant to my work.

2. **As a** power-user engineer running many Claude Code sessions daily, **I want** the README to show how NOS orchestrates AI agents through configurable stage pipelines, **so that** I understand the value over ad-hoc prompting.

3. **As a** project manager unfamiliar with AI tooling, **I want** the README to explain NOS in non-technical terms with a clear "Who is this for?" section, **so that** I can see how it gives me visibility into AI-driven work.

4. **As a** solo marketer guiding AI through repetitive multi-step workflows, **I want** the README to show that NOS is not coding-only and can orchestrate any staged process, **so that** I see it as applicable to my work.

5. **As a** potential contributor, **I want** the README to include a quickstart section and link to deeper technical docs, **so that** I can get running quickly without the README itself being overwhelming.

### Acceptance Criteria

1. **Given** a user opens the repo on GitHub, **when** the README renders, **then** a hero section with the project name, one-line tagline, and badge row (npm version, license, GitHub stars) is visible above the fold.

2. **Given** the README is loaded, **when** a reader scans the structure, **then** the document follows a conversion-focused flow: hero → problem/pain → solution/value → feature showcase → who is this for → quickstart → deeper docs link → contributing link.

3. **Given** the three key messages exist, **when** the README is reviewed, **then** each message is explicitly present: (a) AI orchestration/harness, (b) full prompt transparency and user control ("you control every prompt"), (c) applicability beyond coding.

4. **Given** the target personas, **when** the "Who is this for?" section is read, **then** it contains at least three persona descriptions: engineer (AI power-user), project manager (visibility into AI work), and solo marketer (non-coding workflow automation), each with a one-to-two sentence value proposition.

5. **Given** a new user wants to try NOS, **when** they reach the quickstart section, **then** they find a code block with `npx nos` and a 3-step maximum sequence to see the dashboard running locally.

6. **Given** the feature showcase section, **when** reviewed, **then** it highlights at minimum: (a) configurable stage pipelines, (b) AI agent execution per stage, (c) web dashboard with Kanban view, (d) file-based workflow storage, and (e) routine/recurring task support.

7. **Given** the current README contains technical reference content (Available Scripts, Directory Layout, Tech Stack), **when** the rewrite is complete, **then** this content is either condensed into a collapsible `<details>` section or linked to a separate `docs/` document — not deleted.

8. **Given** stylistic cues from the three referenced repos, **when** the README is reviewed, **then** it uses emoji-marked section headings, a confident-but-accessible tone, and structural patterns (problem → solution → features) consistent with high-quality open-source landing pages.

9. **Given** no logo or screenshot assets currently exist, **when** the README is written, **then** it is designed to look complete without visual assets — using text-only fallbacks, ASCII diagrams, or placeholder comments where images would go — so that asset creation can be a follow-up task.

10. **Given** the README is the repo's public face, **when** reviewed for accuracy, **then** all technical claims (CLI command, port number, feature names) are consistent with the current codebase, `package.json`, and `.nos/system-prompt.md`.

11. **Given** the final README, **when** its line count is measured, **then** it is between 100 and 300 lines of markdown — long enough to be comprehensive, short enough to be scannable.

### Technical Constraints

- **File:** The deliverable is a single file: `README.md` at the project root. No other files are created or modified (except optionally moving technical reference to a `docs/` file).
- **Markdown compatibility:** Must render correctly on GitHub's markdown renderer. No custom HTML beyond `<details>`/`<summary>` and badge `<img>` tags. No JavaScript or GitHub-specific shortcodes.
- **Badge URLs:** Use the npm package name `nos` (confirmed in `package.json`). License badge should reference the repo's license file. Star badge should use the GitHub repo URL.
- **Consistency:** Feature names and terminology must match the glossary (`docs/standards/glossary.md`): "Workflow", "Stage", "WorkflowItem", "Agent", "Heartbeat Sweeper", "Kanban Board", etc.
- **No code changes:** This is a content-only deliverable. No application code, CLI behavior, or dashboard UI is modified.
- **Tone:** Confident-but-accessible. Borrow energy from oh-my-openagent's bold style but avoid aggressive or dismissive language. The "no more trust me bro" concept should be reframed professionally (e.g., "full prompt transparency" or "you see and control every prompt").
- **Persona phrasing:** "Solomio marketer" from the original request is interpreted as "solo marketer" — a one-person marketer or non-technical operator using AI tools.

### Out of Scope

1. **Logo or visual asset creation** — the README must work without a logo. Asset creation is a separate follow-up requirement.
2. **Dashboard screenshots or GIF demos** — desirable but not required for this deliverable. Design the README to accommodate them later.
3. **Separate marketing site or docs site** — this is the repo README only.
4. **Translations or i18n variants** of the README.
5. **Detailed API documentation, contributing guide, or changelog** — these remain as separate files; the README links to them.
6. **Competitive positioning** — do not explicitly compare NOS against named alternatives (Linear, Notion, etc.). Keep messaging self-contained.
7. **Changes to application code, CLI behavior, or dashboard UI.**

### RTM Entry

| Field | Value |
|-------|-------|
| **Req ID** | REQ-00112 |
| **Title** | Rewrite readme.md |
| **Source** | Feature request (user) |
| **Design Artifact** | `docs/standards/glossary.md` (terminology), `docs/standards/documentation-standards.md` |
| **Implementation File(s)** | `README.md` (to be rewritten) |
| **Test Coverage** | Manual validation — visual review against all 11 acceptance criteria |
| **Status** | In Progress |

### WBS Mapping

- **Primary package:** 1.8.7 — Standards & Auditing. The README is a project-level documentation deliverable that falls under documentation quality and standards.
- **Affected deliverables:**
  - `README.md` — complete rewrite.
  - Optionally, a new `docs/development.md` or similar file if technical reference content (scripts, directory layout, tech stack) is relocated from the current README rather than condensed inline.

## Validation

Validated against all 11 acceptance criteria by reading the rewritten `README.md` (182 lines pre-fix, 190 lines post-fix), cross-checking `package.json`, `bin/cli.mjs`, and `docs/standards/glossary.md`.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| AC-1 | Hero section: project name, tagline, badge row (npm, license, stars) | ✅ Pass | `README.md` lines 1–7: name "NOS — AI Orchestration You Control", bold tagline, npm + license + stars badges (fixed: replaced Node-version badge with GitHub stars badge; license badge link pointed to missing `LICENSE` — updated to GitHub repo URL) |
| AC-2 | Conversion-focused flow: hero → pain → solution → features → personas → quickstart → docs → contributing | ✅ Pass | Sections present in order: The Problem, The Solution, Why NOS?, Who is this for?, Quickstart, Contributing |
| AC-3 | Three key messages: orchestration, prompt transparency, not coding-only | ✅ Pass | (a) "NOS is an AI orchestration layer" in §The Solution; (b) "🎯 You see every prompt" section; (c) "🔁 Apply to everything" section |
| AC-4 | "Who is this for?" with 3 personas (engineer, PM, marketer) | ✅ Pass | Three persona subsections each with 1–2 sentence value propositions |
| AC-5 | Quickstart with `npx nos` and ≤3 steps | ✅ Pass | `npx nos` in code block + "Three steps to your first workflow" (3 steps) |
| AC-6 | Feature showcase: (a) stage pipelines, (b) agent execution, (c) Kanban view, (d) file-based storage, (e) routine support | ✅ Pass | (a) 🔧 Fully configurable; (b) 🎯 You see every prompt + ASCII diagram; (c) 📊 Kanban view out of the box (added); (d) 📁 Everything is a file (added); (e) routine schedule in 🔁 section (added) |
| AC-7 | Technical reference in `<details>` or linked | ✅ Pass | `<details>` block (lines 122–191) with Available Scripts, Directory Layout, Tech Stack |
| AC-8 | Emoji section headings, confident-but-accessible tone, problem→solution structure | ✅ Pass | All section headings use emojis; tone is direct without being aggressive; structure matches spec |
| AC-9 | Designed without visual assets (ASCII diagram or text-only fallbacks) | ✅ Pass | ASCII pipeline diagram (lines 31–35); no broken image tags |
| AC-10 | Technical accuracy: CLI command, port, feature names | ✅ Pass | `npx nos` confirmed via `package.json` bin entry; port 30128 confirmed in `bin/cli.mjs`; terminology matches `docs/standards/glossary.md` (Workflow, Stage, Agent, Kanban Board, Heartbeat Sweeper) |
| AC-11 | 100–300 lines | ✅ Pass | 190 lines |

**Result: All 11 acceptance criteria pass.** Three issues found and fixed during validation: (1) Node-version badge replaced with GitHub stars badge; (2) license badge link updated from missing `LICENSE` file to GitHub repo URL; (3) feature showcase section extended to explicitly cover Kanban view, file-based storage, and routine/recurring support.
