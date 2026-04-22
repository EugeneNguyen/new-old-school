# UX Design

> Last updated: 2026-04-21

---

## Interaction Patterns

### Kanban Board
- **Drag-and-drop**: Items can be dragged between stage columns to change their stage
- **Optimistic updates**: UI updates immediately on drag; SSE reconciliation handles conflicts with last-writer-wins
- **Column caps**: `maxDisplayItems` limits visible items per column; expand/collapse toggle for overflow
- **Real-time sync**: SSE events from `/api/workflows/[id]/events` push item changes to all open clients
- **View toggle**: Switch between Kanban and List views via toggle button

### Dialogs
- **Modal overlay**: Radix Dialog with backdrop; portal-rendered above content
- **Keyboard dismissal**: Escape key closes dialogs
- **Focus trap**: Focus stays within dialog while open (Radix default behavior)
- **Confirmation**: Destructive actions (delete item, delete agent) require explicit confirmation

### Inline Editing
- **Item titles**: Editable in detail dialog; saved on blur or submit
- **Markdown body**: MDXEditor with toolbar for formatting; auto-saves
- **Comments**: Text composer for new comments; edit/delete on existing
- **Stage settings**: Inline form fields in stage detail dialog

### Navigation
- **Sidebar**: Persistent left sidebar with workspace/workflow hierarchy
- **Breadcrumbs**: Implied by sidebar active state (no explicit breadcrumb trail)
- **Deep linking**: App Router URLs map directly to dashboard views

---

## Error Handling Conventions

### API Errors (User-Facing)
- **400 Bad Request**: Shown as toast with validation message ("Invalid JSON body", "Name is required")
- **404 Not Found**: Shown as toast ("Workflow not found", "Item not found")
- **409 Conflict**: Shown as toast ("Agent is still referenced by stages")
- **500 Internal Server Error**: Generic toast ("Something went wrong")

### Client-Side Errors
- **Error boundaries**: `error.tsx` at all 8 dashboard sub-routes; renders retry button and error message
- **Component errors**: Caught by nearest `error.tsx`; full-page fallback at dashboard root
- **Network errors**: Toast notification on fetch failure; no automatic retry

### Error Response Shape
```json
{
  "error": "ErrorType",
  "message": "Human-readable description",
  "code": 400,
  "timestamp": "2026-04-21T12:00:00.000Z"
}
```

---

## Loading States

### Route-Level Loading
- **`loading.tsx`** at all 8 dashboard sub-routes provides streaming Suspense boundaries
- Renders skeleton/spinner while server component data loads

### Component-Level Loading
- **Session streaming**: Green pulsing dot indicator on active Claude sessions (`isRunning`)
- **Chat responses**: SSE streaming renders tokens incrementally
- **Kanban board**: Items render progressively via SSE event updates
- **Activity feed**: Paginated loading with "Load more" button

### Optimistic UI
- **Drag operations**: Kanban column order updates optimistically; SSE reconciles server state
- **Status changes**: Item status updates show immediately; server confirmation follows

---

## Accessibility Requirements

### Target Level: WCAG 2.1 AA

| Requirement | Implementation |
|-------------|---------------|
| **Keyboard navigation** | Radix primitives provide full keyboard support (Tab, Enter, Escape, Arrow keys) |
| **Focus management** | Focus trap in dialogs; focus ring via `--ring` CSS variable |
| **Screen reader** | Semantic HTML; Radix `aria-*` attributes; `DialogTitle`/`DialogDescription` for dialogs |
| **Color contrast** | Semantic color tokens designed for sufficient contrast in both light and dark modes |
| **Motion** | `disableTransitionOnChange` on ThemeProvider prevents flash; `suppressHydrationWarning` on `<html>` |
| **Labels** | Form inputs use associated labels or `aria-label` |
| **Language** | `<html lang="en">` set in root layout |

### Gaps
- No automated accessibility testing (no axe-core or similar in test suite)
- Some custom interactive components may lack comprehensive ARIA landmarks
- No skip-to-content link in dashboard layout

---

## Form Validation Rules

### Workflow Creation
| Field | Rule | Error Message |
|-------|------|---------------|
| `id` | Required; pattern `^[a-z0-9][a-z0-9_-]{0,63}$` | "ID is required" / "Invalid ID format" |
| `name` | Required; max 128 chars | "Name is required" / "Name too long" |
| `idPrefix` | Required; pattern `^[A-Z0-9][A-Z0-9_-]{0,15}$` | "Prefix is required" / "Invalid prefix format" |

### Stage Creation
| Field | Rule | Error Message |
|-------|------|---------------|
| `name` | Required; pattern `^[A-Za-z0-9 _-]+$`; max 64 chars; unique within workflow | "Name is required" / "Invalid characters" / "Stage already exists" |
| `prompt` | Optional; text | u2014 |
| `agentId` | Optional; must reference existing agent | "Agent not found" |
| `maxDisplayItems` | Optional; positive integer or 0 | "Must be a non-negative integer" |

### Item Creation
| Field | Rule | Error Message |
|-------|------|---------------|
| `title` | Required; non-empty string | "Title is required" |
| `stage` | Optional; must reference valid stage if provided | "Stage not found" |

### Agent Creation
| Field | Rule | Error Message |
|-------|------|---------------|
| `displayName` | Required; produces valid slug `^[a-z0-9]+(?:-[a-z0-9]+)*$` | "Display name is required" / "Invalid slug" |
| `adapter` | Optional | u2014 |
| `model` | Optional | u2014 |
| `prompt` | Required | "Prompt is required" |

### API Input Validation
| Boundary | Validation | Response |
|----------|-----------|----------|
| `req.json()` | Try/catch on all POST/PATCH/PUT handlers | 400 `ValidationError: Invalid JSON body` |
| Shell `command` | `typeof command !== 'string'` | 400 `ValidationError: command must be a string` |
| Activity `limit` | Clamped to `Math.max(1, Math.min(500, ...))` | Silent clamping, no error |

---

## Toast Notifications

- **Success**: Green toast for successful operations (item created, settings saved)
- **Error**: Destructive-variant toast for API errors
- **Duration**: Auto-dismiss after ~5 seconds; manually dismissable
- **Position**: Bottom-right of viewport (Radix Toaster)
- **Stacking**: Multiple toasts stack vertically
