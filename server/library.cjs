/**
 * News, publications and repository documents added in the dashboard.
 *
 * These are stored in SQLite (tables posts and documents) with their files in
 * the uploads folder. The older items that were published through WordPress
 * stay in WordPress: the website still reads them from there and shows both
 * together (see src/utils/content.ts). Nothing here writes to WordPress.
 */
const fs = require('fs');
const path = require('path');
const { logChange } = require('./db.cjs');
const { HttpError } = require('./auth.cjs');

const PUBLICATION_TYPES = ['Journal article', 'Book', 'Book chapter', 'Policy brief', 'Report', 'Conference paper', 'Other'];
const KIND_LABEL = { news: 'news article', publications: 'publication' };

function loadPlaces(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'shared', 'places.json'), 'utf8'));
}

function slugify(text) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'item';
}

/** Defence in depth: the dashboard editor already cleans HTML; strip anything executable. */
function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|meta|link)\b[\s\S]*?(<\s*\/\s*\1\s*>|\/?>)/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1="#"');
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v, max = 30) => (Array.isArray(v) ? v : []).map(str).filter(Boolean).slice(0, max);
const uploadUrl = (v, field) => {
  const url = str(v);
  if (url && !/^\/uploads\/[\w./-]+$/.test(url)) throw new HttpError(400, 'Please upload the file again.', { field });
  return url;
};
const today = () => new Date().toISOString().slice(0, 10);

