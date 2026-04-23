"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityEntry } from '@/lib/activity-log';
import { SessionsChart } from '@/components/dashboard/SessionsChart';

interface SystemStatus {
  status: string;
  timestamp: string;
  version: string;
  message: string;
}

function formatRelativeTs(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatSummary(entry: ActivityEntry): string {
  const d = entry.data;
  switch (d.kind) {
    case 'item-created': return `Created in stage ${d.stageId}`;
    case 'title-changed': return `Title \u2192 "${d.after}"`;
    case 'stage-changed': return `Stage ${d.before} \u2192 ${d.after}`;
    case 'status-changed': return `Status ${d.before} \u2192 ${d.after}`;
    case 'body-changed': return `Description updated`;
    default: return entry.type;
  }
}

export function DashboardPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);

  const fetchStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/system');
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    fetch('/api/activity?limit=10')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d: { entries?: ActivityEntry[] }) => setRecentActivity(d.entries ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground">
            Overview of the local system tools and API health.
          </p>
        </div>
        <Button
          onClick={fetchStatus}
          disabled={isLoading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
            <CardDescription>Current API availability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Badge variant={data?.status === 'online' ? 'success' : 'destructive'}>
                {data?.status || 'Unknown'}
              </Badge>
              <span className="text-lg font-semibold">{data?.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Version</CardTitle>
            <CardDescription>Current system version</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.version || 'N/A'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Updated</CardTitle>
            <CardDescription>Timestamp of the last check</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground font-mono">
              {data?.timestamp || 'Fetching...'}
            </div>
          </CardContent>
        </Card>
      </div>

      <SessionsChart />

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive rounded-md">
          {error}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <Link href="/dashboard/activity" className="text-sm text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="rounded-md border divide-y">
            {recentActivity.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-3 px-4 py-2 text-xs">
                <span title={entry.ts} className="mt-0.5 w-14 shrink-0 text-muted-foreground">
                  {formatRelativeTs(entry.ts)}
                </span>
                <span className="w-24 shrink-0 truncate font-mono text-muted-foreground">
                  {entry.workflowId}
                </span>
                <span className="flex-1 text-foreground">
                  <span className="font-mono text-muted-foreground">{entry.itemId}</span>{' '}
                  {formatSummary(entry)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
