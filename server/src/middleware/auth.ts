import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { User, type UserDoc } from '../models/index.js';
import { verifySessionToken } from '../services/auth/authService.js';
import { AppError } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; doc: UserDoc };
    }
  }
}

function extractToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[env.COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) throw AppError.unauthorized();
    const payload = verifySessionToken(token);
    const user = await User.findById(payload.sub);
    if (!user) throw AppError.unauthorized('This account no longer exists.');
    if ((user.sessionVersion ?? 1) !== payload.sv) throw AppError.sessionExpired();
    req.user = { id: String(user._id), doc: user };
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches the user when a valid session exists but never fails. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (token) {
      const payload = verifySessionToken(token);
      const user = await User.findById(payload.sub);
      if (user && (user.sessionVersion ?? 1) === payload.sv) req.user = { id: String(user._id), doc: user };
    }
  } catch {
    // ignore
  }
  next();
}

/**
 * CSRF defence for cookie sessions: state-changing requests must carry a custom
 * header, which browsers never add to cross-site form posts or simple requests.
 */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const hasCookie = !!req.cookies?.[env.COOKIE_NAME];
  if (hasCookie && req.headers['x-requested-with'] !== 'DocuEase') {
    return next(AppError.forbidden('Missing X-Requested-With header.'));
  }
  next();
}
