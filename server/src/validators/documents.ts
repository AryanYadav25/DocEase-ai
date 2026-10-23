import { z } from 'zod';
import { FILE_KINDS, PROCESSING_STATUSES } from '../models/Document.js';
import { paginationSchema } from './common.js';

export const listDocumentsSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['name', 'uploaded', 'lastOpened']).default('uploaded'),
  order: z.enum(['asc', 'desc']).default('desc'),
  fileKind: z.enum(FILE_KINDS).optional(),
  status: z.enum(PROCESSING_STATUSES).optional(),
  favorite: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  trashed: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  tag: z.string().trim().max(50).optional(),
});

export const updateDocumentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    isFavorite: z.boolean().optional(),
    lastViewedPage: z.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const bulkActionSchema = z.object({
  ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100),
  action: z.enum(['delete', 'restore', 'favorite', 'unfavorite', 'permanent_delete', 'add_tag']),
  tag: z.string().trim().min(1).max(50).optional(),
});

export const updatePageTextSchema = z.object({
  text: z.string().max(200000),
});

export const ocrOptionsSchema = z.object({
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  enhance: z.boolean().optional(),
  grayscale: z.boolean().optional(),
  pages: z.array(z.number().int().min(1)).max(50).optional(),
});
