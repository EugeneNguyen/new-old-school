import { NextResponse } from 'next/server';

export type ApiError = {
  error: string;
  message: string;
  code: number;
  timestamp: string;
};

export function createErrorResponse(message: string, error = 'InternalServerError', code = 500): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error,
      message,
      code,
      timestamp: new Date().toISOString(),
    },
    { status: code },
  );
}
