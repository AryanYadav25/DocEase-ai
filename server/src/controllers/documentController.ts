import { DocumentModel, DocumentPage, toPublicDocument, toPublicPage } from '../models/index.js';
import {
  assertDocumentReady,
  createDocumentFromUpload,
  getOwnedDocument,
  listDocuments,
  permanentlyDeleteDocument,
  reprocessDocument,
  restoreDocument,
  softDeleteDocument,
  uploadPolicy,
} from '../services/documents/documentService.js';
import { ocrPages, processingQueue, rebuildChunks, refreshTextMeta } from '../services/processing/processingService.js';
import { removeTempFile, storage } from '../services/storage/storageService.js';
import { AppError } from '../utils/errors.js';
import { asyncHandler, ok, paginated } from '../utils/http.js';

export const getUploadPolicy = asyncHandler(async (_req, res) => {
  ok(res, uploadPolicy);
});

export const upload = asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw AppError.badRequest('No file was uploaded. Use the "files" form field.');
  const results: Array<{ ok: true; document: ReturnType<typeof toPublicDocument>; duplicateOf?: string } | { ok: false; filename: string; error: { code: string; message: string } }> = [];
  for (const file of files) {
    try {
      const { document, duplicateOf } = await createDocumentFromUpload(req.user!.id, file);
      results.push({ ok: true, document: toPublicDocument(document), ...(duplicateOf ? { duplicateOf } : {}) });
    } catch (err) {
      await removeTempFile(file.path);
      const appErr = err instanceof AppError ? err : AppError.internal('Upload failed.', err);
      results.push({ ok: false, filename: file.originalname, error: { code: appErr.code, message: appErr.message } });
    }
  }
  const anyOk = results.some((r) => r.ok);
  ok(res, { results }, anyOk ? 201 : 400);
});

export const list = asyncHandler(async (req, res) => {
  const input = req.query as unknown as Parameters<typeof listDocuments>[1];
  const { items, total } = await listDocuments(req.user!.id, input);
  paginated(res, items.map(toPublicDocument), input.page, input.pageSize, total);
});

export const getOne = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id, { includeDeleted: true });
  if (!doc.deletedAt) {
    doc.lastOpenedAt = new Date();
    await doc.save();
  }
  ok(res, { document: toPublicDocument(doc) });
});

export const getStatus = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id, { includeDeleted: true });
  ok(res, {
    id: String(doc._id),
    processingStatus: doc.processingStatus,
    processingStage: doc.processingStage,
    processingProgress: doc.processingProgress,
    processingError: doc.processingError ?? null,
    processingWarnings: doc.processingWarnings,
    ocrStatus: doc.ocrStatus,
    pageCount: doc.pageCount,
    extractedTextMeta: doc.extractedTextMeta,
    queue: processingQueue.stats,
  });
});

export const update = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const body = req.body as { title?: string; description?: string; tags?: string[]; isFavorite?: boolean; lastViewedPage?: number };
  if (body.title !== undefined) doc.title = body.title;
  if (body.description !== undefined) doc.description = body.description;
  if (body.tags !== undefined) doc.tags = [...new Set(body.tags.map((t) => t.toLowerCase()))];
  if (body.isFavorite !== undefined) doc.isFavorite = body.isFavorite;
  if (body.lastViewedPage !== undefined) doc.lastViewedPage = Math.min(body.lastViewedPage, Math.max(doc.pageCount, 1));
  await doc.save();
  ok(res, { document: toPublicDocument(doc) });
});

export const remove = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  await softDeleteDocument(doc);
  ok(res, { document: toPublicDocument(doc), message: `Moved to trash. It will be permanently deleted after ${uploadPolicy.trashRetentionDays} days.` });
});

export const restore = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id, { includeDeleted: true });
  if (!doc.deletedAt) throw AppError.badRequest('This document is not in the trash.');
  await restoreDocument(doc);
  ok(res, { document: toPublicDocument(doc) });
});

export const permanentDelete = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id, { includeDeleted: true });
  await permanentlyDeleteDocument(doc);
  ok(res, { deleted: true, id: req.params.id });
});

export const bulk = asyncHandler(async (req, res) => {
  const { ids, action, tag } = req.body as { ids: string[]; action: string; tag?: string };
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      const doc = await getOwnedDocument(req.user!.id, id, { includeDeleted: true });
      switch (action) {
        case 'delete':
          if (!doc.deletedAt) await softDeleteDocument(doc);
          break;
        case 'restore':
          if (doc.deletedAt) await restoreDocument(doc);
          break;
        case 'favorite':
          doc.isFavorite = true;
          await doc.save();
          break;
        case 'unfavorite':
          doc.isFavorite = false;
          await doc.save();
          break;
        case 'add_tag':
          if (!tag) throw AppError.badRequest('A tag is required.');
          if (!doc.tags.includes(tag.toLowerCase())) doc.tags.push(tag.toLowerCase());
          await doc.save();
          break;
        case 'permanent_delete':
          await permanentlyDeleteDocument(doc);
          break;
      }
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof AppError ? err.message : 'Failed' });
    }
  }
  ok(res, { results });
});

