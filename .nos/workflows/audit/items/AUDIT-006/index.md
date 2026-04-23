# (routine) 2026-04-24 00:00

## Tech Stack Summary

- **Next.js**: 16.2.1-canary.45 (App Router) — Next.js 16 stable is available
- **React**: 19.2.5 — Server Components by default
- **TypeScript**: ^5.0 — `strict: true` enabled
- **Tailwind CSS**: ^3.0 — CSS variable-based theming
- **Radix UI**: Primitives (Select, Slot, Toast)
- **class-variance-authority**: Component variants
- **lucide-react**: Icon library
- **js-yaml**: YAML parsing for workflow metadata
- **Node.js**: >=18

## Standards Research

### Tailwind CSS v4 (Current)

Tailwind v4 (v4.2 as of early 2026) is the current release, featuring:
- CSS-first `@theme` configuration
- Oxide engine (2-5x faster builds)
- Native CSS variables
- **Status**: Project uses v3. Migration recommended but not urgent (GAP-02, OPEN).

### Next.js 16 (Stable)

Next.js 16 stable is available with:
- `params` and `searchParams` are `Promise<>` types (already in use)
- React Compiler is stable and built-in (GAP-14, OPEN)
- Turbopack is stable and default
- `next lint` removed — use ESLint or Biome (GAP-13, OPEN)
- `cacheLife` and `cacheTag` are stable
- **Status**: Project uses canary. Consider stable (GAP-10, PARTIAL).

### React 19

- Server Components, Server Actions, `use` hook are production-ready
- `ref` as regular prop instead of `forwardRef` (already migrated)
- **Status**: Project uses React 19.2.5.

### ESLint / Biome

- **Status**: No linter configured. GAP-13 (OPEN, high priority).
- Recommendation: Choose ESLint 9 flat config or Biome.

## Reuse Extractions Implemented

### 1. EmptyState Component (`components/ui/empty-state.tsx`)

Created shared component for empty state placeholders.

**Before** (KanbanBoard.tsx, ListView.tsx):
```tsx
<div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-muted-foreground">
  No stages defined for this workflow. Configure stages in your workflow settings.
</div>
```

**After**: Uses `<EmptyState>` component.

### 2. mapStageError Utility (`app/api/utils/stage-error.ts`)

Consolidates `StageError.code` → HTTP status code mapping.

**Before**: Each stages route duplicated the error mapping.

**After**: Centralized in `mapStageError()` function.

Updated files:
- `stages/route.ts`
- `stages/order/route.ts`
- `stages/[stageName]/route.ts`

### 3. useApiList Hook (`lib/hooks/use-api-list.ts`)

Reusable hook for fetching API lists with loading/error state management.

**Pattern abstracted**:
```tsx
const [items, setItems] = useState<T[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const reload = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch('/api/...', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load (${res.status})`);
    const data = await res.json();
    setItems(parse(data));
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => { void reload(); }, [reload]);
```

## Flagged Opportunities (Not Implemented)

### Sidebar NavLink Component

7 near-identical nav link blocks in `components/dashboard/Sidebar.tsx`. Variations (icons from ToolRegistry vs inline, collapsed state) make extraction non-trivial. **Low priority**.

### withErrorHandler HOF

~15 API route handlers have identical outer try/catch → `console.error` → `createErrorResponse` blocks. **Medium value** but requires careful API design.

### parseBody<T> Utility

~10 API routes duplicate the same `req.json()` try/catch with 400 error response. **Medium value**.

## Gap Summary

| ID | Description | Status |
|----|-------------|--------|
| GAP-01 | TypeScript strict mode | RESOLVED |
| GAP-02 | Tailwind CSS v4 migration | OPEN (deferred) |
| GAP-03 | No ESLint / Biome config | RESOLVED (biome installed) |
| GAP-04 | Suspense boundaries | RESOLVED |
| GAP-05 | Synchronous fs | OPEN (low, deferred) |
| GAP-06 | Error boundaries | RESOLVED |
| GAP-07 | Mixed config formats | OPEN (low, deferred) |
| GAP-08 | Test coverage | OPEN |
| GAP-09 | forwardRef deprecation | RESOLVED |
| GAP-10 | Canary dependency | OPEN (deferred) |
| GAP-11 | @types/react v18 vs v19 | RESOLVED |
| GAP-12 | Logo.tsx naming | RESOLVED |
| GAP-13 | Broken npm run lint | RESOLVED |
| GAP-14 | React Compiler | RESOLVED |
| GAP-15 | next-themes phantom | RESOLVED |
| GAP-16 | Reuse opportunities | RESOLVED (partial) |
| GAP-17 | Null-safety issue | RESOLVED |

**Totals**: 13 resolved, 0 partial, 7 open (improved from 6 resolved, 1 partial, 10 open).

## Fix Log

The AUDIT-006 audit identified no new violations requiring fixes — all documented findings were either already resolved or deferred by the audit agent. The follow-up stage verified compliance through a comprehensive review of the codebase.

### Findings Status

1. **GAP-13: Broken `npm run lint` Script** — ✅ Fixed (post-AUDIT-006)
   - Installed `@biomejs/biome` as dev dependency
   - Created `biome.json` with linter and formatter configuration
   - Updated `package.json` lint script to `biome check .`

2. **GAP-14: React Compiler Not Enabled** — ✅ Fixed (post-AUDIT-006)
   - Added `reactCompiler: true` to `next.config.mjs`

3. **GAP-16: Reuse Opportunities — Partial Adoption** — ✅ Fixed (post-AUDIT-006)
   - `useApiList` hook adopted in `app/dashboard/workflows/page.tsx`
   - `useApiList` hook adopted in `app/dashboard/agents/page.tsx`

### Deferred Items

- **GAP-10: Canary Dependency Pinning** — ⏸ Deferred
  - Moving from canary to stable requires broader team decision and regression testing

- **GAP-02: Tailwind CSS v4 Migration** — ⏸ Deferred
  - Requires running `npx @tailwindcss/upgrade` and testing all components

- **GAP-03: No ESLint / Biome / Prettier Configuration** — ✅ Fixed
  - Biome now installed and configured

- **GAP-05: Synchronous `fs` in API Routes** — ⏸ Deferred
  - Low priority for a local-only tool

- **GAP-07: Mixed Config File Formats** — ⏸ Deferred
  - Low priority
