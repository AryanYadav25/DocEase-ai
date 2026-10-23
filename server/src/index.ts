import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { getAiStatus } from './services/ai/llmClient.js';
import { purgeExpiredTrash } from './services/documents/documentService.js';
import { isOcrAvailable, shutdownOcr } from './services/ocr/ocrService.js';
import { requeueInterruptedDocuments } from './services/processing/processingService.js';
import { ensureStorageDirs } from './services/storage/storageService.js';

async function main() {
  await ensureStorageDirs();
  await connectDatabase();

  const ai = getAiStatus();
  if (!ai.configured) logger.warn({ provider: ai.provider }, `AI is not configured: ${ai.problem}`);
  else logger.info({ provider: ai.provider, model: ai.model }, 'AI provider ready');
  const ocr = await isOcrAvailable();
  if (!ocr.available) logger.warn(ocr.reason);
  else logger.info({ langPath: ocr.langPath }, 'OCR language data found');

  await requeueInterruptedDocuments();
  const purge = setInterval(() => purgeExpiredTrash().catch((err) => logger.error({ err }, 'Trash purge failed')), 6 * 60 * 60 * 1000);
  purgeExpiredTrash().catch((err) => logger.error({ err }, 'Trash purge failed'));

  const app = createApp();
  const server = app.listen(env.PORT, () => logger.info(`DocuEase API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`));
  server.requestTimeout = 5 * 60 * 1000; // long uploads/OCR runs
  server.headersTimeout = 5 * 60 * 1000 + 1000;

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(purge);
    server.close();
    await shutdownOcr();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
