'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  promptPrefix?: string;
  addonSlot?: React.ReactNode;
  isThinking?: boolean;
  className?: string;
  inputClassName?: string;
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  disabled,
  placeholder = 'Ask something...',
  promptPrefix,
  addonSlot,
  isThinking,
  className,
  inputClassName,
}: ChatInputProps) {
  return (
    <form onSubmit={onSubmit} className={cn('flex gap-2', className)}>
      {addonSlot && (
        <div className="relative flex-1">
          {addonSlot}
          {promptPrefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-bold">
              {promptPrefix}
            </span>
          )}
          <Input
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(promptPrefix && 'pl-7', inputClassName)}
            aria-label="Message"
          />
        </div>
      )}
      {!addonSlot && (
        <Input
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClassName}
          aria-label="Message"
        />
      )}
      <Button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send"
      >
        {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </Button>
    </form>
  );
}

export { ChatInput };
