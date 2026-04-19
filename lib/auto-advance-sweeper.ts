import { listItems, listWorkflows } from '@/lib/workflow-store';
import { autoAdvanceIfEligible, autoStartIfEligible } from '@/lib/auto-advance';
import { readHeartbeatMs } from '@/lib/settings';

type TimerHandle = ReturnType<typeof setTimeout> | null;

const GLOBAL_KEY = '__nosAutoAdvanceTimer' as const;

type GlobalWithTimer = typeof globalThis & { [GLOBAL_KEY]?: TimerHandle };

function getTimer(): TimerHandle {
  return (globalThis as GlobalWithTimer)[GLOBAL_KEY] ?? null;
}

function setTimer(handle: TimerHandle): void {
  (globalThis as GlobalWithTimer)[GLOBAL_KEY] = handle;
}

async function tick(): Promise<void> {
  let workflows: string[] = [];
  try {
    workflows = listWorkflows();
  } catch (err) {
    console.error('[auto-advance] listWorkflows failed', err);
    return;
  }

  for (const workflowId of workflows) {
    let items: string[] = [];
    try {
      items = listItems(workflowId);
    } catch (err) {
      console.error(`[auto-advance] listItems failed for workflow=${workflowId}`, err);
      continue;
    }
    for (const itemId of items) {
      try {
        await autoAdvanceIfEligible(workflowId, itemId);
        await autoStartIfEligible(workflowId, itemId);
      } catch (err) {
        console.error(
          `[auto-advance] tick failed for workflow=${workflowId} item=${itemId}`,
          err
        );
      }
    }
  }
}

function schedule(): void {
  const existing = getTimer();
  if (existing) {
    clearTimeout(existing);
    setTimer(null);
  }

  let ms: number;
  try {
    ms = readHeartbeatMs();
  } catch (err) {
    console.error('[auto-advance] readHeartbeatMs failed', err);
    return;
  }

  if (!Number.isFinite(ms) || ms <= 0) return;

  const handle = setTimeout(async () => {
    try {
      await tick();
    } catch (err) {
      console.error('[auto-advance] tick failed', err);
    }
    schedule();
  }, ms);

  if (typeof (handle as unknown as { unref?: () => void }).unref === 'function') {
    (handle as unknown as { unref: () => void }).unref();
  }

  setTimer(handle);
}

export function startHeartbeat(): void {
  schedule();
}

export function rescheduleHeartbeat(): void {
  schedule();
}
