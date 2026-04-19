import { NextResponse } from 'next/server';
import { getAdapter, hasAdapter } from '@/lib/agent-adapter';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    if (!hasAdapter(name)) {
      return NextResponse.json({ error: 'unknown adapter' }, { status: 404 });
    }
    const adapter = getAdapter(name);
    const models = await adapter.listModels();
    return NextResponse.json({ models });
  } catch (error) {
    console.error('Error listing adapter models:', error);
    return createErrorResponse('Failed to list adapter models');
  }
}
