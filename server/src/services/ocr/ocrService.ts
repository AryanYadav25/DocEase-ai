import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';

export interface OcrOptions {
  rotate?: 0 | 90 | 180 | 270;
  grayscale?: boolean;
  enhance?: boolean;
  autoOrient?: boolean;
}

export interface OcrResult {
  text: string;
  /** Mean word confidence 0-100 as reported by Tesseract. */
  confidence: number;
  lowConfidenceWords: number;
  totalWords: number;
  durationMs: number;
  engine: string;
  preprocessing: string[];
}

const LANG_PATH = path.resolve(process.cwd(), env.OCR_LANG_PATH);

export async function isOcrAvailable(): Promise<{ available: boolean; reason?: string; langPath: string }> {
  const langs = env.OCR_LANGUAGES.split('+');
  for (const lang of langs) {
    try {
      await fs.access(path.join(LANG_PATH, `${lang}.traineddata`));
    } catch {
      return { available: false, reason: `Missing ${lang}.traineddata in ${LANG_PATH}. Run "npm run setup:ocr" inside server/.`, langPath: LANG_PATH };
    }
  }
  return { available: true, langPath: LANG_PATH };
}

/**
 * Image preprocessing with sharp. Each step is conservative and recorded so the UI
 * can tell the user exactly what was done to their image before OCR.
 */
export async function preprocessImage(input: Buffer, options: OcrOptions = {}): Promise<{ buffer: Buffer; steps: string[]; width: number; height: number }> {
  const steps: string[] = [];
  let pipeline = sharp(input, { failOn: 'none', limitInputPixels: env.MAX_IMAGE_DIMENSION * env.MAX_IMAGE_DIMENSION });
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) throw new AppError(422, 'CORRUPT_FILE', 'The image could not be decoded.');

  if (options.autoOrient !== false) {
    pipeline = pipeline.rotate(); // honour EXIF orientation
    steps.push('exif-orientation');
  }
  if (options.rotate) {
    pipeline = pipeline.rotate(options.rotate);
    steps.push(`rotate-${options.rotate}`);
  }

  // Upscale small images: Tesseract works best around 300 DPI-equivalent.
  const largest = Math.max(meta.width, meta.height);
  if (largest < 1500) {
    const factor = Math.min(3, 1500 / largest);
    pipeline = pipeline.resize({ width: Math.round(meta.width * factor), kernel: 'lanczos3' });
    steps.push(`upscale-x${factor.toFixed(1)}`);
  } else if (largest > env.MAX_IMAGE_DIMENSION) {
    pipeline = pipeline.resize({ width: env.MAX_IMAGE_DIMENSION, height: env.MAX_IMAGE_DIMENSION, fit: 'inside' });
    steps.push('downscale');
  }

  if (options.grayscale !== false) {
    pipeline = pipeline.grayscale();
    steps.push('grayscale');
  }
  if (options.enhance !== false) {
    pipeline = pipeline.normalise().median(1).sharpen({ sigma: 0.8 });
    steps.push('contrast-normalise', 'denoise', 'sharpen');
  }

  const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
  return { buffer: data, steps, width: info.width, height: info.height };
}

/* ---------- Worker pool (bounded concurrency, lazily created) ---------- */

class OcrPool {
  private idle: Worker[] = [];
  private creating = 0;
  private waiters: Array<(w: Worker) => void> = [];
  private readonly size = Math.max(1, env.OCR_CONCURRENCY);

  private async create(): Promise<Worker> {
    const availability = await isOcrAvailable();
    if (!availability.available) throw new AppError(503, 'OCR_FAILED', availability.reason!, { expose: true });
    const worker = await createWorker(env.OCR_LANGUAGES, 1, {
      langPath: LANG_PATH,
      cachePath: LANG_PATH,
      gzip: false,
      logger: () => undefined,
    });
    await worker.setParameters({ preserve_interword_spaces: '1' });
    return worker;
  }

  async acquire(): Promise<Worker> {
    const w = this.idle.pop();
    if (w) return w;
    if (this.creating < this.size) {
      this.creating++;
      try {
        return await this.create();
      } finally {
        this.creating--;
      }
    }
    return new Promise<Worker>((resolve) => this.waiters.push(resolve));
  }

  release(worker: Worker) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(worker);
    else this.idle.push(worker);
  }

  async destroy(worker: Worker) {
    await worker.terminate().catch(() => undefined);
    this.creating = Math.max(0, this.creating);
  }

  async shutdown() {
    await Promise.all(this.idle.map((w) => w.terminate().catch(() => undefined)));
    this.idle = [];
  }
}

const pool = new OcrPool();
export const shutdownOcr = () => pool.shutdown();

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new AppError(504, 'OCR_FAILED', message)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/** Run OCR on an image buffer (PNG/JPEG/WebP). Preprocesses first unless disabled. */
export async function recognizeImage(input: Buffer, options: OcrOptions = {}): Promise<OcrResult> {
  const started = Date.now();
  const pre = await preprocessImage(input, options);
  const worker = await pool.acquire();
  let failed = false;
  try {
    const result = await withTimeout(worker.recognize(pre.buffer), env.OCR_PAGE_TIMEOUT_MS, 'OCR timed out on this page.');
    const words = (result.data as unknown as { words?: Array<{ confidence: number }> }).words ?? [];
    const lowConfidenceWords = words.filter((w) => w.confidence < 60).length;
    return {
      text: cleanOcrText(result.data.text),
      confidence: Math.round(result.data.confidence),
      lowConfidenceWords,
      totalWords: words.length,
      durationMs: Date.now() - started,
      engine: 'tesseract.js',
      preprocessing: pre.steps,
    };
  } catch (err) {
    failed = true;
    logger.warn({ err }, 'OCR failed');
    throw err instanceof AppError ? err : new AppError(500, 'OCR_FAILED', 'Text recognition failed for this image.', { cause: err, expose: true });
  } finally {
    if (failed) await pool.destroy(worker);
    else pool.release(worker);
  }
}

function cleanOcrText(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
