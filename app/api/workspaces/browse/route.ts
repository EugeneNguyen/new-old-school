import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';

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

export async function GET(req: NextRequest) {
  const home = os.homedir();
  const rawPath = req.nextUrl.searchParams.get('path') ?? home;

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

  let resolved: string;
  try {
    resolved = fs.realpathSync(normalized);
  } catch {
    return createErrorResponse('path does not exist', 'NotFound', 404);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return createErrorResponse('path is not accessible', 'Forbidden', 403);
  }
  if (!stat.isDirectory()) {
    return createErrorResponse('path is not a directory', 'ValidationError', 400);
  }

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read directory';
    return createErrorResponse(message, 'InternalServerError', 500);
  }

  const entries: BrowseEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    const entryPath = path.join(resolved, d.name);
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

  const parent = path.dirname(resolved);
  const response: BrowseResponse = {
    path: resolved,
    parent: parent === resolved ? null : parent,
    entries,
    home: fs.realpathSync(home),
  };
  return NextResponse.json(response);
}
