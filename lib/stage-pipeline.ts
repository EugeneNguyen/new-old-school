import { appendItemSession, readItem, readStages } from '@/lib/workflow-store';
import { getDefaultAdapter } from '@/lib/agent-adapter';
import { buildAgentPrompt, loadSystemPrompt } from '@/lib/system-prompt';
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

  const fullPrompt = buildAgentPrompt({
    systemPrompt: loadSystemPrompt(process.cwd()),
    stagePrompt: stage.prompt,
    title: item.title,
    body: item.body,
    comments: item.comments,
    workflowId,
    itemId,
  });

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
