import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { resolveWorkspaceRoot, withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DeleteRequest {
  path: string;
}

async function validatePath(
  rawPath: string,
  workspaceRoot: string
): Promise<{ ok: true; resolved: string; isDirectory: boolean } | { ok: false; response: NextResponse }> {
  if (typeof rawPath !== 'string' || !rawPath) {
    return { ok: false, response: createErrorResponse('path is required', 'ValidationError', 400) };
  }
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
  try {
    const wsResolved = fs.realpathSync(workspaceRoot);
    if (!resolved.startsWith(wsResolved + path.sep) && resolved !== wsResolved) {
      return { ok: false, response: createErrorResponse('Path is outside workspace root', 'Forbidden', 403) };
    }
  } catch {
    return { ok: false, response: createErrorResponse('workspace root is not accessible', 'Forbidden', 403) };
  }

  const isDirectory = fs.statSync(resolved).isDirectory();
  return { ok: true, resolved, isDirectory };
}

export async function DELETE(req: NextRequest) {
  return withWorkspace(async () => {
    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no active workspace set', 'ValidationError', 400);
    }

    // Parse request body
    let body: DeleteRequest;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse('invalid JSON body', 'ValidationError', 400);
    }

    const { path: rawPath } = body;

    // Validate path
    const sandbox = await validatePath(rawPath, workspaceRoot);
    if (!sandbox.ok) return sandbox.response;
    const resolvedPath = sandbox.resolved;

    // Delete the item (file or directory recursively)
    try {
      fs.rmSync(resolvedPath, { recursive: true, force: false });
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'EBUSY') {
        return createErrorResponse('The file or folder is currently in use', 'ConflictError', 409);
      }
      if (nodeErr.code === 'EPERM') {
        return createErrorResponse('Permission denied', 'Forbidden', 403);
      }
      if (nodeErr.code === 'ENOENT') {
        return createErrorResponse('path does not exist', 'NotFound', 404);
      }
      const message = nodeErr.message ?? 'Failed to delete item';
      return createErrorResponse(message, 'InternalError', 500);
    }

    return NextResponse.json({ ok: true, deleted: resolvedPath });
  });
}
