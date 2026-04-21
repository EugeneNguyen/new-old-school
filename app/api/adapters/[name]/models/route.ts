import { NextResponse } from 'next/server';
import { getAdapter, hasAdapter } from '@/lib/agent-adapter';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  return withWorkspace(async () => {
    try {
      const { name } = await params;
      if (!hasAdapter(name)) {
        return createErrorResponse('unknown adapter', 'NotFound', 404);
      }
      const adapter = getAdapter(name);
      const models = await adapter.listModels();
      return NextResponse.json({ models });
    } catch (error) {
      console.error('Error listing adapter models:', error);
      return createErrorResponse('Failed to list adapter models');
    }
  });
}
