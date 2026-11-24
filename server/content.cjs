/**
 * Editable website texts.
 *
 * shared/content-schema.json lists every text the dashboard can change, grouped
 * by page and section. Each text is identified by its translation key (for
 * example "home:hero.title") and has one value per language.
 *
 * The original wording comes from the translation files in
 * src/i18n/locales/<lang>/<namespace>.json. A change made in the dashboard is
 * stored in the content_overrides table and replaces the original for that
 * language only. Restoring the original simply deletes the override.
 */
const fs = require('fs');
const path = require('path');
const { logChange } = require('./db.cjs');
const { HttpError } = require('./auth.cjs');

const SINGLE_LINE_MAX = 300;
const MULTI_LINE_MAX = 5000;

function loadSchema(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'shared', 'content-schema.json'), 'utf8'));
}

function lookup(obj, dottedPath) {
  return dottedPath.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);
}

function createContent(db, config) {
  const schema = loadSchema(config.root);
  const languages = schema.languages.map((l) => l.code);

  // key -> { field, page, section }
  const fields = new Map();
  for (const page of schema.pages) {
    for (const section of page.sections) {
      for (const field of section.fields) fields.set(field.key, { field, page, section });
    }
  }

  // Original texts, read once from the translation files.
  const localeCache = new Map();
  function localeFile(lang, ns) {
    const id = `${lang}/${ns}`;
    if (!localeCache.has(id)) {
      const file = path.join(config.root, 'src', 'i18n', 'locales', lang, `${ns}.json`);
      localeCache.set(id, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
    }
    return localeCache.get(id);
  }

  /** The built-in text for a key; falls back to English like the website does. */
  function originalText(lang, key) {
    const [ns, dotted] = key.split(':');
    const own = lookup(localeFile(lang, ns), dotted);
    if (typeof own === 'string') return own;
    const en = lookup(localeFile('en', ns), dotted);
    return typeof en === 'string' ? en : '';
  }

  // Overrides change rarely and are read on every page view: cache them.
  let overridesCache = null;
  function allOverrides() {
    if (!overridesCache) {
      overridesCache = {};
      for (const row of db.prepare('SELECT lang, key, value FROM content_overrides').all()) {
        if (!fields.has(row.key)) continue; // a text that was removed from the schema
        (overridesCache[row.lang] ||= {})[row.key] = row.value;
      }
    }
    return overridesCache;
  }

  function assertLanguage(lang) {
    if (!languages.includes(lang)) throw new HttpError(404, 'Unknown language.');
  }

  /** Everything the editor needs for one language. */
  function valuesFor(lang) {
    assertLanguage(lang);
    const rows = db.prepare(
      `SELECT o.key, o.value, o.source, o.updated_at, u.name AS updated_by_name
       FROM content_overrides o LEFT JOIN users u ON u.id = o.updated_by WHERE o.lang = ?`,
    ).all(lang);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const values = {};
    for (const key of fields.keys()) {
      const row = byKey.get(key);
      values[key] = {
        original: originalText(lang, key),
        override: row ? row.value : null,
        source: row ? row.source : null,
        updatedAt: row ? row.updated_at : null,
        updatedBy: row ? row.updated_by_name : null,
      };
    }
    return values;
  }

  // ── Helpers for automatic translation (server/translate.cjs) ──────

  function currentText(lang, key) {
    const row = db.prepare('SELECT value FROM content_overrides WHERE lang = ? AND key = ?').get(lang, key);
    return row ? row.value : originalText(lang, key);
  }

  function hasManualOverride(lang, key) {
    return !!db.prepare("SELECT 1 FROM content_overrides WHERE lang = ? AND key = ? AND source = 'manual'").get(lang, key);
  }

  function isMultiline(key) {
    return !!(fields.get(key) && fields.get(key).field.multiline);
  }

  function maxLength(key) {
    const field = fields.get(key) && fields.get(key).field;
    return (field && field.maxLength) || (field && field.multiline ? MULTI_LINE_MAX : SINGLE_LINE_MAX);
  }

  /**
   * Store an automatic translation of `translatedFrom` (the English text),
   * unless someone edited this text by hand in that language meanwhile.
   */
  function setAuto(lang, key, text, translatedFrom) {
    if (!fields.has(key) || lang === 'en') return false;
    const info = db.prepare(
      `INSERT INTO content_overrides (lang, key, value, source, translated_from, updated_at, updated_by)
       VALUES (?, ?, ?, 'auto', ?, ?, NULL)
       ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value, source = 'auto',
         translated_from = excluded.translated_from, updated_at = excluded.updated_at, updated_by = NULL
       WHERE content_overrides.source = 'auto'`,
    ).run(lang, key, text, translatedFrom ?? null, Date.now());
    overridesCache = null;
    return info.changes > 0;
  }

  /** The automatic translation stored for a text, if any. */
  function autoTranslation(lang, key) {
    return db.prepare(
      "SELECT value, translated_from FROM content_overrides WHERE lang = ? AND key = ? AND source = 'auto'",
    ).get(lang, key) || null;
  }

  /** English texts that were changed in the dashboard: key -> English text. */
  function editedEnglish() {
    const out = new Map();
    for (const row of db.prepare("SELECT key, value FROM content_overrides WHERE lang = 'en'").all()) {
      if (fields.has(row.key)) out.set(row.key, row.value);
    }
    return out;
  }

  /** How a field should be handled by automatic translation ('copy' = use the English as-is). */
  function translateMode(key) {
    const field = fields.get(key) && fields.get(key).field;
    return field && field.translate === 'copy' ? 'copy' : 'translate';
  }

  /** Remove automatic translations of these keys (all languages go back to their original text). */
  function removeAuto(keys) {
    const stmt = db.prepare("DELETE FROM content_overrides WHERE key = ? AND source = 'auto'");
    db.transaction(() => keys.forEach((key) => stmt.run(key)))();
    overridesCache = null;
  }

  function validate(key, value) {
    const meta = fields.get(key);
    if (!meta) throw new HttpError(400, `Unknown text: ${key}`);
    if (value === null) return null; // restore original
    if (typeof value !== 'string') throw new HttpError(400, `“${meta.field.label}” must be text.`);
    const clean = value.replace(/\r\n/g, '\n').trim();
    const max = meta.field.maxLength || (meta.field.multiline ? MULTI_LINE_MAX : SINGLE_LINE_MAX);
    if (!clean) {
      throw new HttpError(400, `“${meta.field.label}” cannot be empty. To go back to the original wording, use “Restore original”.`, { key });
    }
    if (clean.length > max) {
      throw new HttpError(400, `“${meta.field.label}” is too long (${clean.length} characters, maximum ${max}).`, { key });
    }
    if (!meta.field.multiline && clean.includes('\n')) {
      throw new HttpError(400, `“${meta.field.label}” must be a single line.`, { key });
    }
    if (key === 'common:footer.copyright' && !clean.includes('{{year}}')) {
      throw new HttpError(400, 'The copyright line must still contain {{year}}.', { key });
    }
    return clean;
  }

  /**
   * Apply a batch of changes for one language. `changes` maps key -> new text,
   * or null to restore the original. Saving the original wording again also
   * removes the override. All-or-nothing: one invalid field rejects the batch.
   */
  function save(lang, changes, user) {
    assertLanguage(lang);
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw new HttpError(400, 'Nothing to save.');
    }
    const entries = Object.entries(changes);
    if (entries.length === 0) throw new HttpError(400, 'Nothing to save.');
    if (entries.length > fields.size) throw new HttpError(400, 'Too many changes in one request.');

    const prepared = entries.map(([key, value]) => {
      const clean = validate(key, value);
      const original = originalText(lang, key);
      return { key, value: clean === null || clean === original ? null : clean, original };
    });

    const now = Date.now();
    const get = db.prepare('SELECT value FROM content_overrides WHERE lang = ? AND key = ?');
    const upsert = db.prepare(
      `INSERT INTO content_overrides (lang, key, value, source, updated_at, updated_by) VALUES (?, ?, ?, 'manual', ?, ?)
       ON CONFLICT(lang, key) DO UPDATE SET value = excluded.value, source = 'manual', updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    );
    const remove = db.prepare('DELETE FROM content_overrides WHERE lang = ? AND key = ?');

    const details = [];
    db.transaction(() => {
      for (const { key, value, original } of prepared) {
        const before = get.get(lang, key);
        const beforeText = before ? before.value : original;
        const afterText = value === null ? original : value;
        if (beforeText === afterText && (value === null) === !before) continue;
        if (value === null) remove.run(lang, key);
        else upsert.run(lang, key, value, now, user.id);
        details.push({ key, label: fields.get(key).field.label, before: beforeText, after: afterText, restored: value === null });
      }
      if (details.length) {
        const pages = [...new Set(details.map((d) => fields.get(d.key).page.label))];
        const langName = schema.languages.find((l) => l.code === lang).name;
        logChange(db, user, 'content.update',
          `Changed ${details.length} text${details.length === 1 ? '' : 's'} on ${pages.join(', ')} (${langName})`,
          { lang, changes: details });
      }
    })();
    overridesCache = null;
    if (lang === 'en' && details.length && onEnglishChanged) {
      onEnglishChanged(details.map((d) => ({ key: d.key, restored: d.restored })), user);
    }
    return { changed: details.length, values: valuesFor(lang) };
  }

  let onEnglishChanged = null;
  /** Register the automatic translator (called with the keys that changed in English). */
  function setEnglishChangeHandler(handler) {
    onEnglishChanged = handler;
  }

  function countOverrides() {
    return db.prepare('SELECT COUNT(*) AS n FROM content_overrides').get().n;
  }

  return {
    schema,
    allOverrides,
    valuesFor,
    save,
    countOverrides,
    currentText,
    hasManualOverride,
    isMultiline,
    maxLength,
    setAuto,
    removeAuto,
    autoTranslation,
    editedEnglish,
    translateMode,
    setEnglishChangeHandler,
  };
}

module.exports = { createContent };
