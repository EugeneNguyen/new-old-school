'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getItemStatusStyle } from '@/lib/item-status-style';
import { Select } from '@/components/ui/select';
import { Stage, WorkflowItem } from '@/types/workflow';
import { toast } from '@/lib/hooks/use-toast';

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

export default function NewItemDialog({
  open,
  onOpenChange,
  workflowId,
  stages,
  onCreated,
}: Props) {
  const defaultStage = stages[0]?.name ?? '';
  const todoStyle = getItemStatusStyle('Todo');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [stage, setStage] = useState(defaultStage);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorNonce, setEditorNonce] = useState(0);

  const prevOpenRef = useRef(false);
  const stagesRef = useRef(stages);
  stagesRef.current = stages;

  // Reset form only on false → true open transition.
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!wasOpen && open) {
      setTitle('');
      setBody('');
      setStage(stagesRef.current[0]?.name ?? '');
      setError(null);
      setEditorNonce((n) => n + 1);
    }
  }, [open]);

  // Reconcile selected stage while dialog is open (does not touch other fields).
  useEffect(() => {
    if (!open) return;
    setStage((current) => {
      if (current === '' && stages.length > 0) return stages[0].name;
      if (current !== '' && !stages.some((s) => s.name === current)) {
        return stages[0]?.name ?? '';
      }
      return current;
    });
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
      const msg = e instanceof Error ? e.message : 'Failed to create item';
      setError(msg);
      toast.error(msg);
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
                value="Todo"
                onValueChange={() => {}}
                options={[{ value: 'Todo', label: 'Todo' }]}
                disabled
                triggerAdornment={
                  <span
                    aria-hidden="true"
                    className={cn('h-2 w-2 rounded-full shrink-0', todoStyle.dot)}
                  />
                }
                aria-label="Status"
              />
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
