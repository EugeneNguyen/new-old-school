"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MessageSquare, X, Plus, Square, Send, Loader2 } from 'lucide-react';
import { ChatBubble, MessageList, TypingIndicator, ToolUseCard, QuestionCard } from '@/components/chat';
import type { ToolUseBlock } from '@/types/tool';
import type { InteractiveQuestion } from '@/types/question';
import type { ChatMessage } from '@/types/chat';

const SESSION_STORAGE_KEY = 'nos:chat-widget-session-id';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasDefaultAgent, setHasDefaultAgent] = useState<boolean | null>(null);
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
          const event = JSON.parse(jsonStr);

          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                accumulated = block.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: accumulated } : m,
                  ),
                );
              }

              if (block.type === 'tool_use') {
                if (block.name === 'AskUserQuestion') {
                  const input = block.input as {
                    questions: Array<{
                      question: string;
                      header?: string;
                      options?: Array<{ label: string; description?: string }>;
                      multiSelect?: boolean;
                    }>;
                  };
                  const questions: InteractiveQuestion[] = input.questions.map(
                    (q) => ({
                      toolUseId: block.id,
                      header: q.header,
                      question: q.question,
                      options: q.options || [],
                      multiSelect: q.multiSelect ?? false,
                    })
                  );
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, interactiveQuestions: [...(m.interactiveQuestions || []), ...questions] }
                        : m
                    )
                  );
                } else {
                  const toolUse: ToolUseBlock = {
                    id: block.id,
                    name: block.name,
                    input: block.input || {},
                    result: undefined,
                    status: 'pending',
                  };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, toolUses: [...(m.toolUses || []), toolUse] }
                        : m
                    )
                  );
                }
              }
            }
          }

          if (event.type === 'tool_result') {
            const toolUseId = event.tool_use_id;
            const result = event.content || '';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId && m.toolUses
                  ? {
                      ...m,
                      toolUses: m.toolUses.map((tool) =>
                        tool.id === toolUseId
                          ? { ...tool, result, status: 'completed' }
                          : tool
                      ),
                    }
                  : m
              )
            );
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

  const handleQuestionAnswer = useCallback(
    async (messageId: string, toolUseId: string, selectedLabels: string[]) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                interactiveQuestions: m.interactiveQuestions?.map((q) =>
                  q.toolUseId === toolUseId
                    ? { ...q, answered: true, answeredWith: selectedLabels }
                    : q
                ),
                questionsAnswered: true,
                answeredWith: selectedLabels,
              }
            : m
        )
      );

      try {
        await fetch('/api/chat/answer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            toolUseId,
            answers: selectedLabels,
          }),
        });
      } catch {
        // silently fail on answer submission
      }
    },
    [sessionId]
  );

  const renderMessage = useCallback((msg: ChatMessage) => {
    const isLastAssistant = msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id;

    if (msg.role === 'system') {
      return <p className="text-muted-foreground text-xs italic">{msg.content}</p>;
    }

    return (
      <>
        {msg.content && (
          <ChatBubble role={msg.role} variant="widget">
            {msg.content}
          </ChatBubble>
        )}
        {!msg.content && isThinking && isLastAssistant && (
          <TypingIndicator />
        )}
        {msg.toolUses && msg.toolUses.length > 0 && (
          <div className="space-y-2 mr-8">
            {msg.toolUses.map((tool) => (
              <ToolUseCard key={tool.id} tool={tool} />
            ))}
          </div>
        )}
        {msg.interactiveQuestions && msg.interactiveQuestions.length > 0 && (
          <div className="space-y-2 mr-8">
            {msg.interactiveQuestions.map((q) => (
              <QuestionCard
                key={q.toolUseId}
                header={q.header}
                question={q.question}
                options={q.options}
                multiSelect={q.multiSelect}
                disabled={msg.questionsAnswered ?? false}
                answeredWith={msg.answeredWith}
                onAnswer={(selectedLabels) =>
                  handleQuestionAnswer(msg.id, q.toolUseId, selectedLabels)
                }
              />
            ))}
          </div>
        )}
      </>
    );
  }, [messages, isThinking, handleQuestionAnswer]);

  if (hidden) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && (
        <Card
          role="dialog"
          aria-label="Chat"
          className="w-96 max-h-[70vh] shadow-2xl border border-border bg-background flex flex-col overflow-hidden"
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

          <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
            <MessageList
              messages={messages}
              renderMessage={renderMessage}
              className="text-sm"
              scrollAreaClassName="min-h-32"
              emptyContent={
                <>
                  {hasDefaultAgent === false && (
                    <p className="text-muted-foreground text-xs">
                      No default agent configured.{' '}
                      <a href="/dashboard/settings" className="underline hover:text-foreground">
                        Go to Settings → Agents to set one.
                      </a>
                    </p>
                  )}
                  {hasDefaultAgent !== false && (
                    <p className="text-muted-foreground text-xs">
                      Ask anything. Your session persists across the dashboard.
                    </p>
                  )}
                </>
              }
            />

            {hasDefaultAgent !== false && (
              <div className="p-2 border-t shrink-0">
                <form onSubmit={handleSubmit} className="flex gap-2">
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
              </div>
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
