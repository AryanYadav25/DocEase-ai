import { createContext, useContext, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { copyToClipboard, downloadText, slugFilename } from '@/lib/utils';
import type { AiStatus, DocumentItem, ExplanationLevel, ModelMeta, OutputLength } from '@/types';

export interface WorkspaceContextValue {
  doc: DocumentItem;
  goToPage: (n: number) => void;
  ai: AiStatus | undefined;
  defaultLevel: ExplanationLevel;
  defaultLength: OutputLength;
  preferredLanguage: string;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace outside WorkspaceContext');
  return ctx;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

export function AiUnavailable({ ai }: { ai: AiStatus | undefined }) {
  if (!ai || ai.configured) return null;
  return (
    <Alert tone="warning" title="AI is not configured on this server">
      {ai.problem} Reading, OCR and text editing still work.
    </Alert>
  );
}

export function PageRef({ page, label }: { page?: number | null; label?: string }) {
  const { goToPage } = useWorkspace();
  if (!page) return null;
  return (
    <button onClick={() => goToPage(page)} className="inline-flex items-center rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink hover:bg-accent/20" title={`Go to page ${page}`}>
      {label ?? `p.${page}`}
    </button>
  );
}

export function GeneratedBy({ meta, cached, coverage, className }: { meta: ModelMeta | null | undefined; cached?: boolean; coverage?: { pagesCovered: number; totalPages: number; truncated: boolean }; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted ${className ?? ''}`}>
      <Badge tone="accent"><Sparkles className="h-3 w-3" /> AI-generated</Badge>
      {meta?.isMock && <Badge tone="warning">Mock output — not real AI</Badge>}
      {meta && <span>{meta.provider} · {meta.model}{meta.totalTokens ? ` · ${meta.totalTokens} tokens` : ''}{meta.latencyMs ? ` · ${(meta.latencyMs / 1000).toFixed(1)}s` : ''}</span>}
      {cached && <span>· from saved results</span>}
      {coverage?.truncated && <Badge tone="warning">Only pages 1–{coverage.pagesCovered} of {coverage.totalPages} were included</Badge>}
    </div>
  );
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`prose-doc ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function ExportButtons({ markdown, filenameBase, csv }: { markdown: string; filenameBase: string; csv?: string }) {
  const toast = useToast();
  const { doc } = useWorkspace();
  const base = slugFilename(`${doc.title}-${filenameBase}`, '');
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={async () => toast[(await copyToClipboard(markdown)) ? 'success' : 'error']((await copyToClipboard(markdown)) ? 'Copied' : 'Copy failed')}>Copy</Button>
      <Button size="sm" variant="ghost" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${base}md`, markdown, 'text/markdown')}>Markdown</Button>
      <Button size="sm" variant="ghost" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${base}txt`, markdown.replace(/[#*_>`]/g, ''), 'text/plain')}>TXT</Button>
      {csv && <Button size="sm" variant="ghost" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => downloadText(`${base}csv`, csv, 'text/csv')}>CSV</Button>}
    </div>
  );
}

export function LevelLengthControls({ level, length, onLevel, onLength, showLength = true }: { level: ExplanationLevel; length: OutputLength; onLevel: (l: ExplanationLevel) => void; onLength: (l: OutputLength) => void; showLength?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        Level
        <select value={level} onChange={(e) => onLevel(e.target.value as ExplanationLevel)} className="h-8 rounded border border-line-strong bg-surface px-1.5 text-xs text-ink">
          <option value="very_simple">Very simple</option>
          <option value="beginner">Beginner</option>
          <option value="standard">Standard</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>
      {showLength && (
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          Length
          <select value={length} onChange={(e) => onLength(e.target.value as OutputLength)} className="h-8 rounded border border-line-strong bg-surface px-1.5 text-xs text-ink">
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      )}
    </div>
  );
}

export function Section({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  if (count === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

export function PanelHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-xs text-ink-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Serialise a structured summary to Markdown for export. */
export function toMarkdown(title: string, content: unknown): string {
  const lines: string[] = [`# ${title}`, ''];
  const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
  const walk = (v: unknown, depth: number, key?: string) => {
    if (v == null || v === '') return;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      lines.push(key && depth <= 1 ? `**${label(key)}:** ${v}` : `${v}`);
      lines.push('');
      return;
    }
    if (Array.isArray(v)) {
      if (!v.length) return;
      if (key) lines.push(`${'#'.repeat(Math.min(6, depth + 1))} ${label(key)}`, '');
      for (const it of v) {
        if (typeof it === 'string') lines.push(`- ${it}`);
        else if (it && typeof it === 'object') {
          const o = it as Record<string, unknown>;
          const parts = Object.entries(o).filter(([k]) => !['page', 'id', 'pageStart', 'pageEnd', 'options', 'correctOptionIndex'].includes(k)).map(([k, val]) => (Array.isArray(val) ? `${label(k)}: ${val.join('; ')}` : `${label(k)}: ${val}`));
          const pg = o.page ?? o.pageStart;
          lines.push(`- ${parts.join(' — ')}${pg ? ` (p.${pg})` : ''}`);
        }
      }
      lines.push('');
      return;
    }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (['explanationLevel', 'truncated', 'sourceLabel'].includes(k)) continue;
        if (typeof val === 'string') {
          lines.push(`${'#'.repeat(Math.min(6, depth + 1))} ${label(k)}`, '', val, '');
        } else walk(val, depth + 1, k);
      }
    }
  };
  walk(content, 1);
  lines.push('---', '_Generated by DocuEase AI. AI output can contain errors; check against the original document._');
  return lines.join('\n');
}
