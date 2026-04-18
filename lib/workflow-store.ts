import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession } from '@/types/workflow';

const WORKFLOWS_ROOT = path.join(process.cwd(), '.nos', 'workflows');
const META_FILE = 'meta.yml';
const CONTENT_FILE = 'index.md';

function workflowDir(id: string) {
  return path.join(WORKFLOWS_ROOT, id);
}

function itemDir(workflowId: string, itemId: string) {
  return path.join(workflowDir(workflowId), 'items', itemId);
}

export function workflowExists(id: string): boolean {
  const dir = workflowDir(id);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

export interface WorkflowConfig {
  name: string;
  idPrefix?: string;
}

const ID_PADDING = 5;

export function readWorkflowConfig(id: string): WorkflowConfig | null {
  const configPath = path.join(workflowDir(id), 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const config: WorkflowConfig = { name: parsed.name || id };
    if (typeof parsed.idPrefix === 'string' && parsed.idPrefix.trim()) {
      config.idPrefix = parsed.idPrefix.trim();
    }
    return config;
  } catch {
    return null;
  }
}

function nextPrefixedId(itemsRoot: string, prefix: string): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let max = 0;
  if (fs.existsSync(itemsRoot)) {
    for (const entry of fs.readdirSync(itemsRoot)) {
      const m = entry.match(pattern);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(ID_PADDING, '0')}`;
}

export function readStages(id: string): Stage[] {
  const stagesPath = path.join(workflowDir(id), 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) return [];
  const raw = fs.readFileSync(stagesPath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      name: String(s.name ?? ''),
      description: s.description ? String(s.description) : undefined,
      prompt: (s.prompt ?? null) as string | null,
      autoAdvanceOnComplete: (s.autoAdvanceOnComplete ?? null) as boolean | null,
    }))
    .filter((s) => s.name.length > 0);
}

function normalizeStatus(value: unknown): ItemStatus {
  const v = String(value ?? 'Todo');
  if (v === 'Todo' || v === 'In Progress' || v === 'Done') return v;
  return 'Todo';
}

function readItemFolder(workflowId: string, itemId: string): WorkflowItem | null {
  const dir = itemDir(workflowId, itemId);
  const metaPath = path.join(dir, META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
  if (!meta || typeof meta !== 'object') return null;
  const data = meta as Record<string, unknown>;

  const contentPath = path.join(dir, CONTENT_FILE);
  const body = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8').trim() : undefined;

  return {
    id: itemId,
    title: String(data.title ?? itemId),
    stage: String(data.stage ?? ''),
    status: normalizeStatus(data.status),
    comments: Array.isArray(data.comments) ? data.comments.map(String) : [],
    body: body || undefined,
    sessions: parseSessions(data.sessions),
  };
}

function parseSessions(raw: unknown): ItemSession[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sessions: ItemSession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.sessionId !== 'string' || !e.sessionId) continue;
    sessions.push({
      stage: String(e.stage ?? ''),
      adapter: String(e.adapter ?? ''),
      sessionId: e.sessionId,
      startedAt: String(e.startedAt ?? ''),
    });
  }
  return sessions.length > 0 ? sessions : undefined;
}

export function readItems(workflowId: string): WorkflowItem[] {
  const itemsDir = path.join(workflowDir(workflowId), 'items');
  if (!fs.existsSync(itemsDir)) return [];
  const entries = fs.readdirSync(itemsDir);
  const items: WorkflowItem[] = [];
  for (const entry of entries) {
    const entryPath = path.join(itemsDir, entry);
    if (!fs.statSync(entryPath).isDirectory()) continue;
    try {
      const item = readItemFolder(workflowId, entry);
      if (item) items.push(item);
    } catch (err) {
      console.error(`Failed to read workflow item ${entry}:`, err);
    }
  }
  return items;
}

export function readWorkflowDetail(id: string): WorkflowDetail | null {
  if (!workflowExists(id)) return null;
  const config = readWorkflowConfig(id);
  const name = config?.name ?? id;
  return {
    id,
    name,
    stages: readStages(id),
    items: readItems(id),
  };
}

export interface ItemMetaPatch {
  title?: string;
  stage?: string;
  status?: ItemStatus;
  comments?: string[];
}

export function itemExists(workflowId: string, itemId: string): boolean {
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  return fs.existsSync(metaPath);
}

export function readItem(workflowId: string, itemId: string): WorkflowItem | null {
  if (!itemExists(workflowId, itemId)) return null;
  return readItemFolder(workflowId, itemId);
}

export function updateItemMeta(
  workflowId: string,
  itemId: string,
  patch: ItemMetaPatch
): WorkflowItem | null {
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};

  const stageChanged = patch.stage !== undefined && patch.stage !== meta.stage;

  if (patch.title !== undefined) meta.title = patch.title;
  if (patch.stage !== undefined) meta.stage = patch.stage;
  if (patch.status !== undefined) meta.status = patch.status;
  if (patch.comments !== undefined) meta.comments = patch.comments;

  if (stageChanged && patch.status === undefined) {
    meta.status = 'Todo';
  }

  fs.writeFileSync(metaPath, yaml.dump(meta), 'utf-8');
  return readItemFolder(workflowId, itemId);
}

export function appendItemSession(
  workflowId: string,
  itemId: string,
  entry: ItemSession
): WorkflowItem | null {
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};

  const existing = Array.isArray(meta.sessions) ? (meta.sessions as unknown[]) : [];
  meta.sessions = [...existing, entry];

  fs.writeFileSync(metaPath, yaml.dump(meta), 'utf-8');
  return readItemFolder(workflowId, itemId);
}

export function writeItemContent(
  workflowId: string,
  itemId: string,
  body: string
): WorkflowItem | null {
  if (!itemExists(workflowId, itemId)) return null;
  const contentPath = path.join(itemDir(workflowId, itemId), CONTENT_FILE);
  fs.writeFileSync(contentPath, body.endsWith('\n') ? body : `${body}\n`, 'utf-8');
  return readItemFolder(workflowId, itemId);
}

export interface StagePatch {
  name?: string;
  description?: string | null;
  prompt?: string | null;
  autoAdvanceOnComplete?: boolean | null;
}

export function updateStage(
  workflowId: string,
  stageName: string,
  patch: StagePatch
): { stages: Stage[]; items: WorkflowItem[] } | null {
  if (!workflowExists(workflowId)) return null;
  const stagesPath = path.join(workflowDir(workflowId), 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) return null;
  const raw = fs.readFileSync(stagesPath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) return null;

  const list = parsed as Array<Record<string, unknown>>;
  const idx = list.findIndex((s) => s && String(s.name ?? '') === stageName);
  if (idx === -1) return null;

  const current = list[idx];
  const newName =
    patch.name !== undefined ? patch.name.trim() : String(current.name ?? '');
  if (!newName) return null;

  if (patch.name !== undefined && newName !== stageName) {
    const duplicate = list.some(
      (s, i) => i !== idx && s && String(s.name ?? '') === newName
    );
    if (duplicate) return null;
  }

  current.name = newName;
  if (patch.description !== undefined) {
    current.description = patch.description ?? null;
  }
  if (patch.prompt !== undefined) {
    current.prompt = patch.prompt ?? null;
  }
  if (patch.autoAdvanceOnComplete !== undefined) {
    current.autoAdvanceOnComplete = patch.autoAdvanceOnComplete ?? null;
  }

  fs.writeFileSync(stagesPath, yaml.dump(list), 'utf-8');

  if (patch.name !== undefined && newName !== stageName) {
    const itemsRoot = path.join(workflowDir(workflowId), 'items');
    if (fs.existsSync(itemsRoot)) {
      for (const entry of fs.readdirSync(itemsRoot)) {
        const metaPath = path.join(itemsRoot, entry, META_FILE);
        if (!fs.existsSync(metaPath)) continue;
        try {
          const meta =
            (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};
          if (String(meta.stage ?? '') === stageName) {
            meta.stage = newName;
            fs.writeFileSync(metaPath, yaml.dump(meta), 'utf-8');
          }
        } catch (err) {
          console.error(`Failed to rename stage on item ${entry}:`, err);
        }
      }
    }
  }

  return {
    stages: readStages(workflowId),
    items: readItems(workflowId),
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export interface CreateItemInput {
  title: string;
  id?: string;
  body?: string;
  stage?: string;
}

export function createItem(
  workflowId: string,
  input: CreateItemInput
): WorkflowItem | null {
  if (!workflowExists(workflowId)) return null;
  const title = input.title.trim();
  if (!title) return null;

  const stages = readStages(workflowId);
  if (stages.length === 0) return null;
  const firstStage = stages[0].name;
  let stageName = firstStage;
  if (input.stage !== undefined) {
    const requested = input.stage.trim();
    if (!requested) return null;
    if (!stages.some((s) => s.name === requested)) return null;
    stageName = requested;
  }

  const itemsRoot = path.join(workflowDir(workflowId), 'items');
  fs.mkdirSync(itemsRoot, { recursive: true });

  const config = readWorkflowConfig(workflowId);
  const explicitId = input.id?.trim();

  let finalId: string;
  if (explicitId) {
    finalId = explicitId;
    let counter = 1;
    while (fs.existsSync(path.join(itemsRoot, finalId))) {
      finalId = `${explicitId}-${counter++}`;
      if (counter > 9999) return null;
    }
  } else if (config?.idPrefix) {
    finalId = nextPrefixedId(itemsRoot, config.idPrefix);
  } else {
    const baseId = slugify(title) || `item-${Date.now()}`;
    finalId = baseId;
    let counter = 1;
    while (fs.existsSync(path.join(itemsRoot, finalId))) {
      finalId = `${baseId}-${counter++}`;
      if (counter > 9999) return null;
    }
  }

  const dir = path.join(itemsRoot, finalId);
  fs.mkdirSync(dir, { recursive: true });

  const meta = {
    title,
    stage: stageName,
    status: 'Todo' as ItemStatus,
    comments: [] as string[],
  };
  fs.writeFileSync(path.join(dir, META_FILE), yaml.dump(meta), 'utf-8');
  const initialBody = input.body ?? '';
  const bodyToWrite = initialBody && !initialBody.endsWith('\n') ? `${initialBody}\n` : initialBody;
  fs.writeFileSync(path.join(dir, CONTENT_FILE), bodyToWrite, 'utf-8');

  return readItemFolder(workflowId, finalId);
}
