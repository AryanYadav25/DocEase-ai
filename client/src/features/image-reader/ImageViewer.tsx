import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Maximize2, RotateCw, ScanText, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Input';
import { Alert, Badge, Modal, Tooltip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { ApiError, downloadUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { documentsApi } from '@/services/api';
import type { DocumentItem, DocumentPage } from '@/types';

/**
 * Image reader: preview with rotate/zoom, plus an OCR panel that re-runs recognition with
 * the chosen preprocessing. The original image is never modified; rotation is applied as
 * an OCR option and as a CSS preview transform.
 */
export function ImageViewer({ doc, page, onPageUpdated, onTextSelected }: { doc: DocumentItem; page: DocumentPage | null; onPageUpdated: (page: DocumentPage, doc: DocumentItem) => void; onTextSelected?: (sel: { text: string; pageNumber: number; rect: DOMRect } | null) => void }) {
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [zoom, setZoom] = useState(1);
  const [enhance, setEnhance] = useState(true);
  const [grayscale, setGrayscale] = useState(true);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => setImgError(false), [doc.id]);

  const runOcr = async () => {
    setRunning(true);
    try {
      const res = await documentsApi.retryPageOcr(doc.id, 1, { rotate: rotation, enhance, grayscale });
      if (res.page) onPageUpdated(res.page, res.document);
      await qc.invalidateQueries({ queryKey: ['extracted-text', doc.id] });
      if (res.result.ok) toast.success('OCR finished', res.result.confidence !== undefined ? `Confidence ${res.result.confidence}%` : undefined);
      else toast.error('OCR failed', res.result.error);
      setOcrOpen(false);
    } catch (err) {
      toast.error('OCR failed', err instanceof ApiError ? err.message : 'Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const conf = page?.ocr?.confidence;

  return (
    <div className="flex h-full flex-col bg-canvas">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <Tooltip label="Zoom out"><Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button></Tooltip>
        <span className="w-12 text-center text-xs tabular-nums text-ink-muted">{Math.round(zoom * 100)}%</span>
        <Tooltip label="Zoom in"><Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button></Tooltip>
        <Tooltip label="Rotate"><Button variant="ghost" size="icon" onClick={() => setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)} aria-label="Rotate image"><RotateCw className="h-4 w-4" /></Button></Tooltip>
        <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>Reset</Button>
        <div className="ml-auto flex items-center gap-1.5">
          {page?.ocr?.attempted && conf !== undefined && <Badge tone={conf >= 80 ? 'success' : conf >= 60 ? 'warning' : 'danger'}>OCR confidence {conf}%</Badge>}
          {page?.editedByUser && <Badge tone="accent">Edited by you</Badge>}
          <Button size="sm" variant="secondary" onClick={() => setOcrOpen(true)} leftIcon={<ScanText className="h-4 w-4" />}>{page?.ocr?.attempted ? 'Re-run OCR' : 'Run OCR'}</Button>
          <Tooltip label="Download original"><Button variant="ghost" size="icon" onClick={() => window.open(downloadUrl(doc.id), '_blank')} aria-label="Download original"><Download className="h-4 w-4" /></Button></Tooltip>
          <Tooltip label="Fullscreen"><Button variant="ghost" size="icon" onClick={() => setFullscreen(true)} aria-label="View fullscreen"><Maximize2 className="h-4 w-4" /></Button></Tooltip>
        </div>
      </div>

      {page?.warnings?.length ? (
        <div className="px-3 pt-3">
          <Alert tone="warning">{page.warnings.join(' ')} Handwriting and low-quality photos recognise less reliably; you can correct the text in the Extracted text tab.</Alert>
        </div>
      ) : null}

      <div className="scrollbar-thin flex flex-1 items-start justify-center overflow-auto p-4">
        {imgError ? (
          <Alert tone="danger" title="The image could not be displayed">The stored file may be missing or corrupt. Try downloading it or re-uploading.</Alert>
        ) : (
          <img src={downloadUrl(doc.id, true)} alt={doc.title} onError={() => setImgError(true)} style={{ transform: `rotate(${rotation}deg) scale(${zoom})`, transformOrigin: 'center top' }} className={cn('max-w-full rounded-sm bg-white shadow-card transition-transform', rotation % 180 !== 0 && 'mt-16')} />
        )}
      </div>

      {page && page.text && (
        <div className="shrink-0 border-t border-line bg-surface px-3 py-2 text-xs text-ink-muted">
          <button className="underline" onClick={() => onTextSelected?.({ text: page.text.slice(0, 6000), pageNumber: 1, rect: new DOMRect(0, 0, 0, 0) })}>Use the extracted text as a selection</button> to simplify, explain or translate it. Edit it in the Extracted text tab.
        </div>
      )}

      <Modal open={ocrOpen} onClose={() => setOcrOpen(false)} title="Run OCR" description="Recognition runs on the server with the clean-up steps you choose. The original image is kept unchanged." size="sm" footer={<><Button variant="ghost" onClick={() => setOcrOpen(false)}>Cancel</Button><Button onClick={runOcr} loading={running} leftIcon={<ScanText className="h-4 w-4" />}>Run OCR</Button></>}>
        <div className="divide-y divide-line">
          <div className="flex items-center justify-between py-2 text-sm">
            <span>Rotation applied before OCR</span>
            <span className="font-medium tabular-nums">{rotation}°</span>
          </div>
          <Switch label="Enhance readability" description="Contrast normalisation, light de-noising and sharpening." checked={enhance} onChange={setEnhance} />
          <Switch label="Convert to grayscale" description="Usually improves recognition of coloured scans." checked={grayscale} onChange={setGrayscale} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">Running OCR replaces any manual edits you made to this page's text.</p>
      </Modal>

      <Modal open={fullscreen} onClose={() => setFullscreen(false)} title={doc.title} size="xl">
        <img src={downloadUrl(doc.id, true)} alt={doc.title} style={{ transform: `rotate(${rotation}deg)` }} className="mx-auto max-h-[75vh] max-w-full" />
      </Modal>
    </div>
  );
}
