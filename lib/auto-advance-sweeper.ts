// DEBUG: confirm module is loaded
const { homedir } = require('os');
const fs = require('fs');
const path = require('path');
const debugLog = path.join(homedir(), '.nos', 'runtime', 'sweeper-debug.log');
try {
  fs.appendFileSync(debugLog, `[${new Date().toISOString()}] MODULE LOADED pid=${process.pid} cwd=${process.cwd()}\n`);
} catch (e) { console.error('DEBUG write failed:', e); }

import { listItems, listWorkflows } from '@/lib/workflow-store';
import {
  autoAdvanceIfEligible,
  autoStartIfEligible,
  completeSessionIfFinished,
} from '@/lib/auto-advance';
import { readHeartbeatMs } from '@/lib/settings';
import { runWithProjectRoot, getProjectRoot } from '@/lib/project-root';
import { listWorkspaces } from '@/lib/workspace-store';
import { tickRoutines } from '@/lib/routine-scheduler';

type TimerHandle = ReturnType<typeof setTimeout> | null;

const GLOBAL_KEY = '__nosAutoAdvanceTimer' as const;

type GlobalWithTimer = typeof globalThis & { [GLOBAL_KEY]?: TimerHandle };

function getTimer(): TimerHandle {
  return (globalThis as GlobalWithTimer)[GLOBAL_KEY] ?? null;
}

function setTimer(handle: TimerHandle): void {
  (globalThis as GlobalWithTimer)[GLOBAL_KEY] = handle;
}

function log(component: string, message: string): void {
  console.log(`[${new Date().toISOString()}] [${component}] ${message}`);
}

// Heartbeat state — exported for the health endpoint
export let lastTickAt: Date | null = null;
export let lastTickDurationMs: number = 0;
export let lastTickItemsSwept: number = 0;

async function sweepWorkspace(): Promise<number> {
  let workflows: string[] = [];
  let swept = 0;
  try {
    workflows = listWorkflows();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [auto-advance] listWorkflows failed: ${String(err)}`);
    return swept;
  }

  for (const workflowId of workflows) {
    let items: string[] = [];
    try {
      items = listItems(workflowId);
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] [auto-advance] listItems failed for workflow=${workflowId}: ${String(err)}`
      );
      continue;
    }
    for (const itemId of items) {
      try {
        await completeSessionIfFinished(workflowId, itemId);
        await autoAdvanceIfEligible(workflowId, itemId);
        await autoStartIfEligible(workflowId, itemId);
        swept++;
      } catch (err) {
        console.error(
          `[${new Date().toISOString()}] [auto-advance] tick failed for workflow=${workflowId} item=${itemId}: ${String(err)}`
        );
      }
    }
  }
  return swept;
}

async function tick(): Promise<void> {
  const ts = Date.now();
  log('heartbeat', 'tick start');
  const workspaces = listWorkspaces();
  const primaryRoot = getProjectRoot();
  const workspaceRoots = workspaces.map((w) => w.absolutePath);
  const allRoots = workspaceRoots.includes(primaryRoot)
    ? workspaceRoots
    : [primaryRoot, ...workspaceRoots];

  let totalSwept = 0;
  for (const root of allRoots) {
    try {
      await runWithProjectRoot(root, async () => {
        const count = await sweepWorkspace();
        totalSwept += count;
      });
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] [auto-advance] sweep failed for root=${root}: ${String(err)}`
      );
    }
  }

  try {
    await tickRoutines();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [auto-advance] tickRoutines failed: ${String(err)}`);
  }

  const elapsed = Date.now() - ts;
  lastTickAt = new Date();
  lastTickDurationMs = elapsed;
  lastTickItemsSwept = totalSwept;
  log('heartbeat', `tick end, swept ${totalSwept} items in ${elapsed}ms`);
}

function schedule(): void {
  // TRACE: confirm sweeper is alive
  const debugLog = '/Users/binhnguyenxuan/.nos/runtime/sweeper-debug.log';
  try {
    const ts = new Date().toISOString();
    require('fs').appendFileSync(debugLog, `[${ts}] schedule() called pid=${process.pid}\n`);
  } catch {}
  const existing = getTimer();
  if (existing) {
    clearTimeout(existing);
    setTimer(null);
  }

  let ms: number;
  try {
    ms = readHeartbeatMs();
  } catch (err) {
    log('heartbeat', 'heartbeat config unreadable, using default 60s');
    ms = 60_000;
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    log('heartbeat', `invalid interval ${ms}, using default 60s`);
    ms = 60_000;
  }

  const handle = setTimeout(async () => {
    try {
      await tick();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [heartbeat] tick threw unexpectedly: ${String(err)}`);
    }
    // Always reschedule — self-healing
    schedule();
  }, ms);

  if (typeof (handle as unknown as { unref?: () => void }).unref === 'function') {
    (handle as unknown as { unref: () => void }).unref();
  }

  setTimer(handle);
  log('heartbeat', `next tick in ${ms}ms`);
}

export function startHeartbeat(): void {
  const { homedir } = require('os');
  const fs = require('fs');
  const path = require('path');
  const debugLog = path.join(homedir(), '.nos', 'runtime', 'sweeper-debug.log');
  try {
    fs.appendFileSync(debugLog, `[${new Date().toISOString()}] startHeartbeat() ENTER pid=${process.pid}\n`);
  } catch {}
  try {
    schedule();
    try {
      fs.appendFileSync(debugLog, `[${new Date().toISOString()}] startHeartbeat() schedule() SUCCESS pid=${process.pid}\n`);
    } catch {}
  } catch (e) {
    try {
      fs.appendFileSync(debugLog, `[${new Date().toISOString()}] startHeartbeat() EXCEPTION: ${String(e)}\n`);
    } catch {}
    console.error('[heartbeat] startHeartbeat failed:', e);
  }
}

export function rescheduleHeartbeat(): void {
  schedule();
}

export function getHeartbeatState(): {
  lastTickAt: Date | null;
  lastTickDurationMs: number;
  lastTickItemsSwept: number;
} {
  return { lastTickAt: lastTickAt, lastTickDurationMs: lastTickDurationMs, lastTickItemsSwept: lastTickItemsSwept };
}