"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SessionPanel from '@/components/terminal/SessionPanel';
import type { SessionSummary, SessionHistory } from '@/types/session';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export default function ClaudeTerminal() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchSessions = useCallback(async () => {
    try {
      setIsLoadingSessions(true);
      const res = await fetch('/api/claude/sessions');
      if (res.ok) {
        const data: SessionSummary[] = await res.json();
        setSessions(data);
      }
    } catch {
      // silently fail
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const loadSession = async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    setIsThinking(false);
    setSessionId(id);

    try {
      const res = await fetch(`/api/claude/sessions?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setMessages([{
          id: crypto.randomUUID(),
          role: 'system',
          content: 'Failed to load session history.',
          timestamp: new Date().toLocaleTimeString(),
        }]);
        return;
      }

      const history: SessionHistory = await res.json();
      const loaded: ChatMessage[] = [];

      if (history.messages.length > 0) {
        loaded.push({
          id: crypto.randomUUID(),
          role: 'system',
          content: '--- Resumed session. Showing previous assistant responses. ---',
          timestamp: '',
        });

        for (const msg of history.messages) {
          loaded.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: msg.content,
            timestamp: '',
          });
        }
      }

      setMessages(loaded);
    } catch {
      setMessages([{
        id: crypto.randomUUID(),
        role: 'system',
        content: 'Error loading session.',
        timestamp: new Date().toLocaleTimeString(),
      }]);
    }
  };

  const createNewSession = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSessionId(null);
    setIsThinking(false);
    setInput('');
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;

    const prompt = input.trim();
    setInput('');
    setIsThinking(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);

    try {
      abortRef.current = new AbortController();

      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const errData = await response.json();
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `Error: ${errData.message || 'Request failed'}` }
              : m
          )
        );
        setIsThinking(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

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
            const event = JSON.parse(jsonStr);

            if (event.type === 'assistant' && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === 'text') {
                  accumulated = block.text;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId ? { ...m, content: accumulated } : m
                    )
                  );
                }
              }
            }

            if (event.type === 'result') {
              if (event.session_id) {
                setSessionId(event.session_id);
              }
              if (event.result && !accumulated) {
                accumulated = event.result;
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId ? { ...m, content: accumulated } : m
                  )
                );
              }
            }

            if (event.type === 'error') {
              accumulated += `\n[Error: ${event.message}]`;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: accumulated } : m
                )
              );
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      if (!accumulated) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, content: '(No response received)' } : m
          )
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `Error: ${err.message || 'Failed to connect'}` }
              : m
          )
        );
      }
    } finally {
      setIsThinking(false);
      abortRef.current = null;
      fetchSessions();
    }
  };

  return (
    <div className="p-8 space-y-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Claude Terminal</h1>
          <p className="text-muted-foreground">
            Chat with Claude Code directly from your dashboard.
          </p>
        </div>
        <Button
          onClick={createNewSession}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Session
        </Button>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        <SessionPanel
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={loadSession}
          onNewSession={createNewSession}
          isLoading={isLoadingSessions}
        />

        <Card className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 border-zinc-800 overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-zinc-400" />
              <CardTitle className="text-sm font-medium">
                claude {sessionId ? `— session ${sessionId.slice(0, 8)}` : '— new session'}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm" style={{ maxHeight: 'calc(100vh - 340px)' }}>
                {messages.length === 0 && (
                  <div className="text-zinc-500 italic">
                    Start a conversation with Claude. Your messages will be sent via the Claude Code CLI.
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className="space-y-1">
                    {msg.role === 'system' ? (
                      <div className="text-zinc-600 italic text-xs py-2">
                        {msg.content}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-zinc-400">
                          {msg.timestamp && (
                            <span className="text-zinc-600 text-xs">[{msg.timestamp}]</span>
                          )}
                          <span className={cn(
                            "text-xs font-bold uppercase",
                            msg.role === 'user' ? 'text-blue-400' : 'text-green-400'
                          )}>
                            {msg.role === 'user' ? 'you' : 'claude'}
                          </span>
                        </div>
                        <pre className={cn(
                          "pl-4 py-1 rounded whitespace-pre-wrap break-words",
                          msg.role === 'user' ? 'text-zinc-200' : 'text-zinc-300'
                        )}>
                          {msg.content || (isThinking && msg.role === 'assistant' ? '' : msg.content)}
                        </pre>
                        {isThinking && msg.role === 'assistant' && !msg.content && msg.id === messages[messages.length - 1]?.id && (
                          <div className="pl-4 flex items-center gap-2 text-zinc-500">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span className="text-xs">Claude is thinking...</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <form onSubmit={sendMessage} className="p-4 border-t border-zinc-800 flex gap-2 flex-shrink-0">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">&gt;</span>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Claude something..."
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 pl-7 focus:ring-zinc-600"
                  disabled={isThinking}
                />
              </div>
              <Button
                type="submit"
                disabled={isThinking || !input.trim()}
                className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
              >
                {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
