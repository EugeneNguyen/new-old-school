"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionsResponse } from '@/app/api/analytics/sessions/route';

type Window = '24h' | '30d' | '1y';

const WINDOW_LABELS: Record<Window, { label: string }> = {
  '24h': { label: 'Last 24 hours' },
  '30d': { label: 'Last 30 days' },
  '1y': { label: 'Last 1 year' },
};

function formatTs(ts: string, window: Window): string {
  const d = new Date(ts);
  if (window === '24h') {
    return `${d.getHours().toString().padStart(2, '0')}:00`;
  } else if (window === '30d') {
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
  } else {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
  }
}

export function SessionsChart() {
  const [window, setWindow] = useState<Window>('24h');
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/analytics/sessions?window=${window}`);
      if (!res.ok) return;
      const json: SessionsResponse = await res.json();
      setData(json);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [window]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const buckets = data?.buckets ?? [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Sessions tracked</CardTitle>
            <CardDescription>
              {WINDOW_LABELS[window].label} — {total} total
            </CardDescription>
          </div>
          <div className="flex gap-1 rounded-md border p-1">
            {(['24h', '30d', '1y'] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                  window === w
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : buckets.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            No session data
          </div>
        ) : (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(ts: string) => formatTs(ts, window)}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  labelFormatter={(label: string) => formatTs(label, window)}
                  formatter={(value: number) => [value, 'Sessions']}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}