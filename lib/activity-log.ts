import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { getProjectRoot } from '@/lib/project-root';
import { workflowEvents, WORKFLOW_EVENT } from '@/lib/workflow-events';

// --- Types ---

export type ActivityActor = 'ui' | 'runtime' | `agent:${string}` | 'unknown';

export type ActivityEventType =
  | 'item-created'
  | 'title-changed'
  | 'stage-changed'
  | 'status-changed'
  | 'body-changed';

export interface ActivityEntry {
  ts: string;          // ISO-8601 UTC
  workflowId: string;
  itemId: string;
  type: ActivityEventType;
  actor: ActivityActor;
  data:
    | { kind: 'item-created'; title: string; stageId: string; status: string }
    | { kind: 'title-changed'; before: string; after: string }
    | { kind: 'stage-changed'; before: string; after: string }
    | { kind: 'status-changed'; before: string; after: string }
    | { kind: 'body-changed'; beforeHash: string; afterHash: string; beforeLength: number; afterLength: number };
}

export interface ReadActivityOpts {
  limit?: number;
  before?: string; // ISO-8601 cursor; return entries strictly older than this ts
}

// --- Internals ---

const WORKFLOWS_ROOT = path.join(getProjectRoot(), '.nos', 'workflows');

function activityPath(workflowId: string): string {
  return path.join(WORKFLOWS_ROOT, workflowId, 'activity.jsonl');
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf-8').digest('hex').slice(0, 12);
}

function parseLines(filePath: string): ActivityEntry[] {
  if (!fs.existsSync(filePath)) return [];
  let text: string;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const entries: ActivityEntry[] = [];
  let malformedLogged = false;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as ActivityEntry);
    } catch {
      if (!malformedLogged) {
        console.error(`[activity-log] skipping malformed line in ${filePath}: ${trimmed.slice(0, 80)}`);
        malformedLogged = true;
      }
    }
  }
  return entries;
}

function paginate(entries: ActivityEntry[], opts: ReadActivityOpts): ActivityEntry[] {
  const limit = Math.min(opts.limit ?? 200, 1000);
  let result = entries;
  if (opts.before) {
    const cursor = opts.before;
    result = result.filter((e) => e.ts < cursor);
  }
  return result.slice(0, limit);
}

// --- Public API ---

/**
 * Appends an activity entry to the per-workflow JSONL log and emits an SSE event.
 * Failures are caught and logged; this function never rejects (AC-33).
 *
 * NOTE: Uses fs.promises.appendFile with flag 'a'. Safe for single-process
 * Next dev server. Multi-process deployments would require locking or an
 * alternative store.
 */
export async function appendActivity(entry: ActivityEntry): Promise<void> {
  try {
    await fs.promises.appendFile(activityPath(entry.workflowId), JSON.stringify(entry) + '\n', { flag: 'a' });
    workflowEvents.emit(WORKFLOW_EVENT, { type: 'item-activity', entry });
  } catch (err) {
    console.error('[activity-log] appendActivity failed:', err);
  }
}

export function readActivity(workflowId: string, opts: ReadActivityOpts = {}): ActivityEntry[] {
  const entries = parseLines(activityPath(workflowId));
  entries.reverse(); // newest-first
  return paginate(entries, opts);
}

export function readItemActivity(
  workflowId: string,
  itemId: string,
  opts: ReadActivityOpts = {}
): ActivityEntry[] {
  const entries = parseLines(activityPath(workflowId)).filter((e) => e.itemId === itemId);
  entries.reverse();
  return paginate(entries, opts);
}

// workflowIds must be provided by the caller to avoid circular imports with workflow-store.
export function readGlobalActivity(workflowIds: string[], opts: ReadActivityOpts = {}): ActivityEntry[] {
  const all: ActivityEntry[] = [];
  for (const wfId of workflowIds) {
    all.push(...parseLines(activityPath(wfId)));
  }
  all.sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0));
  return paginate(all, opts);
}
