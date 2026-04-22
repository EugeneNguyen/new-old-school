import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import yaml from 'js-yaml';
import type { Workspace } from '@/types/workspace';
import { atomicWriteFileWithDir } from '@/lib/fs-utils';

const NOS_HOME = process.env.NOS_HOME && process.env.NOS_HOME.trim()
  ? path.resolve(process.env.NOS_HOME)
  : path.join(os.homedir(), '.nos');

const REGISTRY_FILE = path.join(NOS_HOME, 'workspaces.yaml');
const MAX_BYTES = 1024 * 1024;

export function getNosHome(): string {
  return NOS_HOME;
}

export function getRegistryFile(): string {
  return REGISTRY_FILE;
}


function readRegistry(): Workspace[] {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object') return [];
    const list = (parsed as Record<string, unknown>).workspaces;
    if (!Array.isArray(list)) return [];
    const result: Workspace[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const w = entry as Record<string, unknown>;
      if (typeof w.id !== 'string' || typeof w.name !== 'string' || typeof w.absolutePath !== 'string') continue;
      result.push({
        id: w.id,
        name: w.name,
        absolutePath: w.absolutePath,
        createdAt: typeof w.createdAt === 'string' ? w.createdAt : '1970-01-01T00:00:00.000Z',
        updatedAt: typeof w.updatedAt === 'string' ? w.updatedAt : '1970-01-01T00:00:00.000Z',
      });
    }
    return result;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function writeRegistry(workspaces: Workspace[]): void {
  const dumped = yaml.dump({ workspaces });
  if (Buffer.byteLength(dumped, 'utf-8') > MAX_BYTES) {
    throw new Error('workspace registry exceeds 1 MB limit');
  }
  atomicWriteFileWithDir(REGISTRY_FILE, dumped);
}

export function listWorkspaces(): Workspace[] {
  return readRegistry();
}

export function readWorkspace(id: string): Workspace | null {
  return readRegistry().find((w) => w.id === id) ?? null;
}

export type ValidatePathResult =
  | { ok: true; resolved: string }
  | { ok: false; error: string };

export function validateWorkspacePath(input: string): ValidatePathResult {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'path is required' };
  }
  const trimmed = input.trim();
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, error: 'path must be absolute' };
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(trimmed);
  } catch {
    return { ok: false, error: 'path does not exist' };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return { ok: false, error: 'path is not accessible' };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: 'path must be a directory' };
  }
  return { ok: true, resolved };
}

export interface CreateWorkspaceInput {
  name: string;
  absolutePath: string;
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace | { error: string } {
  const name = (input.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  const pathCheck = validateWorkspacePath(input.absolutePath ?? '');
  if (pathCheck.ok === false) return { error: pathCheck.error };

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: randomUUID(),
    name,
    absolutePath: pathCheck.resolved,
    createdAt: now,
    updatedAt: now,
  };
  const existing = readRegistry();
  existing.push(workspace);
  writeRegistry(existing);
  return workspace;
}

export interface WorkspacePatch {
  name?: string;
  absolutePath?: string;
}

export function updateWorkspace(id: string, patch: WorkspacePatch): Workspace | { error: string } | null {
  const all = readRegistry();
  const idx = all.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  const current = all[idx];

  let name = current.name;
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) return { error: 'name cannot be empty' };
    name = trimmed;
  }

  let absolutePath = current.absolutePath;
  if (patch.absolutePath !== undefined) {
    const check = validateWorkspacePath(patch.absolutePath);
    if (check.ok === false) return { error: check.error };
    absolutePath = check.resolved;
  }

  const updated: Workspace = {
    ...current,
    name,
    absolutePath,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeRegistry(all);
  return updated;
}

export function deleteWorkspace(id: string): boolean {
  const all = readRegistry();
  const next = all.filter((w) => w.id !== id);
  if (next.length === all.length) return false;
  writeRegistry(next);
  return true;
}

export function ensureNosDir(workspacePath: string, templatesRoot: string): void {
  const nosDir = path.join(workspacePath, '.nos');
  if (fs.existsSync(nosDir)) return;
  if (!fs.existsSync(templatesRoot)) {
    fs.mkdirSync(nosDir, { recursive: true });
    return;
  }
  copyDirRecursive(templatesRoot, nosDir);
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}
