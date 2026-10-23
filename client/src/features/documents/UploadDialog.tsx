import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, FileText, Image as ImageIcon, RotateCcw, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Modal, Progress } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';
import { documentsApi } from '@/services/api';
import type { DocumentItem, UploadPolicy } from '@/types';

interface QueueItem {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'rejected';
  progress: number;
  error?: string;
  document?: DocumentItem;
  duplicateOf?: string;
}

function validate(file: File, policy: UploadPolicy): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!policy.acceptedExtensions.includes(ext)) return `"${ext}" files are not supported.`;
  if (file.size === 0) return 'This file is empty.';
  if (file.size > policy.maxFileSizeBytes) return `Larger than the ${policy.maxFileSizeMb} MB limit.`;
  return null;
}

export function UploadDialog({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded?: (docs: DocumentItem[]) => void }) {
  const { data: policy } = useQuery({ queryKey: ['upload-policy'], queryFn: documentsApi.uploadPolicy, staleTime: Infinity });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setQueue([]);
      setUploading(false);
    }
  }, [open]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      if (!policy) return;
      const items: QueueItem[] = Array.from(files).map((file) => {
        const err = validate(file, policy);
        return { id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, status: err ? 'rejected' : 'queued', progress: 0, error: err ?? undefined };
      });
      setQueue((q) => {
        const merged = [...q, ...items.filter((it) => !q.some((e) => e.file.name === it.file.name && e.file.size === it.file.size && e.status !== 'done'))];
        return merged.slice(0, policy.maxFilesPerUpload + 20);
      });
    },
    [policy],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const startUpload = async () => {
    if (!policy) return;
    const batch = queue.filter((q) => q.status === 'queued' || q.status === 'error').slice(0, policy.maxFilesPerUpload);
    if (batch.length === 0) return;
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const ids = new Set(batch.map((b) => b.id));
    setQueue((q) => q.map((it) => (ids.has(it.id) ? { ...it, status: 'uploading', progress: 0, error: undefined } : it)));
    try {
      const data = await documentsApi.upload(
        batch.map((b) => b.file),
        (pct) => setQueue((q) => q.map((it) => (ids.has(it.id) ? { ...it, progress: pct } : it))),
        controller.signal,
      );
      const uploaded: DocumentItem[] = [];
      setQueue((q) =>
        q.map((it) => {
          if (!ids.has(it.id)) return it;
          const idx = batch.findIndex((b) => b.id === it.id);
          const r = data.results[idx];
          if (!r) return { ...it, status: 'error', error: 'No response for this file.' };
          if (r.ok) {
            uploaded.push(r.document);
            return { ...it, status: 'done', progress: 100, document: r.document, duplicateOf: r.duplicateOf };
          }
          return { ...it, status: 'error', progress: 0, error: r.error.message };
        }),
      );
      if (uploaded.length) {
        await qc.invalidateQueries({ queryKey: ['documents'] });
        await qc.invalidateQueries({ queryKey: ['dashboard'] });
        toast.success(uploaded.length === 1 ? 'Upload complete' : `${uploaded.length} files uploaded`, 'Processing has started. You can keep working.');
        onUploaded?.(uploaded);
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Upload failed.';
      setQueue((q) => q.map((it) => (ids.has(it.id) ? { ...it, status: err instanceof ApiError && err.code === 'ABORTED' ? 'queued' : 'error', progress: 0, error: err instanceof ApiError && err.code === 'ABORTED' ? undefined : message } : it)));
      if (!(err instanceof ApiError && err.code === 'ABORTED')) toast.error('Upload failed', message);
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  const pending = queue.filter((q) => q.status === 'queued' || q.status === 'error').length;
  const done = queue.filter((q) => q.status === 'done');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload documents"
      description={policy ? `Up to ${policy.maxFilesPerUpload} files per upload, ${policy.maxFileSizeMb} MB and ${policy.maxPageCount} pages each. Accepted: ${policy.acceptedExtensions.join(', ')}.` : 'Loading limits…'}
      size="lg"
      footer={
        <>
          {uploading ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              Cancel upload
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {done.length ? 'Done' : 'Close'}
            </Button>
          )}
          {done.length === 1 && !uploading && (
            <Button variant="secondary" onClick={() => { onClose(); navigate(`/app/workspace/${done[0].document!.id}`); }}>
              Open in workspace
            </Button>
          )}
          <Button onClick={startUpload} disabled={!pending || uploading || !policy} loading={uploading} leftIcon={<Upload className="h-4 w-4" />}>
            {pending > 1 ? `Upload ${pending} files` : 'Upload'}
          </Button>
        </>
      }
    >
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Choose files or drop them here"
        className={cn('flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors', dragging ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-raised')}
      >
        <Upload className="h-6 w-6 text-accent" />
        <p className="mt-2 text-sm font-medium">Drop files here or click to choose</p>
        <p className="mt-0.5 text-xs text-ink-muted">PDFs, scanned PDFs, PNG, JPG, WebP, DOCX and TXT</p>
        <input ref={inputRef} type="file" multiple hidden accept={policy?.acceptedExtensions.join(',')} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {queue.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {queue.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {it.file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-ink-muted" /> : <FileText className="h-4 w-4 shrink-0 text-ink-muted" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{it.file.name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{formatBytes(it.file.size)}</span>
                </div>
                {it.status === 'uploading' && <Progress value={it.progress} className="mt-1.5" />}
                {(it.status === 'error' || it.status === 'rejected') && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
                    <AlertCircle className="h-3 w-3" /> {it.error}
                  </p>
                )}
                {it.status === 'done' && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> Uploaded, processing{it.duplicateOf ? ' (you already have an identical file)' : ''}
                  </p>
                )}
              </div>
              {it.status === 'error' && (
                <button onClick={() => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, status: 'queued', error: undefined } : x)))} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Retry">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              {it.status !== 'uploading' && (
                <button onClick={() => setQueue((q) => q.filter((x) => x.id !== it.id))} className="rounded p-1 text-ink-muted hover:text-ink" aria-label="Remove from list">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {policy && queue.filter((q) => q.status === 'queued').length > policy.maxFilesPerUpload && (
        <Alert tone="warning" className="mt-3">
          Only the first {policy.maxFilesPerUpload} files will be sent in this batch; run Upload again for the rest.
        </Alert>
      )}
    </Modal>
  );
}
