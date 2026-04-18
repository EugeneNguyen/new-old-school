'use client';

import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ToolRegistry } from '@/lib/tool-registry';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';

export default function Sidebar() {
  const tools = ToolRegistry.getAllTools();
  const { collapsed, toggleSidebar } = useSidebar();

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-secondary border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-6 flex items-center gap-2 font-bold text-xl overflow-hidden">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground shrink-0 text-xs">
          nos
        </div>
        {!collapsed && <span className="tracking-tight whitespace-nowrap">OS Tools</span>}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {tools.map((tool) => {
          const Icon = ToolRegistry.getIcon(tool.icon);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border flex items-center justify-between">
        {!collapsed && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">&copy; 2026 nos Project</span>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            'p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0',
            collapsed && 'mx-auto'
          )}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
