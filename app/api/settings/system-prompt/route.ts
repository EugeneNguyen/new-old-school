import { NextResponse } from 'next/server';
import { loadSystemPrompt, saveSystemPrompt } from '@/lib/system-prompt';
import { getProjectRoot } from '@/lib/project-root';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';

const MAX_BYTES = 65536;

export async function GET() {
  return withWorkspace(async () => {
    try {
      const projectRoot = getProjectRoot();
      const content = loadSystemPrompt(projectRoot);
      if (content === null) {
        return NextResponse.json({ content: '', exists: false });
      }
      return NextResponse.json({ content, exists: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return createErrorResponse(message);
    }
  });
}

export async function PUT(req: Request) {
  return withWorkspace(async () => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return createErrorResponse('content must be a string', 'ValidationError', 400);
  }

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== 'string') {
    return createErrorResponse('content must be a string', 'ValidationError', 400);
  }

  if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
    return createErrorResponse('content exceeds 64 KB limit', 'PayloadTooLarge', 413);
  }

  try {
    saveSystemPrompt(getProjectRoot(), content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
