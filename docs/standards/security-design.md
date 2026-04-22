# Security Design / Threat Model

> Last updated: 2026-04-21

NOS is a **local-only** tool running on the operator's machine. It does not expose services to the network in production. Security considerations are primarily around local process safety and input validation.

---

## Auth / Authz Model

### Authentication
- **None**: NOS runs on `localhost:30128` and is intended for single-operator use
- **No user accounts**: No login, no sessions, no tokens
- **Claude CLI authentication**: Delegated to the Claude Code CLI's own auth mechanism (OAuth via Anthropic)

### Authorization
- **No RBAC**: All API endpoints are unrestricted; any local process can call them
- **Workspace isolation**: `nos_workspace` cookie determines which project root is active; switching workspaces changes data context
- **Agent permissions**: Agents inherit Claude Code's tool permissions (file read/write, bash, web access)

---

## Data Protection

| Data Category | Storage | Protection |
|---------------|---------|------------|
| Workflow metadata | `.nos/workflows/*/meta.yml` | File system permissions (user-owned) |
| Item content | `.nos/workflows/*/items/*/index.md` | File system permissions |
| Agent prompts | `.nos/agents/*/index.md` | File system permissions |
| Session output | `.claude/sessions/*.txt` | File system permissions |
| Settings | `.nos/settings.yaml` | File system permissions |
| Workspace registry | `~/.nos/workspaces.yaml` | User home directory permissions |

### Sensitive Data Handling
- No secrets stored in NOS-managed files
- Agent API keys managed by Claude CLI, not NOS
- Activity logs may contain item titles/content u2014 treated as operator-private
- No encryption at rest (local filesystem assumed trusted)

---

## OWASP Top-10 Mitigations

| # | OWASP Category | Risk Level | Mitigation |
|---|---------------|------------|------------|
| A01 | Broken Access Control | Low | Local-only; no multi-user access control needed |
| A02 | Cryptographic Failures | N/A | No secrets stored; no encryption needed for local tool |
| A03 | Injection | **Medium** | Shell command input validated (`typeof !== 'string'`); Markdown rendered with `rehype-sanitize` allowlist; no SQL |
| A04 | Insecure Design | Low | File-based storage with atomic writes; no complex auth flows |
| A05 | Security Misconfiguration | Low | Minimal configuration surface; `serverExternalPackages` for chokidar/fsevents |
| A06 | Vulnerable Components | **Medium** | Next.js canary (not stable); `next-themes` phantom dependency; `@types/react` version mismatch |
| A07 | Identification/Auth Failures | N/A | No authentication system |
| A08 | Software/Data Integrity | Low | Atomic writes prevent corruption; no CI/CD pipeline to compromise |
| A09 | Logging/Monitoring Failures | Low | Middleware logs all API requests; activity JSONL provides audit trail |
| A10 | SSRF | Low | No server-side URL fetching; shell command execution is the operator's own machine |

---

## Known Attack Surfaces

### 1. Shell Command Execution (`/api/shell`)
- **Risk**: Arbitrary command execution on the operator's machine
- **Mitigation**: Only accessible from localhost; input validated as string type
- **Residual risk**: Any local process can call this endpoint u2014 acceptable for local-only tool

### 2. Markdown Rendering (XSS)
- **Risk**: Malicious HTML in item content or comments
- **Mitigation**: `rehype-sanitize` with custom allowlist; escape-then-allowlist pattern
- **Scope**: Comment markdown and item body rendering in dashboard

### 3. req.json() Parsing
- **Risk**: Malformed JSON causing unhandled exceptions (500 errors)
- **Mitigation**: All POST/PATCH/PUT handlers wrap `req.json()` in try/catch, returning 400 on parse failure (F-04 fix)

### 4. Path Traversal
- **Risk**: Workflow/item IDs containing path separators
- **Mitigation**: ID patterns enforce `^[a-z0-9][a-z0-9_-]{0,63}$` u2014 no slashes, dots, or special characters

### 5. File System Limits
- **Risk**: Unbounded file creation filling disk
- **Mitigation**: Settings file capped at 64KB; workspace registry capped at 1MB; no other explicit limits (acceptable for local tool)

### 6. Activity Limit Parameter
- **Risk**: Extremely large `limit` values causing memory exhaustion
- **Mitigation**: Clamped to `Math.max(1, Math.min(500, ...))` (F-06 fix)

---

## Recommendations

| Priority | Recommendation |
|----------|---------------|
| High | Move from Next.js canary to stable to reduce dependency risk (GAP-10) |
| Medium | Add `next-themes` as explicit dependency (GAP-15) |
| Medium | Configure CSP headers for dashboard (currently none) |
| Low | Add rate limiting to shell endpoint (defense in depth) |
| Low | Audit `allowedDevOrigins` in next.config.mjs u2014 currently allows a specific LAN IP |
