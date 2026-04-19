'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  initialOpenItemId?: string | null;
}

export default function WorkflowItemsView({ workflowId, stages, initialItems, initialOpenItemId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [viewMode, setViewMode] = useState<WorkflowViewMode>(DEFAULT_WORKFLOW_VIEW_MODE);
  const [query, setQuery] = useState('');
  const [missingItemId, setMissingItemId] = useState<string | null>(null);
  const urlClearedRef = useRef<string | null>(null);

  const handleItemNotFound = useCallback(
    (itemId: string) => {
      setMissingItemId(itemId);
      router.replace(pathname);
    },
    [router, pathname]
  );

  const {
    stages: currentStages,
    items,
    error,
    detailItem,
    detailItemId,
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
  } = useWorkflowItems({
    workflowId,
    initialStages: stages,
    initialItems,
    initialOpenItemId,
    onItemNotFound: handleItemNotFound,
  });

  // Clear the ?item= param once the auto-opened dialog is visible (AC-7)
  useEffect(() => {
    if (!initialOpenItemId) return;
    if (urlClearedRef.current === initialOpenItemId) return;
    if (detailItemId === initialOpenItemId) {
      urlClearedRef.current = initialOpenItemId;
      router.replace(pathname);
    }
  }, [detailItemId, initialOpenItemId, router, pathname]);

  useEffect(() => {
    setViewMode(readWorkflowViewMode(workflowId));
    setQuery('');
  }, [workflowId]);

  const trimmedQuery = query.trim();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    const q = trimmedQuery.toLowerCase();
    return items.filter(
      (item) => item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)
    );
  }, [items, trimmedQuery]);

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
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Find item"
              placeholder="Find item…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && query !== '') {
                  e.stopPropagation();
                  setQuery('');
                }
              }}
              className="h-8 w-48 pl-8 pr-8 text-sm"
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear filter"
                onClick={() => setQuery('')}
                className="absolute right-0 h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
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

      {missingItemId && (
        <div className="flex items-center justify-between rounded-md border border-yellow-500/50 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
          <span>Item <span className="font-mono">{missingItemId}</span> no longer exists.</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setMissingItemId(null)}
            className="ml-4 text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-200"
          >
            ×
          </button>
        </div>
      )}

      {trimmedQuery && filteredItems.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No items match &ldquo;{trimmedQuery}&rdquo;
        </p>
      )}

      {viewMode === 'kanban' ? (
        <KanbanBoard
          stages={currentStages}
          items={filteredItems}
          onOpenItem={openItem}
          onMoveItem={moveItem}
          onOpenStage={openStage}
        />
      ) : (
        <ListView stages={currentStages} items={filteredItems} onOpenItem={openItem} />
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
