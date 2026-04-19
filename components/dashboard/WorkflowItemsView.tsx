'use client';

import { useEffect, useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_WORKFLOW_VIEW_MODE,
  readWorkflowViewMode,
  WorkflowViewMode,
  writeWorkflowViewMode,
} from '@/lib/workflow-view-mode';
import { useWorkflowItems } from '@/lib/use-workflow-items';
import { Stage, WorkflowItem } from '@/types/workflow';
import ItemDetailDialog from './ItemDetailDialog';
import KanbanBoard from './KanbanBoard';
import ListView from './ListView';
import NewItemDialog from './NewItemDialog';
import StageDetailDialog from './StageDetailDialog';

interface Props {
  workflowId: string;
  stages: Stage[];
  initialItems: WorkflowItem[];
}

export default function WorkflowItemsView({ workflowId, stages, initialItems }: Props) {
  const [viewMode, setViewMode] = useState<WorkflowViewMode>(DEFAULT_WORKFLOW_VIEW_MODE);
  const {
    stages: currentStages,
    items,
    error,
    detailItem,
    newItemOpen,
    editStage,
    moveItem,
    openItem,
    closeItem,
    openNewItem,
    closeNewItem,
    openStage,
    closeStage,
    markSelfOriginated,
    handleItemSaved,
    handleItemCreated,
    handleStageSaved,
  } = useWorkflowItems({ workflowId, initialStages: stages, initialItems });

  useEffect(() => {
    setViewMode(readWorkflowViewMode(workflowId));
  }, [workflowId]);

  function updateViewMode(nextMode: WorkflowViewMode) {
    setViewMode(nextMode);
    writeWorkflowViewMode(workflowId, nextMode);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex w-full rounded-md border bg-background p-1 sm:w-auto">
            <button
              type="button"
              aria-pressed={viewMode === 'kanban'}
              onClick={() => updateViewMode('kanban')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm sm:flex-none ${
                viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Kanban
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => updateViewMode('list')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm sm:flex-none ${
                viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              }`}
            >
              <List className="h-4 w-4" />
              List
            </button>
          </div>
        </div>
        <Button size="sm" onClick={openNewItem} disabled={currentStages.length === 0}>
          Add item
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {viewMode === 'kanban' ? (
        <KanbanBoard
          stages={currentStages}
          items={items}
          onOpenItem={openItem}
          onMoveItem={moveItem}
          onOpenStage={openStage}
        />
      ) : (
        <ListView stages={currentStages} items={items} onOpenItem={openItem} />
      )}

      <ItemDetailDialog
        open={detailItem !== null}
        onOpenChange={(open) => {
          if (!open) closeItem();
        }}
        workflowId={workflowId}
        item={detailItem}
        stages={currentStages}
        onSaved={handleItemSaved}
        onBeforeSave={markSelfOriginated}
      />

      <NewItemDialog
        open={newItemOpen}
        onOpenChange={(open) => {
          if (!open) closeNewItem();
        }}
        workflowId={workflowId}
        stages={currentStages}
        onCreated={handleItemCreated}
      />

      <StageDetailDialog
        open={editStage !== null}
        onOpenChange={(open) => {
          if (!open) closeStage();
        }}
        workflowId={workflowId}
        stage={editStage}
        onSaved={handleStageSaved}
      />
    </div>
  );
}
