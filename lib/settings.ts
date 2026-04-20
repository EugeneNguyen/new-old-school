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

export interface DefaultAgentConfig {
  adapter: string | null;
  model: string | null;
}

export function readDefaultAgent(): DefaultAgentConfig {
  const settings = readFileRaw();
  const defaultAgent = settings.defaultAgent;
  if (defaultAgent && typeof defaultAgent === 'object' && !Array.isArray(defaultAgent)) {
    const obj = defaultAgent as Record<string, unknown>;
    return {
      adapter: typeof obj.adapter === 'string' ? obj.adapter : null,
      model: typeof obj.model === 'string' ? obj.model : null,
    };
  }
  return { adapter: null, model: null };
}

export function writeDefaultAgent(config: Partial<DefaultAgentConfig>): void {
  const settings = readFileRaw();
  const existing = settings.defaultAgent as Record<string, unknown> | undefined;
  const current = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? (existing as Record<string, unknown>)
    : {};
  const updated: Record<string, unknown> = {};
  if ('adapter' in config) {
    updated.adapter = config.adapter;
  } else {
    updated.adapter = current.adapter ?? null;
  }
  if ('model' in config) {
    updated.model = config.model;
  } else {
    updated.model = current.model ?? null;
  }
  settings.defaultAgent = updated;
  const dumped = yaml.dump(settings);
  if (Buffer.byteLength(dumped, 'utf-8') > MAX_BYTES) {
    throw new Error('settings file exceeds 64 KB limit');
  }
  atomicWrite(dumped);
}
