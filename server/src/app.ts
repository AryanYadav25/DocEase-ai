import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isTest } from './config/env.js';
import { isDatabaseConnected } from './config/db.js';
import { logger } from './config/logger.js';
import { requireCsrfHeader } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { requestId } from './middleware/requestId.js';
import { aiRoutes, conversationRoutes, studyRoutes, summaryRoutes } from './routes/aiRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { documentRoutes } from './routes/documentRoutes.js';
import { feedbackRoutes, userRoutes } from './routes/userRoutes.js';
import { getAiStatus } from './services/ai/llmClient.js';
import { isOcrAvailable } from './services/ocr/ocrService.js';
import { processingQueue } from './services/processing/processingService.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      contentSecurityPolicy: false, // the API serves JSON only; the SPA sets its own CSP
    }),
  );
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
        customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
        customProps: (req) => ({ requestId: (req as express.Request).requestId }),
        serializers: { req: (req) => ({ method: req.method, url: req.url }), res: (res) => ({ statusCode: res.statusCode }) },
      }),
    );
  }

  app.get('/api/v1/health', async (_req, res) => {
    const ocr = await isOcrAvailable();
    const ai = getAiStatus();
    const db = isDatabaseConnected();
    res.status(db ? 200 : 503).json({
      success: db,
      data: {
        status: db ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        database: db ? 'connected' : 'disconnected',
        ocr: ocr.available ? 'ready' : 'missing-language-data',
        ai: { configured: ai.configured, provider: ai.provider, model: ai.model, problem: ai.problem },
        queue: processingQueue.stats,
        version: '1.0.0',
      },
    });
  });

  const api = express.Router();
  api.use(apiLimiter);
  api.use(requireCsrfHeader);
  api.use('/auth', authRoutes);
  api.use('/documents', documentRoutes);
  api.use('/conversations', conversationRoutes);
  api.use('/study-materials', studyRoutes);
  api.use('/summaries', summaryRoutes);
  api.use('/ai', aiRoutes);
  api.use('/users', userRoutes);
  api.use('/feedback', feedbackRoutes);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
