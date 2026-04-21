# NOS Project Standards

> Last audited: 2026-04-21

---

## 1. Tech Stack Summary

| Technology | Version | Notes |
|---|---|---|
| **Next.js** | canary (App Router) | Server-first architecture |
| **React** | canary | Server Components by default |
| **TypeScript** | ^5.0 | `strict: false` in tsconfig |
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

### Anti-Patterns to Avoid

- Avoid `"use client"` on components that only render data without interactivity.
- Avoid mixing `pages/` and `app/` routers. This project is fully App Router.
- Avoid `getServerSideProps` / `getStaticProps` (Pages Router patterns). Use async Server Components or `generateStaticParams` instead.
- Avoid inline `fetch` without explicit revalidation strategy in production.

### Version-Specific Notes

- Running Next.js **canary** means access to latest experimental APIs. Pin specific canary versions for production stability.
- React canary includes Server Components, Server Actions, and `use` hook natively.

---

## 3. React Standards

### Recommended Patterns

- **Server-first.** Default to Server Components. Only add `"use client"` for interactivity (event handlers, hooks like `useState`, `useEffect`).
- **Component composition.** Use React's composition model (children, render props) over deep prop drilling.
- **`forwardRef` for reusable primitives.** UI components that wrap native elements should forward refs (see `Button` component).
- **Custom hooks for shared logic.** Extract stateful logic into `lib/hooks/use-*.ts` files.
- **Explicit `displayName`.** Set on `forwardRef` components for better debugging.

### Anti-Patterns to Avoid

- Don't use `useEffect` for data fetching in components that could be Server Components.
- Don't pass serialization-unfriendly props (functions, class instances) from Server to Client Components.
- Avoid prop drilling more than 2 levels deep; prefer context or composition.

---

## 4. TypeScript Standards

### Recommended Patterns

- **Interface for object shapes, type for unions.** Use `interface` for component props and data models; `type` for union types and aliases.
- **Explicit return types on exported functions.** Helps catch regressions and improves IDE experience.
- **Import types with `import type`** when only using the type (not the runtime value). Reduces bundle.
- **Path aliases.** Always use `@/` prefix for project imports.
- **Discriminated unions for state machines.** Use union types with a literal discriminant (e.g. `ItemStatus`).

### Anti-Patterns to Avoid

- Avoid `any`. Use `unknown` when the type is genuinely unknown, then narrow.
- Avoid non-null assertions (`!`) unless the invariant is trivially obvious.
- Avoid `enum`. Use `as const` objects or union literal types (the project already uses union types like `ItemStatus`).

### Project-Specific Conventions

- Types live in `types/` directory as dedicated files (e.g. `types/workflow.ts`).
- The project uses `strict: false` in tsconfig. **Gap**: Enabling `strict: true` would catch more bugs. See Gaps section.

---

## 5. Tailwind CSS Standards

### Recommended Patterns

- **CSS variable-based theming.** All semantic colors defined as `hsl(var(--*))` in the Tailwind config. Extend via `globals.css` CSS variables.
- **Dark mode via `class` strategy.** Toggled by `next-themes` `ThemeProvider` with `attribute="class"`.
- **`cn()` utility for conditional classes.** Always use `cn()` (from `lib/utils.ts`) to merge Tailwind classes. Never manually concatenate class strings.
- **Component variants via CVA.** Use `class-variance-authority` for components with multiple visual variants (see `Button`).
- **Design tokens in config.** Colors, border-radius, and spacing defined in `tailwind.config.js`.

### Anti-Patterns to Avoid

- Don't use arbitrary values (`[#hex]`) when a design token exists.
- Don't duplicate theme colors across components; reference the Tailwind config tokens.
- Avoid `@apply` in CSS files for one-off styles. Prefer inline Tailwind classes.

### Version-Specific Notes

- Project uses Tailwind CSS v3. Tailwind v4 is now the current release (CSS-first config, Oxide engine, native CSS variables). **Gap**: Migration to v4 is recommended for performance. See Gaps section.

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

---

## 7. API Route Standards

### Recommended Patterns

- **Centralized error responses.** Use `createErrorResponse()` from `app/api/utils/errors.ts`.
- **Input validation at boundaries.** Validate all user input in API routes before passing to store functions.
- **`withWorkspace()` wrapper.** API routes that access the filesystem use the workspace context wrapper.
- **HTTP semantics.** Use correct status codes: 201 for creation, 400 for validation errors, 409 for conflicts, 500 for internal errors.
- **Typed request bodies.** Define interfaces for expected request bodies.

### Anti-Patterns to Avoid

- Don't return bare strings as error responses; always use structured JSON.
- Don't access the filesystem directly in route handlers; delegate to store functions in `lib/`.

---

## 8. File Organization Standards

### Current Project Structure

```
app/              # Next.js App Router pages and API routes
  api/            # API route handlers
  dashboard/      # Dashboard pages (layouts, workflows, settings)
components/
  ui/             # Reusable primitives (Button, Card, Dialog, etc.)
  dashboard/      # Dashboard-specific composed components
  terminal/       # Terminal UI components
lib/              # Business logic, stores, utilities, hooks
  hooks/          # Custom React hooks
types/            # TypeScript type definitions
public/           # Static assets
bin/              # CLI entry point
templates/        # Scaffolding templates
.nos/             # NOS runtime data (workflows, config)
docs/             # Project documentation
```

### Naming Conventions

| Item | Convention | Example |
|---|---|---|
| React components | PascalCase files | `KanbanBoard.tsx`, `ChatWidget.tsx` |
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

