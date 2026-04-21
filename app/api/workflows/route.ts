import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Workflow } from '@/types/workflow';
import { getProjectRoot } from '@/lib/project-root';
import { createWorkflow, workflowExists } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

const ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PREFIX_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;

interface CreateBody {
  id?: unknown;
  name?: unknown;
  idPrefix?: unknown;
}

export async function GET() {
  return withWorkspace(async () => {
  try {
    const workflowsDir = path.join(getProjectRoot(), '.nos', 'workflows');

    if (!fs.existsSync(workflowsDir)) {
      return NextResponse.json([]);
    }

    const folders = fs.readdirSync(workflowsDir);
    const workflows: Workflow[] = [];

    for (const folder of folders) {
      if (folder.startsWith('.') || !fs.statSync(path.join(workflowsDir, folder)).isDirectory()) {
        continue;
      }

      const configPath = path.join(workflowsDir, folder, 'config.json');
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          workflows.push({
            id: folder,
            name: config.name || folder,
            idPrefix: config.idPrefix || ''
          });
        } catch (e) {
          console.error(`Error parsing config.json for workflow ${folder}:`, e);
        }
      }
    }

    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return createErrorResponse('Failed to fetch workflows');
  }
  });
}

export async function POST(req: Request) {
  return withWorkspace(async () => {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
  }

  const rawId = typeof body.id === 'string' ? body.id.trim() : '';
  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  const rawPrefix = typeof body.idPrefix === 'string' ? body.idPrefix.trim() : '';

  if (!rawId) return createErrorResponse('id is required', 'ValidationError', 400);
  if (!rawName) return createErrorResponse('name is required', 'ValidationError', 400);
  if (!rawPrefix) return createErrorResponse('idPrefix is required', 'ValidationError', 400);
  if (!ID_REGEX.test(rawId)) {
    return createErrorResponse(
      'id must match ^[a-z0-9][a-z0-9_-]{0,63}$ (lowercase alphanumeric, dash, underscore, starts with letter or digit)',
      'ValidationError',
      400
    );
  }
  if (!PREFIX_REGEX.test(rawPrefix)) {
    return createErrorResponse(
      'idPrefix must match ^[A-Z0-9][A-Z0-9_-]{0,15}$ (uppercase alphanumeric, dash, underscore, starts with uppercase letter or digit)',
      'ValidationError',
      400
    );
  }
  if (rawName.length > 128) {
    return createErrorResponse('name must be 128 characters or fewer', 'ValidationError', 400);
  }

  if (workflowExists(rawId)) {
    return createErrorResponse('A workflow with this ID already exists', 'Conflict', 409);
  }

  const ok = createWorkflow(rawId, { name: rawName, idPrefix: rawPrefix });
  if (!ok) {
    return createErrorResponse('Failed to create workflow', 'InternalError', 500);
  }

  return NextResponse.json({ id: rawId, name: rawName, idPrefix: rawPrefix }, { status: 201 });
  });
}
