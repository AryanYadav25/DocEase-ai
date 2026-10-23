import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const EXPLANATION_LEVELS = ['very_simple', 'beginner', 'standard', 'detailed'] as const;
export const OUTPUT_LENGTHS = ['short', 'medium', 'detailed'] as const;
export const THEMES = ['light', 'dark', 'system'] as const;

const preferencesSchema = new Schema(
  {
    theme: { type: String, enum: THEMES, default: 'light' },
    defaultExplanationLevel: { type: String, enum: EXPLANATION_LEVELS, default: 'standard' },
    defaultSummaryLength: { type: String, enum: OUTPUT_LENGTHS, default: 'medium' },
    preferredLanguage: { type: String, default: 'English', maxlength: 60 },
    autoOcrScannedPages: { type: Boolean, default: true },
    enhanceImagesBeforeOcr: { type: Boolean, default: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    emailVerified: { type: Boolean, default: false },
    preferences: { type: preferencesSchema, default: () => ({}) },
    sessionVersion: { type: Number, default: 1 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;

export const User = mongoose.model('User', userSchema);

export function toPublicUser(user: UserDoc | (UserAttrs & { _id: mongoose.Types.ObjectId })) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    preferences: user.preferences,
    createdAt: (user as { createdAt?: Date }).createdAt,
  };
}
