import { NextResponse } from 'next/server';
import { createItem, readStages, workflowExists } from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }

    const stages = readStages(id);
    if (stages.length === 0) {
      return createErrorResponse(
        'Workflow has no stages configured',
        'BadRequest',
        400
      );
    }

    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return createErrorResponse('"title" must be a non-empty string', 'BadRequest', 400);
    }
    if (body.id !== undefined && typeof body.id !== 'string') {
      return createErrorResponse('"id" must be a string', 'BadRequest', 400);
    }

    const created = createItem(id, {
      title: body.title,
      id: typeof body.id === 'string' ? body.id : undefined,
    });
    if (!created) {
      return createErrorResponse('Failed to create item', 'BadRequest', 400);
    }
    const afterPipeline = await triggerStagePipeline(id, created.id);
    return NextResponse.json(afterPipeline ?? created, { status: 201 });
  } catch (error) {
    console.error('Error creating workflow item:', error);
    return createErrorResponse('Failed to create item');
  }
}
