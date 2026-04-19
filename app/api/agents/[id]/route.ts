import { NextResponse } from 'next/server';
import {
  deleteAgent,
  readAgent,
  updateAgent,
  type AgentPatch,
} from '@/lib/agents-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const agent = readAgent(id);
    if (!agent) {
      return createErrorResponse(`Agent '${id}' not found`, 'NotFound', 404);
    }
    return NextResponse.json(agent);
  } catch (error) {
    console.error('Error reading agent:', error);
    return createErrorResponse('Failed to read agent');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!readAgent(id)) {
      return createErrorResponse(`Agent '${id}' not found`, 'NotFound', 404);
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return createErrorResponse('Request body must be a JSON object', 'BadRequest', 400);
    }

    const patch: AgentPatch = {};

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
        return createErrorResponse(
          '"displayName" must be a non-empty string',
          'BadRequest',
          400
        );
      }
      patch.displayName = body.displayName;
    }

    if (body.adapter !== undefined) {
      if (typeof body.adapter !== 'string' || !body.adapter.trim()) {
        return createErrorResponse('adapter is required', 'BadRequest', 400);
      }
      patch.adapter = body.adapter;
    }

    if (body.model !== undefined) {
      if (body.model !== null && typeof body.model !== 'string') {
        return createErrorResponse('"model" must be a string or null', 'BadRequest', 400);
      }
      patch.model = (body.model as string | null) ?? null;
    }

    if (body.prompt !== undefined) {
      if (typeof body.prompt !== 'string') {
        return createErrorResponse('"prompt" must be a string', 'BadRequest', 400);
      }
      patch.prompt = body.prompt;
    }

    if (Object.keys(patch).length === 0) {
      return createErrorResponse('No recognized fields in request body', 'BadRequest', 400);
    }

    const updated = updateAgent(id, patch);
    if (!updated) {
      return createErrorResponse(`Failed to update agent '${id}'`, 'BadRequest', 400);
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating agent:', error);
    return createErrorResponse('Failed to update agent');
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = deleteAgent(id);
    if (result.ok === true) {
      return new Response(null, { status: 204 });
    }
    const failure = result;
    if (failure.status === 404) {
      return createErrorResponse(`Agent '${id}' not found`, 'NotFound', 404);
    }
    const references = failure.references;
    return new Response(
      JSON.stringify({
        error: 'Conflict',
        message: `Agent '${id}' is referenced by ${references.length} stage(s)`,
        code: 409,
        timestamp: new Date().toISOString(),
        references,
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error deleting agent:', error);
    return createErrorResponse('Failed to delete agent');
  }
}
