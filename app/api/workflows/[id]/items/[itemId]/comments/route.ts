import { NextResponse } from 'next/server';
import { readItem, updateItemMeta, workflowExists } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    const item = readItem(id, itemId);
    if (!item) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }

    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return createErrorResponse('"text" must be a non-empty string', 'BadRequest', 400);
    }

    const nextComments = [...item.comments, body.text];
    const updated = updateItemMeta(id, itemId, { comments: nextComments });
    if (!updated) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error appending comment:', error);
    return createErrorResponse('Failed to append comment');
  }
}
