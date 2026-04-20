'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, ChevronLeft, Plus, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Stage, WorkflowItem } from '@/types/workflow';
import AddStageDialog from './AddStageDialog';
import StageDetailDialog from './StageDetailDialog';

interface Props {
  workflowId: string;
  workflowName: string;
  stages: Stage[];
  items: WorkflowItem[];
}

function getItemCount(items: WorkflowItem[], stageName: string): number {
  return items.filter((item) => item.stage === stageName).length;
}

export default function WorkflowSettingsView({
  workflowId,
  workflowName,
  stages,
  items,
}: Props) {
  const router = useRouter();
  const [currentStages, setCurrentStages] = useState<Stage[]>(stages);
  const [currentItems, setCurrentItems] = useState<WorkflowItem[]>(items);
  const [editStage, setEditStage] = useState<Stage | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [conflicting, setConflicting] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStageSaved = useCallback((next: { stages: Stage[]; items: WorkflowItem[] }) => {
    setCurrentStages(next.stages);
    setCurrentItems(next.items);
    setEditStage(null);
  }, []);

  const handleStageCreated = useCallback((next: { stages: Stage[]; items: WorkflowItem[] }) => {
    setCurrentStages(next.stages);
    setCurrentItems(next.items);
  }, []);

  const handleStageDeleted = useCallback((next: { stages: Stage[] }) => {
    setCurrentStages(next.stages);
    setEditStage(null);
  }, []);

  const handleMoveUp = useCallback(
    async (index: number) => {
      if (index === 0) return;
      const previous = currentStages;
      const newStages = [...currentStages];
      const temp = newStages[index];
      newStages[index] = newStages[index - 1];
      newStages[index - 1] = temp;
      setCurrentStages(newStages);
      setConflicting(false);
      setLoading(true);

      try {
        const res = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/stages/order`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: newStages.map((s) => s.name),
            }),
          }
        );
        if (!res.ok) {
          if (res.status === 409) {
            setCurrentStages(previous);
            setConflicting(true);
            return;
          }
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = (await res.json()) as { stages: Stage[] };
        if (data.stages) {
          setCurrentStages(data.stages);
        }
      } catch {
        setCurrentStages(previous);
      } finally {
        setLoading(false);
      }
    },
    [currentStages, workflowId]
  );

  const handleMoveDown = useCallback(
    async (index: number) => {
      if (index === currentStages.length - 1) return;
      const previous = currentStages;
      const newStages = [...currentStages];
      const temp = newStages[index];
      newStages[index] = newStages[index + 1];
      newStages[index + 1] = temp;
      setCurrentStages(newStages);
      setConflicting(false);
      setLoading(true);

      try {
        const res = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/stages/order`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: newStages.map((s) => s.name),
            }),
          }
        );
        if (!res.ok) {
          if (res.status === 409) {
            setCurrentStages(previous);
            setConflicting(true);
            return;
          }
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = (await res.json()) as { stages: Stage[] };
        if (data.stages) {
          setCurrentStages(data.stages);
        }
      } catch {
        setCurrentStages(previous);
      } finally {
        setLoading(false);
      }
    },
    [currentStages, workflowId]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/workflows/${workflowId}`)}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to {workflowName}
        </Button>
        <Button size="sm" onClick={() => setAddStageOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add stage
        </Button>
      </div>

      {conflicting && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
          Stages changed in another session — list refreshed.
        </div>
      )}

      {currentStages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>No stages defined for this workflow.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setAddStageOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add stage
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border">
          <div className="grid grid-cols-12 gap-4 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <div className="col-span-1"></div>
            <div className="col-span-2">Name</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-2">Agent</div>
            <div className="col-span-1 text-center">Items</div>
            <div className="col-span-1 text-center">Auto-advance</div>
            <div className="col-span-1 text-center">Max</div>
            <div className="col-span-1"></div>
          </div>
          {currentStages.map((stage, index) => {
            const itemCount = getItemCount(currentItems, stage.name);
            const canDelete = itemCount === 0;
            return (
              <div
                key={stage.name}
                className="grid grid-cols-12 items-center gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <div className="col-span-1 flex flex-col gap-1">
                  <button
                    type="button"
                    aria-label={`Move ${stage.name} up`}
                    disabled={index === 0 || loading}
                    onClick={() => handleMoveUp(index)}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50',
                      index === 0 && 'invisible'
                    )}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${stage.name} down`}
                    disabled={index === currentStages.length - 1 || loading}
                    onClick={() => handleMoveDown(index)}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50',
                      index === currentStages.length - 1 && 'invisible'
                    )}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="col-span-2 truncate font-mono text-sm">
                  {stage.name}
                </div>
                <div className="col-span-3 truncate text-sm text-muted-foreground">
                  {stage.description || '—'}
                </div>
                <div className="col-span-2 truncate text-sm text-muted-foreground">
                  {stage.agentId || '—'}
                </div>
                <div className="col-span-1 text-center text-sm">{itemCount}</div>
                <div className="col-span-1 text-center text-sm">
                  {stage.autoAdvanceOnComplete === true ? '✓' : '—'}
                </div>
                <div className="col-span-1 text-center text-sm">
                  {stage.maxDisplayItems ?? '—'}
                </div>
                <div className="col-span-1 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-sm"
                    onClick={() => setEditStage(stage)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StageDetailDialog
        open={editStage !== null}
        onOpenChange={(open) => {
          if (!open) setEditStage(null);
        }}
        workflowId={workflowId}
        stage={editStage}
        onSaved={handleStageSaved}
        onDeleted={handleStageDeleted}
      />

      <AddStageDialog
        open={addStageOpen}
        onOpenChange={(open) => {
          if (!open) setAddStageOpen(false);
        }}
        workflowId={workflowId}
        onCreated={handleStageCreated}
      />
    </div>
  );
}