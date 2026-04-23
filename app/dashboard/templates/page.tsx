'use client';

import { useCallback, useEffect, useState } from 'react';
import { Package, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TemplateListItem {
  id: string;
  name: string;
  idPrefix: string;
  stageCount: number;
  stages: string[];
}

interface Workflow {
  id: string;
  name: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [installedWorkflows, setInstalledWorkflows] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [templatesRes, workflowsRes] = await Promise.all([
        fetch('/api/templates', { cache: 'no-store' }),
        fetch('/api/workflows', { cache: 'no-store' }),
      ]);

      if (!templatesRes.ok) {
        throw new Error(`Failed to load templates (${templatesRes.status})`);
      }

      const templatesData = (await templatesRes.json()) as TemplateListItem[];
      setTemplates(templatesData);

      if (workflowsRes.ok) {
        const workflowsData = (await workflowsRes.json()) as Workflow[];
        setInstalledWorkflows(new Set(workflowsData.map((w) => w.id)));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleInstall(templateId: string) {
    setInstallingId(templateId);
    setInstallError(null);
    setInstallSuccess(null);

    try {
      const res = await fetch(`/api/templates/${encodeURIComponent(templateId)}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setInstallSuccess(templateId);
        setInstalledWorkflows((prev) => new Set([...prev, templateId]));
        setTimeout(() => setInstallSuccess(null), 3000);
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (res.status === 409) {
          setInstallError('A workflow with this ID already exists');
        } else {
          setInstallError(data?.error || `Install failed (${res.status})`);
        }
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingId(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
        <p className="text-muted-foreground">
          Browse and install workflow templates to get started quickly.
        </p>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {loadError}
        </div>
      )}

      {installError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {installError}
        </div>
      )}

      {installSuccess && (
        <div className="rounded-md border border-success/50 bg-success/10 px-3 py-2 text-sm text-green-600 dark:text-green-500 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Template installed successfully! Check the Workflows page to use it.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Available Templates</CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${templates.length} template${templates.length === 1 ? '' : 's'}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No templates available. Templates can be added by editing files in the templates directory.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => {
                const isInstalled = installedWorkflows.has(template.id);
                const isInstalling = installingId === template.id;

                return (
                  <Card key={template.id} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-muted-foreground" />
                          <CardTitle className="text-base">{template.name}</CardTitle>
                        </div>
                        {isInstalled && (
                          <Badge variant="success" className="shrink-0">
                            <Check className="h-3 w-3 mr-1" />
                            Installed
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        ID: {template.id} | Prefix: {template.idPrefix}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 pt-0">
                      <p className="text-xs text-muted-foreground mb-3">
                        {template.stageCount} stage{template.stageCount === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-4">
                        {template.stages.map((stage) => (
                          <Badge key={stage} variant="secondary" className="text-xs">
                            {stage}
                          </Badge>
                        ))}
                      </div>
                      <Button
                        className="w-full"
                        variant={isInstalled ? 'outline' : 'default'}
                        disabled={isInstalling}
                        onClick={() => !isInstalled && handleInstall(template.id)}
                      >
                        {isInstalling ? 'Installing…' : isInstalled ? 'Installed' : 'Install'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}