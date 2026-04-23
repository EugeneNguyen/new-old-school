# NOS Project Standards

> Last updated: 2026-04-24

This directory contains the living standards and conventions for the NOS project.
Each section covers a major technology in the stack with recommended patterns,
anti-patterns, and project-specific conventions already in use.

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
  - Identified gaps (19 items: 16 resolved, 1 partially resolved, 7 open)
- [**documentation-standards.md**](documentation-standards.md) — Documentation authoring standards: Markdown conventions, code examples, Mermaid diagrams, gap summaries, audit integration
- [**system-architecture.md**](system-architecture.md) — System architecture overview: component topology, data flow diagrams, key design decisions, Mermaid sequence diagrams
- [**database-design.md**](database-design.md) — Data model (ER diagram), entity definitions, file-based storage schema, YAML/JSON conventions
- [**wbs.md**](wbs.md) — Work Breakdown Structure: hierarchical decomposition of all project packages
- [**wbs-dictionary.md**](wbs-dictionary.md) — WBS Dictionary: detailed descriptions for every WBS package
- [**rtm.md**](rtm.md) — Requirement Traceability Matrix: mapping requirements to design artifacts, implementation files, and test coverage
- [**ui-design.md**](ui-design.md) — UI design system: component inventory, design tokens, layout patterns, responsive breakpoints
- [**ux-design.md**](ux-design.md) — UX design: interaction patterns, navigation flows, accessibility, error handling, validation
- [**user-journey.md**](user-journey.md) — User journeys: 6 key workflows with Mermaid flowcharts
- [**api-reference.md**](api-reference.md) — Complete API reference: 50+ endpoints, request/response shapes, error codes, SSE events
- [**test-plan.md**](test-plan.md) — Test strategy: unit/integration/e2e levels, coverage targets, tooling, data strategy, exclusions
- [**security-design.md**](security-design.md) — Security model: auth/authz, OWASP mitigations, attack surfaces, data protection
- [**performance-budget.md**](performance-budget.md) — Performance targets: Lighthouse scores, Core Web Vitals, bundle size limits, API SLOs
- [**deployment-design.md**](deployment-design.md) — Deployment: environments, CI/CD pipeline, env vars, startup sequence, rollback
- [**error-handling-strategy.md**](error-handling-strategy.md) — Error taxonomy, log levels, alerting, correlation IDs, recovery patterns
- [**glossary.md**](glossary.md) — Ubiquitous language: domain terms, entity definitions, relationships, standards terminology
- [**adr/**](adr/) — Architecture Decision Records (9 ADRs): file-based storage, Claude CLI adapter, SSE vs WebSockets, heartbeat sweeper, CSS variable theming, App Router, YAML/MD split, atomic writes, shared utility extraction

---

## Gap Summary

| ID | Description | Status |
|----|-------------|--------|
| GAP-01 | TypeScript strict mode | RESOLVED |
| GAP-02 | Tailwind CSS v4 migration | OPEN (deferred) |
| GAP-03 | No ESLint / Biome config | RESOLVED |
| GAP-04 | Suspense boundaries | RESOLVED |
| GAP-05 | Synchronous fs | OPEN (deferred, low) |
| GAP-06 | Error boundaries | RESOLVED |
| GAP-07 | Mixed config formats | OPEN (deferred, low) |
| GAP-08 | Test coverage | OPEN |
| GAP-09 | forwardRef deprecation | RESOLVED |
| GAP-10 | Canary dependency | RESOLVED |
| GAP-11 | @types/react v18 vs v19 | RESOLVED |
| GAP-12 | Logo.tsx naming | RESOLVED |
| GAP-13 | Broken npm run lint | RESOLVED |
| GAP-14 | React Compiler | RESOLVED |
| GAP-15 | next-themes phantom | RESOLVED |
| GAP-16 | Reuse opportunities | PARTIAL |
| GAP-17 | Null-safety issue | RESOLVED |
| GAP-18 | ListView EmptyState | RESOLVED |
| GAP-19 | mapStageError adoption | RESOLVED |

> **Current Status:** 16 resolved, 1 partial, 7 open (GAP-02, GAP-05, GAP-07, GAP-08 remaining).
