# ADR-005: CSS Variable Theming with Tailwind

**Status**: Accepted  
**Date**: 2026-04-21

---

## Context

NOS supports light and dark modes. The UI needs a consistent color system that works across all components and can be toggled at runtime.

## Decision

Define all color tokens as HSL CSS custom properties in `:root` (light) and `.dark` (dark mode). Tailwind is configured to reference these variables via `hsl(var(--token))`. Theme switching is managed by `next-themes` with `attribute="class"` strategy.

## Consequences

**Positive:**
- Single source of truth for colors; change a variable, update everywhere
- Runtime theme switching without page reload
- 12+ semantic color tokens (primary, secondary, destructive, success, warning, info, muted, accent, etc.)
- shadcn/ui compatible; components inherit theme automatically

**Negative:**
- HSL values without `hsl()` wrapper in CSS variables (requires `hsl(var(...))` at usage site)
- `next-themes` is imported but currently a phantom dependency (GAP-15)
- Tailwind v3 pattern; migration to v4 would use `@theme` directives instead

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Tailwind dark: prefix only | No runtime switching; requires rebuild for theme change |
| CSS-in-JS (styled-components) | Heavier runtime; conflicts with RSC model |
| Tailwind v4 @theme | Not yet adopted; v3 is current (GAP-02) |
