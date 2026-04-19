import {
  appendItemSession,
  readItem,
  readStages,
  updateItemMeta,
} from '@/lib/workflow-store';
import { getDefaultAdapter } from '@/lib/agent-adapter';
import { buildAgentPrompt, loadSystemPrompt } from '@/lib/system-prompt';
import { readAgent } from '@/lib/agents-store';
import type { ItemSession, WorkflowItem } from '@/types/workflow';

export async function triggerStagePipeline(
  workflowId: string,
  itemId: string
): Promise<WorkflowItem | null> {
  const item = readItem(workflowId, itemId);
  if (!item) return null;
  if (item.status !== 'Todo') return item;

  const hasSessionForStage = item.sessions?.some((s) => s.stage === item.stage) === true;
  if (hasSessionForStage) return item;

  const stages = readStages(workflowId);
  const stage = stages.find((s) => s.name === item.stage);
  if (!stage || !stage.prompt) return item;

  let memberPrompt: string | null = null;
  let model: string | undefined;
  let resolvedAgentId: string | null = null;
  let agentResolved = false;

  if (stage.agentId) {
    resolvedAgentId = stage.agentId;
    const agent = readAgent(stage.agentId);
    if (agent) {
      agentResolved = true;
      memberPrompt = agent.prompt;
      if (agent.model) model = agent.model;
    } else {
      console.warn(
        `Stage '${stage.name}' in workflow '${workflowId}' references missing agent '${stage.agentId}'. Running without member prompt/model.`
      );
    }
  }

  const fullPrompt = buildAgentPrompt({
    systemPrompt: loadSystemPrompt(process.cwd()),
    stagePrompt: stage.prompt,
    memberPrompt: agentResolved ? memberPrompt : null,
    title: item.title,
    body: item.body,
    comments: item.comments,
    workflowId,
    itemId,
  });

  try {
    const adapter = getDefaultAdapter();
    const { sessionId } = await adapter.startSession({ prompt: fullPrompt, model });
    const entry: ItemSession = {
      stage: stage.name,
      adapter: adapter.name,
      sessionId,
      startedAt: new Date().toISOString(),
    };
    if (resolvedAgentId) entry.agentId = resolvedAgentId;
    appendItemSession(workflowId, itemId, entry);
    const updated = updateItemMeta(workflowId, itemId, { status: 'In Progress' });
    console.log(
      `[stage-pipeline] workflow=${workflowId} item=${itemId} stage=${stage.name} session=${sessionId} -> In Progress`
    );
    return updated ?? item;
  } catch (err) {
    console.error(
      `Stage pipeline failed for workflow=${workflowId} item=${itemId} stage=${stage.name}:`,
      err
    );
    return item;
  }
}
