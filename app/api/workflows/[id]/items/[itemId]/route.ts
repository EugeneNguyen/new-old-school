import { NextResponse } from 'next/server';
import {
  readItem,
  readStages,
  updateItemMeta,
  workflowExists,
  type ItemMetaPatch,
} from '@/lib/workflow-store';
import { triggerStagePipeline } from '@/lib/stage-pipeline';
import { autoAdvanceIfEligible } from '@/lib/auto-advance';
import { ItemStatus } from '@/types/workflow';
import { createErrorResponse } from '@/app/api/utils/errors';
import type { ActivityActor } from '@/lib/activity-log';

const VALID_STATUSES: ItemStatus[] = ['Todo', 'In Progress', 'Done', 'Failed'];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    const item = readItem(id, itemId);
    if (!item) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error reading workflow item:', error);
    return createErrorResponse('Failed to read item');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const actor = ((req.headers.get('x-nos-actor') as ActivityActor) ?? 'ui');
    const { id, itemId } = await params;
    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    const body = (await req.json()) as Record<string, unknown>;
    const patch: ItemMetaPatch = { actor };

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        return createErrorResponse('"title" must be a string', 'BadRequest', 400);
      }
      patch.title = body.title;
    }

    if (body.stage !== undefined) {
      if (typeof body.stage !== 'string' || !body.stage) {
        return createErrorResponse('"stage" must be a non-empty string', 'BadRequest', 400);
      }
      const stages = readStages(id);
      if (!stages.some((s) => s.name === body.stage)) {
        return createErrorResponse(`Unknown stage '${body.stage}'`, 'BadRequest', 400);
      }
      patch.stage = body.stage;
    }

    if (body.status !== undefined) {
      if (
        typeof body.status !== 'string' ||
        !VALID_STATUSES.includes(body.status as ItemStatus)
      ) {
        return createErrorResponse(
          `"status" must be one of ${VALID_STATUSES.join(', ')}`,
          'BadRequest',
          400
        );
      }
      patch.status = body.status as ItemStatus;
    }

    if (body.comments !== undefined) {
      if (!Array.isArray(body.comments) || !body.comments.every((c) => typeof c === 'string')) {
        return createErrorResponse('"comments" must be an array of strings', 'BadRequest', 400);
      }
      patch.comments = body.comments;
    }

    if (Object.keys(patch).length === 0) {
      return createErrorResponse('No recognized fields in request body', 'BadRequest', 400);
    }

    const priorStatus = readItem(id, itemId)?.status;

    const updated = updateItemMeta(id, itemId, patch);
    if (!updated) {
      return createErrorResponse(`Item '${itemId}' not found`, 'NotFound', 404);
    }
    if (patch.stage !== undefined) {
      const afterPipeline = await triggerStagePipeline(id, itemId);
      return NextResponse.json(afterPipeline ?? updated);
    }

    if (patch.status === 'Done' && priorStatus !== 'Done') {
      const advanced = await autoAdvanceIfEligible(id, itemId);
      if (advanced) return NextResponse.json(advanced);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating workflow item:', error);
    return createErrorResponse('Failed to update item');
  }
}
