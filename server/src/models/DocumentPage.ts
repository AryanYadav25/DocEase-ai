import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const EXTRACTION_METHODS = ['text_layer', 'ocr', 'docx', 'plain_text', 'manual', 'none'] as const;

const documentPageSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    text: { type: String, default: '' },
    charCount: { type: Number, default: 0 },
    extractionMethod: { type: String, enum: EXTRACTION_METHODS, default: 'none' },
    ocr: {
      attempted: { type: Boolean, default: false },
      confidence: { type: Number }, // 0-100, only when the engine reports it
      lowConfidenceWords: { type: Number, default: 0 },
      engine: { type: String },
      durationMs: { type: Number },
      error: { type: String },
    },
    warnings: { type: [String], default: [] },
    width: { type: Number },
    height: { type: Number },
    editedByUser: { type: Boolean, default: false },
  },
  { timestamps: true },
);

documentPageSchema.index({ documentId: 1, pageNumber: 1 }, { unique: true });
documentPageSchema.index({ ownerId: 1, documentId: 1 });

export type DocumentPageAttrs = InferSchemaType<typeof documentPageSchema>;
export type DocumentPageDoc = HydratedDocument<DocumentPageAttrs>;

export const DocumentPage = mongoose.model('DocumentPage', documentPageSchema);

export function toPublicPage(page: DocumentPageDoc) {
  return {
    id: String(page._id),
    pageNumber: page.pageNumber,
    text: page.text,
    charCount: page.charCount,
    extractionMethod: page.extractionMethod,
    ocr: page.ocr,
    warnings: page.warnings,
    editedByUser: page.editedByUser,
    width: page.width ?? null,
    height: page.height ?? null,
    updatedAt: page.updatedAt,
  };
}
