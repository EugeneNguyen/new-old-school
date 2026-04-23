'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, AlertCircle, FileText, Music, FileQuestion, Download } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { classifyFile, formatSize, formatDate, getFileExtension } from '@/lib/file-types';
import type { BrowseEntry } from './FileBrowser';

interface PreviewResponse {
  name: string;
  path: string;
  size: number;
  modified: string;
  content: string | null;
  previewable: boolean;
  truncated: boolean;
}

const MAX_BINARY_SIZE = 100 * 1024 * 1024; // 100 MB

interface FileViewerProps {
  entry: BrowseEntry | null;
  onClose: () => void;
}

export default function FileViewer({ entry, onClose }: FileViewerProps) {
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!entry) {
      setPreviewData(null);
      return;
    }

    setLoading(true);
    setError(null);

    const classification = classifyFile(entry.name);

    if (classification.category === 'text') {
      // Use preview API for text files
      try {
        const res = await fetch(`/api/workspaces/preview?path=${encodeURIComponent(entry.absolutePath)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.message ?? `Failed to preview (${res.status})`);
          return;
        }
        const data = (await res.json()) as PreviewResponse;
        setPreviewData(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setLoading(false);
      }
    } else {
      // For binary files, just store the entry info
      setPreviewData({
        name: entry.name,
        path: entry.absolutePath,
        size: entry.size ?? 0,
        modified: entry.modified ?? new Date().toISOString(),
        content: null,
        previewable: classification.supported,
        truncated: false,
      });
      setLoading(false);
    }
  }, [entry]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (!entry) {
    return (
      <div className="flex flex-col h-full border-l border-border bg-card">
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          <div className="text-center">
            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Select a file to preview</p>
          </div>
        </div>
      </div>
    );
  }

  const classification = classifyFile(entry.name);
  const isBinaryTooLarge = entry.size !== undefined && entry.size > MAX_BINARY_SIZE;

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40 shrink-0">
        <div className="truncate text-sm font-medium flex-1">{previewData?.name ?? entry.name}</div>
        <a
          href={`/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}&download=true`}
          target="_blank"
          rel="noopener noreferrer"
          type="button"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-transparent bg-transparent hover:bg-accent hover:text-accent-foreground h-8 px-2 transition-colors mr-1"
          title="Download file"
        >
          <Download className="w-4 h-4" />
        </a>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Metadata bar */}
      {previewData && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
          <span>{formatSize(previewData.size)}</span>
          {previewData.modified && (
            <>
              <span>•</span>
              <span>Modified {formatDate(previewData.modified)}</span>
            </>
          )}
          <span>•</span>
          <span className="uppercase">{getFileExtension(entry.name) || 'unknown'}</span>
        </div>
      )}

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading preview…</span>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="flex items-start gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Failed to load preview</p>
                <p className="text-muted-foreground mt-1">{error}</p>
                <button
                  type="button"
                  onClick={loadPreview}
                  className="mt-2 text-xs underline hover:no-underline text-destructive"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Text file content */}
          {!loading && !error && previewData && classification.category === 'text' && (
            <div className="space-y-3">
              {previewData.previewable && previewData.content !== null ? (
                <>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground bg-muted/30 rounded p-3 overflow-x-auto">
                    {previewData.content}
                  </pre>
                  {previewData.truncated && (
                    <p className="text-xs text-muted-foreground italic">
                      [File truncated — showing first 100 lines]
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Preview not available for this text file.</p>
              )}
            </div>
          )}

          {/* Image preview */}
          {!loading && !error && previewData && classification.category === 'image' && !isBinaryTooLarge && (
            <div className="space-y-3">
              <img
                src={`/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}`}
                alt={entry.name}
                className="max-w-full h-auto rounded border border-border"
                loading="lazy"
              />
            </div>
          )}

          {/* Audio preview */}
          {!loading && !error && previewData && classification.category === 'audio' && !isBinaryTooLarge && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded border border-border">
                <Music className="w-8 h-8 text-pink-500 shrink-0" />
                <audio
                  src={`/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}`}
                  controls
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Video preview */}
          {!loading && !error && previewData && classification.category === 'video' && !isBinaryTooLarge && (
            <div className="space-y-3">
              <video
                src={`/api/workspaces/serve?path=${encodeURIComponent(entry.absolutePath)}`}
                controls
                className="max-w-full rounded border border-border"
              />
            </div>
          )}

          {/* Unsupported or too large — show metadata card */}
          {!loading && !error && previewData && (classification.category === 'unsupported' || isBinaryTooLarge) && (
            <MetadataCard
              name={entry.name}
              absolutePath={entry.absolutePath}
              size={previewData.size}
              modified={previewData.modified}
              extension={getFileExtension(entry.name)}
              reason={isBinaryTooLarge ? 'File is too large to preview' : `Cannot preview ${classification.category} files`}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function MetadataCard({
  name,
  absolutePath,
  size,
  modified,
  extension,
  reason,
}: {
  name: string;
  absolutePath: string;
  size: number;
  modified: string;
  extension: string;
  reason: string;
}) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileQuestion className="w-5 h-5 text-muted-foreground" />
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Type</p>
            <p className="font-medium uppercase">.{extension || 'unknown'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Size</p>
            <p className="font-medium">{formatSize(size)}</p>
          </div>
          <div className="space-y-1 col-span-2">
            <p className="text-xs text-muted-foreground">Modified</p>
            <p className="font-medium">{formatDate(modified)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>{reason}</span>
        </div>
        <div className="pt-3 border-t border-border">
          <a
            href={`/api/workspaces/serve?path=${encodeURIComponent(absolutePath)}&download=true`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Download file"
          >
            <Download className="w-4 h-4" />
            Download
          </a>
        </div>
      </CardContent>
    </Card>
  );
}