import path from 'node:path';
import fs from 'node:fs/promises';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { ensureStorageDirs } from '../services/storage/storageService.js';

export const SAMPLES = path.resolve(process.cwd(), '../sample-documents');
export const app = createApp();
export const H = { 'X-Requested-With': 'DocuEase' };

export async function setupDb() {
  await ensureStorageDirs();
  await connectDatabase();
  const collections = await mongoose.connection.db!.collections();
  for (const c of collections) await c.deleteMany({});
}

export async function teardownDb() {
  await disconnectDatabase();
  await fs.rm(path.resolve(process.cwd(), 'storage-test'), { recursive: true, force: true });
}

let counter = 0;
export async function registerUser(prefix = 'user') {
  counter++;
  const email = `${prefix}${counter}-${Date.now()}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').set(H).send({ email, password: 'Passw0rd123', displayName: 'Test User' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie'] as unknown as string[];
  return { email, cookie, user: res.body.data.user as { id: string } };
}

export async function uploadSample(cookie: string[], filename: string) {
  const res = await request(app).post('/api/v1/documents').set(H).set('Cookie', cookie).attach('files', path.join(SAMPLES, filename));
  return res;
}

export async function waitForReady(cookie: string[], id: string, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await request(app).get(`/api/v1/documents/${id}/status`).set('Cookie', cookie);
    const status = res.body.data.processingStatus as string;
    if (['completed', 'completed_with_warnings', 'failed'].includes(status)) return res.body.data;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timed out waiting for processing');
}
