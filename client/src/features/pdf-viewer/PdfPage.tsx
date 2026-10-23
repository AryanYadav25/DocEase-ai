import { memo, useEffect, useRef, useState } from 'react';
import { pdfjsLib, type PDFDocumentProxy } from './pdfjs';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  rotation: number;
  baseWidth: number;
  baseHeight: number;
  visible: boolean;
  searchQuery: string;
  activeMatch: { page: number; index: number } | null;
  onRendered?: (pageNumber: number) => void;
}

/**
 * Renders one page: a canvas plus a pdf.js text layer for selection and search
 * highlighting. Renders only when `visible` (virtualisation handled by the parent),
 * and keeps the placeholder at the correct size so scrolling stays stable.
 */
export const PdfPage = memo(function PdfPage({ pdf, pageNumber, scale, rotation, baseWidth, baseHeight, visible, searchQuery, activeMatch, onRendered }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rotated = rotation % 180 !== 0;
  const cssWidth = Math.floor((rotated ? baseHeight : baseWidth) * scale);
  const cssHeight = Math.floor((rotated ? baseWidth : baseHeight) * scale);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy['render']> | null = null;
    let textLayer: InstanceType<typeof pdfjsLib.TextLayer> | null = null;
    setRendered(false);
    setError(null);

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale, rotation });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext('2d', { alpha: false })!;
        renderTask = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        await renderTask.promise;
        if (cancelled) return;

        const container = textRef.current;
        if (container) {
          container.innerHTML = '';
          container.style.width = `${Math.floor(viewport.width)}px`;
          container.style.height = `${Math.floor(viewport.height)}px`;
          container.style.setProperty('--scale-factor', String(viewport.scale));
          textLayer = new pdfjsLib.TextLayer({ textContentSource: await page.getTextContent(), container, viewport });
          await textLayer.render();
          const end = document.createElement('div');
          end.className = 'endOfContent';
          container.appendChild(end);
        }
        if (!cancelled) {
          setRendered(true);
          onRendered?.(pageNumber);
        }
      } catch (err) {
        if (!cancelled && (err as Error).name !== 'RenderingCancelledException') setError((err as Error).message || 'Could not render this page.');
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, rotation, visible, onRendered]);

  // Search highlighting on the text layer spans.
  useEffect(() => {
    const container = textRef.current;
    if (!container || !rendered) return;
    const q = searchQuery.trim().toLowerCase();
    const spans = container.querySelectorAll<HTMLSpanElement>('span');
    let matchIdx = 0;
    spans.forEach((span) => {
      span.classList.remove('highlight', 'selected');
      if (!q) return;
      if (span.textContent?.toLowerCase().includes(q)) {
        span.classList.add('highlight');
        if (activeMatch && activeMatch.page === pageNumber && activeMatch.index === matchIdx) {
          span.classList.add('selected');
          span.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        matchIdx++;
      }
    });
  }, [searchQuery, activeMatch, rendered, pageNumber]);

  return (
    <div data-page={pageNumber} className="relative mx-auto mb-4 bg-white shadow-card" style={{ width: cssWidth, height: cssHeight }} aria-label={`Page ${pageNumber}`}>
      {visible && <canvas ref={canvasRef} className="block" />}
      {visible && <div ref={textRef} className="textLayer" />}
      {!rendered && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-muted">Page {pageNumber}</div>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-danger">Could not render page {pageNumber}: {error}</div>}
    </div>
  );
});
