'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CalendarClock, AlertCircle } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface RoutineConfig {
  enabled: boolean;
  cron: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
}

export function RoutineSettingsDialog({
  open,
  onOpenChange,
  workflowId,
}: Props) {
  const [cron, setCron] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);

  const prevOpenRef = useRef(false);
  const workflowIdRef = useRef(workflowId);
  workflowIdRef.current = workflowId;

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!wasOpen && open) {
      setLoading(true);
      setError(null);
      fetch(`/api/workflows/${encodeURIComponent(workflowIdRef.current)}/routine`)
        .then((res) => res.json())
        .then((data: RoutineConfig) => {
          setCron(data.cron ?? '');
          setEnabled(data.enabled ?? false);
          setCronError(null);
        })
        .catch(() => setError('Failed to load routine settings'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  function handleCronChange(value: string) {
    setCron(value);
    if (!value.trim()) {
      setCronError(null);
    }
  }

  async function handleSave() {
    if (enabled && cron.trim() && !isValidCronFormat(cron.trim())) {
      setCronError('Invalid cron format. Use: minute hour dom month dow (e.g. "0 9 * * *" for daily at 9:00 AM)');
      return;
    }

    setSaving(true);
    setError(null);
    setCronError(null);

    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowIdRef.current)}/routine`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled, cron: cron.trim() }),
        }
      );

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? 'Failed to save routine settings');
        return;
      }

      onOpenChange(false);
    } catch {
      setError('Failed to save routine settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
        <div className="relative z-50 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Routine Mode</h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Routine Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically create items on a schedule
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEnabled(!enabled)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    enabled ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              <div className={cn('flex flex-col gap-2', !enabled && 'opacity-50')}>
                <label className="text-sm font-medium">
                  Cron Expression
                  <span className="ml-1 text-xs text-muted-foreground">(minute hour dom month dow)</span>
                </label>
                <Input
                  value={cron}
                  onChange={(e) => handleCronChange(e.target.value)}
                  placeholder="0 9 * * *"
                  disabled={!enabled}
                  className={cn('font-mono', cronError && 'border-destructive')}
                />
                {cronError && (
                  <div className="flex items-center gap-1 text-sm text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {cronError}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Examples: <code className="text-xs">0 9 * * *</code> = daily at 9:00 AM,{' '}
                  <code className="text-xs">0 */4 * * *</code> = every 4 hours,{' '}
                  <code className="text-xs">30 8 * * 1-5</code> = weekdays at 8:30 AM
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function isValidCronFormat(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5;
}
