import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env, isTest } from '../config/env.js';

const disabled = env.RATE_LIMIT_DISABLED === true;

function makeLimiter(windowMs: number, max: number, code = 'RATE_LIMITED', message = 'Too many requests. Please slow down and try again shortly.') {
  return rateLimit({
    windowMs,
    limit: disabled ? 1_000_000 : max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'anonymous',
    handler: (req, res) => {
      res.status(429).json({ success: false, error: { code, message, requestId: req.requestId } });
    },
  });
}

/** Global ceiling for all API traffic. */
export const apiLimiter = makeLimiter(60 * 1000, isTest ? 1000 : 300);

/** Login/register/password reset — protects against credential stuffing. */
export const authLimiter = makeLimiter(15 * 60 * 1000, isTest ? 60 : 20, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait 15 minutes and try again.');

/** Upload throttle. */
export const uploadLimiter = makeLimiter(10 * 60 * 1000, isTest ? 200 : 40, 'RATE_LIMITED', 'Upload limit reached. Please wait a few minutes before uploading more files.');

/** Per-user AI request budget. */
export const aiLimiter = makeLimiter(60 * 60 * 1000, isTest ? 500 : env.AI_USER_REQUESTS_PER_HOUR, 'AI_USAGE_LIMIT', 'You have reached the hourly AI usage limit. Please try again later.');

/** Expensive processing actions (OCR retry, reprocess). */
export const processingLimiter = makeLimiter(10 * 60 * 1000, isTest ? 200 : 20);
