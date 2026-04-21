import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { getProjectRoot } from '@/lib/project-root';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function sessionsDir(): string {
  return join(getProjectRoot(), '.claude', 'sessions');
}

function ensureSessionsDir() {
  mkdirSync(sessionsDir(), { recursive: true });
}

function getNosAgentPrompt(): string {
  const promptPath = join(getProjectRoot(), '.nos', 'nos-agent-prompt.md');
  try {
    return readFileSync(promptPath, 'utf-8');
  } catch {
    return '# NOS Agent\n\nYou are a read-only assistant for workflow items.';
  }
}

function buildPrompt(systemPrompt: string, messages: ChatMessage[], workflowId?: string, itemId?: string): string {
  const contextSection = [
    '# Context',
    '',
    workflowId ? `Current workflow: \`.nos/workflows/${workflowId}/\`` : '(No workflow selected)',
    itemId ? `Current item: \`.nos/workflows/${workflowId}/items/${itemId}/\`` : '(No item selected)',
    '',
  ].join('\n');

  const conversationSection = [
    '# Conversation',
    '',
    ...messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
    '',
    'Assistant: ',
  ].join('\n');

  return [systemPrompt, contextSection, conversationSection].join('\n\n');
}

export async function POST(request: NextRequest) {
  return withWorkspace(async () => {
    try {
      const { messages, workflowId, itemId } = await request.json() as {
        messages: ChatMessage[];
        workflowId?: string;
        itemId?: string;
      };

      if (!messages || !Array.isArray(messages)) {
        return createErrorResponse('messages array is required', 'BadRequest', 400);
      }

      const systemPrompt = getNosAgentPrompt();
      const prompt = buildPrompt(systemPrompt, messages, workflowId, itemId);

      ensureSessionsDir();

      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
      ];

      const child = spawn('claude', args, {
        cwd: getProjectRoot(),
        env: { ...process.env },
      });

      child.stdin.write(prompt);
      child.stdin.end();

      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;

          function closeController() {
            if (closed) return;
            closed = true;
            controller.close();
          }

          child.stdout.on('data', (chunk: Buffer) => {
            if (closed) return;
            const text = chunk.toString();
            for (const line of text.split('\n')) {
              if (!line.trim()) continue;
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
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
      return createErrorResponse(err.message || 'Failed to start NOS Agent session', 'InternalServerError', 500);
    }
  });
}
