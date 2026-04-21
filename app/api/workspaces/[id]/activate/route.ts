import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readWorkspace, ensureNosDir } from '@/lib/workspace-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { WORKSPACE_COOKIE } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ws = readWorkspace(id);
  if (!ws) return createErrorResponse('Workspace not found', 'NotFound', 404);

  try {
    const templatesRoot = path.join(process.cwd(), 'templates', '.nos');
    ensureNosDir(ws.absolutePath, templatesRoot);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to seed .nos directory';
    return createErrorResponse(message, 'InternalServerError', 500);
  }

  const res = NextResponse.json({ ok: true, workspace: ws });
  res.cookies.set(WORKSPACE_COOKIE, ws.id, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE(
  _req: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(WORKSPACE_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
