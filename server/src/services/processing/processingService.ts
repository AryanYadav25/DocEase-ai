import fs from 'node:fs/promises';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { JobQueue } from '../../jobs/queue.js';
import { DocumentChunk, DocumentModel, DocumentPage, type DocumentDoc } from '../../models/index.js';
import { AppError } from '../../utils/errors.js';
import { extractPdfText, renderPdfPageToPng } from '../extraction/pdfExtractor.js';
import { extractDocxText, extractPlainText } from '../extraction/textExtractors.js';
import { isOcrAvailable, recognizeImage, type OcrOptions } from '../ocr/ocrService.js';
import { chunkPages, estimateTokens, termsOf } from '../retrieval/textUtils.js';
import { storage } from '../storage/storageService.js';

export const processingQueue = new JobQueue(env.PROCESSING_CONCURRENCY, 'document-processing');

interface PageDraft {
  pageNumber: number;
  text: string;
  extractionMethod: 'text_layer' | 'ocr' | 'docx' | 'plain_text' | 'none';
  ocr?: { attempted: boolean; confidence?: number; lowConfidenceWords?: number; engine?: string; durationMs?: number; error?: string };
  warnings: string[];
  width?: number;
  height?: number;
}

type Warning = { code: string; message: string; pageNumber?: number };

async function setStatus(doc: DocumentDoc, status: DocumentDoc['processingStatus'], stage: string, progress: number) {
  doc.processingStatus = status;
  doc.processingStage = stage;
  doc.processingProgress = Math.max(0, Math.min(100, Math.round(progress)));
  await doc.save();
}

/** Enqueue (or re-enqueue) processing for a document. Safe to call multiple times. */
export function enqueueProcessing(documentId: string) {
  return processingQueue.enqueue(documentId, () => processDocument(documentId));
}

/** On boot, re-queue documents that were interrupted by a restart. */
export async function requeueInterruptedDocuments() {
  const stuck = await DocumentModel.find({ processingStatus: { $in: ['queued', 'processing', 'ocr_in_progress', 'indexing'] }, deletedAt: null })
    .select('_id')
    .lean();
  for (const d of stuck) enqueueProcessing(String(d._id));
  if (stuck.length) logger.info({ count: stuck.length }, 'Re-queued interrupted documents');
}

