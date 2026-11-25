import { describe, it, expect } from 'vitest';
import i18n, { loadLanguage, changeLanguage } from '../i18n';
import homeFR from '../i18n/locales/fr/home.json';

describe('i18n: languages are loaded on demand', () => {
  it('bundles only English up front', () => {
    expect(i18n.hasResourceBundle('en', 'home')).toBe(true);
    expect(i18n.hasResourceBundle('pt', 'home')).toBe(false);
  });

  it('downloads a language with all its namespaces', async () => {
    await loadLanguage('fr');
    for (const ns of ['common', 'home', 'repo', 'pubs', 'news', 'about', 'contact']) {
      expect(i18n.hasResourceBundle('fr', ns)).toBe(true);
    }
    expect(i18n.getFixedT('fr', 'home')('hero.subtitle')).toBe(homeFR.hero.subtitle);
  });

  it('keeps texts edited in the dashboard over the built-in ones', async () => {
    // applySiteData adds dashboard texts before the language file arrives.
    i18n.addResource('ru', 'home', 'hero.title', 'Edited in the dashboard', { silent: true });
    await loadLanguage('ru');
    const t = i18n.getFixedT('ru', 'home');
    expect(t('hero.title')).toBe('Edited in the dashboard');
    expect(t('hero.cta.repository')).not.toBe('Explore Repository'); // the rest is Russian
  });

  it('switches language only after its texts are loaded', async () => {
    await changeLanguage('sw');
    expect(i18n.language).toBe('sw');
    expect(i18n.hasResourceBundle('sw', 'common')).toBe(true);
    await changeLanguage('en');
  });

  it('ignores unknown languages', async () => {
    await expect(loadLanguage('xx')).resolves.toBeUndefined();
  });
});
