import { NextResponse } from 'next/server';
import { readHeartbeatMs, writeHeartbeatMs } from '@/lib/settings';
import { rescheduleHeartbeat } from '@/lib/auto-advance-sweeper';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';

export async function GET() {
  return withWorkspace(async () => {
    try {
      const intervalMs = readHeartbeatMs();
      return NextResponse.json({ intervalMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return createErrorResponse(message);
    }
  });
}

export async function PUT(req: Request) {
  return withWorkspace(async () => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('intervalMs must be a finite non-negative integer', 'ValidationError', 400);
  }

  const intervalMs = (body as { intervalMs?: unknown } | null)?.intervalMs;
  if (
    typeof intervalMs !== 'number' ||
    !Number.isFinite(intervalMs) ||
    !Number.isInteger(intervalMs) ||
    intervalMs < 0
  ) {
    return createErrorResponse('intervalMs must be a finite non-negative integer', 'ValidationError', 400);
  }

  try {
    writeHeartbeatMs(intervalMs);
    rescheduleHeartbeat();
    return NextResponse.json({ intervalMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
