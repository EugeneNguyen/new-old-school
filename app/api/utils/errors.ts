export type ApiError = {
  error: string;
  message: string;
  code: number;
  timestamp: string;
};

export function createErrorResponse(message: string, error = 'InternalServerError', code = 500) {
  const response = {
    error,
    message,
    code,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(response), {
    status: code,
    headers: { 'Content-Type': 'application/json' },
  });
}
