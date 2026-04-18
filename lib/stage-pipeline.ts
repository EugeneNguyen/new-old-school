import { appendItemSession, readItem, readStages } from '@/lib/workflow-store';
import { getDefaultAdapter } from '@/lib/agent-adapter';
import type { WorkflowItem } from '@/types/workflow';

export async function triggerStagePipeline(
  workflowId: string,
  itemId: string
): Promise<WorkflowItem | null> {
  const item = readItem(workflowId, itemId);
  if (!item) return null;
  if (item.status !== 'Todo') return item;

  const stages = readStages(workflowId);
  const stage = stages.find((s) => s.name === item.stage);
  if (!stage || !stage.prompt) return item;

  const fullPrompt = `${stage.prompt}\n\n# ${item.title}\n\n${item.body ?? ''}`.trim();

  try {
    const adapter = getDefaultAdapter();
    const { sessionId } = await adapter.startSession({ prompt: fullPrompt });
    const updated = appendItemSession(workflowId, itemId, {
      stage: stage.name,
      adapter: adapter.name,
      sessionId,
      startedAt: new Date().toISOString(),
    });
    return updated ?? item;
  } catch (err) {
    console.error(
      `Stage pipeline failed for workflow=${workflowId} item=${itemId} stage=${stage.name}:`,
      err
    );
    return item;
  }
}
