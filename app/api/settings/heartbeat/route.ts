import { NextResponse } from 'next/server';
import { readHeartbeatMs, writeHeartbeatMs } from '@/lib/settings';
import { rescheduleHeartbeat } from '@/lib/auto-advance-sweeper';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';

export async function GET() {
  return withWorkspace(async () => {
    try {
      const intervalMs = readHeartbeatMs();
      return NextResponse.json({ intervalMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export async function PUT(req: Request) {
  return withWorkspace(async () => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'intervalMs must be a finite non-negative integer' }, { status: 400 });
  }

  const intervalMs = (body as { intervalMs?: unknown } | null)?.intervalMs;
  if (
    typeof intervalMs !== 'number' ||
    !Number.isFinite(intervalMs) ||
    !Number.isInteger(intervalMs) ||
    intervalMs < 0
  ) {
    return NextResponse.json(
      { error: 'intervalMs must be a finite non-negative integer' },
      { status: 400 }
    );
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
