export type WorkflowViewMode = 'kanban' | 'list';

export const DEFAULT_WORKFLOW_VIEW_MODE: WorkflowViewMode = 'kanban';

export function getWorkflowViewModeStorageKey(workflowId: string) {
  return `nos:workflow:${workflowId}:viewMode`;
}

export function readWorkflowViewMode(
  workflowId: string,
  storage: Pick<Storage, 'getItem'> | null | undefined =
    typeof window !== 'undefined' ? window.localStorage : null
): WorkflowViewMode {
  if (!storage) return DEFAULT_WORKFLOW_VIEW_MODE;
  try {
    const value = storage.getItem(getWorkflowViewModeStorageKey(workflowId));
    return value === 'list' || value === 'kanban' ? value : DEFAULT_WORKFLOW_VIEW_MODE;
  } catch {
    return DEFAULT_WORKFLOW_VIEW_MODE;
  }
}

export function writeWorkflowViewMode(
  workflowId: string,
  mode: WorkflowViewMode,
  storage: Pick<Storage, 'setItem'> | null | undefined =
    typeof window !== 'undefined' ? window.localStorage : null
) {
  if (!storage) return;
  try {
    storage.setItem(getWorkflowViewModeStorageKey(workflowId), mode);
  } catch {
    // Ignore persistence failures and keep in-memory selection.
  }
}

export function formatRelativeUpdatedAt(
  updatedAt: string,
  now = Date.now()
): string {
  const target = new Date(updatedAt).getTime();
  if (!Number.isFinite(target)) return '—';

  const diffMs = target - now;
  const absMs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absMs < hour) {
    return formatter.format(Math.round(diffMs / minute), 'minute');
  }
  if (absMs < day) {
    return formatter.format(Math.round(diffMs / hour), 'hour');
  }
  return formatter.format(Math.round(diffMs / day), 'day');
}
