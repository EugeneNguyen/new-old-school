'use client';

import * as React from 'react';
import { useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  renderMessage: (msg: ChatMessage) => React.ReactNode;
  className?: string;
  scrollAreaClassName?: string;
  emptyContent?: React.ReactNode;
}

function MessageList({
  messages,
  renderMessage,
  className,
  scrollAreaClassName,
  emptyContent,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  return (
    <ScrollArea ref={scrollRef} className={cn('flex-1 min-h-0', scrollAreaClassName)}>
      <div className={cn('p-4 space-y-4', className)}>
        {messages.length === 0 && emptyContent}
        {messages.map((msg) => (
          <div key={msg.id}>{renderMessage(msg)}</div>
        ))}
      </div>
    </ScrollArea>
  );
}

export { MessageList };
