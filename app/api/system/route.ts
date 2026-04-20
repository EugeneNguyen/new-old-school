import { NextResponse } from 'next/server';
import { withWorkspace } from '@/lib/workspace-context';

export async function GET() {
  return withWorkspace(async () => {
    return NextResponse.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      message: 'Welcome to the nos internal tools API'
    });
  });
}
