import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const FEEDBACK_CATEGORIES = ['bug', 'feature_request', 'ai_quality', 'ocr_quality', 'general', 'contact'] as const;

const feedbackSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    category: { type: String, enum: FEEDBACK_CATEGORIES, required: true },
    rating: { type: Number, min: 1, max: 5 },
    comments: { type: String, required: true, maxlength: 4000 },
    contactEmail: { type: String, maxlength: 254 },
    userAgent: { type: String, maxlength: 400 },
  },
  { timestamps: true },
);

feedbackSchema.index({ ownerId: 1, createdAt: -1 });

export type FeedbackAttrs = InferSchemaType<typeof feedbackSchema>;
export type FeedbackDoc = HydratedDocument<FeedbackAttrs>;
export const Feedback = mongoose.model('Feedback', feedbackSchema);
