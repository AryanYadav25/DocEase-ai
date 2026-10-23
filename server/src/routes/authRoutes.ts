import { Router } from 'express';
import * as ctrl from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from '../validators/auth.js';

export const authRoutes = Router();

authRoutes.post('/register', authLimiter, validate(registerSchema), ctrl.register);
authRoutes.post('/login', authLimiter, validate(loginSchema), ctrl.login);
authRoutes.post('/logout', ctrl.logout);
authRoutes.get('/me', requireAuth, ctrl.me);
authRoutes.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
authRoutes.post('/reset-password', authLimiter, validate(resetPasswordSchema), ctrl.resetPasswordHandler);
