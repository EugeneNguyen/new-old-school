# NOS Project Standards

This directory contains the living standards and conventions for the NOS project.
Each section covers a major technology in the stack with recommended patterns,
anti-patterns, and project-specific conventions already in use.

**Last audited:** 2026-04-24 (AUDIT-007, fixes applied in AUDIT-006 follow-up)

---

## Documents

- [**project-standards.md**](project-standards.md) — Complete standards reference covering:
  - Tech stack summary (Next.js 16 canary/App Router, React 19 stable, TypeScript 5 strict, Tailwind CSS 3, Radix UI, CVA, Node test runner)
  - Next.js / App Router patterns (server components, file routing, API routes, promise-based params, React Compiler, Turbopack)
  - React patterns (server-first, ref as prop in React 19, composition)
  - TypeScript conventions (strict mode enabled, discriminated unions, path aliases)
  - Tailwind CSS patterns (CSS variable theming, cn() utility, CVA variants)
  - Testing standards (Node.js built-in test runner, colocation)
  - API route conventions (centralized errors, withWorkspace, HTTP semantics)
  - File organization and naming conventions
  - UI component standards (shadcn/ui pattern)
  - Data layer standards (YAML/JSON, atomic writes, store pattern)
  - Documentation standards (markdown conventions, code examples, diagrams)
  - Identified gaps (19 items: 10 resolved, 1 partially resolved, 8 open)
- [**documentation-standards.md**](documentation-standards.md) — Documentation authoring standards: Markdown conventions, code examples, Mermaid diagrams, gap summaries, audit integration
- [**system-architecture.md**](system-architecture.md) — System architecture overview: component topology, data flow diagrams, key design decisions, Mermaid sequence diagrams
- [**database-design.md**](database-design.md) — Data model (ER diagram), entity definitions, file-based storage schema, YAML/JSON conventions
- [**wbs.md**](wbs.md) — Work Breakdown Structure: hierarchical decomposition of all project packages
- [**wbs-dictionary.md**](wbs-dictionary.md) — WBS Dictionary: detailed descriptions for every WBS package
- [**rtm.md**](rtm.md) — Requirement Traceability Matrix: mapping requirements to design artifacts, implementation files, and test coverage
- [**ui-design.md**](ui-design.md) — UI design system: component inventory, design tokens, layout patterns, responsive breakpoints
- [**ux-design.md**](ux-design.md) — UX design: interaction patterns, navigation flows, accessibility, error handling, validation
- [**user-journey.md**](user-journey.md) — User journeys: 6 key workflows with Mermaid flowcharts
- [**api-reference.md**](api-reference.md) — Complete API reference: 35+ endpoints, request/response shapes, error codes, SSE events
- [**test-plan.md**](test-plan.md) — Test strategy: unit/integration/e2e levels, coverage targets, tooling, data strategy, exclusions
- [**security-design.md**](security-design.md) — Security model: auth/authz, OWASP mitigations, attack surfaces, data protection
- [**performance-budget.md**](performance-budget.md) — Performance targets: Lighthouse scores, Core Web Vitals, bundle size limits, API SLOs
- [**deployment-design.md**](deployment-design.md) — Deployment: environments, CI/CD pipeline, env vars, startup sequence, rollback
- [**error-handling-strategy.md**](error-handling-strategy.md) — Error taxonomy, log levels, alerting, correlation IDs, recovery patterns
- [**glossary.md**](glossary.md) — Ubiquitous language: domain terms, entity definitions, relationships, standards terminology
- [**adr/**](adr/) — Architecture Decision Records (8 ADRs): file-based storage, Claude CLI adapter, SSE vs WebSockets, heartbeat sweeper, CSS variable theming, App Router, YAML/MD split, atomic writes

---

## Gap Summary

| ID | Description | Status | Priority |
|----|-------------|--------|----------|
| GAP-01 | TypeScript `strict: false` | RESOLVED | ~~High~~ |
| GAP-02 | Tailwind CSS v3 (v4.2 is current) | OPEN | Medium |
| GAP-03 | No ESLint / Biome / Prettier config | RESOLVED | ~~High~~ |
| GAP-04 | Incomplete Suspense boundaries | RESOLVED | ~~Low~~ |
| GAP-05 | Synchronous `fs` in API routes | OPEN | Low |
| GAP-06 | Incomplete error boundaries | RESOLVED | ~~Low~~ |
| GAP-07 | Mixed config file formats | OPEN | Low |
| GAP-08 | Limited test coverage (2 test files) | OPEN | Medium |
| GAP-09 | `React.forwardRef` deprecation | RESOLVED | ~~Low~~ |
| GAP-10 | Canary dependency pinning | OPEN | Medium |
| GAP-11 | `@types/react` v18 vs React 19 | RESOLVED | ~~Medium~~ |
| GAP-12 | `Logo.tsx` naming inconsistency | RESOLVED | ~~Low~~ |
| GAP-13 | Broken `npm run lint` script | RESOLVED | ~~High~~ |
| GAP-14 | React Compiler not enabled | RESOLVED | ~~Medium~~ |

> **AUDIT-007 + follow-up Notes:** GAP-03 (linter config) and GAP-13 (broken lint script) resolved by installing Biome. GAP-14 (React Compiler) resolved by enabling in next.config.mjs. GAP-16 (reuse) partially resolved by adopting useApiList hook in workflows and agents pages. Previous extractions fully adopted — `EmptyState` now used in both KanbanBoard and ListView (GAP-18 resolved); `mapStageError` now used in all 3 stages routes (GAP-19 resolved). `@types/react` updated to 19.2.14 (GAP-11 resolved). `next-themes` added to package.json (GAP-15 resolved). Totals: 13 resolved, 0 partial, 7 open.
