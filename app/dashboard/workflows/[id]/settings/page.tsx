import { notFound } from 'next/navigation';
import { readWorkflowDetail } from '@/lib/workflow-store';
import { withWorkspace } from '@/lib/workspace-context';
import { WorkflowSettingsView } from '@/components/dashboard/WorkflowSettingsView';

export default async function WorkflowSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await withWorkspace(() => readWorkflowDetail(id));
  if (!detail) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workflow Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {detail.name}
        </p>
      </div>

      <WorkflowSettingsView
        workflowId={detail.id}
        workflowName={detail.name}
        stages={detail.stages}
        items={detail.items}
      />
    </div>
  );
}