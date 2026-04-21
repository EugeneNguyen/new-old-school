'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useItemDoneSound } from './use-item-done-sound.ts';
import {
  notifyBrowser,
  isBrowserNotificationEnabled,
  isItemDoneNotificationEnabled,
} from '../notifications.ts';
import type { ItemStatus, Stage, WorkflowItem } from '../../types/workflow.ts';

const SELF_ORIGINATION_TTL_MS = 5000;

export function mergeWorkflowItem(items: WorkflowItem[], incoming: WorkflowItem): WorkflowItem[] {
  const idx = items.findIndex((item) => item.id === incoming.id);
  if (idx === -1) return [...items, incoming];
  const existing = items[idx];
  if ((existing.updatedAt ?? '') >= (incoming.updatedAt ?? '')) {
    return items;
  }
  const next = items.slice();
  next[idx] = incoming;
  return next;
}

export function reconcileWorkflowItems(
  currentItems: WorkflowItem[],
  serverItems: WorkflowItem[]
): WorkflowItem[] {
  const byId = new Map(currentItems.map((item) => [item.id, item] as const));
  return serverItems.map((serverItem) => {
    const localItem = byId.get(serverItem.id);
    if (localItem && (localItem.updatedAt ?? '') > (serverItem.updatedAt ?? '')) {
      return localItem;
    }
    return serverItem;
  });
}

interface UseWorkflowItemsOptions {
  workflowId: string;
  initialStages: Stage[];
  initialItems: WorkflowItem[];
  initialOpenItemId?: string | null;
  onItemNotFound?: (itemId: string) => void;
}

