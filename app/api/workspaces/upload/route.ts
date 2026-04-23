import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { resolveWorkspaceRoot, withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per request

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
      return { ok: false, response: createErrorResponse('Path is outside workspace root', 'Forbidden', 403) };
    }
  } catch {
    return { ok: false, response: createErrorResponse('workspace root is not accessible', 'Forbidden', 403) };
  }
  return { ok: true, resolved };
}

function sanitizeFilename(name: string): string {
  // Strip path separators, NUL bytes, and leading dots; keep only the basename
  const basename = path.basename(name);
  // Remove any remaining traversal characters
  return basename
    .replace(/\x00/g, '')           // NUL bytes
    .replace(/\.\./g, '')            // traversal segments
    .replace(/^\\+/, '')             // leading backslashes
    .replace(/^[.\s]+$/, '_')       // dot-or-space-only names
    .replace(/^\.+/, '')             // leading dots
    .replace(/[\/\\]/g, '_');       // path separators
}

export async function POST(req: NextRequest) {
  return withWorkspace(async () => {
    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no active workspace set', 'ValidationError', 400);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return createErrorResponse('failed to parse form data', 'ValidationError', 400);
    }

    const targetPath = formData.get('path');
    if (typeof targetPath !== 'string' || !targetPath) {
      return createErrorResponse('path field is required', 'ValidationError', 400);
    }

    // Validate target directory
    const sandbox = await validatePath(targetPath, workspaceRoot);
    if (!sandbox.ok) return sandbox.response;

    // Check total content length
    const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_FILE_SIZE) {
      return createErrorResponse(`Request exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`, 'PayloadTooLarge', 413);
    }

    // Collect file entries
    const files: Array<{ name: string; file: File }> = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File && value.size > 0) {
        files.push({ name: value.name, file: value });
      }
    }

    if (files.length === 0) {
      return createErrorResponse('no files provided', 'ValidationError', 400);
    }

    // Process each file
    const results: Array<{ name: string; size: number; path: string }> = [];
    const targetDir = sandbox.resolved;

    for (const { name, file } of files) {
      // Reject oversized individual files
      if (file.size > MAX_FILE_SIZE) {
        return createErrorResponse(`File "${name}" exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit`, 'PayloadTooLarge', 413);
      }

      // Sanitize filename
      const safeName = sanitizeFilename(name);
      if (!safeName) {
        return createErrorResponse(`Invalid filename: "${name}"`, 'ValidationError', 400);
      }

      const filePath = path.join(targetDir, safeName);

      // Double-check resolved path stays within workspace (defense in depth)
      const fileResolved = fs.realpathSync(filePath);
      if (!fileResolved.startsWith(workspaceRoot + path.sep) && fileResolved !== workspaceRoot) {
        return createErrorResponse(`File path resolved outside workspace: "${safeName}"`, 'Forbidden', 403);
      }

      // Write file asynchronously
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        await fs.promises.writeFile(filePath, buffer);
        results.push({ name: safeName, size: file.size, path: filePath });
      } catch (err) {
        return createErrorResponse(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`, 'ValidationError', 500);
      }
    }

    return NextResponse.json({ files: results }, { status: 200 });
  });
}