'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const bubbleVariants = cva('whitespace-pre-wrap break-words', {
  variants: {
    variant: {
      terminal: '',
      widget: 'rounded-lg px-3 py-2 text-xs leading-relaxed',
    },
    role: {
      user: '',
      assistant: '',
      system: '',
    },
  },
  compoundVariants: [
    {
      variant: 'terminal',
      role: 'user',
      className: 'text-foreground',
    },
    {
      variant: 'terminal',
      role: 'assistant',
      className: 'text-muted-foreground',
    },
    {
      variant: 'widget',
      role: 'user',
      className: 'bg-primary text-primary-foreground ml-8',
    },
    {
      variant: 'widget',
      role: 'assistant',
      className: 'bg-muted text-foreground mr-8',
    },
  ],
  defaultVariants: {
    variant: 'widget',
    role: 'assistant',
  },
});

export interface ChatBubbleProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof bubbleVariants> {
  role: 'user' | 'assistant' | 'system';
}

const ChatBubble = React.memo(function ChatBubble({
  role,
  variant,
  className,
  children,
  ...props
}: ChatBubbleProps) {
  if (role === 'system') {
    return (
      <div className={cn('text-muted-foreground/60 italic text-xs py-2', className)} {...props}>
        {children}
      </div>
    );
  }

  if (variant === 'terminal') {
    return (
      <div className="space-y-1">
        <pre className={cn(bubbleVariants({ variant, role }), 'pl-4 py-1', className)} {...props}>
          {children}
        </pre>
      </div>
    );
  }

  return (
    <div
      className={cn(bubbleVariants({ variant, role }), className)}
      {...props}
    >
      {children}
    </div>
  );
});

export { ChatBubble, bubbleVariants };
