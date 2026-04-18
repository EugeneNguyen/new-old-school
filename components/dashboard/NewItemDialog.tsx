'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowItem } from '@/types/workflow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  firstStageName: string | undefined;
  onCreated: (item: WorkflowItem) => void;
}

export default function NewItemDialog({
  open,
  onOpenChange,
  workflowId,
  firstStageName,
  onCreated,
}: Props) {
  const [title, setTitle] = useState('');
  const [id, setId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setId('');
    setError(null);
  }, [open]);

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
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-base font-semibold">New item</h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short item title"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ID <span className="text-muted-foreground/70">(optional, auto-generated from title)</span>
            </label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="e.g. REQ-015"
            />
          </div>
          {firstStageName && (
            <p className="text-xs text-muted-foreground">
              Will be placed in the first stage: <strong>{firstStageName}</strong> with status{' '}
              <strong>Todo</strong>.
            </p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
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
