import { toPublicUser } from '../models/index.js';
import {
  authenticateUser,
  clearSessionCookie,
  registerUser,
  requestPasswordReset,
  resetPassword,
  setSessionCookie,
  signSession,
} from '../services/auth/authService.js';
import { isEmailConfigured } from '../services/email/emailService.js';
import { asyncHandler, ok } from '../utils/http.js';

export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body);
  setSessionCookie(res, signSession(user));
  ok(res, { user: toPublicUser(user) }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const user = await authenticateUser(req.body.email, req.body.password);
  setSessionCookie(res, signSession(user));
  ok(res, { user: toPublicUser(user) });
});

export const logout = asyncHandler(async (_req, res) => {
  clearSessionCookie(res);
  ok(res, { loggedOut: true });
});

export const me = asyncHandler(async (req, res) => {
  ok(res, { user: toPublicUser(req.user!.doc) });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.body.email);
  ok(res, {
    delivered: result.delivered,
    emailConfigured: isEmailConfigured(),
    message: result.delivered
      ? 'If an account exists for that email, a reset link has been sent.'
      : 'Email delivery is not configured on this server. In development the reset link is shown below.',
    ...(result.devResetUrl ? { devResetUrl: result.devResetUrl } : {}),
  });
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  await resetPassword(req.body.token, req.body.password);
  clearSessionCookie(res);
  ok(res, { reset: true, message: 'Your password has been updated. Please sign in.' });
});
