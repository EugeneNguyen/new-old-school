import fs from 'fs';
import path from 'path';
import {
  appendItemComment,
  readItem,
  readStages,
  updateItemMeta,
} from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { getProjectRoot } from '@/lib/project-root';
import type { ItemSession, WorkflowItem } from '@/types/workflow';

const SESSIONS_DIR = path.join(getProjectRoot(), '.claude', 'sessions');
const SESSION_IDLE_MS = 30_000;

export async function autoAdvanceIfEligible(
  workflowId: string,
  itemId: string
): Promise<WorkflowItem | null> {
  const item = readItem(workflowId, itemId);
  if (!item) return null;
  if (item.status !== 'Done') return null;

  const stages = readStages(workflowId);
  const currentIdx = stages.findIndex((s) => s.name === item.stage);
  if (currentIdx === -1) return null;
  if (currentIdx >= stages.length - 1) return null;

  const current = stages[currentIdx];
  if (current.autoAdvanceOnComplete !== true) return null;

  const next = stages[currentIdx + 1];
  const advanced = updateItemMeta(workflowId, itemId, { stage: next.name });
  if (!advanced) return null;

  console.log(
    `[auto-advance] workflow=${workflowId} item=${itemId} ${current.name} -> ${next.name}`
  );

  const afterPipeline = await triggerStagePipeline(workflowId, itemId);
  return afterPipeline ?? advanced;
}

export async function autoStartIfEligible(
  workflowId: string,
  itemId: string
): Promise<WorkflowItem | null> {
  const item = readItem(workflowId, itemId);
  if (!item) return null;
  if (item.status !== 'Todo') return null;

  const stages = readStages(workflowId);
  const stage = stages.find((s) => s.name === item.stage);
  if (!stage) return null;
  const promptText = (stage.prompt ?? '').trim();
  if (!promptText) return null;

  const alreadyKicked = item.sessions?.some((s) => s.stage === item.stage) === true;
  if (alreadyKicked) return null;

  console.log(
    `[auto-start] workflow=${workflowId} item=${itemId} stage=${item.stage}`
  );

  try {
    const updated = await triggerStagePipeline(workflowId, itemId);
    return updated ?? item;
  } catch (err) {
    console.error(
      `[auto-start] failed for workflow=${workflowId} item=${itemId}`,
      err
    );
    return item;
  }
}

function latestSessionForStage(
  item: WorkflowItem,
  stage: string
): ItemSession | null {
  const sessions = item.sessions ?? [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].stage === stage) return sessions[i];
  }
  return null;
}

function readLastJsonLine(filePath: string): Record<string, unknown> | null {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(lines[i]) as Record<string, unknown>;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function extractSummaryFromSessionLog(filePath: string): string | null {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]) as Record<string, unknown>;
        if (event.type === 'result' && typeof event.result === 'string' && event.result.trim()) {
          return event.result.trim();
        }
      } catch {
        continue;
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]) as Record<string, unknown>;
        if (event.type !== 'assistant') continue;
        const message = event.message as Record<string, unknown> | undefined;
        const content = message?.content as unknown;
        if (!Array.isArray(content)) continue;
        for (let j = content.length - 1; j >= 0; j--) {
          const block = content[j] as Record<string, unknown>;
          if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            return block.text.trim();
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function completeSessionIfFinished(
  workflowId: string,
  itemId: string
): Promise<WorkflowItem | null> {
  const item = readItem(workflowId, itemId);
  if (!item) return null;
  if (item.status === 'Done' || item.status === 'Failed') return null;

  const session = latestSessionForStage(item, item.stage);
  if (!session) return null;

  const logPath = path.join(SESSIONS_DIR, `${session.sessionId}.txt`);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(logPath);
  } catch {
    return null;
  }

  const idleMs = Date.now() - stat.mtimeMs;
  if (idleMs < SESSION_IDLE_MS) return null;

  const last = readLastJsonLine(logPath);
  const finished = last && last.type === 'result';

  if (!finished && idleMs < SESSION_IDLE_MS * 2) return null;

  const summary =
    extractSummaryFromSessionLog(logPath) ??
    '(no summary captured from session log)';
  const prefix = finished ? '' : '[runtime] session log stalled; ';
  appendItemComment(workflowId, itemId, `${prefix}${summary}`);
  const updated = updateItemMeta(workflowId, itemId, { status: 'Done' });

  console.log(
    `[session-complete] workflow=${workflowId} item=${itemId} stage=${item.stage} session=${session.sessionId} -> Done`
  );

  return updated ?? item;
}
