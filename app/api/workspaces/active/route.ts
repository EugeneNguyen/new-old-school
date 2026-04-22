import { NextRequest, NextResponse } from 'next/server';
import { createErrorResponse } from '@/app/api/utils/errors';
import { readWorkspace } from '@/lib/workspace-store';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const workspaceId = req.cookies.get(WORKSPACE_COOKIE)?.value;
    if (!workspaceId) {
      return createErrorResponse('no active workspace', 'NotFound', 404);
    }
    const workspace = readWorkspace(workspaceId);
    if (!workspace) {
      return createErrorResponse('workspace not found', 'NotFound', 404);
    }
    return NextResponse.json(workspace);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get active workspace';
    return createErrorResponse(message, 'InternalServerError', 500);
  }
}