'use client';

import { useEffect, useState } from 'react';
import { FolderOpen, Plus, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FileBrowser, type BrowseEntry } from '@/components/dashboard/FileBrowser';
import { FileViewer } from '@/components/dashboard/FileViewer';

interface Workspace {
  id: string;
  name: string;
  absolutePath: string;
  createdAt: string;
  updatedAt: string;
}

function NoWorkspaceState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="bg-muted rounded-full p-4 mb-4">
        <FolderOpen className="w-12 h-12 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No Workspace Selected</h2>
      <p className="text-muted-foreground mb-6 max-w-md">
        Select or create a workspace to browse files. The file browser is sandboxed to your active workspace folder.
      </p>
      <Button asChild>
        <a href="/dashboard/workspaces">
          <Plus className="w-4 h-4 mr-2" />
          Manage Workspaces
        </a>
      </Button>
    </div>
  );
}

function FileBrowserPage({ workspace }: { workspace: Workspace }) {
  const [selectedFile, setSelectedFile] = useState<BrowseEntry | null>(null);

  return (
    <div className="flex h-full gap-0">
      {/* Left panel - File browser */}
      <div className="w-1/2 min-w-[300px] max-w-[600px] h-full">
        <FileBrowser
          workspaceRoot={workspace.absolutePath}
          onFileSelect={setSelectedFile}
          selectedPath={selectedFile?.absolutePath}
        />
      </div>

      {/* Right panel - File viewer */}
      <div className="flex-1 h-full min-w-0">
        <FileViewer
          entry={selectedFile}
          onClose={() => setSelectedFile(null)}
        />
      </div>
    </div>
  );
}

export default function FilesPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/workspaces/active');
        if (res.status === 404) {
          // No active workspace
          setWorkspace(null);
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.message ?? `Failed to load workspace (${res.status})`);
          return;
        }
        const data = await res.json();
        setWorkspace(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load workspace');
      } finally {
        setLoading(false);
      }
    }
    loadWorkspace();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <div className="animate-pulse mb-2">Loading workspace…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!workspace) {
    return <NoWorkspaceState />;
  }

  return <FileBrowserPage workspace={workspace} />;
}