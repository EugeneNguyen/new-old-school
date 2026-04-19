import { NextResponse } from 'next/server';
import { updateStage, deleteStage, workflowExists, StageError, type StagePatch } from '@/lib/workflow-store';
import { agentExists } from '@/lib/agents-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stageName: string }> }
) {
  try {
    const { id, stageName: rawStageName } = await params;
    const stageName = decodeURIComponent(rawStageName);

    if (!workflowExists(id)) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch: StagePatch = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return createErrorResponse('"name" must be a non-empty string', 'BadRequest', 400);
      }
      patch.name = body.name;
    }

    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== 'string') {
        return createErrorResponse('"description" must be a string or null', 'BadRequest', 400);
      }
      patch.description = (body.description as string | null) ?? null;
    }

    if (body.prompt !== undefined) {
      if (body.prompt !== null && typeof body.prompt !== 'string') {
        return createErrorResponse('"prompt" must be a string or null', 'BadRequest', 400);
      }
      patch.prompt = (body.prompt as string | null) ?? null;
    }

    if (body.autoAdvanceOnComplete !== undefined) {
      if (body.autoAdvanceOnComplete !== null && typeof body.autoAdvanceOnComplete !== 'boolean') {
        return createErrorResponse(
          '"autoAdvanceOnComplete" must be a boolean or null',
          'BadRequest',
          400
        );
      }
      patch.autoAdvanceOnComplete = (body.autoAdvanceOnComplete as boolean | null) ?? null;
    }

    if (body.agentId !== undefined) {
      if (body.agentId !== null && typeof body.agentId !== 'string') {
        return createErrorResponse('"agentId" must be a string or null', 'BadRequest', 400);
      }
      if (typeof body.agentId === 'string' && body.agentId.trim()) {
        const nextAgentId = body.agentId.trim();
        if (!agentExists(nextAgentId)) {
          return createErrorResponse(
            `Agent '${nextAgentId}' not found`,
            'BadRequest',
            400
          );
        }
        patch.agentId = nextAgentId;
      } else {
        patch.agentId = null;
      }
    }

    if (body.maxDisplayItems !== undefined) {
      const raw = body.maxDisplayItems;
      if (raw === null) {
        patch.maxDisplayItems = null;
      } else if (
        typeof raw === 'number' &&
        Number.isFinite(raw) &&
        Number.isInteger(raw) &&
        raw >= 0
      ) {
        patch.maxDisplayItems = raw === 0 ? null : raw;
      } else {
        return createErrorResponse(
          '"maxDisplayItems" must be a non-negative integer or null',
          'BadRequest',
          400
        );
      }
    }

    if (Object.keys(patch).length === 0) {
      return createErrorResponse('No recognized fields in request body', 'BadRequest', 400);
    }

    const result = updateStage(id, stageName, patch);
    if (!result) {
      return createErrorResponse(
        `Unable to update stage '${stageName}' (not found or duplicate name)`,
        'BadRequest',
        400
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating workflow stage:', error);
    return createErrorResponse('Failed to update stage');
  }
}
