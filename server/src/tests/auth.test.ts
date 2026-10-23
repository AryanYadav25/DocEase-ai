import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { H, app, registerUser, setupDb, teardownDb } from './helpers.js';

describe('authentication', () => {
  beforeAll(setupDb);
  afterAll(teardownDb);

  it('registers and returns the user with a session cookie', async () => {
    const { cookie, email } = await registerUser();
    expect(cookie.some((c) => c.startsWith('docuease_session=') && c.includes('HttpOnly'))).toBe(true);
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await request(app).post('/api/v1/auth/register').set(H).send({ email: 'weak@example.com', password: 'short', displayName: 'X' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    const { email } = await registerUser();
    const dup = await request(app).post('/api/v1/auth/register').set(H).send({ email, password: 'Passw0rd123', displayName: 'X' });
    expect(dup.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const { email } = await registerUser();
    const bad = await request(app).post('/api/v1/auth/login').set(H).send({ email, password: 'Wrong12345' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toMatch(/incorrect/i);
    const ok = await request(app).post('/api/v1/auth/login').set(H).send({ email, password: 'Passw0rd123' });
    expect(ok.status).toBe(200);
  });

  it('blocks protected routes without a session and state-changing requests without the CSRF header', async () => {
    const noAuth = await request(app).get('/api/v1/documents');
    expect(noAuth.status).toBe(401);
    const { cookie } = await registerUser();
    const noCsrf = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(noCsrf.status).toBe(403);
  });

  it('logs out', async () => {
    const { cookie } = await registerUser();
    const res = await request(app).post('/api/v1/auth/logout').set(H).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const cleared = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cleared).toMatch(/docuease_session=;/);
  });

  it('issues a password reset link in development mode and accepts it', async () => {
    const { email } = await registerUser();
    const res = await request(app).post('/api/v1/auth/forgot-password').set(H).send({ email });
    expect(res.status).toBe(200);
    expect(res.body.data.emailConfigured).toBe(false);
    const token = new URL(res.body.data.devResetUrl).searchParams.get('token')!;
    const reset = await request(app).post('/api/v1/auth/reset-password').set(H).send({ token, password: 'NewPassw0rd9' });
    expect(reset.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').set(H).send({ email, password: 'NewPassw0rd9' });
    expect(login.status).toBe(200);
    const reuse = await request(app).post('/api/v1/auth/reset-password').set(H).send({ token, password: 'Another1234' });
    expect(reuse.status).toBe(400);
  });
});
