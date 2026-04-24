import { NextResponse } from 'next/server';
import { addStage, workflowExists, StageError } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { mapStageError } from '@/app/api/utils/stage-error';
import { withWorkspace } from '@/lib/workspace-context';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
  try {
    const { id } = await params;

    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }

    const body = (await req.json()) as Record<string, unknown>;

    if (body.name === undefined || body.name === null) {
      return createErrorResponse('Stage name is required', 'ValidationError', 400);
    }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return createErrorResponse('Stage name is required', 'ValidationError', 400);
    }

    const name = body.name as string;

    const stageInput = {
      name,
      description:
        typeof body.description === 'string' ? body.description : undefined,
      prompt:
        typeof body.prompt === 'string' && body.prompt ? body.prompt : undefined,
      autoAdvanceOnComplete: body.autoAdvanceOnComplete === true ? true : undefined,
      agentId:
        typeof body.agentId === 'string' && body.agentId
          ? body.agentId
          : undefined,
      maxDisplayItems:
        typeof body.maxDisplayItems === 'number' &&
        Number.isFinite(body.maxDisplayItems) &&
        Number.isInteger(body.maxDisplayItems) &&
        body.maxDisplayItems > 0
          ? body.maxDisplayItems
          : undefined,
    };

    const stages = addStage(id, stageInput);
    return NextResponse.json({ stages }, { status: 201 });
  } catch (error) {
    if (error instanceof StageError) {
      return mapStageError(error, 'creating workflow stage');
    }
    console.error('Error creating workflow stage:', error);
    return createErrorResponse('Failed to create stage');
  }
  });
}
