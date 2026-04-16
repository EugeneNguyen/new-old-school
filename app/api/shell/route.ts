import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createErrorResponse } from '@/app/api/utils/errors';

const execPromise = promisify(exec);

// Safety guards: whitelist of allowed commands
const ALLOWED_COMMANDS = new Set([
  'ls',
  'pwd',
  'whoami',
  'date',
  'git status',
  'git log',
  'npm list',
]);

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();

    if (!command) {
      return createErrorResponse('Command is required', 'BadRequest', 400);
    }

    // Basic safety check: only allow commands starting with whitelisted ones
    const baseCommand = command.split(' ')[0];
    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return createErrorResponse(`Command '${baseCommand}' is not allowed for security reasons`, 'Forbidden', 403);
    }

    const { stdout, stderr } = await execPromise(command);

    if (stderr) {
      return NextResponse.json({
        stdout,
        stderr,
        status: 'error',
      });
    }

    return NextResponse.json({
      stdout,
      status: 'success',
    });
  } catch (err: any) {
    return createErrorResponse(err.message || 'Execution failed', 'InternalServerError', 500);
  }
}
