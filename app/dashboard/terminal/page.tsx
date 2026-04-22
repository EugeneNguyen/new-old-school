"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Plus, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionPanel } from '@/components/terminal/SessionPanel';
import type { SessionSummary, SessionHistory } from '@/types/session';
import type { InteractiveQuestion } from '@/types/question';
import type { ToolUseBlock } from '@/types/tool';
import { useSlashComplete } from '@/hooks/useSlashComplete';
import { SlashPopup } from '@/components/terminal/SlashPopup';
import { ChatBubble, MessageList, TypingIndicator, ChatInput, ToolUseCard, QuestionCard } from '@/components/chat';
import type { ChatMessage } from '@/types/chat';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ClaudeTerminal() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const { isOpen: slashOpen, filteredSkills, activeIndex, handleKeyDown } = useSlashComplete({
    input,
    onSelect: (value) => setInput(value),
  });

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
                } else {
                  const toolUse: ToolUseBlock = {
                    id: block.id,
                    name: block.name,
                    input: block.input || {},
                    result: undefined,
                    status: 'pending',
                  };
                  setMessages(prev =>
                    prev.map(m =>
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
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId && m.toolUses
                  ? {
                      ...m,
                      toolUses: m.toolUses.map(tool =>
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
          const chatMsg: ChatMessage = {
            id: generateId(),
            role: msg.role,
            content: msg.content,
            timestamp: '',
          };
          if (msg.toolUses && msg.toolUses.length > 0) {
            chatMsg.toolUses = msg.toolUses;
          }
          loaded.push(chatMsg);
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
          } catch (err: unknown) {
            if (!(err instanceof DOMException && err.name === 'AbortError')) {
              const message = err instanceof Error ? err.message : 'Failed to reconnect';
              setMessages(prev =>
                prev.map(m =>
                  m.id === streamAssistantId
                    ? { ...m, content: `Error reconnecting: ${message}` }
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
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: `Error: ${message}` }
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

  const renderMessage = useCallback((msg: ChatMessage) => {
    const isLastAssistant = msg.role === 'assistant' && msg.id === messages[messages.length - 1]?.id;

    if (msg.role === 'system') {
      return <ChatBubble role="system">{msg.content}</ChatBubble>;
    }

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          {msg.timestamp && (
            <span className="text-muted-foreground/60 text-xs">[{msg.timestamp}]</span>
          )}
          <span className={cn(
            "text-xs font-bold uppercase",
            msg.role === 'user' ? 'text-blue-400' : 'text-green-400'
          )}>
            {msg.role === 'user' ? 'you' : 'claude'}
          </span>
        </div>
        <ChatBubble role={msg.role} variant="terminal">
          {msg.content || (isThinking && isLastAssistant && !msg.content ? '' : msg.content)}
        </ChatBubble>
        {msg.toolUses && msg.toolUses.length > 0 && (
          <div className="pl-4 pt-2 space-y-2">
            {msg.toolUses.map((tool, idx) => (
              <ToolUseCard
                key={`${msg.id}-tool-${idx}`}
                tool={tool}
              />
            ))}
          </div>
        )}
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
        {isThinking && isLastAssistant && !msg.content && !msg.interactiveQuestions && (
          <div className="pl-4">
            <TypingIndicator label="Claude is thinking..." />
          </div>
        )}
      </div>
    );
  }, [messages, isThinking, handleQuestionAnswer]);

  const slashAddonSlot = slashOpen ? (
    <SlashPopup
      skills={filteredSkills}
      activeIndex={activeIndex}
      onSelect={(skill) => setInput(skill.name + ' ')}
    />
  ) : undefined;

  return (
    <div className="dark h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Claude Terminal</h1>
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

        <Card className="flex-1 min-h-0 h-full flex flex-col bg-card text-foreground border-border overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/50 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-medium text-foreground">
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
                    "h-7 gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted",
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
            <MessageList
              messages={messages}
              renderMessage={renderMessage}
              className="font-mono text-sm"
              emptyContent={
                <div className="text-muted-foreground italic">
                  Start a conversation with Claude. Your messages will be sent via the Claude Code CLI.
                </div>
              }
            />
            <div className="p-4 border-t border-border shrink-0">
              <ChatInput
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onSubmit={sendMessage}
                onKeyDown={handleKeyDown}
                promptPrefix=">"
                addonSlot={slashAddonSlot}
                placeholder="Ask Claude something..."
                disabled={isThinking}
                isThinking={isThinking}
                className="flex gap-2"
                inputClassName="bg-muted border-border text-foreground pl-7 focus:ring-ring"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
