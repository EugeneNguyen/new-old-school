'use client';

import { useState } from 'react';
import type { ToolUseBlock } from '@/types/tool';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolUseCardProps {
  tool: ToolUseBlock;
}

function summarizeInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input);
  if (entries.length === 0) return '(no parameters)';

  const summary = entries
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30);
      return `${k}: ${val}`;
    })
    .join(', ');

  return entries.length > 2 ? summary + '...' : summary;
}

export function ToolUseCard({ tool }: ToolUseCardProps) {
  const [expanded, setExpanded] = useState(false);

  const inputStr = JSON.stringify(tool.input, null, 2);
  const resultStr = tool.result ? String(tool.result) : null;
  const inputTruncated = inputStr.length > 5000;
  const resultTruncated = resultStr && resultStr.length > 5000;
  const [showFullInput, setShowFullInput] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);

  return (
    <div className="border border-muted-foreground/30 rounded bg-muted/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/70 transition-colors text-left"
      >
        <ChevronDown
          className={cn(
            'w-4 h-4 flex-shrink-0 transition-transform',
            expanded && 'rotate-180'
          )}
        />
        <span className="text-xs font-mono font-semibold text-foreground">{tool.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {tool.status === 'pending' ? (
            <span className="italic">pending...</span>
          ) : tool.status === 'completed' ? (
            <span className="text-green-400">completed</span>
          ) : (
            <span className="text-red-400">failed</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-muted-foreground/30 px-3 py-2 space-y-2 bg-background/50">
          <div>
            <div className="text-xs text-muted-foreground font-semibold mb-1">Input:</div>
            <pre className="text-xs bg-black/30 rounded p-2 overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-words">
              {showFullInput || !inputTruncated ? inputStr : inputStr.slice(0, 5000)}
            </pre>
            {inputTruncated && !showFullInput && (
              <button
                onClick={() => setShowFullInput(true)}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1"
              >
                Show more ({inputStr.length - 5000} chars)
              </button>
            )}
          </div>

          {resultStr ? (
            <div>
              <div className="text-xs text-muted-foreground font-semibold mb-1">Result:</div>
              <pre className="text-xs bg-black/30 rounded p-2 overflow-auto max-h-40 text-muted-foreground whitespace-pre-wrap break-words">
                {showFullResult || !resultTruncated ? resultStr : resultStr.slice(0, 5000)}
              </pre>
              {resultTruncated && !showFullResult && (
                <button
                  onClick={() => setShowFullResult(true)}
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                >
                  Show more ({resultStr.length - 5000} chars)
                </button>
              )}
            </div>
          ) : tool.status === 'pending' ? (
            <div className="text-xs text-muted-foreground italic">Waiting for result...</div>
          ) : null}
        </div>
      )}

      {!expanded && (
        <div className="px-3 py-1 text-xs text-muted-foreground/70 truncate">
          {summarizeInput(tool.input)}
        </div>
      )}
    </div>
  );
}
