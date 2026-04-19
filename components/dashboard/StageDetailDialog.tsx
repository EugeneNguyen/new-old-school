'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Agent, Stage, WorkflowItem } from '@/types/workflow';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  stage: Stage | null;
  onSaved: (next: { stages: Stage[]; items: WorkflowItem[] }) => void;
}

export default function StageDetailDialog({
  open,
  onOpenChange,
  workflowId,
  stage,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [agentId, setAgentId] = useState<string>('');
  const [maxDisplayItems, setMaxDisplayItems] = useState<string>('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !stage) return;
    setName(stage.name);
    setDescription(stage.description ?? '');
    setPrompt(stage.prompt ?? '');
    setAutoAdvance(stage.autoAdvanceOnComplete === true);
    setAgentId(stage.agentId ?? '');
    setMaxDisplayItems(
      typeof stage.maxDisplayItems === 'number' && stage.maxDisplayItems > 0
        ? String(stage.maxDisplayItems)
        : ''
    );
    setError(null);
  }, [open, stage]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { agents?: Agent[] };
        if (!cancelled && Array.isArray(data.agents)) setAgents(data.agents);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!stage) return null;

  async function handleSave() {
    if (!stage) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Stage name cannot be empty');
      return;
    }
    const rawLimit = maxDisplayItems.trim();
    let maxDisplayItemsPayload: number | null;
    if (rawLimit === '') {
      maxDisplayItemsPayload = null;
    } else {
      const parsed = Number(rawLimit);
      if (
        !Number.isFinite(parsed) ||
        !Number.isInteger(parsed) ||
        parsed < 0
      ) {
        setError('Enter a whole number ≥ 0, or leave blank for no limit');
        return;
      }
      maxDisplayItemsPayload = parsed === 0 ? null : parsed;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/stages/${encodeURIComponent(stage.name)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            description: description.trim() ? description : null,
            prompt: prompt.trim() ? prompt : null,
            autoAdvanceOnComplete: autoAdvance,
            agentId: agentId || null,
            maxDisplayItems: maxDisplayItemsPayload,
          }),
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }
      const data = (await res.json()) as { stages: Stage[]; items: WorkflowItem[] };
      onSaved(data);
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to save stage:', e);
      setError(e instanceof Error ? e.message : 'Failed to save stage');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stage</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{stage.name}</p>
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

      <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stage name"
          />
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
          <label className="text-xs font-medium text-muted-foreground">Agent</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className={cn(
              'h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="">None</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName} ({a.id})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Items entering this stage use the selected agent&apos;s prompt and model.
          </p>
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
            Positive integer caps the column with a &ldquo;Show all&rdquo; toggle. Leave blank or
            use 0 for no limit.
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
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          Close
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Dialog>
  );
}
