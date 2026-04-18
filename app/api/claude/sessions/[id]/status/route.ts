import { NextRequest, NextResponse } from 'next/server';
import { streamRegistry } from '@/lib/stream-registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const status = streamRegistry.getStatus(id);
  return NextResponse.json({ streaming: status === 'streaming' });
}
