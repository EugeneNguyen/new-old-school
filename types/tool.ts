export interface ToolDefinition {
  id: string;
  name: string;
  href: string;
  icon: string;
  description: string;
  endpoint: string;
  category: 'core' | 'utility' | 'advanced';
}
