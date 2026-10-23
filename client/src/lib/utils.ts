import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(iso);
}

export const EXPLANATION_LEVEL_LABELS: Record<string, string> = {
  very_simple: 'Very simple',
  beginner: 'Beginner',
  standard: 'Standard',
  detailed: 'Detailed',
};

export const OUTPUT_LENGTH_LABELS: Record<string, string> = {
  short: 'Short',
  medium: 'Medium',
  detailed: 'Detailed',
};

export const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing',
  ocr_in_progress: 'Running OCR',
  indexing: 'Indexing',
  completed: 'Ready',
  completed_with_warnings: 'Ready with warnings',
  failed: 'Failed',
};

export function isProcessing(status: string) {
  return ['queued', 'uploading', 'processing', 'ocr_in_progress', 'indexing'].includes(status);
}

export function isReady(status: string) {
  return status === 'completed' || status === 'completed_with_warnings';
}

export function fileKindLabel(kind: string) {
  return { pdf: 'PDF', image: 'Image', text: 'Text', docx: 'Word' }[kind] ?? kind;
}

export function downloadText(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function slugFilename(title: string, ext: string) {
  return `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'document'}.${ext}`;
}
