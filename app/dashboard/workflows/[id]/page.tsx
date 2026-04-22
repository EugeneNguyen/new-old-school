import { notFound } from 'next/navigation';
import Link from 'next/link';
import { readWorkflowDetail } from '@/lib/workflow-store';
import { withWorkspace } from '@/lib/workspace-context';
import { WorkflowItemsView } from '@/components/dashboard/WorkflowItemsView';

export default async function WorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const itemParam = typeof sp.item === 'string' ? sp.item : null;
  const detail = await withWorkspace(() => readWorkflowDetail(id));
  if (!detail) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <ol className="flex items-center gap-1">
          <li>
            <Link href="/dashboard" className="text-foreground hover:underline">
              Dashboard
            </Link>
          </li>
          <li>
            <span className="text-muted-foreground mx-1" aria-hidden="true">›</span>
          </li>
          <li>
            <Link href="/dashboard/workflows" className="text-foreground hover:underline">
              Workflows
            </Link>
          </li>
          <li>
            <span className="text-muted-foreground mx-1" aria-hidden="true">›</span>
          </li>
          <li>
            <span className="text-muted-foreground">{detail.name}</span>
          </li>
        </ol>
      </nav>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {detail.stages.length} stage{detail.stages.length === 1 ? '' : 's'} ·{' '}
          {detail.items.length} item{detail.items.length === 1 ? '' : 's'}
        </p>
      </div>

      <WorkflowItemsView
        workflowId={detail.id}
        stages={detail.stages}
        initialItems={detail.items}
        initialOpenItemId={itemParam}
      />
    </div>
  );
}