- **shadcn/ui-style primitives.** UI components in `components/ui/` follow the shadcn/ui pattern: CVA variants, `cn()` merging, `forwardRef`, Radix primitives.
- **Composition over configuration.** Components expose `className` prop for overrides via `cn()`.
- **Semantic color tokens.** Use `primary`, `secondary`, `muted`, `accent`, `destructive` — never raw hex/hsl in components.
- **Consistent icon usage.** Use `lucide-react` icons throughout. Don't mix icon libraries.

---

## 10. Data Layer Standards

### Recommended Patterns

- **YAML for metadata, JSON for config.** Workflow item metadata in `meta.yml`, workflow config in `config.json`.
- **Atomic writes.** Use `atomicWriteFile()` (write to `.tmp`, then rename) for data integrity.
- **Store pattern.** Business logic encapsulated in `lib/*-store.ts` files, not in API routes.
- **Event emission.** State changes emit events via `lib/workflow-events.ts` for real-time updates.

---

## 11. Identified Gaps

The following deviations from current best practices should be tracked for remediation:

### GAP-01: TypeScript `strict: false`
- **Current**: `tsconfig.json` has `"strict": false`.
- **Standard**: TypeScript strict mode is universally recommended. It enables `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and other safety checks.
- **Impact**: Potential null-reference bugs and implicit `any` types go uncaught.
- **Recommendation**: Enable incrementally — start with `strictNullChecks`, then `noImplicitAny`, then full `strict: true`.

### GAP-02: Tailwind CSS v3 (v4 is current)
- **Current**: Using `tailwindcss@^3.0` with JS-based `tailwind.config.js`.
- **Standard**: Tailwind CSS v4 is the current release, offering CSS-first configuration (`@theme`), the Oxide engine (up to 10x faster builds), and native CSS variables.
- **Impact**: Missing performance improvements and modern configuration patterns.
- **Recommendation**: Run the official `@tailwindcss/upgrade` tool on a branch. Requires Node.js 20+. The project's CSS-variable theme approach is already v4-aligned, which should make migration smoother.

### GAP-03: No ESLint / Prettier Configuration
- **Current**: No `.eslintrc.*` or `.prettierrc` files found. `next lint` is available but there's no explicit ESLint config.
- **Standard**: Next.js projects should have explicit ESLint configuration with `eslint-config-next` for catching common issues (unused imports, React rules, accessibility).
- **Impact**: No automated code quality enforcement beyond TypeScript type checking.
- **Recommendation**: Run `npx next lint --init` to scaffold the recommended ESLint setup.

### GAP-04: Missing Suspense Boundaries
- **Current**: Dashboard pages don't use `<Suspense>` boundaries or `loading.tsx` files.
- **Standard**: App Router best practice is to add `loading.tsx` files at route boundaries and wrap async data fetches in `<Suspense>` for streaming.
- **Impact**: Pages show no loading state during data fetches; full-page loading instead of progressive rendering.
- **Recommendation**: Add `loading.tsx` to key route segments (`app/dashboard/`, `app/dashboard/workflows/`).

### GAP-05: Synchronous `fs` in API Routes
- **Current**: API routes and stores use `fs.readFileSync`, `fs.readdirSync`, `fs.existsSync`, etc.
- **Standard**: Next.js API routes run in a server context where async I/O (`fs.promises`) is preferred to avoid blocking the event loop.
- **Impact**: Under concurrent requests, synchronous filesystem calls can create bottlenecks.
- **Recommendation**: Migrate to `fs.promises` (or `import { readFile } from 'fs/promises'`) in store functions. Low priority for a local-only tool.

### GAP-06: No Error Boundaries
- **Current**: No `error.tsx` files in route segments.
- **Standard**: App Router supports per-route error boundaries via `error.tsx` to catch rendering errors gracefully.
- **Impact**: Unhandled errors in a route crash the entire page instead of showing a recoverable error UI.
- **Recommendation**: Add `error.tsx` to `app/dashboard/` and other key route segments.

### GAP-07: Mixed Config File Formats
- **Current**: `next.config.mjs` (ESM), `tailwind.config.js` (CJS), `postcss.config.js` (CJS).
- **Standard**: Choose one module system for config files. With Next.js canary and ESM as the standard, prefer `.mjs` or use `"type": "module"` in `package.json`.
- **Impact**: Minor inconsistency; no functional issue.
- **Recommendation**: Low priority. Standardize to ESM when convenient.

### GAP-08: Limited Test Coverage
- **Current**: Only 3 test files found (`system-prompt.test.ts`, `use-workflow-items.test.ts`, `workflow-view-mode.test.ts`). No API route tests, no component tests.
- **Standard**: Critical business logic and API routes should have test coverage.
- **Impact**: Regressions in store functions and API routes may go undetected.
- **Recommendation**: Prioritize tests for `lib/workflow-store.ts` (core data operations) and API routes with complex validation logic.

### GAP-09: `React.forwardRef` Deprecation Path
- **Current**: UI components use `React.forwardRef` (e.g., `Button`).
- **Standard**: React 19 passes `ref` as a regular prop, making `forwardRef` unnecessary for new code. It still works but is no longer the recommended pattern.
- **Impact**: No functional issue. `forwardRef` works in React 19 but adds verbosity.
- **Recommendation**: When touching UI components, migrate to direct `ref` prop. No urgent action needed.

### GAP-10: Canary Dependency Pinning
- **Current**: `next`, `react`, and `react-dom` all point to `canary` with no version pinning.
- **Standard**: Even when using canary, pin to specific canary versions (e.g., `next@15.2.0-canary.42`) for reproducible builds.
- **Impact**: `npm install` on different days can pull different canary builds, causing inconsistent behavior.
- **Recommendation**: Pin to specific canary versions in `package.json` or use a lockfile.

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
| Error response utility | `app/api/utils/errors.ts` |
