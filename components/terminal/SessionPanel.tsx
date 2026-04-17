"use client";

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, MessageSquare, Loader2 } from 'lucide-react';
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
  return (
    <div className="w-72 flex-shrink-0 flex flex-col bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
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

      <ScrollArea className="flex-1">
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
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
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-zinc-800/50 transition-colors",
                  "hover:bg-zinc-800/50",
                  isActive
                    ? "bg-zinc-800/50 border-l-2 border-l-blue-400"
                    : "border-l-2 border-l-transparent"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-zinc-400">
                    {session.id.slice(0, 8)}
                  </span>
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
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
