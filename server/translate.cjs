/**
 * Automatic translation of edited website texts.
 *
 * When an English text is saved in the dashboard, it is translated into the
 * other site languages in the background and stored as an "auto" override.
 *  - A text someone edited by hand in a language ("manual") is never overwritten.
 *  - Restoring the English original removes the automatic translations, so
 *    every language goes back to its original built-in wording.
 *  - Fields marked "translate": "copy" in shared/content-schema.json (street
 *    addresses, example names) get the English text as-is.
 *  - Each automatic translation remembers the English text it came from, so
 *    out-of-date translations are found and redone. If the free daily
 *    allowance runs out, the rest is translated automatically later (the
 *    server checks every hour).
 *
 * Translation service:
 *  - MyMemory (free, no account; see server/mymemory.cjs) by default.
 *  - Claude (paid, higher quality) is used instead when an Anthropic API key is
 *    configured (ANTHROPIC_API_KEY or <data folder>/anthropic-api-key) and the
 *    @anthropic-ai/sdk package is installed.
 * Turn it off in the dashboard (Translation page).
 */
const fs = require('fs');
const path = require('path');
const { logChange } = require('./db.cjs');
const { createMyMemoryProvider, QuotaError } = require('./mymemory.cjs');

const CLAUDE_MODEL = 'claude-opus-5-5';
const CLAUDE_BATCH = 60;
const RETRY_EVERY_MS = 60 * 60 * 1000;
const FAILED_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

const CLAUDE_SYSTEM_PROMPT = `You translate the website of AICTiG, the African Institute for Cybersecurity & Tele-Informatics Governance, a research institute and think tank working on cybersecurity, ICT law and digital governance in Africa.

Translate each English text into the language named in its item. Write the way a professional translator would for an institutional website: accurate, formal but readable, natural in the target language, and about as long as the original. Use the terminology that governments and international organisations use in that language.

Keep these exactly as they are: the name "AICTiG", names of people and organisations and their acronyms (for example ECOWAS, NATO, African Union), titles of laws and publications, email addresses, web addresses, numbers, and placeholders in double curly braces such as {{year}}. Keep line breaks where the original has them.

Return one translation for every item, using the item's id.`;

const CLAUDE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

function readApiKey(config) {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  try {
    return fs.readFileSync(path.join(config.dataDir, 'anthropic-api-key'), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Claude, used only when an API key and the SDK are both available. */
function createClaudeProvider(apiKey) {
  let sdk;
  try {
    // eslint-disable-next-line global-require
    sdk = require('@anthropic-ai/sdk');
  } catch {
    return null;
  }
  const Anthropic = sdk.default || sdk;
  const client = new Anthropic({ apiKey });

  async function translateBatch(batch, keepTerms) {
    const extra = keepTerms.length ? `\n\nAlso keep these exactly as they are: ${keepTerms.join(', ')}.` : '';
    const message = await client.beta.messages
      .stream({
        model: CLAUDE_MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: CLAUDE_OUTPUT_SCHEMA } },
        system: CLAUDE_SYSTEM_PROMPT + extra,
        messages: [{
          role: 'user',
          content: JSON.stringify({ items: batch.map((i) => ({ id: i.id, language: i.languageName, text: i.source })) }),
        }],
      })
      .finalMessage();
    if (message.stop_reason === 'refusal') throw new Error('the translation service declined this text');
    if (message.stop_reason === 'max_tokens') throw new Error('the translation was too long to complete');
    let start = 0; // after a fallback switch, only the final model's text counts
    message.content.forEach((block, i) => { if (block.type === 'fallback') start = i + 1; });
    const text = message.content.slice(start).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return JSON.parse(text).translations;
  }

  async function translateItems(items, ctx) {
    const results = new Map();
    for (let i = 0; i < items.length; i += CLAUDE_BATCH) {
      const batch = items.slice(i, i + CLAUDE_BATCH);
      for (const r of await translateBatch(batch, ctx.keepTerms)) {
        if (typeof r.text === 'string' && r.text.trim()) results.set(String(r.id), r.text.trim());
      }
    }
    const failed = items.filter((i) => !results.has(i.id)).map((i) => ({ id: i.id, reason: 'no translation returned' }));
    return { results, failed };
  }

  return { name: 'Claude', id: 'claude', translateItems };
}

const placeholderSet = (text) => (text.match(/\{\{\s*\w+\s*\}\}/g) || []).map((p) => p.replace(/\s/g, '')).sort().join(',');
const utcDay = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object} deps
 * @param {object}   [deps.provider] - replaces the translation service (tests)
 * @param {Function} [deps.fetch]    - fetch used for MyMemory (tests)
 * @param {boolean}  [deps.schedule] - run the hourly retry timer (default true)
 */
