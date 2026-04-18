'use client';

import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { ToolRegistry } from '@/lib/tool-registry';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';
import { useEffect, useState } from 'react';
import { Workflow } from '@/types/workflow';

export default function Sidebar() {
  const tools = ToolRegistry.getAllTools();
  const { collapsed, toggleSidebar } = useSidebar();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowsExpanded, setWorkflowsExpanded] = useState(false);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const res = await fetch('/api/workflows');
        const data = await res.json();
        if (Array.isArray(data)) {
          setWorkflows(data);
        }
      } catch (e) {
        console.error('Failed to fetch workflows', e);
      }
    }
    fetchWorkflows();
  }, []);

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

        <div className="pt-4 space-y-1">
          <button
            onClick={() => setWorkflowsExpanded(!workflowsExpanded)}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
              'hover:bg-accent hover:text-accent-foreground',
              'text-muted-foreground',
              collapsed && 'justify-center px-0'
            )}
          >
            <Folder className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <div className="flex-1 flex items-center justify-between overflow-hidden">
                <span className="truncate">Workflows</span>
                {workflowsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            )}
          </button>
          {!collapsed && workflowsExpanded && (
            <div className="pl-4 space-y-1">
              {workflows.map((wf) => (
                <Link
                  key={wf.id}
                  href={`/dashboard/workflows/${wf.id}`}
                  className={cn(
                    'flex items-center px-3 py-2 rounded-md transition-colors text-sm font-medium',
                    'hover:bg-accent hover:text-accent-foreground',
                    'text-muted-foreground'
                  )}
                >
                  <span className="truncate">{wf.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
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
