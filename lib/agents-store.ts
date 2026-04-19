import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { Agent } from '@/types/workflow';
import { readStages, listWorkflows } from '@/lib/workflow-store';
import { getProjectRoot } from '@/lib/project-root';

const AGENTS_ROOT = path.join(getProjectRoot(), '.nos', 'agents');
const META_FILE = 'meta.yml';
const CONTENT_FILE = 'index.md';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function atomicWriteFile(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function agentDir(id: string): string {
  return path.join(AGENTS_ROOT, id);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function agentExists(id: string): boolean {
  const dir = agentDir(id);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

function readAgentFolder(id: string): Agent | null {
  const dir = agentDir(id);
  const metaPath = path.join(dir, META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
  if (!meta || typeof meta !== 'object') return null;
  const data = meta as Record<string, unknown>;

  const storedId = String(data.id ?? '');
  if (storedId !== id) {
    throw new Error(
      `Agent id mismatch: directory '${id}' contains meta.yml with id='${storedId}'`
    );
  }

  const contentPath = path.join(dir, CONTENT_FILE);
  const prompt = fs.existsSync(contentPath)
    ? fs.readFileSync(contentPath, 'utf-8')
    : '';

  return {
    id,
    displayName: String(data.displayName ?? id),
    adapter:
      typeof data.adapter === 'string' && data.adapter ? data.adapter : 'claude',
    model: typeof data.model === 'string' && data.model ? data.model : null,
    prompt,
    createdAt:
      typeof data.createdAt === 'string' && data.createdAt
        ? data.createdAt
        : '1970-01-01T00:00:00.000Z',
    updatedAt:
      typeof data.updatedAt === 'string' && data.updatedAt
        ? data.updatedAt
        : '1970-01-01T00:00:00.000Z',
  };
}

export function listAgents(): Agent[] {
  if (!fs.existsSync(AGENTS_ROOT)) return [];
  const entries = fs.readdirSync(AGENTS_ROOT);
  const agents: Agent[] = [];
  for (const entry of entries) {
    const full = path.join(AGENTS_ROOT, entry);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      const agent = readAgentFolder(entry);
      if (agent) agents.push(agent);
    } catch (err) {
      console.error(`Failed to read agent ${entry}:`, err);
    }
  }
  agents.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return agents;
}

export function readAgent(id: string): Agent | null {
  if (!agentExists(id)) return null;
  return readAgentFolder(id);
}

function readRawMeta(id: string): Record<string, unknown> {
  const metaPath = path.join(agentDir(id), META_FILE);
  if (!fs.existsSync(metaPath)) return {};
  const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
  if (!meta || typeof meta !== 'object') return {};
  return meta as Record<string, unknown>;
}

function writeAgent(id: string, meta: Record<string, unknown>, prompt: string): Agent {
  const dir = agentDir(id);
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteFile(path.join(dir, META_FILE), yaml.dump(meta));
  atomicWriteFile(path.join(dir, CONTENT_FILE), prompt);
  const agent = readAgentFolder(id);
  if (!agent) throw new Error(`Failed to read back agent '${id}' after write`);
  return agent;
}

export interface CreateAgentInput {
  displayName: string;
  adapter: string;
  model?: string | null;
  prompt?: string;
  id?: string;
}

export function createAgent(input: CreateAgentInput): Agent | { error: string } {
  const displayName = input.displayName.trim();
  if (!displayName) return { error: 'displayName is required' };

  const adapter = (input.adapter ?? '').trim();
  if (!adapter) return { error: 'adapter is required' };
  if (!/^[a-z][a-z0-9_-]*$/.test(adapter)) {
    return { error: `adapter '${adapter}' must be a lowercase slug` };
  }

  let baseId: string;
  if (input.id !== undefined) {
    const candidate = input.id.trim();
    if (!SLUG_REGEX.test(candidate)) {
      return { error: `id '${candidate}' must match ${SLUG_REGEX.source}` };
    }
    baseId = candidate;
  } else {
    baseId = slugify(displayName);
    if (!baseId) baseId = `agent-${Date.now()}`;
  }

  fs.mkdirSync(AGENTS_ROOT, { recursive: true });

  let finalId = baseId;
  let counter = 2;
  while (agentExists(finalId)) {
    finalId = `${baseId}-${counter++}`;
    if (counter > 9999) return { error: 'Could not allocate unique agent id' };
  }

  const now = new Date().toISOString();
  const meta: Record<string, unknown> = {
    id: finalId,
    displayName,
    adapter,
    model: typeof input.model === 'string' && input.model.trim() ? input.model.trim() : null,
    createdAt: now,
    updatedAt: now,
  };
  return writeAgent(finalId, meta, input.prompt ?? '');
}

export interface AgentPatch {
  displayName?: string;
  adapter?: string;
  model?: string | null;
  prompt?: string;
}

export function updateAgent(id: string, patch: AgentPatch): Agent | null {
  if (!agentExists(id)) return null;
  const meta = readRawMeta(id);

  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (!name) return null;
    meta.displayName = name;
  }
  if (patch.adapter !== undefined) {
    const adapter = patch.adapter.trim();
    if (!adapter || !/^[a-z][a-z0-9_-]*$/.test(adapter)) return null;
    meta.adapter = adapter;
  }
  if (patch.model !== undefined) {
    meta.model =
      patch.model === null || patch.model === ''
        ? null
        : typeof patch.model === 'string'
          ? patch.model.trim() || null
          : null;
  }

  meta.id = id;
  meta.updatedAt = new Date().toISOString();
  if (!meta.createdAt) meta.createdAt = meta.updatedAt;

  const contentPath = path.join(agentDir(id), CONTENT_FILE);
  const currentPrompt = fs.existsSync(contentPath)
    ? fs.readFileSync(contentPath, 'utf-8')
    : '';
  const nextPrompt = patch.prompt !== undefined ? patch.prompt : currentPrompt;

  return writeAgent(id, meta, nextPrompt);
}

export interface StageReference {
  workflowId: string;
  stageName: string;
}

export function findAgentReferences(agentId: string): StageReference[] {
  const refs: StageReference[] = [];
  for (const wf of listWorkflows()) {
    try {
      const stages = readStages(wf);
      for (const stage of stages) {
        if (stage.agentId === agentId) {
          refs.push({ workflowId: wf, stageName: stage.name });
        }
      }
    } catch (err) {
      console.error(`Failed to scan workflow '${wf}' for agent references:`, err);
    }
  }
  return refs;
}

export type DeleteAgentResult =
  | { ok: true }
  | { ok: false; status: 404 }
  | { ok: false; status: 409; references: StageReference[] };

export function deleteAgent(id: string): DeleteAgentResult {
  if (!agentExists(id)) return { ok: false, status: 404 };
  const refs = findAgentReferences(id);
  if (refs.length > 0) return { ok: false, status: 409, references: refs };
  fs.rmSync(agentDir(id), { recursive: true, force: true });
  return { ok: true };
}
