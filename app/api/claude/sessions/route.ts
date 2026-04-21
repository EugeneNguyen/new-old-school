import { NextRequest, NextResponse } from 'next/server';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { streamRegistry } from '@/lib/stream-registry';
import { getProjectRoot } from '@/lib/project-root';
import { withWorkspace } from '@/lib/workspace-context';
import type { SessionSummary, SessionHistory, SessionHistoryMessage } from '@/types/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionsDir(): string {
  return join(getProjectRoot(), '.claude', 'sessions');
}

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
    isRunning: streamRegistry.getStatus(id) === 'streaming',
  };
}

function parseSessionHistory(filePath: string): SessionHistoryMessage[] {
  const lines = parseLines(filePath);
  const messages: SessionHistoryMessage[] = [];
  const toolResults = new Map<string, string>();

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      if (event.type === 'tool_result' && event.tool_use_id) {
        toolResults.set(event.tool_use_id, event.content || '');
      }
    } catch {
      // skip malformed lines
    }
  }

  for (const line of lines) {
    try {
      const event = JSON.parse(line);

      if (event.type === 'user_prompt' && event.content) {
        messages.push({ role: 'user', content: event.content });
      }

      if (event.type === 'result' && event.result) {
        const toolUses: any[] = [];
        if (event.message?.content && Array.isArray(event.message.content)) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use' && block.name !== 'AskUserQuestion') {
              const result = toolResults.get(block.id);
              toolUses.push({
                id: block.id,
                name: block.name,
                input: block.input || {},
                result: result || null,
                status: result ? 'completed' : 'pending',
              });
            }
          }
        }

        const message: SessionHistoryMessage = {
          role: 'assistant',
          content: event.result,
        };
        if (toolUses.length > 0) {
          message.toolUses = toolUses;
        }
        messages.push(message);
      }
    } catch {
      // skip malformed lines
    }
  }

  return messages;
}

export async function GET(request: NextRequest) {
  return withWorkspace(async () => {
  try {
    const sessionId = request.nextUrl.searchParams.get('id');

    if (sessionId) {
      const filePath = join(sessionsDir(), `${sessionId}.txt`);
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
      files = readdirSync(sessionsDir()).filter(f => f.endsWith('.txt'));
    } catch {
      return NextResponse.json([]);
    }

    const sessions: SessionSummary[] = [];

    for (const file of files) {
      const filePath = join(sessionsDir(), file);
      const summary = parseSessionSummary(filePath, file);
      if (summary) sessions.push(summary);
    }

    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json(sessions);
  } catch (err: any) {
    return createErrorResponse(err.message || 'Failed to list sessions', 'InternalServerError', 500);
  }
  });
}
