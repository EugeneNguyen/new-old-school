'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  commentRehypePlugins,
  commentRemarkPlugins,
} from '@/lib/markdown-preview';
import { getItemStatusStyle } from '@/lib/item-status-style';
import { Select } from '@/components/ui/select';
import { ItemStatus, Stage, WorkflowItem } from '@/types/workflow';
import type { ActivityEntry } from '@/lib/activity-log';

const ItemDescriptionEditor = dynamic(
  () => import('./ItemDescriptionEditor'),
  { ssr: false }
);
const MarkdownPreview = dynamic(() => import('@uiw/react-markdown-preview'), {
  ssr: false,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  item: WorkflowItem | null;
  stages: Stage[];
  onSaved: (updated: WorkflowItem) => void;
  onBeforeSave?: (itemId: string) => void;
}

const STATUSES: ItemStatus[] = ['Todo', 'In Progress', 'Done', 'Failed'];

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

export default function ItemDetailDialog({
  open,
  onOpenChange,
  workflowId,
  item,
  stages,
  onSaved,
  onBeforeSave,
}: Props) {
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState<ItemStatus>('Todo');
  const [comments, setComments] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');
  const [body, setBody] = useState('');
  const [loadingBody, setLoadingBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const itemId = item?.id;
  const activityItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setTitle(item.title);
    setStage(item.stage);
    setStatus(item.status);
    setComments(item.comments ?? []);
    setNewComment('');
    setBody(item.body ?? '');
    setError(null);
    setLoadingBody(true);
    fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/items/${encodeURIComponent(item.id)}/content`
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { body?: string }) => setBody(data.body ?? ''))
      .catch((e) => console.error('Failed to load body:', e))
      .finally(() => setLoadingBody(false));
    // Only reset on open or when a different item is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, workflowId]);

  // Live-sync status and stage when the parent pushes an updated item.
  useEffect(() => {
    if (!open || !item) return;
    setStatus(item.status);
    setStage(item.stage);
  }, [open, item?.status, item?.stage, item?.updatedAt, item]);

  // Fetch activity log on open
  useEffect(() => {
    if (!open || !item) {
      setActivity([]);
      return;
    }
    setActivityLoading(true);
    fetch(
      `/api/workflows/${encodeURIComponent(workflowId)}/items/${encodeURIComponent(item.id)}/activity`
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { entries?: ActivityEntry[] }) => setActivity(data.entries ?? []))
      .catch((e) => console.error('Failed to load activity:', e))
      .finally(() => setActivityLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, workflowId]);

  // Subscribe to SSE for real-time activity prepend
  useEffect(() => {
    if (!open || !item) return;
    activityItemIdRef.current = item.id;
    const source = new EventSource(`/api/workflows/${encodeURIComponent(workflowId)}/events`);
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
      if (payload.entry.itemId !== activityItemIdRef.current) return;
      setActivity((prev) => [payload.entry!, ...prev]);
    };
    source.addEventListener('message', onMessage);
    return () => {
      source.removeEventListener('message', onMessage);
      source.close();
      activityItemIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, workflowId]);

  if (!item) return null;

  async function handleSave() {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const trimmedNew = newComment.trim();
      const finalComments = trimmedNew ? [...comments, trimmedNew] : comments;

      onBeforeSave?.(item.id);

      const metaRes = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/items/${encodeURIComponent(item.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim() || item.title,
            stage,
            status,
            comments: finalComments,
          }),
        }
      );
      if (!metaRes.ok) {
        throw new Error((await metaRes.text()) || `Meta update failed: ${metaRes.status}`);
      }

      const bodyRes = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/items/${encodeURIComponent(item.id)}/content`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        }
      );
      if (!bodyRes.ok) {
        throw new Error((await bodyRes.text()) || `Body update failed: ${bodyRes.status}`);
      }

      const updated: WorkflowItem = await bodyRes.json();
      onSaved(updated);
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to save item:', e);
      setError(e instanceof Error ? e.message : 'Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-4xl">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-muted-foreground">{item.id}</p>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-9 border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
            placeholder="Item title"
          />
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_220px]">
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto p-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="item-detail-description"
              className="text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <div
              id="item-detail-description"
              className="item-detail-md-editor-shell rounded-md border border-input bg-background focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
            >
              <ItemDescriptionEditor
                key={`${item.id}:${loadingBody ? 'loading' : 'ready'}`}
                markdown={loadingBody ? '' : body}
                onChange={(md) => {
                  if (loadingBody) return;
                  setBody(md);
                }}
                readOnly={loadingBody}
                placeholder={loadingBody ? 'Loading\u2026' : 'Write markdown description\u2026'}
                ariaLabelledBy="item-detail-description"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">
              Comments ({comments.length})
            </label>
            <div className="flex flex-col gap-2">
              {comments.length === 0 && (
                <p className="text-xs italic text-muted-foreground">No comments yet.</p>
              )}
              {comments.map((c, idx) => (
                <div
                  key={idx}
                  className="comment-markdown rounded-md border bg-secondary/40 px-3 py-2 text-sm"
                >
                  {c.trim() ? (
                    <MarkdownPreview
                      source={c}
                      remarkPlugins={commentRemarkPlugins}
                      rehypePlugins={commentRehypePlugins}
                      wrapperElement={{ 'data-color-mode': 'light' }}
                      style={{ background: 'transparent' }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment\u2026"
              className="min-h-[60px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Activity</label>
            {activityLoading ? (
              <p className="text-xs text-muted-foreground">Loading\u2026</p>
            ) : activity.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {activity.map((entry, idx) => (
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
                    <span className="flex-1 text-foreground">{formatSummary(entry)}</span>
                    <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {formatActor(entry.actor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="flex max-h-[70vh] flex-col gap-4 overflow-auto border-t bg-secondary/30 p-4 md:border-l md:border-t-0">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stage
            </p>
            <Select
              value={stage}
              onValueChange={setStage}
              options={stages.map((s) => ({ value: s.name, label: s.name }))}
              aria-label="Stage"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as ItemStatus)}
              options={STATUSES.map((s) => ({
                value: s,
                label: s,
                adornment: (
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 rounded-full shrink-0', getItemStatusStyle(s).dot)}
                  />
                ),
              }))}
              triggerAdornment={
                <span
                  aria-hidden="true"
                  className={cn('h-2 w-2 rounded-full shrink-0', getItemStatusStyle(status).dot)}
                />
              }
              aria-label="Status"
            />
          </div>
        </aside>
      </div>

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Close
        </Button>
        <Button onClick={handleSave} disabled={saving || loadingBody}>
          {saving ? 'Saving\u2026' : 'Save'}
        </Button>
      </div>
    </Dialog>
  );
}
