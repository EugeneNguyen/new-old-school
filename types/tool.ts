export interface ToolDefinition {
  id: string;
  name: string;
  href: string;
  icon: string;
  description: string;
  endpoint: string;
  category: 'core' | 'utility' | 'advanced';
}

export interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, any>;
  result?: string | null;
  status: 'pending' | 'completed' | 'failed';
}