export async function processDocument(documentId: string): Promise<void> {
  const doc = await DocumentModel.findById(documentId);
  if (!doc || doc.deletedAt) return;

  const warnings: Warning[] = [];
  const deadline = Date.now() + env.PROCESSING_TIMEOUT_MS;
  const checkDeadline = () => {
    if (Date.now() > deadline) throw new AppError(504, 'DOCUMENT_PROCESSING_FAILED', 'Processing took too long and was stopped.');
  };

  try {
    doc.processingStartedAt = new Date();
    doc.processingError = undefined;
    doc.set('processingWarnings', []);
    await setStatus(doc, 'processing', 'Reading file', 5);

    const filePath = storage.resolve(doc.safeStorageKey);
    await fs.access(filePath);

    let pages: PageDraft[] = [];
    let ocrNeeded: number[] = [];

    if (doc.fileKind === 'pdf') {
      const result = await extractPdfText(filePath);
      doc.pageCount = result.pageCount;
      if (result.info.language) doc.language = result.info.language;
      pages = result.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        extractionMethod: p.text.length >= env.OCR_MIN_TEXT_CHARS_PER_PAGE ? 'text_layer' : 'none',
        warnings: [],
        width: p.width,
        height: p.height,
      }));
      ocrNeeded = pages.filter((p) => p.extractionMethod === 'none').map((p) => p.pageNumber);
      await setStatus(doc, 'processing', `Extracted text layer (${pages.length - ocrNeeded.length}/${pages.length} pages)`, 30);
    } else if (doc.fileKind === 'image') {
      doc.pageCount = 1;
      pages = [{ pageNumber: 1, text: '', extractionMethod: 'none', warnings: [] }];
      ocrNeeded = [1];
    } else if (doc.fileKind === 'docx') {
      const extracted = await extractDocxText(filePath);
      doc.pageCount = extracted.length;
      pages = extracted.map((p) => ({ ...p, extractionMethod: 'docx', warnings: [] }));
      await setStatus(doc, 'processing', 'Extracted DOCX text', 40);
    } else {
      const extracted = await extractPlainText(filePath);
      doc.pageCount = extracted.length;
      pages = extracted.map((p) => ({ ...p, extractionMethod: 'plain_text', warnings: [] }));
      await setStatus(doc, 'processing', 'Read text file', 40);
    }
    checkDeadline();

    // ---- OCR for pages with no usable text ----
    const autoOcr = doc.fileKind === 'image' || (await ownerWantsAutoOcr(doc));
    if (ocrNeeded.length > 0 && autoOcr) {
      const availability = await isOcrAvailable();
      if (!availability.available) {
        warnings.push({ code: 'OCR_UNAVAILABLE', message: availability.reason ?? 'OCR is not available on this server.' });
        doc.ocrStatus = 'failed';
        for (const n of ocrNeeded) pages[n - 1].warnings.push('OCR unavailable: ' + availability.reason);
      } else {
        doc.ocrStatus = 'in_progress';
        await setStatus(doc, 'ocr_in_progress', `Running OCR on ${ocrNeeded.length} page(s)`, 40);
        let done = 0;
        let failures = 0;
        for (const pageNumber of ocrNeeded) {
          checkDeadline();
          const page = pages[pageNumber - 1];
          try {
            const buffer = doc.fileKind === 'image' ? await fs.readFile(filePath) : await renderPdfPageToPng(filePath, pageNumber);
            const ocrOpts: OcrOptions = { enhance: await ownerWantsEnhance(doc) };
            const result = await recognizeImage(buffer, ocrOpts);
            page.text = result.text;
            page.extractionMethod = 'ocr';
            page.ocr = {
              attempted: true,
              confidence: result.confidence,
              lowConfidenceWords: result.lowConfidenceWords,
              engine: result.engine,
              durationMs: result.durationMs,
            };
            if (!result.text || result.text.length < 10) {
              page.warnings.push('OCR found little or no readable text on this page.');
              warnings.push({ code: 'OCR_EMPTY_PAGE', message: 'OCR found little or no readable text.', pageNumber });
            } else if (result.confidence < 60) {
              page.warnings.push(`Low OCR confidence (${result.confidence}%). Please review the extracted text.`);
              warnings.push({ code: 'OCR_LOW_CONFIDENCE', message: `Low OCR confidence (${result.confidence}%).`, pageNumber });
            }
          } catch (err) {
            failures++;
            const message = err instanceof AppError ? err.message : 'OCR failed on this page.';
            page.ocr = { attempted: true, error: message };
            page.warnings.push(message);
            warnings.push({ code: 'OCR_PAGE_FAILED', message, pageNumber });
            logger.warn({ err, documentId, pageNumber }, 'OCR failed for page');
          }
          done++;
          doc.processingProgress = Math.round(40 + (done / ocrNeeded.length) * 40);
          doc.processingStage = `OCR ${done}/${ocrNeeded.length} pages`;
          await doc.save();
        }
        doc.ocrStatus = failures === 0 ? 'completed' : failures === ocrNeeded.length ? 'failed' : 'partial';
      }
    } else if (ocrNeeded.length > 0) {
      doc.ocrStatus = 'pending';
      warnings.push({ code: 'OCR_SKIPPED', message: `${ocrNeeded.length} page(s) have no text layer. Run OCR from the Extracted Text tab.` });
    } else {
      doc.ocrStatus = 'not_needed';
    }

    // ---- Persist pages ----
    await setStatus(doc, 'indexing', 'Saving pages', 82);
    await DocumentPage.deleteMany({ documentId: doc._id });
    await DocumentPage.insertMany(
      pages.map((p) => ({
        documentId: doc._id,
        ownerId: doc.ownerId,
        pageNumber: p.pageNumber,
        text: p.text,
        charCount: p.text.length,
        extractionMethod: p.extractionMethod,
        ocr: p.ocr ?? { attempted: false },
        warnings: p.warnings,
        width: p.width,
        height: p.height,
      })),
    );

    // ---- Chunk + index ----
    await setStatus(doc, 'indexing', 'Indexing for search and AI', 90);
    const chunkCount = await rebuildChunks(doc, pages);

    const emptyPages = pages.filter((p) => !p.text.trim()).length;
    doc.extractedTextMeta = {
      totalChars: pages.reduce((s, p) => s + p.text.length, 0),
      textPages: pages.filter((p) => p.extractionMethod === 'text_layer' || p.extractionMethod === 'docx' || p.extractionMethod === 'plain_text').length,
      ocrPages: pages.filter((p) => p.extractionMethod === 'ocr').length,
      emptyPages,
      chunkCount,
    };
    if (emptyPages > 0 && emptyPages === pages.length) {
      warnings.push({ code: 'NO_TEXT', message: 'No readable text was found in this document. AI features need extracted text to work.' });
    }
    if (!doc.title) doc.title = doc.originalFilename;

    doc.set('processingWarnings', warnings);
    doc.processingFinishedAt = new Date();
    await setStatus(doc, warnings.length ? 'completed_with_warnings' : 'completed', 'Ready', 100);
    logger.info({ documentId, pages: pages.length, chunks: chunkCount, warnings: warnings.length }, 'Document processed');
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'We could not process this document.';
    logger.error({ err, documentId }, 'Document processing failed');
    const fresh = await DocumentModel.findById(documentId);
    if (fresh) {
      fresh.processingStatus = 'failed';
      fresh.processingStage = 'Failed';
      fresh.processingError = message;
      fresh.set('processingWarnings', warnings);
      fresh.processingFinishedAt = new Date();
      await fresh.save();
    }
  }
}

