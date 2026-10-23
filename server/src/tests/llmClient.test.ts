import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';

/**
 * Exercises the OpenAI-compatible adapter against a tiny fake provider so the
 * request format, retries on 429/503, error mapping and SSE streaming are verified
 * without network access or API keys.
 */
let server: http.Server;
let mode: 'ok' | 'stream' | 'flaky' | 'unauthorized' | 'ratelimited' = 'ok';
let hits = 0;
const received: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits++;
      received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      if (mode === 'unauthorized') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'bad key' } })); }
      if (mode === 'ratelimited') { res.writeHead(429, { 'Content-Type': 'application/json', 'retry-after': '0' }); return res.end(JSON.stringify({ error: { message: 'slow down' } })); }
      if (mode === 'flaky' && hits % 2 === 1) { res.writeHead(503); return res.end('upstream down'); }
      if (mode === 'stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: ' + JSON.stringify({ model: 'fake-1', choices: [{ delta: { content: '{"answer":' } }] }) + '\n\n');
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '"hi"}' } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) + '\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'fake-1', choices: [{ message: { content: '{"answer":"hello"}' } }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  process.env.AI_PROVIDER = 'custom';
  process.env.AI_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.AI_MODEL = 'fake-1';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MAX_RETRIES = '2';
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('llmClient (OpenAI-compatible adapter)', () => {
  it('sends an OpenAI-style chat completion request with the API key and parses the answer', async () => {
    const { complete } = await import('../services/ai/llmClient.js');
    mode = 'ok';
    const result = await complete({ messages: [{ role: 'user', content: 'ping' }], json: true });
    expect(result.text).toBe('{"answer":"hello"}');
    expect(result.usage?.totalTokens).toBe(14);
    expect(result.provider).toBe('custom');
    const last = received[received.length - 1];
    expect(last.url).toBe('/v1/chat/completions');
    expect(last.auth).toBe('Bearer test-key');
    expect((last.body as { model: string }).model).toBe('fake-1');
    expect((last.body as { response_format?: { type: string } }).response_format?.type).toBe('json_object');
  });

  it('streams server-sent events and reports usage', async () => {
    const { complete } = await import('../services/ai/llmClient.js');
    mode = 'stream';
    const deltas: string[] = [];
    const result = await complete({ messages: [{ role: 'user', content: 'ping' }], onToken: (d) => deltas.push(d) });
    expect(deltas.join('')).toBe('{"answer":"hi"}');
    expect(result.text).toBe('{"answer":"hi"}');
    expect(result.usage?.totalTokens).toBe(5);
  });

  it('retries transient 503 errors with backoff', async () => {
    const { complete } = await import('../services/ai/llmClient.js');
    mode = 'flaky';
    hits = 0;
    const result = await complete({ messages: [{ role: 'user', content: 'ping' }] });
    expect(result.text).toContain('hello');
    expect(hits).toBe(2);
  });

  it('maps provider auth and rate-limit errors to clear application errors', async () => {
    const { complete } = await import('../services/ai/llmClient.js');
    mode = 'unauthorized';
    await expect(complete({ messages: [{ role: 'user', content: 'ping' }] })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    mode = 'ratelimited';
    await expect(complete({ messages: [{ role: 'user', content: 'ping' }] })).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
  });
});
