import path from 'path';

let cached: string | null = null;

export function getProjectRoot(): string {
  if (cached !== null) return cached;
  const fromEnv = process.env.NOS_PROJECT_ROOT;
  const root = fromEnv && fromEnv.trim() ? fromEnv : process.cwd();
  cached = path.resolve(root);
  return cached;
}
