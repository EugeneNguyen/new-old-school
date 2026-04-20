"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MessageSquare, X, Plus, Square, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const SESSION_STORAGE_KEY = 'nos:chat-widget-session-id';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasDefaultAgent, setHasDefaultAgent] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hide on terminal page — redundant with the full terminal UI
  const hidden =
    pathname === '/dashboard/terminal' || pathname.startsWith('/dashboard/terminal/');

  // Load persisted session ID from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) setSessionId(stored);
  }, []);

  // Persist session ID to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionId) {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [sessionId]);

  // Check if a default agent is configured
  useEffect(() => {
    fetch('/api/settings/default-agent')
      .then((r) => r.json())
      .then((data: { adapter: string | null }) => setHasDefaultAgent(!!data.adapter))
      .catch(() => setHasDefaultAgent(null));
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const processStream = useCallback(async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    assistantId: string,
  ) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr) as Record<string, unknown>;

          if (
            event.type === 'assistant' &&
            event.message &&
            typeof event.message === 'object'
          ) {
            const msg = event.message as { content?: Array<{ type: string; text?: string }> };
            for (const block of msg.content ?? []) {
              if (block.type === 'text' && typeof block.text === 'string') {
                accumulated = block.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m,
                  ),
                );
              }
            }
          }

          if (event.type === 'result') {
            if (typeof event.session_id === 'string') setSessionId(event.session_id);
            if (typeof event.result === 'string' && !accumulated) {
              accumulated = event.result;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m,
                ),
              );
            }
          }

          if (event.type === 'error' && typeof event.message === 'string') {
            accumulated += `\n[Error: ${event.message}]`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated } : m,
              ),
            );
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    return accumulated;
  }, []);

  const sendMessage = useCallback(
    async (prompt: string, retryWithNewSession = false) => {
      setIsThinking(true);

      const currentSessionId = retryWithNewSession ? null : sessionId;
      const userMsg: ChatMessage = { id: generateId(), role: 'user', content: prompt };
      const assistantId = generateId();
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);

      try {
        abortRef.current = new AbortController();

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, sessionId: currentSessionId }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          // Stale session — retry once without the stored session ID
          if (!retryWithNewSession && currentSessionId) {
            setSessionId(null);
            setMessages((prev) =>
              prev.filter((m) => m.id !== assistantId && m.id !== userMsg.id),
            );
            setIsThinking(false);
            await sendMessage(prompt, true);
            return;
          }
          const errData = (await response.json().catch(() => ({}))) as { message?: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${errData.message ?? 'Request failed'}` }
                : m,
            ),
          );
          setIsThinking(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const accumulated = await processStream(reader, assistantId);

        if (!accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: '(No response received)' } : m,
            ),
          );
        }
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        if (!isAbort) {
          const msg = err instanceof Error ? err.message : 'Failed to connect';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `Error: ${msg}` } : m,
            ),
          );
        }
      } finally {
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [sessionId, processStream],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    const prompt = input.trim();
    setInput('');
    await sendMessage(prompt);
  };

  const handleNewSession = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSessionId(null);
    setIsThinking(false);
    setInput('');
  };

  const handleStop = async () => {
    if (abortRef.current) abortRef.current.abort();
    if (sessionId) {
      await fetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    setIsThinking(false);
  };

  if (hidden) return null;

  return (
    // FAB position: bottom-24 = 6rem, right-6 = 1.5rem (above toast zone)
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <Card
          role="dialog"
          aria-label="Chat"
          className="w-96 shadow-2xl border border-border bg-background flex flex-col overflow-hidden"
          style={{ maxHeight: '70vh' }}
        >
          <CardHeader className="p-3 border-b flex flex-row items-center justify-between gap-2 space-y-0 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {sessionId ? `Session ${sessionId.slice(0, 8)}` : 'New chat'}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isThinking && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label="Stop"
                  title="Stop"
                  onClick={handleStop}
                >
                  <Square className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="New session"
                title="New session"
                onClick={handleNewSession}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Close chat"
                title="Close"
                onClick={() => setIsOpen(false)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0 flex-1 min-h-0 flex flex-col" style={{ minHeight: 0 }}>
            <ScrollArea ref={scrollRef} className="flex-1 min-h-0" style={{ minHeight: '8rem' }}>
              <div className="p-3 space-y-3 text-sm">
                {messages.length === 0 && hasDefaultAgent === false && (
                  <p className="text-muted-foreground text-xs">
                    No default agent configured.{' '}
                    <a href="/dashboard/settings" className="underline hover:text-foreground">
                      Go to Settings → Agents to set one.
                    </a>
                  </p>
                )}
                {messages.length === 0 && hasDefaultAgent !== false && (
                  <p className="text-muted-foreground text-xs">
                    Ask anything. Your session persists across the dashboard.
                  </p>
                )}
                {messages.map((msg) => (
                  <div key={msg.id}>
                    {msg.role === 'system' ? (
                      <p className="text-muted-foreground text-xs italic">{msg.content}</p>
                    ) : (
                      <div
                        className={cn(
                          'rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words',
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground ml-8'
                            : 'bg-muted text-foreground mr-8',
                        )}
                      >
                        {msg.content ||
                          (isThinking &&
                            msg.role === 'assistant' &&
                            msg.id === messages[messages.length - 1]?.id ? (
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Thinking...
                              </span>
                            ) : null)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {hasDefaultAgent !== false && (
              <form
                onSubmit={handleSubmit}
                className="p-2 border-t flex gap-2 shrink-0"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask something..."
                  aria-label="Message"
                  className="h-8 text-xs"
                  disabled={isThinking}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Send"
                  disabled={isThinking || !input.trim()}
                >
                  {isThinking
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        size="icon"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setIsOpen((o) => !o)}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
      </Button>
    </div>
  );
}
