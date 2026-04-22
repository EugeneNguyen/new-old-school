import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PREVIEWABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.css', '.html',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
]);

const MAX_PREVIEW_LINES = 100;

interface PreviewResponse {
  name: string;
  path: string;
  size: number;
  modified: string;
  content: string | null;
  previewable: boolean;
  truncated: boolean;
}

export async function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get('path');

  if (!rawPath) {
    return createErrorResponse('path is required', 'ValidationError', 400);
  }

  if (rawPath.includes('\0')) {
    return createErrorResponse('path must not contain NUL', 'ValidationError', 400);
  }

  if (!path.isAbsolute(rawPath)) {
    return createErrorResponse('path must be absolute', 'ValidationError', 400);
  }

  if (rawPath.split(path.sep).includes('..')) {
    return createErrorResponse('path must not contain traversal segments', 'ValidationError', 400);
  }

  let resolved: string;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch {
    return createErrorResponse('path does not exist', 'NotFound', 404);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return createErrorResponse('path is not accessible', 'Forbidden', 403);
  }

  if (stat.isDirectory()) {
    return createErrorResponse('path is a directory, not a file', 'ValidationError', 400);
  }

  const ext = path.extname(resolved).toLowerCase();
  const previewable = PREVIEWABLE_EXTENSIONS.has(ext);

  let content: string | null = null;
  let truncated = false;

  if (previewable) {
    try {
      const fileContent = fs.readFileSync(resolved, 'utf-8');
      const lines = fileContent.split('\n');
      if (lines.length > MAX_PREVIEW_LINES) {
        content = lines.slice(0, MAX_PREVIEW_LINES).join('\n');
        truncated = true;
      } else {
        content = fileContent;
      }
    } catch {
      // Failed to read file content - still return metadata
    }
  }

  const response: PreviewResponse = {
    name: path.basename(resolved),
    path: resolved,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    content,
    previewable,
    truncated,
  };

  return NextResponse.json(response);
}
