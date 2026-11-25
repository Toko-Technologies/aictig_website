/**
 * Code for each public page, loaded on demand.
 *
 * App.tsx builds its React.lazy pages from these loaders, and links call
 * prefetchPage() on hover/focus/touch, so a page's code is usually already
 * downloaded by the time the visitor clicks. After the first page has
 * loaded, prefetchAllPages() fetches the rest while the browser is idle.
 */
export const pageLoaders = {
  about: () => import('./About'),
  expert: () => import('./Expert'),
  focusAreas: () => import('./FocusAreas'),
  consultancy: () => import('./Consultancy'),
  repository: () => import('./Repository'),
  policyDetail: () => import('./PolicyDetail'),
  publications: () => import('./Publications'),
  publicationDetail: () => import('./PublicationDetail'),
  gallery: () => import('./Gallery'),
  news: () => import('./News'),
  newsDetail: () => import('./NewsDetail'),
  contact: () => import('./Contact'),
  legal: () => import('./Legal'),
};

type PageName = keyof typeof pageLoaders;

/** Which page a path opens (Home is part of the main bundle, so it is not listed). */
function pageFor(path: string): PageName | null {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (p === '/about') return 'about';
  if (p.startsWith('/experts/')) return 'expert';
  if (p === '/focus-areas') return 'focusAreas';
  if (p === '/consultancy') return 'consultancy';
  if (p === '/repository') return 'repository';
  if (p.startsWith('/repository/')) return 'policyDetail';
  if (p === '/publications') return 'publications';
  if (p.startsWith('/publications/')) return 'publicationDetail';
  if (p === '/gallery') return 'gallery';
  if (p === '/news') return 'news';
  if (p.startsWith('/news/')) return 'newsDetail';
  if (p === '/contact') return 'contact';
  if (p.startsWith('/legal/')) return 'legal';
  return null;
}

const started = new Set<PageName>();

function load(name: PageName) {
  if (started.has(name)) return;
  started.add(name);
  // A failed prefetch is not an error: the page loads again on navigation.
  pageLoaders[name]().catch(() => started.delete(name));
}

/** Start downloading the code for the page at `path` (no-op if already started). */
export function prefetchPage(path: string) {
  const name = pageFor(path);
  if (name) load(name);
}

/** Download every page's code in the background, one at a time while idle. */
export function prefetchAllPages() {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return; // respect data saver / very slow links

  const queue = (Object.keys(pageLoaders) as PageName[]).filter((n) => !started.has(n));
  const idle: (cb: () => void) => void =
    'requestIdleCallback' in window
      ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 })
      : (cb) => window.setTimeout(cb, 200);

  const next = () => {
    const name = queue.shift();
    if (!name) return;
    load(name);
    idle(next);
  };
  idle(next);
}
