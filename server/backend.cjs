/**
 * The website backend: public content API, the admin (dashboard) API and
 * uploaded images. server.cjs mounts this next to the existing WordPress
 * proxies, which are not touched.
 *
 * Public (no sign-in):
 *   GET  /api/site               edited texts + contact settings (also injected into the HTML)
 *   GET  /api/team               published team members
 *   POST /api/contact            contact form submissions
 *   GET  /api/content/...        news, publications and documents added in the dashboard
 *   GET  /uploads/<file>         uploaded images
 *
 * Dashboard (sign-in required, see server/auth.cjs):
 *   POST /api/admin/login · POST /api/admin/logout · GET /api/admin/me
 *   GET  /api/admin/overview
 *   GET|PUT /api/admin/content/:lang
 *   GET|PUT /api/admin/settings
 *   GET|POST /api/admin/team · GET|PUT|DELETE /api/admin/team/:id · PUT /api/admin/team-order
 *   POST /api/admin/uploads
 *   GET  /api/admin/translation · PUT /api/admin/translation/settings · POST /api/admin/translation/run
 *   GET|PUT|DELETE /api/admin/messages[/:id]
 *   /api/admin/library/...     news, publications and repository documents (SQLite)
 *   POST /api/admin/files      pictures and documents for the editor
 *   GET  /api/admin/history
 *   GET|POST /api/admin/users · DELETE /api/admin/users/:id
 *   PUT  /api/admin/account/password
 */
const express = require('express');
const { loadConfig } = require('./config.cjs');
const { openDatabase, logChange } = require('./db.cjs');
const {
  createAuth, createUser, hashPassword, validatePassword, publicUser, HttpError,
} = require('./auth.cjs');
const { createContent } = require('./content.cjs');
const { createSettings } = require('./settings.cjs');
const { createTeam } = require('./team.cjs');
const { createUploads, fileParser } = require('./uploads.cjs');
const { createLibrary } = require('./library.cjs');
const { createMessages } = require('./messages.cjs');
const { createAutoTranslator } = require('./translate.cjs');

