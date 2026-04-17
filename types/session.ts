export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  preview: string;
  turnCount: number;
  model: string | null;
}

export interface SessionHistoryMessage {
  role: 'assistant';
  content: string;
}

export interface SessionHistory {
  id: string;
  messages: SessionHistoryMessage[];
}
