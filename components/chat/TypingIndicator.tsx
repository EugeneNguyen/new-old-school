'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  label?: string;
  className?: string;
}

function TypingIndicator({ label = 'Thinking...', className }: TypingIndicatorProps) {
  return (
    <span className={cn('flex items-center gap-2 text-muted-foreground text-xs', className)}>
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>{label}</span>
    </span>
  );
}

export { TypingIndicator };
