import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    message: 'Welcome to the nos internal tools API'
  });
}
