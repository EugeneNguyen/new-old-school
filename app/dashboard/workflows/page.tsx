'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Workflow } from '@/types/workflow';

const ID_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PREFIX_REGEX = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;

interface FormState {
  id: string;
  name: string;
  idPrefix: string;
}

function validateId(v: string): string | null {
  if (!v.trim()) return null;
  if (!ID_REGEX.test(v.trim())) return 'Must match ^[a-z0-9][a-z0-9_-]{0,63}$';
  return null;
}

function validatePrefix(v: string): string | null {
  if (!v.trim()) return null;
  if (!PREFIX_REGEX.test(v.trim())) return 'Must match ^[A-Z0-9][A-Z0-9_-]{0,15}$';
  return null;
}

function validateName(v: string): string | null {
  if (!v.trim()) return 'Name is required';
  if (v.trim().length > 128) return 'Name must be 128 characters or fewer';
  return null;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ id: '', name: '', idPrefix: '' });
  const [fieldErrors, setFieldErrors] = useState<{ id: string | null; name: string | null; idPrefix: string | null }>({
    id: null, name: null, idPrefix: null,
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/workflows', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as Workflow[];
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreate() {
    setForm({ id: '', name: '', idPrefix: '' });
    setFieldErrors({ id: null, name: null, idPrefix: null });
    setCreateError(null);
    setShowCreate(true);
  }

  function closeCreate() {
    if (creating) return;
    setShowCreate(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    if (key === 'id') {
      const v = value.trim();
      setFieldErrors((e) => ({ ...e, id: v ? validateId(v) : null }));
    } else if (key === 'idPrefix') {
      const v = value.trim();
      setFieldErrors((e) => ({ ...e, idPrefix: v ? validatePrefix(v) : null }));
    } else if (key === 'name') {
      const v = value.trim();
      setFieldErrors((e) => ({ ...e, name: v ? validateName(v) : null }));
    }
  }

  const createDisabled =
    creating ||
    !form.id.trim() ||
    !form.name.trim() ||
    !form.idPrefix.trim() ||
    !!validateId(form.id.trim()) ||
    !!validatePrefix(form.idPrefix.trim()) ||
    !!validateName(form.name.trim());

  async function handleCreate() {
    const idErr = validateId(form.id.trim());
    const nameErr = validateName(form.name.trim());
    const prefixErr = validatePrefix(form.idPrefix.trim());
    if (idErr || nameErr || prefixErr) {
      setFieldErrors({ id: idErr, name: nameErr, idPrefix: prefixErr });
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id.trim(),
          name: form.name.trim(),
          idPrefix: form.idPrefix.trim(),
        }),
      });
      if (res.status === 201) {
        setShowCreate(false);
        await reload();
        return;
      }
      if (res.status === 409) {
        setFieldErrors((e) => ({ ...e, id: 'A workflow with this ID already exists' }));
        return;
      }
      let msg = `Create failed (${res.status})`;
      try {
        const data = (await res.json()) as { message?: string };
        if (data?.message) msg = data.message;
      } catch { /* ignore */ }
      setCreateError(msg);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 204) {
        setPendingDeleteId(null);
        await reload();
        return;
      }
      let msg = `Delete failed (${res.status})`;
      try {
        const data = (await res.json()) as { message?: string };
        if (data?.message) msg = data.message;
      } catch { /* ignore */ }
      setDeleteError(msg);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const deletingThis = pendingDeleteId !== null;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
          <p className="text-muted-foreground">
            Manage kanban-style workflow pipelines. Each workflow has its own stages and item backlog.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          New workflow
        </Button>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workflows.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground italic">
              No workflows yet. Create one to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {workflows.map((wf) => (
                <li key={wf.id} className="flex items-center justify-between gap-3 py-3">
                  <Link
                    href={`/dashboard/workflows/${wf.id}`}
                    className="min-w-0 flex-1 text-left hover:underline"
                  >
                    <p className="text-sm font-medium">{wf.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{wf.id}</p>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingDeleteId(wf.id)}
                    disabled={deletingThis}
                    aria-label={`Delete ${wf.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>New workflow</CardTitle>
            <CardDescription>
              Fill in all three fields to create a new workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="wf-id">
                id
              </label>
              <Input
                id="wf-id"
                value={form.id}
                onChange={(e) => setField('id', e.target.value)}
                placeholder="e.g. bugs, tasks, reqs"
                autoComplete="off"
              />
              {fieldErrors.id && (
                <p className="text-xs text-destructive">{fieldErrors.id}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Lowercase letters, digits, dash, underscore. Used as the folder name.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="wf-name">
                name
              </label>
              <Input
                id="wf-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. Bug Tracker"
                autoComplete="off"
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive">{fieldErrors.name}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="wf-prefix">
                idPrefix
              </label>
              <Input
                id="wf-prefix"
                value={form.idPrefix}
                onChange={(e) => setField('idPrefix', e.target.value)}
                placeholder="e.g. BUG, TASK, REQ"
                autoComplete="off"
              />
              {fieldErrors.idPrefix && (
                <p className="text-xs text-destructive">{fieldErrors.idPrefix}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Uppercase letters, digits, dash, underscore. Prefix for item IDs (e.g. BUG-001).
              </p>
            </div>

            {createError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeCreate} disabled={creating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createDisabled}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingDeleteId !== null && (
        (() => {
          const wf = workflows.find((w) => w.id === pendingDeleteId);
          return (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle>Delete workflow</CardTitle>
                <CardDescription>
                  {wf ? (
                    <>
                      Are you sure you want to delete{' '}
                      <strong>&apos;{wf.name}&apos;</strong> ({wf.id})? This will permanently remove
                      all items in this workflow. This action cannot be undone.
                    </>
                  ) : (
                    <>This action cannot be undone.</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {deleteError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPendingDeleteId(null)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleDelete(pendingDeleteId)}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()
      )}
    </div>
  );
}
