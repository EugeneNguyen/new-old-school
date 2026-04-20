import { NextResponse } from 'next/server';
import { listAdapters } from '@/lib/agent-adapter';
import { createErrorResponse } from '@/app/api/utils/errors';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET() {
  return withWorkspace(async () => {
    try {
      return NextResponse.json({ adapters: listAdapters() });
    } catch (error) {
      console.error('Error listing adapters:', error);
      return createErrorResponse('Failed to list adapters');
    }
  });
}
