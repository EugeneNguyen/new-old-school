import { NextRequest, NextResponse } from 'next/server';
import { deleteWorkspace, readWorkspace, updateWorkspace } from '@/lib/workspace-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ws = readWorkspace(id);
  if (!ws) return createErrorResponse('Workspace not found', 'NotFound', 404);
  return NextResponse.json(ws);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
  }
  const patch: { name?: string; absolutePath?: string } = {};
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.absolutePath === 'string') patch.absolutePath = body.absolutePath;
  const result = updateWorkspace(id, patch);
  if (result === null) return createErrorResponse('Workspace not found', 'NotFound', 404);
  if ('error' in result) return createErrorResponse(result.error, 'ValidationError', 400);
  return NextResponse.json(result);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = deleteWorkspace(id);
  if (!ok) return createErrorResponse('Workspace not found', 'NotFound', 404);
  return new Response(null, { status: 204 });
}
