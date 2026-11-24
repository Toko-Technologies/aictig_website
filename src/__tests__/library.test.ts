// @vitest-environment node
/** News, publications and repository documents stored in SQLite (added in the dashboard). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { createBackend } from '../../server/backend.cjs';
import { createUser } from '../../server/auth.cjs';

vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const ADMIN = { name: 'Site Owner', email: 'owner@example.org', password: 'correct horse battery' };
const H = { 'X-AICTiG-Admin': '1' };
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c20000000049454e44ae426082', 'hex');
const SILENT_PROVIDER = { id: 'none', name: 'None', translateItems: async () => ({ results: new Map(), failed: [] }) };

let dataDir: string;
let backend: ReturnType<typeof createBackend>;
let app: express.Express;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aictig-lib-test-'));
  backend = createBackend({ dataDir, env: 'test', translationProvider: SILENT_PROVIDER, scheduleTranslation: false });
  createUser(backend.db, ADMIN);
  app = express();
  app.use(backend.router);
});

afterEach(() => {
  backend.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function signedIn() {
  const agent = request.agent(app);
  await agent.post('/api/admin/login').set(H).send({ email: ADMIN.email, password: ADMIN.password });
  return agent;
}

const documentFiles = () => {
  const dir = path.join(dataDir, 'uploads', 'documents');
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

describe('news and publications', () => {
  it('keeps drafts off the website and publishes on request', async () => {
    const agent = await signedIn();
    const draft = await agent.post('/api/admin/library/news').set(H).send({
      title: 'AICTiG joins regional dialogue', excerpt: 'Summary', content: '<p>Hello</p><script>alert(1)</script>',
      status: 'draft', date: '2026-11-20', tags: ['ECOWAS', ' '],
    });
    expect(draft.status).toBe(201);
    expect(draft.body).toMatchObject({ slug: 'aictig-joins-regional-dialogue', status: 'draft', tags: ['ECOWAS'] });
    expect(draft.body.content).not.toContain('<script');
    expect((await request(app).get('/api/content/news')).body).toEqual([]);
    expect((await request(app).get('/api/content/news/aictig-joins-regional-dialogue')).status).toBe(404);

    await agent.put(`/api/admin/library/news/${draft.body.id}`).set(H).send({ ...draft.body, status: 'published' });
    const pub = await request(app).get('/api/content/news/aictig-joins-regional-dialogue');
    expect(pub.status).toBe(200);
    expect(pub.body.title).toBe('AICTiG joins regional dialogue');
  });

  it('gives every article its own web address', async () => {
    const agent = await signedIn();
    const a = await agent.post('/api/admin/library/news').set(H).send({ title: 'Annual report' });
    const b = await agent.post('/api/admin/library/news').set(H).send({ title: 'Annual report' });
    expect([a.body.slug, b.body.slug]).toEqual(['annual-report', 'annual-report-2']);
  });

  it('stores publication details and checks them', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/admin/library/publications').set(H).send({
      title: 'Data protection in Nigeria', type: 'Policy brief', authors: ['Dr Uchenna Jerome Orji'], fileUrl: '/uploads/documents/x.pdf',
    });
    expect(res.body).toMatchObject({ type: 'Policy brief', authors: ['Dr Uchenna Jerome Orji'], fileUrl: '/uploads/documents/x.pdf' });
    expect((await agent.post('/api/admin/library/publications').set(H).send({ title: 'x', type: 'Novel' })).status).toBe(400);
    expect((await agent.post('/api/admin/library/publications').set(H).send({ title: 'x', fileUrl: 'https://evil.example/x.pdf' })).status).toBe(400);
    expect((await agent.post('/api/admin/library/news').set(H).send({ title: '' })).status).toBe(400);
  });

  it('deletes an article and keeps everything private without signing in', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/admin/library/news').set(H).send({ title: 'To delete' });
    expect((await request(app).post('/api/admin/library/news').send({ title: 'x' })).status).toBe(403);
    expect((await request(app).get('/api/admin/library/news')).status).toBe(401);
    await agent.delete(`/api/admin/library/news/${res.body.id}`).set(H);
    expect((await agent.get('/api/admin/library/news')).body).toEqual([]);
  });
});

describe('repository documents', () => {
  const meta = { title: 'Nigeria Data Protection Act 2023', summary: 'The act.', year: 2023, country: 'Nigeria', languages: ['en'], themes: ['Data Protection'] };

  it('uploads a document with its details and shows it on the website', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/admin/library/documents').set(H).field('data', JSON.stringify(meta)).attach('file', PDF, 'act.pdf');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: meta.title, year: 2023, country: 'Nigeria', languages: ['en'], fileName: 'act.pdf', mime: 'application/pdf' });
    expect(res.body.fileUrl).toMatch(/^\/uploads\/documents\/[\w-]+\.pdf$/);
    expect((await request(app).get(res.body.fileUrl)).status).toBe(200);
    expect((await request(app).get('/api/content/documents')).body).toHaveLength(1);
  });

  it('checks the details before keeping the file', async () => {
    const agent = await signedIn();
    const badCountry = await agent.post('/api/admin/library/documents').set(H).field('data', JSON.stringify({ ...meta, country: 'Atlantis' })).attach('file', PDF, 'a.pdf');
    expect(badCountry.status).toBe(400);
    const noPlace = await agent.post('/api/admin/library/documents').set(H).field('data', JSON.stringify({ ...meta, country: '' })).attach('file', PDF, 'a.pdf');
    expect(noPlace.status).toBe(400);
    const notPdf = await agent.post('/api/admin/library/documents').set(H).field('data', JSON.stringify(meta)).attach('file', Buffer.from('MZ fake exe'), 'a.pdf');
    expect(notPdf.status).toBe(400);
    expect(documentFiles()).toHaveLength(0);
  });

  it('accepts regional documents, hides documents, replaces files and deletes', async () => {
    const agent = await signedIn();
    const regional = await agent.post('/api/admin/library/documents').set(H)
      .field('data', JSON.stringify({ ...meta, country: '', organization: 'ecowas', title: 'ECOWAS Cybersecurity Strategy' })).attach('file', PDF, 'ecowas.pdf');
    expect(regional.body.organization).toBe('ecowas');
    const docId = regional.body.id;

    await agent.put(`/api/admin/library/documents/${docId}`).set(H).send({ ...regional.body, hidden: true });
    expect((await request(app).get('/api/content/documents')).body).toHaveLength(0);
    expect((await request(app).get(`/api/content/documents/${docId}`)).status).toBe(404);

    const replaced = await agent.put(`/api/admin/library/documents/${docId}`).set(H)
      .field('data', JSON.stringify({ ...regional.body, hidden: false })).attach('file', PDF, 'ecowas-v2.pdf');
    expect(replaced.body.fileName).toBe('ecowas-v2.pdf');
    expect(replaced.body.fileUrl).not.toBe(regional.body.fileUrl);

    await agent.delete(`/api/admin/library/documents/${docId}`).set(H);
    expect((await agent.get('/api/admin/library/documents')).body).toEqual([]);
  });
});

describe('editor uploads', () => {
  it('accepts pictures and documents, and refuses other files', async () => {
    const agent = await signedIn();
    const img = await agent.post('/api/admin/files').set(H).attach('file', PNG, 'photo.png');
    expect(img.body.url).toMatch(/^\/uploads\/[\w-]+\.png$/);
    const doc = await agent.post('/api/admin/files').set(H).attach('file', PDF, 'report.pdf');
    expect(doc.body.url).toMatch(/^\/uploads\/documents\/[\w-]+\.pdf$/);
    expect((await agent.post('/api/admin/files').set(H).attach('file', Buffer.from('<html>'), 'x.png')).status).toBe(400);
  });

  it('serves the reference lists used by the forms', async () => {
    const places = (await request(app).get('/api/content/places')).body;
    expect(places.countries).toHaveLength(54);
    expect(places.organizations.map((o: { key: string }) => o.key)).toContain('ecowas');
  });
});
