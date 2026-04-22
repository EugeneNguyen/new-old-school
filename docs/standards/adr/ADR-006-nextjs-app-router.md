# ADR-006: Next.js App Router Architecture

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

NOS needs a web framework for the dashboard UI and API routes. The application serves a local operator with server-rendered pages and REST endpoints.

## Decision

Use Next.js 16 with the App Router exclusively (no Pages Router). Server Components by default; `"use client"` only for interactive components. API routes defined as `route.ts` files with named exports.

## Consequences

**Positive:**
- Server Components reduce client bundle size; data fetching happens on server
- File-system routing eliminates manual route configuration
- API routes colocated with the app; no separate backend server
- Layouts for shared UI (sidebar, toaster) without re-rendering
- Turbopack (default in Next.js 16) provides fast dev rebuilds

**Negative:**
- Running on canary (16.2.1-canary.45) instead of stable u2014 risk of breaking changes
- `next lint` removed in Next.js 16; linting infrastructure needs replacement (GAP-03/13)
- React Compiler available but not yet enabled (GAP-14)
- `params`/`searchParams` as Promises require await in all page/layout components

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Remix | Less mature ecosystem; no significant advantage for local tool |
| Vite + Express | Would need manual SSR setup; lose Next.js conventions |
| Pages Router | Deprecated pattern; misses RSC benefits |
