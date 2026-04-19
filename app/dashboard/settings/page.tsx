"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const MAX_BYTES = 65536;

export default function SettingsPage() {
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== initialContent;

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch('/api/settings/system-prompt');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Failed to load (${res.status})`);
        }
        const loaded = typeof data?.content === 'string' ? data.content : '';
        setContent(loaded);
        setInitialContent(loaded);
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }
    load();
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('http') || target.getAttribute('target') === '_blank') return;
      if (!window.confirm('You have unsaved changes. Leave this page?')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [isDirty]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    try {
      const res = await fetch('/api/settings/system-prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setInitialContent(content);
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const byteLen = new TextEncoder().encode(content).length;
  const overLimit = byteLen > MAX_BYTES;

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure project-level preferences for NOS.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Prompt</CardTitle>
          <CardDescription>
            Edit <code className="font-mono text-xs">.nos/system-prompt.md</code>.
            Changes apply to subsequent pipeline runs; in-flight sessions are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError && (
            <div className="p-3 bg-destructive/10 text-destructive border border-destructive rounded-md text-sm">
              Failed to load system prompt: {loadError}
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isLoading}
            spellCheck={false}
            className={cn(
              'w-full min-h-[400px] font-mono text-sm p-3 rounded-md border border-input bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring resize-y'
            )}
            placeholder={isLoading ? 'Loading…' : 'Enter system prompt…'}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className={cn(overLimit && 'text-destructive font-medium')}>
              {byteLen.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes
            </span>
            <span>
              {isDirty ? 'Unsaved changes' : 'No changes'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={isLoading || isSaving || !isDirty || overLimit}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            {savedFlash && (
              <span className="text-sm text-green-600 dark:text-green-500">Saved</span>
            )}
            {saveError && (
              <span className="text-sm text-destructive">Save failed: {saveError}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
