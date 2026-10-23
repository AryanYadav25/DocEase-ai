import path from 'node:path';
import type { FilterQuery } from 'mongoose';
import { env, uploadLimits } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  Conversation,
  DocumentChunk,
  DocumentModel,
  DocumentPage,
  Message,
  StudyMaterial,
  Summary,
  type DocumentAttrs,
  type DocumentDoc,
} from '../../models/index.js';
import { AppError } from '../../utils/errors.js';
import { detectFileType } from '../extraction/fileTypeService.js';
import { enqueueProcessing } from '../processing/processingService.js';
import { hashFile, removeTempFile, sanitizeFilename, storage } from '../storage/storageService.js';
import type { listDocumentsSchema } from '../../validators/documents.js';
import type { z } from 'zod';

export const uploadPolicy = {
  maxFileSizeMb: uploadLimits.maxFileSizeMb,
  maxFileSizeBytes: uploadLimits.maxFileSizeBytes,
  maxPageCount: uploadLimits.maxPageCount,
  maxImageDimension: uploadLimits.maxImageDimension,
  maxFilesPerUpload: uploadLimits.maxFilesPerUpload,
  acceptedExtensions: uploadLimits.acceptedExtensions,
  acceptedMimeTypes: uploadLimits.acceptedMimeTypes,
  trashRetentionDays: env.TRASH_RETENTION_DAYS,
};

export interface UploadedFileInput {
  path: string;
  originalname: string;
  size: number;
}

export async function createDocumentFromUpload(ownerId: string, file: UploadedFileInput): Promise<{ document: DocumentDoc; duplicateOf?: string }> {
  try {
    if (file.size > uploadLimits.maxFileSizeBytes) {
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', `Files must be smaller than ${uploadLimits.maxFileSizeMb} MB.`);
    }
    const detected = await detectFileType(file.path, file.originalname);
    const contentHash = await hashFile(file.path);
    const originalFilename = sanitizeFilename(file.originalname);

    const duplicate = await DocumentModel.findOne({ ownerId, contentHash, deletedAt: null }).select('_id title').lean();

    const { key } = await storage.save(ownerId, file.path, detected.ext);
    const title = path.parse(originalFilename).name.replace(/[_-]+/g, ' ').trim() || originalFilename;

    const document = await DocumentModel.create({
      ownerId,
      originalFilename,
      safeStorageKey: key,
      mimeType: detected.mimeType,
      fileKind: detected.fileKind,
      fileSize: file.size,
      contentHash,
      title: title.slice(0, 200),
      processingStatus: 'queued',
      processingStage: 'Queued',
      ocrStatus: detected.fileKind === 'image' ? 'pending' : 'not_needed',
    });

    enqueueProcessing(String(document._id));
    return { document, duplicateOf: duplicate ? String(duplicate._id) : undefined };
  } finally {
    await removeTempFile(file.path);
  }
}

type ListInput = z.infer<typeof listDocumentsSchema>;

export async function listDocuments(ownerId: string, input: ListInput) {
  const filter: FilterQuery<DocumentAttrs> = { ownerId, deletedAt: input.trashed ? { $ne: null } : null };
  if (input.search) {
    const safe = input.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: { $regex: safe, $options: 'i' } }, { originalFilename: { $regex: safe, $options: 'i' } }, { description: { $regex: safe, $options: 'i' } }, { tags: { $regex: safe, $options: 'i' } }];
  }
  if (input.fileKind) filter.fileKind = input.fileKind;
  if (input.status) filter.processingStatus = input.status;
  if (input.favorite !== undefined) filter.isFavorite = input.favorite;
  if (input.tag) filter.tags = input.tag;

  const sortField = input.sort === 'name' ? 'title' : input.sort === 'lastOpened' ? 'lastOpenedAt' : 'createdAt';
  const sort: Record<string, 1 | -1> = { [sortField]: input.order === 'asc' ? 1 : -1, _id: -1 };

  const [items, total] = await Promise.all([
    DocumentModel.find(filter)
      .sort(sort)
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
    DocumentModel.countDocuments(filter),
  ]);
  return { items, total };
}

/** Load a document and enforce ownership. 404 is returned for other users' documents to avoid leaking existence. */
export async function getOwnedDocument(ownerId: string, id: string, opts: { includeDeleted?: boolean } = {}): Promise<DocumentDoc> {
  const doc = await DocumentModel.findById(id);
  if (!doc || String(doc.ownerId) !== ownerId) throw AppError.notFound('Document not found.');
  if (doc.deletedAt && !opts.includeDeleted) throw AppError.notFound('This document is in the trash.');
  return doc;
}

export function assertDocumentReady(doc: DocumentDoc) {
  if (!['completed', 'completed_with_warnings'].includes(doc.processingStatus)) {
    throw new AppError(409, 'DOCUMENT_NOT_READY', doc.processingStatus === 'failed' ? 'This document failed to process. Try reprocessing it.' : 'This document is still being processed.');
  }
}

export async function softDeleteDocument(doc: DocumentDoc) {
  doc.deletedAt = new Date();
  await doc.save();
}

export async function restoreDocument(doc: DocumentDoc) {
  doc.deletedAt = null;
  await doc.save();
}

/**
 * Deletion policy: permanently deleting a document removes the stored file,
 * extracted pages, chunks, summaries, conversations/messages and study materials.
 */
export async function permanentlyDeleteDocument(doc: DocumentDoc) {
  const id = doc._id;
  await Promise.all([
    DocumentPage.deleteMany({ documentId: id }),
    DocumentChunk.deleteMany({ documentId: id }),
    Summary.deleteMany({ documentId: id }),
    Message.deleteMany({ documentId: id }),
    Conversation.deleteMany({ documentId: id }),
    StudyMaterial.deleteMany({ documentId: id }),
  ]);
  await storage.remove(doc.safeStorageKey);
  await doc.deleteOne();
  logger.info({ documentId: String(id) }, 'Document permanently deleted');
}

export async function purgeExpiredTrash() {
  const cutoff = new Date(Date.now() - env.TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await DocumentModel.find({ deletedAt: { $ne: null, $lt: cutoff } });
  for (const doc of expired) await permanentlyDeleteDocument(doc);
  if (expired.length) logger.info({ count: expired.length }, 'Purged expired trash');
  return expired.length;
}

export async function reprocessDocument(doc: DocumentDoc) {
  doc.processingStatus = 'queued';
  doc.processingStage = 'Queued';
  doc.processingProgress = 0;
  doc.processingError = undefined;
  await doc.save();
  enqueueProcessing(String(doc._id));
}
