'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronUp, Folder, Plus, RefreshCcw, Trash2, Edit3 } from 'lucide-react';
import type { Workspace } from '@/types/workspace';

interface BrowseEntry {
  name: string;
  absolutePath: string;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  home: string;
}

function FolderBrowser({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string) => void;
}) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (target?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = target ? `/api/workspaces/browse?path=${encodeURIComponent(target)}` : '/api/workspaces/browse';
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Failed to browse (${res.status})`);
        return;
      }
      const body = (await res.json()) as BrowseResponse;
      setData(body);
      onChange(body.path);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Browse failed');
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  useEffect(() => {
    load(value || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border border-border rounded-md">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!data?.parent || loading}
          onClick={() => data?.parent && load(data.parent)}
        >
          <ChevronUp className="w-4 h-4 mr-1" /> Up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => load(data?.path)}
        >
          <RefreshCcw className="w-4 h-4" />
        </Button>
        <div className="truncate text-xs text-muted-foreground flex-1">{data?.path ?? '…'}</div>
      </div>
      {error && <div className="px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="max-h-60 overflow-y-auto">
        {data?.entries.length === 0 && !loading && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No subdirectories.</div>
        )}
        {data?.entries.map((entry) => (
          <button
            key={entry.absolutePath}
            type="button"
            onClick={() => load(entry.absolutePath)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
          >
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkspaceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Workspace;
  onSave: (input: { name: string; absolutePath: string }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [absolutePath, setAbsolutePath] = useState(initial?.absolutePath ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const err = await onSave({ name: name.trim(), absolutePath: absolutePath.trim() });
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} className="space-y-4 border border-border rounded-md p-4 bg-card">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Absolute Path</label>
        <Input
          value={absolutePath}
          onChange={(e) => setAbsolutePath(e.target.value)}
          placeholder="/Users/you/projects/my-workspace"
          required
        />
      </div>
      <FolderBrowser value={absolutePath} onChange={setAbsolutePath} />
      {error && <div className="text-sm text-destructive">{error}</div>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

export default function WorkspacesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading…</div>}>
      <WorkspacesPageInner />
    </Suspense>
  );
}

function WorkspacesPageInner() {
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(searchParams.get('new') === '1');
  const [editing, setEditing] = useState<Workspace | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      if (Array.isArray(data)) setWorkspaces(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (input: { name: string; absolutePath: string }): Promise<string | null> => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.message ?? `Create failed (${res.status})`;
    }
    setCreating(false);
    await load();
    return null;
  };

  const update = async (id: string, input: { name: string; absolutePath: string }): Promise<string | null> => {
    const res = await fetch(`/api/workspaces/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return body.message ?? `Update failed (${res.status})`;
    }
    setEditing(null);
    await load();
    return null;
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this workspace entry? (The on-disk directory is not deleted.)')) return;
    const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    if (res.ok) await load();
  };

  const activate = async (id: string) => {
    const res = await fetch(`/api/workspaces/${id}/activate`, { method: 'POST' });
    if (res.ok) {
      window.location.reload();
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Manage the workspaces available to this nos server. Active selection is per-browser.
          </p>
        </div>
        {!creating && !editing && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Workspace
          </Button>
        )}
      </div>

      {creating && (
        <div className="mb-6">
          <WorkspaceForm onSave={create} onCancel={() => setCreating(false)} />
        </div>
      )}

      {editing && (
        <div className="mb-6">
          <WorkspaceForm
            initial={editing}
            onSave={(input) => update(editing.id, input)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="space-y-2">
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && workspaces.length === 0 && !creating && (
          <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
            No workspaces yet. Create one to get started.
          </div>
        )}
        {workspaces.map((w) => (
          <div key={w.id} className="flex items-center gap-3 border border-border rounded-md p-3">
            <Folder className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{w.name}</div>
              <div className="text-xs text-muted-foreground truncate">{w.absolutePath}</div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => activate(w.id)}>
              Activate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(w)}>
              <Edit3 className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(w.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
