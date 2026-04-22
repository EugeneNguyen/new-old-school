# Performance Budget

> Last updated: 2026-04-21

NOS is a local-only developer tool. Performance budgets are calibrated for the local development context, not public-facing web applications.

---

## Lighthouse Score Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Performance | >= 80 | Local-only; network latency is zero |
| Accessibility | >= 90 | Radix UI provides baseline; needs audit (see UX Design) |
| Best Practices | >= 90 | |
| SEO | N/A | Local tool; not indexed |

---

## Core Web Vitals Thresholds

| Metric | Target | Rationale |
|--------|--------|-----------|
| **LCP** (Largest Contentful Paint) | < 1.5s | Local server; no network round-trip for assets |
| **FID** (First Input Delay) | < 50ms | Dashboard should feel instantly responsive |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Sidebar + main content layout should be stable |
| **INP** (Interaction to Next Paint) | < 100ms | Drag-drop and dialog interactions must be snappy |

---

## Bundle Size Limits

| Bundle | Target | Current Concern |
|--------|--------|-----------------|
| First Load JS | < 200KB gzipped | MDXEditor is a large dependency (~100KB+) |
| Route chunks | < 50KB each | Dashboard routes should code-split cleanly |
| CSS | < 30KB gzipped | Tailwind purges unused classes |

### Key Dependencies by Size

| Dependency | Approx. Size | Notes |
|------------|-------------|-------|
| `@mdxeditor/editor` | ~100KB+ | Only loaded on item detail dialog |
| `@uiw/react-markdown-preview` | ~50KB+ | Markdown rendering |
| `lucide-react` | Tree-shakeable | Only imported icons are bundled |
| `@radix-ui/*` | ~5-10KB each | Tree-shakeable primitives |
| `next-themes` | ~2KB | Minimal |

---

## API Response Time SLOs

| Endpoint Category | Target (p95) | Rationale |
|-------------------|-------------|----------|
| CRUD operations (GET/POST/PATCH/DELETE) | < 50ms | File I/O on local SSD |
| List operations (GET with pagination) | < 100ms | JSONL parsing + filtering |
| SSE connection setup | < 100ms | EventSource handshake |
| Agent session spawn | < 5s | Claude CLI startup time |
| Heartbeat sweep cycle | < 2s per workspace | Filesystem scan of all items |

---

## Runtime Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Kanban board render (100 items) | < 200ms | Virtual rendering not needed at this scale |
| Item detail dialog open | < 300ms | Includes MDXEditor initialization |
| SSE event propagation | < 100ms | From file write to UI update |
| Heartbeat sweeper memory | < 50MB | Single-threaded scan, no item caching |

---

## Recommendations

| Priority | Action |
|----------|--------|
| Medium | Lazy-load MDXEditor (dynamic import) to reduce initial bundle |
| Medium | Enable React Compiler (GAP-14) for automatic memoization |
| Low | Configure `@next/bundle-analyzer` to track bundle growth |
| Low | Add `loading.tsx` skeletons with meaningful layout placeholders |
