import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { CronExpressionParser } from 'cron-parser';
import { getProjectRoot } from '@/lib/project-root';
import { createItem, readStages, workflowExists } from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { appendActivity } from '@/lib/activity-log';

function workflowsRoot(): string {
  return path.join(getProjectRoot(), '.nos', 'workflows');
}

function routineConfigPath(workflowId: string): string {
  return path.join(workflowsRoot(), workflowId, 'config', 'routine.yaml');
}

function routineStatePath(workflowId: string): string {
  return path.join(workflowsRoot(), workflowId, 'routine-state.json');
}

export interface RoutineConfig {
  enabled: boolean;
  cron: string;
}

export interface RoutineState {
  lastFiredAt: string | null;
}

function atomicWriteFile(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function readRoutineConfig(workflowId: string): RoutineConfig | null {
  const configPath = routineConfigPath(workflowId);
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.enabled !== 'boolean') return null;
    if (typeof obj.cron !== 'string' || !obj.cron.trim()) return null;
    return { enabled: obj.enabled, cron: obj.cron.trim() };
  } catch {
    return null;
  }
}

export function writeRoutineConfig(workflowId: string, config: RoutineConfig): boolean {
  if (!workflowExists(workflowId)) return false;
  try {
    const configPath = routineConfigPath(workflowId);
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    atomicWriteFile(configPath, yaml.dump(config));
    return true;
  } catch {
    return false;
  }
}

export function readRoutineState(workflowId: string): RoutineState {
  const statePath = routineStatePath(workflowId);
  if (!fs.existsSync(statePath)) return { lastFiredAt: null };
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lastFiredAt: typeof parsed.lastFiredAt === 'string' ? parsed.lastFiredAt : null,
    };
  } catch {
    return { lastFiredAt: null };
  }
}

function writeRoutineState(workflowId: string, state: RoutineState): void {
  const statePath = routineStatePath(workflowId);
  atomicWriteFile(statePath, JSON.stringify(state));
}

export function validateCronExpression(cron: string): boolean {
  try {
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

function formatRoutineTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function processWorkflow(workflowId: string): Promise<void> {
  const config = readRoutineConfig(workflowId);
  if (!config || !config.enabled) return;

  const stages = readStages(workflowId);
  if (stages.length === 0) {
    console.warn(`[routine] workflow=${workflowId} has no stages, skipping`);
    return;
  }

  const state = readRoutineState(workflowId);

  const now = new Date();
  let scheduledTime: Date;
  try {
    const iter = CronExpressionParser.parse(config.cron, { currentDate: now });
    scheduledTime = iter.prev().toDate();
  } catch (err) {
    console.error(`[routine] cron parse failed workflow=${workflowId}`, err);
    return;
  }

  // Only fire if the scheduled time is in the past (or right now) and is newer than lastFiredAt
  if (scheduledTime > now) return;
  if (state.lastFiredAt !== null) {
    const lastFired = new Date(state.lastFiredAt);
    if (scheduledTime <= lastFired) return;
  }

  // Format the scheduled time for the title/body (round to minute)
  const scheduledLabel = formatRoutineTime(scheduledTime);
  const title = `(routine) ${scheduledLabel}`;
  const body = `Created by routine at ${scheduledLabel}`;

  const created = createItem(workflowId, {
    title,
    body,
    actor: 'runtime',
  });

  if (!created) {
    console.error(`[routine] failed to create item workflow=${workflowId}`);
    return;
  }

  // Mark origin in meta.yml
  const metaPath = path.join(
    workflowsRoot(),
    workflowId,
    'items',
    created.id,
    'meta.yml'
  );
  if (fs.existsSync(metaPath)) {
    const rawMeta = fs.readFileSync(metaPath, 'utf-8');
    const parsedMeta = (yaml.load(rawMeta) as Record<string, unknown>) ?? {};
    parsedMeta.origin = 'routine';
    atomicWriteFile(metaPath, yaml.dump(parsedMeta));
  }

  // Update lastFiredAt state
  writeRoutineState(workflowId, { lastFiredAt: now.toISOString() });

  // Log activity
  void appendActivity({
    ts: now.toISOString(),
    workflowId,
    itemId: created.id,
    type: 'routine-item-created',
    actor: 'runtime',
    data: { kind: 'routine-item-created', title },
  });

  // Trigger stage pipeline
  await triggerStagePipeline(workflowId, created.id);
}

export async function tickRoutines(): Promise<void> {
  const workflowsRootPath = workflowsRoot();
  if (!fs.existsSync(workflowsRootPath)) return;

  let workflowIds: string[] = [];
  try {
    workflowIds = fs.readdirSync(workflowsRootPath).filter((entry) => {
      const full = path.join(workflowsRootPath, entry);
      return fs.statSync(full).isDirectory();
    });
  } catch (err) {
    console.error('[routine] failed to list workflows', err);
    return;
  }

  for (const workflowId of workflowIds) {
    try {
      await processWorkflow(workflowId);
    } catch (err) {
      console.error(`[routine] failed to process workflow=${workflowId}`, err);
    }
  }
}
