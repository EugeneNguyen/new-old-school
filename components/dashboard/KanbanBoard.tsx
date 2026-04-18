'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Stage, WorkflowItem, ItemStatus } from '@/types/workflow';
import ItemDetailDialog from './ItemDetailDialog';
import NewItemDialog from './NewItemDialog';

interface Props {
  workflowId: string;
  stages: Stage[];
  initialItems: WorkflowItem[];
}

const STATUS_VARIANT: Record<ItemStatus, 'secondary' | 'default' | 'success'> = {
  Todo: 'secondary',
  'In Progress': 'default',
  Done: 'success',
};

export default function KanbanBoard({ workflowId, stages, initialItems }: Props) {
  const [items, setItems] = useState<WorkflowItem[]>(initialItems);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<WorkflowItem | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);

  async function moveItem(itemId: string, newStage: string) {
    const previous = items;
    const target = items.find((i) => i.id === itemId);
    if (!target || target.stage === newStage) return;

    setItems((curr) =>
      curr.map((i) => (i.id === itemId ? { ...i, stage: newStage, status: 'Todo' as ItemStatus } : i))
    );
    setError(null);

    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/items/${encodeURIComponent(itemId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        }
      );
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }
      const updated: WorkflowItem = await res.json();
      setItems((curr) => curr.map((i) => (i.id === itemId ? updated : i)));
    } catch (e) {
      console.error('Failed to move item:', e);
      setItems(previous);
      setError(e instanceof Error ? e.message : 'Failed to move item');
    }
  }

  function handleItemSaved(updated: WorkflowItem) {
    setItems((curr) => curr.map((i) => (i.id === updated.id ? updated : i)));
  }

  function handleItemCreated(created: WorkflowItem) {
    setItems((curr) => [...curr, created]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => setNewItemOpen(true)}
          disabled={stages.length === 0}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add item
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageItems = items.filter((i) => i.stage === stage.name);
          const isOver = dragOverStage === stage.name;
          return (
            <div
              key={stage.name}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.name);
              }}
              onDragLeave={() => {
                setDragOverStage((curr) => (curr === stage.name ? null : curr));
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id = draggingId ?? e.dataTransfer.getData('text/plain');
                if (id) moveItem(id, stage.name);
                setDraggingId(null);
              }}
              className={cn(
                'flex w-80 shrink-0 flex-col gap-3 rounded-lg border bg-secondary/40 p-3 transition-colors',
                isOver && 'border-primary bg-primary/5'
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{stage.name}</h3>
                  {stage.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {stage.description}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground rounded-full bg-background px-2 py-0.5">
                  {stageItems.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[40px]">
                {stageItems.length === 0 && (
                  <div className="text-xs text-muted-foreground italic rounded border border-dashed py-6 text-center">
                    No items
                  </div>
                )}
                {stageItems.map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => {
                      setDraggingId(item.id);
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStage(null);
                    }}
                    onClick={() => setDetailItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setDetailItem(item);
                      }
                    }}
                    className={cn(
                      'rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing',
                      'hover:border-primary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                      draggingId === item.id && 'opacity-50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      <Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">{item.id}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <ItemDetailDialog
        open={detailItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null);
        }}
        workflowId={workflowId}
        item={detailItem}
        stages={stages}
        onSaved={handleItemSaved}
      />

      <NewItemDialog
        open={newItemOpen}
        onOpenChange={setNewItemOpen}
        workflowId={workflowId}
        firstStageName={stages[0]?.name}
        onCreated={handleItemCreated}
      />
    </div>
  );
}