export function useWorkflowItems({
  workflowId,
  initialStages,
  initialItems,
  initialOpenItemId,
  onItemNotFound,
}: UseWorkflowItemsOptions) {
  const [stages, setStages] = useState<Stage[]>(initialStages);
  const [items, setItems] = useState<WorkflowItem[]>(initialItems);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [editStage, setEditStage] = useState<Stage | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playDoneSound = useItemDoneSound();
  const selfOriginatedRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const onItemNotFoundRef = useRef(onItemNotFound);
  onItemNotFoundRef.current = onItemNotFound;
  const autoOpenHandledRef = useRef<string | null>(null);
  const baselineRef = useRef<{ items: WorkflowItem[] } | null>(null);

  useEffect(() => {
    if (!initialOpenItemId) return;
    if (autoOpenHandledRef.current === initialOpenItemId) return;
    autoOpenHandledRef.current = initialOpenItemId;
    const found = items.find((item) => item.id === initialOpenItemId);
    if (found) {
      setDetailItemId(initialOpenItemId);
    } else {
      onItemNotFoundRef.current?.(initialOpenItemId);
    }
  }, [initialOpenItemId, items]);

  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const markSelfOriginated = useCallback((itemId: string) => {
    const timers = selfOriginatedRef.current;
    const existing = timers.get(itemId);
    if (existing) clearTimeout(existing);
    const handle = setTimeout(() => {
      timers.delete(itemId);
    }, SELF_ORIGINATION_TTL_MS);
    timers.set(itemId, handle);
  }, []);

  useEffect(() => {
    const timers = selfOriginatedRef.current;
    return () => {
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const source = new EventSource(`/api/workflows/${encodeURIComponent(workflowId)}/events`);

    const onMessage = (evt: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const payload = parsed as {
        type?: string;
        itemId?: string;
        item?: WorkflowItem;
      };
      if (payload.type === 'item-deleted' && payload.itemId) {
        setItems((curr) => curr.filter((item) => item.id !== payload.itemId));
        return;
      }
      if ((payload.type === 'item-updated' || payload.type === 'item-created') && payload.item) {
        const incoming = payload.item;
        setItems((curr) => {
          if (payload.type === 'item-updated') {
            const existing = curr.find((item) => item.id === incoming.id);
            if (
              existing &&
              existing.status === 'In Progress' &&
              incoming.status === 'Done' &&
              !selfOriginatedRef.current.has(incoming.id)
            ) {
              playDoneSound();
              if (baselineRef.current && isBrowserNotificationEnabled() && isItemDoneNotificationEnabled()) {
                notifyBrowser({
                  title: `Item ${incoming.id} completed`,
                  body: incoming.title,
                });
              }
            }
          }
          return mergeWorkflowItem(curr, incoming);
        });
      }
    };

    const resync = async () => {
      try {
        const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
          cache: 'no-store',
        });
        if (!res.ok || cancelled) return;
        const detail = (await res.json()) as {
          items?: WorkflowItem[];
          stages?: Stage[];
        };
        if (cancelled) return;
        if (detail.stages) setStages(detail.stages);
        if (detail.items) {
          if (!baselineRef.current) {
            baselineRef.current = { items: detail.items };
          }
          setItems((curr) => reconcileWorkflowItems(curr, detail.items ?? []));
        }
      } catch {
        // Transient fetch failure; EventSource will continue retrying.
      }
    };

    const onOpen = () => {
      void resync();
    };

    source.addEventListener('message', onMessage);
    source.addEventListener('open', onOpen);

    return () => {
      cancelled = true;
      source.removeEventListener('message', onMessage);
      source.removeEventListener('open', onOpen);
      source.close();
    };
  }, [playDoneSound, workflowId]);

  const moveItem = useCallback(
    async (itemId: string, newStage: string) => {
      const previous = items;
      const target = items.find((item) => item.id === itemId);
      if (!target || target.stage === newStage) return;

      const optimisticTs = new Date().toISOString();
      setItems((curr) =>
        curr.map((item) =>
          item.id === itemId
            ? { ...item, stage: newStage, status: 'Todo' as ItemStatus, updatedAt: optimisticTs }
            : item
        )
      );
      setError(null);
      markSelfOriginated(itemId);

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
        setItems((curr) => curr.map((item) => (item.id === itemId ? updated : item)));
      } catch (e) {
        console.error('Failed to move item:', e);
        setItems(previous);
        setError(e instanceof Error ? e.message : 'Failed to move item');
      }
    },
    [items, markSelfOriginated, workflowId]
  );

  const openItem = useCallback((itemId: string) => setDetailItemId(itemId), []);
  const closeItem = useCallback(() => setDetailItemId(null), []);
  const openNewItem = useCallback(() => setNewItemOpen(true), []);
  const closeNewItem = useCallback(() => setNewItemOpen(false), []);
  const openStage = useCallback((stage: Stage) => setEditStage(stage), []);
  const closeStage = useCallback(() => setEditStage(null), []);
  const openAddStage = useCallback(() => setAddStageOpen(true), []);
  const closeAddStage = useCallback(() => setAddStageOpen(false), []);

  const handleItemSaved = useCallback((updated: WorkflowItem) => {
    setItems((curr) => curr.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  const handleItemCreated = useCallback((created: WorkflowItem) => {
    setItems((curr) => mergeWorkflowItem(curr, created));
  }, []);

  const handleStageSaved = useCallback((next: { stages: Stage[]; items: WorkflowItem[] }) => {
    setStages(next.stages);
    setItems(next.items);
    setEditStage(null);
  }, []);

  const handleStageCreated = useCallback((next: { stages: Stage[]; items: WorkflowItem[] }) => {
    setStages(next.stages);
    setItems(next.items);
  }, []);

  const handleStageDeleted = useCallback((next: { stages: Stage[] }) => {
    setStages(next.stages);
    setEditStage(null);
  }, []);

  const handleStagesReordered = useCallback(
    async (orderedNames: string[]) => {
      const previous = stages;
      setStages((prev) => {
        const nameToStage = new Map(prev.map((s) => [s.name, s] as const));
        return orderedNames.flatMap((name) => {
          const s = nameToStage.get(name);
          return s ? [s] : [];
        });
      });

      try {
        const res = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/stages/order`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderedNames }),
          }
        );
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `Request failed: ${res.status}`);
        }
        const data = (await res.json()) as { stages: Stage[] };
        if (data.stages) {
          setStages(data.stages);
        }
      } catch (e) {
        console.error('Failed to reorder stages:', e);
        setStages(previous);
        throw e;
      }
    },
    [stages, workflowId]
  );

  const detailItem = detailItemId ? items.find((item) => item.id === detailItemId) ?? null : null;

  return {
    stages,
    items,
    error,
    setError,
    detailItem,
    detailItemId,
    newItemOpen,
    editStage,
    addStageOpen,
    moveItem,
    openItem,
    closeItem,
    openNewItem,
    closeNewItem,
    openStage,
    closeStage,
    openAddStage,
    closeAddStage,
    markSelfOriginated,
    handleItemSaved,
    handleItemCreated,
    handleStageSaved,
    handleStageCreated,
    handleStageDeleted,
    handleStagesReordered,
  };
}