import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse } from '@/app/api/utils/errors';
import { streamRegistry } from '@/lib/stream-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId || typeof sessionId !== 'string') {
      return createErrorResponse('sessionId is required', 'BadRequest', 400);
    }

    const killed = streamRegistry.kill(sessionId);
    return NextResponse.json({ ok: killed });
  } catch (err: any) {
    return createErrorResponse(err.message || 'Failed to stop session', 'InternalServerError', 500);
  }
}
