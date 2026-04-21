export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  model: string | null;
  isRunning: boolean;
}

import type { ToolUseBlock } from './tool';

export interface SessionHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  toolUses?: ToolUseBlock[];
}

export interface SessionHistory {
  id: string;
  messages: SessionHistoryMessage[];
}
