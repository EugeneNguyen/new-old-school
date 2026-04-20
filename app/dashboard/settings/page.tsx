"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useItemDoneSound } from '@/lib/hooks/use-item-done-sound';
import {
  SETTINGS_KEYS,
  requestPermission,
  getPermissionState,
  setBrowserNotificationEnabled,
  setItemDoneNotificationEnabled,
  setItemFailedNotificationEnabled,
  setStageTransitionNotificationEnabled,
  setNewCommentNotificationEnabled,
  setToastMuted,
  isBrowserNotificationEnabled,
  isItemDoneNotificationEnabled,
  isItemFailedNotificationEnabled,
  isStageTransitionNotificationEnabled,
  isNewCommentNotificationEnabled,
  isToastMuted,
} from '@/lib/notifications';

const AUDIO_DONE_KEY = 'nos.notifications.audio.itemDone';

const MAX_BYTES = 65536;

type TabId = 'system-prompt' | 'heartbeat' | 'notifications' | 'adapter';

const TABS: { id: TabId; label: string }[] = [
  { id: 'system-prompt', label: 'System Prompt' },
  { id: 'heartbeat', label: 'Heartbeat Config' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'adapter', label: 'Adapter' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('system-prompt');
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

  // Browser notification state
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [onItemDone, setOnItemDone] = useState(true);
  const [onItemFailed, setOnItemFailed] = useState(true);
  const [onStageTransition, setOnStageTransition] = useState(false);
  const [onNewComment, setOnNewComment] = useState(false);
  const [toastMuted, setToastMuted] = useState(false);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('unsupported');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      setAudioDoneEnabled(window.localStorage.getItem(AUDIO_DONE_KEY) !== '0');
    } catch {
      setAudioDoneEnabled(true);
    }
  }, []);

  // Load browser notification settings
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setBrowserEnabled(isBrowserNotificationEnabled());
    setOnItemDone(isItemDoneNotificationEnabled());
    setOnItemFailed(isItemFailedNotificationEnabled());
    setOnStageTransition(isStageTransitionNotificationEnabled());
    setOnNewComment(isNewCommentNotificationEnabled());
    setToastMuted(isToastMuted());
    setPermissionState(getPermissionState());
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

  // Browser notification handlers
  const handleBrowserToggle = (next: boolean) => {
    setBrowserEnabled(next);
    setBrowserNotificationEnabled(next);
  };

  const handleItemDoneToggle = (next: boolean) => {
    setOnItemDone(next);
    setItemDoneNotificationEnabled(next);
  };

  const handleItemFailedToggle = (next: boolean) => {
    setOnItemFailed(next);
    setItemFailedNotificationEnabled(next);
  };

  const handleStageTransitionToggle = (next: boolean) => {
    setOnStageTransition(next);
    setStageTransitionNotificationEnabled(next);
  };

  const handleNewCommentToggle = (next: boolean) => {
    setOnNewComment(next);
    setNewCommentNotificationEnabled(next);
  };

  const handleToastMuteToggle = (next: boolean) => {
    setToastMuted(next);
    setToastMuted(next);
  };

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const result = await requestPermission();
      setPermissionState(result);
    } finally {
      setIsRequestingPermission(false);
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

  const handleTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = TABS[(idx + 1) % TABS.length];
      setActiveTab(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = TABS[(idx - 1 + TABS.length) % TABS.length];
      setActiveTab(prev.id);
      document.getElementById(`tab-${prev.id}`)?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveTab(TABS[0].id);
      document.getElementById(`tab-${TABS[0].id}`)?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveTab(TABS[TABS.length - 1].id);
      document.getElementById(`tab-${TABS[TABS.length - 1].id}`)?.focus();
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
          Configure project-level preferences for New Old-school.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Settings sections"
        className="flex flex-wrap gap-1 border-b"
      >
        {TABS.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={activeTab === t.id ? 0 : -1}
            onClick={() => setActiveTab(t.id)}
            onKeyDown={handleTabKey}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              activeTab === t.id
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="panel-system-prompt"
        aria-labelledby="tab-system-prompt"
        hidden={activeTab !== 'system-prompt'}
      >
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

      <div
        role="tabpanel"
        id="panel-heartbeat"
        aria-labelledby="tab-heartbeat"
        hidden={activeTab !== 'heartbeat'}
      >
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

      <div
        role="tabpanel"
        id="panel-notifications"
        aria-labelledby="tab-notifications"
        hidden={activeTab !== 'notifications'}
      >
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Browser-side cues when workflow items change state. Preferences are stored
              in this browser only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audio notification */}
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

            <div className="border-t my-4" />

            {/* Toast mute */}
            <div className="flex items-start gap-3">
              <input
                id="toast-mute"
                type="checkbox"
                checked={toastMuted}
                onChange={(e) => handleToastMuteToggle(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="flex-1">
                <label htmlFor="toast-mute" className="text-sm font-medium">
                  Mute non-error toasts
                </label>
                <p className="text-xs text-muted-foreground">
                  Hide success, info, and warning toasts. Error toasts remain visible.
                </p>
              </div>
            </div>

            <div className="border-t my-4" />

            {/* Browser notifications section */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Browser notifications</p>

              {/* Permission status and request */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Permission:{' '}
                    {permissionState === 'granted' && (
                      <span className="text-green-600 font-medium">Granted</span>
                    )}
                    {permissionState === 'denied' && (
                      <span className="text-red-600 font-medium">Denied — enable in browser settings</span>
                    )}
                    {permissionState === 'default' && (
                      <span className="text-amber-600 font-medium">Not yet requested</span>
                    )}
                    {permissionState === 'unsupported' && (
                      <span className="text-muted-foreground">Not supported in this browser</span>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRequestPermission}
                    disabled={isRequestingPermission || permissionState === 'unsupported'}
                  >
                    {isRequestingPermission
                      ? 'Requesting…'
                      : permissionState === 'granted'
                        ? 'Permission granted'
                        : permissionState === 'denied'
                          ? 'Blocked — reset in browser'
                          : 'Enable browser notifications'}
                  </Button>
                </div>
              </div>

              {/* Master toggle */}
              <div className="flex items-start gap-3">
                <input
                  id="browser-enabled"
                  type="checkbox"
                  checked={browserEnabled}
                  onChange={(e) => handleBrowserToggle(e.target.checked)}
                  disabled={permissionState !== 'granted'}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1">
                  <label htmlFor="browser-enabled" className="text-sm font-medium">
                    Enable browser notifications
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Show OS-level notifications when the tab is not focused.
                    {permissionState !== 'granted' && ' Requires permission first.'}
                  </p>
                </div>
              </div>

              {/* Per-event toggles */}
              <div className="ml-6 space-y-2">
                <div className="flex items-start gap-3">
                  <input
                    id="notify-item-done"
                    type="checkbox"
                    checked={onItemDone}
                    onChange={(e) => handleItemDoneToggle(e.target.checked)}
                    disabled={!browserEnabled}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="notify-item-done" className="text-sm">
                    Item done — when an item reaches Done
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input
                    id="notify-item-failed"
                    type="checkbox"
                    checked={onItemFailed}
                    onChange={(e) => handleItemFailedToggle(e.target.checked)}
                    disabled={!browserEnabled}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="notify-item-failed" className="text-sm">
                    Item failed — when an item fails
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input
                    id="notify-stage-transition"
                    type="checkbox"
                    checked={onStageTransition}
                    onChange={(e) => handleStageTransitionToggle(e.target.checked)}
                    disabled={!browserEnabled}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="notify-stage-transition" className="text-sm">
                    Stage transition — when an item moves to a new stage
                  </label>
                </div>
                <div className="flex items-start gap-3">
                  <input
                    id="notify-new-comment"
                    type="checkbox"
                    checked={onNewComment}
                    onChange={(e) => handleNewCommentToggle(e.target.checked)}
                    disabled={!browserEnabled}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="notify-new-comment" className="text-sm">
                    New comment — when a comment is added
                  </label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div
        role="tabpanel"
        id="panel-adapter"
        aria-labelledby="tab-adapter"
        hidden={activeTab !== 'adapter'}
      >
        <DefaultAgentSettings />
      </div>
    </div>
  );
}

const OTHER_MODEL_SENTINEL = '__other__';
const MODELS_FETCH_TIMEOUT_MS = 5000;

function resolveModel(choice: string, customModel: string): string | null {
  if (choice === '') return null;
  if (choice === OTHER_MODEL_SENTINEL) return customModel.trim() || null;
  return choice;
}

interface AdapterOption {
  name: string;
  label: string;
}

interface ModelOption {
  id: string;
  label: string;
}

function DefaultAgentSettings() {
  const [adapters, setAdapters] = useState<AdapterOption[]>([]);
  const [adaptersLoading, setAdaptersLoading] = useState(true);
  const [adaptersError, setAdaptersError] = useState<string | null>(null);

  const [selectedAdapter, setSelectedAdapter] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');

  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelWarning, setModelWarning] = useState<string | null>(null);
  const [adapterWarning, setAdapterWarning] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const saveFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelsFetchId = useRef(0);
  const storedAdapterRef = useRef('');
  const storedModelRef = useRef<string | null>(null);

  const initialLoadDone = useRef(false);

  const loadAdapters = useCallback(async () => {
    try {
      const res = await fetch('/api/adapters', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load adapters (${res.status})`);
      const data = (await res.json()) as { adapters?: AdapterOption[] };
      const list = Array.isArray(data.adapters) ? data.adapters : [];
      setAdapters(list);
      setAdaptersError(null);
    } catch (err) {
      setAdapters([{ name: 'claude', label: 'Claude CLI' }]);
      setAdaptersError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdaptersLoading(false);
    }
  }, []);

  const loadModels = useCallback(async (adapter: string): Promise<ModelOption[]> => {
    if (!adapter) {
      setModels([]);
      setModelsLoading(false);
      return [];
    }
    const requestId = ++modelsFetchId.current;
    setModelsLoading(true);
    setModelsError(null);
    setModels([]);
    setModelWarning(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODELS_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/adapters/${encodeURIComponent(adapter)}/models`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as { models?: ModelOption[] };
      if (requestId !== modelsFetchId.current) return [];
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      setModelsError(null);
      return list;
    } catch {
      if (requestId !== modelsFetchId.current) return [];
      const fallback: ModelOption[] = [{ id: OTHER_MODEL_SENTINEL, label: 'Other (custom model id)' }];
      setModels(fallback);
      setModelsError('Could not load model list');
      return fallback;
    } finally {
      if (requestId === modelsFetchId.current) {
        clearTimeout(timer);
        setModelsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        await loadAdapters();
        const res = await fetch('/api/settings/default-agent');
        const data = (await res.json()) as { adapter?: string | null; model?: string | null; error?: string };
        if (!res.ok) throw new Error(data?.error ?? 'Failed to load defaults');

        const savedAdapter = data.adapter ?? '';
        setSelectedAdapter(savedAdapter);

        if (savedAdapter) {
          const loadedModels = await loadModels(savedAdapter);
          const savedModel = data.model ?? '';
          if (savedModel && !loadedModels.some((m) => m.id === savedModel)) {
            setSelectedModel(OTHER_MODEL_SENTINEL);
            setCustomModel(savedModel);
            storedModelRef.current = savedModel;
          } else {
            setSelectedModel(savedModel);
            setCustomModel('');
            storedModelRef.current = savedModel || null;
          }
        } else {
          setSelectedAdapter('');
          setSelectedModel('');
          setCustomModel('');
          storedModelRef.current = null;
        }
        storedAdapterRef.current = savedAdapter;
        initialLoadDone.current = true;
      } catch (err) {
        setAdaptersError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [loadAdapters, loadModels]);

  const handleAdapterChange = async (nextAdapter: string) => {
    setSelectedAdapter(nextAdapter);
    setSelectedModel('');
    setCustomModel('');
    setAdapterWarning(null);
    setModelWarning(null);
    if (nextAdapter) {
      await loadModels(nextAdapter);
    } else {
      setModels([]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    try {
      const resolved = resolveModel(selectedModel, customModel);
      const body: Record<string, string | null> = {};
      if (selectedAdapter) {
        body.adapter = selectedAdapter;
        body.model = resolved;
      } else {
        body.adapter = null;
        body.model = null;
      }
      const res = await fetch('/api/settings/default-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`);
      }
      setSavedFlash(true);
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
      saveFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setSelectedAdapter('');
    setSelectedModel('');
    setCustomModel('');
    setAdapterWarning(null);
    setModelWarning(null);
    setModels([]);
    setIsSaving(true);
    setSaveError(null);
    setSavedFlash(false);
    try {
      const res = await fetch('/api/settings/default-agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapter: null, model: null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Clear failed (${res.status})`);
      }
      setSavedFlash(true);
      if (saveFlashTimer.current) clearTimeout(saveFlashTimer.current);
      saveFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const isDirty =
    selectedAdapter !== storedAdapterRef.current ||
    resolveModel(selectedModel, customModel) !== storedModelRef.current ||
    (selectedModel === OTHER_MODEL_SENTINEL && !customModel.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Agent Settings</CardTitle>
        <CardDescription>
          Pre-fill the adapter and model when creating a new agent. The values are used as
          defaults in the agent creation form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {adaptersError && !adaptersLoading && (
          <div className="p-3 bg-destructive/10 text-destructive border border-destructive rounded-md text-sm">
            Failed to load adapters: {adaptersError}
          </div>
        )}
        {adapterWarning && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-md text-sm">
            {adapterWarning}
          </div>
        )}
        {modelWarning && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-md text-sm">
            {modelWarning}
          </div>
        )}
        <div className="flex items-center gap-3">
          <label className="text-sm" htmlFor="default-adapter">
            Default adapter
          </label>
          <select
            id="default-adapter"
            value={selectedAdapter}
            onChange={(e) => handleAdapterChange(e.target.value)}
            disabled={adaptersLoading || isLoading}
            className={cn(
              'flex-1 max-w-[200px] font-mono text-sm px-3 py-2 rounded-md border border-input bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="">No default</option>
            {adapters.map((a) => (
              <option key={a.name} value={a.name}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm" htmlFor="default-model">
            Default model
          </label>
          <select
            id="default-model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={!selectedAdapter || modelsLoading || isLoading}
            className={cn(
              'flex-1 max-w-[250px] font-mono text-sm px-3 py-2 rounded-md border border-input bg-background',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            {!selectedAdapter && <option>Select an adapter first</option>}
            {modelsLoading && <option>Loading models…</option>}
            {!modelsLoading && models.length > 0 && (
              <>
                <option value="">Adapter default</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </>
            )}
          </select>
          {modelsError && !modelsLoading && (
            <span className="text-xs text-destructive">{modelsError}</span>
          )}
          {selectedModel === OTHER_MODEL_SENTINEL && (
            <Input
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              placeholder="custom-model-id"
              className="flex-1 max-w-[250px] font-mono"
              aria-label="Custom model id"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isLoading || isSaving || !isDirty}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" onClick={handleClear} disabled={isLoading || isSaving || (!selectedAdapter && !selectedModel)}>
            Clear
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
  );
}
