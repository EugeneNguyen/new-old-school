export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startHeartbeat } = await import('./lib/auto-advance-sweeper');
  startHeartbeat();
}
