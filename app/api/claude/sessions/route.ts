import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import type { SessionSummary, SessionHistory, SessionHistoryMessage } from '@/types/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSIONS_DIR = join(process.cwd(), '.claude', 'sessions');

function parseLines(filePath: string): string[] {
  try {
    return readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function parseSessionSummary(filePath: string, fileName: string): SessionSummary | null {
  const lines = parseLines(filePath);
  if (lines.length === 0) return null;

  let id = fileName.replace('.txt', '');
  let model: string | null = null;
  let preview = '';
  let turnCount = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      if (event.type === 'system' && event.subtype === 'init' && !model) {
        if (event.session_id) id = event.session_id;
        model = event.model || null;
      }

      if (event.type === 'result') {
        turnCount++;
        if (event.result && !preview) {
          preview = event.result.slice(0, 120);
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  const stat = statSync(filePath);

  return {
    id,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    preview: preview || '(No response)',
    turnCount,
    model,
  };
}

function parseSessionHistory(filePath: string): SessionHistoryMessage[] {
  const lines = parseLines(filePath);
  const messages: SessionHistoryMessage[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      if (event.type === 'result' && event.result) {
        messages.push({ role: 'assistant', content: event.result });
      }
    } catch {
      // skip malformed lines
    }
  }

  return messages;
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('id');

    if (sessionId) {
      const filePath = join(SESSIONS_DIR, `${sessionId}.txt`);
      try {
        statSync(filePath);
      } catch {
        return createErrorResponse('Session not found', 'NotFound', 404);
      }

      const messages = parseSessionHistory(filePath);
      const history: SessionHistory = { id: sessionId, messages };
      return NextResponse.json(history);
    }

    let files: string[];
    try {
      files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.txt'));
    } catch {
      return NextResponse.json([]);
    }

    const sessions: SessionSummary[] = [];

    for (const file of files) {
      const filePath = join(SESSIONS_DIR, file);
      const summary = parseSessionSummary(filePath, file);
      if (summary) sessions.push(summary);
    }

    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json(sessions);
  } catch (err: any) {
    return createErrorResponse(err.message || 'Failed to list sessions', 'InternalServerError', 500);
  }
}
