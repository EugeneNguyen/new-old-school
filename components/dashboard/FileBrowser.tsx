'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronUp,
  Folder,
  RefreshCcw,
  FileText,
  FileImage,
  FileMusic,
  FileVideo,
  File,
  Loader2,
  AlertCircle,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { classifyFile, formatSize } from '@/lib/file-types';

export interface BrowseEntry {
  name: string;
  absolutePath: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

export interface BrowseResponse {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  home: string;
}

interface FileBrowserProps {
  workspaceRoot: string;
  onFileSelect: (entry: BrowseEntry) => void;
  selectedPath?: string;
}

function getFileIcon(name: string, isDirectory: boolean) {
  if (isDirectory) {
    return <Folder className="w-4 h-4 text-amber-500" />;
  }
  const classification = classifyFile(name);
  switch (classification.category) {
    case 'text':
      return <FileText className="w-4 h-4 text-blue-500" />;
    case 'image':
      return <FileImage className="w-4 h-4 text-purple-500" />;
    case 'audio':
      return <FileMusic className="w-4 h-4 text-pink-500" />;
    case 'video':
      return <FileVideo className="w-4 h-4 text-red-500" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
}

function getRelativePath(fullPath: string, workspaceRoot: string): string {
  if (fullPath === workspaceRoot) return '/';
  const relative = fullPath.slice(workspaceRoot.length);
  return relative.startsWith('/') ? relative : '/' + relative;
}

export default function FileBrowser({ workspaceRoot, onFileSelect, selectedPath }: FileBrowserProps) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);

  const load = useCallback(async (target?: string) => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = new URLSearchParams({ workspace: 'true' });
      if (target) {
        searchParams.set('path', target);
      }
      const res = await fetch(`/api/workspaces/browse?${searchParams}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Failed to browse (${res.status})`);
        return;
      }
      const body = (await res.json()) as BrowseResponse;
      setData(body);

      // Update breadcrumbs
      const relative = getRelativePath(body.path, workspaceRoot);
      const segments = relative.split('/').filter(Boolean);
      setBreadcrumbs(segments);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Browse failed');
    } finally {
      setLoading(false);
    }
  }, [workspaceRoot]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEntryClick = (entry: BrowseEntry) => {
    if (entry.isDirectory) {
      load(entry.absolutePath);
    } else {
      onFileSelect(entry);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      load(workspaceRoot);
    } else {
      const pathParts = breadcrumbs.slice(0, index + 1);
      const targetPath = pathParts.reduce(
        (acc, part) => (acc === workspaceRoot ? `${acc}/${part}` : `${acc}/${part}`),
        workspaceRoot
      );
      load(targetPath);
    }
  };

  return (
    <div className="flex flex-col h-full border border-border rounded-md bg-card">
      {/* Header with controls and breadcrumb */}
      <div className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => data?.parent && load(data.parent)}
            disabled={!data?.parent || loading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-3 h-3" />
            Up
          </button>
          <button
            type="button"
            onClick={() => load(data?.path)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-50"
          >
            <RefreshCcw className={cn('w-3 h-3', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => load(workspaceRoot)}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent"
            title="Go to workspace root"
          >
            <Home className="w-3 h-3" />
          </button>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {data?.path ?? 'Loading…'}
          </span>
        </div>

        {/* Breadcrumb trail */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs overflow-x-auto">
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(-1)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              /
            </button>
            {breadcrumbs.map((segment, index) => (
              <span key={index} className="flex items-center gap-1 shrink-0">
                <span className="text-muted-foreground">/</span>
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(index)}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive bg-destructive/10">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => load(data?.path)}
            className="text-xs hover:underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading…</span>
        </div>
      )}

      {/* File list */}
      {data && (
        <ScrollArea className="flex-1">
          <div className="py-1">
            {data.entries.length === 0 && (
              <div className="px-3 py-8 text-xs text-muted-foreground text-center">
                This directory is empty.
              </div>
            )}
            {data.entries.map((entry) => (
              <button
                key={entry.absolutePath}
                type="button"
                onClick={() => handleEntryClick(entry)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left transition-colors',
                  selectedPath === entry.absolutePath && 'bg-accent'
                )}
              >
                {getFileIcon(entry.name, entry.isDirectory)}
                <span className="truncate flex-1">{entry.name}</span>
                {entry.isDirectory && (
                  <span className="text-xs text-muted-foreground shrink-0">/</span>
                )}
                {!entry.isDirectory && entry.size !== undefined && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {formatSize(entry.size)}
                  </Badge>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}