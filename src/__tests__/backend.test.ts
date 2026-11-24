// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
// CommonJS backend modules
import { createBackend, injectSiteData } from '../../server/backend.cjs';
import { createUser } from '../../server/auth.cjs';

// Password hashing is deliberately slow (bcrypt cost 12), and some tests sign
// in many times, so allow more than the default 5 seconds.
vi.setConfig({ testTimeout: 60000, hookTimeout: 60000 });

const ADMIN = { name: 'Site Owner', email: 'owner@example.org', password: 'correct horse battery' };
const H = { 'X-AICTiG-Admin': '1' };
const SILENT_PROVIDER = { id: 'none', name: 'None', translateItems: async () => ({ results: new Map(), failed: [] }) };

let dataDir: string;
let backend: ReturnType<typeof createBackend>;
let app: express.Express;

function makeApp() {
  const a = express();
  a.set('trust proxy', 'loopback');
  a.use(backend.router);
  return a;
}

async function signedIn() {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/login').set(H).send({ email: ADMIN.email, password: ADMIN.password });
  expect(res.status).toBe(200);
  return agent;
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aictig-test-'));
  // A translation service that translates nothing, so tests never use the network.
  backend = createBackend({ dataDir, env: 'test', translationProvider: SILENT_PROVIDER, scheduleTranslation: false });
  createUser(backend.db, ADMIN);
  app = makeApp();
});

afterEach(() => {
  backend.db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('public API', () => {
  it('returns no edited texts and the default settings at first', async () => {
    const res = await request(app).get('/api/site');
    expect(res.status).toBe(200);
    expect(res.body.texts).toEqual({});
    expect(res.body.settings.contactEmails).toContain('info@AICTiG.org');
  });

  it('serves the seeded team members', async () => {
    const res = await request(app).get('/api/team');
    expect(res.body.map((m: { slug: string }) => m.slug)).toEqual(['uchenna-jerome-orji', 'oghomwen-rita-ohiro']);
    expect(res.body[0].publications).toHaveLength(20);
  });
});

describe('sign-in and security', () => {
  it('rejects dashboard requests without a session', async () => {
    expect((await request(app).get('/api/admin/me')).status).toBe(401);
    expect((await request(app).put('/api/admin/content/en').set(H).send({ changes: {} })).status).toBe(401);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: 'nope-nope-nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Incorrect email or password.');
    const unknown = await request(app).post('/api/admin/login').set(H).send({ email: 'x@example.org', password: 'nope-nope-nope' });
    expect(unknown.body.error).toBe(res.body.error);
  });

  it('sets a secure session cookie on sign-in', async () => {
    const res = await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: ADMIN.password });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/admin/);
    const stored = backend.db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
    expect(cookie).not.toContain(stored.token_hash); // only the hash is stored
  });

  it('blocks requests without the anti-forgery header or from other sites', async () => {
    const noHeader = await request(app).post('/api/admin/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(noHeader.status).toBe(403);
    const crossSite = await request(app).post('/api/admin/login').set(H).set('Sec-Fetch-Site', 'cross-site')
      .send({ email: ADMIN.email, password: ADMIN.password });
    expect(crossSite.status).toBe(403);
  });

  it('locks the account after 5 wrong passwords', async () => {
    for (let i = 0; i < 4; i += 1) {
      expect((await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: 'wrong-password' })).status).toBe(401);
    }
    expect((await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: 'wrong-password' })).status).toBe(423);
    const correct = await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: ADMIN.password });
    expect(correct.status).toBe(423);
  });

  it('ends the session on sign-out', async () => {
    const agent = await signedIn();
    expect((await agent.get('/api/admin/me')).body.user.email).toBe(ADMIN.email);
    await agent.post('/api/admin/logout').set(H);
    expect((await agent.get('/api/admin/me')).status).toBe(401);
  });
});

