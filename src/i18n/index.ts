import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// English is part of the main bundle: it is the default language and the
// fallback for any text missing in another language.
import commonEN from './locales/en/common.json';
import homeEN from './locales/en/home.json';
import repoEN from './locales/en/repo.json';
import pubsEN from './locales/en/pubs.json';
import newsEN from './locales/en/news.json';
import aboutEN from './locales/en/about.json';
import contactEN from './locales/en/contact.json';

export const LANGUAGES = ['en', 'ar', 'sw', 'fr', 'ru', 'zh', 'pt'];
const NAMESPACES = ['common', 'home', 'repo', 'pubs', 'news', 'about', 'contact'];

// Every other language is a separate file (one per language, see
// manualChunks in vite.config.ts), downloaded only when a visitor uses it.
const otherLocales = import.meta.glob<Record<string, unknown>>(
  ['./locales/*/*.json', '!./locales/en/*.json'],
  { import: 'default' },
);

const loading = new Map<string, Promise<void>>();

/** Download a language's texts (no-op for English or if already loaded). */
export function loadLanguage(lng: string): Promise<void> {
  if (lng === 'en' || !LANGUAGES.includes(lng)) return Promise.resolve();
  let promise = loading.get(lng);
  if (!promise) {
    promise = Promise.all(
      NAMESPACES.map(async (ns) => {
        const load = otherLocales[`./locales/${lng}/${ns}.json`];
        if (!load) return;
        // deep merge without overwriting: texts edited in the dashboard
        // (added earlier by applySiteData) win over the built-in ones.
        i18n.addResourceBundle(lng, ns, await load(), true, false);
      }),
    ).then(() => undefined);
    promise.catch(() => loading.delete(lng));
    loading.set(lng, promise);
  }
  return promise;
}

/** Switch language, downloading its texts first so nothing flashes in English. */
export async function changeLanguage(lng: string): Promise<void> {
  try {
    await loadLanguage(lng);
  } catch {
    // Offline or the file failed: switch anyway, missing texts fall back to English.
  }
  await i18n.changeLanguage(lng);
}

// Stored language, else the browser's language, else English.
const getInitialLanguage = (): string => {
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem('aictig-language') ?? null;
  } catch { /* storage blocked */ }
  if (stored && LANGUAGES.includes(stored)) return stored;

  const browserLang = (globalThis.navigator?.language || 'en').split('-')[0];
  if (LANGUAGES.includes(browserLang)) return browserLang;

  return 'en';
};

/** The language the site opens in (main.tsx downloads it before the first render). */
export const INITIAL_LANGUAGE = getInitialLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEN,
        home: homeEN,
        repo: repoEN,
        pubs: pubsEN,
        news: newsEN,
        about: aboutEN,
        contact: contactEN,
      },
    },
    partialBundledLanguages: true,
    lng: INITIAL_LANGUAGE,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: NAMESPACES,
    interpolation: {
      escapeValue: false,
    },
  });

// Update HTML dir attribute based on language
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('aictig-language', lng);
  } catch { /* storage blocked */ }
  document.documentElement.setAttribute('lang', lng);
  document.documentElement.setAttribute('dir', lng === 'ar' ? 'rtl' : 'ltr');
});

// Set initial dir
document.documentElement.setAttribute('lang', i18n.language);
document.documentElement.setAttribute('dir', i18n.language === 'ar' ? 'rtl' : 'ltr');

export default i18n;
