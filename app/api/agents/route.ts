import { NextResponse } from 'next/server';
import { createAgent, listAgents, SLUG_REGEX } from '@/lib/agents-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function GET() {
  try {
    const agents = listAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('Error listing agents:', error);
    return createErrorResponse('Failed to list agents');
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return createErrorResponse('Request body must be a JSON object', 'BadRequest', 400);
    }

    if (typeof body.displayName !== 'string' || !body.displayName.trim()) {
      return createErrorResponse(
        '"displayName" must be a non-empty string',
        'BadRequest',
        400
      );
    }

    if (
      body.model !== undefined &&
      body.model !== null &&
      typeof body.model !== 'string'
    ) {
      return createErrorResponse('"model" must be a string or null', 'BadRequest', 400);
    }

    if (body.prompt !== undefined && typeof body.prompt !== 'string') {
      return createErrorResponse('"prompt" must be a string', 'BadRequest', 400);
    }

    if (body.id !== undefined) {
      if (typeof body.id !== 'string' || !SLUG_REGEX.test(body.id.trim())) {
        return createErrorResponse(
          `"id" must match ${SLUG_REGEX.source}`,
          'BadRequest',
          400
        );
      }
    }

    const result = createAgent({
      displayName: body.displayName,
      model: (body.model as string | null | undefined) ?? null,
      prompt: (body.prompt as string | undefined) ?? '',
      id: body.id as string | undefined,
    });

    if ('error' in result) {
      return createErrorResponse(result.error, 'BadRequest', 400);
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating agent:', error);
    return createErrorResponse('Failed to create agent');
  }
}
