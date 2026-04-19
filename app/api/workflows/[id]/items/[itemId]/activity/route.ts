import { NextResponse } from 'next/server';
import { workflowExists, itemExists } from '@/lib/workflow-store';
import { readItemActivity } from '@/lib/activity-log';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    if (!itemExists(id, itemId)) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? 200);
    const before = url.searchParams.get('before') ?? undefined;
    const entries = readItemActivity(id, itemId, { limit, before });
    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error reading item activity:', error);
    return createErrorResponse('Failed to read activity');
  }
}
