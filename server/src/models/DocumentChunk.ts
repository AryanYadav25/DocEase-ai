import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

const documentChunkSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chunkIndex: { type: Number, required: true },
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    text: { type: String, required: true },
    tokenEstimate: { type: Number, default: 0 },
    /** Lower-cased, de-duplicated terms for keyword retrieval. */
    terms: { type: [String], default: [] },
    /** Optional dense embedding; populated only when an embedding provider is configured. */
    embedding: { type: [Number], default: undefined },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

documentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
documentChunkSchema.index({ ownerId: 1, documentId: 1 });
documentChunkSchema.index({ documentId: 1, terms: 1 });

export type DocumentChunkAttrs = InferSchemaType<typeof documentChunkSchema>;
export type DocumentChunkDoc = HydratedDocument<DocumentChunkAttrs>;

export const DocumentChunk = mongoose.model('DocumentChunk', documentChunkSchema);
