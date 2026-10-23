import pino from 'pino';
import { env, isDev } from './env.js';

/**
 * Structured logger. Document contents, passwords, API keys and session tokens
 * must never be passed to the logger. The redact list is a safety net only.
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'passwordHash',
      'token',
      'apiKey',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});
