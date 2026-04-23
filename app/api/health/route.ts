import { NextResponse } from 'next/server';
import { getHeartbeatState } from '@/lib/auto-advance-sweeper';
import { readHeartbeatMs } from '@/lib/settings';

// Server start time — set once at module load
const SERVER_START_MS = Date.now();

export async function GET(): Promise<Response> {
  const heartbeatState = getHeartbeatState();
  let heartbeatMs = 60_000;
  try {
    heartbeatMs = readHeartbeatMs();
  } catch { /* use default */ }

  const nowMs = Date.now();
  const lastTickMs = heartbeatState.lastTickAt ? nowMs - heartbeatState.lastTickAt.getTime() : null;
  const stale = lastTickMs !== null && lastTickMs > heartbeatMs * 3;

  const response = {
    status: 'ok',
    uptime: Math.floor((nowMs - SERVER_START_MS) / 1000),
    heartbeat: {
      lastTickAt: heartbeatState.lastTickAt?.toISOString() ?? null,
      lastTickDurationMs: heartbeatState.lastTickDurationMs,
      lastTickItemsSwept: heartbeatState.lastTickItemsSwept,
      nextTickIn: heartbeatMs,
      stale,
    },
  };

  return NextResponse.json(response, { status: 200 });
}