'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { Check, ChevronDown, Folder, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Workspace } from '@/types/workspace';

const COOKIE_NAME = 'nos_workspace';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setWorkspaces(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchWorkspaces();
    setActiveId(readCookie(COOKIE_NAME));
  }, [fetchWorkspaces]);

  const activate = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${id}/activate`, { method: 'POST' });
        if (res.ok) {
          setActiveId(id);
          setOpen(false);
          window.location.href = '/dashboard';
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  return (
    <div className="px-2 pt-2 pb-3 border-b border-border relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className={cn(
          'flex w-full items-center gap-2 px-2 py-2 rounded-md text-left text-sm',
          'hover:bg-accent hover:text-accent-foreground transition-colors',
          collapsed && 'justify-center px-0'
        )}
        title={active?.name ?? 'No workspace'}
      >
        <Folder className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Workspace</div>
              <div className="truncate font-medium">
                {active ? active.name : workspaces.length === 0 ? 'None configured' : 'Select…'}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 shrink-0" />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="absolute left-2 right-2 top-full mt-1 z-30 rounded-md border border-border bg-popover shadow-md text-sm">
          <div className="max-h-64 overflow-y-auto py-1">
            {workspaces.length === 0 && (
              <div className="px-3 py-2 text-muted-foreground">No workspaces yet.</div>
            )}
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => activate(w.id)}
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground"
              >
                <Check
                  className={cn(
                    'w-3.5 h-3.5 shrink-0',
                    w.id === activeId ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{w.absolutePath}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-border py-1">
            <Link
              href="/dashboard/workspaces"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground"
            >
              <Settings className="w-3.5 h-3.5" />
              Manage workspaces
            </Link>
            <Link
              href="/dashboard/workspaces?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground"
            >
              <Plus className="w-3.5 h-3.5" />
              New workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