export async function rebuildChunks(doc: DocumentDoc, pages?: Array<{ pageNumber: number; text: string }>): Promise<number> {
  const sourcePages = pages ?? (await DocumentPage.find({ documentId: doc._id }).sort({ pageNumber: 1 }).select('pageNumber text').lean());
  const chunks = chunkPages(sourcePages);
  await DocumentChunk.deleteMany({ documentId: doc._id });
  if (chunks.length) {
    await DocumentChunk.insertMany(
      chunks.map((c) => ({
        documentId: doc._id,
        ownerId: doc.ownerId,
        chunkIndex: c.chunkIndex,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        text: c.text,
        tokenEstimate: estimateTokens(c.text),
        terms: termsOf(c.text),
      })),
    );
  }
  doc.extractedTextMeta = { ...(doc.extractedTextMeta ?? {}), chunkCount: chunks.length } as DocumentDoc['extractedTextMeta'];
  return chunks.length;
}

/** Re-run OCR on specific pages (user action), then re-index. */
export async function ocrPages(doc: DocumentDoc, pageNumbers: number[], options: OcrOptions): Promise<{ results: Array<{ pageNumber: number; ok: boolean; confidence?: number; error?: string }> }> {
  const availability = await isOcrAvailable();
  if (!availability.available) throw new AppError(503, 'OCR_FAILED', availability.reason!, { expose: true });
  if (doc.fileKind !== 'pdf' && doc.fileKind !== 'image') {
    throw AppError.badRequest('OCR is only available for PDFs and images.');
  }
  const filePath = storage.resolve(doc.safeStorageKey);
  const results: Array<{ pageNumber: number; ok: boolean; confidence?: number; error?: string }> = [];
  const previousStatus = doc.processingStatus;
  doc.ocrStatus = 'in_progress';
  await setStatus(doc, 'ocr_in_progress', `Running OCR on ${pageNumbers.length} page(s)`, 50);

  for (const pageNumber of pageNumbers) {
    if (pageNumber < 1 || pageNumber > Math.max(doc.pageCount, 1)) {
      results.push({ pageNumber, ok: false, error: 'Page does not exist.' });
      continue;
    }
    try {
      const buffer = doc.fileKind === 'image' ? await fs.readFile(filePath) : await renderPdfPageToPng(filePath, pageNumber);
      const result = await recognizeImage(buffer, options);
      const warningsForPage: string[] = [];
      if (!result.text || result.text.length < 10) warningsForPage.push('OCR found little or no readable text on this page.');
      else if (result.confidence < 60) warningsForPage.push(`Low OCR confidence (${result.confidence}%). Please review the extracted text.`);
      await DocumentPage.updateOne(
        { documentId: doc._id, pageNumber },
        {
          $set: {
            text: result.text,
            charCount: result.text.length,
            extractionMethod: 'ocr',
            editedByUser: false,
            ocr: { attempted: true, confidence: result.confidence, lowConfidenceWords: result.lowConfidenceWords, engine: result.engine, durationMs: result.durationMs },
            warnings: warningsForPage,
          },
          $setOnInsert: { ownerId: doc.ownerId },
        },
        { upsert: true },
      );
      results.push({ pageNumber, ok: true, confidence: result.confidence });
    } catch (err) {
      const message = err instanceof AppError ? err.message : 'OCR failed on this page.';
      await DocumentPage.updateOne(
        { documentId: doc._id, pageNumber },
        { $set: { 'ocr.attempted': true, 'ocr.error': message }, $addToSet: { warnings: message }, $setOnInsert: { ownerId: doc.ownerId, text: '' } },
        { upsert: true },
      );
      results.push({ pageNumber, ok: false, error: message });
    }
  }

  await rebuildChunks(doc);
  await refreshTextMeta(doc);
  const failed = results.filter((r) => !r.ok).length;
  doc.ocrStatus = failed === 0 ? 'completed' : failed === results.length ? 'failed' : 'partial';
  const kept: Warning[] = doc.processingWarnings.filter((w) => !pageNumbers.includes(w.pageNumber ?? -1) && w.code !== 'OCR_SKIPPED' && w.code !== 'NO_TEXT').map((w) => ({ code: w.code, message: w.message, pageNumber: w.pageNumber ?? undefined }));
  for (const r of results) {
    if (!r.ok) kept.push({ code: 'OCR_PAGE_FAILED', message: r.error ?? 'OCR failed', pageNumber: r.pageNumber });
    else if ((r.confidence ?? 100) < 60) kept.push({ code: 'OCR_LOW_CONFIDENCE', message: `Low OCR confidence (${r.confidence}%).`, pageNumber: r.pageNumber });
  }
  doc.set('processingWarnings', kept);
  const finalStatus = previousStatus === 'failed' ? 'completed_with_warnings' : doc.processingWarnings.length ? 'completed_with_warnings' : 'completed';
  await setStatus(doc, finalStatus, 'Ready', 100);
  return { results };
}

export async function refreshTextMeta(doc: DocumentDoc) {
  const pages = await DocumentPage.find({ documentId: doc._id }).select('text extractionMethod').lean();
  doc.extractedTextMeta = {
    totalChars: pages.reduce((s, p) => s + (p.text?.length ?? 0), 0),
    textPages: pages.filter((p) => ['text_layer', 'docx', 'plain_text', 'manual'].includes(p.extractionMethod)).length,
    ocrPages: pages.filter((p) => p.extractionMethod === 'ocr').length,
    emptyPages: pages.filter((p) => !p.text?.trim()).length,
    chunkCount: doc.extractedTextMeta?.chunkCount ?? 0,
  };
}

async function ownerWantsAutoOcr(doc: DocumentDoc): Promise<boolean> {
  const { User } = await import('../../models/index.js');
  const owner = await User.findById(doc.ownerId).select('preferences').lean();
  return owner?.preferences?.autoOcrScannedPages ?? true;
}

async function ownerWantsEnhance(doc: DocumentDoc): Promise<boolean> {
  const { User } = await import('../../models/index.js');
  const owner = await User.findById(doc.ownerId).select('preferences').lean();
  return owner?.preferences?.enhanceImagesBeforeOcr ?? true;
}
