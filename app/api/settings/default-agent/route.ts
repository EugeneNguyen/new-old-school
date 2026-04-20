import { NextResponse } from 'next/server';
import { readDefaultAgent, writeDefaultAgent, type DefaultAgentConfig } from '@/lib/settings';
import { hasAdapter } from '@/lib/agent-adapter';

export const runtime = 'nodejs';

const ADAPTER_SLUG_REGEX = /^[a-z][a-z0-9_-]*$/;

function validateAdapter(adapter: string | null | undefined): string | null {
  if (adapter === null || adapter === undefined || adapter === '') {
    return null; // clear semantics
  }
  if (typeof adapter !== 'string') {
    return 'adapter must be a string, null, or empty';
  }
  if (!ADAPTER_SLUG_REGEX.test(adapter)) {
    return 'adapter must be a lowercase ASCII slug (e.g. "claude", "anthropic")';
  }
  return null;
}

export async function GET() {
  try {
    const config = readDefaultAgent();
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const adapterInput = input.adapter;
  const modelInput = input.model;

  // Validate adapter if provided
  const adapterValidationError = validateAdapter(adapterInput as string | null | undefined);
  if (adapterValidationError) {
    return NextResponse.json({ error: adapterValidationError }, { status: 400 });
  }

  // Validate model can be null or string (no format restrictions)
  if (modelInput !== undefined && modelInput !== null && typeof modelInput !== 'string') {
    return NextResponse.json({ error: 'model must be a string or null' }, { status: 400 });
  }

  try {
    const updates: Partial<DefaultAgentConfig> = {};
    if (adapterInput !== undefined) {
      updates.adapter = adapterInput === '' ? null : (adapterInput as string);
    }
    if (modelInput !== undefined) {
      updates.model = modelInput === '' ? null : (modelInput as string);
    }

    // If adapter is being set to a non-null value, validate it exists
    if (updates.adapter && !hasAdapter(updates.adapter)) {
      // Allow it but the UI will warn the user (AC #5)
    }

    writeDefaultAgent(updates);
    const result = readDefaultAgent();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}