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
    <div className="bg-zinc-900 border border-zinc-700 rounded-md p-4 space-y-3 max-w-lg">
      <div className="flex items-start gap-2">
        <HelpCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          {header && (
            <span className="text-xs font-bold text-zinc-400 uppercase">
              {header}
            </span>
          )}
          <p className="text-sm text-zinc-200">{question}</p>
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
            className="bg-zinc-800 border-zinc-600 text-zinc-200 text-sm h-8"
            disabled={disabled}
          />
          <Button
            size="sm"
            onClick={submitFreeform}
            disabled={disabled || !freeformText.trim()}
            className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 h-8"
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
                  ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                  : 'bg-zinc-800 border-zinc-600 text-zinc-300 hover:bg-zinc-700',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                selected.has(opt.label)
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-zinc-500'
              )}>
                {selected.has(opt.label) && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <span className="font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="text-zinc-500 ml-2">{opt.description}</span>
                )}
              </div>
            </button>
          ))}
          <Button
            size="sm"
            onClick={submitMultiSelect}
            disabled={disabled || selected.size === 0}
            className="bg-blue-600 hover:bg-blue-500 text-white mt-1"
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
                'bg-zinc-800 border border-zinc-600 text-zinc-200',
                'hover:bg-zinc-700 hover:border-zinc-500',
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
