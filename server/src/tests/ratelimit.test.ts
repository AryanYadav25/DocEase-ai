import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { H, app, setupDb, teardownDb } from './helpers.js';

describe('rate limiting and error format', () => {
  beforeAll(setupDb);
  afterAll(teardownDb);

  it('throttles repeated auth attempts and returns the standard error shape', async () => {
    let last: request.Response | null = null;
    for (let i = 0; i < 80; i++) {
      // forgot-password hits the same auth limiter without the cost of password hashing
      last = await request(app).post('/api/v1/auth/forgot-password').set(H).send({ email: 'nobody@example.com' });
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    expect(last!.body).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
    expect(typeof last!.body.error.requestId).toBe('string');
  });

  it('returns a consistent 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
