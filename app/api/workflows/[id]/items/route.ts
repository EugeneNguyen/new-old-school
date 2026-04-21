import { NextResponse } from 'next/server';
import { createItem, readStages, workflowExists } from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { createErrorResponse } from '@/app/api/utils/errors';
import type { ActivityActor } from '@/lib/activity-log';
import { withWorkspace } from '@/lib/workspace-context';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
  try {
    const actor = ((req.headers.get('x-nos-actor') as ActivityActor) ?? 'ui');
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
    }
    if (typeof body.title !== 'string' || !body.title.trim()) {
      return createErrorResponse('"title" must be a non-empty string', 'BadRequest', 400);
    }
    if (body.id !== undefined && typeof body.id !== 'string') {
      return createErrorResponse('"id" must be a string', 'BadRequest', 400);
    }
    if (body.body !== undefined && typeof body.body !== 'string') {
      return createErrorResponse('"body" must be a string', 'BadRequest', 400);
    }
    if (body.stage !== undefined) {
      if (typeof body.stage !== 'string' || !body.stage.trim()) {
        return createErrorResponse('"stage" must be a non-empty string', 'BadRequest', 400);
      }
      if (!stages.some((s) => s.name === body.stage)) {
        return createErrorResponse(
          `Unknown stage '${body.stage}'. Valid stages: ${stages.map((s) => s.name).join(', ')}`,
          'BadRequest',
          400
        );
      }
    }

    const created = createItem(id, {
      title: body.title,
      id: typeof body.id === 'string' ? body.id : undefined,
      body: typeof body.body === 'string' ? body.body : undefined,
      stage: typeof body.stage === 'string' ? body.stage : undefined,
      actor,
    });
    if (!created) {
      return createErrorResponse('Failed to create item');
    }
    const afterPipeline = await triggerStagePipeline(id, created.id);
    return NextResponse.json(afterPipeline ?? created, { status: 201 });
  } catch (error) {
    console.error('Error creating workflow item:', error);
    return createErrorResponse('Failed to create item');
  }
  });
}
