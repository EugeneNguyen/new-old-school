'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  commentRehypePlugins,
  commentRemarkPlugins,
} from '@/lib/markdown-preview';
import { ItemStatus, Stage, WorkflowItem } from '@/types/workflow';

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
const STATUS_VARIANT: Record<ItemStatus, 'secondary' | 'default' | 'success' | 'destructive'> = {
  Todo: 'secondary',
  'In Progress': 'default',
  Done: 'success',
  Failed: 'destructive',
};

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

  const itemId = item?.id;
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
    // Only reset on open or when a different item is shown — body/title/comments
    // must not be clobbered when the parent re-renders with a live status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemId, workflowId]);

  // Live-sync status and stage when the parent pushes an updated item.
  useEffect(() => {
    if (!open || !item) return;
    setStatus(item.status);
    setStage(item.stage);
  }, [open, item?.status, item?.stage, item?.updatedAt, item]);

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
                placeholder={loadingBody ? 'Loading…' : 'Write markdown description…'}
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
              placeholder="Add a comment…"
              className="min-h-[60px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <aside className="flex max-h-[70vh] flex-col gap-4 overflow-auto border-t bg-secondary/30 p-4 md:border-l md:border-t-0">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stage
            </p>
            <div className="flex flex-col gap-1">
              {stages.map((s) => {
                const active = s.name === stage;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStage(s.name)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/10 font-medium text-primary'
                        : 'border-transparent hover:border-border hover:bg-background'
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </p>
            <div className="flex flex-col gap-1">
              {STATUSES.map((s) => {
                const active = s === status;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'border-transparent hover:border-border hover:bg-background'
                    )}
                  >
                    <span>{s}</span>
                    {active && <Badge variant={STATUS_VARIANT[s]}>{s}</Badge>}
                  </button>
                );
              })}
            </div>
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
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Dialog>
  );
}
