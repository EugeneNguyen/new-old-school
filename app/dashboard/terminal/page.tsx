"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Send, Plus, Loader2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import SessionPanel from '@/components/terminal/SessionPanel';
import type { SessionSummary, SessionHistory } from '@/types/session';
import type { InteractiveQuestion } from '@/types/question';
import { useSlashComplete } from '@/hooks/useSlashComplete';
import SlashPopup from '@/components/terminal/SlashPopup';
import QuestionCard from '@/components/terminal/QuestionCard';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  interactiveQuestions?: InteractiveQuestion[];
  questionsAnswered?: boolean;
  answeredWith?: string[];
}

export default function ClaudeTerminal() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { isOpen: slashOpen, filteredSkills, activeIndex, handleKeyDown } = useSlashComplete({
    input,
    onSelect: (value) => setInput(value),
  });

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

  const refreshSessionsSilently = useCallback(async () => {
    try {
      const res = await fetch('/api/claude/sessions');
      if (res.ok) {
        const data: SessionSummary[] = await res.json();
        setSessions(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    return () => { abortRef.current?.abort(); };
  }, [fetchSessions]);

  const hasRunningSession = sessions.some((s) => s.isRunning);

  useEffect(() => {
    if (!hasRunningSession) return;
    if (typeof document === 'undefined') return;

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshSessionsSilently();
      }
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSessionsSilently();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasRunningSession, refreshSessionsSilently]);

  const processStream = useCallback(async (reader: ReadableStreamDefaultReader<Uint8Array>, assistantId: string) => {
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

              if (block.type === 'tool_use' && block.name === 'AskUserQuestion') {
                const input = block.input as {
                  questions: Array<{
                    question: string;
                    header?: string;
                    options?: Array<{ label: string; description?: string }>;
                    multiSelect?: boolean;
                  }>;
                };
                const questions: InteractiveQuestion[] = input.questions.map(
                  (q: { question: string; header?: string; options?: Array<{ label: string; description?: string }>; multiSelect?: boolean }) => ({
                    toolUseId: block.id,
                    header: q.header,
                    question: q.question,
                    options: q.options || [],
                    multiSelect: q.multiSelect ?? false,
                  })
                );
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, interactiveQuestions: [...(m.interactiveQuestions || []), ...questions] }
                      : m
                  )
                );
              }
            }
          }

          if (event.type === 'result') {
            if (event.session_id) setSessionId(event.session_id);
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

    return accumulated;
  }, []);

  const loadSession = async (id: string) => {
    if (abortRef.current) abortRef.current.abort();
    setIsThinking(false);
    setSessionId(id);

    try {
      const res = await fetch(`/api/claude/sessions?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setMessages([{
          id: generateId(),
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
          id: generateId(),
          role: 'system',
          content: '--- Resumed session ---',
          timestamp: '',
        });

        for (const msg of history.messages) {
          loaded.push({
            id: generateId(),
            role: msg.role,
            content: msg.content,
            timestamp: '',
          });
        }
      }

      setMessages(loaded);

      const statusRes = await fetch(`/api/claude/sessions/${encodeURIComponent(id)}/status`);
      if (statusRes.ok) {
        const { streaming } = await statusRes.json();
        if (streaming) {
          const streamAssistantId = generateId();
          setMessages(prev => [...prev, {
            id: streamAssistantId,
            role: 'assistant' as const,
            content: '',
            timestamp: new Date().toLocaleTimeString(),
          }]);
          setIsThinking(true);

          abortRef.current = new AbortController();
          try {
            const streamRes = await fetch(
              `/api/claude/sessions/${encodeURIComponent(id)}/stream?from=0`,
              { signal: abortRef.current.signal }
            );
            if (streamRes.ok && streamRes.body) {
              const reader = streamRes.body.getReader();
              const accumulated = await processStream(reader, streamAssistantId);
              if (!accumulated) {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === streamAssistantId
                      ? { ...m, content: '(No response received)' }
                      : m
                  )
                );
              }
            }
          } catch (err: any) {
            if (err.name !== 'AbortError') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamAssistantId
                    ? { ...m, content: `Error reconnecting: ${err.message}` }
                    : m
                )
              );
            }
          } finally {
            setIsThinking(false);
            abortRef.current = null;
            fetchSessions();
          }
        }
      }
    } catch {
      setMessages([{
        id: generateId(),
        role: 'system',
        content: 'Error loading session.',
        timestamp: new Date().toLocaleTimeString(),
      }]);
    }
  };

  const copyResumeCommand = useCallback(async () => {
    if (!sessionId) return;
    const command = `claude --resume ${sessionId}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 1500);
    } catch {
      // ignore clipboard failure
    }
  }, [sessionId]);

  const createNewSession = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSessionId(null);
    setIsThinking(false);
    setInput('');
  };

  const sendPrompt = useCallback(async (prompt: string) => {
    setIsThinking(true);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString(),
    };

    const assistantId = generateId();
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

      const accumulated = await processStream(reader, assistantId);

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
  }, [sessionId, processStream, fetchSessions]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;
    const prompt = input.trim();
    setInput('');
    await sendPrompt(prompt);
  };

  const handleQuestionAnswer = useCallback(async (
    messageId: string,
    question: InteractiveQuestion,
    selectedLabels: string[],
  ) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId
          ? { ...m, questionsAnswered: true, answeredWith: selectedLabels }
          : m
      )
    );

    const answerText = selectedLabels.length === 1
      ? selectedLabels[0]
      : selectedLabels.join(', ');

    const followUp = question.header
      ? `Regarding "${question.header}": ${question.question}\nMy answer: ${answerText}`
      : `${question.question}\nMy answer: ${answerText}`;

    await sendPrompt(followUp);
  }, [sendPrompt]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
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

      <div className="flex-1 min-h-0 flex gap-4 px-8 pb-8">
        <SessionPanel
          sessions={sessions}
          activeSessionId={sessionId}
          onSelectSession={loadSession}
          onNewSession={createNewSession}
          isLoading={isLoadingSessions}
        />

        <Card className="flex-1 min-h-0 h-full flex flex-col bg-zinc-950 text-zinc-100 border-zinc-800 overflow-hidden">
          <CardHeader className="border-b border-zinc-800 bg-zinc-900/50 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-400" />
                <CardTitle className="text-sm font-medium">
                  claude {sessionId ? `— session ${sessionId.slice(0, 8)}` : '— new session'}
                </CardTitle>
              </div>
              {sessionId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={copyResumeCommand}
                  title={copiedCommand ? 'Copied!' : 'Copy resume command'}
                  aria-label={copiedCommand ? 'Copied resume command' : 'Copy resume command'}
                  className={cn(
                    "h-7 gap-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
                    copiedCommand && "text-green-400 hover:text-green-400"
                  )}
                >
                  {copiedCommand ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="text-xs">{copiedCommand ? 'Copied' : 'Copy resume command'}</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            <ScrollArea ref={scrollRef} className="flex-1 min-h-0 h-full w-full">
              <div className="p-4 space-y-4 font-mono text-sm">
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
                        {msg.interactiveQuestions && msg.interactiveQuestions.length > 0 && (
                          <div className="pl-4 pt-2 space-y-3">
                            {msg.interactiveQuestions.map((q, idx) => (
                              <QuestionCard
                                key={`${msg.id}-q-${idx}`}
                                header={q.header}
                                question={q.question}
                                options={q.options}
                                multiSelect={q.multiSelect}
                                disabled={!!msg.questionsAnswered || isThinking}
                                answeredWith={msg.questionsAnswered ? msg.answeredWith : undefined}
                                onAnswer={(selectedLabels) => handleQuestionAnswer(msg.id, q, selectedLabels)}
                              />
                            ))}
                          </div>
                        )}
                        {isThinking && msg.role === 'assistant' && !msg.content && !msg.interactiveQuestions && msg.id === messages[messages.length - 1]?.id && (
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
            <form onSubmit={sendMessage} className="p-4 border-t border-zinc-800 flex gap-2 shrink-0">
              <div className="flex-1 relative">
                {slashOpen && (
                  <SlashPopup
                    skills={filteredSkills}
                    activeIndex={activeIndex}
                    onSelect={(skill) => setInput(skill.name + ' ')}
                  />
                )}
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">&gt;</span>
                <Input
                  id="terminal-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Claude something..."
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 pl-7 focus:ring-zinc-600"
                  disabled={isThinking}
                  role="combobox"
                  aria-expanded={slashOpen}
                  aria-controls="slash-popup"
                  aria-activedescendant={
                    slashOpen && filteredSkills[activeIndex]
                      ? `slash-option-${filteredSkills[activeIndex].id}`
                      : undefined
                  }
                  autoComplete="off"
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