export const download = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id, { includeDeleted: true });
  const exists = await storage.exists(doc.safeStorageKey);
  if (!exists) throw AppError.notFound('The stored file is missing.');
  const inline = req.query.inline === 'true';
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', String(doc.fileSize));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  const safeName = encodeURIComponent(doc.originalFilename);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`);
  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  storage.createReadStream(doc.safeStorageKey).pipe(res);
});

export const reprocess = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  if (processingQueue.isQueuedOrRunning(String(doc._id))) throw AppError.conflict('This document is already being processed.');
  await reprocessDocument(doc);
  ok(res, { document: toPublicDocument(doc) }, 202);
});

/* ---------- Pages / extracted text ---------- */

export const getPage = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const pageNumber = Number(req.params.pageNumber);
  const page = await DocumentPage.findOne({ documentId: doc._id, pageNumber });
  if (!page) throw AppError.notFound('Page not found.');
  ok(res, { page: toPublicPage(page) });
});

export const getExtractedText = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  const pages = await DocumentPage.find({ documentId: doc._id }).sort({ pageNumber: 1 });
  ok(res, {
    documentId: String(doc._id),
    pageCount: doc.pageCount,
    extractedTextMeta: doc.extractedTextMeta,
    pages: pages.map(toPublicPage),
  });
});

export const updatePageText = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  assertDocumentReady(doc);
  const pageNumber = Number(req.params.pageNumber);
  const text = (req.body as { text: string }).text.replace(/\r\n?/g, '\n');
  const page = await DocumentPage.findOneAndUpdate(
    { documentId: doc._id, pageNumber },
    { $set: { text, charCount: text.length, extractionMethod: 'manual', editedByUser: true, warnings: [] }, $setOnInsert: { ownerId: doc.ownerId } },
    { new: true, upsert: true },
  );
  await rebuildChunks(doc);
  await refreshTextMeta(doc);
  doc.set('processingWarnings', doc.processingWarnings.filter((w) => w.pageNumber !== pageNumber && w.code !== 'NO_TEXT').map((w) => ({ code: w.code, message: w.message, pageNumber: w.pageNumber ?? undefined })));
  await doc.save();
  ok(res, { page: toPublicPage(page!), document: toPublicDocument(doc) });
});

export const runOcr = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  if (processingQueue.isQueuedOrRunning(String(doc._id))) throw AppError.conflict('This document is currently being processed.');
  const body = req.body as { pages?: number[]; rotate?: 0 | 90 | 180 | 270; enhance?: boolean; grayscale?: boolean };
  const pages = body.pages?.length ? body.pages : Array.from({ length: Math.max(doc.pageCount, 1) }, (_, i) => i + 1);
  if (pages.length > 50) throw AppError.badRequest('You can OCR up to 50 pages per request.');
  const { results } = await ocrPages(doc, pages, { rotate: body.rotate, enhance: body.enhance, grayscale: body.grayscale });
  const refreshed = await DocumentModel.findById(doc._id);
  ok(res, { results, document: toPublicDocument(refreshed!) });
});

export const retryPageOcr = asyncHandler(async (req, res) => {
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  if (processingQueue.isQueuedOrRunning(String(doc._id))) throw AppError.conflict('This document is currently being processed.');
  const pageNumber = Number(req.params.pageNumber);
  const body = (req.body ?? {}) as { rotate?: 0 | 90 | 180 | 270; enhance?: boolean; grayscale?: boolean };
  const { results } = await ocrPages(doc, [pageNumber], { rotate: body.rotate, enhance: body.enhance, grayscale: body.grayscale });
  const page = await DocumentPage.findOne({ documentId: doc._id, pageNumber });
  const refreshed = await DocumentModel.findById(doc._id);
  ok(res, { result: results[0], page: page ? toPublicPage(page) : null, document: toPublicDocument(refreshed!) });
});

export const extract = asyncHandler(async (req, res) => {
  // Alias of reprocess for the documented POST /documents/:id/extract route.
  const doc = await getOwnedDocument(req.user!.id, req.params.id);
  if (processingQueue.isQueuedOrRunning(String(doc._id))) throw AppError.conflict('This document is already being processed.');
  await reprocessDocument(doc);
  ok(res, { document: toPublicDocument(doc) }, 202);
});