function createLibrary(db, config) {
  const places = loadPlaces(config.root);
  const countryNames = new Set(places.countries.map((c) => c.name));
  const orgKeys = new Set(places.organizations.map((o) => o.key));
  const langCodes = new Set(places.languages.map((l) => l.code));

  // ── News and publications ──────────────────────────────────────
  function assertKind(kind) {
    if (!KIND_LABEL[kind]) throw new HttpError(404, 'Unknown content type.');
  }

  function toPost(row) {
    return {
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      content: row.content,
      image: row.image,
      tags: JSON.parse(row.tags),
      type: row.pub_type,
      authors: JSON.parse(row.authors),
      fileUrl: row.file_url,
      status: row.status,
      date: row.published_at,
      updatedAt: row.updated_at,
    };
  }

  function uniqueSlug(kind, title, exceptId) {
    const base = slugify(title);
    for (let n = 1; ; n += 1) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const row = db.prepare('SELECT id FROM posts WHERE kind = ? AND slug = ?').get(kind, slug);
      if (!row || row.id === exceptId) return slug;
    }
  }

  function validatePost(kind, input) {
    const body = input && typeof input === 'object' ? input : {};
    const title = str(body.title);
    if (!title || title.length > 300) throw new HttpError(400, 'Please enter a title (up to 300 characters).', { field: 'title' });
    const excerpt = str(body.excerpt);
    if (excerpt.length > 1000) throw new HttpError(400, 'The summary is too long (1000 characters maximum).', { field: 'excerpt' });
    const content = sanitizeHtml(body.content);
    if (content.length > 300000) throw new HttpError(400, 'The text is too long.', { field: 'content' });
    const date = str(body.date) || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Please choose a valid date.', { field: 'date' });
    const type = kind === 'publications' ? str(body.type) : '';
    if (type && !PUBLICATION_TYPES.includes(type)) throw new HttpError(400, 'Unknown type of publication.', { field: 'type' });
    return {
      title,
      excerpt,
      content,
      date,
      type,
      image: uploadUrl(body.image, 'image'),
      fileUrl: kind === 'publications' ? uploadUrl(body.fileUrl, 'fileUrl') : '',
      tags: list(body.tags, 20),
      authors: kind === 'publications' ? list(body.authors, 20) : [],
      status: body.status === 'draft' ? 'draft' : 'published',
    };
  }

  function listPosts(kind, { publishedOnly = false } = {}) {
    assertKind(kind);
    return db.prepare(
      `SELECT * FROM posts WHERE kind = ? ${publishedOnly ? "AND status = 'published'" : ''} ORDER BY published_at DESC, id DESC`,
    ).all(kind).map(toPost);
  }

  function getPost(kind, id) {
    assertKind(kind);
    const row = db.prepare('SELECT * FROM posts WHERE kind = ? AND id = ?').get(kind, id);
    if (!row) throw new HttpError(404, `This ${KIND_LABEL[kind]} no longer exists.`);
    return toPost(row);
  }

  function getPublishedBySlug(kind, slug) {
    assertKind(kind);
    const row = db.prepare("SELECT * FROM posts WHERE kind = ? AND slug = ? AND status = 'published'").get(kind, slug);
    if (!row) throw new HttpError(404, 'Not found.');
    return toPost(row);
  }

  function savePost(kind, id, input, user) {
    assertKind(kind);
    const v = validatePost(kind, input);
    const now = Date.now();
    const existing = id ? getPost(kind, id) : null;
    const slug = existing && existing.title === v.title ? existing.slug : uniqueSlug(kind, v.title, id);
    const values = [slug, v.title, v.excerpt, v.content, v.image, JSON.stringify(v.tags), v.type,
      JSON.stringify(v.authors), v.fileUrl, v.status, v.date, now, user.id];
    let postId = id;
    if (existing) {
      db.prepare(`UPDATE posts SET slug = ?, title = ?, excerpt = ?, content = ?, image = ?, tags = ?, pub_type = ?,
                  authors = ?, file_url = ?, status = ?, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
        .run(...values, id);
    } else {
      postId = db.prepare(`INSERT INTO posts (slug, title, excerpt, content, image, tags, pub_type, authors, file_url,
                  status, published_at, updated_at, updated_by, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(...values, kind, now).lastInsertRowid;
    }
    logChange(db, user, `${kind}.${existing ? 'update' : 'create'}`,
      `${existing ? 'Updated' : 'Added'} the ${KIND_LABEL[kind]} “${v.title}”${v.status === 'draft' ? ' (draft)' : ''}`);
    return getPost(kind, postId);
  }

  function deletePost(kind, id, user) {
    const post = getPost(kind, id);
    db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    logChange(db, user, `${kind}.delete`, `Deleted the ${KIND_LABEL[kind]} “${post.title}”`);
  }

  // ── Repository documents ───────────────────────────────────────
  function toDocument(row) {
    return {
      id: row.id,
      title: row.title,
      summary: row.summary,
      fileUrl: row.file_url,
      fileName: row.file_name,
      fileSize: row.file_size,
      mime: row.mime,
      year: row.year,
      country: row.country,
      organization: row.organization,
      languages: JSON.parse(row.languages),
      themes: JSON.parse(row.themes),
      hidden: !!row.hidden,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function validateDocument(input) {
    const body = input && typeof input === 'object' ? input : {};
    const title = str(body.title);
    if (!title || title.length > 300) throw new HttpError(400, 'Please enter a title (up to 300 characters).', { field: 'title' });
    const summary = str(body.summary);
    if (summary.length > 3000) throw new HttpError(400, 'The summary is too long (3000 characters maximum).', { field: 'summary' });
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 5) {
      throw new HttpError(400, 'Please choose the year of the document.', { field: 'year' });
    }
    const country = str(body.country);
    const organization = str(body.organization);
    if (country && !countryNames.has(country)) throw new HttpError(400, 'Please choose a country from the list.', { field: 'country' });
    if (organization && !orgKeys.has(organization)) throw new HttpError(400, 'Please choose an organisation from the list.', { field: 'organization' });
    if (!country && !organization) throw new HttpError(400, 'Please choose a country, or a region or organisation.', { field: 'country' });
    const languages = list(body.languages, 15).filter((code) => langCodes.has(code));
    if (!languages.length) throw new HttpError(400, 'Please choose at least one language.', { field: 'languages' });
    const themes = list(body.themes, 30).map((t) => t.slice(0, 80));
    return { title, summary, year, country, organization, languages, themes, hidden: body.hidden === true };
  }

  function listDocuments({ visibleOnly = false } = {}) {
    return db.prepare(`SELECT * FROM documents ${visibleOnly ? 'WHERE hidden = 0' : ''} ORDER BY year DESC, id DESC`)
      .all().map(toDocument);
  }

  function getDocument(id, { visibleOnly = false } = {}) {
    const row = db.prepare(`SELECT * FROM documents WHERE id = ? ${visibleOnly ? 'AND hidden = 0' : ''}`).get(id);
    if (!row) throw new HttpError(404, 'This document no longer exists.');
    return toDocument(row);
  }

  function createDocument(file, input, user) {
    const v = validateDocument(input);
    const now = Date.now();
    const id = db.prepare(`INSERT INTO documents (title, summary, file_url, file_name, file_size, mime, year, country,
                organization, languages, themes, hidden, created_at, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(v.title, v.summary, file.url, file.name, file.size, file.mime, v.year, v.country, v.organization,
        JSON.stringify(v.languages), JSON.stringify(v.themes), v.hidden ? 1 : 0, now, now, user.id).lastInsertRowid;
    logChange(db, user, 'documents.create', `Added the repository document “${v.title}”`);
    return getDocument(id);
  }

  function updateDocument(id, input, user, file = null) {
    const existing = getDocument(id);
    const v = validateDocument(input);
    db.prepare(`UPDATE documents SET title = ?, summary = ?, year = ?, country = ?, organization = ?, languages = ?,
                themes = ?, hidden = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(v.title, v.summary, v.year, v.country, v.organization, JSON.stringify(v.languages), JSON.stringify(v.themes),
        v.hidden ? 1 : 0, Date.now(), user.id, id);
    if (file) {
      db.prepare('UPDATE documents SET file_url = ?, file_name = ?, file_size = ?, mime = ? WHERE id = ?')
        .run(file.url, file.name, file.size, file.mime, id);
    }
    const what = existing.hidden !== v.hidden ? (v.hidden ? ' and hid it from the website' : ' and made it visible') : '';
    logChange(db, user, 'documents.update', `Updated the repository document “${v.title}”${file ? ' (new file)' : ''}${what}`);
    return getDocument(id);
  }

  function deleteDocument(id, user) {
    const doc = getDocument(id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    logChange(db, user, 'documents.delete', `Deleted the repository document “${doc.title}”`);
  }

  function counts() {
    const row = (sql) => db.prepare(sql).get().n;
    return {
      news: row("SELECT COUNT(*) AS n FROM posts WHERE kind = 'news'"),
      publications: row("SELECT COUNT(*) AS n FROM posts WHERE kind = 'publications'"),
      documents: row('SELECT COUNT(*) AS n FROM documents'),
    };
  }

  return {
    places,
    PUBLICATION_TYPES,
    listPosts, getPost, getPublishedBySlug, savePost, deletePost,
    listDocuments, getDocument, createDocument, updateDocument, deleteDocument, validateDocument,
    counts,
  };
}

module.exports = { createLibrary, sanitizeHtml, slugify, PUBLICATION_TYPES };
