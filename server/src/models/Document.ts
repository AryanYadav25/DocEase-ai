import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const PROCESSING_STATUSES = [
  'queued',
  'uploading',
  'processing',
  'ocr_in_progress',
  'indexing',
  'completed',
  'completed_with_warnings',
  'failed',
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const FILE_KINDS = ['pdf', 'image', 'text', 'docx'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const OCR_STATUSES = ['not_needed', 'pending', 'in_progress', 'completed', 'partial', 'failed'] as const;

const warningSchema = new Schema(
  {
    code: { type: String, required: true },
    message: { type: String, required: true },
    pageNumber: { type: Number },
  },
  { _id: false },
);

const documentSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFilename: { type: String, required: true, maxlength: 255 },
    safeStorageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileKind: { type: String, enum: FILE_KINDS, required: true },
    fileSize: { type: Number, required: true, min: 0 },
    contentHash: { type: String, required: true },
    pageCount: { type: Number, default: 0 },
    processingStatus: { type: String, enum: PROCESSING_STATUSES, default: 'queued' },
    processingStage: { type: String, default: '' },
    processingProgress: { type: Number, default: 0, min: 0, max: 100 },
    processingError: { type: String },
    processingWarnings: { type: [warningSchema], default: [] },
    processingStartedAt: { type: Date },
    processingFinishedAt: { type: Date },
    extractedTextMeta: {
      totalChars: { type: Number, default: 0 },
      textPages: { type: Number, default: 0 },
      ocrPages: { type: Number, default: 0 },
      emptyPages: { type: Number, default: 0 },
      chunkCount: { type: Number, default: 0 },
    },
    ocrStatus: { type: String, enum: OCR_STATUSES, default: 'not_needed' },
    language: { type: String, default: 'unknown' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
    tags: { type: [String], default: [] },
    isFavorite: { type: Boolean, default: false },
    lastViewedPage: { type: Number, default: 1 },
    lastOpenedAt: { type: Date },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

documentSchema.index({ ownerId: 1, deletedAt: 1, createdAt: -1 });
documentSchema.index({ ownerId: 1, deletedAt: 1, title: 1 });
documentSchema.index({ ownerId: 1, deletedAt: 1, lastOpenedAt: -1 });
documentSchema.index({ ownerId: 1, contentHash: 1 });
documentSchema.index({ deletedAt: 1 });

export type DocumentAttrs = InferSchemaType<typeof documentSchema>;
export type DocumentDoc = HydratedDocument<DocumentAttrs>;

export const DocumentModel = mongoose.model('Document', documentSchema);

export function toPublicDocument(doc: DocumentDoc) {
  return {
    id: String(doc._id),
    title: doc.title,
    description: doc.description,
    originalFilename: doc.originalFilename,
    mimeType: doc.mimeType,
    fileKind: doc.fileKind,
    fileSize: doc.fileSize,
    pageCount: doc.pageCount,
    processingStatus: doc.processingStatus,
    processingStage: doc.processingStage,
    processingProgress: doc.processingProgress,
    processingError: doc.processingError ?? null,
    processingWarnings: doc.processingWarnings,
    extractedTextMeta: doc.extractedTextMeta,
    ocrStatus: doc.ocrStatus,
    language: doc.language,
    tags: doc.tags,
    isFavorite: doc.isFavorite,
    lastViewedPage: doc.lastViewedPage,
    lastOpenedAt: doc.lastOpenedAt ?? null,
    deletedAt: doc.deletedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
