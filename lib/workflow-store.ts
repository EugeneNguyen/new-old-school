import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession } from '@/types/workflow';
import { emitItemCreated, emitItemUpdated } from '@/lib/workflow-events';
import { getProjectRoot } from '@/lib/project-root';

const WORKFLOWS_ROOT = path.join(getProjectRoot(), '.nos', 'workflows');
const META_FILE = 'meta.yml';
const CONTENT_FILE = 'index.md';

function atomicWriteFile(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function writeMeta(
  workflowId: string,
  itemId: string,
  meta: Record<string, unknown>,
  kind: 'created' | 'updated'
): WorkflowItem | null {
  meta.updatedAt = new Date().toISOString();
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  atomicWriteFile(metaPath, yaml.dump(meta));
  const item = readItemFolder(workflowId, itemId);
  if (item) {
    if (kind === 'created') emitItemCreated(workflowId, item);
    else emitItemUpdated(workflowId, item);
  }
  return item;
}

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
  idPrefix: string;
}

const MIN_ID_PADDING = 3;
const VALID_STATUSES: ItemStatus[] = ['Todo', 'In Progress', 'Done', 'Failed'];

export function readWorkflowConfig(id: string): WorkflowConfig | null {
  const configPath = path.join(workflowDir(id), 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    if (keys.length !== 2 || !keys.includes('name') || !keys.includes('idPrefix')) return null;
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
    if (typeof parsed.idPrefix !== 'string' || !parsed.idPrefix.trim()) return null;
    return {
      name: parsed.name.trim(),
      idPrefix: parsed.idPrefix.trim(),
    };
  } catch {
    return null;
  }
}

