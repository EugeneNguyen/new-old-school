"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useItemDoneSound } from '@/lib/hooks/use-item-done-sound';

const AUDIO_DONE_KEY = 'nos.notifications.audio.itemDone';

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

  const [heartbeatSeconds, setHeartbeatSeconds] = useState('');
  const [initialHeartbeatSeconds, setInitialHeartbeatSeconds] = useState('');
  const [isHeartbeatLoading, setIsHeartbeatLoading] = useState(true);
  const [isHeartbeatSaving, setIsHeartbeatSaving] = useState(false);
  const [heartbeatLoadError, setHeartbeatLoadError] = useState<string | null>(null);
  const [heartbeatSaveError, setHeartbeatSaveError] = useState<string | null>(null);
  const [heartbeatSavedFlash, setHeartbeatSavedFlash] = useState(false);
  const heartbeatFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = content !== initialContent;
  const isHeartbeatDirty = heartbeatSeconds !== initialHeartbeatSeconds;

  const [audioDoneEnabled, setAudioDoneEnabled] = useState(true);
  const playDoneSound = useItemDoneSound();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setAudioDoneEnabled(window.localStorage.getItem(AUDIO_DONE_KEY) !== '0');
    } catch {
      setAudioDoneEnabled(true);
    }
  }, []);

  const handleAudioDoneToggle = (next: boolean) => {
    setAudioDoneEnabled(next);
    try {
      window.localStorage.setItem(AUDIO_DONE_KEY, next ? '1' : '0');
    } catch {
      // Storage unavailable (private mode, quota); keep UI state regardless.
    }
  };

  const handleTestSound = () => {
    const prior = (() => {
      try {
        return window.localStorage.getItem(AUDIO_DONE_KEY);
      } catch {
        return null;
      }
    })();
    try {
      window.localStorage.setItem(AUDIO_DONE_KEY, '1');
      playDoneSound();
    } finally {
      try {
        if (prior === null) window.localStorage.removeItem(AUDIO_DONE_KEY);
        else window.localStorage.setItem(AUDIO_DONE_KEY, prior);
      } catch {
        // ignore
      }
    }
  };

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
    async function load() {
      setIsHeartbeatLoading(true);
      setHeartbeatLoadError(null);
      try {
        const res = await fetch('/api/settings/heartbeat');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || `Failed to load (${res.status})`);
        }
        const ms = typeof data?.intervalMs === 'number' ? data.intervalMs : 60000;
        const seconds = ms === 0 ? '0' : String(Math.round(ms / 1000));
        setHeartbeatSeconds(seconds);
        setInitialHeartbeatSeconds(seconds);
      } catch (err: unknown) {
        setHeartbeatLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsHeartbeatLoading(false);
      }
    }
    load();
    return () => {
      if (heartbeatFlashTimer.current) clearTimeout(heartbeatFlashTimer.current);
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

  const parsedSeconds = Number(heartbeatSeconds);
  const heartbeatValid =
    heartbeatSeconds.trim() !== '' &&
    Number.isFinite(parsedSeconds) &&
    Number.isInteger(parsedSeconds) &&
    parsedSeconds >= 0;

  const handleHeartbeatSave = async () => {
    if (!heartbeatValid) return;
    setIsHeartbeatSaving(true);
    setHeartbeatSaveError(null);
    setHeartbeatSavedFlash(false);
    try {
      const intervalMs = parsedSeconds * 1000;
      const res = await fetch('/api/settings/heartbeat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setInitialHeartbeatSeconds(heartbeatSeconds);
      setHeartbeatSavedFlash(true);
      if (heartbeatFlashTimer.current) clearTimeout(heartbeatFlashTimer.current);
      heartbeatFlashTimer.current = setTimeout(() => setHeartbeatSavedFlash(false), 2500);
    } catch (err: unknown) {
      setHeartbeatSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsHeartbeatSaving(false);
    }
  };

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

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Browser-side cues when workflow items change state. Preferences are stored
            in this browser only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <input
              id="audio-item-done"
              type="checkbox"
              checked={audioDoneEnabled}
              onChange={(e) => handleAudioDoneToggle(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <div className="flex-1">
              <label htmlFor="audio-item-done" className="text-sm font-medium">
                Play a sound when a task finishes
              </label>
              <p className="text-xs text-muted-foreground">
                Plays a short chime when an item moves from In Progress to Done.
                Doesn&apos;t play for changes you make yourself.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestSound}
            >
              Test sound
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto-advance heartbeat</CardTitle>
          <CardDescription>
            How often the background sweeper looks for <code className="font-mono text-xs">Done</code>{' '}
            items on stages with <code className="font-mono text-xs">autoAdvanceOnComplete</code>{' '}
            enabled and moves them to the next stage. Set to <code className="font-mono text-xs">0</code>{' '}
            to disable the sweeper (events still advance items in real time).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {heartbeatLoadError && (
            <div className="p-3 bg-destructive/10 text-destructive border border-destructive rounded-md text-sm">
              Failed to load heartbeat interval: {heartbeatLoadError}
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm" htmlFor="heartbeat-seconds">
              Interval (seconds)
            </label>
            <input
              id="heartbeat-seconds"
              type="number"
              min={0}
              step={1}
              value={heartbeatSeconds}
              onChange={(e) => setHeartbeatSeconds(e.target.value)}
              disabled={isHeartbeatLoading}
              className={cn(
                'w-24 font-mono text-sm px-3 py-2 rounded-md border border-input bg-background',
                'focus:outline-none focus:ring-2 focus:ring-ring'
              )}
            />
            <span className="text-xs text-muted-foreground">0 = disabled</span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleHeartbeatSave}
              disabled={isHeartbeatLoading || isHeartbeatSaving || !isHeartbeatDirty || !heartbeatValid}
            >
              {isHeartbeatSaving ? 'Saving…' : 'Save'}
            </Button>
            {heartbeatSavedFlash && (
              <span className="text-sm text-green-600 dark:text-green-500">Saved</span>
            )}
            {heartbeatSaveError && (
              <span className="text-sm text-destructive">Save failed: {heartbeatSaveError}</span>
            )}
            {!heartbeatValid && heartbeatSeconds.trim() !== '' && (
              <span className="text-sm text-destructive">Must be a non-negative integer</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
