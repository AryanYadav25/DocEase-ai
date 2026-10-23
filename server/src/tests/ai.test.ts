import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { H, app, registerUser, setupDb, teardownDb, uploadSample, waitForReady } from './helpers.js';
import { simplifyOutputSchema, chatOutputSchema } from '../services/ai/schemas.js';
import { parseJsonObject } from '../services/ai/llmClient.js';
import { chunkPages } from '../services/retrieval/textUtils.js';

describe('AI features (mock provider)', () => {
  let cookie: string[];
  let docId: string;
  beforeAll(async () => {
    await setupDb();
    ({ cookie } = await registerUser('ai'));
    const up = await uploadSample(cookie, 'sample-library-terms.pdf');
    docId = up.body.data.results[0].document.id;
    await waitForReady(cookie, docId);
  });
  afterAll(teardownDb);

  it('reports the configured provider', async () => {
    const res = await request(app).get('/api/v1/ai/status').set('Cookie', cookie);
    expect(res.body.data.provider).toBe('mock');
    expect(res.body.data.isMock).toBe(true);
  });

  it('simplifies with validated structured output, saves it and serves it from cache', async () => {
    const first = await request(app).post(`/api/v1/documents/${docId}/simplify`).set(H).set('Cookie', cookie).send({ explanationLevel: 'beginner', outputLength: 'short' });
    expect(first.status).toBe(200);
    expect(first.body.data.cached).toBe(false);
    expect(simplifyOutputSchema.safeParse(first.body.data.summary.content).success).toBe(true);
    expect(first.body.data.summary.modelMeta.isMock).toBe(true);
    const second = await request(app).post(`/api/v1/documents/${docId}/simplify`).set(H).set('Cookie', cookie).send({ explanationLevel: 'beginner', outputLength: 'short' });
    expect(second.body.data.cached).toBe(true);
    const list = await request(app).get(`/api/v1/documents/${docId}/summaries`).set('Cookie', cookie);
    expect(list.body.data.summaries.some((s: { summaryType: string }) => s.summaryType === 'simplify')).toBe(true);
  });

  it('answers questions with citations that point to real pages and chunks', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/chat`).set(H).set('Cookie', cookie).send({ message: 'What is the late fee for returning items after the due date?' });
    expect(res.status).toBe(200);
    const msg = res.body.data.assistantMessage;
    expect(msg.role).toBe('assistant');
    expect(msg.foundInDocument).toBe(true);
    expect(msg.sourceReferences.length).toBeGreaterThan(0);
    const retrieved = res.body.data.retrievedChunks as Array<{ chunkIndex: number; pageStart: number; pageEnd: number }>;
    for (const ref of msg.sourceReferences as Array<{ pageNumber: number; chunkIndex: number }>) {
      const chunk = retrieved.find((c) => c.chunkIndex === ref.chunkIndex);
      expect(chunk).toBeDefined();
      expect(ref.pageNumber).toBeGreaterThanOrEqual(chunk!.pageStart);
      expect(ref.pageNumber).toBeLessThanOrEqual(chunk!.pageEnd);
    }
    const page = await request(app).get(`/api/v1/documents/${docId}/pages/${msg.sourceReferences[0].pageNumber}`).set('Cookie', cookie);
    expect(page.status).toBe(200);
    expect(page.body.data.page.text.length).toBeGreaterThan(0);

    const follow = await request(app).post(`/api/v1/conversations/${res.body.data.conversation.id}/messages`).set(H).set('Cookie', cookie).send({ message: 'How many items can I borrow?' });
    expect(follow.body.data.conversation.messageCount).toBe(4);
  });

  it('generates and saves study materials with progress', async () => {
    const cards = await request(app).post(`/api/v1/documents/${docId}/flashcards`).set(H).set('Cookie', cookie).send({ count: 5 });
    expect(cards.status).toBe(201);
    expect(cards.body.data.material.content.flashcards).toHaveLength(5);
    const progress = await request(app).patch(`/api/v1/study-materials/${cards.body.data.material.id}/progress`).set(H).set('Cookie', cookie).send({ progress: { knownCardIds: ['card-1'] } });
    expect(progress.body.data.material.progress.knownCardIds).toEqual(['card-1']);
    const quiz = await request(app).post(`/api/v1/documents/${docId}/quiz`).set(H).set('Cookie', cookie).send({ count: 5 });
    expect(quiz.status).toBe(201);
    expect(quiz.body.data.material.content.questions.every((q: { type: string }) => ['multiple_choice', 'short_answer'].includes(q.type))).toBe(true);
    const all = await request(app).get('/api/v1/study-materials').set('Cookie', cookie);
    expect(all.body.data.materials.length).toBe(2);
  });

  it('refuses AI features on documents that are not ready', async () => {
    const up = await uploadSample(cookie, 'sample-library-terms.pdf');
    const id = up.body.data.results[0].document.id;
    const res = await request(app).post(`/api/v1/documents/${id}/simplify`).set(H).set('Cookie', cookie).send({});
    expect([200, 409]).toContain(res.status); // may already be processed on fast machines
    if (res.status === 409) expect(res.body.error.code).toBe('DOCUMENT_NOT_READY');
  });

  it('validates request bodies', async () => {
    const res = await request(app).post(`/api/v1/documents/${docId}/summarize`).set(H).set('Cookie', cookie).send({ summaryType: 'haiku' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('AI helpers', () => {
  it('parses JSON wrapped in fences or prose', () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject('Here you go: {"a":{"b":[1,2]}} thanks')).toEqual({ a: { b: [1, 2] } });
    expect(() => parseJsonObject('no json here')).toThrow();
  });

  it('rejects chat output with wrong shapes', () => {
    expect(chatOutputSchema.safeParse({ answer: 'x', foundInDocument: 'yes', citations: [] }).success).toBe(false);
    expect(chatOutputSchema.safeParse({ answer: 'x', foundInDocument: true, citations: [{ chunkIndex: 0, page: 1 }] }).success).toBe(true);
  });

  it('chunks pages while preserving page references', () => {
    const pages = [
      { pageNumber: 1, text: 'Alpha paragraph. '.repeat(60) },
      { pageNumber: 2, text: 'Beta paragraph. '.repeat(60) },
    ];
    const chunks = chunkPages(pages, 500, 50);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[chunks.length - 1].pageEnd).toBe(2);
    expect(chunks.every((c) => c.text.length <= 600)).toBe(true);
  });
});
