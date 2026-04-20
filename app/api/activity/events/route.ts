import { NextRequest } from 'next/server';
import {
  WORKFLOW_EVENT,
  workflowEvents,
  type WorkflowEvent,
} from '@/lib/workflow-events';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withWorkspace(async () => {
  const encoder = new TextEncoder();
  let keepAlive: NodeJS.Timeout | null = null;
  let listener: ((evt: WorkflowEvent) => void) | null = null;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    if (listener) workflowEvents.off(WORKFLOW_EVENT, listener);
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
        if (evt.type !== 'item-activity') return;
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };
      workflowEvents.on(WORKFLOW_EVENT, listener);

      keepAlive = setInterval(() => {
        safeEnqueue(encoder.encode(': keep-alive\n\n'));
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
  });
}
