# NOS Project Standards

This directory contains the living standards and conventions for the NOS project.
Each section covers a major technology in the stack with recommended patterns,
anti-patterns, and project-specific conventions already in use.

**Last audited:** 2026-04-21

---

## Tech Stack Summary

| Technology | Version | Role |
|---|---|---|
| Next.js | canary (App Router) | Framework, server/client rendering, API routes |
| React | canary | UI library |
| TypeScript | ^5.0 | Language |
| Tailwind CSS | ^3.0 | Utility-first styling |
| Radix UI | various | Headless accessible primitives |
| class-variance-authority (CVA) | ^0.7 | Component variant management |
| clsx + tailwind-merge | latest | Conditional class merging (`cn()` helper) |
| js-yaml | ^4.1 | YAML parsing for workflow metadata |
| chokidar | ^3.6 | File-system watching |
| commander | ^12.0 | CLI interface (`bin/cli.mjs`) |
| next-themes | (peer) | Dark/light theme switching |
| Node.js built-in test runner | `node --test` | Testing |
| PostCSS + Autoprefixer | ^8 / ^10 | CSS processing |

---

## 1. Next.js (App Router)

### Recommended Patterns

- **Server Components by default.** Every component is a Server Component unless
  it requires interactivity. Only add `"use client"` at the leaf level.
- **Route Handlers** (`app/api/**/route.ts`) for API endpoints using
  `NextResponse`. Group related routes under a shared segment.
- **Layouts** persist across navigations and should not re-fetch data.
  Use `layout.tsx` for shared chrome (sidebar, nav, theme provider).
- **Metadata** is generated via the exported `metadata` object or
  `generateMetadata()` for dynamic pages.
- **Suspense boundaries** around async data dependencies with
  dimensionally-accurate skeleton fallbacks.
- **Server Actions** must validate inputs (prefer Zod schemas) and return
  typed error objects.
- **`generateStaticParams`** for any dynamic route with a known set of slugs.
- **Error boundaries** (`error.tsx`) per route segment.

### Anti-Patterns to Avoid

- Placing `"use client"` at the top of large component trees. Push it down
  to the smallest interactive leaf.
- Using `fs` or Node APIs in client components (they will fail at build).
- Relying on implicit fetch caching defaults; always set an explicit
  `revalidate` or tag.
- Nesting API route handlers more than 3 segments deep without shared utils.

### Project-Specific Conventions

- API error responses go through `app/api/utils/errors.ts` (`createErrorResponse`).
- Workspace context is injected via `withWorkspace()` wrapper in route handlers.
- The dev server runs on port **30128**.
- `serverExternalPackages` includes `chokidar` and `fsevents`.

---

## 2. TypeScript

### Recommended Patterns

- **Enable `strict: true`** in `tsconfig.json`. This activates:
  `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`,
  `strictPropertyInitialization`, `noImplicitAny`, `noImplicitThis`,
  `useUnknownInCatchVariables`, `alwaysStrict`.
