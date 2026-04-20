import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { readWorkspace } from '@/lib/workspace-store';

const storage = new AsyncLocalStorage<{ root: string }>();

let fallbackCached: string | null = null;

function fallbackRoot(): string {
  if (fallbackCached !== null) return fallbackCached;
  const fromEnv = process.env.NOS_PROJECT_ROOT;
  const root = fromEnv && fromEnv.trim() ? fromEnv : process.cwd();
  fallbackCached = path.resolve(root);
  return fallbackCached;
}

export function getProjectRoot(): string {
  const scoped = storage.getStore();
  if (scoped && scoped.root) return scoped.root;
  return fallbackRoot();
}

export function runWithProjectRoot<T>(root: string, fn: () => T): T {
  return storage.run({ root: path.resolve(root) }, fn);
}

export function resolveRootFromWorkspaceId(workspaceId: string | null | undefined): string | null {
  if (!workspaceId) return null;
  const ws = readWorkspace(workspaceId);
  if (!ws) return null;
  return ws.absolutePath;
}
