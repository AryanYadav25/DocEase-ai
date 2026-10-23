import { Router } from 'express';
import * as ctrl from '../controllers/documentController.js';
import * as ai from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';
import { aiLimiter, processingLimiter, uploadLimiter } from '../middleware/rateLimit.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { uploadLimits } from '../config/env.js';
import {
  chatSchema,
  explainSelectionSchema,
  extractInformationSchema,
  flashcardsSchema,
  quizSchema,
  simplifySchema,
  summarizeSchema,
  translateSchema,
  vocabularySchema,
} from '../validators/ai.js';
import { idParamSchema, pageParamSchema } from '../validators/common.js';
import { bulkActionSchema, listDocumentsSchema, ocrOptionsSchema, updateDocumentSchema, updatePageTextSchema } from '../validators/documents.js';

export const documentRoutes = Router();

documentRoutes.use(requireAuth);

documentRoutes.get('/upload-policy', ctrl.getUploadPolicy);
documentRoutes.post('/', uploadLimiter, uploadMiddleware.array('files', uploadLimits.maxFilesPerUpload), ctrl.upload);
documentRoutes.get('/', validate(listDocumentsSchema, 'query'), ctrl.list);
documentRoutes.post('/bulk', validate(bulkActionSchema), ctrl.bulk);

documentRoutes.get('/:id', validate(idParamSchema, 'params'), ctrl.getOne);
documentRoutes.patch('/:id', validate(idParamSchema, 'params'), validate(updateDocumentSchema), ctrl.update);
documentRoutes.delete('/:id', validate(idParamSchema, 'params'), ctrl.remove);
documentRoutes.post('/:id/restore', validate(idParamSchema, 'params'), ctrl.restore);
documentRoutes.delete('/:id/permanent', validate(idParamSchema, 'params'), ctrl.permanentDelete);
documentRoutes.get('/:id/download', validate(idParamSchema, 'params'), ctrl.download);
documentRoutes.get('/:id/status', validate(idParamSchema, 'params'), ctrl.getStatus);
documentRoutes.post('/:id/reprocess', processingLimiter, validate(idParamSchema, 'params'), ctrl.reprocess);
documentRoutes.get('/:id/pages/:pageNumber', validate(pageParamSchema, 'params'), ctrl.getPage);

// Extraction & OCR
documentRoutes.post('/:id/extract', processingLimiter, validate(idParamSchema, 'params'), ctrl.extract);
documentRoutes.post('/:id/ocr', processingLimiter, validate(idParamSchema, 'params'), validate(ocrOptionsSchema), ctrl.runOcr);
documentRoutes.get('/:id/extracted-text', validate(idParamSchema, 'params'), ctrl.getExtractedText);
documentRoutes.patch('/:id/pages/:pageNumber/text', validate(pageParamSchema, 'params'), validate(updatePageTextSchema), ctrl.updatePageText);
documentRoutes.post('/:id/pages/:pageNumber/retry-ocr', processingLimiter, validate(pageParamSchema, 'params'), validate(ocrOptionsSchema), ctrl.retryPageOcr);

// AI
documentRoutes.post('/:id/simplify', aiLimiter, validate(idParamSchema, 'params'), validate(simplifySchema), ai.simplify);
documentRoutes.post('/:id/summarize', aiLimiter, validate(idParamSchema, 'params'), validate(summarizeSchema), ai.summarize);
documentRoutes.post('/:id/extract-information', aiLimiter, validate(idParamSchema, 'params'), validate(extractInformationSchema), ai.extractInformation);
documentRoutes.post('/:id/vocabulary', aiLimiter, validate(idParamSchema, 'params'), validate(vocabularySchema), ai.vocabulary);
documentRoutes.post('/:id/explain-selection', aiLimiter, validate(idParamSchema, 'params'), validate(explainSelectionSchema), ai.explainSelection);
documentRoutes.post('/:id/translate', aiLimiter, validate(idParamSchema, 'params'), validate(translateSchema), ai.translate);
documentRoutes.post('/:id/flashcards', aiLimiter, validate(idParamSchema, 'params'), validate(flashcardsSchema), ai.flashcards);
documentRoutes.post('/:id/quiz', aiLimiter, validate(idParamSchema, 'params'), validate(quizSchema), ai.quiz);
documentRoutes.post('/:id/revision-notes', aiLimiter, validate(idParamSchema, 'params'), ai.revisionNotes);
documentRoutes.post('/:id/chat', aiLimiter, validate(idParamSchema, 'params'), validate(chatSchema), ai.chat);
documentRoutes.get('/:id/suggested-questions', validate(idParamSchema, 'params'), ai.suggestedQuestions);

// Saved results
documentRoutes.get('/:id/summaries', validate(idParamSchema, 'params'), ai.listSummaries);
documentRoutes.get('/:id/study-materials', validate(idParamSchema, 'params'), ai.listStudyMaterials);
documentRoutes.get('/:id/conversations', validate(idParamSchema, 'params'), ai.listConversations);
documentRoutes.post('/:id/conversations', validate(idParamSchema, 'params'), ai.createConversation);
