import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { H, app, registerUser, setupDb, teardownDb, uploadSample, waitForReady } from './helpers.js';

describe('documents', () => {
  let cookie: string[];
  beforeAll(async () => {
    await setupDb();
    ({ cookie } = await registerUser('docs'));
  });
  afterAll(teardownDb);

  it('rejects files whose content does not match a supported type', async () => {
    const res = await request(app).post('/api/v1/documents').set(H).set('Cookie', cookie).attach('files', Buffer.from('MZ\u0090\u0000not-a-pdf'), 'fake.pdf');
    expect(res.status).toBe(400);
    expect(res.body.data.results[0].ok).toBe(false);
    expect(res.body.data.results[0].error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const exe = await request(app).post('/api/v1/documents').set(H).set('Cookie', cookie).attach('files', Buffer.from('hello'), 'script.exe');
    expect(exe.status).toBe(415);
  });

  it('uploads a text PDF, extracts its text layer and chunks it', async () => {
    const up = await uploadSample(cookie, 'sample-library-terms.pdf');
    expect(up.status).toBe(201);
    const id = up.body.data.results[0].document.id as string;
    const status = await waitForReady(cookie, id);
    expect(status.processingStatus).toBe('completed');
    expect(status.pageCount).toBe(2);
    expect(status.extractedTextMeta.textPages).toBe(2);
    expect(status.extractedTextMeta.chunkCount).toBeGreaterThan(0);
    const text = await request(app).get(`/api/v1/documents/${id}/extracted-text`).set('Cookie', cookie);
    expect(text.body.data.pages[0].text).toContain('Riverside Community Library');
    expect(text.body.data.pages[0].extractionMethod).toBe('text_layer');
  });

  it('runs OCR on a scanned PDF and on an image', async () => {
    const up = await uploadSample(cookie, 'sample-scanned-terms.pdf');
    const id = up.body.data.results[0].document.id as string;
    const status = await waitForReady(cookie, id, 120000);
    expect(['completed', 'completed_with_warnings']).toContain(status.processingStatus);
    expect(status.extractedTextMeta.ocrPages).toBe(2);
    const text = await request(app).get(`/api/v1/documents/${id}/extracted-text`).set('Cookie', cookie);
    expect(text.body.data.pages[0].extractionMethod).toBe('ocr');
    expect(text.body.data.pages[0].text).toMatch(/Membership Terms/i);
    expect(text.body.data.pages[0].ocr.confidence).toBeGreaterThan(50);

    const img = await uploadSample(cookie, 'sample-notes-photo.png');
    const imgId = img.body.data.results[0].document.id as string;
    const imgStatus = await waitForReady(cookie, imgId, 120000);
    expect(imgStatus.extractedTextMeta.ocrPages).toBe(1);
    const imgText = await request(app).get(`/api/v1/documents/${imgId}/extracted-text`).set('Cookie', cookie);
    expect(imgText.body.data.pages[0].text).toMatch(/Photosynthesis/i);
  }, 180000);

  it('lets the owner correct extracted text and re-indexes', async () => {
    const up = await uploadSample(cookie, 'sample-plain-text.txt');
    const id = up.body.data.results[0].document.id as string;
    await waitForReady(cookie, id);
    const res = await request(app).patch(`/api/v1/documents/${id}/pages/1/text`).set(H).set('Cookie', cookie).send({ text: 'Corrected text about zebras.' });
    expect(res.status).toBe(200);
    expect(res.body.data.page.extractionMethod).toBe('manual');
    expect(res.body.data.page.editedByUser).toBe(true);
    expect(res.body.data.document.extractedTextMeta.chunkCount).toBeGreaterThan(0);
  });

  it('supports rename, favorite, tags, search, sort and pagination', async () => {
    const up = await uploadSample(cookie, 'sample-brief.docx');
    const id = up.body.data.results[0].document.id as string;
    await waitForReady(cookie, id);
    const patch = await request(app).patch(`/api/v1/documents/${id}`).set(H).set('Cookie', cookie).send({ title: 'Weather station brief', isFavorite: true, tags: ['Project', 'IoT'] });
    expect(patch.body.data.document.tags).toEqual(['project', 'iot']);
    const list = await request(app).get('/api/v1/documents?search=weather&favorite=true&sort=name&order=asc&pageSize=1').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].title).toBe('Weather station brief');
    expect(list.body.pagination.total).toBe(1);
    const invalid = await request(app).get('/api/v1/documents?sort=nope').set('Cookie', cookie);
    expect(invalid.status).toBe(400);
  });

  it('moves to trash, restores and permanently deletes, denying access afterwards', async () => {
    const up = await uploadSample(cookie, 'sample-plain-text.txt');
    const id = up.body.data.results[0].document.id as string;
    await waitForReady(cookie, id);
    const del = await request(app).delete(`/api/v1/documents/${id}`).set(H).set('Cookie', cookie);
    expect(del.status).toBe(200);
    expect(del.body.data.document.deletedAt).toBeTruthy();
    const hidden = await request(app).get('/api/v1/documents').set('Cookie', cookie);
    expect(hidden.body.data.some((d: { id: string }) => d.id === id)).toBe(false);
    const trash = await request(app).get('/api/v1/documents?trashed=true').set('Cookie', cookie);
    expect(trash.body.data.some((d: { id: string }) => d.id === id)).toBe(true);
    const restore = await request(app).post(`/api/v1/documents/${id}/restore`).set(H).set('Cookie', cookie);
    expect(restore.body.data.document.deletedAt).toBeNull();
    const perm = await request(app).delete(`/api/v1/documents/${id}/permanent`).set(H).set('Cookie', cookie);
    expect(perm.status).toBe(200);
    const gone = await request(app).get(`/api/v1/documents/${id}`).set('Cookie', cookie);
    expect(gone.status).toBe(404);
    const text = await request(app).get(`/api/v1/documents/${id}/extracted-text`).set('Cookie', cookie);
    expect(text.status).toBe(404);
  });

  it('never exposes one user\'s documents to another', async () => {
    const up = await uploadSample(cookie, 'sample-plain-text.txt');
    const id = up.body.data.results[0].document.id as string;
    await waitForReady(cookie, id);
    const other = await registerUser('other');
    for (const path of [`/api/v1/documents/${id}`, `/api/v1/documents/${id}/download`, `/api/v1/documents/${id}/extracted-text`]) {
      const res = await request(app).get(path).set('Cookie', other.cookie);
      expect(res.status, path).toBe(404);
    }
    const patch = await request(app).patch(`/api/v1/documents/${id}`).set(H).set('Cookie', other.cookie).send({ title: 'hacked' });
    expect(patch.status).toBe(404);
    const chat = await request(app).post(`/api/v1/documents/${id}/chat`).set(H).set('Cookie', other.cookie).send({ message: 'hi' });
    expect(chat.status).toBe(404);
  });

  it('serves the original file only to its owner with safe headers', async () => {
    const up = await uploadSample(cookie, 'sample-library-terms.pdf');
    const id = up.body.data.results[0].document.id as string;
    const res = await request(app).get(`/api/v1/documents/${id}/download`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
