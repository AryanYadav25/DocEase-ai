import mongoose, { Schema, type InferSchemaType, type HydratedDocument } from 'mongoose';

const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** SHA-256 hash of the raw token. The raw token is only ever emailed/shown once. */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 });

export type PasswordResetTokenAttrs = InferSchemaType<typeof passwordResetTokenSchema>;
export type PasswordResetTokenDoc = HydratedDocument<PasswordResetTokenAttrs>;
export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
