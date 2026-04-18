import { NextResponse } from 'next/server';
import { readWorkflowDetail } from '@/lib/workflow-store';
import { createErrorResponse } from '@/app/api/utils/errors';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const detail = readWorkflowDetail(id);
    if (!detail) {
      return createErrorResponse(`Workflow '${id}' not found`, 'NotFound', 404);
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error('Error reading workflow detail:', error);
    return createErrorResponse('Failed to read workflow');
  }
}
