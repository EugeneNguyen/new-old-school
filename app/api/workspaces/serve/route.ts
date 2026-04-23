import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { resolveWorkspaceRoot, withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

const MIME_TYPES: Record<string, string> = {
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

async function validatePath(rawPath: string, workspaceRoot: string): Promise<{ ok: true; resolved: string } | { ok: false; response: NextResponse }> {
  if (typeof rawPath !== 'string' || !rawPath) {
    return { ok: false, response: createErrorResponse('path is required', 'ValidationError', 400) };
  }
  if (rawPath.includes('\0')) {
    return { ok: false, response: createErrorResponse('path must not contain NUL', 'ValidationError', 400) };
  }
  if (!path.isAbsolute(rawPath)) {
    return { ok: false, response: createErrorResponse('path must be absolute', 'ValidationError', 400) };
  }
  if (rawPath.split(path.sep).includes('..')) {
    return { ok: false, response: createErrorResponse('path must not contain traversal segments', 'ValidationError', 400) };
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(rawPath);
  } catch {
    return { ok: false, response: createErrorResponse('path does not exist', 'NotFound', 404) };
  }
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

function sanitizeFilenameForHeader(name: string): string {
  const basename = path.basename(name);
  return basename
    .replace(/[\x00-\x1f]/g, '')
    .replace(/"/g, '\\"');
}

export async function GET(req: NextRequest) {
  return withWorkspace(async () => {
    const rawPath = req.nextUrl.searchParams.get('path');
    const download = req.nextUrl.searchParams.get('download') === 'true';
    if (!rawPath) {
      return createErrorResponse('path is required', 'ValidationError', 400);
    }

    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no active workspace set', 'ValidationError', 400);
    }

    const sandbox = await validatePath(rawPath, workspaceRoot);
    if (!sandbox.ok) return sandbox.response;
    const resolved = sandbox.resolved;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return createErrorResponse('path is not accessible', 'Forbidden', 403);
    }

    if (stat.isDirectory()) {
      return createErrorResponse('path is a directory, not a file', 'ValidationError', 400);
    }

    if (stat.size > MAX_FILE_SIZE) {
      return createErrorResponse(`File exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`, 'PayloadTooLarge', 413);
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    // Handle range requests for audio/video seeking
    const rangeHeader = req.headers.get('range');
    if (rangeHeader) {
      const fileHandle = fs.openSync(resolved, 'r');
      try {
        const fileSize = stat.size;
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const buffer = Buffer.alloc(chunkSize);
        fs.readSync(fileHandle, buffer, 0, chunkSize, start);

        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'X-Content-Type-Options': 'nosniff',
        };
        if (download) {
          headers['Content-Disposition'] = `attachment; filename="${sanitizeFilenameForHeader(resolved)}"`;
        }
        return new NextResponse(buffer, {
          status: 206,
          headers,
        });
      } finally {
        fs.closeSync(fileHandle);
      }
    }

    // Full file response
    const fileBuffer = fs.readFileSync(resolved);
    const fullHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };
    if (download) {
      fullHeaders['Content-Disposition'] = `attachment; filename="${sanitizeFilenameForHeader(resolved)}"`;
    }
    return new NextResponse(fileBuffer, {
      headers: fullHeaders,
    });
  });
}