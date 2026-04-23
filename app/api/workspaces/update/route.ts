import { NextRequest, NextResponse } from 'next/server';
import { updateWorkspace, getNosTemplatesRoot } from '@/lib/scaffolding';
import { withWorkspace, resolveWorkspaceRoot } from '@/lib/workspace-context';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UpdateRequest {
  force?: boolean;
  dryRun?: boolean;
}

export async function POST(req: NextRequest) {
  return withWorkspace(async () => {
    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no_active_workspace', 'no_active_workspace', 400);
    }

    let body: UpdateRequest = {};
    try {
      body = (await req.json()) as UpdateRequest;
    } catch {
      // Use defaults if body is not valid JSON
    }

    const { force = false, dryRun = false } = body;
    const templatesRoot = getNosTemplatesRoot();

    const result = updateWorkspace({
      workspacePath: workspaceRoot,
      templatesRoot,
      force,
      dryRun,
    });

    if (!result.ok) {
      return createErrorResponse(result.error, 'InternalError', 500);
    }

    return NextResponse.json({ ok: true, added: result.added });
  });
}