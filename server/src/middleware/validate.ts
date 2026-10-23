import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validate and *replace* a request part with the parsed (coerced, stripped) value.
 * Unknown keys are dropped by Zod's default object behaviour, which also blocks
 * operator injection like {"email": {"$gt": ""}} because schema fields are typed.
 */
export function validate<T extends ZodTypeAny>(schema: T, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(AppError.badRequest('Some fields are invalid.', result.error.flatten().fieldErrors));
    }
    (req as unknown as Record<Source, z.infer<T>>)[source] = result.data;
    next();
  };
}
