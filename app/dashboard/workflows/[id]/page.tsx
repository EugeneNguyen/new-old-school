import { notFound } from 'next/navigation';
import { readWorkflowDetail } from '@/lib/workflow-store';
import { withWorkspace } from '@/lib/workspace-context';
import WorkflowItemsView from '@/components/dashboard/WorkflowItemsView';

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
