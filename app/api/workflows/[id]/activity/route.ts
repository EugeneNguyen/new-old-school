import { NextResponse } from 'next/server';
import { workflowExists } from '@/lib/workflow-store';
import { readActivity } from '@/lib/activity-log';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 200);
      const before = url.searchParams.get('before') ?? undefined;
      const entries = readActivity(id, { limit, before });
      return NextResponse.json({ entries });
    } catch (error) {
      console.error('Error reading workflow activity:', error);
      return createErrorResponse('Failed to read activity');
    }
  });
}
