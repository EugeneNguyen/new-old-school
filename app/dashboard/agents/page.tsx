'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Agent } from '@/types/workflow';

const ItemDescriptionEditor = dynamic(
  () => import('@/components/dashboard/ItemDescriptionEditor'),
  { ssr: false }
);

const CURATED_MODELS = [
  { value: '', label: 'Adapter default' },
  { value: 'claude-opus-4-7', label: 'claude-opus-4-7 (Opus)' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (Sonnet)' },
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5 (Haiku)' },
];

type ModelChoice = 'default' | 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-20251001' | 'other';

function modelToChoice(model: string | null | undefined): { choice: ModelChoice; custom: string } {
  if (!model) return { choice: 'default', custom: '' };
  const match = CURATED_MODELS.find((m) => m.value && m.value === model);
  if (match) return { choice: match.value as ModelChoice, custom: '' };
  return { choice: 'other', custom: model };
}

function resolveModel(choice: ModelChoice, custom: string): string | null {
  if (choice === 'default') return null;
  if (choice === 'other') {
    const trimmed = custom.trim();
    return trimmed || null;
  }
  return choice;
}

interface EditorState {
  id: string | null;
  displayName: string;
  choice: ModelChoice;
  customModel: string;
  prompt: string;
}

const BLANK_EDITOR: EditorState = {
  id: null,
  displayName: '',
  choice: 'default',
  customModel: '',
  prompt: '',
};

interface ConflictInfo {
  references: { workflowId: string; stageName: string }[];
  agentId: string;
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

  function startCreate() {
    setEditor({ ...BLANK_EDITOR });
    setSaveError(null);
  }

  function startEdit(agent: Agent) {
    const { choice, custom } = modelToChoice(agent.model);
    setEditor({
      id: agent.id,
      displayName: agent.displayName,
      choice,
      customModel: custom,
      prompt: agent.prompt,
    });
    setSaveError(null);
  }

  async function handleSave() {
    if (!editor) return;
    const name = editor.displayName.trim();
    if (!name) {
      setSaveError('Name is required');
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
          body: JSON.stringify({ displayName: name, model, prompt: editor.prompt }),
        });
        if (!res.ok) {
          const msg = await res.text();
          throw new Error(msg || `Create failed (${res.status})`);
        }
      } else {
        const res = await fetch(`/api/agents/${encodeURIComponent(editor.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name, model, prompt: editor.prompt }),
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
                : 'Name, model, and prompt can be edited. The id is immutable.'}
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
              <label className="text-xs font-medium text-muted-foreground">Model</label>
              <select
                value={editor.choice}
                onChange={(e) =>
                  setEditor((curr) =>
                    curr ? { ...curr, choice: e.target.value as ModelChoice } : curr
                  )
                }
                className={cn(
                  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring'
                )}
              >
                {CURATED_MODELS.map((m) => (
                  <option key={m.value || 'default'} value={m.value || 'default'}>
                    {m.label}
                  </option>
                ))}
                <option value="other">Other…</option>
              </select>
              {editor.choice === 'other' && (
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
