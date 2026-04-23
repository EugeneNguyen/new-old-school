import {
  appendItemSession,
  readItem,
  readStages,
  updateItemMeta,
} from '@/lib/workflow-store';
import { getAdapter, getDefaultAdapter } from '@/lib/agent-adapter';
import { buildAgentPrompt, loadSystemPrompt } from '@/lib/system-prompt';
import { readAgent } from '@/lib/agents-store';
import { getProjectRoot } from '@/lib/project-root';
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
  let adapterName: string | null = null;

  if (stage.agentId) {
    resolvedAgentId = stage.agentId;
    const agent = readAgent(stage.agentId);
    if (agent) {
      agentResolved = true;
      memberPrompt = agent.prompt;
      if (agent.model) model = agent.model;
      adapterName = agent.adapter ?? 'claude';
    } else {
      console.warn(
        `Stage '${stage.name}' in workflow '${workflowId}' references missing agent '${stage.agentId}'. Running without member prompt/model.`
      );
    }
  }

  const fullPrompt = buildAgentPrompt({
    systemPrompt: loadSystemPrompt(getProjectRoot()),
    stagePrompt: stage.prompt,
    memberPrompt: agentResolved ? memberPrompt : null,
    title: item.title,
    body: item.body,
    comments: item.comments,
    workflowId,
    itemId,
    skill: stage.skill ?? null,
  });

  try {
    const adapter = adapterName ? getAdapter(adapterName) : getDefaultAdapter();
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
    const ts4 = new Date().toISOString();
    console.log(
      `[${ts4}] [stage-pipeline] workflow=${workflowId} item=${itemId} stage=${stage.name} session=${sessionId} -> In Progress`
    );
    return updated ?? item;
  } catch (err) {
    console.error(
      `[${new Date().toISOString()}] [stage-pipeline] Stage pipeline failed for workflow=${workflowId} item=${itemId} stage=${stage.name}: ${String(err)}`
    );
    return item;
  }
}
