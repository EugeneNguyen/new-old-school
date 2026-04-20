import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Stage, WorkflowItem, ItemStatus, WorkflowDetail, ItemSession } from '@/types/workflow';
import { emitItemCreated, emitItemUpdated } from '@/lib/workflow-events';
import { getProjectRoot } from '@/lib/project-root';
import { appendActivity, hashBody, type ActivityActor } from '@/lib/activity-log';

function workflowsRoot(): string {
  return path.join(getProjectRoot(), '.nos', 'workflows');
}
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
  return path.join(workflowsRoot(), id);
}

function itemDir(workflowId: string, itemId: string) {
  return path.join(workflowDir(workflowId), 'items', itemId);
}

export function workflowExists(id: string): boolean {
  const dir = workflowDir(id);
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
}

export function createWorkflow(id: string, config: WorkflowConfig): boolean {
  if (workflowExists(id)) return false;
  try {
    const dir = workflowDir(id);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
    const configJson = JSON.stringify({ name: config.name.trim(), idPrefix: config.idPrefix.trim() });
    atomicWriteFile(path.join(dir, 'config.json'), configJson);
    atomicWriteFile(path.join(dir, 'config', 'stages.yaml'), '[]\n');
    return true;
  } catch {
    return false;
  }
}

export function deleteWorkflow(id: string): boolean {
  const target = path.join(workflowsRoot(), id);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(workflowsRoot()))) return false;
  if (!workflowExists(id)) return false;
  try {
    fs.rmSync(resolved, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export interface WorkflowPatch {
  name?: string;
  idPrefix?: string;
}

export function updateWorkflow(id: string, patch: WorkflowPatch): boolean {
  const configPath = path.join(workflowDir(id), 'config.json');
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    if (patch.name !== undefined) config.name = patch.name.trim();
    if (patch.idPrefix !== undefined) config.idPrefix = patch.idPrefix.trim();
    atomicWriteFile(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
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
  if (!fs.existsSync(workflowsRoot())) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(workflowsRoot())) {
    const full = path.join(workflowsRoot(), entry);
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
  actor?: ActivityActor;
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

  const actor: ActivityActor = patch.actor ?? 'unknown';
  const oldTitle = String(meta.title ?? '');
  const oldStage = String(meta.stage ?? '');
  const oldStatus = String(meta.status ?? '');

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

  const result = writeMeta(workflowId, itemId, meta, 'updated');

  const ts = new Date().toISOString();

  if (patch.title !== undefined && patch.title !== oldTitle) {
    void appendActivity({
      ts,
      workflowId,
      itemId,
      type: 'title-changed',
      actor,
      data: { kind: 'title-changed', before: oldTitle, after: patch.title },
    });
  }

  if (patch.stage !== undefined && patch.stage !== oldStage) {
    void appendActivity({
      ts,
      workflowId,
      itemId,
      type: 'stage-changed',
      actor,
      data: { kind: 'stage-changed', before: oldStage, after: patch.stage },
    });
  }

  const newStatusStr = String(meta.status);
  if (newStatusStr !== oldStatus) {
    void appendActivity({
      ts,
      workflowId,
      itemId,
      type: 'status-changed',
      actor,
      data: { kind: 'status-changed', before: oldStatus, after: newStatusStr },
    });
  }

  return result;
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

  // NOTE: comment additions intentionally do not produce an activity entry (AC-34).
  return writeMeta(workflowId, itemId, meta, 'updated');
}

export function updateItemComment(
  workflowId: string,
  itemId: string,
  index: number,
  text: string
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};

  const existing = Array.isArray(meta.comments)
    ? (meta.comments as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  if (index < 0 || index >= existing.length) return null;
  existing[index] = trimmed;
  meta.comments = existing;

  const result = writeMeta(workflowId, itemId, meta, 'updated');
  return result ? trimmed : null;
}

export function deleteItemComment(
  workflowId: string,
  itemId: string,
  index: number
): string[] | null {
  const metaPath = path.join(itemDir(workflowId, itemId), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  const meta = (yaml.load(fs.readFileSync(metaPath, 'utf-8')) as Record<string, unknown>) ?? {};

  const existing = Array.isArray(meta.comments)
    ? (meta.comments as unknown[]).filter((c): c is string => typeof c === 'string')
    : [];

  if (index < 0 || index >= existing.length) return null;
  existing.splice(index, 1);
  meta.comments = existing;

  const result = writeMeta(workflowId, itemId, meta, 'updated');
  return result ? existing : null;
}

export function writeItemContent(
  workflowId: string,
  itemId: string,
  body: string,
  actor?: ActivityActor
): WorkflowItem | null {
  if (!itemExists(workflowId, itemId)) return null;
  const contentPath = path.join(itemDir(workflowId, itemId), CONTENT_FILE);

  const existingBody = fs.existsSync(contentPath) ? fs.readFileSync(contentPath, 'utf-8') : '';
  const newBody = body.endsWith('\n') ? body : `${body}\n`;
  atomicWriteFile(contentPath, newBody);

  if (newBody !== existingBody) {
    void appendActivity({
      ts: new Date().toISOString(),
      workflowId,
      itemId,
      type: 'body-changed',
      actor: actor ?? 'unknown',
      data: {
        kind: 'body-changed',
        beforeHash: hashBody(existingBody),
        afterHash: hashBody(newBody),
        beforeLength: existingBody.length,
        afterLength: newBody.length,
      },
    });
  }

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

const STAGE_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;
const STAGE_NAME_MAX_LENGTH = 64;

export class StageError extends Error {
  constructor(
    public readonly code: 'DUPLICATE' | 'NOT_FOUND' | 'HAS_ITEMS' | 'LAST_STAGE' | 'INVALID_NAME' | 'SET_MISMATCH',
    message: string,
    public readonly itemCount?: number
  ) {
    super(message);
    this.name = 'StageError';
  }
}

export function addStage(workflowId: string, stage: Omit<Stage, 'name'> & { name: string }): Stage[] {
  const trimmedName = stage.name.trim();
  if (!trimmedName) throw new StageError('INVALID_NAME', 'Stage name is required');
  if (trimmedName.length > STAGE_NAME_MAX_LENGTH) throw new StageError('INVALID_NAME', 'Stage name is too long');
  if (!STAGE_NAME_REGEX.test(trimmedName)) throw new StageError('INVALID_NAME', 'Stage name contains invalid characters');

  const stagesPath = path.join(workflowDir(workflowId), 'config', 'stages.yaml');
  let list: Array<Record<string, unknown>> = [];
  if (fs.existsSync(stagesPath)) {
    const parsed = yaml.load(fs.readFileSync(stagesPath, 'utf-8'));
    if (Array.isArray(parsed)) list = parsed as Array<Record<string, unknown>>;
  }

  const duplicate = list.some(
    (s) => s && String(s.name ?? '').toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) throw new StageError('DUPLICATE', `Stage '${trimmedName}' already exists`);

  const newEntry: Record<string, unknown> = {
    name: trimmedName,
    description: typeof stage.description === 'string' ? stage.description : '',
    prompt: typeof stage.prompt === 'string' && stage.prompt ? stage.prompt : null,
    autoAdvanceOnComplete: stage.autoAdvanceOnComplete === true ? true : null,
  };
  if (stage.agentId) newEntry.agentId = stage.agentId;
  if (typeof stage.maxDisplayItems === 'number' && stage.maxDisplayItems > 0) {
    newEntry.maxDisplayItems = stage.maxDisplayItems;
  }

  list.push(newEntry);
  fs.mkdirSync(path.dirname(stagesPath), { recursive: true });
  atomicWriteFile(stagesPath, yaml.dump(list));

  return readStages(workflowId);
}

export function deleteStage(workflowId: string, stageName: string): Stage[] {
  const stagesPath = path.join(workflowDir(workflowId), 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) throw new StageError('NOT_FOUND', `Stage '${stageName}' not found`);

  const raw = fs.readFileSync(stagesPath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) throw new StageError('NOT_FOUND', `Stage '${stageName}' not found`);

  const list = parsed as Array<Record<string, unknown>>;
  const idx = list.findIndex((s) => s && String(s.name ?? '') === stageName);
  if (idx === -1) throw new StageError('NOT_FOUND', `Stage '${stageName}' not found`);

  if (list.length <= 1) throw new StageError('LAST_STAGE', 'Cannot delete the last remaining stage');

  const allItems = readItems(workflowId);
  const itemsOnStage = allItems.filter((item) => item.stage === stageName);
  if (itemsOnStage.length > 0) {
    throw new StageError('HAS_ITEMS', `Cannot delete stage with items`, itemsOnStage.length);
  }

  list.splice(idx, 1);
  atomicWriteFile(stagesPath, yaml.dump(list));

  return readStages(workflowId);
}

export function reorderStages(workflowId: string, orderedNames: string[]): Stage[] {
  if (!workflowExists(workflowId)) throw new StageError('NOT_FOUND', `Workflow '${workflowId}' not found`);

  const stagesPath = path.join(workflowDir(workflowId), 'config', 'stages.yaml');
  if (!fs.existsSync(stagesPath)) throw new StageError('NOT_FOUND', 'No stages found');

  const raw = fs.readFileSync(stagesPath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) throw new StageError('NOT_FOUND', 'No stages found');

  const list = parsed as Array<Record<string, unknown>>;

  // Validate: submitted names must exactly match current stage names
  const currentNames = new Set(list.map((s) => String(s?.name ?? '')));
  const submittedNames = new Set(orderedNames);

  if (currentNames.size !== submittedNames.size) {
    throw new StageError('SET_MISMATCH', 'Stage list changed — reload and retry');
  }

  for (const name of submittedNames) {
    if (!currentNames.has(name)) {
      throw new StageError('SET_MISMATCH', 'Stage list changed — reload and retry');
    }
  }

  // Build new ordered list
  const nameToStage = new Map<string, Record<string, unknown>>();
  for (const stage of list) {
    if (stage && typeof stage.name === 'string') {
      nameToStage.set(stage.name, stage);
    }
  }

  const newList: Array<Record<string, unknown>> = [];
  for (const name of orderedNames) {
    const stage = nameToStage.get(name);
    if (stage) {
      newList.push(stage);
    }
  }

  atomicWriteFile(stagesPath, yaml.dump(newList));
  return readStages(workflowId);
}

export interface CreateItemInput {
  title: string;
  id?: string;
  body?: string;
  stage?: string;
  actor?: ActivityActor;
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
  const item = writeMeta(workflowId, finalId, meta, 'created');

  if (item) {
    void appendActivity({
      ts: new Date().toISOString(),
      workflowId,
      itemId: finalId,
      type: 'item-created',
      actor: input.actor ?? 'unknown',
      data: { kind: 'item-created', title, stageId: stageName, status: 'Todo' },
    });
  }

  return item;
}
