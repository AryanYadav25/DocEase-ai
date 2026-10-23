import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { modelMetaSchema, sourceRefSchema } from './Summary.js';

export const MATERIAL_TYPES = ['flashcards', 'quiz', 'revision_notes'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

const studyMaterialSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    materialType: { type: String, enum: MATERIAL_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    /** Validated structured content: flashcards[], questions[] or notes{}. */
    content: { type: Schema.Types.Mixed, required: true },
    /** Per-user progress, e.g. { knownCardIds: [], attempts: [...] } */
    progress: { type: Schema.Types.Mixed, default: {} },
    sourceReferences: { type: [sourceRefSchema], default: [] },
    modelMeta: { type: modelMetaSchema },
  },
  { timestamps: true },
);

studyMaterialSchema.index({ ownerId: 1, documentId: 1, createdAt: -1 });
studyMaterialSchema.index({ ownerId: 1, createdAt: -1 });

export type StudyMaterialAttrs = InferSchemaType<typeof studyMaterialSchema>;
export type StudyMaterialDoc = HydratedDocument<StudyMaterialAttrs>;
export const StudyMaterial = mongoose.model('StudyMaterial', studyMaterialSchema);

export function toPublicStudyMaterial(m: StudyMaterialDoc) {
  return {
    id: String(m._id),
    documentId: String(m.documentId),
    materialType: m.materialType,
    title: m.title,
    content: m.content,
    progress: m.progress ?? {},
    sourceReferences: m.sourceReferences,
    modelMeta: m.modelMeta ?? null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}
