import { NextResponse } from 'next/server';
import { readItem, workflowExists, writeItemContent } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import type { ActivityActor } from '@/lib/activity-log';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET(
  _req: Request,
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
    return NextResponse.json({ body: item.body ?? '' });
  } catch (error) {
    console.error('Error reading item content:', error);
    return createErrorResponse('Failed to read item content');
  }
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  return withWorkspace(async () => {
  try {
    const actor = ((req.headers.get('x-nos-actor') as ActivityActor) ?? 'ui');
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    let body: { body?: unknown };
    try {
      body = (await req.json()) as { body?: unknown };
    } catch {
      return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
    }
    if (typeof body.body !== 'string') {
      return createErrorResponse('"body" must be a string', 'BadRequest', 400);
    }
    const updated = writeItemContent(id, itemId, body.body, actor);
    if (!updated) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error writing item content:', error);
    return createErrorResponse('Failed to write item content');
  }
  });
}
