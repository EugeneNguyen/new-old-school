import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import toolsConfig from '@/config/tools.json';
import type { ToolDefinition } from '@/types/tool';

export const ToolRegistry = {
  getAllTools(): ToolDefinition[] {
    return toolsConfig as ToolDefinition[];
  },

  getToolById(id: string): ToolDefinition | undefined {
    return (toolsConfig as ToolDefinition[]).find(t => t.id === id);
  },

  getIcon(iconName: string) {
    const IconComponent = (LucideIcons as Record<string, unknown>)[iconName] as LucideIcon | undefined;
    return IconComponent || LucideIcons.HelpCircle;
  }
};
