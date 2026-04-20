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

  const homeReal = fs.realpathSync(home);
  const resolvedWithSep = resolved + path.sep;
  const homeWithSep = homeReal + path.sep;
  if (resolved !== homeReal && !resolvedWithSep.startsWith(homeWithSep)) {
    return createErrorResponse('path must be inside your home directory', 'Forbidden', 403);
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
  } catch (err: any) {
    return createErrorResponse(err?.message ?? 'Failed to read directory', 'InternalServerError', 500);
  }

  const entries: BrowseEntry[] = [];
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    let isDir = d.isDirectory();
    if (d.isSymbolicLink()) {
      try {
        const target = fs.realpathSync(path.join(resolved, d.name));
        const targetWithSep = target + path.sep;
        if (target !== homeReal && !targetWithSep.startsWith(homeWithSep)) continue;
        isDir = fs.statSync(target).isDirectory();
      } catch {
        continue;
      }
    }
    if (!isDir) continue;
    entries.push({ name: d.name, absolutePath: path.join(resolved, d.name) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const parent = resolved === homeReal ? null : path.dirname(resolved);
  const response: BrowseResponse = {
    path: resolved,
    parent,
    entries,
    home: homeReal,
  };
  return NextResponse.json(response);
}
