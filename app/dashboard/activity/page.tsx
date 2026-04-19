'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ActivityEntry } from '@/lib/activity-log';

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
    case 'item-created':
      return `Created in stage ${d.stageId}`;
    case 'title-changed':
      return `Title changed: "${d.before}" \u2192 "${d.after}"`;
    case 'stage-changed':
      return `Stage changed: ${d.before} \u2192 ${d.after}`;
    case 'status-changed':
      return `Status changed: ${d.before} \u2192 ${d.after}`;
    case 'body-changed':
      return `Description updated (~${d.beforeLength} \u2192 ~${d.afterLength} chars)`;
    default:
      return entry.type;
  }
}

function formatActor(actor: string): string {
  if (actor === 'ui') return 'UI';
  if (actor === 'runtime') return 'Runtime';
  if (actor.startsWith('agent:')) return `Agent: ${actor.slice(6)}`;
  return actor;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const oldestTsRef = useRef<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/activity?limit=200')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { entries?: ActivityEntry[] }) => {
        const loaded = data.entries ?? [];
        setEntries(loaded);
        setHasMore(loaded.length === 200);
        if (loaded.length > 0) {
          oldestTsRef.current = loaded[loaded.length - 1].ts;
        }
      })
      .catch((e) => console.error('Failed to load activity:', e))
      .finally(() => setLoading(false));
  }, []);

  // Subscribe to global SSE for real-time updates
  useEffect(() => {
    const source = new EventSource('/api/activity/events');
    const onMessage = (evt: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(evt.data as string);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const payload = parsed as { type?: string; entry?: ActivityEntry };
      if (payload.type !== 'item-activity' || !payload.entry) return;
      setEntries((prev) => [payload.entry!, ...prev]);
    };
    source.addEventListener('message', onMessage);
    // Close on unmount to avoid leaking connections (AC-33 / §3.3)
    return () => {
      source.removeEventListener('message', onMessage);
      source.close();
    };
  }, []);

  function handleLoadOlder() {
    if (!oldestTsRef.current) return;
    setLoadingOlder(true);
    fetch(`/api/activity?limit=200&before=${encodeURIComponent(oldestTsRef.current)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { entries?: ActivityEntry[] }) => {
        const older = data.entries ?? [];
        setEntries((prev) => [...prev, ...older]);
        setHasMore(older.length === 200);
        if (older.length > 0) {
          oldestTsRef.current = older[older.length - 1].ts;
        } else {
          setHasMore(false);
        }
      })
      .catch((e) => console.error('Failed to load older activity:', e))
      .finally(() => setLoadingOlder(false));
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">All workflow item changes across all workflows.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      ) : entries.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/40"
            >
              <span
                title={entry.ts}
                className="mt-0.5 w-16 shrink-0 text-muted-foreground"
              >
                {formatRelativeTs(entry.ts)}
              </span>
              <span className="w-28 shrink-0 truncate font-mono text-muted-foreground">
                <Link
                  href={`/dashboard/workflows/${encodeURIComponent(entry.workflowId)}`}
                  className="hover:underline"
                  aria-label={`Open workflow ${entry.workflowId}`}
                >
                  {entry.workflowId}
                </Link>
              </span>
              <span className="flex-1 text-foreground">
                <Link
                  href={`/dashboard/workflows/${encodeURIComponent(entry.workflowId)}?item=${encodeURIComponent(entry.itemId)}`}
                  className="font-mono text-muted-foreground hover:underline"
                  aria-label={`Open item ${entry.itemId}`}
                >
                  {entry.itemId}
                </Link>{' '}
                {formatSummary(entry)}
              </span>
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {formatActor(entry.actor)}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasMore && !loading && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={handleLoadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Loading\u2026' : 'Load older'}
          </Button>
        </div>
      )}
    </div>
  );
}
