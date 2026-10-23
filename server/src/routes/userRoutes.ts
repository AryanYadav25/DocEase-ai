import { Router } from 'express';
import * as ctrl from '../controllers/userController.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { apiLimiter, authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema } from '../validators/auth.js';
import { deleteAccountSchema, feedbackSchema, updateProfileSchema } from '../validators/users.js';

export const userRoutes = Router();
userRoutes.use(requireAuth);
userRoutes.get('/me', ctrl.getMe);
userRoutes.patch('/me', validate(updateProfileSchema), ctrl.updateMe);
userRoutes.post('/me/change-password', authLimiter, validate(changePasswordSchema), ctrl.changeMyPassword);
userRoutes.delete('/me', authLimiter, validate(deleteAccountSchema), ctrl.deleteMe);
userRoutes.get('/me/export', ctrl.exportMyData);
userRoutes.get('/me/dashboard', ctrl.dashboard);

export const feedbackRoutes = Router();
feedbackRoutes.post('/', apiLimiter, optionalAuth, validate(feedbackSchema), ctrl.submitFeedback);
