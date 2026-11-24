/**
 * Site-wide settings edited under "Contact details" in the dashboard:
 * the social media links (header and footer icons) and the contact email
 * addresses shown in the footer.
 */
const { logChange } = require('./db.cjs');
const { HttpError } = require('./auth.cjs');

const SOCIAL_NETWORKS = ['facebook', 'linkedin', 'x', 'instagram', 'whatsapp'];

// Values used until something is saved in the dashboard (what the site showed before).
const DEFAULTS = {
  socialLinks: {
    facebook: 'https://facebook.com/aictig',
    linkedin: 'https://linkedin.com/company/aictig',
    x: 'https://x.com/aictig',
    instagram: 'https://instagram.com/aictig',
    whatsapp: 'https://wa.me/0000000000',
  },
  contactEmails: ['africtig@gmail.com', 'info@AICTiG.org'],
  // Automatic translation (dashboard → Translation). Not sent to the public site.
  translation: {
    enabled: true,
    // Sent to MyMemory with each request: raises the free limit from 5,000 to 50,000 characters a day.
    email: '',
    // Words and names that must never be translated.
    keepTerms: ['AICTiG'],
  },
};

/** Settings the public website needs (sent to every visitor). */
const PUBLIC_KEYS = ['socialLinks', 'contactEmails'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSocialLinks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid social links.');
  const out = {};
  for (const network of SOCIAL_NETWORKS) {
    const raw = value[network];
    const url = typeof raw === 'string' ? raw.trim() : '';
    if (url && (!/^https:\/\/[^\s]+$/i.test(url) || url.length > 300)) {
      throw new HttpError(400, `The ${network === 'x' ? 'X (Twitter)' : network} link must be a full web address starting with https://`, { key: network });
    }
    out[network] = url; // empty = icon hidden
  }
  return out;
}

function validateEmails(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Invalid email list.');
  const emails = value.map((e) => (typeof e === 'string' ? e.trim() : '')).filter(Boolean);
  if (emails.length > 5) throw new HttpError(400, 'You can show up to 5 email addresses.');
  for (const email of emails) {
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, `“${email}” is not a valid email address.`);
  }
  return emails;
}

function validateTranslation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid translation settings.');
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  if (email && (!EMAIL_RE.test(email) || email.length > 254)) {
    throw new HttpError(400, `“${email}” is not a valid email address.`, { key: 'email' });
  }
  const terms = Array.isArray(value.keepTerms) ? value.keepTerms : [];
  const keepTerms = [...new Set(terms.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))];
  if (keepTerms.length > 200) throw new HttpError(400, 'The list of protected words is too long (200 maximum).');
  for (const term of keepTerms) {
    if (term.length > 100) throw new HttpError(400, `“${term.slice(0, 30)}…” is too long to be a protected word (100 characters maximum).`);
  }
  return { enabled: value.enabled !== false, email, keepTerms };
}

const VALIDATORS = { socialLinks: validateSocialLinks, contactEmails: validateEmails, translation: validateTranslation };
const LABELS = { socialLinks: 'social media links', contactEmails: 'contact email addresses', translation: 'translation settings' };

function createSettings(db) {
  let cache = null;

  function all() {
    if (!cache) {
      cache = { ...DEFAULTS };
      for (const row of db.prepare('SELECT key, value FROM settings').all()) {
        if (row.key in DEFAULTS) cache[row.key] = JSON.parse(row.value);
      }
    }
    return cache;
  }

  function save(changes, user) {
    if (!changes || typeof changes !== 'object') throw new HttpError(400, 'Nothing to save.');
    const keys = Object.keys(changes).filter((k) => k in VALIDATORS);
    if (!keys.length) throw new HttpError(400, 'Nothing to save.');
    const validated = keys.map((k) => [k, VALIDATORS[k](changes[k])]);
    const current = all();
    const now = Date.now();
    db.transaction(() => {
      for (const [key, value] of validated) {
        if (JSON.stringify(current[key]) === JSON.stringify(value)) continue;
        db.prepare(
          `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        ).run(key, JSON.stringify(value), now, user.id);
        logChange(db, user, 'settings.update', `Changed ${LABELS[key]}`, { key, before: current[key], after: value });
      }
    })();
    cache = null;
    return all();
  }

  function publicSettings() {
    const current = all();
    return Object.fromEntries(PUBLIC_KEYS.map((k) => [k, current[k]]));
  }

  return { all, save, publicSettings };
}

module.exports = { createSettings, SOCIAL_NETWORKS, DEFAULTS };
