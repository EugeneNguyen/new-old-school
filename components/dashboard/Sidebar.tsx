import Link from 'next/link';
import {
  LayoutDashboard,
  Terminal,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Terminal', href: '/dashboard/terminal', icon: Terminal },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="flex flex-col w-64 h-screen bg-secondary border-r border-border transition-all duration-300">
      <div className="p-6 flex items-center gap-2 font-bold text-xl">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
          nos
        </div>
        <span className="tracking-tight">OS Tools</span>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
              "hover:bg-accent hover:text-accent-foreground",
              "text-muted-foreground"
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        © 2026 nos Project
      </div>
    </aside>
  );
}
