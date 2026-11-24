/**
 * Messages sent through the website's contact form.
 *
 * Visitors submit to POST /api/contact; staff read them under "Messages" in
 * the dashboard. Spam protection, without annoying real visitors:
 *  - a hidden "website" field that people never see but bots fill in,
 *  - forms submitted faster than a person could type are ignored,
 *  - at most 5 messages per IP address per hour, 300 per day in total.
 * Suspected spam gets the normal "sent" response, so bots learn nothing.
 */
const { logChange } = require('./db.cjs');
const { HttpError } = require('./auth.cjs');

const TOPICS = {
  general: 'General inquiry',
  research: 'Research collaboration',
  training: 'Training & capacity building',
  partnership: 'Partnership opportunities',
  media: 'Media inquiry',
  technical: 'Technical support',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_FILL_MS = 2500;
const PER_IP_PER_HOUR = 5;
const PER_DAY_TOTAL = 300;

function createMessages(db) {
  const perIp = new Map(); // ip -> timestamps (last hour)

  function rateLimit(ip) {
    const now = Date.now();
    const recent = (perIp.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= PER_IP_PER_HOUR) {
      throw new HttpError(429, 'You have sent several messages in a short time. Please try again later.', { code: 'rate_limited' });
    }
    const today = db.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE created_at > ?').get(now - 24 * 60 * 60 * 1000).n;
    if (today >= PER_DAY_TOTAL) {
      throw new HttpError(429, 'The contact form is busy. Please try again later.', { code: 'rate_limited' });
    }
    recent.push(now);
    perIp.set(ip, recent);
  }

  /** Validate and store a message from the public form. */
  function submit(input, ip) {
    const body = input && typeof input === 'object' ? input : {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const topic = typeof body.topic === 'string' ? body.topic : '';
    const message = typeof body.message === 'string' ? body.message.replace(/\r\n/g, '\n').trim() : '';
    const lang = typeof body.lang === 'string' && /^[a-z]{2}$/.test(body.lang) ? body.lang : null;

    if (!name || name.length > 120) throw new HttpError(400, 'Please enter your name.', { field: 'name' });
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address.', { field: 'email' });
    if (!(topic in TOPICS)) throw new HttpError(400, 'Please choose a topic.', { field: 'topic' });
    if (message.length < 10 || message.length > 5000) {
      throw new HttpError(400, 'Please write a message between 10 and 5000 characters.', { field: 'message' });
    }

    // Likely spam: pretend it worked, store nothing.
    const filledTooFast = typeof body.elapsedMs === 'number' && body.elapsedMs < MIN_FILL_MS;
    if ((typeof body.website === 'string' && body.website.trim()) || filledTooFast) return;

    rateLimit(ip || 'unknown');
    db.prepare(
      'INSERT INTO contact_messages (name, email, topic, message, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(name, email, topic, message, lang, Date.now());
  }

  function toMessage(row) {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      topic: row.topic,
      topicLabel: TOPICS[row.topic] || row.topic,
      message: row.message,
      lang: row.lang,
      createdAt: row.created_at,
      readAt: row.read_at,
    };
  }

  function list() {
    return db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC, id DESC LIMIT 1000').all().map(toMessage);
  }

  function unreadCount() {
    return db.prepare('SELECT COUNT(*) AS n FROM contact_messages WHERE read_at IS NULL').get().n;
  }

  function setRead(id, read) {
    const info = db.prepare('UPDATE contact_messages SET read_at = ? WHERE id = ?').run(read ? Date.now() : null, id);
    if (!info.changes) throw new HttpError(404, 'This message no longer exists.');
    return toMessage(db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id));
  }

  function remove(id, user) {
    const row = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'This message no longer exists.');
    db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id);
    logChange(db, user, 'messages.delete', `Deleted a message from ${row.name} (${row.email})`);
  }

  return { submit, list, unreadCount, setRead, remove, TOPICS };
}

module.exports = { createMessages, TOPICS };