function nextPrefixedId(itemsRoot: string, prefix: string): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let max = 0;
  let widestWidth = MIN_ID_PADDING;
  if (fs.existsSync(itemsRoot)) {
    for (const entry of fs.readdirSync(itemsRoot)) {
      const m = entry.match(pattern);
      if (!m) continue;
      widestWidth = Math.max(widestWidth, m[1].length);
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(widestWidth, '0')}`;
}

export function readStages(id: string): Stage[] {
  const stagesPath = path.join(workflowDir(id), 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) return [];
  const raw = fs.readFileSync(stagesPath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) return [];

  const seenNames = new Set<string>();
  const stages: Stage[] = [];

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return [];
    const s = entry as Record<string, unknown>;
    if (typeof s.name !== 'string' || !s.name.trim()) return [];
    if (typeof s.description !== 'string') return [];
    if (typeof s.prompt !== 'string' && s.prompt !== null) return [];
    if (typeof s.autoAdvanceOnComplete !== 'boolean' && s.autoAdvanceOnComplete !== null) return [];
    if (s.agentId !== undefined && s.agentId !== null && typeof s.agentId !== 'string') return [];
    if (s.maxDisplayItems !== undefined && s.maxDisplayItems !== null) {
      if (typeof s.maxDisplayItems !== 'number') return [];
      if (!Number.isInteger(s.maxDisplayItems) || s.maxDisplayItems <= 0) return [];
    }

    const name = s.name.trim();
    if (seenNames.has(name)) return [];
    seenNames.add(name);

    const stage: Stage = {
      name,
      description: s.description,
      prompt: typeof s.prompt === 'string' ? s.prompt : null,
      autoAdvanceOnComplete:
        typeof s.autoAdvanceOnComplete === 'boolean' ? s.autoAdvanceOnComplete : null,
      agentId: typeof s.agentId === 'string' && s.agentId ? s.agentId : null,
    };
    if (typeof s.maxDisplayItems === 'number') {
      stage.maxDisplayItems = s.maxDisplayItems;
    }
    stages.push(stage);
  }

  return stages;
}

function parseStatus(value: unknown): ItemStatus | null {
  return typeof value === 'string' && VALID_STATUSES.includes(value as ItemStatus)
    ? (value as ItemStatus)
    : null;
}

function readItemFolder(workflowId: string, itemId: string): WorkflowItem | null {
  const dir = itemDir(workflowId, itemId);
  const metaPath = path.join(dir, META_FILE);
  const contentPath = path.join(dir, CONTENT_FILE);
  if (!fs.existsSync(metaPath) || !fs.existsSync(contentPath)) return null;

  const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const data = meta as Record<string, unknown>;

  if (typeof data.title !== 'string' || !data.title.trim()) return null;
  if (typeof data.stage !== 'string' || !data.stage.trim()) return null;
  const stages = readStages(workflowId);
  if (!stages.some((stage) => stage.name === data.stage)) return null;

  const status = parseStatus(data.status);
  if (!status) return null;

  if (!Array.isArray(data.comments) || !data.comments.every((comment) => typeof comment === 'string')) {
    return null;
  }

  if (typeof data.updatedAt !== 'string' || !data.updatedAt.trim()) return null;
  if (Number.isNaN(Date.parse(data.updatedAt))) return null;

  const sessions = parseSessions(data.sessions);
  if (!sessions) return null;

  const body = fs.readFileSync(contentPath, 'utf-8').trim();

  return {
    id: itemId,
    title: data.title,
    stage: data.stage,
    status,
    comments: data.comments,
    body: body || undefined,
    sessions,
    updatedAt: data.updatedAt,
  };
}

function parseSessions(raw: unknown): ItemSession[] | null {
  if (!Array.isArray(raw)) return null;
  const sessions: ItemSession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.stage !== 'string' || !e.stage) return null;
    if (typeof e.adapter !== 'string' || !e.adapter) return null;
    if (typeof e.sessionId !== 'string' || !e.sessionId) return null;
    if (typeof e.startedAt !== 'string' || !e.startedAt || Number.isNaN(Date.parse(e.startedAt))) {
      return null;
    }
    const session: ItemSession = {
      stage: e.stage,
      adapter: e.adapter,
      sessionId: e.sessionId,
      startedAt: e.startedAt,
    };
    if (e.agentId !== undefined && e.agentId !== null) {
      if (typeof e.agentId !== 'string' || !e.agentId) return null;
      session.agentId = e.agentId;
    }
    sessions.push(session);
  }
  return sessions;
}

export function listWorkflows(): string[] {
  if (!fs.existsSync(WORKFLOWS_ROOT)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(WORKFLOWS_ROOT)) {
    const full = path.join(WORKFLOWS_ROOT, entry);
    try {
      if (fs.statSync(full).isDirectory()) out.push(entry);
    } catch {
      // ignore
    }
  }
  return out;
}

export function listItems(workflowId: string): string[] {
  const itemsDir = path.join(workflowDir(workflowId), 'items');
  if (!fs.existsSync(itemsDir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(itemsDir)) {
    const full = path.join(itemsDir, entry);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      const hasMeta = fs.existsSync(path.join(full, META_FILE));
      const hasContent = fs.existsSync(path.join(full, CONTENT_FILE));
      if (hasMeta && hasContent) out.push(entry);
    } catch {
      // ignore
    }
  }
  return out;
}

export function readItems(workflowId: string): WorkflowItem[] {
  const items: WorkflowItem[] = [];
  for (const entry of listItems(workflowId)) {
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

  const newStatus = parseStatus(meta.status);
  if (!newStatus) return null;

  return writeMeta(workflowId, itemId, meta, 'updated');
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

  return writeMeta(workflowId, itemId, meta, 'updated');
}

export function appendItemComment(
  workflowId: string,
  itemId: string,
  comment: string
): WorkflowItem | null {
  const text = comment.trim();
  if (!text) return null;
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};

  const existing = Array.isArray(meta.comments)
    ? (meta.comments as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];
  meta.comments = [...existing, text];

  return writeMeta(workflowId, itemId, meta, 'updated');
}

export function writeItemContent(
  workflowId: string,
  itemId: string,
  body: string
): WorkflowItem | null {
  if (!itemExists(workflowId, itemId)) return null;
  const contentPath = path.join(itemDir(workflowId, itemId), CONTENT_FILE);
  atomicWriteFile(contentPath, body.endsWith('\n') ? body : `${body}\n`);

  // Bump updatedAt and emit so realtime consumers see content-writes too.
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return readItemFolder(workflowId, itemId);
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};
  return writeMeta(workflowId, itemId, meta, 'updated');
}

export interface StagePatch {
  name?: string;
  description?: string | null;
  prompt?: string | null;
  autoAdvanceOnComplete?: boolean | null;
  agentId?: string | null;
  maxDisplayItems?: number | null;
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
  if (patch.agentId !== undefined) {
    current.agentId = patch.agentId ?? null;
  }
  if (patch.maxDisplayItems !== undefined) {
    if (patch.maxDisplayItems === null || patch.maxDisplayItems === 0) {
      delete current.maxDisplayItems;
    } else {
      current.maxDisplayItems = patch.maxDisplayItems;
    }
  }

  atomicWriteFile(stagesPath, yaml.dump(list));

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
            writeMeta(workflowId, entry, meta, 'updated');
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
  } else {
    finalId = nextPrefixedId(itemsRoot, config.idPrefix);
  }

  const dir = path.join(itemsRoot, finalId);
  fs.mkdirSync(dir, { recursive: true });

  const initialBody = input.body ?? '';
  const bodyToWrite = initialBody && !initialBody.endsWith('\n') ? `${initialBody}\n` : initialBody;
  atomicWriteFile(path.join(dir, CONTENT_FILE), bodyToWrite);

  const meta: Record<string, unknown> = {
    title,
    stage: stageName,
    status: 'Todo' as ItemStatus,
    comments: [] as string[],
    sessions: [] as ItemSession[],
  };
  return writeMeta(workflowId, finalId, meta, 'created');
}
