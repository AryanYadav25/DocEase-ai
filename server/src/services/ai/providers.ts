import { env } from '../../config/env.js';

/**
 * Free-tier LLM provider presets. Every entry exposes an OpenAI-compatible
 * `/chat/completions` endpoint, so one adapter serves all of them.
 *
 * All of these have a no-credit-card free tier at the time of writing; limits change
 * often, so check each provider's pricing page. Override any value with AI_BASE_URL /
 * AI_MODEL in .env.
 */
export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  requiresApiKey: boolean;
  /** Whether the provider honours `response_format: { type: "json_object" }`. */
  supportsJsonMode: boolean;
  supportsStreaming: boolean;
  keyUrl?: string;
  notes: string;
  extraHeaders?: Record<string, string>;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  groq: {
    id: 'groq',
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    requiresApiKey: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://console.groq.com/keys',
    notes: 'Fast inference; free tier is rate limited per minute and per day. Other production models: llama-3.3-70b-versatile, llama-3.1-8b-instant, openai/gpt-oss-20b.',
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini (AI Studio free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash-lite',
    requiresApiKey: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    notes: 'Uses the OpenAI-compatible endpoint of the Gemini API. Free-tier models include gemini-3.5-flash-lite and gemini-3.8-flash; see https://ai.google.dev/pricing.',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    requiresApiKey: true,
    supportsJsonMode: false, // varies per routed model; we fall back to prompt-enforced JSON
    supportsStreaming: true,
    keyUrl: 'https://openrouter.ai/keys',
    notes: '"openrouter/free" routes to any available free model; or pin one with a ":free" suffix (e.g. meta-llama/llama-3.3-70b-instruct:free).',
    extraHeaders: { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'DocuEase AI' },
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral (free experiment tier)',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    requiresApiKey: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://console.mistral.ai/api-keys',
    notes: 'La Plateforme "experiment" tier is free but rate limited.',
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras (free tier)',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'llama-3.3-70b',
    requiresApiKey: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://cloud.cerebras.ai',
    notes: 'Very fast; free tier has daily token limits.',
  },
  github: {
    id: 'github',
    label: 'GitHub Models (free for GitHub accounts)',
    baseUrl: 'https://models.github.ai/inference',
    defaultModel: 'openai/gpt-4o-mini',
    requiresApiKey: true,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://github.com/settings/tokens',
    notes: 'Use a GitHub personal access token as the API key.',
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local, fully free & offline)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'llama3.2',
    requiresApiKey: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    keyUrl: 'https://ollama.com/download',
    notes: 'Runs on your own machine. Install Ollama, then `ollama pull llama3.2`.',
  },
  custom: {
    id: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
    supportsJsonMode: true,
    supportsStreaming: true,
    notes: 'Set AI_BASE_URL and AI_MODEL explicitly.',
  },
  mock: {
    id: 'mock',
    label: 'Mock provider (automated tests only)',
    baseUrl: '',
    defaultModel: 'mock-1',
    requiresApiKey: false,
    supportsJsonMode: true,
    supportsStreaming: false,
    notes: 'Returns deterministic placeholder output. Never use outside tests.',
  },
};

export interface ResolvedProviderConfig {
  preset: ProviderPreset;
  baseUrl: string;
  model: string;
  apiKey?: string;
  configured: boolean;
  problem?: string;
}

export function resolveProviderConfig(): ResolvedProviderConfig {
  const preset = PROVIDER_PRESETS[env.AI_PROVIDER] ?? PROVIDER_PRESETS.groq;
  const baseUrl = (env.AI_BASE_URL || preset.baseUrl).replace(/\/$/, '');
  const model = env.AI_MODEL || preset.defaultModel;
  const apiKey = env.AI_API_KEY?.trim() || undefined;

  let problem: string | undefined;
  if (preset.id === 'mock') {
    if (env.NODE_ENV === 'production') problem = 'The mock AI provider cannot be used in production.';
  } else {
    if (!baseUrl) problem = 'AI_BASE_URL is not set.';
    else if (!model) problem = 'AI_MODEL is not set.';
    else if (preset.requiresApiKey && !apiKey) problem = `AI_API_KEY is missing. Get a free key at ${preset.keyUrl} and set AI_PROVIDER=${preset.id} in your .env.`;
  }
  return { preset, baseUrl, model, apiKey, configured: !problem, problem };
}
