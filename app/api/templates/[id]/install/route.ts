import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTemplatesRoot } from '@/lib/scaffolding';
import { withWorkspace, resolveWorkspaceRoot } from '@/lib/workspace-context';
import { createErrorResponse } from '@/app/api/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function ensureActivityFile(workflowDir: string): void {
  const activityPath = path.join(workflowDir, 'activity.jsonl');
  if (!fs.existsSync(activityPath)) {
    fs.writeFileSync(activityPath, '', 'utf-8');
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
    const workspaceRoot = await resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return createErrorResponse('no_active_workspace', 'no_active_workspace', 400);
    }

    const { id } = await params;
    const templatesRoot = path.join(getTemplatesRoot(), '.nos', 'workflows');
    const templateDir = path.join(templatesRoot, id);

    if (!fs.existsSync(templateDir)) {
      return createErrorResponse('Template not found', 'NotFoundError', 404);
    }

    const configPath = path.join(templateDir, 'config.json');
    if (!fs.existsSync(configPath)) {
      return createErrorResponse('Template not found', 'NotFoundError', 404);
    }

    const workflowsDir = path.join(workspaceRoot, '.nos', 'workflows');
    const targetDir = path.join(workflowsDir, id);

    if (fs.existsSync(targetDir)) {
      return createErrorResponse('workflow_already_exists', 'workflow_already_exists', 409);
    }

    try {
      copyDirRecursive(templateDir, targetDir);
      ensureActivityFile(targetDir);
    } catch (error) {
      console.error('Error installing template:', error);
      return createErrorResponse('Failed to install template', 'InternalError', 500);
    }

    return NextResponse.json({ ok: true, workflowId: id }, { status: 201 });
  });
}