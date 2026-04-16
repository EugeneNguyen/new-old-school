import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const { method, url } = request;

  console.log(`[${timestamp}] ${method} ${url}`);

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
