# NOS Project Standards

> Last audited: 2026-04-22 (AUDIT-004 audit)

---

## 1. Tech Stack Summary

| Technology | Version | Notes |
|---|---|---|
| **Next.js** | 16.2.1-canary.45 (App Router) | Server-first architecture; Next.js 16 stable is available |
| **React** | 19.2.5 | Server Components by default; React 19 stable |
| **TypeScript** | ^5.0 | `strict: true` enabled |
| **Tailwind CSS** | ^3.0 | CSS variable-based theme via `hsl(var(--*))` |
| **Node.js** | >=18 | Runtime requirement |
| **Radix UI** | Various | Primitives: Select, Slot, Toast |
| **class-variance-authority** | ^0.7 | Component variant definitions |
| **clsx + tailwind-merge** | Latest | Utility class merging via `cn()` |
| **lucide-react** | ^1.8 | Icon library |
| **next-themes** | (via ThemeProvider) | Dark mode via `class` strategy |
| **js-yaml** | ^4.1 | YAML parsing for workflow metadata |
| **chokidar** | ^3.6 | File system watching |
| **commander** | ^12.0 | CLI framework |
| **@mdxeditor/editor** | ^3.55 | Rich markdown editing |
| **rehype-sanitize** | ^6.0 | Markdown HTML sanitization |
| **remark-breaks** | ^4.0 | Markdown line break handling |
| **Node test runner** | Built-in | `node --test` for unit tests |

---

## 2. Next.js / App Router Standards

### Recommended Patterns

- **Server Components by default.** Every component in `app/` is a React Server Component unless explicitly marked `"use client"`. Keep client components minimal.
- **File-system routing.** Use `page.tsx`, `layout.tsx`, `route.ts` conventions. Dynamic segments use `[param]` folder names.
- **API routes.** Define in `app/api/**/route.ts` using named exports (`GET`, `POST`, etc.) returning `NextResponse`.
- **Layouts for shared UI.** Use `layout.tsx` to wrap persistent chrome (sidebar, toaster). Layouts don't re-render on navigation.
- **Middleware for cross-cutting concerns.** `middleware.ts` at project root, scoped via `config.matcher`.
- **Path aliases.** Use `@/*` for absolute imports (configured in `tsconfig.json`).
- **Promise-based params.** In Next.js 15+/16, `params` and `searchParams` in page components are `Promise<>` types that must be awaited.
- **Error and loading boundaries.** Add `error.tsx` and `loading.tsx` at key route segments for graceful degradation and streaming.

### Anti-Patterns to Avoid

- Avoid `"use client"` on components that only render data without interactivity.
- Avoid mixing `pages/` and `app/` routers. This project is fully App Router.
- Avoid `getServerSideProps` / `getStaticProps` (Pages Router patterns). Use async Server Components or `generateStaticParams` instead.
- Avoid inline `fetch` without explicit revalidation strategy in production.
- Avoid non-awaited access to `params` or `searchParams` — they are Promises in Next.js 15+.

### Version-Specific Notes

- Running Next.js **16.2.1-canary.45** (Next.js 16 is stable as of 2026). Consider moving to `next@^16` stable.
- **React 19.2.5** (stable). Server Components, Server Actions, `use` hook, and ref-as-prop are production-ready.
- **Next.js 16 key changes**:
  - `params` and `searchParams` are `Promise<>` types that must be awaited.
  - **React Compiler** is built-in and stable — automatically memoizes components, reducing unnecessary re-renders. Enable via `reactCompiler: true` in `next.config.mjs`. **Gap**: Not yet enabled in this project (see GAP-14).
  - **Turbopack** is stable and the default bundler for `next dev` and `next build`.
  - **`next lint` has been removed.** Use standalone ESLint or Biome directly. `next build` no longer runs linting. **Gap**: The project's `npm run lint` script still calls `next lint` (see GAP-13).
  - `cacheLife` and `cacheTag` are stable (no `unstable_` prefix).
