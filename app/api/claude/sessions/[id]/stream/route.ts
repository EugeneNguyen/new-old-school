import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { streamRegistry } from '@/lib/stream-registry';
import { createErrorResponse } from '@/app/api/utils/errors';
import { getProjectRoot } from '@/lib/project-root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSIONS_DIR = join(getProjectRoot(), '.claude', 'sessions');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const from = parseInt(request.nextUrl.searchParams.get('from') || '0', 10);

  const status = streamRegistry.getStatus(id);
  if (status !== 'streaming') {
    return createErrorResponse('Session is not streaming', 'Gone', 410);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const filePath = join(SESSIONS_DIR, `${id}.txt`);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);
        for (let i = from; i < lines.length; i++) {
          controller.enqueue(encoder.encode(`data: ${lines[i]}\n\n`));
        }
      } catch {
        // file may not exist yet, that's ok
      }

      const onLine = (line: string) => {
        if (line === '__done__') {
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      };

      streamRegistry.subscribe(id, onLine);

      request.signal.addEventListener('abort', () => {
        streamRegistry.unsubscribe(id, onLine);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
