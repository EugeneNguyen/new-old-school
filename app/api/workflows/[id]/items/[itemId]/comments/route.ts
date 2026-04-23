import { NextResponse } from 'next/server';
import { readItem, appendItemComment, workflowExists } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';
import type { Comment } from '@/types/workflow';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return withWorkspace(async () => {
  try {
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    const item = readItem(id, itemId);
    if (!item) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }

    let body: { text?: unknown; author?: unknown };
    try {
      body = (await req.json()) as { text?: unknown; author?: unknown };
    } catch {
      return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
    }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return createErrorResponse('"text" must be a non-empty string', 'BadRequest', 400);
    }
    const author = typeof body.author === 'string' ? body.author : 'agent';

    const updated = appendItemComment(id, itemId, body.text, author);
    if (!updated) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    const newComment: Comment | undefined = updated.comments?.at(-1);
    return NextResponse.json(newComment ? { ok: true, comment: newComment } : { ok: true }, { status: 201 });
  } catch (error) {
    console.error('Error appending comment:', error);
    return createErrorResponse('Failed to append comment');
  }
  });
}
