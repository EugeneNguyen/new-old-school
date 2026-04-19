'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ItemStatus, Stage, WorkflowItem } from '@/types/workflow';

const ItemDescriptionEditor = dynamic(() => import('./ItemDescriptionEditor'), {
  ssr: false,
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  stages: Stage[];
  onCreated: (item: WorkflowItem) => void;
}

const STATUS_VARIANT: Record<ItemStatus, 'secondary' | 'default' | 'success' | 'destructive'> = {
  Todo: 'secondary',
  'In Progress': 'default',
  Done: 'success',
  Failed: 'destructive',
};

export default function NewItemDialog({
  open,
  onOpenChange,
  workflowId,
  stages,
  onCreated,
}: Props) {
  const defaultStage = stages[0]?.name ?? '';
  const [title, setTitle] = useState('');
  const [id, setId] = useState('');
  const [body, setBody] = useState('');
  const [stage, setStage] = useState(defaultStage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorNonce, setEditorNonce] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setId('');
    setBody('');
    setStage(stages[0]?.name ?? '');
    setError(null);
    setEditorNonce((n) => n + 1);
  }, [open, stages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          ...(id.trim() ? { id: id.trim() } : {}),
          ...(body ? { body } : {}),
          ...(stage ? { stage } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || `Request failed: ${res.status}`);
      }
      const created: WorkflowItem = await res.json();
      onCreated(created);
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to create item:', e);
      setError(e instanceof Error ? e.message : 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-4xl">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              New item
            </p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-9 border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              placeholder="Item title"
              autoFocus
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
              <label htmlFor="new-item-id" className="text-xs font-medium text-muted-foreground">
                ID <span className="text-muted-foreground/70">(optional, auto-generated)</span>
              </label>
              <Input
                id="new-item-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="e.g. REQ-00015"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                id="new-item-description-label"
                className="text-xs font-medium text-muted-foreground"
              >
                Description
              </label>
              <ItemDescriptionEditor
                key={editorNonce}
                markdown={body}
                onChange={setBody}
                placeholder="Write markdown description…"
                ariaLabelledBy="new-item-description-label"
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
                <div className="flex items-center justify-between rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium">
                  <span>Todo</span>
                  <Badge variant={STATUS_VARIANT.Todo}>Todo</Badge>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {error && (
          <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
