import { NextResponse } from 'next/server';
import { readWorkflowDetail, workflowExists, deleteWorkflow } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      const detail = readWorkflowDetail(id);
      if (!detail) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }
      return NextResponse.json(detail);
    } catch (error) {
      console.error('Error reading workflow detail:', error);
      return createErrorResponse('Failed to read workflow');
    }
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }
      const ok = deleteWorkflow(id);
      if (!ok) {
        return createErrorResponse('Failed to delete workflow', 'InternalError', 500);
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      return createErrorResponse('Failed to delete workflow');
    }
  });
}
