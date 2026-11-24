/**
 * Content managed in the admin dashboard.
 *
 * The backend sends (1) website texts that were changed in the dashboard and
 * (2) site settings such as social links and contact emails. In production it
 * is already embedded in the page as window.__AICTIG_SITE__; in development it
 * is fetched from /api/site. Changed texts replace the built-in translations,
 * so every page that uses t('...') shows them without further changes.
 */
import i18n from '../i18n';

export type SocialNetwork = 'facebook' | 'linkedin' | 'x' | 'instagram' | 'whatsapp';

export interface SiteSettings {
  socialLinks: Record<SocialNetwork, string>;
  contactEmails: string[];
}

export interface SiteData {
  /** language -> { "namespace:key.path": text } */
  texts: Record<string, Record<string, string>>;
  settings: Partial<SiteSettings>;
}

declare global {
  interface Window {
    __AICTIG_SITE__?: SiteData;
  }
}

/** What the site shows if the backend is unavailable (same as server/settings.cjs). */
export const DEFAULT_SETTINGS: SiteSettings = {
  socialLinks: {
    facebook: 'https://facebook.com/aictig',
    linkedin: 'https://linkedin.com/company/aictig',
    x: 'https://x.com/aictig',
    instagram: 'https://instagram.com/aictig',
    whatsapp: 'https://wa.me/0000000000',
  },
  contactEmails: ['africtig@gmail.com', 'info@AICTiG.org'],
};

let settings: SiteSettings = DEFAULT_SETTINGS;

export function getSiteSettings(): SiteSettings {
  return settings;
}

export function applySiteData(data: SiteData): void {
  for (const [lang, texts] of Object.entries(data.texts || {})) {
    for (const [key, value] of Object.entries(texts)) {
      const i = key.indexOf(':');
      if (i < 1 || typeof value !== 'string') continue;
      i18n.addResource(lang, key.slice(0, i), key.slice(i + 1), value, { silent: true });
    }
  }
  settings = {
    socialLinks: { ...DEFAULT_SETTINGS.socialLinks, ...(data.settings?.socialLinks || {}) },
    contactEmails: data.settings?.contactEmails ?? DEFAULT_SETTINGS.contactEmails,
  };
}

/** Load dashboard content before the app renders. Never throws. */
export async function loadSiteContent(timeoutMs = 2500): Promise<void> {
  if (window.__AICTIG_SITE__) {
    applySiteData(window.__AICTIG_SITE__);
    return;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/site', { signal: controller.signal });
    if (res.ok) applySiteData(await res.json());
  } catch {
    // Backend not reachable: the site keeps its built-in texts.
  } finally {
    window.clearTimeout(timer);
  }
}
