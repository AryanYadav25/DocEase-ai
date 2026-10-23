import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { ChevronDown, ChevronUp, Download, Keyboard, Maximize2, Minimize2, RotateCw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Alert, Modal, Spinner, Tooltip } from '@/components/ui/primitives';
import { downloadUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DocumentItem } from '@/types';
import { PdfPage } from './PdfPage';
import { buildTextIndex, loadPdf, type PDFDocumentProxy, type PageTextIndex } from './pdfjs';

export interface ViewerHandle {
  goToPage: (n: number) => void;
}

interface Props {
  doc: DocumentItem;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  onTextSelected?: (sel: { text: string; pageNumber: number; rect: DOMRect } | null) => void;
  onThumbnailsReady?: (pdf: PDFDocumentProxy) => void;
}

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export const PdfViewer = forwardRef<ViewerHandle, Props>(function PdfViewer({ doc, initialPage = 1, onPageChange, onTextSelected, onThumbnailsReady }, ref) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<'width' | 'page' | null>('width');
  const [rotation, setRotation] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([initialPage]));
  const [fullscreen, setFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [textIndex, setTextIndex] = useState<PageTextIndex[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [activeMatch, setActiveMatch] = useState<{ page: number; index: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const initialScrollDone = useRef(false);

  // ---- load document ----
  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    setLoadError(null);
    initialScrollDone.current = false;
    loadPdf(downloadUrl(doc.id, true))
      .then(async (p) => {
        if (cancelled) return;
        const sizes: Array<{ width: number; height: number }> = [];
        for (let i = 1; i <= p.numPages; i++) {
          const page = await p.getPage(i);
          const vp = page.getViewport({ scale: 1 });
          sizes.push({ width: vp.width, height: vp.height });
        }
        if (cancelled) return;
        setPageSizes(sizes);
        setPdf(p);
        onThumbnailsReady?.(p);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message || 'The PDF could not be loaded.'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  // ---- fit modes ----
  const applyFit = useCallback(() => {
    if (!fitMode || !pageSizes.length || !scrollRef.current) return;
    const first = pageSizes[Math.max(0, currentPage - 1)] ?? pageSizes[0];
    const rotated = rotation % 180 !== 0;
    const pw = rotated ? first.height : first.width;
    const ph = rotated ? first.width : first.height;
    const box = scrollRef.current.getBoundingClientRect();
    const availW = box.width - 32;
    const availH = box.height - 32;
    setScale(fitMode === 'width' ? Math.max(0.3, availW / pw) : Math.max(0.3, Math.min(availW / pw, availH / ph)));
  }, [fitMode, pageSizes, rotation, currentPage]);

  useEffect(() => {
    applyFit();
  }, [applyFit, pdf]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !fitMode) return;
    const ro = new ResizeObserver(() => applyFit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyFit, fitMode]);

  // ---- visibility (virtualisation) + current page tracking ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdf) return;
    const pages = el.querySelectorAll<HTMLElement>('[data-page]');
    const io = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root: el, rootMargin: '600px 0px' },
    );
    pages.forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [pdf, pageSizes, scale, rotation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pdf) return;
    const onScroll = () => {
      const pages = el.querySelectorAll<HTMLElement>('[data-page]');
      const mid = el.scrollTop + el.clientHeight / 3;
      let best = 1;
      pages.forEach((p) => {
        if (p.offsetTop <= mid) best = Number(p.dataset.page);
      });
      setCurrentPage((c) => (c === best ? c : best));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [pdf]);

  useEffect(() => {
    setPageInput(String(currentPage));
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  const goToPage = useCallback((n: number) => {
    const el = scrollRef.current;
    if (!el || !pdf) return;
    const clamped = Math.max(1, Math.min(pdf.numPages, n));
    const target = el.querySelector<HTMLElement>(`[data-page="${clamped}"]`);
    if (target) el.scrollTo({ top: target.offsetTop - 8, behavior: 'auto' });
    setCurrentPage(clamped);
  }, [pdf]);

  useImperativeHandle(ref, () => ({ goToPage }), [goToPage]);

  // Scroll to last viewed page once the first layout is ready.
  useEffect(() => {
    if (!pdf || initialScrollDone.current || !pageSizes.length) return;
    const t = setTimeout(() => {
      initialScrollDone.current = true;
      if (initialPage > 1) goToPage(initialPage);
    }, 50);
    return () => clearTimeout(t);
  }, [pdf, pageSizes, initialPage, goToPage, scale]);

  // ---- zoom ----
  const zoom = (dir: 1 | -1) => {
    setFitMode(null);
    setScale((s) => {
      const idx = ZOOM_STEPS.findIndex((z) => z >= s - 0.001);
      const next = dir > 0 ? ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, (idx === -1 ? ZOOM_STEPS.length - 1 : idx) + 1)] : ZOOM_STEPS[Math.max(0, (idx === -1 ? ZOOM_STEPS.length : idx) - 1)];
      return next;
    });
  };

  // ---- search ----
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !textIndex) return [];
    const out: Array<{ page: number; index: number }> = [];
    for (const p of textIndex) {
      let i = 0;
      let from = 0;
      while ((from = p.text.indexOf(q, from)) !== -1) {
        out.push({ page: p.pageNumber, index: i++ });
        from += q.length;
      }
    }
    return out;
  }, [query, textIndex]);

  // Approximate: highlights are per text-layer span, so indexes map loosely for navigation.
  const openSearch = async () => {
    setShowSearch(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
    if (!textIndex && pdf && !indexing) {
      setIndexing(true);
      try {
        setTextIndex(await buildTextIndex(pdf));
      } finally {
        setIndexing(false);
      }
    }
  };
  const [matchPos, setMatchPos] = useState(0);
  useEffect(() => {
    setMatchPos(0);
    setActiveMatch(matches.length ? matches[0] : null);
    if (matches.length) goToPage(matches[0].page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);
  const stepMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    const next = (matchPos + dir + matches.length) % matches.length;
    setMatchPos(next);
    setActiveMatch(matches[next]);
    goToPage(matches[next].page);
  };

  // ---- fullscreen ----
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && containerRef.current?.contains(target as Node)) {
        e.preventDefault();
        void openSearch();
        return;
      }
      if (typing) return;
      if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
          e.preventDefault();
          goToPage(currentPage + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          goToPage(currentPage - 1);
          break;
        case '+':
        case '=':
          zoom(1);
          break;
        case '-':
          zoom(-1);
          break;
        case 'r':
          setRotation((r) => (r + 90) % 360);
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'w':
          setFitMode('width');
          break;
        case 'p':
          setFitMode('page');
          break;
        case '?':
          setShowHelp(true);
          break;
        case 'Escape':
          setShowSearch(false);
          setQuery('');
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, goToPage, pdf]);

  // ---- text selection ----
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onUp = () => {
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (!sel || sel.rangeCount === 0 || !text || !el.contains(sel.anchorNode)) {
          onTextSelected?.(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
        const pageEl = startEl?.closest('[data-page]') as HTMLElement | null;
        onTextSelected?.({ text: text.slice(0, 6000), pageNumber: Number(pageEl?.dataset.page ?? currentPage), rect: range.getBoundingClientRect() });
      }, 10);
    };
    el.addEventListener('mouseup', onUp);
    el.addEventListener('touchend', onUp);
    return () => {
      el.removeEventListener('mouseup', onUp);
      el.removeEventListener('touchend', onUp);
    };
  }, [onTextSelected, currentPage]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Alert tone="danger" title="This PDF could not be displayed" action={<Button size="sm" variant="outline" onClick={() => window.open(downloadUrl(doc.id), '_blank')}>Download</Button>}>
          {loadError}. The file may be corrupt or encrypted. Processing details are in the library.
        </Alert>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-canvas" tabIndex={0} aria-label="PDF viewer">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <div className="flex items-center gap-1">
          <Tooltip label="Previous page (←)"><Button variant="ghost" size="icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronUp className="h-4 w-4" /></Button></Tooltip>
          <form onSubmit={(e) => { e.preventDefault(); goToPage(Number(pageInput) || 1); }} className="flex items-center gap-1 text-sm">
            <input value={pageInput} onChange={(e) => setPageInput(e.target.value)} onBlur={() => goToPage(Number(pageInput) || currentPage)} className="h-8 w-12 rounded border border-line-strong bg-surface text-center tabular-nums" aria-label="Page number" inputMode="numeric" />
            <span className="text-ink-muted">/ {pdf?.numPages ?? (doc.pageCount || '?')}</span>
          </form>
          <Tooltip label="Next page (→)"><Button variant="ghost" size="icon" onClick={() => goToPage(currentPage + 1)} disabled={!pdf || currentPage >= pdf.numPages} aria-label="Next page"><ChevronDown className="h-4 w-4" /></Button></Tooltip>
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <Tooltip label="Zoom out (−)"><Button variant="ghost" size="icon" onClick={() => zoom(-1)} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button></Tooltip>
        <select value={fitMode ?? 'custom'} onChange={(e) => { const v = e.target.value; if (v === 'width' || v === 'page') setFitMode(v); else { setFitMode(null); setScale(Number(v)); } }} className="h-8 rounded border border-line-strong bg-surface px-1 text-xs" aria-label="Zoom level">
          <option value="width">Fit width</option>
          <option value="page">Fit page</option>
          {!fitMode && !ZOOM_STEPS.includes(scale) && <option value="custom">{Math.round(scale * 100)}%</option>}
          {ZOOM_STEPS.map((z) => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}
        </select>
        <Tooltip label="Zoom in (+)"><Button variant="ghost" size="icon" onClick={() => zoom(1)} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button></Tooltip>
        <Tooltip label="Rotate (R)"><Button variant="ghost" size="icon" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate pages"><RotateCw className="h-4 w-4" /></Button></Tooltip>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip label="Search (Ctrl+F)"><Button variant={showSearch ? 'secondary' : 'ghost'} size="icon" onClick={() => (showSearch ? setShowSearch(false) : void openSearch())} aria-label="Search in document"><Search className="h-4 w-4" /></Button></Tooltip>
          <Tooltip label="Download original"><Button variant="ghost" size="icon" onClick={() => window.open(downloadUrl(doc.id), '_blank')} aria-label="Download original"><Download className="h-4 w-4" /></Button></Tooltip>
          <Tooltip label="Keyboard shortcuts (?)"><Button variant="ghost" size="icon" onClick={() => setShowHelp(true)} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></Button></Tooltip>
          <Tooltip label={fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}><Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label="Toggle fullscreen">{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button></Tooltip>
        </div>
      </div>

      {showSearch && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-2 py-1.5">
          <input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && stepMatch(e.shiftKey ? -1 : 1)} placeholder="Find in document" className="h-8 flex-1 rounded border border-line-strong bg-surface px-2 text-sm" aria-label="Find in document" />
          <span className="text-xs tabular-nums text-ink-muted">{indexing ? 'Indexing…' : query ? `${matches.length ? matchPos + 1 : 0} / ${matches.length}` : ''}</span>
          <Button variant="ghost" size="icon" onClick={() => stepMatch(-1)} disabled={!matches.length} aria-label="Previous match"><ChevronUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => stepMatch(1)} disabled={!matches.length} aria-label="Next match"><ChevronDown className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setShowSearch(false); setQuery(''); }} aria-label="Close search"><X className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Pages */}
      <div ref={scrollRef} className={cn('scrollbar-thin relative flex-1 overflow-auto p-4', fullscreen && 'bg-ink/90')}>
        {!pdf ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-muted"><Spinner /> Loading PDF…</div>
        ) : (
          pageSizes.map((size, i) => (
            <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} scale={scale} rotation={rotation} baseWidth={size.width} baseHeight={size.height} visible={visiblePages.has(i + 1)} searchQuery={query} activeMatch={activeMatch} />
          ))
        )}
      </div>

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="Keyboard shortcuts" size="sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {[['← / →', 'Previous / next page'], ['+ / −', 'Zoom in / out'], ['W', 'Fit to width'], ['P', 'Fit to page'], ['R', 'Rotate 90°'], ['F', 'Toggle fullscreen'], ['Ctrl+F', 'Find in document'], ['Enter / Shift+Enter', 'Next / previous match'], ['Esc', 'Close search'], ['?', 'This help']].map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border border-line-strong bg-surface-raised px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
});
