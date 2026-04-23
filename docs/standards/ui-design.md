# UI Design

> Last updated: 2026-04-23

---

## Component Inventory

### Primitive Components (`components/ui/`)

| Component | Source | Radix Primitive | Variants (CVA) |
|-----------|--------|----------------|-----------------|
| Button | `button.tsx` | Slot (asChild) | default, destructive, outline, secondary, ghost, link; sizes: default, sm, lg, icon |
| Input | `input.tsx` | u2014 | Single variant; ref-as-prop |
| Dialog | `dialog.tsx` | Dialog | Overlay, Content, Header, Footer, Title, Description |
| Select | `select.tsx` | Select | Trigger, Content, Item, Label, Separator |
| Badge | `badge.tsx` | u2014 | default, secondary, destructive, outline |
| ScrollArea | `scroll-area.tsx` | ScrollArea | Viewport + scrollbar |
| Toast | `toast.tsx` | Toast | default, destructive; Provider + Viewport + Action |
| Card | `card.tsx` | u2014 | Header, Title, Description, Content, Footer |
| ThemeToggle | `theme-toggle.tsx` | u2014 | Light/dark/system toggle |
| Logo | `logo.tsx` | u2014 | SVG logo component |

### Feature Components (`components/dashboard/`)

| Component | Purpose |
|-----------|--------|
| KanbanBoard | Drag-drop stage columns with item cards |
| ListView | Tabular item listing |
| WorkflowItemsView | View toggle container (Kanban/List) |
| ItemDetailDialog | Full item editor (title, body, comments, sessions) |
| ItemDescriptionEditor | MDXEditor-based markdown body editor |
| NewItemDialog | Create item form |
| StageDetailDialog | Stage settings editor |
| AddStageDialog | Create stage form |
| WorkflowSettingsView | Workflow metadata + stage management |
| RoutineSettingsDialog | Recurring task configuration |
| Sidebar | Navigation with workspace/workflow hierarchy |
| SidebarContext | React context for sidebar state |
| WorkspaceSwitcher | Workspace selection dropdown |
| ChatWidget | Chat interface for agent interaction |
| FileBrowser | Directory tree with folder-first sort, file icons, size formatting |
| FileViewer | File preview panel supporting text, image, audio, video, binary metadata |

### Chat Components (`components/chat/`)

| Component | Purpose |
|-----------|--------|
| ChatBubble | Shared message bubble (user/assistant) used by Terminal and ChatWidget |
| MessageList | Scrollable message list with auto-scroll |
| TypingIndicator | Animated dots shown during agent response |
| ChatInput | Text input with send button and keyboard submit |
| ToolUseCard | Tool invocation display with collapsible input/result |
| QuestionCard | Interactive question rendering with option buttons |

### Terminal Components (`components/terminal/`)

| Component | Purpose |
|-----------|--------|
| SessionPanel | Claude session display with streaming output |
| SlashPopup | Slash command palette |

---

## Layout Conventions

### Dashboard Layout
- **Structure**: Fixed sidebar (left) + scrollable main content (right)
- **Sidebar**: Persistent across navigation; collapsible
- **Main content**: Full-width within remaining space; route-dependent content
- **Root layout**: `<html>` u2192 `<body>` u2192 `<ThemeProvider>` u2192 `{children}`
- **Dashboard layout**: `<Sidebar>` + `<main>` flex container

### Grid / Flex Patterns
- **Kanban columns**: Horizontal flex with equal-width columns per stage
- **List rows**: Vertical stack with consistent row height
- **Dialog content**: Vertical flex with header, scrollable body, footer actions
- **Terminal**: Full-height flex column with `min-h-0` overflow containment

---

## Color Tokens

All colors defined as HSL values in CSS custom properties (`:root` and `.dark` selectors). Referenced in Tailwind via `hsl(var(--token))`.

### Light Mode

| Token | HSL Value | Usage |
|-------|-----------|-------|
| `--background` | `0 0% 100%` | Page/card background |
| `--foreground` | `222.2 84% 4.9%` | Primary text |
| `--primary` | `222.2 47.4% 11.2%` | Primary actions, links |
| `--primary-foreground` | `210 40% 98%` | Text on primary |
| `--secondary` | `210 40% 96.1%` | Secondary surfaces |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | Text on secondary |
| `--muted` | `210 40% 96.1%` | Muted surfaces |
| `--muted-foreground` | `215.4 16.3% 46.9%` | Muted text, placeholders |
| `--accent` | `210 40% 96.1%` | Hover/active states |
| `--accent-foreground` | `222.2 47.4% 11.2%` | Text on accent |
| `--destructive` | `0 84.2% 60.2%` | Error/delete actions |
| `--destructive-foreground` | `210 40% 98%` | Text on destructive |
| `--success` | `142 76% 36%` | Success indicators |
| `--success-foreground` | `0 0% 100%` | Text on success |
| `--warning` | `38 92% 50%` | Warning indicators |
| `--warning-foreground` | `0 0% 0%` | Text on warning |
| `--info` | `217 91% 60%` | Info indicators |
| `--info-foreground` | `0 0% 100%` | Text on info |
| `--border` | `214.3 31.8% 91.4%` | Borders, dividers |
| `--input` | `214.3 31.8% 91.4%` | Input borders |
| `--ring` | `222.2 84% 4.9%` | Focus rings |
| `--radius` | `0.5rem` | Base border radius |

