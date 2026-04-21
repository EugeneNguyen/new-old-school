'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, HelpCircle, Send } from 'lucide-react';
import type { QuestionOption } from '@/types/question';

interface QuestionCardProps {
  header?: string;
  question: string;
  options: QuestionOption[];
  multiSelect: boolean;
  disabled: boolean;
  answeredWith?: string[];
  onAnswer: (selectedLabels: string[]) => void;
}

export default function QuestionCard({
  header,
  question,
  options,
  multiSelect,
  disabled,
  answeredWith,
  onAnswer,
}: QuestionCardProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeformText, setFreeformText] = useState('');

  const handleSingleSelect = (label: string) => {
    if (disabled) return;
    onAnswer([label]);
  };

  const toggleMultiSelect = (label: string) => {
    if (disabled) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const submitMultiSelect = () => {
    if (disabled || selected.size === 0) return;
    onAnswer(Array.from(selected));
  };

  const submitFreeform = () => {
    if (disabled || !freeformText.trim()) return;
    onAnswer([freeformText.trim()]);
  };

  return (
    <div className="bg-card border border-border rounded-md p-4 space-y-3 max-w-lg">
      <div className="flex items-start gap-2">
        <HelpCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          {header && (
            <span className="text-xs font-bold text-muted-foreground uppercase">
              {header}
            </span>
          )}
          <p className="text-sm text-foreground">{question}</p>
        </div>
      </div>

      {answeredWith ? (
        <div className="flex items-center gap-2 text-xs text-green-400 pl-6">
          <Check className="w-3 h-3" />
          <span>Answered: {answeredWith.join(', ')}</span>
        </div>
      ) : options.length === 0 ? (
        <div className="pl-6 flex gap-2">
          <Input
            value={freeformText}
            onChange={(e) => setFreeformText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitFreeform()}
            placeholder="Type your answer..."
            className="bg-muted border-border text-foreground text-sm h-8"
            disabled={disabled}
          />
          <Button
            size="sm"
            onClick={submitFreeform}
            disabled={disabled || !freeformText.trim()}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground h-8"
          >
            <Send className="w-3 h-3" />
          </Button>
        </div>
      ) : multiSelect ? (
        <div className="pl-6 space-y-2">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => toggleMultiSelect(opt.label)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-2 w-full text-left px-3 py-2 rounded text-sm transition-colors',
                'border',
                selected.has(opt.label)
                  ? 'bg-primary/20 border-primary text-primary-foreground'
                  : 'bg-muted border-border text-foreground hover:bg-muted/80',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                selected.has(opt.label)
                  ? 'bg-primary border-primary'
                  : 'border-muted-foreground'
              )}>
                {selected.has(opt.label) && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <div>
                <span className="font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="text-muted-foreground ml-2">{opt.description}</span>
                )}
              </div>
            </button>
          ))}
          <Button
            size="sm"
            onClick={submitMultiSelect}
            disabled={disabled || selected.size === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground mt-1"
          >
            Submit ({selected.size} selected)
          </Button>
        </div>
      ) : (
        <div className="pl-6 flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => handleSingleSelect(opt.label)}
              disabled={disabled}
              title={opt.description}
              className={cn(
                'px-3 py-2 rounded text-sm font-medium transition-colors',
                'bg-muted border border-border text-foreground',
                'hover:bg-muted/80 hover:border-muted-foreground',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
