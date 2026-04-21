'use client';

import { useCallback, useEffect, useState } from 'react';
import { FastForward, MoreVertical, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getItemStatusStyle } from '@/lib/item-status-style';
import { Agent, Stage, WorkflowItem } from '@/types/workflow';

interface Props {
  stages: Stage[];
  items: WorkflowItem[];
  onOpenItem: (itemId: string) => void;
  onMoveItem: (itemId: string, newStage: string) => void;
  onOpenStage: (stage: Stage) => void;
}

export function KanbanBoard({ stages, items, onOpenItem, onMoveItem, onOpenStage }: Props) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>({});

  const toggleStageExpanded = useCallback((stageName: string) => {
    setExpandedStages((curr) => ({ ...curr, [stageName]: !curr[stageName] }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { agents?: Agent[] };
        if (!cancelled && Array.isArray(data.agents)) setAgents(data.agents);
      } catch {
        // ignore; agent pill will just not show
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (stages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-muted-foreground">
        No stages defined for this workflow. Configure stages in your workflow settings.
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const stageItems = items.filter((item) => item.stage === stage.name);
        const isOver = dragOverStage === stage.name;
        const cap =
          typeof stage.maxDisplayItems === 'number' && stage.maxDisplayItems > 0
            ? stage.maxDisplayItems
            : null;
        const isExpanded = !!expandedStages[stage.name];
        const isCapped = cap !== null && stageItems.length > cap;
        const visibleItems = isCapped && !isExpanded ? stageItems.slice(0, cap) : stageItems;

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
              if (id) {
                const target = items.find((item) => item.id === id);
                const willChangeStage = target && target.stage !== stage.name;
                if (willChangeStage && cap !== null && stageItems.length >= cap) {
                  setExpandedStages((curr) => ({ ...curr, [stage.name]: true }));
                }
                void onMoveItem(id, stage.name);
              }
              setDraggingId(null);
            }}
            className={cn(
              'flex w-80 shrink-0 flex-col gap-3 rounded-lg border bg-secondary/40 p-3 transition-colors',
              isOver && 'border-primary bg-primary/5'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold">{stage.name}</h3>
                    {stage.prompt && (
                      <span
                        title="AI-automated: items entering this stage start an agent session"
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                      >
                        <Sparkles className="h-3 w-3" />
                        AI
                      </span>
                    )}
                    {stage.autoAdvanceOnComplete && (
                      <span
                        title="Auto-advances to the next stage when items complete"
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        <FastForward className="h-3 w-3" />
                        Auto
                      </span>
                    )}
                  </div>
                  {stage.agentId &&
                    (() => {
                      const agent = agents.find((candidate) => candidate.id === stage.agentId);
                      if (agent) {
                        return (
                          <span
                            title={`Runs as agent '${agent.displayName}' (${agent.id})`}
                            className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
                          >
                            <User className="h-3 w-3" />
                            {agent.displayName}
                          </span>
                        );
                      }
                      return (
                        <span
                          title={`References missing agent '${stage.agentId}'`}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground italic"
                        >
                          <User className="h-3 w-3" />
                          {stage.agentId}?
                        </span>
                      );
                    })()}
                </div>
                {stage.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {stage.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                  {stageItems.length}
                </span>
                <button
                  type="button"
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenStage(stage);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label={`Edit stage ${stage.name}`}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-[40px] flex-col gap-2">
              {stageItems.length === 0 && (
                <div className="rounded border border-dashed py-6 text-center text-xs italic text-muted-foreground">
                  No items
                </div>
              )}
              {visibleItems.map((item) => {
                const statusStyle = getItemStatusStyle(item.status);
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    title={`Status: ${item.status}`}
                    aria-label={`${item.title} — Status: ${item.status}`}
                    onDragStart={(e) => {
                      setDraggingId(item.id);
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverStage(null);
                    }}
                    onClick={() => onOpenItem(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenItem(item.id);
                      }
                    }}
                    className={cn(
                      'cursor-grab rounded-md border p-3 shadow-sm active:cursor-grabbing',
                      'hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-ring',
                      statusStyle.border,
                      statusStyle.bg,
                      draggingId === item.id && 'opacity-50'
                    )}
                  >
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span
                        className={cn('h-2 w-2 rounded-full shrink-0', statusStyle.dot)}
                        aria-hidden="true"
                      />
                      <span className={cn('text-[11px] font-medium', statusStyle.label)}>
                        {item.status}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {item.id}
                      </span>
                    </div>
                  </div>
                );
              })}
              {cap !== null && stageItems.length > cap && (
                <button
                  type="button"
                  onClick={() => toggleStageExpanded(stage.name)}
                  className="w-full rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:border-primary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {isExpanded ? 'Show less' : `Show all (${cap} of ${stageItems.length})`}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
