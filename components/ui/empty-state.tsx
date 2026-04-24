'use client';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className }: EmptyStateProps) {
  return (
    <div className={className ?? 'rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-muted-foreground'}>
      {children}
    </div>
  );
}
