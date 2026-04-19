export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  model: string | null;
  isRunning: boolean;
}

export interface SessionHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionHistory {
  id: string;
  messages: SessionHistoryMessage[];
}
