import { NextResponse } from 'next/server';
import type { StageError } from '@/lib/workflow-store';
import { createErrorResponse } from './errors';

export function mapStageError(error: StageError, context: string): NextResponse {
  switch (error.code) {
    case 'DUPLICATE':
      return createErrorResponse(error.message, 'ConflictError', 409);
    case 'INVALID_NAME':
      return createErrorResponse(error.message, 'ValidationError', 400);
    case 'NOT_FOUND':
      return createErrorResponse(error.message, 'NotFound', 404);
    case 'SET_MISMATCH':
      return createErrorResponse(error.message, 'ConflictError', 409);
    case 'HAS_ITEMS':
      return NextResponse.json(
        { error: error.message, itemCount: error.itemCount },
        { status: 409 }
      );
    case 'LAST_STAGE':
      return createErrorResponse(error.message, 'BadRequest', 400);
    default:
      console.error(`Error in ${context}:`, error);
      return createErrorResponse(`Failed to ${context.toLowerCase()}`);
  }
}
