import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { streamRegistry } from '@/lib/stream-registry';
import { getProjectRoot } from '@/lib/project-root';
import { readDefaultAgent } from '@/lib/settings';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sessionsDir(): string {
  return join(getProjectRoot(), '.claude', 'sessions');
}

function ensureSessionsDir() {
  mkdirSync(sessionsDir(), { recursive: true });
}

function extractSessionId(line: string): string | null {
  try {
    const event = JSON.parse(line);
    if (event.session_id) return event.session_id;
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  return withWorkspace(async () => {
  try {
    const { prompt, sessionId } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return createErrorResponse('Prompt is required', 'BadRequest', 400);
    }

    const defaultAgent = readDefaultAgent();
    const adapter = defaultAgent.adapter ?? 'claude';
    const model = defaultAgent.model;

    ensureSessionsDir();

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];

    if (model) {
      args.push('--model', model);
    }

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    const child = spawn(adapter, args, {
      cwd: getProjectRoot(),
      env: { ...process.env },
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let resolvedSessionId: string | null = sessionId || null;
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    let userPromptWritten = false;

    function getFileStream() {
      if (fileStream) return fileStream;
      if (resolvedSessionId) {
        const filePath = join(sessionsDir(), `${resolvedSessionId}.txt`);
        fileStream = createWriteStream(filePath, { flags: 'a' });
        return fileStream;
      }
      return null;
    }

    function writeUserPrompt() {
      if (userPromptWritten) return;
      const fs = getFileStream();
      if (fs) {
        const userEvent = JSON.stringify({ type: 'user_prompt', content: prompt });
        fs.write(userEvent + '\n');
        userPromptWritten = true;
      }
    }

    if (resolvedSessionId) {
      writeUserPrompt();
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let closed = false;

        function closeController() {
          if (closed) return;
          closed = true;
          if (fileStream) fileStream.end();
          if (resolvedSessionId) streamRegistry.deregister(resolvedSessionId);
          controller.close();
        }

        child.stdout.on('data', (chunk: Buffer) => {
          if (closed) return;
          const text = chunk.toString();
          for (const line of text.split('\n')) {
            if (!line.trim()) continue;

            if (!resolvedSessionId) {
              resolvedSessionId = extractSessionId(line);
              if (resolvedSessionId) {
                streamRegistry.register(resolvedSessionId, child);
                writeUserPrompt();
              }
            }

            const fs = getFileStream();
            if (fs) fs.write(line + '\n');

            if (resolvedSessionId) {
              streamRegistry.incrementLineCount(resolvedSessionId);
              streamRegistry.notifyListeners(resolvedSessionId, line);
            }

            if (closed) return;
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        });

        child.stderr.on('data', (chunk: Buffer) => {
          if (closed) return;
          const errMsg = JSON.stringify({ type: 'error', message: chunk.toString() });
          controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
        });

        child.on('close', () => {
          if (!closed) {
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          }
          closeController();
        });

        child.on('error', (err) => {
          if (!closed) {
            const errMsg = JSON.stringify({ type: 'error', message: err.message });
            controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
          }
          closeController();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return createErrorResponse(err.message || 'Failed to start chat session', 'InternalServerError', 500);
  }
  });
}
