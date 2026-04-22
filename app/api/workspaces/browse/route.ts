import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { resolveWorkspaceRoot } from '@/lib/workspace-context';
import { withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BrowseEntry {
  name: string;
  absolutePath: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  home: string;
}

async function enforceWorkspaceSandbox(rawPath: string, workspaceRoot: string): Promise<{ ok: true; resolved: string } | { ok: false; response: NextResponse }> {
  if (rawPath.includes('\0')) {
    return { ok: false, response: createErrorResponse('path must not contain NUL', 'ValidationError', 400) };
  }
  if (!path.isAbsolute(rawPath)) {
    return { ok: false, response: createErrorResponse('path must be absolute', 'ValidationError', 400) };
  }
  const normalized = path.normalize(rawPath);
  if (normalized.split(path.sep).includes('..')) {
    return { ok: false, response: createErrorResponse('path must not contain traversal segments', 'ValidationError', 400) };
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(normalized);
  } catch {
    return { ok: false, response: createErrorResponse('path does not exist', 'NotFound', 404) };
  }
  // Enforce workspace root sandboxing
  try {
    const wsResolved = fs.realpathSync(workspaceRoot);
    if (!resolved.startsWith(wsResolved + path.sep) && resolved !== wsResolved) {
      return { ok: false, response: createErrorResponse('Path is outside workspace root', 'ValidationError', 403) };
    }
  } catch {
    return { ok: false, response: createErrorResponse('workspace root is not accessible', 'Forbidden', 403) };
  }
  return { ok: true, resolved };
}

async function resolveStat(resolved: string): Promise<fs.Stats | { error: NextResponse }> {
  try {
    return fs.statSync(resolved);
  } catch {
    return { error: createErrorResponse('path is not accessible', 'Forbidden', 403) };
  }
}

export async function GET(req: NextRequest) {
  return withWorkspace(async () => {
    const useWorkspace = req.nextUrl.searchParams.get('workspace') === 'true';

    let workspaceRoot: string | null = null;
    if (useWorkspace) {
      workspaceRoot = await resolveWorkspaceRoot();
      if (!workspaceRoot) {
        return createErrorResponse('no active workspace set', 'ValidationError', 400);
      }
    }

    const home = os.homedir();
    let defaultPath = useWorkspace && workspaceRoot ? workspaceRoot : home;
    const rawPath = req.nextUrl.searchParams.get('path') ?? defaultPath;

    let resolvedPath: string;

    if (useWorkspace && workspaceRoot) {
      const sandbox = await enforceWorkspaceSandbox(rawPath, workspaceRoot);
      if (!sandbox.ok) return sandbox.response;
      resolvedPath = sandbox.resolved;
    } else {
      // Default validation (no sandboxing)
      if (rawPath.includes('\0')) {
        return createErrorResponse('path must not contain NUL', 'ValidationError', 400);
      }
      if (!path.isAbsolute(rawPath)) {
        return createErrorResponse('path must be absolute', 'ValidationError', 400);
      }
      const normalized = path.normalize(rawPath);
      if (normalized.split(path.sep).includes('..')) {
        return createErrorResponse('path must not contain traversal segments', 'ValidationError', 400);
      }
      try {
        resolvedPath = fs.realpathSync(rawPath);
      } catch {
        return createErrorResponse('path does not exist', 'NotFound', 404);
      }
    }

    let statResult: fs.Stats | { error: NextResponse };
    if (useWorkspace && workspaceRoot) {
      statResult = await resolveStat(resolvedPath);
    } else {
      try {
        statResult = fs.statSync(resolvedPath);
      } catch {
        return createErrorResponse('path is not accessible', 'Forbidden', 403);
      }
    }
    if ('error' in statResult) return statResult.error;

    if (!statResult.isDirectory()) {
      return createErrorResponse('path is not a directory', 'ValidationError', 400);
    }

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(resolvedPath, { withFileTypes: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to read directory';
      return createErrorResponse(message, 'InternalServerError', 500);
    }

    const entries: BrowseEntry[] = [];
    for (const d of dirents) {
      if (d.name.startsWith('.')) continue;
      const entryPath = path.join(resolvedPath, d.name);
      let isDir = d.isDirectory();
      let size: number | undefined;
      let modified: string | undefined;

      if (d.isSymbolicLink()) {
        try {
          const target = fs.realpathSync(entryPath);
          const stat = fs.statSync(target);
          isDir = stat.isDirectory();
          if (!isDir) {
            size = stat.size;
            modified = stat.mtime.toISOString();
          }
        } catch {
          continue;
        }
      } else if (d.isDirectory()) {
        // Directories have no size
      } else {
        // Regular files - get their stats
        try {
          const stat = fs.statSync(entryPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
        } catch {
          continue;
        }
      }

      entries.push({ name: d.name, absolutePath: entryPath, isDirectory: isDir, size, modified });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    const parent = path.dirname(resolvedPath);
    const response: BrowseResponse = {
      path: resolvedPath,
      parent: parent === resolvedPath ? null : parent,
      entries,
      home: fs.realpathSync(home),
    };
    return NextResponse.json(response);
  });
}
