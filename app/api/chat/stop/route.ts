import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse } from '@/app/api/utils/errors';
import { streamRegistry } from '@/lib/stream-registry';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return withWorkspace(async () => {
    try {
      const { sessionId } = await request.json();

      if (!sessionId || typeof sessionId !== 'string') {
        return createErrorResponse('sessionId is required', 'BadRequest', 400);
      }

      const killed = streamRegistry.kill(sessionId);
      return NextResponse.json({ ok: killed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to stop session';
      return createErrorResponse(message, 'InternalServerError', 500);
    }
  });
}
