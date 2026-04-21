import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorkflowItem, reconcileWorkflowItems } from './use-workflow-items.ts';
import type { WorkflowItem } from '../../types/workflow';

function item(overrides: Partial<WorkflowItem> = {}): WorkflowItem {
  return {
    id: overrides.id ?? 'REQ-1',
    title: overrides.title ?? 'Item',
    stage: overrides.stage ?? 'Todo',
    status: overrides.status ?? 'Todo',
    updatedAt: overrides.updatedAt ?? '2026-04-19T10:00:00.000Z',
    ...overrides,
  };
}

test('mergeWorkflowItem adds unknown items', () => {
  const current = [item({ id: 'REQ-1' })];
  const merged = mergeWorkflowItem(current, item({ id: 'REQ-2' }));
  assert.notEqual(merged, current);
  assert.deepEqual(merged.map((entry) => entry.id), ['REQ-1', 'REQ-2']);
});

test('mergeWorkflowItem keeps newer existing items', () => {
  const current = [item({ id: 'REQ-1', title: 'Local', updatedAt: '2026-04-19T10:05:00.000Z' })];
  const merged = mergeWorkflowItem(
    current,
    item({ id: 'REQ-1', title: 'Incoming', updatedAt: '2026-04-19T10:04:00.000Z' })
  );
  assert.equal(merged, current);
});

test('mergeWorkflowItem replaces stale existing items', () => {
  const current = [item({ id: 'REQ-1', title: 'Local', updatedAt: '2026-04-19T10:04:00.000Z' })];
  const merged = mergeWorkflowItem(
    current,
    item({ id: 'REQ-1', title: 'Incoming', updatedAt: '2026-04-19T10:05:00.000Z' })
  );
  assert.equal(merged[0].title, 'Incoming');
});

test('reconcileWorkflowItems prefers newer local optimistic items', () => {
  const current = [item({ id: 'REQ-1', title: 'Local', updatedAt: '2026-04-19T10:06:00.000Z' })];
  const reconciled = reconcileWorkflowItems(current, [
    item({ id: 'REQ-1', title: 'Server', updatedAt: '2026-04-19T10:05:00.000Z' }),
  ]);
  assert.equal(reconciled[0].title, 'Local');
});

test('reconcileWorkflowItems accepts newer server items', () => {
  const current = [item({ id: 'REQ-1', title: 'Local', updatedAt: '2026-04-19T10:05:00.000Z' })];
  const reconciled = reconcileWorkflowItems(current, [
    item({ id: 'REQ-1', title: 'Server', updatedAt: '2026-04-19T10:06:00.000Z' }),
  ]);
  assert.equal(reconciled[0].title, 'Server');
});
