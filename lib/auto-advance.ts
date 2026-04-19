import { readItem, readStages, updateItemMeta } from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import type { WorkflowItem } from '@/types/workflow';

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
