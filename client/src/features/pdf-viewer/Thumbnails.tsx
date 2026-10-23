import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { PDFDocumentProxy } from './pdfjs';

export function Thumbnails({ pdf, currentPage, onSelect }: { pdf: PDFDocumentProxy; currentPage: number; onSelect: (n: number) => void }) {
  return (
    <div className="scrollbar-thin flex h-full flex-col gap-2 overflow-y-auto p-2">
      {Array.from({ length: pdf.numPages }, (_, i) => (
        <Thumb key={i + 1} pdf={pdf} pageNumber={i + 1} active={currentPage === i + 1} onSelect={onSelect} />
      ))}
    </div>
  );
}

const Thumb = memo(function Thumb({ pdf, pageNumber, active, onSelect }: { pdf: PDFDocumentProxy; pageNumber: number; active: boolean; onSelect: (n: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || done) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = 140 / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      if (!cancelled) setDone(true);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, done, pdf, pageNumber]);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button ref={ref} onClick={() => onSelect(pageNumber)} className={cn('flex flex-col items-center gap-1 rounded-md p-1.5 text-xs', active ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-line/50')} aria-label={`Go to page ${pageNumber}`} aria-current={active || undefined}>
      <div className={cn('flex min-h-20 w-[140px] items-center justify-center overflow-hidden rounded border bg-white', active ? 'border-accent' : 'border-line')}>
        <canvas ref={canvasRef} className={cn('block w-full', !done && 'hidden')} />
        {!done && <span className="text-[11px] text-ink-muted">{pageNumber}</span>}
      </div>
      <span>{pageNumber}</span>
    </button>
  );
});
