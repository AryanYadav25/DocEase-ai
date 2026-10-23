import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const idParamSchema = z.object({ id: objectIdSchema });

export const pageParamSchema = z.object({
  id: objectIdSchema,
  pageNumber: z.coerce.number().int().min(1).max(100000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const explanationLevelSchema = z.enum(['very_simple', 'beginner', 'standard', 'detailed']);
export const outputLengthSchema = z.enum(['short', 'medium', 'detailed']);
