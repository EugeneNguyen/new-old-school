import type { ChildProcess } from 'child_process';

interface StreamEntry {
  process: ChildProcess;
  lineCount: number;
  status: 'streaming' | 'done';
  listeners: Set<(line: string) => void>;
}

const streams = new Map<string, StreamEntry>();

export const streamRegistry = {
  register(sessionId: string, process: ChildProcess) {
    streams.set(sessionId, {
      process,
      lineCount: 0,
      status: 'streaming',
      listeners: new Set(),
    });
  },

  deregister(sessionId: string) {
    const entry = streams.get(sessionId);
    if (!entry) return;
    entry.status = 'done';
    for (const cb of entry.listeners) cb('__done__');
    entry.listeners.clear();
    setTimeout(() => streams.delete(sessionId), 30_000);
  },

  incrementLineCount(sessionId: string) {
    const entry = streams.get(sessionId);
    if (entry) entry.lineCount++;
  },

  notifyListeners(sessionId: string, line: string) {
    const entry = streams.get(sessionId);
    if (!entry) return;
    for (const cb of entry.listeners) cb(line);
  },

  subscribe(sessionId: string, callback: (line: string) => void) {
    const entry = streams.get(sessionId);
    if (entry) entry.listeners.add(callback);
  },

  unsubscribe(sessionId: string, callback: (line: string) => void) {
    const entry = streams.get(sessionId);
    if (entry) entry.listeners.delete(callback);
  },

  getStatus(sessionId: string): 'streaming' | 'done' | null {
    return streams.get(sessionId)?.status ?? null;
  },

  getLineCount(sessionId: string): number {
    return streams.get(sessionId)?.lineCount ?? 0;
  },

  kill(sessionId: string): boolean {
    const entry = streams.get(sessionId);
    if (!entry) return false;
    try { entry.process.kill(); } catch {}
    return true;
  },
};
