import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/primitives';
import { downloadUrl } from '@/lib/api';
import type { DocumentItem, DocumentPage } from '@/types';

/** Viewer for TXT and DOCX documents: the extracted text split into its synthetic pages. */
export function TextDocumentViewer({ doc, pages, currentPage, onPageChange, onTextSelected }: { doc: DocumentItem; pages: DocumentPage[]; currentPage: number; onPageChange: (n: number) => void; onTextSelected?: (sel: { text: string; pageNumber: number; rect: DOMRect } | null) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const blocks = el.querySelectorAll<HTMLElement>('[data-page]');
      const mid = el.scrollTop + el.clientHeight / 3;
      let best = 1;
      blocks.forEach((b) => b.offsetTop <= mid && (best = Number(b.dataset.page)));
      onPageChange(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onPageChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (!sel || !text || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return onTextSelected?.(null);
        const range = sel.getRangeAt(0);
        const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const pageEl = startEl?.closest('[data-page]') as HTMLElement | null;
        onTextSelected?.({ text: text.slice(0, 6000), pageNumber: Number(pageEl?.dataset.page ?? currentPage), rect: range.getBoundingClientRect() });
      }, 10);
    };
    el.addEventListener('mouseup', onUp);
    return () => el.removeEventListener('mouseup', onUp);
  }, [onTextSelected, currentPage]);

  if (!pages.length) return <EmptyState title="No text to show" description="This file produced no readable text." className="m-6" />;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-surface px-3 py-1.5 text-sm">
        <span className="text-ink-muted">Section {currentPage} of {pages.length}</span>
        <Button variant="ghost" size="sm" onClick={() => window.open(downloadUrl(doc.id), '_blank')} leftIcon={<Download className="h-4 w-4" />}>Download original</Button>
      </div>
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-auto p-4">
        {pages.map((p) => (
          <article key={p.pageNumber} data-page={p.pageNumber} className="mx-auto mb-4 max-w-3xl rounded-md border border-line bg-surface p-6 shadow-card">
            <p className="mb-2 text-xs text-ink-muted">Section {p.pageNumber}</p>
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.text || <span className="text-ink-muted">(empty)</span>}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
