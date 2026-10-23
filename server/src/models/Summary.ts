import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const SUMMARY_TYPES = [
  'simplify',
  'paragraph',
  'bullets',
  'sections',
  'executive',
  'takeaways',
  'quotes',
  'key_information',
  'vocabulary',
  'translation',
] as const;
export type SummaryType = (typeof SUMMARY_TYPES)[number];

export const sourceRefSchema = new Schema(
  {
    pageNumber: { type: Number, required: true },
    chunkIndex: { type: Number },
    excerpt: { type: String, maxlength: 600 },
  },
  { _id: false },
);

export const modelMetaSchema = new Schema(
  {
    provider: { type: String },
    model: { type: String },
    promptTokens: { type: Number },
    completionTokens: { type: Number },
    totalTokens: { type: Number },
    latencyMs: { type: Number },
    isMock: { type: Boolean, default: false },
  },
  { _id: false },
);

const summarySchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    summaryType: { type: String, enum: SUMMARY_TYPES, required: true },
    explanationLevel: { type: String },
    outputLength: { type: String },
    language: { type: String },
    /** Structured JSON (shape depends on summaryType) — validated with Zod before saving. */
    content: { type: Schema.Types.Mixed, required: true },
    sourceReferences: { type: [sourceRefSchema], default: [] },
    modelMeta: { type: modelMetaSchema },
    coverage: {
      pagesCovered: { type: Number, default: 0 },
      totalPages: { type: Number, default: 0 },
      truncated: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

summarySchema.index({ ownerId: 1, documentId: 1, createdAt: -1 });
summarySchema.index({ documentId: 1, summaryType: 1, createdAt: -1 });

export type SummaryAttrs = InferSchemaType<typeof summarySchema>;
export type SummaryDoc = HydratedDocument<SummaryAttrs>;

export const Summary = mongoose.model('Summary', summarySchema);

export function toPublicSummary(s: SummaryDoc) {
  return {
    id: String(s._id),
    documentId: String(s.documentId),
    summaryType: s.summaryType,
    explanationLevel: s.explanationLevel ?? null,
    outputLength: s.outputLength ?? null,
    language: s.language ?? null,
    content: s.content,
    sourceReferences: s.sourceReferences,
    modelMeta: s.modelMeta ?? null,
    coverage: s.coverage,
    createdAt: s.createdAt,
  };
}
