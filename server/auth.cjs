/**
 * Dashboard sign-in and security.
 *
 * - Passwords are stored as bcrypt hashes (never in plain text).
 * - A successful sign-in creates a random session token, sent to the browser
 *   in an HttpOnly, SameSite=Strict cookie that page scripts cannot read and
 *   other websites cannot send. Only a SHA-256 hash of the token is stored.
 * - Sessions end after 8 hours, or after 2 hours without activity.
 * - Repeated wrong passwords lock the account for 15 minutes, and each IP
 *   address is limited to 20 sign-in attempts per 15 minutes.
 * - Every request that changes something must carry the X-AICTiG-Admin header.
 *   Browsers will not let another website add that header, which blocks
 *   cross-site request forgery (CSRF).
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'aictig_session';
const COOKIE_PATH = '/api/admin';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;
const CSRF_HEADER = 'x-aictig-admin';

// Compared against when the email is unknown, so a wrong email takes as long
// as a wrong password and does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (password.length > 200) return 'Password is too long (200 characters maximum).';
  return null;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, lastLoginAt: row.last_login_at };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[name] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function createAuth(db, config) {
  const ipAttempts = new Map(); // ip -> { count, windowStart }

  function cookie(value, maxAgeSeconds) {
    return [
      `${COOKIE_NAME}=${value}`,
      `Path=${COOKIE_PATH}`,
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${maxAgeSeconds}`,
      config.secureCookies ? 'Secure' : null,
    ].filter(Boolean).join('; ');
  }

  function checkIpLimit(ip) {
    const now = Date.now();
    const entry = ipAttempts.get(ip);
    if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
      ipAttempts.set(ip, { count: 1, windowStart: now });
      return;
    }
    entry.count += 1;
    if (entry.count > IP_MAX_ATTEMPTS) {
      throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }
  }

  /** Verify email + password; returns the user row or throws HttpError. */
  function verifyLogin(email, password, ip) {
    checkIpLimit(ip || 'unknown');
    const invalid = new HttpError(401, 'Incorrect email or password.');
    if (typeof email !== 'string' || typeof password !== 'string') throw invalid;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    if (!user) {
      bcrypt.compareSync(password, DUMMY_HASH);
      throw invalid;
    }
    const now = Date.now();
    if (user.locked_until && user.locked_until > now) {
      const minutes = Math.ceil((user.locked_until - now) / 60000);
      throw new HttpError(423, `This account is temporarily locked after too many wrong passwords. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? now + LOCK_MS : null;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(lock ? 0 : failed, lock, user.id);
      if (lock) {
        throw new HttpError(423, 'Too many wrong passwords. This account is locked for 15 minutes.');
      }
      throw invalid;
    }
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?')
      .run(now, user.id);
    return { ...user, last_login_at: now };
  }

  /** Create a session for the user and set the cookie on the response. */
  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(hashToken(token), userId, now, now, now + SESSION_MAX_AGE_MS);
    // Housekeeping: drop expired sessions.
    db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?')
      .run(now, now - SESSION_IDLE_MS);
    res.setHeader('Set-Cookie', cookie(token, SESSION_MAX_AGE_MS / 1000));
  }

  function endSession(req, res) {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    res.setHeader('Set-Cookie', cookie('', 0));
  }

  /** Middleware: only signed-in users may continue. Sets req.user. */
  function requireAuth(req, res, next) {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token) return next(new HttpError(401, 'Please sign in.'));
    const tokenHash = hashToken(token);
    const row = db.prepare(
      `SELECT s.*, u.id AS uid, u.name, u.email, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    ).get(tokenHash);
    const now = Date.now();
    if (!row || row.expires_at < now || row.last_seen_at < now - SESSION_IDLE_MS) {
      if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      res.setHeader('Set-Cookie', cookie('', 0));
      return next(new HttpError(401, 'Your session has ended. Please sign in again.'));
    }
    if (now - row.last_seen_at > 60 * 1000) {
      db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now, tokenHash);
    }
    req.user = { id: row.uid, name: row.name, email: row.email, lastLoginAt: row.last_login_at };
    req.sessionTokenHash = tokenHash;
    return next();
  }

  /** Middleware: block cross-site requests on anything that changes data. */
  function csrfGuard(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const site = req.headers['sec-fetch-site'];
    if (req.headers[CSRF_HEADER] !== '1' || (site && site !== 'same-origin')) {
      return next(new HttpError(403, 'Request blocked for security reasons. Please reload the page.'));
    }
    return next();
  }

  return { verifyLogin, startSession, endSession, requireAuth, csrfGuard };
}

/** Create a dashboard user (used by the dashboard and scripts/create-admin.cjs). */
function createUser(db, { name, email, password }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (!cleanName || cleanName.length > 100) throw new HttpError(400, 'Please enter a name (up to 100 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }
  const problem = validatePassword(password);
  if (problem) throw new HttpError(400, problem);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(cleanEmail)) {
    throw new HttpError(409, 'A user with this email address already exists.');
  }
  const info = db.prepare(
    'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).run(cleanEmail, cleanName, hashPassword(password), Date.now());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = {
  createAuth,
  createUser,
  hashPassword,
  validatePassword,
  publicUser,
  HttpError,
  COOKIE_NAME,
  CSRF_HEADER,
};
