import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../utils/errors.js';
import { mockComplete } from './mockProvider.js';
import { resolveProviderConfig } from './providers.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  messages: ChatMessage[];
  /** Ask the provider for a JSON object. We still validate with Zod afterwards. */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Called with text deltas when streaming is requested and supported. */
  onToken?: (delta: string) => void;
}

export interface CompletionResult {
  text: string;
  model: string;
  provider: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  latencyMs: number;
  isMock: boolean;
}

export interface ModelMeta {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  isMock: boolean;
}

export function toModelMeta(r: CompletionResult): ModelMeta {
  return {
    provider: r.provider,
    model: r.model,
    promptTokens: r.usage?.promptTokens,
    completionTokens: r.usage?.completionTokens,
    totalTokens: r.usage?.totalTokens,
    latencyMs: r.latencyMs,
    isMock: r.isMock,
  };
}

/* ---------------- usage tracking (per process, informational) ---------------- */

const usageTotals = { requests: 0, promptTokens: 0, completionTokens: 0, failures: 0 };
export function getUsageTotals() {
  return { ...usageTotals };
}

/* ---------------- public API ---------------- */

export function getAiStatus() {
  const cfg = resolveProviderConfig();
  return {
    configured: cfg.configured,
    provider: cfg.preset.id,
    providerLabel: cfg.preset.label,
    model: cfg.model,
    baseUrl: cfg.baseUrl ? redactUrl(cfg.baseUrl) : null,
    problem: cfg.problem ?? null,
    isMock: cfg.preset.id === 'mock',
    supportsStreaming: cfg.preset.supportsStreaming,
    translationLanguages: env.AI_TRANSLATION_LANGUAGES.split(',').map((l) => l.trim()).filter(Boolean),
    limits: { maxInputChars: env.AI_MAX_INPUT_CHARS, maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS, requestsPerHour: env.AI_USER_REQUESTS_PER_HOUR },
    usage: getUsageTotals(),
  };
}

