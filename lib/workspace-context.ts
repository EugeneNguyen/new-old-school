import { cookies } from 'next/headers';
import { runWithProjectRoot, getProjectRoot } from '@/lib/project-root';
import { readWorkspace } from '@/lib/workspace-store';

export const WORKSPACE_COOKIE = 'nos_workspace';

export async function resolveWorkspaceRoot(): Promise<string | null> {
  try {
    const store = await cookies();
    const id = store.get(WORKSPACE_COOKIE)?.value;
    if (!id) return null;
    const ws = readWorkspace(id);
    if (!ws) return null;
    return ws.absolutePath;
  } catch {
    return null;
  }
}

export async function withWorkspace<T>(handler: () => Promise<T> | T): Promise<T> {
  const root = await resolveWorkspaceRoot();
  if (!root) return await Promise.resolve(handler());
  return await runWithProjectRoot(root, async () => await Promise.resolve(handler()));
}

export async function requireWorkspaceRoot(): Promise<string> {
  const root = await resolveWorkspaceRoot();
  return root ?? getProjectRoot();
}