function createAutoTranslator(db, config, content, settings, deps = {}) {
  const languages = content.schema.languages.filter((l) => l.code !== 'en');

  // ── MyMemory bookkeeping: sentence cache and daily usage ───────────
  const cache = {
    get: (lang, source) => {
      const row = db.prepare('SELECT text FROM translation_cache WHERE lang = ? AND source = ?').get(lang, source);
      return row ? row.text : null;
    },
    set: (lang, source, text) => {
      db.prepare('INSERT OR REPLACE INTO translation_cache (lang, source, text, created_at) VALUES (?, ?, ?, ?)')
        .run(lang, source, text, Date.now());
    },
  };
  const usage = {
    today: () => {
      const row = db.prepare('SELECT chars FROM translation_usage WHERE day = ?').get(utcDay());
      return row ? row.chars : 0;
    },
    add: (chars) => {
      db.prepare(`INSERT INTO translation_usage (day, chars) VALUES (?, ?)
                  ON CONFLICT(day) DO UPDATE SET chars = chars + excluded.chars`).run(utcDay(), chars);
    },
  };

  const apiKey = deps.provider ? null : readApiKey(config);
  const claude = apiKey ? createClaudeProvider(apiKey) : null;
  const myMemory = createMyMemoryProvider({ fetch: deps.fetch, cache, usage, pauseMs: deps.fetch ? 0 : undefined });
  const provider = deps.provider || claude || myMemory;

  const options = () => settings.all().translation;

  const state = { pending: 0, lastError: null, lastRunAt: null, lastResult: null, quotaHitDay: null };
  const failedRecently = new Map(); // `${lang}|${key}|${english}` -> time of failure
  let chain = Promise.resolve();

  /** Which (language, text) pairs need a new automatic translation. */
  function outdatedItems(keys, { force = false } = {}) {
    const edited = content.editedEnglish();
    const items = [];
    for (const key of keys) {
      const english = edited.get(key);
      if (english === undefined) continue; // English not edited: built-in translations apply
      for (const lang of languages) {
        if (content.hasManualOverride(lang.code, key)) continue;
        const existing = content.autoTranslation(lang.code, key);
        if (existing && existing.translated_from === english) continue;
        const memo = failedRecently.get(`${lang.code}|${key}|${english}`);
        if (!force && memo && Date.now() - memo < FAILED_RETRY_AFTER_MS) continue;
        items.push({ id: String(items.length), key, lang: lang.code, languageName: lang.name, source: english });
      }
    }
    return items;
  }

  function outdatedCount() {
    return outdatedItems([...content.editedEnglish().keys()], { force: true }).length;
  }

  async function run(keys, { force = false, userName = null } = {}) {
    const items = outdatedItems(keys, { force });
    if (!items.length) return;
    const { keepTerms, email } = options();

    let written = 0;
    const failedItems = [];
    const store = (item, text) => {
      if (placeholderSet(text) !== placeholderSet(item.source)) {
        failedItems.push(item);
        return;
      }
      let clean = text;
      if (!content.isMultiline(item.key)) clean = clean.replace(/\s*\n+\s*/g, ' ');
      if (clean.length > content.maxLength(item.key) * 2) {
        failedItems.push(item);
        return;
      }
      if (content.setAuto(item.lang, item.key, clean, item.source)) written += 1;
    };

    // Texts that are copied, not translated.
    const toTranslate = [];
    for (const item of items) {
      if (content.translateMode(item.key) === 'copy') store(item, item.source);
      else toTranslate.push(item);
    }

    let quotaHit = false;
    try {
      if (toTranslate.length) {
        const { results, failed } = await provider.translateItems(toTranslate, { keepTerms, email });
        for (const item of toTranslate) {
          if (results.has(item.id)) store(item, results.get(item.id));
        }
        for (const f of failed) failedItems.push(toTranslate.find((i) => i.id === f.id));
      }
    } catch (err) {
      // Keep whatever was finished before the error.
      if (err.partial) {
        for (const item of toTranslate) if (err.partial.results.has(item.id)) store(item, err.partial.results.get(item.id));
      }
      if (err instanceof QuotaError) quotaHit = true;
      else throw err;
    } finally {
      for (const item of failedItems.filter(Boolean)) failedRecently.set(`${item.lang}|${item.key}|${item.source}`, Date.now());
      state.lastResult = { translated: written, failed: failedItems.length, at: Date.now() };
      if (written) {
        logChange(db, null, 'content.translate',
          `Translated ${written} text${written === 1 ? '' : 's'} automatically with ${provider.name}`
          + (userName ? ` (after a change by ${userName})` : ''));
      }
    }

    if (quotaHit) {
      state.quotaHitDay = utcDay();
      const remaining = outdatedCount();
      const paused = new Error(`the free daily translation allowance is used up. ${remaining} text${remaining === 1 ? '' : 's'} will be translated automatically after it resets (within 24 hours)`);
      paused.isQuota = true;
      throw paused;
    }
    if (failedItems.length) {
      state.lastError = `${failedItems.length} translation${failedItems.length === 1 ? ' was' : 's were'} not saved because the result did not look right (for example, a protected word or {{year}} went missing). Those texts keep their previous wording; you can translate them by hand.`;
    }
  }

  function enqueue(keys, opts = {}) {
    if (!options().enabled || !keys.length) return;
    state.pending += 1;
    chain = chain
      .then(() => {
        state.lastError = null;
        return run(keys, opts);
      })
      .catch((err) => {
        const prefix = err && err.isQuota ? 'Automatic translation paused' : 'Automatic translation stopped';
        state.lastError = `${prefix}: ${err && err.message ? err.message : 'unknown error'}.`;
        console.error('[translate]', err && err.message);
      })
      .finally(() => {
        state.pending -= 1;
        state.lastRunAt = Date.now();
      });
  }

  /** Called after English texts were saved in the dashboard. */
  function englishChanged(changes, user) {
    const restored = changes.filter((c) => c.restored).map((c) => c.key);
    if (restored.length) content.removeAuto(restored);
    const changed = changes.filter((c) => !c.restored).map((c) => c.key);
    enqueue(changed, { userName: user ? user.name : null });
  }

  /** Translate everything that is out of date (hourly, and the "Translate now" button). */
  function refreshOutdated({ force = false } = {}) {
    if (!force && state.quotaHitDay === utcDay()) return; // wait for tomorrow's allowance
    enqueue([...content.editedEnglish().keys()], { force });
  }

  if (deps.schedule !== false) {
    setTimeout(() => refreshOutdated(), 30 * 1000).unref();
    setInterval(() => refreshOutdated(), RETRY_EVERY_MS).unref();
  }

  function status() {
    const opts = options();
    const isFree = provider.id === 'mymemory';
    return {
      enabled: opts.enabled,
      provider: provider.name,
      providerId: provider.id,
      busy: state.pending > 0,
      lastError: state.lastError,
      lastRunAt: state.lastRunAt,
      lastResult: state.lastResult,
      outdated: opts.enabled ? outdatedCount() : 0,
      usage: isFree ? { today: usage.today(), limit: myMemory.dailyLimit(opts.email) } : null,
      settings: opts,
      languages: languages.map((l) => l.name),
    };
  }

  return { status, englishChanged, refreshOutdated, idle: () => chain };
}

module.exports = { createAutoTranslator };
