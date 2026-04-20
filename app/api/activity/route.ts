import { NextResponse } from 'next/server';
import { listWorkflows } from '@/lib/workflow-store';
import { readGlobalActivity } from '@/lib/activity-log';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  return withWorkspace(async () => {
    try {
      const url = new URL(req.url);
      const limit = Number(url.searchParams.get('limit') ?? 200);
      const before = url.searchParams.get('before') ?? undefined;
      const workflowIds = listWorkflows();
      const entries = readGlobalActivity(workflowIds, { limit, before });
      return NextResponse.json({ entries });
    } catch (error) {
      console.error('Error reading global activity:', error);
      return createErrorResponse('Failed to read activity');
    }
  });
}
