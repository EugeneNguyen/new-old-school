'use client';

import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  adornment?: React.ReactNode;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  'aria-label'?: string;
  triggerAdornment?: React.ReactNode;
  placeholder?: string;
  className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  disabled,
  'aria-label': ariaLabel,
  triggerAdornment,
  placeholder,
  className,
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
          'ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          '[&>span]:line-clamp-1',
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {triggerAdornment}
          <RadixSelect.Value placeholder={placeholder} />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'relative z-[200] min-w-[8rem] overflow-hidden rounded-md border bg-background shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
            'w-[--radix-select-trigger-width] max-h-[min(24rem,var(--radix-select-content-available-height))]'
          )}
        >
          <RadixSelect.ScrollUpButton className="flex h-6 cursor-default items-center justify-center bg-background">
            <ChevronDown className="h-3 w-3 rotate-180" />
          </RadixSelect.ScrollUpButton>

          <RadixSelect.Viewport className="p-1">
            {options.map((opt) => (
              <RadixSelect.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none',
                  'focus:bg-accent focus:text-accent-foreground',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50'
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {opt.adornment}
                  <RadixSelect.ItemText>{opt.label}</RadixSelect.ItemText>
                </span>
                <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                  <RadixSelect.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </RadixSelect.ItemIndicator>
                </span>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>

          <RadixSelect.ScrollDownButton className="flex h-6 cursor-default items-center justify-center bg-background">
            <ChevronDown className="h-3 w-3" />
          </RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
