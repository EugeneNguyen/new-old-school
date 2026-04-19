"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquare, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionSummary } from '@/types/session';

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to textarea fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

interface SessionPanelProps {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  isLoading: boolean;
}

export default function SessionPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isLoading,
}: SessionPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyCommand = async (
    event: React.MouseEvent<HTMLButtonElement>,
    sessionId: string,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const ok = await copyToClipboard(`claude --resume ${sessionId}`);
    if (ok) {
      setCopiedId(sessionId);
      setTimeout(() => {
        setCopiedId((current) => (current === sessionId ? null : current));
      }, 1500);
    }
  };

  return (
    <div className="w-72 shrink-0 h-full min-h-0 flex flex-col bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <span className="text-sm font-medium text-zinc-300">Sessions</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewSession}
          className="h-7 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <Plus className="w-4 h-4 mr-1" />
          New
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 h-full w-full">
        <div>
          {isLoading && sessions.length === 0 && (
            <div className="flex items-center justify-center py-8 text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}

          {!isLoading && sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-600 text-xs">
              No sessions yet. Start a conversation.
            </div>
          )}

          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isCopied = copiedId === session.id;
            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSession(session.id);
                  }
                }}
                className={cn(
                  "group relative w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors cursor-pointer",
                  "hover:bg-zinc-800/50 focus:outline-none focus-visible:bg-zinc-800/50",
                  isActive
                    ? "bg-zinc-800/50 border-l-2 border-l-blue-400"
                    : "border-l-2 border-l-transparent"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {session.isRunning && (
                      <span
                        role="status"
                        aria-label="Running"
                        title="Running"
                        className="relative inline-flex shrink-0 h-2 w-2"
                      >
                        <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                        <span className="sr-only">Running</span>
                      </span>
                    )}
                    <span className="font-mono text-xs text-zinc-400 truncate">
                      {session.id.slice(0, 8)}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600">
                    {formatRelativeTime(session.updatedAt)}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {session.preview}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {session.turnCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-zinc-800 text-zinc-500 border-zinc-700">
                      <MessageSquare className="w-2.5 h-2.5 mr-1" />
                      {session.turnCount}
                    </Badge>
                  )}
                  {session.model && (
                    <span className="text-[10px] text-zinc-600 truncate">
                      {session.model}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => handleCopyCommand(e, session.id)}
                  title={isCopied ? 'Copied!' : 'Copy resume command'}
                  aria-label={isCopied ? 'Copied resume command' : 'Copy resume command'}
                  className={cn(
                    "absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded",
                    "text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors",
                    "opacity-0 group-hover:opacity-100 focus:opacity-100",
                    isCopied && "opacity-100 text-green-400 hover:text-green-400"
                  )}
                >
                  {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
