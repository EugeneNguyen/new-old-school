import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKFLOW_VIEW_MODE,
  formatRelativeUpdatedAt,
  getWorkflowViewModeStorageKey,
  readWorkflowViewMode,
  writeWorkflowViewMode,
} from './workflow-view-mode.ts';

test('builds per-workflow storage key', () => {
  assert.equal(getWorkflowViewModeStorageKey('abc'), 'nos:workflow:abc:viewMode');
});

test('reads stored list mode', () => {
  const storage = {
    getItem(key: string) {
      assert.equal(key, 'nos:workflow:w1:viewMode');
      return 'list';
    },
  };
  assert.equal(readWorkflowViewMode('w1', storage), 'list');
});

test('falls back to default mode for invalid or missing values', () => {
  assert.equal(readWorkflowViewMode('w1', { getItem: () => 'other' }), DEFAULT_WORKFLOW_VIEW_MODE);
  assert.equal(readWorkflowViewMode('w1', { getItem: () => null }), DEFAULT_WORKFLOW_VIEW_MODE);
  assert.equal(readWorkflowViewMode('w1', null), DEFAULT_WORKFLOW_VIEW_MODE);
});

test('survives storage read failures', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readWorkflowViewMode('w1', storage), DEFAULT_WORKFLOW_VIEW_MODE);
});

test('writes selected mode with per-workflow key', () => {
  let call: { key: string; value: string } | null = null;
  const storage = {
    setItem(key: string, value: string) {
      call = { key, value };
    },
  };
  writeWorkflowViewMode('w9', 'kanban', storage);
  assert.deepEqual(call, { key: 'nos:workflow:w9:viewMode', value: 'kanban' });
});

test('survives storage write failures', () => {
  const storage = {
    setItem() {
      throw new Error('quota');
    },
  };
  assert.doesNotThrow(() => writeWorkflowViewMode('w9', 'list', storage));
});

test('formats relative time in minutes and hours', () => {
  const now = Date.UTC(2026, 3, 19, 10, 0, 0);
  assert.equal(formatRelativeUpdatedAt(new Date(now - 3 * 60_000).toISOString(), now), '3 minutes ago');
  assert.equal(formatRelativeUpdatedAt(new Date(now - 2 * 60 * 60_000).toISOString(), now), '2 hours ago');
});

test('returns em dash for invalid dates', () => {
  assert.equal(formatRelativeUpdatedAt('not-a-date'), '—');
});