export function assertAiConfigured() {
  const cfg = resolveProviderConfig();
  if (!cfg.configured) throw new AppError(503, 'AI_NOT_CONFIGURED', cfg.problem ?? 'The AI provider is not configured.');
  return cfg;
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const cfg = assertAiConfigured();
  const started = Date.now();

  if (cfg.preset.id === 'mock') {
    const text = mockComplete(options);
    usageTotals.requests++;
    return { text, model: cfg.model, provider: 'mock', latencyMs: Date.now() - started, isMock: true };
  }

  const wantStream = !!options.onToken && cfg.preset.supportsStreaming;
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: Math.min(options.maxOutputTokens ?? env.AI_MAX_OUTPUT_TOKENS, env.AI_MAX_OUTPUT_TOKENS),
    stream: wantStream,
  };
  if (options.json && cfg.preset.supportsJsonMode) body.response_format = { type: 'json_object' };
  if (wantStream) body.stream_options = { include_usage: true };

  let attempt = 0;
  let lastErr: unknown;
  while (attempt <= env.AI_MAX_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
          ...(cfg.preset.extraHeaders ?? {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const message = extractProviderError(errText) || `${res.status} ${res.statusText}`;
        if (RETRYABLE.has(res.status) && attempt <= env.AI_MAX_RETRIES) {
          lastErr = new Error(message);
          await sleep(backoff(attempt, res.headers.get('retry-after')));
          continue;
        }
        usageTotals.failures++;
        if (res.status === 429) throw new AppError(429, 'AI_RATE_LIMITED', `The AI provider rate-limited this request (${cfg.preset.label}). Please wait a moment and try again.`, { details: message });
        if (res.status === 401 || res.status === 403) throw new AppError(503, 'AI_NOT_CONFIGURED', `The AI provider rejected the API key (${cfg.preset.label}). Check AI_API_KEY in your .env.`);
        if (res.status === 404 || res.status === 400) throw new AppError(502, 'AI_PROVIDER_ERROR', `The AI provider returned an error: ${message}`, { expose: true });
        throw new AppError(502, 'AI_PROVIDER_ERROR', `The AI provider is currently unavailable (${message}).`, { expose: true });
      }

      const result = wantStream ? await readStream(res, options.onToken!) : await readJson(res);
      usageTotals.requests++;
      usageTotals.promptTokens += result.usage?.promptTokens ?? 0;
      usageTotals.completionTokens += result.usage?.completionTokens ?? 0;
      return { ...result, provider: cfg.preset.id, model: result.model || cfg.model, latencyMs: Date.now() - started, isMock: false };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (options.signal?.aborted) throw new AppError(499, 'AI_TIMEOUT', 'The request was cancelled.');
      if ((err as Error).name === 'AbortError') {
        lastErr = new AppError(504, 'AI_TIMEOUT', 'The AI provider took too long to respond.');
        if (attempt <= env.AI_MAX_RETRIES) {
          await sleep(backoff(attempt));
          continue;
        }
        usageTotals.failures++;
        throw lastErr;
      }
      lastErr = err;
      if (attempt <= env.AI_MAX_RETRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      usageTotals.failures++;
      logger.error({ err }, 'AI provider request failed');
      throw new AppError(502, 'AI_PROVIDER_ERROR', 'Could not reach the AI provider. Check your network connection and AI_BASE_URL.', { cause: err, expose: true });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
  usageTotals.failures++;
  throw lastErr instanceof AppError ? lastErr : new AppError(502, 'AI_PROVIDER_ERROR', `The AI provider failed after retries: ${(lastErr as Error)?.message ?? 'unknown error'}`, { expose: true });
}

/* ---------------- helpers ---------------- */

async function readJson(res: Response): Promise<Omit<CompletionResult, 'provider' | 'latencyMs' | 'isMock'>> {
  const json = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const raw = json.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? '').join('') : '';
  if (!text) throw new AppError(502, 'AI_PROVIDER_ERROR', 'The AI provider returned an empty response.', { expose: true });
  return { text, model: json.model ?? '', usage: mapUsage(json.usage) };
}

async function readStream(res: Response, onToken: (d: string) => void): Promise<Omit<CompletionResult, 'provider' | 'latencyMs' | 'isMock'>> {
  const reader = res.body?.getReader();
  if (!reader) throw new AppError(502, 'AI_PROVIDER_ERROR', 'The AI provider returned no body.', { expose: true });
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let model = '';
  let usage: CompletionResult['usage'];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload) as { model?: string; choices?: Array<{ delta?: { content?: string } }>; usage?: Record<string, number> };
        if (evt.model) model = evt.model;
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onToken(delta);
        }
        if (evt.usage) usage = mapUsage(evt.usage);
      } catch {
        /* ignore malformed keep-alive lines */
      }
    }
  }
  if (!text) throw new AppError(502, 'AI_PROVIDER_ERROR', 'The AI provider returned an empty response.', { expose: true });
  return { text, model, usage };
}

function mapUsage(u?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
  if (!u) return undefined;
  return { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens };
}

function extractProviderError(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === 'string') return j.error;
    return j.error?.message || j.message || '';
  } catch {
    return text.slice(0, 300);
  }
}

function backoff(attempt: number, retryAfter?: string | null): number {
  const header = retryAfter ? Number(retryAfter) * 1000 : NaN;
  if (!Number.isNaN(header) && header > 0) return Math.min(header, 20000);
  return Math.min(20000, 800 * 2 ** (attempt - 1)) + Math.random() * 300;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function redactUrl(url: string) {
  return url.replace(/(key|token|api_key)=([^&]+)/gi, '$1=[redacted]');
}

/**
 * Extract a JSON object from model output. Handles code fences and leading prose.
 */
export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.unshift(fence[1].trim());
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  throw new AppError(502, 'AI_INVALID_OUTPUT', 'The AI model returned output that could not be parsed. Please try again.', { expose: true });
}
