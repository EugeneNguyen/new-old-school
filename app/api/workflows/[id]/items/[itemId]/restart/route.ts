import { NextResponse } from 'next/server';
import { readItem, readStages, restartItem, workflowExists } from '@/lib/workflow-store';
import { appendActivity, type ActivityActor } from '@/lib/activity-log';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id, itemId } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }

      const stages = readStages(id);
      if (stages.length === 0) {
        return createErrorResponse('No stages configured for this workflow', 'InternalError', 500);
      }

      const item = readItem(id, itemId);
      if (!item) {
        return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
      }

      const before = { stage: item.stage, status: item.status };
      const firstStage = stages[0].name;
      const after = { stage: firstStage, status: 'Todo' as const };

      const restarted = restartItem(id, itemId);
      if (!restarted) {
        return createErrorResponse(`Failed to restart item '${itemId}'`);
      }

      void appendActivity({
        ts: new Date().toISOString(),
        workflowId: id,
        itemId,
        type: 'restart',
        actor: 'ui' as ActivityActor,
        data: { kind: 'restart', before, after },
      });

      void triggerStagePipeline(id, itemId);

      return NextResponse.json(restarted);
    } catch (error) {
      console.error('Error restarting workflow item:', error);
      return createErrorResponse('Failed to restart item');
    }
  });
}