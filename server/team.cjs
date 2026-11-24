/**
 * Team members (the experts shown on the About page and their profile pages).
 *
 * On first start-up the table is filled from shared/team.json, the profiles
 * that were previously written into the code. After that the dashboard is
 * the only source: deleting everyone does not bring the originals back.
 */
const fs = require('fs');
const path = require('path');
const { logChange } = require('./db.cjs');
const { HttpError } = require('./auth.cjs');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIST_FIELDS = {
  bio: { label: 'Biography', maxItems: 30, maxLength: 5000 },
  expertise: { label: 'Areas of expertise', maxItems: 40, maxLength: 200 },
  regionalFocus: { label: 'Regional focus', maxItems: 20, maxLength: 100 },
  projects: { label: 'Projects', maxItems: 200, maxLength: 2000 },
  publications: { label: 'Publications', maxItems: 300, maxLength: 2000 },
  conferences: { label: 'Conferences and presentations', maxItems: 300, maxLength: 2000 },
};

function slugify(name) {
  return name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'member';
}

function text(value, label, { required = false, max = 200 } = {}) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (required && !clean) throw new HttpError(400, `Please fill in “${label}”.`, { field: label });
  if (clean.length > max) throw new HttpError(400, `“${label}” is too long (maximum ${max} characters).`, { field: label });
  return clean;
}

function url(value, label) {
  const clean = text(value, label, { max: 500 });
  if (clean && !/^https:\/\/\S+$/i.test(clean)) {
    throw new HttpError(400, `“${label}” must be a full web address starting with https://`, { field: label });
  }
  return clean;
}

function list(value, key) {
  const { label, maxItems, maxLength } = LIST_FIELDS[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, `Invalid list: ${label}.`);
  const items = value.map((v) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '')).filter(Boolean);
  if (items.length > maxItems) throw new HttpError(400, `“${label}” has too many entries (maximum ${maxItems}).`);
  for (const item of items) {
    if (item.length > maxLength) throw new HttpError(400, `An entry in “${label}” is too long (maximum ${maxLength} characters).`);
  }
  return items;
}

/** Check and clean a team member submitted from the dashboard. */
function validateMember(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Invalid team member.');
  const email = text(input.email, 'Email', { max: 254 });
  if (email && !EMAIL_RE.test(email)) throw new HttpError(400, '“Email” is not a valid email address.', { field: 'Email' });
  const photo = text(input.photo, 'Photo', { max: 300 });
  if (photo && !/^\/(uploads|team)\/[\w.-]+\.(jpe?g|png|webp)$/i.test(photo)) {
    throw new HttpError(400, 'Please upload the photo again.', { field: 'Photo' });
  }
  const member = {
    name: text(input.name, 'Full name', { required: true, max: 120 }),
    role: text(input.role, 'Role / title', { required: true, max: 120 }),
    photo,
    summary: text(input.summary, 'Short summary', { required: true, max: 400 }),
    email,
    linkedin: url(input.linkedin, 'LinkedIn link'),
    googleScholar: url(input.googleScholar, 'Google Scholar link'),
  };
  for (const key of Object.keys(LIST_FIELDS)) member[key] = list(input[key], key);
  if (!member.bio.length) throw new HttpError(400, 'Please write a biography.', { field: 'Biography' });
  return member;
}

function createTeam(db, config) {
  function rowToMember(row) {
    return { id: row.id, slug: row.slug, published: !!row.published, position: row.position, ...JSON.parse(row.data) };
  }

  function seedIfEmpty() {
    const seeded = db.prepare("SELECT 1 FROM settings WHERE key = 'system.teamSeeded'").get();
    if (seeded) return;
    const file = path.join(config.root, 'shared', 'team.json');
    const people = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const now = Date.now();
    db.transaction(() => {
      people.forEach((person, i) => {
        const { slug, ...data } = person;
        db.prepare('INSERT INTO team_members (slug, position, published, data, updated_at) VALUES (?, ?, 1, ?, ?)')
          .run(slug, i, JSON.stringify(validateMember(data)), now);
      });
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('system.teamSeeded', 'true', ?)").run(now);
    })();
  }

  function uniqueSlug(name, exceptId) {
    const base = slugify(name);
    let slug = base;
    for (let n = 2; ; n += 1) {
      const row = db.prepare('SELECT id FROM team_members WHERE slug = ?').get(slug);
      if (!row || row.id === exceptId) return slug;
      slug = `${base}-${n}`;
    }
  }

  function list({ publishedOnly = false } = {}) {
    const rows = db.prepare(
      `SELECT * FROM team_members ${publishedOnly ? 'WHERE published = 1' : ''} ORDER BY position, id`,
    ).all();
    return rows.map(rowToMember);
  }

  function get(id) {
    const row = db.prepare('SELECT * FROM team_members WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'This team member no longer exists.');
    return rowToMember(row);
  }

  function create(input, user) {
    const member = validateMember(input);
    const slug = uniqueSlug(member.name);
    const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM team_members').get().p;
    const published = input.published === false ? 0 : 1;
    const info = db.prepare(
      'INSERT INTO team_members (slug, position, published, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(slug, position, published, JSON.stringify(member), Date.now(), user.id);
    logChange(db, user, 'team.create', `Added team member ${member.name}`);
    return get(info.lastInsertRowid);
  }

  function update(id, input, user) {
    const existing = get(id);
    const member = validateMember(input);
    const slug = member.name === existing.name ? existing.slug : uniqueSlug(member.name, id);
    const published = input.published === false ? 0 : 1;
    db.prepare('UPDATE team_members SET slug = ?, published = ?, data = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(slug, published, JSON.stringify(member), Date.now(), user.id, id);
    const visibility = existing.published !== !!published ? (published ? ' and made it visible' : ' and hid it from the website') : '';
    logChange(db, user, 'team.update', `Updated the profile of ${member.name}${visibility}`);
    return get(id);
  }

  function remove(id, user) {
    const existing = get(id);
    db.prepare('DELETE FROM team_members WHERE id = ?').run(id);
    logChange(db, user, 'team.delete', `Removed team member ${existing.name}`);
  }

  function reorder(ids, user) {
    if (!Array.isArray(ids)) throw new HttpError(400, 'Invalid order.');
    const all = list();
    if (ids.length !== all.length || !all.every((m) => ids.includes(m.id))) {
      throw new HttpError(409, 'The team list changed in the meantime. Please reload the page.');
    }
    const stmt = db.prepare('UPDATE team_members SET position = ? WHERE id = ?');
    db.transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
    logChange(db, user, 'team.reorder', 'Changed the order of team members');
    return list();
  }

  seedIfEmpty();
  return { list, get, create, update, remove, reorder };
}

module.exports = { createTeam, slugify, validateMember };