function createBackend(options = {}) {
  const config = loadConfig(options);
  const db = options.db || openDatabase(config.dbFile);
  const auth = createAuth(db, config);
  const content = createContent(db, config);
  const settings = createSettings(db);
  const team = createTeam(db, config);
  const uploads = createUploads(config);
  const messages = createMessages(db);
  const translator = createAutoTranslator(db, config, content, settings, {
    provider: options.translationProvider,
    fetch: options.fetch,
    schedule: options.scheduleTranslation,
  });
  content.setEnglishChangeHandler(translator.englishChanged);
  const library = createLibrary(db, config);

  /** Data the public website needs to show edited texts and settings. */
  function siteData() {
    return { texts: content.allOverrides(), settings: settings.publicSettings() };
  }

  const router = express.Router();

  // ── Uploaded images ───────────────────────────────────────────────
  router.use('/uploads', express.static(config.uploadsDir, {
    index: false,
    dotfiles: 'deny',
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  // ── Public API ────────────────────────────────────────────────────
  const publicApi = express.Router();
  publicApi.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache');
    next();
  });
  publicApi.get('/site', (req, res) => res.json(siteData()));
  publicApi.get('/team', (req, res) => {
    res.json(team.list({ publishedOnly: true }).map(({ published, position, ...m }) => m));
  });
  // News, publications and documents added in the dashboard (published ones only).
  publicApi.get('/content/places', (req, res) => res.json(library.places));
  publicApi.get('/content/:kind(news|publications)', (req, res) => res.json(library.listPosts(req.params.kind, { publishedOnly: true })));
  publicApi.get('/content/:kind(news|publications)/:slug', (req, res) => res.json(library.getPublishedBySlug(req.params.kind, req.params.slug)));
  publicApi.get('/content/documents', (req, res) => res.json(library.listDocuments({ visibleOnly: true })));
  publicApi.get('/content/documents/:id', (req, res) => res.json(library.getDocument(Number(req.params.id), { visibleOnly: true })));
  publicApi.post('/contact', express.json({ limit: '32kb' }), (req, res) => {
    messages.submit(req.body, req.ip);
    res.status(201).json({ ok: true });
  });
  router.use('/api', publicApi);

  // ── Admin API ─────────────────────────────────────────────────────
  const admin = express.Router();
  admin.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  admin.use(express.json({ limit: '512kb' }));
  admin.use(auth.csrfGuard);

  admin.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = auth.verifyLogin(email, password, req.ip);
    auth.startSession(res, user.id);
    logChange(db, user, 'auth.login', 'Signed in');
    res.json({ user: publicUser(user) });
  });

  admin.post('/logout', (req, res) => {
    auth.endSession(req, res);
    res.json({ ok: true });
  });

  // Everything below requires a signed-in user.
  admin.use(auth.requireAuth);

  admin.get('/me', (req, res) => res.json({ user: req.user }));

  admin.get('/overview', (req, res) => {
    const members = team.list();
    res.json({
      editedTexts: content.countOverrides(),
      teamMembers: members.length,
      hiddenTeamMembers: members.filter((m) => !m.published).length,
      users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
      unreadMessages: messages.unreadCount(),
      library: library.counts(),
      translation: translator.status(),
      recentChanges: recentHistory(6),
    });
  });

  admin.get('/translation', (req, res) => res.json(translator.status()));
  admin.put('/translation/settings', (req, res) => {
    settings.save({ translation: req.body }, req.user);
    if (req.body && req.body.enabled !== false) translator.refreshOutdated({ force: true });
    res.json(translator.status());
  });
  admin.post('/translation/run', (req, res) => {
    translator.refreshOutdated({ force: true });
    res.json(translator.status());
  });

  admin.get('/messages', (req, res) => res.json({ messages: messages.list(), unread: messages.unreadCount() }));
  admin.get('/messages/unread-count', (req, res) => res.json({ unread: messages.unreadCount() }));
  admin.put('/messages/:id', (req, res) => {
    res.json(messages.setRead(Number(req.params.id), !!(req.body && req.body.read)));
  });
  admin.delete('/messages/:id', (req, res) => {
    messages.remove(Number(req.params.id), req.user);
    res.json({ ok: true });
  });

  admin.get('/content/:lang', (req, res) => res.json({ values: content.valuesFor(req.params.lang) }));
  admin.put('/content/:lang', (req, res) => {
    res.json(content.save(req.params.lang, req.body && req.body.changes, req.user));
  });

  admin.get('/settings', (req, res) => res.json(settings.all()));
  admin.put('/settings', (req, res) => res.json(settings.save(req.body, req.user)));

  admin.get('/team', (req, res) => res.json(team.list()));
  admin.post('/team', (req, res) => res.status(201).json(team.create(req.body, req.user)));
  admin.get('/team/:id', (req, res) => res.json(team.get(Number(req.params.id))));
  admin.put('/team/:id', (req, res) => res.json(team.update(Number(req.params.id), req.body, req.user)));
  admin.delete('/team/:id', (req, res) => {
    team.remove(Number(req.params.id), req.user);
    res.json({ ok: true });
  });
  admin.put('/team-order', (req, res) => res.json(team.reorder(req.body && req.body.ids, req.user)));

  admin.post('/uploads', uploads.handleUpload);

  function recentHistory(limit) {
    return db.prepare(
      'SELECT id, user_name, action, summary, details, created_at FROM audit_log WHERE action != ? ORDER BY id DESC LIMIT ?',
    ).all('auth.login', limit).map((r) => ({
      id: r.id,
      user: r.user_name,
      action: r.action,
      summary: r.summary,
      details: r.details ? JSON.parse(r.details) : null,
      at: r.created_at,
    }));
  }
  admin.get('/history', (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    res.json(recentHistory(limit));
  });

  admin.get('/users', (req, res) => {
    res.json(db.prepare('SELECT id, name, email, last_login_at, created_at FROM users ORDER BY created_at').all()
      .map((u) => ({ id: u.id, name: u.name, email: u.email, lastLoginAt: u.last_login_at, createdAt: u.created_at })));
  });
  admin.post('/users', (req, res) => {
    const created = createUser(db, req.body || {});
    logChange(db, req.user, 'users.create', `Gave dashboard access to ${created.name} (${created.email})`);
    res.status(201).json(publicUser(created));
  });
  admin.delete('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.id) throw new HttpError(400, 'You cannot remove your own account.');
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'This user no longer exists.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    logChange(db, req.user, 'users.delete', `Removed dashboard access for ${target.name} (${target.email})`);
    res.json({ ok: true });
  });

  admin.put('/account/password', (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    // eslint-disable-next-line global-require
    if (typeof currentPassword !== 'string' || !require('bcryptjs').compareSync(currentPassword, row.password_hash)) {
      throw new HttpError(400, 'Your current password is not correct.');
    }
    const problem = validatePassword(newPassword);
    if (problem) throw new HttpError(400, problem);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
    // Sign out every other session of this user.
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user.id, req.sessionTokenHash);
    logChange(db, req.user, 'account.password', 'Changed their password');
    res.json({ ok: true });
  });

  // ── News, publications and repository documents (SQLite) ───────
  const KIND = ':kind(news|publications)';
  const id = (req) => Number(req.params.id);
  const parseData = (req) => {
    try { return JSON.parse(req.body.data || '{}'); } catch { throw new HttpError(400, 'Invalid request.'); }
  };
  admin.get('/library/options', (req, res) => res.json({ ...library.places, publicationTypes: library.PUBLICATION_TYPES }));
  admin.post('/files', fileParser(), (req, res) => res.status(201).json(uploads.saveFile(req.file)));
  admin.get(`/library/${KIND}`, (req, res) => res.json(library.listPosts(req.params.kind)));
  admin.get(`/library/${KIND}/:id`, (req, res) => res.json(library.getPost(req.params.kind, id(req))));
  admin.post(`/library/${KIND}`, (req, res) => res.status(201).json(library.savePost(req.params.kind, null, req.body, req.user)));
  admin.put(`/library/${KIND}/:id`, (req, res) => res.json(library.savePost(req.params.kind, id(req), req.body, req.user)));
  admin.delete(`/library/${KIND}/:id`, (req, res) => {
    library.deletePost(req.params.kind, id(req), req.user);
    res.json({ ok: true });
  });
  admin.get('/library/documents', (req, res) => res.json(library.listDocuments()));
  admin.get('/library/documents/:id', (req, res) => res.json(library.getDocument(id(req))));
  admin.post('/library/documents', fileParser({ images: false }), (req, res) => {
    const data = parseData(req);
    library.validateDocument(data); // check the details before keeping the file
    res.status(201).json(library.createDocument(uploads.saveFile(req.file), data, req.user));
  });
  admin.put('/library/documents/:id', (req, res, next) => {
    // JSON for details only, or multipart (data + file) to replace the file as well.
    if (req.is('multipart/form-data')) {
      return fileParser({ images: false })(req, res, (err) => {
        if (err) return next(err);
        try {
          return res.json(library.updateDocument(id(req), parseData(req), req.user, uploads.saveFile(req.file)));
        } catch (e) { return next(e); }
      });
    }
    return res.json(library.updateDocument(id(req), req.body, req.user));
  });
  admin.delete('/library/documents/:id', (req, res) => {
    library.deleteDocument(id(req), req.user);
    res.json({ ok: true });
  });

  admin.use((req, res, next) => next(new HttpError(404, 'Not found.')));
  router.use('/api/admin', admin);

  // JSON errors for the API. Unexpected errors are logged but never shown in detail.
  // eslint-disable-next-line no-unused-vars
  router.use('/api', (err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, details: err.details });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid request.' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'This is too much to save at once.' });
    }
    console.error('[backend]', err);
    return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });

  return { router, db, config, siteData, translator };
}

/**
 * Put the site data into index.html so the first page view already shows the
 * edited texts (no flash of old content, no extra request). "<" is escaped so
 * edited text can never close the script tag.
 */
function injectSiteData(html, data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return html.replace('</head>', `<script>window.__AICTIG_SITE__=${json}</script></head>`);
}

module.exports = { createBackend, injectSiteData };