- **Additional recommended flags:** `noUncheckedIndexedAccess`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`.
- **Discriminated unions** over enums for domain modeling.
- **Branded types** for domain identifiers (e.g., `WorkflowId`, `ItemId`).
- **Explicit return types** on exported functions.
- **`unknown` over `any`** at system boundaries.

### Anti-Patterns to Avoid

- `any` as an escape hatch (use `unknown` + type guards).
- Type assertions (`as`) without validation.
- Bare `catch (e)` without narrowing `e`.
- `@ts-ignore` / `@ts-expect-error` without a tracking comment.

### Project-Specific Conventions

- Path alias `@/*` maps to project root.
- Types are co-located in `types/` directory.
- `interface` preferred for object shapes passed as props; `type` for unions.

### Version-Specific Notes

- TypeScript 5.x: `moduleResolution: "bundler"` is correct for Next.js.
- `allowImportingTsExtensions: true` is set, enabling `.ts` imports in
  non-emitting contexts.

---

## 3. Tailwind CSS (v3)

### Recommended Patterns

- **Design tokens via CSS custom properties.** The project uses
  `hsl(var(--...))` tokens in `tailwind.config.js` for a semantic color
  system (`primary`, `secondary`, `muted`, `accent`, etc.).
- **`cn()` helper** (`lib/utils.ts`) for conditional/merged class names.
- **CVA (class-variance-authority)** for component variants (see `button.tsx`).
- **Consistent class ordering:** layout -> box model -> typography -> colors -> effects -> states. Use `prettier-plugin-tailwindcss` to automate.
- **Component wrappers** for repeated UI patterns (Button, Card, Badge, etc.)
  in `components/ui/`.
- **Dark mode** via `class` strategy (`darkMode: 'class'`) with `next-themes`.

### Anti-Patterns to Avoid

- Overusing `@apply` for everyday component styling.
- Arbitrary values (`text-[13.5px]`) when a scale token exists.
- Inline `style=` attributes alongside Tailwind classes.
- Duplicating long class strings across files instead of extracting a component.

### Project-Specific Conventions

- Color system follows shadcn/ui conventions: `--background`, `--foreground`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--card`, `--popover`,
  `--border`, `--input`, `--ring`.
- Border radius uses `--radius` CSS variable.
- Content paths scan `app/` and `components/` only.

---

## 4. React Patterns

### Recommended Patterns

- **`forwardRef`** for all reusable UI primitives (already used in `Button`).
- **Composition via `asChild` / Radix `Slot`** pattern for polymorphic
  components.
- **Props interfaces** extend native HTML attributes when wrapping native
  elements.
- **Named exports** (not default) for components, to aid tree-shaking and
  refactoring.
- **Co-locate** context providers near the components that consume them.

### Anti-Patterns to Avoid

- `useEffect` for data fetching in Server Component-eligible code.
- Prop drilling more than 2 levels; use context or composition.
- Anonymous default exports.
- Inline function definitions in JSX for non-trivial callbacks.

### Project-Specific Conventions

- UI primitives live in `components/ui/`.
- Feature components are grouped by domain: `components/dashboard/`,
  `components/terminal/`.
- `displayName` is set on `forwardRef` components.

---

## 5. API Route Conventions

### Recommended Patterns

- One `route.ts` per HTTP resource, exporting named functions (`GET`, `POST`,
  `PUT`, `DELETE`, `PATCH`).
- Input validation with regex or schema at the boundary.
- Consistent error response shape via `createErrorResponse(message, code, status)`.
- Wrap handler bodies in `withWorkspace()` for workspace-scoped operations.

### Anti-Patterns to Avoid

- Returning raw strings instead of `NextResponse.json()`.
- Swallowing errors silently in catch blocks.
- Business logic in route handlers; extract to `lib/` modules.

---

## 6. File & Naming Conventions

### Recommended Patterns

- **Components:** PascalCase filenames (`KanbanBoard.tsx`, `ChatWidget.tsx`).
- **UI primitives:** lowercase filenames (`button.tsx`, `card.tsx`) following
  shadcn/ui convention.
- **Libraries/utilities:** kebab-case (`workflow-store.ts`, `auto-advance.ts`).
- **Types:** dedicated `types/` directory with kebab-case filenames.
- **Tests:** co-located with source using `.test.ts` suffix
  (`system-prompt.test.ts`).
- **API routes:** `app/api/<resource>/route.ts` with `[param]` dynamic segments.

### Anti-Patterns to Avoid

- Mixing casing conventions within a directory.
- `index.ts` barrel files that re-export everything (tree-shaking penalty).
- Deeply nested utility directories; prefer flat `lib/`.

---

## 7. Testing

### Recommended Patterns

- **Node.js built-in test runner** (`node --test`) for unit tests.
- Tests co-located next to source files with `.test.ts` suffix.
- Test files in `lib/` directory pattern: `lib/**/*.test.ts`.

### Anti-Patterns to Avoid

- External test framework dependencies when the built-in runner suffices.
- Snapshot tests for logic; prefer assertion-based tests.

---

## 8. Project Architecture

### Recommended Patterns

- `app/` — Next.js App Router pages, layouts, and API routes.
- `components/` — React components grouped by domain.
- `lib/` — Business logic, stores, utilities (no React dependencies ideally).
- `types/` — Shared TypeScript type definitions.
- `bin/` — CLI entry point.
- `.nos/workflows/` — Workflow data (config, items, stages).
- `docs/` — Project documentation.

### Anti-Patterns to Avoid

- Circular imports between `lib/` and `components/`.
- Putting business logic directly in React components.
- API routes that directly access the filesystem without going through a
  store module.

---

## Gaps Identified

The following deviations from current best practices were found during the
2026-04-21 audit:

### GAP-1: TypeScript strict mode is disabled

**Current:** `tsconfig.json` has `"strict": false`.
**Standard:** TypeScript strict mode should be enabled (`"strict": true`).
**Impact:** The codebase misses compile-time null checks, implicit-any
detection, and other safety guarantees. This is the single highest-impact
gap.
**Remediation:** Enable `strict: true` incrementally. Consider
`typescript-strict-plugin` for gradual adoption.

### GAP-2: No ESLint configuration

**Current:** No `.eslintrc` or `eslint.config.*` at project root. The
`next lint` script exists but has no custom config.
**Standard:** ESLint with `eslint-config-next` and TypeScript-aware rules.
**Impact:** No automated code quality or consistency enforcement.
**Remediation:** Add `eslint.config.mjs` with `@next/eslint-plugin-next`
and `@typescript-eslint/eslint-plugin`.

### GAP-3: No Prettier or formatting tool configured

**Current:** No `.prettierrc` or formatting config.
**Standard:** Prettier with `prettier-plugin-tailwindcss` for consistent
formatting and Tailwind class sorting.
**Impact:** Inconsistent formatting across contributors and unsorted Tailwind
class strings.
**Remediation:** Add Prettier config with `prettier-plugin-tailwindcss`.

### GAP-4: Mixed component file naming in `components/ui/`

**Current:** Some UI files are lowercase (`button.tsx`, `card.tsx`) while
`Logo.tsx` uses PascalCase.
**Standard:** Consistently lowercase for shadcn/ui primitives.
**Impact:** Minor inconsistency.
**Remediation:** Rename `Logo.tsx` to `logo.tsx` or establish that non-shadcn
UI components use PascalCase.

### GAP-5: No `error.tsx` or `loading.tsx` route segments

**Current:** No error boundary or loading state files in route segments.
**Standard:** Each major route segment should have `error.tsx` for error
recovery and `loading.tsx` for Suspense fallbacks.
**Impact:** Unhandled errors crash the entire page; no streaming loading
states.
**Remediation:** Add `error.tsx` to `app/dashboard/` and other key segments.

### GAP-6: React/React-DOM on canary channel

**Current:** `react` and `react-dom` are pinned to `canary`.
**Standard:** Production apps should pin to a stable release (React 19.x).
**Impact:** Canary builds may contain breaking changes without notice.
**Remediation:** Acceptable for an internal tool tracking Next.js canary, but
should be documented as an intentional choice.

### GAP-7: Limited test coverage

**Current:** Only 3 test files found (`system-prompt.test.ts`,
`use-workflow-items.test.ts`, `workflow-view-mode.test.ts`).
**Standard:** Critical business logic in `lib/` should have test coverage.
**Impact:** Regressions in workflow store, auto-advance, stage pipeline, etc.
are not caught automatically.
**Remediation:** Add tests for `workflow-store.ts`, `auto-advance.ts`,
`stage-pipeline.ts`, and API route handlers.

### GAP-8: `@types/react` and `@types/react-dom` are v18, but React is canary (v19+)

**Current:** `@types/react: ^18.0.0` and `@types/react-dom: ^18.0.0`.
**Standard:** Type definitions should match the React version in use.
**Impact:** Type mismatches for React 19 APIs (e.g., `use()`, `useFormStatus`).
**Remediation:** Upgrade to `@types/react@^19.0.0` and
`@types/react-dom@^19.0.0`, or use React's built-in types if on 19+.
