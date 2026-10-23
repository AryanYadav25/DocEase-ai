import { z } from 'zod';
import { explanationLevelSchema, outputLengthSchema } from './common.js';

export const simplifySchema = z.object({
  explanationLevel: explanationLevelSchema.optional(),
  outputLength: outputLengthSchema.optional(),
  force: z.boolean().optional(),
});

export const summarizeSchema = z.object({
  summaryType: z.enum(['paragraph', 'bullets', 'sections', 'executive', 'takeaways', 'quotes']),
  explanationLevel: explanationLevelSchema.optional(),
  outputLength: outputLengthSchema.optional(),
  force: z.boolean().optional(),
});

export const extractInformationSchema = z.object({
  force: z.boolean().optional(),
});

export const explainSelectionSchema = z.object({
  text: z.string().trim().min(1, 'Select some text first').max(6000),
  action: z.enum(['simplify', 'explain', 'example', 'define', 'translate', 'ask']),
  question: z.string().trim().max(1000).optional(),
  targetLanguage: z.string().trim().max(60).optional(),
  pageNumber: z.number().int().min(1).optional(),
  explanationLevel: explanationLevelSchema.optional(),
});

export const translateSchema = z.object({
  targetLanguage: z.string().trim().min(2).max(60),
  scope: z.enum(['text', 'summary']).default('text'),
  text: z.string().trim().max(12000).optional(),
  summaryId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  pageNumber: z.number().int().min(1).optional(),
});

export const flashcardsSchema = z.object({
  count: z.number().int().min(3).max(30).default(10),
  explanationLevel: explanationLevelSchema.optional(),
});

export const quizSchema = z.object({
  count: z.number().int().min(3).max(20).default(8),
  mixShortAnswer: z.boolean().default(true),
  explanationLevel: explanationLevelSchema.optional(),
});

export const chatSchema = z.object({
  conversationId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  message: z.string().trim().min(1).max(4000),
  regenerateMessageId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export const messageFeedbackSchema = z.object({
  feedback: z.enum(['up', 'down']).nullable(),
});

export const studyProgressSchema = z.object({
  progress: z.record(z.unknown()),
});

export const vocabularySchema = z.object({
  force: z.boolean().optional(),
});
