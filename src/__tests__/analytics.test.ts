import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// analytics.ts reads import.meta.env.DEV once, at module load. Each block
// stubs it and re-imports the module, so both branches are really exercised.
async function loadAnalytics(dev: boolean) {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  return import('../utils/analytics');
}

describe('Analytics (development: console only)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    window._paq = [];
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('logs a page view', async () => {
    const { trackPageView } = await loadAnalytics(true);
    trackPageView('Home', '/');
    expect(consoleLogSpy).toHaveBeenCalledWith('[Analytics] Page View: Home — /');
  });

  it('logs page names with special characters unchanged', async () => {
    const { trackPageView } = await loadAnalytics(true);
    trackPageView('Repository - Filters', '/repository?filters=active');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Analytics] Page View: Repository - Filters — /repository?filters=active'
    );
  });

  it('logs an event without optional parameters', async () => {
    const { trackEvent } = await loadAnalytics(true);
    trackEvent('Download', 'Click');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Analytics] Event: Download / Click',
      { name: undefined, value: undefined }
    );
  });

  it('logs an event with all parameters', async () => {
    const { trackEvent } = await loadAnalytics(true);
    trackEvent('Search', 'Query', 'cybersecurity', 42);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[Analytics] Event: Search / Query',
      { name: 'cybersecurity', value: 42 }
    );
  });

  it('logs a site search', async () => {
    const { trackSearch } = await loadAnalytics(true);
    trackSearch('privacy', 3);
    expect(consoleLogSpy).toHaveBeenCalledWith('[Analytics] Search: "privacy" → 3 results');
  });

  it('sends nothing to Matomo', async () => {
    const { trackPageView, trackEvent, trackSearch } = await loadAnalytics(true);
    trackPageView('Home', '/');
    trackEvent('Download', 'Click');
    trackSearch('privacy', 3);
    expect(window._paq).toEqual([]);
  });
});

describe('Analytics (production: Matomo queue)', () => {
  beforeEach(() => {
    window._paq = [];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('queues a SPA page view with the full URL and title', async () => {
    const { trackPageView } = await loadAnalytics(false);
    trackPageView('About', '/about');
    expect(window._paq).toEqual([
      ['setCustomUrl', window.location.origin + '/about'],
      ['setDocumentTitle', 'About'],
      ['trackPageView'],
    ]);
  });

  it('queues an event', async () => {
    const { trackEvent } = await loadAnalytics(false);
    trackEvent('Search', 'Query', 'cybersecurity', 42);
    expect(window._paq).toEqual([['trackEvent', 'Search', 'Query', 'cybersecurity', 42]]);
  });

  it('queues a download as an event plus a download link', async () => {
    const { trackDownload } = await loadAnalytics(false);
    trackDownload('Policy.pdf', '/documents/policy.pdf');
    expect(window._paq).toEqual([
      ['trackEvent', 'Download', 'PDF', 'Policy.pdf', undefined],
      ['trackLink', '/documents/policy.pdf', 'download'],
    ]);
  });

  it('queues a site search with the result count', async () => {
    const { trackSearch } = await loadAnalytics(false);
    trackSearch('privacy', 3);
    expect(window._paq).toEqual([['trackSiteSearch', 'privacy', false, 3]]);
  });

  it('initAnalytics points the tracker at the same-origin /m/ proxy', async () => {
    document.head.appendChild(document.createElement('script'));
    const { initAnalytics } = await loadAnalytics(false);
    initAnalytics();
    expect(window._paq).toEqual([
      ['setTrackerUrl', '/m/matomo.php'],
      ['setSiteId', '1'],
      ['enableLinkTracking'],
      ['enableHeartBeatTimer', 15],
    ]);
    const injected = Array.from(document.getElementsByTagName('script')).find((s) =>
      s.src.endsWith('/m/matomo.js')
    );
    expect(injected).toBeDefined();
    expect(injected?.async).toBe(true);
  });
});
