"use client";

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Terminal as TerminalIcon, Play, Trash2, RefreshCw } from 'lucide-react';

interface LogEntry {
  id: string;
  command: string;
  output: string;
  type: 'success' | 'error';
  timestamp: string;
}

export default function ShellTerminal() {
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting) return;

    const command = input.trim();
    setInput('');
    setIsExecuting(true);

    try {
      const response = await fetch('/api/shell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLogs(prev => [...prev, {
          id: Math.random().toString(36),
          command,
          output: data.message || 'An unexpected error occurred',
          type: 'error',
          timestamp: new Date().toLocaleTimeString(),
        }]);
      } else {
        setLogs(prev => [...prev, {
          id: Math.random().toString(36),
          command,
          output: data.stdout || data.stderr || 'Command executed with no output',
          type: data.stderr ? 'error' : 'success',
          timestamp: new Date().toLocaleTimeString(),
        }]);
      }
    } catch (err: any) {
      setLogs(prev => [...prev, {
        id: Math.random().toString(36),
        command,
        output: err.message || 'Failed to connect to shell API',
        type: 'error',
        timestamp: new Date().toLocaleTimeString(),
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shell Terminal</h1>
          <p className="text-muted-foreground">
            Execute whitelisted system commands securely.
          </p>
        </div>
        <Button
          onClick={clearLogs}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear Terminal
        </Button>
      </div>

      <Card className="bg-zinc-950 text-zinc-100 border-zinc-800">
        <CardHeader className="border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-zinc-400" />
            <CardTitle className="text-sm font-medium">nos-terminal — bash</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px] p-4 font-mono text-sm">
            {logs.length === 0 && (
              <div className="text-zinc-500 italic">
                Welcome to the nos terminal. Enter a command to begin...
              </div>
            )}
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="text-zinc-600">[{log.timestamp}]</span>
                    <span className="text-green-400 font-bold">$</span>
                    <span className="text-zinc-200">{log.command}</span>
                  </div>
                  <pre className={cn(
                    "pl-4 py-1 rounded whitespace-pre-wrap break-words",
                    log.type === 'error' ? "text-red-400 bg-red-900/10" : "text-zinc-300"
                  )}>
                    {log.output}
                  </pre>
                </div>
              ))}
            </div>
          </ScrollArea>
          <form onSubmit={executeCommand} className="p-4 border-t border-zinc-800 flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-400 font-bold">$</span>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter command (e.g. ls, git status)..."
                className="bg-zinc-900 border-zinc-700 text-zinc-100 pl-7 focus:ring-zinc-600"
                disabled={isExecuting}
              />
            </div>
            <Button
              type="submit"
              disabled={isExecuting || !input.trim()}
              className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              {isExecuting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
