import { Router } from 'express';
import * as ai from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { messageFeedbackSchema, studyProgressSchema } from '../validators/ai.js';
import { idParamSchema } from '../validators/common.js';
import { z } from 'zod';

export const aiRoutes = Router();
aiRoutes.get('/status', requireAuth, ai.status);

export const conversationRoutes = Router();
conversationRoutes.use(requireAuth);
conversationRoutes.get('/:id', validate(idParamSchema, 'params'), ai.getConversation);
conversationRoutes.post('/:id/messages', aiLimiter, validate(idParamSchema, 'params'), validate(z.object({ message: z.string().trim().min(1).max(4000), regenerateMessageId: z.string().regex(/^[a-f\d]{24}$/i).optional() })), ai.postMessage);
conversationRoutes.delete('/:id', validate(idParamSchema, 'params'), ai.deleteConversation);
conversationRoutes.post('/:id/clear', validate(idParamSchema, 'params'), ai.clearConversation);
conversationRoutes.patch('/messages/:messageId/feedback', validate(z.object({ messageId: z.string().regex(/^[a-f\d]{24}$/i) }), 'params'), validate(messageFeedbackSchema), ai.messageFeedback);

export const studyRoutes = Router();
studyRoutes.use(requireAuth);
studyRoutes.get('/', ai.listAllStudyMaterials);
studyRoutes.get('/:id', validate(idParamSchema, 'params'), ai.getStudyMaterial);
studyRoutes.patch('/:id/progress', validate(idParamSchema, 'params'), validate(studyProgressSchema), ai.updateStudyProgress);
studyRoutes.delete('/:id', validate(idParamSchema, 'params'), ai.deleteStudyMaterial);

export const summaryRoutes = Router();
summaryRoutes.use(requireAuth);
summaryRoutes.delete('/:id', validate(idParamSchema, 'params'), ai.deleteSummary);
