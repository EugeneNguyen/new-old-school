import { EventEmitter } from 'events';
import type { WorkflowItem } from '@/types/workflow';
import type { ActivityEntry } from '@/lib/activity-log';

export type WorkflowEvent =
  | { type: 'item-updated'; workflowId: string; itemId: string; item: WorkflowItem }
  | { type: 'item-created'; workflowId: string; itemId: string; item: WorkflowItem }
  | { type: 'item-deleted'; workflowId: string; itemId: string }
  | { type: 'item-activity'; entry: ActivityEntry };

export const WORKFLOW_EVENT = 'workflow-event';

declare global {
  // eslint-disable-next-line no-var
  var __nosWorkflowEvents: EventEmitter | undefined;
}

function getEmitter(): EventEmitter {
  if (!globalThis.__nosWorkflowEvents) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(64);
    globalThis.__nosWorkflowEvents = emitter;
  }
  return globalThis.__nosWorkflowEvents;
}

export const workflowEvents: EventEmitter = getEmitter();

export function emitItemUpdated(workflowId: string, item: WorkflowItem): void {
  workflowEvents.emit(WORKFLOW_EVENT, {
    type: 'item-updated',
    workflowId,
    itemId: item.id,
    item,
  } satisfies WorkflowEvent);
}

export function emitItemCreated(workflowId: string, item: WorkflowItem): void {
  workflowEvents.emit(WORKFLOW_EVENT, {
    type: 'item-created',
    workflowId,
    itemId: item.id,
    item,
  } satisfies WorkflowEvent);
}

export function emitItemDeleted(workflowId: string, itemId: string): void {
  workflowEvents.emit(WORKFLOW_EVENT, {
    type: 'item-deleted',
    workflowId,
    itemId,
  } satisfies WorkflowEvent);
}
