'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronUp, Folder, Plus, RefreshCcw, Trash2, Edit3, FileText, FileCode, FileImage, File, X, Search } from 'lucide-react';
import type { Workspace } from '@/types/workspace';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BrowseEntry {
  name: string;
  absolutePath: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  home: string;
}

interface PreviewResponse {
  name: string;
  path: string;
  size: number;
  modified: string;
  content: string | null;
  previewable: boolean;
  truncated: boolean;
}

function getFileIcon(name: string, isDirectory: boolean) {
  if (isDirectory) {
    return <Folder className="w-4 h-4 text-muted-foreground" />;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'txt', 'rst', 'doc', 'docx'].includes(ext)) {
    return <FileText className="w-4 h-4 text-blue-500" />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'json', 'yaml', 'yml', 'toml', 'css', 'html', 'xml'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-green-500" />;
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return <FileImage className="w-4 h-4 text-purple-500" />;
  }
  return <File className="w-4 h-4 text-muted-foreground" />;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function FilePreview({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/workspaces/preview?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.message ?? `Failed to preview (${res.status})`);
          return;
        }
        const body = (await res.json()) as PreviewResponse;
        setData(body);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [path]);

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40 shrink-0">
        <div className="truncate text-sm font-medium">{data?.name ?? 'Loading…'}</div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      {data && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/20 shrink-0">
          {formatSize(data.size)}
          {data.modified && ` • Modified ${formatDate(data.modified)}`}
        </div>
      )}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {loading && <div className="text-sm text-muted-foreground">Loading preview…</div>}
          {data && !data.previewable && (
            <div className="text-sm text-muted-foreground">Preview not available for this file type.</div>
          )}
          {data?.content !== null && data?.content !== undefined && (
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">
              {data.content}
              {data.truncated && (
                <span className="text-muted-foreground">{'\\n\\n[... file truncated, showing first 100 lines ...]'}</span>
              )}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FileExplorer({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string) => void;
}) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewFile, setPreviewFile] = useState<BrowseEntry | null>(null);

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

  const filteredEntries = data?.entries.filter((entry) =>
    entry.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const handleEntryClick = (entry: BrowseEntry) => {
    if (entry.isDirectory) {
      load(entry.absolutePath);
    } else {
      setPreviewFile(entry);
    }
  };

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
          <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </Button>
        <div className="truncate text-xs text-muted-foreground flex-1">{data?.path ?? '…'}</div>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      {error && <div className="px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className={cn('flex', previewFile && 'h-80 md:h-96')}>
        <ScrollArea className={cn('flex-1', previewFile && 'border-r border-border')}>
          <div className="max-h-60 md:max-h-80">
            {filteredEntries.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-muted-foreground">
                {search ? 'No matching files or folders.' : 'This directory is empty.'}
              </div>
            )}
            {filteredEntries.map((entry) => (
              <button
                key={entry.absolutePath}
                type="button"
                onClick={() => handleEntryClick(entry)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
              >
                {getFileIcon(entry.name, entry.isDirectory)}
                <span className="truncate flex-1">{entry.name}</span>
                {entry.isDirectory && <span className="text-xs text-muted-foreground">/</span>}
                {!entry.isDirectory && entry.size !== undefined && (
                  <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
        {previewFile && (
          <div className="w-1/2 min-w-48 hidden md:block">
            <FilePreview path={previewFile.absolutePath} onClose={() => setPreviewFile(null)} />
          </div>
        )}
      </div>
      {previewFile && (
        <div className="md:hidden border-t border-border">
          <FilePreview path={previewFile.absolutePath} onClose={() => setPreviewFile(null)} />
        </div>
      )}
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
      <FileExplorer value={absolutePath} onChange={setAbsolutePath} />
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
