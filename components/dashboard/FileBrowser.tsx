'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  Upload,
  FolderPlus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { classifyFile, formatSize } from '@/lib/file-types';
import { toast } from '@/lib/hooks/use-toast';

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

type UploadStatus = 'pending' | 'uploading' | 'complete' | 'error';

interface UploadFileState {
  name: string;
  size: number;
  status: UploadStatus;
  progress: number;
  error?: string;
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

export function FileBrowser({ workspaceRoot, onFileSelect, selectedPath }: FileBrowserProps) {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadFileState[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const uploadFilesRef = useRef<((fileList: File[]) => Promise<void>) | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    entry: BrowseEntry | null;
  }>({ open: false, x: 0, y: 0, entry: null });

  // Delete dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    entry: BrowseEntry | null;
  }>({ open: false, entry: null });
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && uploadFilesRef.current) {
      await uploadFilesRef.current(files);
    }
  }, []);

  const uploadFiles = useCallback(async (fileList: File[]) => {
    if (!data?.path) return;

    // Initialize upload states
    const newUploads: UploadFileState[] = fileList.map((file) => ({
      name: file.name,
      size: file.size,
      status: 'pending' as UploadStatus,
      progress: 0,
    }));
    setUploads(newUploads);
    setIsUploading(true);

    // Upload each file
    const formData = new FormData();
    formData.append('path', data.path);
    fileList.forEach((file) => {
      formData.append('files', file);
    });

    try {
      // Mark all as uploading
      setUploads((prev) =>
        prev.map((u) => ({ ...u, status: 'uploading' as UploadStatus }))
      );

      const res = await fetch('/api/workspaces/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const message = body.message ?? `Upload failed (${res.status})`;
        setUploads((prev) =>
          prev.map((u) => ({
            ...u,
            status: 'error' as UploadStatus,
            error: message,
          }))
        );
        return;
      }

      // Mark all as complete
      setUploads((prev) =>
        prev.map((u) => ({ ...u, status: 'complete' as UploadStatus, progress: 100 }))
      );

      // Refresh directory listing
      load(data.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploads((prev) =>
        prev.map((u) => ({
          ...u,
          status: 'error' as UploadStatus,
          error: message,
        }))
      );
    } finally {
      setIsUploading(false);
      // Clear uploads after a delay
      setTimeout(() => setUploads([]), 3000);
    }
  }, [data?.path]);

  // Keep ref in sync with uploadFiles
  uploadFilesRef.current = uploadFiles;

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0 && uploadFilesRef.current) {
      await uploadFilesRef.current(files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

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

  const startFolderCreation = () => {
    setIsCreatingFolder(true);
    setFolderName('');
    setFolderError(null);
  };

  const cancelFolderCreation = () => {
    setIsCreatingFolder(false);
    setFolderName('');
    setFolderError(null);
  };

  const createFolder = useCallback(async () => {
    if (!data?.path || !folderName.trim()) {
      setFolderError('Folder name is required');
      return;
    }

    const trimmedName = folderName.trim();

    // Client-side validation for invalid characters
    if (/[/\\]/.test(trimmedName)) {
      setFolderError('Folder name cannot contain / or \\');
      return;
    }

    if (trimmedName === '.' || trimmedName === '..') {
      setFolderError('Invalid folder name');
      return;
    }

    try {
      const res = await fetch('/api/workspaces/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: data.path, name: trimmedName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFolderError(body.message ?? `Failed to create folder (${res.status})`);
        return;
      }

      // Success - close input and refresh
      cancelFolderCreation();
      load(data.path);
    } catch (err: unknown) {
      setFolderError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  }, [data?.path, folderName, load]);

  const handleFolderInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createFolder();
    } else if (e.key === 'Escape') {
      cancelFolderCreation();
    }
  };

  // Focus folder input when it appears
  useEffect(() => {
    if (isCreatingFolder && folderInputRef.current) {
      folderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu.open) return;
    function handleClick() {
      setContextMenu((prev) => ({ ...prev, open: false }));
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu.open]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu.open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setContextMenu((prev) => ({ ...prev, open: false }));
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [contextMenu.open]);

  const handleContextMenu = (e: React.MouseEvent, entry: BrowseEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, entry });
  };

  const openDeleteDialog = () => {
    if (!contextMenu.entry) return;
    setDeleteDialog({ open: true, entry: contextMenu.entry });
    setContextMenu((prev) => ({ ...prev, open: false }));
  };

  const cancelDelete = () => {
    setDeleteDialog({ open: false, entry: null });
  };

  const confirmDelete = useCallback(async () => {
    if (!deleteDialog.entry) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/workspaces/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: deleteDialog.entry.absolutePath }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.message ?? `Failed to delete (${res.status})`);
      } else {
        toast.success(`Deleted "${deleteDialog.entry.name}"`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setIsDeleting(false);
      setDeleteDialog({ open: false, entry: null });
      if (data?.path) {
        load(data.path);
      }
    }
  }, [deleteDialog.entry, data?.path, load]);

  return (
    <div
      className={cn('flex flex-col h-full border border-border rounded-md bg-card relative', isDragOver && 'ring-2 ring-primary')}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-md pointer-events-none">
          <Upload className="w-8 h-8 text-primary mb-2" />
          <span className="text-sm font-medium text-primary">Drop files to upload</span>
        </div>
      )}

      {/* Upload status bar */}
      {uploads.length > 0 && (
        <div className="flex flex-col gap-1 px-3 py-2 border-b border-border bg-muted/40">
          {uploads.map((upload, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {upload.status === 'complete' ? (
                <span className="text-green-600">&#10003;</span>
              ) : upload.status === 'error' ? (
                <AlertCircle className="w-3 h-3 text-destructive" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              )}
              <span className="truncate flex-1">{upload.name}</span>
              {upload.status === 'complete' && <span className="text-muted-foreground">done</span>}
              {upload.status === 'error' && <span className="text-destructive truncate">{upload.error}</span>}
            </div>
          ))}
        </div>
      )}

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
          {isCreatingFolder ? (
            <>
              <input
                ref={folderInputRef}
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={handleFolderInputKeyDown}
                placeholder="Folder name"
                className="h-6 px-1 text-xs border border-border rounded bg-background w-28"
              />
              <button
                type="button"
                onClick={createFolder}
                className="inline-flex items-center gap-1 px-1 py-0.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Create
              </button>
              <button
                type="button"
                onClick={cancelFolderCreation}
                className="inline-flex items-center gap-1 px-1 py-0.5 text-xs rounded hover:bg-accent"
              >
                Cancel
              </button>
              {folderError && (
                <span className="text-xs text-destructive ml-1">{folderError}</span>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={startFolderCreation}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent"
                title="Create new folder"
              >
                <FolderPlus className="w-3 h-3" />
                New Folder
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-accent disabled:opacity-50"
                title="Upload files"
              >
                {isUploading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                Upload
              </button>
            </>
          )}
          <input
            ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
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
                onContextMenu={(e) => handleContextMenu(e, entry)}
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

      {/* Context menu */}
      {contextMenu.open && contextMenu.entry && (
        <div
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={openDeleteDialog}
            className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ open: false, entry: null });
        }}
      >
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Confirm Delete</p>
            <p className="mt-0.5 text-sm font-medium">
              Delete{deleteDialog.entry?.isDirectory ? ' folder' : ''} &ldquo;{deleteDialog.entry?.name}&rdquo;
            </p>
          </div>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete &ldquo;{deleteDialog.entry?.name}&rdquo;?
            {deleteDialog.entry?.isDirectory && (
              <span className="block mt-1 text-warning"> This folder and all its contents will be permanently deleted.</span>
            )}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={cancelDelete} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Confirm'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}