### Dark Mode (`.dark` class)

| Token | HSL Value |
|-------|-----------|
| `--background` | `222.2 84% 4.9%` |
| `--foreground` | `210 40% 98%` |
| `--primary` | `210 40% 98%` |
| `--primary-foreground` | `222.2 47.4% 11.2%` |
| `--secondary` | `217.2 32.6% 17.5%` |
| `--muted` | `217.2 32.6% 17.5%` |
| `--muted-foreground` | `215 20.2% 65.1%` |
| `--border` | `217.2 32.6% 17.5%` |
| `--input` | `217.2 32.6% 17.5%` |
| `--ring` | `212.7 26.8% 83.9%` |
| `--destructive` | `0 62.8% 30.6%` |

---

## Typography Scale

### System Fonts
- **Body**: System font stack (inherited from Tailwind defaults)
- **Monospace**: For code blocks, terminal output, and JSONL previews

### Size Scale (Tailwind defaults)
| Class | Size | Usage |
|-------|------|-------|
| `text-xs` | 0.75rem | Badges, timestamps, metadata |
| `text-sm` | 0.875rem | Body text, form labels, comments (14px) |
| `text-base` | 1rem | Standard body (16px) |
| `text-lg` | 1.125rem | Section headings |
| `text-xl` | 1.25rem | Page titles |
| `text-2xl` | 1.5rem | Major headings |

### Markdown Typography
- Comment markdown: `font-size: 0.875rem`, `line-height: 1.5`
- MDXEditor content: `font-size: 0.875rem`, `line-height: 1.5`
- Code inline: `background: hsl(var(--muted))`
- Links: `color: hsl(var(--primary))`

---

## Spacing System

Uses Tailwind's default spacing scale (based on 0.25rem = 4px):

| Token | Value | Common Usage |
|-------|-------|--------------|
| `p-1` / `gap-1` | 0.25rem (4px) | Tight spacing (badge padding) |
| `p-2` / `gap-2` | 0.5rem (8px) | Component internal spacing |
| `p-3` / `gap-3` | 0.75rem (12px) | Card padding, list gaps |
| `p-4` / `gap-4` | 1rem (16px) | Section padding, dialog content |
| `p-6` / `gap-6` | 1.5rem (24px) | Page-level padding |
| `p-8` / `gap-8` | 2rem (32px) | Major section separation |

---

## Border Radius

Derived from `--radius: 0.5rem` CSS variable:

| Tailwind Class | Value | Usage |
|---------------|-------|---------|
| `rounded-lg` | `var(--radius)` = 0.5rem | Cards, dialogs, large containers |
| `rounded-md` | `calc(var(--radius) - 2px)` = 0.375rem | Buttons, inputs, badges |
| `rounded-sm` | `calc(var(--radius) - 4px)` = 0.25rem | Small elements, tags |

---

## Icon System

- **Library**: `lucide-react` ^1.8
- **Usage**: Import individual icons (`import { Plus } from 'lucide-react'`)
- **Sizing**: Consistent with `h-4 w-4` (16px) for inline icons, `h-5 w-5` (20px) for buttons
- **Color**: Inherits from `currentColor`

---

## Component Patterns

### CVA (class-variance-authority)
All variant-driven components use CVA for type-safe variant definitions:
```typescript
const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "...", outline: "..." },
    size: { default: "...", sm: "...", lg: "...", icon: "..." }
  },
  defaultVariants: { variant: "default", size: "default" }
})
```

### Class Merging
All components use `cn()` utility (`clsx` + `tailwind-merge`) for class merging:
```typescript
import { cn } from '@/lib/utils'
cn("base-class", conditional && "conditional-class", className)
```

### Ref Pattern (React 19)
New components accept `ref` as a regular prop:
```typescript
function Button({ ref, className, ...props }: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  return <button ref={ref} className={cn(buttonVariants(), className)} {...props} />
}
```
