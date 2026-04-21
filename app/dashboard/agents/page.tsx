'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Agent } from '@/types/workflow';

const ItemDescriptionEditor = dynamic(
  () => import('@/components/dashboard/ItemDescriptionEditor').then(mod => mod.ItemDescriptionEditor),
  { ssr: false }
);

const OTHER_MODEL_SENTINEL = '__other__';
const DEFAULT_ADAPTER = 'claude';
const MODELS_FETCH_TIMEOUT_MS = 5000;

interface AdapterOption {
  name: string;
  label: string;
}

interface ModelOption {
  id: string;
  label: string;
}

interface EditorState {
  id: string | null;
  displayName: string;
  adapter: string;
  choice: string; // '' = default, model id, or OTHER_MODEL_SENTINEL
  customModel: string;
  prompt: string;
}

const BLANK_EDITOR: EditorState = {
  id: null,
  displayName: '',
  adapter: DEFAULT_ADAPTER,
  choice: '',
  customModel: '',
  prompt: '',
};

interface ConflictInfo {
  references: { workflowId: string; stageName: string }[];
  agentId: string;
}

function deriveChoice(model: string | null | undefined): {
  choice: string;
  customModel: string;
} {
  if (!model) return { choice: '', customModel: '' };
  return { choice: model, customModel: '' };
}

function resolveModel(choice: string, customModel: string): string | null {
  if (choice === '') return null;
  if (choice === OTHER_MODEL_SENTINEL) {
    const trimmed = customModel.trim();
    return trimmed || null;
  }
  return choice;
}

