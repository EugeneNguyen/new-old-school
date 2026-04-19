import type { ItemStatus } from '@/types/workflow';

export interface ItemStatusStyle {
  border: string;
  bg: string;
  ring: string;
  dot: string;
  label: string;
}

const STYLES: Record<ItemStatus, ItemStatusStyle> = {
  Todo: {
    border: 'border-l-[3px] border-l-muted-foreground/30',
    bg: 'bg-muted/20',
    ring: 'ring-muted-foreground/30',
    dot: 'bg-muted-foreground/60',
    label: 'text-muted-foreground',
  },
  'In Progress': {
    border: 'border-l-[3px] border-l-primary',
    bg: 'bg-primary/10',
    ring: 'ring-primary/50',
    dot: 'bg-primary animate-pulse',
    label: 'text-primary',
  },
  Done: {
    border: 'border-l-[3px] border-l-green-500 dark:border-l-green-400',
    bg: 'bg-green-50 dark:bg-green-950/20',
    ring: 'ring-green-500/50',
    dot: 'bg-green-500 dark:bg-green-400',
    label: 'text-green-700 dark:text-green-400',
  },
  Failed: {
    border: 'border-l-[3px] border-l-destructive',
    bg: 'bg-destructive/10',
    ring: 'ring-destructive/50',
    dot: 'bg-destructive',
    label: 'text-destructive',
  },
};

export function getItemStatusStyle(status: ItemStatus): ItemStatusStyle {
  return STYLES[status];
}