describe('editing website texts', () => {
  it('saves a text, shows it publicly, and restores the original', async () => {
    const agent = await signedIn();
    const save = await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': '  New heading  ' } });
    expect(save.status).toBe(200);
    expect(save.body.values['home:hero.title'].override).toBe('New heading');

    const site = await request(app).get('/api/site');
    expect(site.body.texts.en['home:hero.title']).toBe('New heading');

    const history = await agent.get('/api/admin/history');
    expect(history.body[0].summary).toContain('Home page (English)');

    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': null } });
    expect((await request(app).get('/api/site')).body.texts).toEqual({});
  });

  it('keeps languages separate and shows each language’s original text', async () => {
    const agent = await signedIn();
    const fr = await agent.get('/api/admin/content/fr');
    expect(fr.body.values['home:hero.title'].original).not.toBe('');
    await agent.put('/api/admin/content/fr').set(H).send({ changes: { 'home:hero.title': 'Titre' } });
    const site = await request(app).get('/api/site');
    expect(site.body.texts.fr['home:hero.title']).toBe('Titre');
    expect(site.body.texts.en).toBeUndefined();
  });

  it('rejects unknown texts, empty texts and texts that are too long', async () => {
    const agent = await signedIn();
    expect((await agent.put('/api/admin/content/en').set(H).send({ changes: { 'repo:anything': 'x' } })).status).toBe(400);
    expect((await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': '   ' } })).status).toBe(400);
    expect((await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.cta.updates': 'x'.repeat(301) } })).status).toBe(400);
    expect((await agent.put('/api/admin/content/en').set(H).send({ changes: { 'common:footer.copyright': '© AICTiG' } })).status).toBe(400);
    expect((await agent.put('/api/admin/content/xx').set(H).send({ changes: { 'home:hero.title': 'x' } })).status).toBe(404);
  });
});

describe('contact settings', () => {
  it('saves links and emails, and refuses unsafe links', async () => {
    const agent = await signedIn();
    const bad = await agent.put('/api/admin/settings').set(H).send({ socialLinks: { facebook: 'javascript:alert(1)' } });
    expect(bad.status).toBe(400);
    const ok = await agent.put('/api/admin/settings').set(H)
      .send({ socialLinks: { linkedin: 'https://linkedin.com/company/aictig' }, contactEmails: ['info@aictig.org'] });
    expect(ok.status).toBe(200);
    const site = await request(app).get('/api/site');
    expect(site.body.settings.socialLinks).toEqual({ facebook: '', linkedin: 'https://linkedin.com/company/aictig', x: '', instagram: '', whatsapp: '' });
    expect(site.body.settings.contactEmails).toEqual(['info@aictig.org']);
  });
});

describe('team members', () => {
  const member = {
    name: 'Dr Ada Example', role: 'Research Fellow', summary: 'Works on data protection.',
    bio: ['First paragraph.'], expertise: ['Data protection'], photo: '', published: true,
  };

  it('adds, updates, hides and removes a member', async () => {
    const agent = await signedIn();
    const created = await agent.post('/api/admin/team').set(H).send(member);
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe('ada-example');

    const hidden = await agent.put(`/api/admin/team/${created.body.id}`).set(H).send({ ...member, published: false });
    expect(hidden.body.published).toBe(false);
    expect((await request(app).get('/api/team')).body).toHaveLength(2);

    await agent.delete(`/api/admin/team/${created.body.id}`).set(H);
    expect((await agent.get('/api/admin/team')).body).toHaveLength(2);
  });

  it('requires a name, role, summary and biography and checks links', async () => {
    const agent = await signedIn();
    expect((await agent.post('/api/admin/team').set(H).send({ ...member, name: '' })).status).toBe(400);
    expect((await agent.post('/api/admin/team').set(H).send({ ...member, bio: [] })).status).toBe(400);
    expect((await agent.post('/api/admin/team').set(H).send({ ...member, linkedin: 'http://x' })).status).toBe(400);
    expect((await agent.post('/api/admin/team').set(H).send({ ...member, photo: '/etc/passwd' })).status).toBe(400);
  });

  it('reorders members', async () => {
    const agent = await signedIn();
    const ids = (await agent.get('/api/admin/team')).body.map((m: { id: number }) => m.id);
    const res = await agent.put('/api/admin/team-order').set(H).send({ ids: [...ids].reverse() });
    expect(res.body.map((m: { slug: string }) => m.slug)[0]).toBe('oghomwen-rita-ohiro');
  });
});

describe('image uploads', () => {
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c20000000049454e44ae426082', 'hex');

  it('accepts a real image and serves it', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/admin/uploads').set(H).attach('file', PNG, 'photo.png');
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/uploads\/[\w-]+\.png$/);
    const served = await request(app).get(res.body.url);
    expect(served.status).toBe(200);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses files that are not images, whatever their name', async () => {
    const agent = await signedIn();
    const res = await agent.post('/api/admin/uploads').set(H).attach('file', Buffer.from('<script>alert(1)</script>'), 'photo.png');
    expect(res.status).toBe(400);
  });
});

describe('users and account', () => {
  it('adds a user, prevents removing yourself, and changes the password', async () => {
    const agent = await signedIn();
    const added = await agent.post('/api/admin/users').set(H).send({ name: 'Editor', email: 'editor@example.org', password: 'another long password' });
    expect(added.status).toBe(201);
    const me = (await agent.get('/api/admin/me')).body.user;
    expect((await agent.delete(`/api/admin/users/${me.id}`).set(H)).status).toBe(400);
    expect((await agent.put('/api/admin/account/password').set(H).send({ currentPassword: 'wrong', newPassword: 'a brand new password' })).status).toBe(400);
    expect((await agent.put('/api/admin/account/password').set(H).send({ currentPassword: ADMIN.password, newPassword: 'short' })).status).toBe(400);
    expect((await agent.put('/api/admin/account/password').set(H).send({ currentPassword: ADMIN.password, newPassword: 'a brand new password' })).status).toBe(200);
    const relogin = await request(app).post('/api/admin/login').set(H).send({ email: ADMIN.email, password: 'a brand new password' });
    expect(relogin.status).toBe(200);
  });
});

describe('contact form messages', () => {
  const valid = { name: 'Ada Visitor', email: 'ada@example.org', topic: 'research', message: 'We would like to collaborate on a study.', elapsedMs: 9000 };

  it('stores a valid message and shows it in the dashboard', async () => {
    expect((await request(app).post('/api/contact').send(valid)).status).toBe(201);
    const agent = await signedIn();
    const res = await agent.get('/api/admin/messages');
    expect(res.body.unread).toBe(1);
    expect(res.body.messages[0]).toMatchObject({ name: 'Ada Visitor', topicLabel: 'Research collaboration', readAt: null });
    const id = res.body.messages[0].id;
    expect((await agent.put(`/api/admin/messages/${id}`).set(H).send({ read: true })).body.readAt).not.toBeNull();
    expect((await agent.get('/api/admin/messages/unread-count')).body.unread).toBe(0);
    await agent.delete(`/api/admin/messages/${id}`).set(H);
    expect((await agent.get('/api/admin/messages')).body.messages).toHaveLength(0);
  });

  it('rejects invalid messages with a field name', async () => {
    const bad = await request(app).post('/api/contact').send({ ...valid, email: 'not-an-email' });
    expect(bad.status).toBe(400);
    expect(bad.body.details.field).toBe('email');
    expect((await request(app).post('/api/contact').send({ ...valid, message: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/contact').send({ ...valid, topic: 'other' })).status).toBe(400);
  });

  it('quietly drops spam (hidden field filled, or sent too fast)', async () => {
    expect((await request(app).post('/api/contact').send({ ...valid, website: 'http://spam' })).status).toBe(201);
    expect((await request(app).post('/api/contact').send({ ...valid, elapsedMs: 300 })).status).toBe(201);
    const count = backend.db.prepare('SELECT COUNT(*) AS n FROM contact_messages').get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('limits messages per visitor', async () => {
    for (let i = 0; i < 5; i += 1) expect((await request(app).post('/api/contact').send(valid)).status).toBe(201);
    const sixth = await request(app).post('/api/contact').send(valid);
    expect(sixth.status).toBe(429);
  });

  it('keeps messages private', async () => {
    expect((await request(app).get('/api/admin/messages')).status).toBe(401);
  });
});

describe('automatic translation', () => {
  type Item = { id: string; key: string; lang: string; source: string };
  let calls: Item[][];

  function useBackend(extra: Record<string, unknown>) {
    backend.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aictig-test-'));
    backend = createBackend({ dataDir, env: 'test', scheduleTranslation: false, ...extra });
    createUser(backend.db, ADMIN);
    app = makeApp();
  }

  beforeEach(() => {
    calls = [];
    useBackend({
      translationProvider: {
        id: 'fake',
        name: 'Fake',
        translateItems: async (items: Item[]) => {
          calls.push(items);
          return { results: new Map(items.map((i) => [i.id, `[${i.lang}] ${i.source}`])), failed: [] };
        },
      },
    });
  });

  it('translates an English change into the other languages', async () => {
    const agent = await signedIn();
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': 'New heading' } });
    await backend.translator.idle();
    const site = (await request(app).get('/api/site')).body;
    expect(site.texts.fr['home:hero.title']).toBe('[fr] New heading');
    expect(site.texts.zh['home:hero.title']).toBe('[zh] New heading');
    expect(calls[0]).toHaveLength(6);
    expect((await agent.get('/api/admin/content/fr')).body.values['home:hero.title'].source).toBe('auto');
  });

  it('never overwrites a text edited by hand in another language', async () => {
    const agent = await signedIn();
    await agent.put('/api/admin/content/fr').set(H).send({ changes: { 'home:hero.title': 'Titre choisi à la main' } });
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': 'New heading' } });
    await backend.translator.idle();
    const site = (await request(app).get('/api/site')).body;
    expect(site.texts.fr['home:hero.title']).toBe('Titre choisi à la main');
    expect(site.texts.ar['home:hero.title']).toBe('[ar] New heading');
    expect(calls[0].map((c) => c.lang)).not.toContain('fr');
  });

  it('removes automatic translations when the English original is restored', async () => {
    const agent = await signedIn();
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': 'New heading' } });
    await backend.translator.idle();
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': null } });
    await backend.translator.idle();
    expect((await request(app).get('/api/site')).body.texts).toEqual({});
  });

  it('copies addresses instead of translating them', async () => {
    const agent = await signedIn();
    const address = 'Abuja: 1 Test Street, Abuja\nLagos: Lapal House, Lagos';
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'common:footer.nigeriaAddress': address } });
    await backend.translator.idle();
    expect((await request(app).get('/api/site')).body.texts.ar['common:footer.nigeriaAddress']).toBe(address);
    expect(calls).toHaveLength(0);
  });

  it('does not translate texts that are already up to date', async () => {
    const agent = await signedIn();
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': 'New heading' } });
    await backend.translator.idle();
    backend.translator.refreshOutdated({ force: true });
    await backend.translator.idle();
    expect(calls).toHaveLength(1);
    expect((await agent.get('/api/admin/translation')).body).toMatchObject({ enabled: true, outdated: 0, busy: false });
  });

  it('can be switched off in the dashboard, and keeps the settings private', async () => {
    const agent = await signedIn();
    const res = await agent.put('/api/admin/translation/settings').set(H)
      .send({ enabled: false, email: 'web@aictig.org', keepTerms: ['AICTiG', 'TETRALEX'] });
    expect(res.body.settings).toEqual({ enabled: false, email: 'web@aictig.org', keepTerms: ['AICTiG', 'TETRALEX'] });
    await agent.put('/api/admin/content/en').set(H).send({ changes: { 'home:hero.title': 'New heading' } });
    await backend.translator.idle();
    expect(calls).toHaveLength(0);
    expect(JSON.stringify((await request(app).get('/api/site')).body)).not.toContain('web@aictig.org');
    expect((await agent.put('/api/admin/translation/settings').set(H).send({ email: 'not-an-email' })).status).toBe(400);
  });
});

describe('MyMemory (free translation service)', () => {
  type Reply = (q: string, langpair: string) => Record<string, unknown>;
  let requests: URL[];

  function useMyMemory(reply: Reply) {
    requests = [];
    const fakeFetch = async (url: string) => {
      const u = new URL(url);
      requests.push(u);
      const body = reply(u.searchParams.get('q') || '', u.searchParams.get('langpair') || '');
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    };
    backend.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aictig-test-'));
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    backend = createBackend({ dataDir, env: 'test', fetch: fakeFetch, scheduleTranslation: false });
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    createUser(backend.db, ADMIN);
    app = makeApp();
  }

  // A pretend translator: prefixes the language code and keeps everything else.
  const ok = (text: string) => ({ responseData: { translatedText: text, match: 0.85 }, responseStatus: 200, quotaFinished: false });
  const echo: Reply = (q, pair) => ok(`<${pair.split('|')[1]}> ${q}`);

  async function saveEnglish(changes: Record<string, string | null>) {
    const agent = await signedIn();
    await agent.put('/api/admin/content/en').set(H).send({ changes });
    await backend.translator.idle();
    return { agent, site: (await request(app).get('/api/site')).body };
  }

  it('is used by default and protects AICTiG, {{year}} and the © symbol', async () => {
    useMyMemory(echo);
    const { site, agent } = await saveEnglish({ 'common:footer.copyright': '© {{year}} AICTiG. All rights reserved.' });
    for (const u of requests) expect(u.searchParams.get('q')).not.toMatch(/AICTiG|\{\{year\}\}|©/);
    expect(site.texts.fr['common:footer.copyright']).toBe('<fr> © {{year}} AICTiG. All rights reserved.');
    expect(requests.map((u) => u.searchParams.get('langpair'))).toContain('en|zh-CN');
    expect((await agent.get('/api/admin/translation')).body.provider).toBe('MyMemory (free)');
  });

  it('rejects a translation that lost a protected word', async () => {
    useMyMemory((q) => ok(q.replace(/ZXQ\d+QXZ/g, '')));
    const { site, agent } = await saveEnglish({ 'home:hero.title': 'Welcome to AICTiG' });
    expect(site.texts.fr).toBeUndefined();
    expect((await agent.get('/api/admin/translation')).body.lastError).toMatch(/not saved/);
  });

  it('keeps line breaks, splits long paragraphs and stays under 500 bytes', async () => {
    useMyMemory(echo);
    const longParagraph = 'AICTiG studies how African states govern cybersecurity and data. '.repeat(10).trim(); // > 450 bytes, within the free daily allowance;
    const { site } = await saveEnglish({ 'about:about.paragraph2': `First line.\n${longParagraph}` });
    expect(site.texts.ru['about:about.paragraph2'].split('\n')).toHaveLength(2);
    for (const u of requests) expect(Buffer.byteLength(u.searchParams.get('q')!, 'utf8')).toBeLessThanOrEqual(500);
  });

  it('remembers translated sentences instead of sending them again', async () => {
    useMyMemory(echo);
    await saveEnglish({ 'home:features.title': 'What we offer' });
    const first = requests.length;
    await saveEnglish({ 'home:stats.policies': 'What we offer' });
    expect(requests.length).toBe(first);
  });

  it('sends the contact email to raise the free limit', async () => {
    useMyMemory(echo);
    const agent = await signedIn();
    await agent.put('/api/admin/translation/settings').set(H).send({ enabled: true, email: 'web@aictig.org', keepTerms: ['AICTiG'] });
    await backend.translator.idle();
    await saveEnglish({ 'home:hero.title': 'New heading' });
    expect(requests.at(-1)!.searchParams.get('de')).toBe('web@aictig.org');
    expect((await agent.get('/api/admin/translation')).body.usage.limit).toBe(47500);
  });

  it('pauses when the free daily allowance is used up', async () => {
    useMyMemory(() => ({
      responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY' },
      responseStatus: 429,
      quotaFinished: true,
    }));
    const { agent } = await saveEnglish({ 'home:hero.title': 'New heading' });
    const status = (await agent.get('/api/admin/translation')).body;
    expect(status.lastError).toMatch(/paused: the free daily translation allowance is used up/);
    expect(status.outdated).toBe(6);
  });
});

describe('HTML injection', () => {
  it('escapes text so it cannot break out of the script tag', () => {
    const html = injectSiteData('<html><head></head><body></body></html>', { texts: { en: { 'home:hero.title': '</script><script>alert(1)</script>' } } });
    expect(html).not.toContain('</script><script>alert');
    expect(html).toContain('window.__AICTIG_SITE__=');
  });
});
