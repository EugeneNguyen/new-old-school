'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen, Folder, ChevronDown, ChevronRight, Activity, CalendarClock } from 'lucide-react';
import { ToolRegistry } from '@/lib/tool-registry';
import { cn } from '@/lib/utils';
import { useSidebar } from './SidebarContext';
import { useEffect, useState } from 'react';
import type { Workflow } from '@/types/workflow';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Logo } from '@/components/ui/logo';

function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const tools = ToolRegistry.getAllTools();
  const { collapsed, toggleSidebar } = useSidebar();
  const pathname = usePathname();
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

  useEffect(() => {
    if (pathname && (pathname === '/dashboard/workflows' || pathname.startsWith('/dashboard/workflows/'))) {
      setWorkflowsExpanded(true);
    }
  }, [pathname]);

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-secondary border-r border-border transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="p-6 flex items-center gap-2 font-bold text-xl overflow-hidden">
        <Logo size={32} className="shrink-0" variant="icon" />
        {!collapsed && <span className="tracking-tight whitespace-nowrap">New Old-school</span>}
      </div>

      <WorkspaceSwitcher collapsed={collapsed} />

      <nav className="flex-1 px-2 py-4 space-y-1">
        {/* Dashboard */}
        {(() => {
          const tool = tools[0]; // Dashboard
          const Icon = ToolRegistry.getIcon(tool.icon);
          const active = isActive(tool.href, pathname);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })()}

        {/* Workflows (collapsible folder) */}
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
            <Link
              href="/dashboard/workflows"
              className="flex items-center px-3 py-2 rounded-md transition-colors text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              All workflows…
            </Link>
            {workflows.map((wf) => {
              const href = `/dashboard/workflows/${wf.id}`;
              const active = isActive(href, pathname);
              return (
                <Link
                  key={wf.id}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center px-3 py-2 rounded-md transition-colors text-sm font-medium',
                    'hover:bg-accent hover:text-accent-foreground',
                    'text-muted-foreground',
                    active && 'bg-accent text-accent-foreground'
                  )}
                >
                  {wf.routineEnabled && (
                    <CalendarClock className="w-4 h-4 shrink-0 mr-2 text-muted-foreground" />
                  )}
                  <span className="truncate">{wf.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Files */}
        {(() => {
          const tool = tools[1]; // Files
          const Icon = ToolRegistry.getIcon(tool.icon);
          const active = isActive(tool.href, pathname);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })()}

        {/* Claude Terminal */}
        {(() => {
          const tool = tools[2]; // Claude Terminal
          const Icon = ToolRegistry.getIcon(tool.icon);
          const active = isActive(tool.href, pathname);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })()}

        {/* Members */}
        {(() => {
          const tool = tools[3]; // Members
          const Icon = ToolRegistry.getIcon(tool.icon);
          const active = isActive(tool.href, pathname);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })()}

        {/* Activity */}
        {(() => {
          const href = '/dashboard/activity';
          const active = isActive(href, pathname);
          return (
            <Link
              href={href}
              title="Activity"
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Activity className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">Activity</span>}
            </Link>
          );
        })()}

        {/* Settings */}
        {(() => {
          const tool = tools[4]; // Settings
          const Icon = ToolRegistry.getIcon(tool.icon);
          const active = isActive(tool.href, pathname);
          return (
            <Link
              key={tool.id}
              href={tool.href}
              title={tool.name}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                'hover:bg-accent hover:text-accent-foreground',
                'text-muted-foreground',
                collapsed && 'justify-center px-0',
                active && 'bg-accent text-accent-foreground'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap overflow-hidden">{tool.name}</span>}
            </Link>
          );
        })()}
      </nav>

      <div className="p-4 border-t border-border flex items-center justify-between">
        {!collapsed && <ThemeToggle />}
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
