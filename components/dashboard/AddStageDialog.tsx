'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Stage, WorkflowItem } from '@/types/workflow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  onCreated: (next: { stages: Stage[]; items: WorkflowItem[] }) => void;
}

export default function AddStageDialog({ open, onOpenChange, workflowId, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [maxDisplayItems, setMaxDisplayItems] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName('');
      setDescription('');
      setPrompt('');
      setAutoAdvance(false);
      setMaxDisplayItems('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Stage name is required');
      return;
    }

    const rawLimit = maxDisplayItems.trim();
    let maxDisplayItemsPayload: number | undefined;
    if (rawLimit !== '') {
      const parsed = Number(rawLimit);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        setError('Enter a whole number ≥ 0, or leave blank for no limit');
        return;
      }
      maxDisplayItemsPayload = parsed === 0 ? undefined : parsed;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/stages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          prompt: prompt.trim() || null,
          autoAdvanceOnComplete: autoAdvance || null,
          maxDisplayItems: maxDisplayItemsPayload ?? null,
        }),
      });

      const data = (await res.json()) as { stages?: Stage[]; error?: string };

      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : `Request failed: ${res.status}`);
        return;
      }

      if (data.stages) {
        onCreated({ stages: data.stages, items: [] });
      }
      handleOpenChange(false);
    } catch (e) {
      console.error('Failed to create stage:', e);
      setError(e instanceof Error ? e.message : 'Failed to create stage');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} className="max-w-xl">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">New Stage</p>
          <p className="mt-0.5 text-sm font-medium">Add Stage</p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. In Review"
            maxLength={64}
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Letters, numbers, spaces, underscores, and hyphens only. Max 64 characters.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happens in this stage…"
            className="min-h-[80px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional prompt run when an item enters this stage…"
            className="min-h-[120px] w-full rounded-md border border-input bg-background p-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Max items shown</label>
          <Input
            type="number"
            min={0}
            step={1}
            value={maxDisplayItems}
            onChange={(e) => setMaxDisplayItems(e.target.value)}
            placeholder="No limit"
          />
          <p className="text-[11px] text-muted-foreground">
            Positive integer caps the column with a &ldquo;Show all&rdquo; toggle. Leave blank or use 0
            for no limit.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <span>Auto-advance items to the next stage when this one completes</span>
        </label>
      </div>

      {error && (
        <div className="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
        <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? 'Creating…' : 'Add Stage'}
        </Button>
      </div>
    </Dialog>
  );
}
