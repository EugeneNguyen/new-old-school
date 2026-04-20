import { NextResponse } from 'next/server';
import { readWorkflowDetail, workflowExists, deleteWorkflow, updateWorkflow } from '@/lib/workflow-store';
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
      }
      const patch: { name?: string; idPrefix?: string } = {};
      if (typeof body.name === 'string') patch.name = body.name.trim();
      if (typeof body.idPrefix === 'string') patch.idPrefix = body.idPrefix.trim();
      if (patch.idPrefix && !/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(patch.idPrefix)) {
        return createErrorResponse(
          'idPrefix must match ^[A-Z0-9][A-Z0-9_-]{0,15}$ (uppercase alphanumeric, dash, underscore, starts with uppercase)',
          'ValidationError',
          400
        );
      }
      if (patch.name && patch.name.length > 128) {
        return createErrorResponse('name must be 128 characters or fewer', 'ValidationError', 400);
      }
      const ok = updateWorkflow(id, patch);
      if (!ok) return createErrorResponse('Failed to update workflow', 'InternalServerError', 500);
      return NextResponse.json(readWorkflowDetail(id));
    } catch (error) {
      console.error('Error updating workflow:', error);
      return createErrorResponse('Failed to update workflow');
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
        return createErrorResponse('Failed to delete workflow', 'InternalServerError', 500);
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error('Error deleting workflow:', error);
      return createErrorResponse('Failed to delete workflow');
    }
  });
}