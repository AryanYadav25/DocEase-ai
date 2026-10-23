import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PasswordResetToken, User, type UserDoc } from '../../models/index.js';
import { AppError } from '../../utils/errors.js';
import { sendEmail, isEmailConfigured } from '../email/emailService.js';

export interface SessionPayload {
  sub: string;
  sv: number;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function signSession(user: UserDoc): string {
  const payload: SessionPayload = { sub: String(user._id), sv: user.sessionVersion ?? 1 };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: `${env.JWT_EXPIRES_IN_DAYS}d` });
}

export function verifySessionToken(token: string): SessionPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    if (!decoded?.sub) throw AppError.unauthorized();
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw AppError.sessionExpired();
    throw AppError.unauthorized('Your session is not valid. Please sign in again.');
  }
}

export function cookieOptions() {
  const secure = env.COOKIE_SECURE ?? isProd;
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: env.JWT_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(env.COOKIE_NAME, token, cookieOptions());
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
}

export async function registerUser(input: { email: string; password: string; displayName: string }): Promise<UserDoc> {
  const existing = await User.findOne({ email: input.email.toLowerCase() }).lean();
  if (existing) throw AppError.conflict('An account with this email already exists.');
  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    email: input.email.toLowerCase(),
    passwordHash,
    displayName: input.displayName.trim(),
    lastLoginAt: new Date(),
  });
  return user;
}

export async function authenticateUser(email: string, password: string): Promise<UserDoc> {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  // Constant-ish time: always run a hash verification even when the user is missing.
  const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const valid = await verifyPassword(user?.passwordHash ?? dummyHash, password);
  if (!user || !valid) throw AppError.unauthorized('Incorrect email or password.');
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<UserDoc> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found.');
  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw AppError.badRequest('Your current password is incorrect.');
  user.passwordHash = await hashPassword(newPassword);
  user.sessionVersion = (user.sessionVersion ?? 1) + 1; // invalidate other sessions
  await user.save();
  return user;
}

function hashToken(raw: string) {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Creates a reset token. Returns `{ delivered, devResetUrl }`.
 * When email is not configured (typical in development) the reset link is returned
 * so it can be shown in the UI instead of pretending an email was sent.
 */
export async function requestPasswordReset(email: string): Promise<{ delivered: boolean; devResetUrl?: string }> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Do not reveal whether the account exists.
    return { delivered: isEmailConfigured() };
  }
  const raw = randomBytes(32).toString('hex');
  await PasswordResetToken.deleteMany({ userId: user._id });
  await PasswordResetToken.create({ userId: user._id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  const resetUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${raw}`;

  if (isEmailConfigured()) {
    await sendEmail({
      to: user.email,
      subject: 'Reset your DocuEase AI password',
      text: `Use this link to reset your password (valid for 1 hour): ${resetUrl}`,
      html: `<p>Use this link to reset your password (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    return { delivered: true };
  }

  logger.warn({ userId: String(user._id) }, 'Email is not configured; password reset link returned to client (non-production only)');
  if (isProd) return { delivered: false };
  return { delivered: false, devResetUrl: resetUrl };
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const record = await PasswordResetToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired.');
  }
  const user = await User.findById(record.userId).select('+passwordHash');
  if (!user) throw new AppError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired.');
  user.passwordHash = await hashPassword(newPassword);
  user.sessionVersion = (user.sessionVersion ?? 1) + 1;
  await user.save();
  record.usedAt = new Date();
  await record.save();
}
