import { NextResponse } from 'next/server';
import { listAdapters } from '@/lib/agent-adapter';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function GET() {
  try {
    return NextResponse.json({ adapters: listAdapters() });
  } catch (error) {
    console.error('Error listing adapters:', error);
    return createErrorResponse('Failed to list adapters');
  }
}
