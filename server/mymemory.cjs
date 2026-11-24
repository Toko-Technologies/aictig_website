/**
 * Free machine translation through the public MyMemory API
 * (https://mymemory.translated.net, run by Translated srl).
 *
 * Limits (MyMemory's published usage limits): 500 bytes per request;
 * 5,000 characters a day without an email address, 50,000 a day when a
 * contact email is sent with each request. Their terms allow one paragraph per
 * request and say submitted text is stored, so only public website texts are
 * ever sent.
 *
 * Machine translation has typical failure modes. This module guards against them:
 *  - Names and placeholders get translated or mangled ("AICTiG", {{year}},
 *    email/web addresses, words on the "never translate" list): they are
 *    swapped for neutral tokens before sending and put back afterwards. If a
 *    token does not come back exactly once, the translation is rejected.
 *  - Some symbols (©, ®, ™) make the API return nothing: they are protected too.
 *  - Line breaks are lost: each line is translated on its own.
 *  - Long paragraphs exceed 500 bytes: they are split at sentence boundaries.
 *  - HTML entities (&#39;), lower-case starts and stray full stops on
 *    button labels are cleaned up.
 *  - The daily allowance runs out: usage is counted per day, translations are
 *    cached sentence by sentence so unchanged sentences are never sent twice,
 *    and a QuotaError tells the caller to try again after the reset.
 */

const ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_BYTES = 450; // below MyMemory's 500-byte limit, leaving room for tokens
const LIMIT_ANONYMOUS = 5000;
const LIMIT_WITH_EMAIL = 50000;
const SAFETY = 0.95;
const REQUEST_TIMEOUT_MS = 20000;
const PAUSE_BETWEEN_REQUESTS_MS = 150;

/** Website language code -> MyMemory language code. */
const LANGUAGE_CODES = { en: 'en', fr: 'fr', pt: 'pt', ar: 'ar', sw: 'sw', ru: 'ru', zh: 'zh-CN' };
const NO_SPACE_LANGUAGES = new Set(['zh']);

class QuotaError extends Error {}
class ItemError extends Error {}

