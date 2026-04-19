'use client';

import { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRelativeUpdatedAt } from '@/lib/workflow-view-mode';
import { ItemStatus, Stage, WorkflowItem } from '@/types/workflow';

const STATUS_VARIANT: Record<ItemStatus, 'secondary' | 'default' | 'success' | 'destructive'> = {
  Todo: 'secondary',
  'In Progress': 'default',
  Done: 'success',
  Failed: 'destructive',
};

interface Props {
  stages: Stage[];
  items: WorkflowItem[];
  onOpenItem: (itemId: string) => void;
}

interface GroupedStage {
  stage: Stage;
  items: WorkflowItem[];
}

const ListRow = memo(function ListRow({
  item,
  onOpenItem,
}: {
  item: WorkflowItem;
  onOpenItem: (itemId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenItem(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenItem(item.id);
        }
      }}
      className={cn(
        'grid w-full grid-cols-1 gap-2 rounded-md border bg-card px-3 py-3 text-left shadow-sm transition-colors',
        'hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring sm:grid-cols-[minmax(0,2.2fr)_minmax(120px,1fr)_minmax(120px,auto)_minmax(120px,1fr)_minmax(90px,auto)] sm:items-center sm:gap-3'
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.title}</span>
      </span>
      <span className="text-sm text-muted-foreground sm:text-foreground">
        <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
          Stage
        </span>
        {item.stage}
      </span>
      <span>
        <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
          Status
        </span>
        <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
      </span>
      <span className="text-sm text-muted-foreground">
        <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
          Agent
        </span>
        —
      </span>
      <span className="text-sm text-muted-foreground">
        <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">
          Updated
        </span>
        {formatRelativeUpdatedAt(item.updatedAt)}
      </span>
    </button>
  );
});

export default function ListView({ stages, items, onOpenItem }: Props) {
  const groupedStages = useMemo<GroupedStage[]>(() => {
    return stages.map((stage) => ({
      stage,
      items: items
        .filter((item) => item.stage === stage.name)
        .slice()
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
    }));
  }, [items, stages]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No items yet
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden rounded-md border bg-secondary/20 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2.2fr)_minmax(120px,1fr)_minmax(120px,auto)_minmax(120px,1fr)_minmax(90px,auto)] sm:gap-3">
        <span>Title</span>
        <span>Stage</span>
        <span>Status</span>
        <span>Agent</span>
        <span>Updated</span>
      </div>
      {groupedStages.map(({ stage, items: stageItems }) => (
        <section key={stage.name} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/30 px-3 py-2">
            <h2 className="text-sm font-semibold">{stage.name}</h2>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {stageItems.length}
            </span>
          </div>
          <div className="hidden rounded-md border bg-secondary/10 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
            <span>Title</span>
            <span>Stage</span>
            <span>Status</span>
            <span>Agent</span>
            <span className="col-span-2">Updated</span>
          </div>
          {stageItems.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-6 text-sm italic text-muted-foreground">
              No items
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {stageItems.map((item) => (
                <ListRow key={item.id} item={item} onOpenItem={onOpenItem} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
