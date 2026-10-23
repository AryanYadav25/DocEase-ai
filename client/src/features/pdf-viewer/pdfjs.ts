import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type PDFDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PDFPageProxy = pdfjsLib.PDFPageProxy;

export async function loadPdf(url: string): Promise<PDFDocumentProxy> {
  const task = pdfjsLib.getDocument({ url, withCredentials: true, isEvalSupported: false });
  return task.promise;
}

export interface PageTextIndex {
  pageNumber: number;
  text: string;
}

/** Extract lowercase page text for in-document search (cached per document). */
export async function buildTextIndex(pdf: PDFDocumentProxy, onProgress?: (done: number, total: number) => void): Promise<PageTextIndex[]> {
  const out: PageTextIndex[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    out.push({ pageNumber: i, text: text.toLowerCase() });
    onProgress?.(i, pdf.numPages);
  }
  return out;
}
