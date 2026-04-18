import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { streamRegistry } from '@/lib/stream-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSIONS_DIR = join(process.cwd(), '.claude', 'sessions');

function ensureSessionsDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function extractSessionId(line: string): string | null {
  try {
    const event = JSON.parse(line);
    if (event.session_id) return event.session_id;
  } catch {}
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, sessionId } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return createErrorResponse('Prompt is required', 'BadRequest', 400);
    }

    ensureSessionsDir();

    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    const claude = spawn('claude', args, {
      cwd: process.cwd(),
      env: { ...process.env },
    });

    claude.stdin.write(prompt);
    claude.stdin.end();

    let resolvedSessionId = sessionId || null;
    let fileStream: ReturnType<typeof createWriteStream> | null = null;
    let userPromptWritten = false;

    function getFileStream() {
      if (fileStream) return fileStream;
      if (resolvedSessionId) {
        const filePath = join(SESSIONS_DIR, `${resolvedSessionId}.txt`);
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

        claude.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          for (const line of text.split('\n')) {
            if (!line.trim()) continue;

            if (!resolvedSessionId) {
              resolvedSessionId = extractSessionId(line);
              if (resolvedSessionId) {
                streamRegistry.register(resolvedSessionId, claude);
                writeUserPrompt();
              }
            }

            const fs = getFileStream();
            if (fs) fs.write(line + '\n');

            if (resolvedSessionId) {
              streamRegistry.incrementLineCount(resolvedSessionId);
              streamRegistry.notifyListeners(resolvedSessionId, line);
            }

            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        });

        claude.stderr.on('data', (chunk: Buffer) => {
          const errMsg = JSON.stringify({ type: 'error', message: chunk.toString() });
          controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
        });

        claude.on('close', () => {
          if (fileStream) fileStream.end();
          if (resolvedSessionId) streamRegistry.deregister(resolvedSessionId);
          controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          controller.close();
        });

        claude.on('error', (err) => {
          if (fileStream) fileStream.end();
          if (resolvedSessionId) streamRegistry.deregister(resolvedSessionId);
          const errMsg = JSON.stringify({ type: 'error', message: err.message });
          controller.enqueue(encoder.encode(`data: ${errMsg}\n\n`));
          controller.close();
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
    return createErrorResponse(err.message || 'Failed to start Claude', 'InternalServerError', 500);
  }
}
