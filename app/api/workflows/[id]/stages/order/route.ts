import { NextResponse } from 'next/server';
import { reorderStages, workflowExists, StageError } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function PUT(
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

    if (!Array.isArray(body.order)) {
      return createErrorResponse('"order" must be an array of stage names', 'BadRequest', 400);
    }

    const order = body.order as unknown[];
    if (!order.every((item) => typeof item === 'string')) {
      return createErrorResponse('"order" must be an array of stage names', 'BadRequest', 400);
    }

    const orderedNames = order as string[];

    try {
      const stages = reorderStages(id, orderedNames);
      return NextResponse.json({ stages });
    } catch (error) {
      if (error instanceof StageError) {
        if (error.code === 'SET_MISMATCH') {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        if (error.code === 'NOT_FOUND') {
          return createErrorResponse(error.message, 'NotFound', 404);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reordering workflow stages:', error);
    return createErrorResponse('Failed to reorder stages');
  }
  });
}