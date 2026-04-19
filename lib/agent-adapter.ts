import { spawn } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { join } from 'path';

export interface AgentAdapter {
  name: string;
  startSession(input: {
    prompt: string;
    cwd?: string;
    model?: string;
  }): Promise<{ sessionId: string }>;
}

const SESSIONS_DIR = join(process.cwd(), '.claude', 'sessions');
const SESSION_ID_TIMEOUT_MS = 10_000;

function ensureSessionsDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function extractSessionId(line: string): string | null {
  try {
    const event = JSON.parse(line);
    if (event && typeof event.session_id === 'string') return event.session_id;
  } catch {}
  return null;
}

export const claudeAdapter: AgentAdapter = {
  name: 'claude',
  startSession({ prompt, cwd, model }) {
    return new Promise((resolve, reject) => {
      ensureSessionsDir();

      const args = ['-p', '--output-format', 'stream-json', '--verbose'];
      if (typeof model === 'string' && model.trim()) {
        args.push('--model', model.trim());
      }
      args.push('--dangerously-skip-permissions');

      const child = spawn('claude', args, {
        cwd: cwd ?? process.cwd(),
        env: { ...process.env },
      });

      child.stdin.write(prompt);
      child.stdin.end();

      let resolvedSessionId: string | null = null;
      let fileStream: ReturnType<typeof createWriteStream> | null = null;
      let stdoutBuffer = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill(); } catch {}
        reject(new Error('Timed out waiting for agent session_id'));
      }, SESSION_ID_TIMEOUT_MS);

      function openFileStream(sessionId: string) {
        const filePath = join(SESSIONS_DIR, `${sessionId}.txt`);
        fileStream = createWriteStream(filePath, { flags: 'a' });
        fileStream.write(JSON.stringify({ type: 'user_prompt', content: prompt }) + '\n');
      }

      function handleLine(line: string) {
        if (!line.trim()) return;

        if (!resolvedSessionId) {
          const id = extractSessionId(line);
          if (id) {
            resolvedSessionId = id;
            openFileStream(id);
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve({ sessionId: id });
            }
          }
        }

        if (fileStream) fileStream.write(line + '\n');
      }

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        let newlineIdx: number;
        while ((newlineIdx = stdoutBuffer.indexOf('\n')) !== -1) {
          const line = stdoutBuffer.slice(0, newlineIdx);
          stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
          handleLine(line);
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (fileStream) {
          fileStream.write(
            JSON.stringify({ type: 'error', message: chunk.toString() }) + '\n'
          );
        }
      });

      child.on('close', () => {
        if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
        if (fileStream) fileStream.end();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error('Agent exited before emitting session_id'));
        }
      });

      child.on('error', (err) => {
        if (fileStream) fileStream.end();
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      child.unref();
    });
  },
};

export function getDefaultAdapter(): AgentAdapter {
  return claudeAdapter;
}