- The project's `serverExternalPackages` includes `chokidar` and `fsevents`.
- Dev server runs on port **30128**.

---

## 3. React Standards

### Recommended Patterns

- **Server-first.** Default to Server Components. Only add `"use client"` for interactivity (event handlers, hooks like `useState`, `useEffect`).
- **Component composition.** Use React's composition model (children, render props) over deep prop drilling.
- **Ref as prop (React 19+).** In new code, accept `ref` as a regular prop instead of using `forwardRef`. Existing `forwardRef` usage still works but is deprecated.
- **Custom hooks for shared logic.** Extract stateful logic into `lib/hooks/use-*.ts` files.
- **Named exports** for components (not default exports) to aid tree-shaking and refactoring.

### Anti-Patterns to Avoid

- Don't use `useEffect` for data fetching in components that could be Server Components.
- Don't pass serialization-unfriendly props (functions, class instances) from Server to Client Components.
- Avoid prop drilling more than 2 levels deep; prefer context or composition.
- Don't wrap new components in `React.forwardRef` — pass `ref` as a regular prop instead.

---

## 4. TypeScript Standards

### Recommended Patterns

- **Interface for object shapes, type for unions.** Use `interface` for component props and data models; `type` for union types and aliases.
- **Explicit return types on exported functions.** Helps catch regressions and improves IDE experience.
- **Import types with `import type`** when only using the type (not the runtime value). Reduces bundle.
- **Path aliases.** Always use `@/` prefix for project imports.
- **Discriminated unions for state machines.** Use union types with a literal discriminant (e.g. `ItemStatus`).
- **`unknown` over `any`** at system boundaries, then narrow with type guards.

### Anti-Patterns to Avoid

- Avoid `any`. Use `unknown` when the type is genuinely unknown, then narrow.
- Avoid non-null assertions (`!`) unless the invariant is trivially obvious.
- Avoid `enum`. Use `as const` objects or union literal types (the project already uses union types like `ItemStatus`).
- Avoid `@ts-ignore` / `@ts-expect-error` without a tracking comment.

### Project-Specific Conventions

- Types live in `types/` directory as dedicated files (e.g. `types/workflow.ts`, `types/session.ts`, `types/workspace.ts`, `types/skill.ts`, `types/question.ts`, `types/tool.ts`).
- The project uses `strict: true` in tsconfig (resolved from AUDIT-002 GAP-01).
- `moduleResolution: "bundler"` is correct for Next.js.
- `allowImportingTsExtensions: true` enables `.ts` imports in non-emitting contexts.

---

## 5. Tailwind CSS Standards

### Recommended Patterns

- **CSS variable-based theming.** All semantic colors defined as `hsl(var(--*))` in the Tailwind config. Extend via `globals.css` CSS variables.
- **Dark mode via `class` strategy.** Toggled by `next-themes` `ThemeProvider` with `attribute="class"`.
- **`cn()` utility for conditional classes.** Always use `cn()` (from `lib/utils.ts`) to merge Tailwind classes. Never manually concatenate class strings.
- **Component variants via CVA.** Use `class-variance-authority` for components with multiple visual variants (see `Button`).
- **Design tokens in config.** Colors (`primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info`), border-radius, and spacing defined in `tailwind.config.js`.

### Anti-Patterns to Avoid

- Don't use arbitrary values (`[#hex]`) when a design token exists.
- Don't duplicate theme colors across components; reference the Tailwind config tokens.
- Avoid `@apply` in CSS files for one-off styles. Prefer inline Tailwind classes.
- Don't inline `style=` attributes alongside Tailwind classes.

### Version-Specific Notes

- Project uses Tailwind CSS v3. Tailwind v4 (v4.2 as of early 2026) is the current release, using a CSS-first `@theme` configuration, the Oxide engine (2-5x faster builds), and native CSS variables. **Gap**: Migration to v4 is recommended. See Gaps section.
- The project's existing CSS-variable theme approach is already v4-aligned, which should make migration smoother.

