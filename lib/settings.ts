import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getProjectRoot } from '@/lib/project-root';

const SETTINGS_FILE = path.join(getProjectRoot(), '.nos', 'settings.yaml');
const MAX_BYTES = 65536;
const DEFAULT_HEARTBEAT_MS = 60000;

function readFileRaw(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = yaml.load(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}

function atomicWrite(contents: string): void {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const tmp = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, SETTINGS_FILE);
}

export function readHeartbeatMs(): number {
  const settings = readFileRaw();
  const raw = settings.autoAdvanceHeartbeatMs;
  if (typeof raw === 'number' && Number.isFinite(raw) && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  return DEFAULT_HEARTBEAT_MS;
}

export function writeHeartbeatMs(ms: number): void {
  if (!Number.isFinite(ms) || !Number.isInteger(ms) || ms < 0) {
    throw new Error('intervalMs must be a finite non-negative integer');
  }
  const settings = readFileRaw();
  settings.autoAdvanceHeartbeatMs = ms;
  const dumped = yaml.dump(settings);
  if (Buffer.byteLength(dumped, 'utf-8') > MAX_BYTES) {
    throw new Error('settings file exceeds 64 KB limit');
  }
  atomicWrite(dumped);
}

export { DEFAULT_HEARTBEAT_MS };
