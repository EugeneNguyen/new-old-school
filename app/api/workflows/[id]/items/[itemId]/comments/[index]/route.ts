import { NextResponse } from 'next/server';
import { updateItemComment, deleteItemComment, workflowExists } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string; index: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id, itemId, index } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }

      const idx = parseInt(index, 10);
      if (!Number.isFinite(idx) || idx < 0) {
        return createErrorResponse(`Invalid index '${index}'`, 'BadRequest', 400);
      }

      let body: { text?: unknown };
      try {
        body = (await req.json()) as { text?: unknown };
      } catch {
        return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
      }
      if (typeof body.text !== 'string' || !body.text.trim()) {
        return createErrorResponse('"text" must be a non-empty string', 'BadRequest', 400);
      }

      const updated = updateItemComment(id, itemId, idx, body.text);
      if (updated === null) {
        return createErrorResponse(`No comment at index ${idx}`, 'NotFound', 404);
      }

      return NextResponse.json({ ok: true, text: updated });
    } catch (error) {
      console.error('Error updating comment:', error);
      return createErrorResponse('Failed to update comment');
    }
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string; index: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id, itemId, index } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }

      const idx = parseInt(index, 10);
      if (!Number.isFinite(idx) || idx < 0) {
        return createErrorResponse(`Invalid index '${index}'`, 'BadRequest', 400);
      }

      const remaining = deleteItemComment(id, itemId, idx);
      if (remaining === null) {
        return createErrorResponse(`No comment at index ${idx}`, 'NotFound', 404);
      }

      return NextResponse.json({ ok: true, comments: remaining });
    } catch (error) {
      console.error('Error deleting comment:', error);
      return createErrorResponse('Failed to delete comment');
    }
  });
}