---

## 6. Testing Standards

### Recommended Patterns

- **Node.js built-in test runner.** Tests use `node:test` and `node:assert` (not Jest, Vitest, etc.).
- **Test file colocation.** Test files live next to source files as `*.test.ts` (e.g. `lib/system-prompt.test.ts`).
- **Strict assertions.** Use `import { strict as assert } from 'node:assert'`.
- **Test naming.** Use descriptive strings in `test('description', ...)` calls.
- **No mocking frameworks.** Tests are straightforward unit tests with direct function calls.

### Anti-Patterns to Avoid

- Don't introduce external test frameworks (Jest, Vitest) without team decision.
- Don't rely on test execution order; each test should be independent.
- Don't use snapshot tests for logic; prefer assertion-based tests.

---

## 7. API Route Standards

### Recommended Patterns

- **Centralized error responses.** Use `createErrorResponse()` from `app/api/utils/errors.ts`.
- **Input validation at boundaries.** Validate all user input in API routes before passing to store functions.
- **`withWorkspace()` wrapper.** API routes that access the filesystem use the workspace context wrapper.
- **HTTP semantics.** Use correct status codes: 201 for creation, 400 for validation errors, 409 for conflicts, 500 for internal errors.
- **Typed request bodies.** Define interfaces for expected request bodies.
- **One `route.ts` per HTTP resource**, exporting named functions (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`).

### Anti-Patterns to Avoid

- Don't return bare strings as error responses; always use structured JSON via `NextResponse.json()`.
- Don't access the filesystem directly in route handlers; delegate to store functions in `lib/`.
- Don't swallow errors silently in catch blocks.
- Don't put business logic in route handlers; extract to `lib/` modules.

---

## 8. File Organization Standards

### Current Project Structure

```
app/              # Next.js App Router pages and API routes
  api/            # API route handlers (~10 resource groups)
  dashboard/      # Dashboard pages (workflows, agents, activity, settings, terminal, workspaces)
components/
  ui/             # Reusable primitives (button, card, dialog, input, select, etc.)
  dashboard/      # Dashboard-specific composed components (KanbanBoard, ChatWidget, etc.)
  terminal/       # Terminal UI components (SessionPanel, SlashPopup, etc.)
lib/              # Business logic, stores, utilities, hooks
  hooks/          # Custom React hooks (use-toast, use-item-done-sound, use-workflow-items)
types/            # TypeScript type definitions (6 files)
public/           # Static assets
bin/              # CLI entry point
templates/        # Scaffolding templates
.nos/             # NOS runtime data (workflows, config)
docs/             # Project documentation
  standards/      # Living standards and conventions
  requirements/   # Feature requirements
```

### Naming Conventions

| Item | Convention | Example |
|---|---|---|
| UI primitives (shadcn-style) | lowercase | `button.tsx`, `card.tsx`, `dialog.tsx` |
| Feature components | PascalCase | `KanbanBoard.tsx`, `ChatWidget.tsx` |
| API routes | `route.ts` in kebab-case dirs | `app/api/workflows/[id]/route.ts` |
| Utility modules | kebab-case | `workflow-store.ts`, `activity-log.ts` |
| Custom hooks | `use-` prefix, kebab-case | `use-toast.ts`, `use-item-done-sound.ts` |
| Type definition files | kebab-case | `types/workflow.ts` |
| Test files | `*.test.ts` colocated | `lib/system-prompt.test.ts` |
| Config files | Standard names | `tailwind.config.js`, `tsconfig.json` |
| CSS | Single global file | `app/globals.css` |

---

## 9. UI Component Standards

### Recommended Patterns

- **shadcn/ui-style primitives.** UI components in `components/ui/` follow the shadcn/ui pattern: CVA variants, `cn()` merging, Radix primitives.
- **Composition over configuration.** Components expose `className` prop for overrides via `cn()`.
- **Semantic color tokens.** Use `primary`, `secondary`, `muted`, `accent`, `destructive`, `success`, `warning`, `info` — never raw hex/hsl in components.
- **Consistent icon usage.** Use `lucide-react` icons throughout. Don't mix icon libraries.
- **Ref as prop.** New components should accept `ref` as a regular prop (React 19 pattern) rather than wrapping in `forwardRef`.

---

## 10. Data Layer Standards

### Recommended Patterns

- **YAML for metadata, JSON for config.** Workflow item metadata in `meta.yml`, workflow config in `config.json`.
- **Atomic writes.** Use `atomicWriteFile()` (write to `.tmp`, then rename) for data integrity.
- **Store pattern.** Business logic encapsulated in `lib/*-store.ts` files (`workflow-store.ts`, `agents-store.ts`, `workspace-store.ts`), not in API routes.
- **Event emission.** State changes emit events via `lib/workflow-events.ts` for real-time updates.

---

## 11. Identified Gaps

The following deviations from current best practices should be tracked for remediation:

### GAP-01: TypeScript `strict: false`
- **Status**: RESOLVED (AUDIT-003)
- **Resolution**: `tsconfig.json` now has `"strict": true`.

### GAP-02: Tailwind CSS v3 (v4.2 is current)
- **Status**: OPEN
- **Current**: Using `tailwindcss@^3.0` with JS-based `tailwind.config.js`.
- **Standard**: Tailwind CSS v4.2 (Feb 2026) is the current release, offering CSS-first configuration (`@theme`), the Oxide engine (2-5x faster builds written in Rust), and native CSS variables.
- **Impact**: Missing performance improvements and modern configuration patterns.
- **Recommendation**: Run `npx @tailwindcss/upgrade` on a branch. The project's CSS-variable theme approach is already v4-aligned, making migration smoother. Most migrations complete in 1-2 hours.

### GAP-03: No ESLint / Biome / Prettier Configuration
- **Status**: OPEN (elevated priority due to Next.js 16)
- **Current**: No `.eslintrc.*`, `eslint.config.*`, `.prettierrc`, or `biome.json` found. The `next lint` command has been **removed** in Next.js 16, so the project currently has no linting path at all.
- **Standard**: Next.js 16 projects should set up standalone ESLint (ESLint 9 flat config with `@next/eslint-plugin-next`) or Biome as a faster alternative. Prettier with `prettier-plugin-tailwindcss` for formatting and Tailwind class sorting.
- **Impact**: No automated code quality enforcement. The `npm run lint` script is broken (calls removed `next lint`).
- **Recommendation**: Choose ESLint 9 flat config or Biome. Add `eslint.config.mjs` with `@next/eslint-plugin-next` and `@typescript-eslint/eslint-plugin`, or add `biome.json`. Update the `lint` script in `package.json` accordingly.

### GAP-04: Incomplete Suspense Boundaries
- **Status**: RESOLVED (AUDIT-003)
- **Resolution**: `loading.tsx` added to all 8 dashboard sub-route segments (`activity/`, `agents/`, `settings/`, `terminal/`, `workflows/`, `workflows/[id]/`, `workflows/[id]/settings/`, `workspaces/`).

### GAP-05: Synchronous `fs` in API Routes
- **Status**: OPEN (low priority)
- **Current**: API routes and stores use `fs.readFileSync`, `fs.readdirSync`, `fs.existsSync`, etc.
- **Standard**: Async I/O (`fs.promises`) is preferred to avoid blocking the event loop.
- **Impact**: Under concurrent requests, synchronous filesystem calls can create bottlenecks.
- **Recommendation**: Migrate to `fs.promises` in store functions. Low priority for a local-only tool.

### GAP-06: Incomplete Error Boundaries
- **Status**: RESOLVED (AUDIT-003)
- **Resolution**: `error.tsx` added to all 8 dashboard sub-route segments (`activity/`, `agents/`, `settings/`, `terminal/`, `workflows/`, `workflows/[id]/`, `workflows/[id]/settings/`, `workspaces/`).

### GAP-07: Mixed Config File Formats
- **Status**: OPEN (low priority)
- **Current**: `next.config.mjs` (ESM), `tailwind.config.js` (CJS), `postcss.config.js` (CJS).
- **Standard**: Choose one module system for config files. With ESM as the standard, prefer `.mjs` or use `"type": "module"` in `package.json`.
- **Impact**: Minor inconsistency; no functional issue.
- **Recommendation**: Low priority. Standardize to ESM when convenient.

### GAP-08: Limited Test Coverage
- **Status**: OPEN
- **Current**: Only 3 test files found (`system-prompt.test.ts`, `use-workflow-items.test.ts`, `workflow-view-mode.test.ts`). No API route tests, no component tests.
- **Standard**: Critical business logic and API routes should have test coverage.
- **Impact**: Regressions in store functions and API routes may go undetected.
- **Recommendation**: Prioritize tests for `lib/workflow-store.ts`, `lib/agents-store.ts`, `lib/workspace-store.ts`, and API routes with complex validation logic.

### GAP-09: `React.forwardRef` Deprecation
- **Status**: RESOLVED (AUDIT-003)
- **Resolution**: All 14 `forwardRef` usages migrated to React 19 ref-as-prop pattern across 5 UI files (`button.tsx`, `toast.tsx`, `input.tsx`, `scroll-area.tsx`, `card.tsx`).

### GAP-10: Canary Dependency Pinning
- **Status**: PARTIALLY RESOLVED
- **Current**: `react` (19.2.5) and `react-dom` (19.2.5) are on stable releases. `next` remains on canary (`16.2.1-canary.45`) but is pinned to a specific version.
- **Standard**: Next.js 16 is now the stable release. Consider whether canary is still needed.
- **Impact**: Canary builds may introduce unexpected behavior changes vs stable.
- **Recommendation**: Evaluate whether Next.js canary features are still required. If not, move to `next@^16` stable.

### GAP-11: `@types/react` v18 with React 19 stable
- **Status**: OPEN
- **Current**: `@types/react@18.3.28` installed (verified in node_modules), but React is 19.2.5 stable. `package.json` specifies `^19.0.0` but older version is resolved.
- **Standard**: Type definitions should match the React version in use. React 19 APIs (`use()`, `useFormStatus`, ref-as-prop) have different type signatures.
- **Impact**: Type mismatches for React 19-specific APIs; IDE may flag valid React 19 code. With `strict: true` now enabled, these mismatches are more likely to surface.
- **Recommendation**: Run `npm install @types/react@^19.0.0 @types/react-dom@^19.0.0` to update. Verify types resolve correctly after update.

### GAP-12: `Logo.tsx` naming inconsistency in `components/ui/`
- **Status**: RESOLVED (AUDIT-003)
- **Resolution**: File renamed to `logo.tsx`, consistent with shadcn/ui lowercase convention.

### GAP-13: Broken `npm run lint` Script (NEW)
- **Status**: OPEN (high priority)
- **Current**: `package.json` defines `"lint": "next lint"`, but `next lint` has been removed in Next.js 16.
- **Standard**: The lint script should invoke a standalone linter (ESLint or Biome) directly.
- **Impact**: `npm run lint` will fail. No linting is possible without manual intervention.
- **Recommendation**: After resolving GAP-03 (setting up a linter), update the script to `"lint": "eslint ."` or `"lint": "biome check ."` as appropriate.

### GAP-14: React Compiler Not Enabled (NEW)
- **Status**: OPEN (medium priority)
- **Current**: `next.config.mjs` does not enable the React Compiler (`reactCompiler: true`).
- **Standard**: Next.js 16 ships with a stable, built-in React Compiler that automatically memoizes components, eliminating the need for manual `useMemo`, `useCallback`, and `React.memo` usage.
- **Impact**: Missing automatic memoization optimizations. Components may re-render unnecessarily.
- **Recommendation**: Add `reactCompiler: true` to `next.config.mjs`. Test thoroughly — the compiler may surface issues in components that rely on referential identity in non-standard ways.

### GAP-15: `next-themes` phantom dependency (NEW)
- **Status**: OPEN
- **Current**: `next-themes` (v0.4.6) is imported in `app/layout.tsx` and `components/ui/theme-toggle.tsx` but is not listed in `package.json` dependencies.
- **Standard**: All direct imports must be listed as explicit dependencies in `package.json`.
- **Impact**: Installation on a clean machine may fail if `next-themes` is not resolved as a transitive dependency. Version is unpinned and uncontrolled.
- **Recommendation**: Add `"next-themes": "^0.4.6"` to `dependencies` in `package.json`.

### AUDIT-004 (2026-04-22) Summary
- **Tech stack unchanged** from AUDIT-003.
- **New files added**: `lib/scaffolding.ts`, `lib/scaffolding.mjs`, `lib/scaffolding.test.ts` - follows existing patterns.
- **New standards documents**: `adr/`, `api-reference.md`, `deployment-design.md`, `error-handling-strategy.md`, `glossary.md`, `performance-budget.md`, `security-design.md`, `test-plan.md`, `ui-design.md`, `user-journey.md`, `ux-design.md`, `wbs-dictionary.md` added to `docs/standards/`.
- **All 15 gaps** remain in their prior states (5 resolved, 1 partial, 9 open).
- **Verified**: `@types/react@18.3.28` still installed despite `package.json` specifying `^19.0.0`.

---

## 12. Documentation Standards

### Recommended Patterns

- **Markdown-first.** All documentation in `docs/` uses Markdown with frontmatter metadata.
- **Living documents.** Standards documents should be updated as part of each audit cycle.
- **YAML metadata.** Use YAML frontmatter (`---`) for document metadata (last updated, author, status).
- **Cross-references.** Link between related documents using relative paths.

### Document Types

| Type | Location | Purpose |
|------|----------|---------|
| Standards | `docs/standards/*.md` | Living conventions and patterns |
| Architecture | `docs/standards/adr/*.md` | Architecture Decision Records |
| References | `docs/standards/api-reference.md` | API documentation |
| Design | `docs/standards/ui-design.md`, `ux-design.md` | Design specifications |
| Requirements | `docs/requirements/*.md` | Feature requirements |
| Audit | `.nos/workflows/audit/items/*/meta.yml` | Audit findings and fixes |

### Naming Conventions

| Document Type | Convention | Example |
|---|---|---|
| Standards | `kebab-case.md` | `error-handling-strategy.md` |
| ADRs | `ADR-###-title.md` | `ADR-008-atomic-file-writes.md` |
| Requirements | `REQ-#####.md` | `REQ-00088.md` |
| Audit findings | `AUDIT-###/*.md` | `AUDIT-004/meta.yml` |

### Anti-Patterns to Avoid

- Don't hardcode dates that will become stale; use relative references.
- Don't duplicate information across documents.
- Don't commit generated files (`.next/`, `node_modules/`, etc.).

---

## Appendix: Key Files Reference

| Purpose | File |
|---|---|
| Tailwind config | `tailwind.config.js` |
| TypeScript config | `tsconfig.json` |
| Next.js config | `next.config.mjs` |
| PostCSS config | `postcss.config.js` |
| Global CSS / theme tokens | `app/globals.css` |
| Class merge utility | `lib/utils.ts` |
| Workflow types | `types/workflow.ts` |
| Workflow store | `lib/workflow-store.ts` |
| Agents store | `lib/agents-store.ts` |
| Workspace store | `lib/workspace-store.ts` |
| Error response utility | `app/api/utils/errors.ts` |
| Dashboard error boundary | `app/dashboard/error.tsx` |
| Dashboard loading state | `app/dashboard/loading.tsx` |
| Scaffolding module | `lib/scaffolding.ts` |
| Templates root | `templates/` |
| NOS templates | `templates/.nos/` |
