export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');

  const logPrefix = `[${new Date().toISOString()}] [uncaught]`;

  let processErrorHandlersInstalled = false;

  function installProcessErrorHandlers(): void {
    if (processErrorHandlersInstalled) return;
    processErrorHandlersInstalled = true;

    process.on('uncaughtException', (err: Error) => {
      const ts = new Date().toISOString();
      const msg = `${logPrefix} [UNCAUGHT] ${err?.message ?? String(err)}\nStack: ${err?.stack ?? '(no stack)'}`;
      try {
        const logDir = path.join(os.homedir(), '.nos', 'runtime');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'server.log'), ts + msg.slice(ts.length) + '\n');
      } catch { /* best-effort */ }
      console.error(msg);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      const ts = new Date().toISOString();
      const reasonStr = reason instanceof Error
        ? `${reason.message}\nStack: ${reason.stack}`
        : String(reason ?? 'unknown');
      const msg = `${logPrefix} [UNHANDLED] ${reasonStr}`;
      try {
        const logDir = path.join(os.homedir(), '.nos', 'runtime');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, 'server.log'), `[${ts}] [uncaught] [UNHANDLED] ${reasonStr}\n`);
      } catch { /* best-effort */ }
      console.error(msg);
    });
  }

  installProcessErrorHandlers();
  const { startHeartbeat } = await import('./lib/auto-advance-sweeper');
  try {
    fs.appendFileSync(path.join(os.homedir(), '.nos', 'runtime', 'sweeper-debug.log'), `[${new Date().toISOString()}] calling startHeartbeat pid=${process.pid}\n`);
  } catch {}
  startHeartbeat();
  try {
    fs.appendFileSync(path.join(os.homedir(), '.nos', 'runtime', 'sweeper-debug.log'), `[${new Date().toISOString()}] startHeartbeat returned pid=${process.pid}\n`);
  } catch {}
}
