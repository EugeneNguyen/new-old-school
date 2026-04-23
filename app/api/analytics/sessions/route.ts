import { NextRequest, NextResponse } from 'next/server';
import { listWorkflows, readItems } from '@/lib/workflow-store';

export type SessionBucket = { ts: string; count: number };

export type SessionsResponse = {
  window: string;
  buckets: SessionBucket[];
  total: number;
  generatedAt: string;
};

type Window = '24h' | '30d' | '1y';

function floorHour(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 3_600_000) * 3_600_000);
}

function floorDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function floorMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoFloor(date: Date): string {
  return date.toISOString();
}

function buildBuckets(window: Window): SessionBucket[] {
  const now = new Date();
  if (window === '24h') {
    const buckets: SessionBucket[] = [];
    for (let i = 23; i >= 0; i--) {
      const ts = floorHour(new Date(now.getTime() - i * 3_600_000));
      buckets.push({ ts: isoFloor(ts), count: 0 });
    }
    return buckets;
  } else if (window === '30d') {
    const buckets: SessionBucket[] = [];
    for (let i = 29; i >= 0; i--) {
      const ts = floorDay(new Date(now.getTime() - i * 86_400_000));
      buckets.push({ ts: isoFloor(ts), count: 0 });
    }
    return buckets;
  } else {
    // 1y
    const buckets: SessionBucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const ts = floorMonth(d);
      buckets.push({ ts: isoFloor(ts), count: 0 });
    }
    return buckets;
  }
}

function sessionKey(sessionTs: string, window: Window): string | null {
  const d = new Date(sessionTs);
  const now = new Date();

  if (window === '24h') {
    const cutoff = new Date(now.getTime() - 24 * 3_600_000);
    if (d < cutoff) return null;
    return floorHour(d).toISOString();
  } else if (window === '30d') {
    const cutoff = new Date(now.getTime() - 30 * 86_400_000);
    if (d < cutoff) return null;
    return floorDay(d).toISOString();
  } else {
    // 1y
    const cutoff = new Date(now);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    if (d < cutoff) return null;
    return floorMonth(d).toISOString();
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<SessionsResponse>> {
  const { searchParams } = new URL(request.url);
  const windowParam = searchParams.get('window') ?? '24h';

  const validWindows: Window[] = ['24h', '30d', '1y'];
  const window: Window = validWindows.includes(windowParam as Window)
    ? (windowParam as Window)
    : '24h';

  const buckets = buildBuckets(window);
  const bucketMap = new Map<string, number>();
  for (const b of buckets) bucketMap.set(b.ts, 0);

  let total = 0;

  const workflowIds = listWorkflows();
  for (const workflowId of workflowIds) {
    const items = readItems(workflowId);
    for (const item of items) {
      if (!item.sessions) continue;
      for (const session of item.sessions) {
        const key = sessionKey(session.startedAt, window);
        if (key !== null && bucketMap.has(key)) {
          bucketMap.set(key, (bucketMap.get(key) ?? 0) + 1);
          total++;
        }
      }
    }
  }

  const finalBuckets = buckets.map((b) => ({ ts: b.ts, count: bucketMap.get(b.ts) ?? 0 }));

  return NextResponse.json({
    window,
    buckets: finalBuckets,
    total,
    generatedAt: new Date().toISOString(),
  });
}