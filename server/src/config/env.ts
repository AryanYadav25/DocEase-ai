import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load `.env` from the repository root first, then `server/.env` (server wins).
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

const booleanish = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // On Render, RENDER_EXTERNAL_URL is the public URL of the service (frontend + API share it).
  CLIENT_ORIGIN: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'),
  APP_BASE_URL: z.string().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:5173'),
  /** Directory of the built frontend to serve from the API (production single-service deploys). */
  CLIENT_DIST_DIR: z.string().optional(),

  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/docuease'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('dev-only-change-me-please-32chars'),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_NAME: z.string().default('docuease_session'),
  COOKIE_SECURE: booleanish,

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_DIR: z.string().default('./storage'),
  TMP_DIR: z.string().default('./storage/tmp'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(25),
  MAX_PAGE_COUNT: z.coerce.number().int().positive().default(300),
  MAX_IMAGE_DIMENSION: z.coerce.number().int().positive().default(6000),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(10),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  PROCESSING_CONCURRENCY: z.coerce.number().int().positive().default(2),
  OCR_CONCURRENCY: z.coerce.number().int().positive().default(1),
  OCR_LANGUAGES: z.string().default('eng'),
  OCR_LANG_PATH: z.string().default('./tessdata'),
  OCR_PAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  OCR_MIN_TEXT_CHARS_PER_PAGE: z.coerce.number().int().nonnegative().default(40),
  PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),

  // AI provider — see server/src/services/ai/providers.ts for the free-tier presets.
  AI_PROVIDER: z.enum(['groq', 'gemini', 'openrouter', 'mistral', 'cerebras', 'github', 'ollama', 'custom', 'mock']).default('groq'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1500),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_INPUT_CHARS: z.coerce.number().int().positive().default(12000), // ~3k tokens per request: fits free-tier per-minute limits
  AI_PART_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
  AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  AI_USER_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(60),
  AI_TRANSLATION_LANGUAGES: z.string().default('English,Hindi,Spanish,French,German,Portuguese,Arabic,Chinese (Simplified),Japanese,Bengali,Tamil'),

  EMAIL_PROVIDER: z.enum(['none', 'smtp']).default('none'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('DocuEase AI <no-reply@localhost>'),

  LOG_LEVEL: z.string().default('info'),
  RATE_LIMIT_DISABLED: booleanish,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';

if (isProd && env.JWT_SECRET === 'dev-only-change-me-please-32chars') {
  // eslint-disable-next-line no-console
  console.error('Refusing to start in production with the default JWT_SECRET.');
  process.exit(1);
}

export const uploadLimits = {
  maxFileSizeBytes: Math.round(env.MAX_FILE_SIZE_MB * 1024 * 1024),
  maxFileSizeMb: env.MAX_FILE_SIZE_MB,
  maxPageCount: env.MAX_PAGE_COUNT,
  maxImageDimension: env.MAX_IMAGE_DIMENSION,
  maxFilesPerUpload: env.MAX_FILES_PER_UPLOAD,
  acceptedMimeTypes: [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  acceptedExtensions: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.docx'],
};
