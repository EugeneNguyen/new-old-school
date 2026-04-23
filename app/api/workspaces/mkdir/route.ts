import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { createErrorResponse } from '@/app/api/utils/errors';
import { resolveWorkspaceRoot, withWorkspace } from '@/lib/workspace-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface MkdirRequest {
  path: string;
  name: string;
}

function sanitizeFolderName(name: string): string | null {
  if (typeof name !== 'string') return null;
  // Strip NUL bytes
  let sanitized = name.replace(/\0/g, '');
  // Strip leading/trailing whitespace
  sanitized = sanitized.trim();
  // Strip path separators
  sanitized = sanitized.replace(/[/\\]/g, '');
  // Reject empty after sanitization
  if (!sanitized) return null;
  // Reject . and ..
  if (sanitized === '.' || sanitized === '..') return null;
  return sanitized;
}

async function validatePath(
  rawPath: string,
  workspaceRoot: string
): Promise<{ ok: true; resolved: string } | { ok: false; response: NextResponse }> {
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
      return { ok: false, response: createErrorResponse('Path is outside workspace root', 'ValidationError', 403) };
    }
  } catch {
    return { ok: false, response: createErrorResponse('workspace root is not accessible', 'Forbidden', 403) };
  }
  return { ok: true, resolved };
}

export async function POST(req: NextRequest) {
  return withWorkspace(async () => {
    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no active workspace set', 'ValidationError', 400);
    }

    // Parse and validate request body
    let body: MkdirRequest;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse('invalid JSON body', 'ValidationError', 400);
    }

    const { path: rawPath, name: rawName } = body;

    // Validate path
    const sandbox = await validatePath(rawPath, workspaceRoot);
    if (!sandbox.ok) return sandbox.response;
    const resolvedPath = sandbox.resolved;

    // Validate and sanitize name
    const sanitizedName = sanitizeFolderName(rawName);
    if (!sanitizedName) {
      return createErrorResponse('name is required and must not be empty or contain path separators', 'ValidationError', 400);
    }

    // Check for case-insensitive duplicate
    try {
      const dirents = fs.readdirSync(resolvedPath, { withFileTypes: true });
      const lowerName = sanitizedName.toLowerCase();
      for (const d of dirents) {
        if (d.isDirectory() && d.name.toLowerCase() === lowerName) {
          return createErrorResponse(`A folder named "${sanitizedName}" already exists in this directory`, 'ConflictError', 409);
        }
      }
    } catch {
      return createErrorResponse('failed to read directory contents', 'InternalError', 500);
    }

    // Create the directory
    const newFolderPath = path.join(resolvedPath, sanitizedName);
    try {
      fs.mkdirSync(newFolderPath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      return createErrorResponse(message, 'InternalError', 500);
    }

    return NextResponse.json(
      {
        name: sanitizedName,
        absolutePath: newFolderPath,
        isDirectory: true,
      },
      { status: 201 }
    );
  });
}