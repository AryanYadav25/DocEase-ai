import { z } from 'zod';
import { FEEDBACK_CATEGORIES } from '../models/Feedback.js';
import { explanationLevelSchema, outputLengthSchema } from './common.js';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    preferences: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        defaultExplanationLevel: explanationLevelSchema.optional(),
        defaultSummaryLength: outputLengthSchema.optional(),
        preferredLanguage: z.string().trim().min(2).max(60).optional(),
        autoOcrScannedPages: z.boolean().optional(),
        enhanceImagesBeforeOcr: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((v) => v.displayName !== undefined || v.preferences !== undefined, 'Nothing to update');

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal('DELETE MY ACCOUNT'),
});

export const feedbackSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  rating: z.number().int().min(1).max(5).optional(),
  comments: z.string().trim().min(3).max(4000),
  documentId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  contactEmail: z.string().email().max(254).optional(),
});