// Tokens look like ZXQ0QXZ: tested live, MyMemory leaves them untouched in every
// site language (it may add or drop spaces around them, which restore() allows).
const TOKEN_RE = /Z\s*X\s*Q\s*(\d+)\s*Q\s*X\s*Z/gi;
const HAS_TOKEN = /Z\s*X\s*Q\s*\d+\s*Q\s*X\s*Z/i;
const token = (n) => `ZXQ${n}QXZ`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace text that must not be translated with numbered tokens. */
function protect(text, keepTerms = []) {
  const terms = [...new Set(keepTerms.map((t) => t.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const parts = [
    '\\{\\{\\s*\\w+\\s*\\}\\}', // {{year}}
    'https?:\\/\\/[^\\s)]*[^\\s).,;:!?]', // web addresses (without trailing punctuation)
    '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', // email addresses
    ...terms.map((t) => `(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`),
    '[©®™℠]', // symbols that break the API
  ];
  const re = new RegExp(parts.join('|'), 'gu');
  const tokens = [];
  const out = text.replace(re, (match) => {
    tokens.push(match);
    return token(tokens.length - 1);
  });
  return { text: out, tokens };
}

/** Put protected text back. Returns null if any token is missing or duplicated. */
function restore(text, tokens) {
  const seen = new Array(tokens.length).fill(0);
  const out = text.replace(TOKEN_RE, (match, n) => {
    const i = Number(n);
    if (i >= tokens.length) return match;
    seen[i] += 1;
    return tokens[i];
  });
  if (seen.some((count) => count !== 1)) return null;
  if (HAS_TOKEN.test(out)) return null;
  return out;
}

const bytes = (s) => Buffer.byteLength(s, 'utf8');

/** Break a unit that is still too long: at commas, then at spaces, then by size. */
function breakDown(unit) {
  if (bytes(unit) <= MAX_BYTES) return [unit];
  for (const re of [/(?<=,)\s+/, /\s+/]) {
    const parts = unit.split(re);
    if (parts.length > 1) return parts.flatMap(breakDown);
  }
  const out = [];
  let rest = unit;
  while (bytes(rest) > MAX_BYTES) {
    let cut = Math.min(rest.length, MAX_BYTES);
    while (bytes(rest.slice(0, cut)) > MAX_BYTES) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) out.push(rest);
  return out;
}

/** Split text into pieces of at most MAX_BYTES, keeping whole sentences together. */
function splitForRequests(text) {
  if (bytes(text) <= MAX_BYTES) return [text];
  const units = text.split(/(?<=[.!?;])\s+/).flatMap(breakDown);
  const pieces = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (bytes(candidate) <= MAX_BYTES) current = candidate;
    else {
      if (current) pieces.push(current);
      current = unit;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Small fixes machine translation often needs. */
function polish(source, translated) {
  let out = translated.replace(/[ \t]{2,}/g, ' ').trim();
  // Keep a capital first letter if the English had one.
  const srcFirst = source.match(/\p{L}/u);
  const outFirst = out.match(/\p{L}/u);
  if (srcFirst && outFirst && srcFirst[0] === srcFirst[0].toUpperCase() && srcFirst[0] !== srcFirst[0].toLowerCase()
      && outFirst[0] !== outFirst[0].toUpperCase()) {
    out = out.replace(outFirst[0], outFirst[0].toUpperCase());
  }
  // Labels and buttons without a full stop should stay without one.
  if (!/[.!?。！？…:：]$/.test(source.trim()) && /[.。]$/.test(out) && !/\.\.\.$/.test(out)) {
    out = out.slice(0, -1).trimEnd();
  }
  return out;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} opts
 * @param {Function} [opts.fetch]   fetch implementation (tests pass a fake)
 * @param {object}   opts.cache     { get(lang, source), set(lang, source, text) }
 * @param {object}   opts.usage     { today(), add(chars) }
 * @param {number}   [opts.pauseMs]
 */
function createMyMemoryProvider({ fetch: fetchImpl = globalThis.fetch, cache, usage, pauseMs = PAUSE_BETWEEN_REQUESTS_MS }) {
  let lastRequestAt = 0;

  function dailyLimit(email) {
    return Math.floor((email ? LIMIT_WITH_EMAIL : LIMIT_ANONYMOUS) * SAFETY);
  }

  async function request(text, lang, email) {
    const length = [...text].length;
    if (usage.today() + length > dailyLimit(email)) throw new QuotaError('daily limit');

    const sinceLast = Date.now() - lastRequestAt;
    if (sinceLast < pauseMs) await wait(pauseMs - sinceLast);
    lastRequestAt = Date.now();

    const params = new URLSearchParams({ q: text, langpair: `en|${LANGUAGE_CODES[lang] || lang}` });
    if (email) params.set('de', email);
    let res;
    try {
      res = await fetchImpl(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`could not reach the translation service (${err.name === 'TimeoutError' ? 'timed out' : err.message})`);
    }
    usage.add(length);
    const data = await res.json().catch(() => null);
    const translated = data && data.responseData ? data.responseData.translatedText : null;
    const status = data ? Number(data.responseStatus) : res.status;
    if (res.status === 429 || status === 429 || (data && data.quotaFinished)
        || (typeof translated === 'string' && /MYMEMORY WARNING/i.test(translated))) {
      throw new QuotaError('daily limit');
    }
    if (!res.ok || status !== 200) {
      throw new Error(`the translation service answered with an error (${(data && data.responseDetails) || status})`);
    }
    if (typeof translated !== 'string' || !translated.trim()) throw new ItemError('no translation returned');
    return decodeEntities(translated);
  }

  /** Translate one line (no line breaks). */
  async function translateLine(line, lang, ctx) {
    const lead = line.match(/^\s*/)[0];
    const trail = line.match(/\s*$/)[0];
    const core = line.trim();
    if (!core) return line;
    const { text, tokens } = protect(core, ctx.keepTerms);
    // Nothing left to translate (only names, numbers, symbols)?
    if (!/\p{L}/u.test(text.replace(TOKEN_RE, ''))) return line;
    const out = [];
    for (const piece of splitForRequests(text)) {
      let translated = cache.get(lang, piece);
      if (translated == null) {
        translated = await request(piece, lang, ctx.email);
        cache.set(lang, piece, translated);
      }
      out.push(translated.trim());
    }
    const joined = out.join(NO_SPACE_LANGUAGES.has(lang) ? '' : ' ');
    const restored = restore(joined, tokens);
    if (restored === null) throw new ItemError('a protected word or placeholder was lost');
    return lead + polish(core, restored) + trail;
  }

  async function translateText(text, lang, ctx) {
    const lines = text.split('\n');
    const out = [];
    for (const line of lines) out.push(await translateLine(line, lang, ctx));
    return out.join('\n');
  }

  /**
   * Translate many texts. Returns { results: Map(id -> text), failed: [{ id, reason }] }.
   * Stops with QuotaError when the daily allowance is used up.
   */
  async function translateItems(items, ctx) {
    const results = new Map();
    const failed = [];
    for (const item of items) {
      try {
        results.set(item.id, await translateText(item.source, item.lang, ctx));
      } catch (err) {
        if (err instanceof ItemError) failed.push({ id: item.id, reason: err.message });
        else {
          err.partial = { results, failed };
          throw err;
        }
      }
    }
    return { results, failed };
  }

  return { name: 'MyMemory (free)', id: 'mymemory', translateItems, dailyLimit };
}

module.exports = {
  createMyMemoryProvider,
  QuotaError,
  protect,
  restore,
  splitForRequests,
  polish,
  decodeEntities,
  LIMIT_ANONYMOUS,
  LIMIT_WITH_EMAIL,
};
