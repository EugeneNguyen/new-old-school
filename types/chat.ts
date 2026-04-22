import type { ToolUseBlock } from './tool';
import type { InteractiveQuestion } from './question';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  interactiveQuestions?: InteractiveQuestion[];
  questionsAnswered?: boolean;
  answeredWith?: string[];
  toolUses?: ToolUseBlock[];
}
