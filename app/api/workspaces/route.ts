import { NextRequest, NextResponse } from 'next/server';
import { createWorkspace, listWorkspaces } from '@/lib/workspace-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(listWorkspaces());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list workspaces';
    return createErrorResponse(message, 'InternalServerError', 500);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
  }
  const name = typeof body.name === 'string' ? body.name : '';
  const absolutePath = typeof body.absolutePath === 'string' ? body.absolutePath : '';
  const result = createWorkspace({ name, absolutePath });
  if ('error' in result) {
    return createErrorResponse(result.error, 'ValidationError', 400);
  }
  return NextResponse.json(result, { status: 201 });
}
