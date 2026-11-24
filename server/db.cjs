/**
 * SQLite database: opening, and schema migrations.
 *
 * Migrations run automatically on start-up. Each entry in MIGRATIONS runs
 * exactly once, in order; the number already applied is stored in SQLite's
 * built-in `user_version`. To change the schema, append a new entry — never
 * edit one that has already shipped.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MIGRATIONS = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id             INTEGER PRIMARY KEY,
    email          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name           TEXT    NOT NULL,
    password_hash  TEXT    NOT NULL,
    failed_logins  INTEGER NOT NULL DEFAULT 0,
    locked_until   INTEGER,
    last_login_at  INTEGER,
    created_at     INTEGER NOT NULL
  );

  -- Only a SHA-256 hash of each session token is stored, so a copy of the
  -- database cannot be used to take over a logged-in session.
  CREATE TABLE sessions (
    token_hash    TEXT    PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER NOT NULL,
    expires_at    INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Website texts changed in the dashboard. Each row replaces one built-in
  -- text (an i18n key such as "home:hero.title") for one language.
  CREATE TABLE content_overrides (
    lang        TEXT    NOT NULL,
    key         TEXT    NOT NULL,
    value       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (lang, key)
  );

  -- Small site-wide settings (social links, contact emails), stored as JSON.
  CREATE TABLE settings (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE team_members (
    id          INTEGER PRIMARY KEY,
    slug        TEXT    NOT NULL UNIQUE,
    position    INTEGER NOT NULL,
    published   INTEGER NOT NULL DEFAULT 1,
    data        TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL,
    updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  -- Record of every change made in the dashboard ("Change history").
  CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name   TEXT,
    action      TEXT    NOT NULL,
    summary     TEXT    NOT NULL,
    details     TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX audit_log_created ON audit_log(created_at);
  `,

  // 2: automatic translations + contact form messages
  `
  -- 'manual' = typed in the dashboard; 'auto' = translated automatically from
  -- English. Automatic translations are replaced whenever the English text
  -- changes; manual ones are never overwritten.
  ALTER TABLE content_overrides ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

  -- Messages sent through the website's contact form ("Messages" in the dashboard).
  CREATE TABLE contact_messages (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    topic       TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    lang        TEXT,
    created_at  INTEGER NOT NULL,
    read_at     INTEGER
  );
  CREATE INDEX contact_messages_created ON contact_messages(created_at);
  `,

  // 3: free machine translation (MyMemory) bookkeeping
  `
  -- For automatic translations: the English text they were made from, so the
  -- server knows when a translation is out of date.
  ALTER TABLE content_overrides ADD COLUMN translated_from TEXT;

  -- Sentence-level memory: a sentence already translated is never sent again
  -- (saves the free daily allowance when one sentence of a paragraph changes).
  CREATE TABLE translation_cache (
    lang        TEXT    NOT NULL,
    source      TEXT    NOT NULL,
    text        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (lang, source)
  );

  -- Characters sent to the translation service per day (UTC).
  CREATE TABLE translation_usage (
    day    TEXT    PRIMARY KEY,
    chars  INTEGER NOT NULL
  );
  `,

  // 4: news, publications and repository documents added in the dashboard.
  // (Older items stay in WordPress and are still read from there.)
  `
  CREATE TABLE posts (
    id            INTEGER PRIMARY KEY,
    kind          TEXT    NOT NULL CHECK (kind IN ('news', 'publications')),
    slug          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    excerpt       TEXT    NOT NULL DEFAULT '',
    content       TEXT    NOT NULL DEFAULT '',   -- HTML from the dashboard editor
    image         TEXT    NOT NULL DEFAULT '',   -- /uploads/... picture
    tags          TEXT    NOT NULL DEFAULT '[]', -- JSON array
    pub_type      TEXT    NOT NULL DEFAULT '',   -- publications: Journal article, Report, ...
    authors       TEXT    NOT NULL DEFAULT '[]', -- publications: JSON array of names
    file_url      TEXT    NOT NULL DEFAULT '',   -- publications: optional PDF
    status        TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft')),
    published_at  TEXT    NOT NULL,              -- YYYY-MM-DD
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (kind, slug)
  );
  CREATE INDEX posts_kind_date ON posts(kind, published_at);

  CREATE TABLE documents (
    id            INTEGER PRIMARY KEY,
    title         TEXT    NOT NULL,
    summary       TEXT    NOT NULL DEFAULT '',
    file_url      TEXT    NOT NULL,
    file_name     TEXT    NOT NULL,
    file_size     INTEGER NOT NULL,
    mime          TEXT    NOT NULL,
    year          INTEGER NOT NULL,
    country       TEXT    NOT NULL DEFAULT '',   -- country name (national documents)
    organization  TEXT    NOT NULL DEFAULT '',   -- organisation key, e.g. 'ecowas' (regional/continental/international)
    languages     TEXT    NOT NULL DEFAULT '["en"]', -- JSON array of language codes
    themes        TEXT    NOT NULL DEFAULT '[]', -- JSON array
    hidden        INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  `,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let i = current; i < MIGRATIONS.length; i += 1) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
}

function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Add an entry to the change history. */
function logChange(db, user, action, summary, details) {
  db.prepare(
    `INSERT INTO audit_log (user_id, user_name, action, summary, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(user ? user.id : null, user ? user.name : null, action, summary,
    details === undefined ? null : JSON.stringify(details), Date.now());
}

module.exports = { openDatabase, logChange };
