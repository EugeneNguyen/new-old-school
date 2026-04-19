import { NextResponse } from 'next/server';
import { loadSystemPrompt, saveSystemPrompt } from '@/lib/system-prompt';
import { getProjectRoot } from '@/lib/project-root';

export const runtime = 'nodejs';

const MAX_BYTES = 65536;

export async function GET() {
  try {
    const projectRoot = getProjectRoot();
    const content = loadSystemPrompt(projectRoot);
    if (content === null) {
      return NextResponse.json({ content: '', exists: false });
    }
    return NextResponse.json({ content, exists: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }

  const content = (body as { content?: unknown } | null)?.content;
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }

  if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
    return NextResponse.json({ error: 'content exceeds 64 KB limit' }, { status: 413 });
  }

  try {
    saveSystemPrompt(getProjectRoot(), content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
