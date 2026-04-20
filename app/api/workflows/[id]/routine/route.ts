import { NextResponse } from 'next/server';
import { workflowExists } from '@/lib/workflow-store';
import { readRoutineConfig, writeRoutineConfig, validateCronExpression } from '@/lib/routine-scheduler';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }
      const config = readRoutineConfig(id);
      return NextResponse.json(config ?? { enabled: false, cron: '' });
    } catch (error) {
      console.error('Error reading routine config:', error);
      return createErrorResponse('Failed to read routine config');
    }
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { id } = await params;
      if (!workflowExists(id)) {
        return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
      }

      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return createErrorResponse('Invalid JSON body', 'ValidationError', 400);
      }

      if (typeof body.enabled !== 'boolean') {
        return createErrorResponse('"enabled" must be a boolean', 'ValidationError', 400);
      }

      if (typeof body.cron !== 'string') {
        return createErrorResponse('"cron" must be a string', 'ValidationError', 400);
      }

      if (body.enabled && body.cron.trim() && !validateCronExpression(body.cron.trim())) {
        return createErrorResponse('Invalid cron expression', 'ValidationError', 400);
      }

      const ok = writeRoutineConfig(id, {
        enabled: body.enabled,
        cron: typeof body.cron === 'string' ? body.cron.trim() : '',
      });
      if (!ok) {
        return createErrorResponse('Failed to save routine config', 'InternalServerError', 500);
      }

      return NextResponse.json(readRoutineConfig(id));
    } catch (error) {
      console.error('Error saving routine config:', error);
      return createErrorResponse('Failed to save routine config');
    }
  });
}
