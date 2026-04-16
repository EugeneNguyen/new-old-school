import Link from 'next/link';
import { ToolRegistry } from '@/lib/tool-registry';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  const tools = ToolRegistry.getAllTools();

  // Only show core tools on the home page for a cleaner entry point
  const coreTools = tools.filter(tool => tool.category === 'core');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center space-y-6 bg-background text-foreground">
      <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground text-3xl font-bold shadow-xl">
        nos
      </div>
      <div className="space-y-2">
        <h1 className="text-5xl font-extrabold tracking-tight">
          Welcome to nos
        </h1>
        <p className="text-xl text-muted-foreground max-w-md mx-auto">
          A professional administrative interface for managing local system tools.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {coreTools.map((tool) => {
          const Icon = ToolRegistry.getIcon(tool.icon);
          return (
            <Button asChild size="lg" className="gap-2" key={tool.id}>
              <Link href={tool.href}>
                <Icon className="w-4 h-4" />
                {tool.name}
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
