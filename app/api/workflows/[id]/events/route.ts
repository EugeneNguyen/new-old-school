import { NextRequest } from 'next/server';
import path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { readItem, workflowExists } from '@/lib/workflow-store';
import {
  WORKFLOW_EVENT,
  emitItemDeleted,
  emitItemUpdated,
  workflowEvents,
  type WorkflowEvent,
} from '@/lib/workflow-events';
import { getProjectRoot } from '@/lib/project-root';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WatcherEntry = { watcher: FSWatcher; refs: number };

declare global {
  // eslint-disable-next-line no-var
  var __nosWorkflowWatchers: Map<string, WatcherEntry> | undefined;
}

function getWatchers(): Map<string, WatcherEntry> {
  if (!globalThis.__nosWorkflowWatchers) {
    globalThis.__nosWorkflowWatchers = new Map();
  }
  return globalThis.__nosWorkflowWatchers;
}

function itemIdFromPath(metaPath: string): string {
  return path.basename(path.dirname(metaPath));
}

function acquireWatcher(workflowId: string): void {
  const watchers = getWatchers();
  const existing = watchers.get(workflowId);
  if (existing) {
    existing.refs += 1;
    return;
  }

  const glob = path.join(
    getProjectRoot(),
    '.nos',
    'workflows',
    workflowId,
    'items',
    '*',
    'meta.yml'
  );
  const watcher = chokidar.watch(glob, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 50 },
  });

  const debounceMs = 150;
  const timers = new Map<string, NodeJS.Timeout>();

  const schedule = (metaPath: string) => {
    const existingTimer = timers.get(metaPath);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      timers.delete(metaPath);
      emitForPath(metaPath, 0);
    }, debounceMs);
    timers.set(metaPath, timer);
  };

  const emitForPath = (metaPath: string, attempt: number) => {
    const itemId = itemIdFromPath(metaPath);
    try {
      const item = readItem(workflowId, itemId);
      if (item) emitItemUpdated(workflowId, item);
    } catch {
      if (attempt === 0) {
        setTimeout(() => emitForPath(metaPath, 1), 100);
      }
    }
  };

  watcher.on('add', schedule);
  watcher.on('change', schedule);
  watcher.on('unlink', (metaPath) => {
    const itemId = itemIdFromPath(metaPath);
    const timer = timers.get(metaPath);
    if (timer) {
      clearTimeout(timer);
      timers.delete(metaPath);
    }
    emitItemDeleted(workflowId, itemId);
  });
  watcher.on('error', (err) => {
    console.error(`workflow ${workflowId} watcher error:`, err);
  });

  watchers.set(workflowId, { watcher, refs: 1 });
}

function releaseWatcher(workflowId: string): void {
  const watchers = getWatchers();
  const entry = watchers.get(workflowId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entry.watcher.close().catch(() => {});
    watchers.delete(workflowId);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!workflowExists(id)) {
    return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
  }

  acquireWatcher(id);

  const encoder = new TextEncoder();
  let keepAlive: NodeJS.Timeout | null = null;
  let listener: ((evt: WorkflowEvent) => void) | null = null;
  let released = false;

  const cleanup = () => {
    if (released) return;
    released = true;
    if (keepAlive) clearInterval(keepAlive);
    if (listener) workflowEvents.off(WORKFLOW_EVENT, listener);
    releaseWatcher(id);
  };

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          cleanup();
        }
      };

      listener = (evt: WorkflowEvent) => {
        const evtWorkflowId =
          evt.type === 'item-activity' ? evt.entry.workflowId : evt.workflowId;
        if (evtWorkflowId !== id) return;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };
      workflowEvents.on(WORKFLOW_EVENT, listener);

      keepAlive = setInterval(() => {
        safeEnqueue(encoder.encode(`: keep-alive\n\n`));
      }, 15000);

      request.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
