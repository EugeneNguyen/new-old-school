# Project Context: nos

## Contents
- Tech stack
- Directory layout
- Key conventions
- Adding a new feature checklist

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js (App Router, canary) |
| Language | TypeScript 5.0 |
| Styling | Tailwind CSS 3 + shadcn/ui |
| Icons | Lucide React |
| CLI | Commander + Open |
| Dev port | 30128 |

## Directory Layout

```
app/                    # Next.js App Router
  api/                  # Route handlers (API endpoints)
    utils/errors.ts     # Standardized error responses
  dashboard/            # Dashboard pages
    layout.tsx          # Dashboard layout with sidebar
components/
  dashboard/            # Dashboard-specific components
  ui/                   # shadcn/ui primitives
lib/
  tool-registry.ts      # Dynamic tool loading from config
  utils.ts              # cn() and general utilities
types/
  tool.ts               # ToolDefinition interface
config/
  tools.json            # Tool registry (drives sidebar + home)
docs/requirements/      # Requirement management files
```

## Key Conventions

- **Imports**: Use `@/*` path alias (e.g., `import { cn } from '@/lib/utils'`).
- **Client components**: Add `"use client"` directive at top.
- **API routes**: Place in `app/api/[feature]/route.ts`. Use `createErrorResponse` from `app/api/utils/errors.ts`.
- **New pages**: Add to `app/dashboard/[feature]/page.tsx`. Update `config/tools.json` to register in sidebar.
- **UI components**: Use shadcn/ui components from `components/ui/`. Add new ones via the shadcn CLI pattern.
- **Tool registration**: Every navigable tool needs an entry in `config/tools.json` with: `id`, `name`, `href`, `icon` (Lucide name), `description`, `endpoint`, `category`.

## Adding a New Feature Checklist

1. Create API route in `app/api/[feature]/route.ts` if backend needed.
2. Create page in `app/dashboard/[feature]/page.tsx`.
3. Add tool entry to `config/tools.json`.
4. Add any new types to `types/`.
5. Sidebar and home page update automatically from tool registry.
6. Run `npm run build` to verify.