export default function MembersPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [adapters, setAdapters] = useState<AdapterOption[]>([]);
  const [adaptersError, setAdaptersError] = useState<string | null>(null);

  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const modelsFetchId = useRef(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as { agents?: Agent[] };
      setAgents(Array.isArray(data.agents) ? data.agents : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadAdapters = useCallback(async () => {
    try {
      const res = await fetch('/api/adapters', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load adapters (${res.status})`);
      const data = (await res.json()) as { adapters?: AdapterOption[] };
      const list = Array.isArray(data.adapters) ? data.adapters : [];
      setAdapters(list);
      setAdaptersError(null);
    } catch (err) {
      setAdapters([{ name: DEFAULT_ADAPTER, label: 'Claude CLI' }]);
      setAdaptersError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadModels = useCallback(async (adapter: string) => {
    const requestId = ++modelsFetchId.current;
    setModelsLoading(true);
    setModelsError(null);
    setModels([]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODELS_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/adapters/${encodeURIComponent(adapter)}/models`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { models?: ModelOption[] };
      if (requestId !== modelsFetchId.current) return;
      setModels(Array.isArray(data.models) ? data.models : []);
      setModelsError(null);
    } catch {
      if (requestId !== modelsFetchId.current) return;
      setModels([{ id: OTHER_MODEL_SENTINEL, label: 'Other (custom model id)' }]);
      setModelsError('Could not load model list');
    } finally {
      if (requestId === modelsFetchId.current) {
        clearTimeout(timer);
        setModelsLoading(false);
      }
    }
  }, []);

  function openEditor(next: EditorState) {
    setEditor(next);
    setSaveError(null);
    void loadAdapters();
    void loadModels(next.adapter);
  }

  function startCreate() {
    // Fetch defaults with 3 second timeout, then proceed with defaults
    const DEFAULTS_FETCH_TIMEOUT_MS = 3000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULTS_FETCH_TIMEOUT_MS);

    fetch('/api/settings/default-agent', { cache: 'no-store', signal: controller.signal })
      .then((res) => res.json())
      .then((data: { adapter?: string | null; model?: string | null }) => {
        clearTimeout(timer);
        if (data?.adapter) {
          const { choice, customModel } = deriveChoice(data.model ?? null);
          openEditor({
            ...BLANK_EDITOR,
            adapter: data.adapter,
            choice,
            customModel,
          });
        } else {
          openEditor({ ...BLANK_EDITOR });
        }
      })
      .catch(() => {
        clearTimeout(timer);
        openEditor({ ...BLANK_EDITOR });
      });
  }

  function startEdit(agent: Agent) {
    const { choice, customModel } = deriveChoice(agent.model);
    openEditor({
      id: agent.id,
      displayName: agent.displayName,
      adapter: agent.adapter ?? DEFAULT_ADAPTER,
      choice,
      customModel,
      prompt: agent.prompt,
    });
  }

  function changeAdapter(nextAdapter: string) {
    setEditor((curr) => (curr ? { ...curr, adapter: nextAdapter } : curr));
    void loadModels(nextAdapter);
  }

  async function handleSave() {
    if (!editor) return;
    const name = editor.displayName.trim();
    if (!name) {
      setSaveError('Name is required');
      return;
    }
    const adapter = editor.adapter.trim();
    if (!adapter) {
      setSaveError('Adapter is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const model = resolveModel(editor.choice, editor.customModel);
      if (editor.id === null) {
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name, adapter, model, prompt: editor.prompt }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `Create failed (${res.status})`);
        }
      } else {
        const res = await fetch(`/api/agents/${encodeURIComponent(editor.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name, adapter, model, prompt: editor.prompt }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `Update failed (${res.status})`);
        }
      }
      setEditor(null);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setPendingDeleteId(id);
    setConflict(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 204) {
        await reload();
        return;
      }
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        const refs = Array.isArray(data?.references) ? data.references : [];
        setConflict({ references: refs, agentId: id });
        return;
      }
      const msg = await res.text();
      throw new Error(msg || `Delete failed (${res.status})`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDeleteId(null);
    }
  }

  const currentChoice = editor?.choice ?? '';
  const storedChoiceIsUnknown =
    !!editor &&
    !modelsLoading &&
    currentChoice !== '' &&
    currentChoice !== OTHER_MODEL_SENTINEL &&
    !models.some((m) => m.id === currentChoice);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground">
            Agents that can be assigned to stages. Each agent has an optional prompt and
            model override. Stored in{' '}
            <code className="font-mono text-xs">.nos/agents/</code>.
          </p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="mr-1 h-4 w-4" />
          New agent
        </Button>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${agents.length} agent${agents.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {agents.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground italic">
              No agents defined yet. Create one to assign it to a stage.
            </p>
          ) : (
            <ul className="divide-y">
              {agents.map((agent) => (
                <li key={agent.id} className="flex items-center justify-between gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => startEdit(agent)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-medium">{agent.displayName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {agent.id}
                      {' · '}
                      {agent.adapter ?? DEFAULT_ADAPTER}
                      {' · '}
                      {agent.model ?? 'adapter default'}
                      {' · updated '}
                      {new Date(agent.updatedAt).toLocaleString()}
                    </p>
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(agent)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(agent.id)}
                    disabled={pendingDeleteId === agent.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editor && (
        <Card>
          <CardHeader>
            <CardTitle>{editor.id === null ? 'New agent' : `Edit '${editor.id}'`}</CardTitle>
            <CardDescription>
              {editor.id === null
                ? 'The id is derived from the name and becomes immutable once saved.'
                : 'Name, adapter, model, and prompt can be edited. The id is immutable.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={editor.displayName}
                onChange={(e) =>
                  setEditor((curr) => (curr ? { ...curr, displayName: e.target.value } : curr))
                }
                placeholder="Research Bot"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Adapter</label>
              <select
                value={editor.adapter}
                onChange={(e) => changeAdapter(e.target.value)}
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                {adapters.length === 0 && (
                  <option value={editor.adapter}>{editor.adapter}</option>
                )}
                {adapters.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.label}
                  </option>
                ))}
                {adapters.length > 0 &&
                  !adapters.some((a) => a.name === editor.adapter) && (
                    <option value={editor.adapter}>{editor.adapter}</option>
                  )}
              </select>
              {adaptersError && (
                <p className="text-xs text-destructive">Could not load adapter list</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <select
                value={editor.choice}
                onChange={(e) =>
                  setEditor((curr) =>
                    curr ? { ...curr, choice: e.target.value } : curr
                  )
                }
                disabled={modelsLoading}
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring',
                  'disabled:opacity-60'
                )}
              >
                {modelsLoading ? (
                  <option value={editor.choice}>Loading models…</option>
                ) : (
                  <>
                    {storedChoiceIsUnknown && (
                      <option value={editor.choice}>{editor.choice}</option>
                    )}
                    {models.map((m) => (
                      <option key={m.id || 'default'} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                    {!models.some((m) => m.id === '') && (
                      <option value="">Adapter default</option>
                    )}
                  </>
                )}
              </select>
              {editor.choice === OTHER_MODEL_SENTINEL && (
                <Input
                  value={editor.customModel}
                  onChange={(e) =>
                    setEditor((curr) =>
                      curr ? { ...curr, customModel: e.target.value } : curr
                    )
                  }
                  placeholder="custom-model-id"
                />
              )}
              {modelsError && (
                <p className="text-xs text-destructive">{modelsError}</p>
              )}
              {storedChoiceIsUnknown && (
                <p className="text-xs text-amber-600">
                  {`Model ${editor.choice} is not offered by adapter ${editor.adapter}; it will be used as-is`}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Prompt</label>
              <ItemDescriptionEditor
                markdown={editor.prompt}
                onChange={(md) =>
                  setEditor((curr) => (curr ? { ...curr, prompt: md } : curr))
                }
                placeholder="Optional member prompt (markdown)…"
              />
            </div>

            {saveError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {conflict && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Cannot delete &apos;{conflict.agentId}&apos;</CardTitle>
            <CardDescription>
              This agent is still referenced by the following stage(s). Reassign or clear
              those stages, then try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm">
              {conflict.references.map((ref, i) => (
                <li key={i} className="font-mono text-xs">
                  {ref.workflowId} / {ref.stageName}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setConflict(null)}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
