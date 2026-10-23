import fs from 'node:fs/promises';
import { createCanvas } from '@napi-rs/canvas';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

export interface PdfPageText {
  pageNumber: number;
  text: string;
  width: number;
  height: number;
}

export interface PdfTextResult {
  pageCount: number;
  pages: PdfPageText[];
  info: { title?: string; language?: string };
}

async function openPdf(filePath: string): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await fs.readFile(filePath));
  try {
    return await pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0, // pdf.js never executes embedded JavaScript; only rendering/text extraction is performed
    }).promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'PasswordException') {
      throw new AppError(422, 'ENCRYPTED_PDF', 'This PDF is password-protected. Remove the password and upload it again.');
    }
    throw new AppError(422, 'CORRUPT_FILE', 'This PDF could not be opened. It may be corrupt or not a real PDF.', { cause: err });
  }
}

/** Collapse pdf.js text items into readable lines, preserving rough line breaks. */
function itemsToText(items: Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>): string {
  let out = '';
  let lastY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) out += '\n';
    else if (out && !out.endsWith('\n') && !out.endsWith(' ') && item.str && !item.str.startsWith(' ')) out += ' ';
    out += item.str;
    if (item.hasEOL) out += '\n';
    if (y !== undefined) lastY = y;
  }
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Extract the text layer of every page. Pages without a text layer yield ''. */
export async function extractPdfText(filePath: string): Promise<PdfTextResult> {
  const doc = await openPdf(filePath);
  try {
    if (doc.numPages > env.MAX_PAGE_COUNT) {
      throw new AppError(422, 'PAGE_LIMIT_EXCEEDED', `This PDF has ${doc.numPages} pages; the limit is ${env.MAX_PAGE_COUNT}.`);
    }
    const pages: PdfPageText[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      pages.push({
        pageNumber: i,
        text: itemsToText(content.items as Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });
      page.cleanup();
    }
    let info: PdfTextResult['info'] = {};
    try {
      const meta = await doc.getMetadata();
      const raw = meta.info as { Title?: string; Language?: string } | undefined;
      info = { title: raw?.Title?.trim() || undefined, language: raw?.Language || undefined };
    } catch {
      /* metadata is optional */
    }
    return { pageCount: doc.numPages, pages, info };
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** Render a single page to a PNG buffer (used for OCR of scanned pages). */
export async function renderPdfPageToPng(filePath: string, pageNumber: number, scale = 2): Promise<Buffer> {
  const doc = await openPdf(filePath);
  try {
    if (pageNumber < 1 || pageNumber > doc.numPages) throw AppError.notFound('Page not found.');
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const maxDim = env.MAX_IMAGE_DIMENSION;
    const effScale = Math.max(viewport.width, viewport.height) > maxDim ? scale * (maxDim / Math.max(viewport.width, viewport.height)) : scale;
    const vp = effScale === scale ? viewport : page.getViewport({ scale: effScale });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // pdf.js types expect a DOM CanvasRenderingContext2D; @napi-rs/canvas is API-compatible.
    type RenderParams = Parameters<typeof page.render>[0];
    await page.render({ canvasContext: ctx as unknown as RenderParams['canvasContext'], canvas: canvas as unknown as RenderParams['canvas'], viewport: vp }).promise;
    page.cleanup();
    return canvas.toBuffer('image/png');
  } finally {
    await doc.loadingTask.destroy();
  }
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  const doc = await openPdf(filePath);
  try {
    return doc.numPages;
  } finally {
    await doc.loadingTask.destroy();
  }
}
