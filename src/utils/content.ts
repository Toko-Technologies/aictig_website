/**
 * Website content from both sources, as one list:
 *  - items added in the admin dashboard (stored in the site's own database,
 *    read from /api/content/...), and
 *  - older items published through WordPress (read from WordPress exactly as
 *    before, see ./graphql.ts, which is not changed).
 *
 * Pages import from here instead of ./graphql. If one source is unavailable,
 * the other is still shown. Dashboard items have ids starting with "local-".
 */
import type { NewsArticle, Policy, Publication } from '../types';
import places from '../../shared/places.json';
import * as wordpress from './graphql';

const LOCAL_PREFIX = 'local-';

interface LocalPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  tags: string[];
  type: string;
  authors: string[];
  fileUrl: string;
  date: string;
}

interface LocalDocument {
  id: number;
  title: string;
  summary: string;
  fileUrl: string;
  year: number;
  country: string;
  organization: string;
  languages: string[];
  themes: string[];
}

async function local<T>(path: string): Promise<T> {
  const res = await fetch(`/api/content${path}`);
  if (!res.ok) throw new Error(`Content request failed (${res.status})`);
  return res.json();
}

const orEmpty = <T>(promise: Promise<T[]>) => promise.catch(() => [] as T[]);

// ── Mapping dashboard items to the shapes the pages already use ────

function toNewsArticle(p: LocalPost): NewsArticle {
  return {
    id: `${LOCAL_PREFIX}${p.id}`,
    title: p.title,
    slug: p.slug,
    date: p.date,
    excerpt: p.excerpt,
    body: p.content,
    image: p.image,
    author: 'AICTiG',
    tags: p.tags,
  };
}

function toPublication(p: LocalPost): Publication {
  return {
    id: `${LOCAL_PREFIX}${p.id}`,
    title: p.title,
    slug: p.slug,
    authors: p.authors.length ? p.authors : ['AICTiG'],
    year: Number(p.date.slice(0, 4)),
    type: p.type || 'Article',
    abstract: p.excerpt,
    content: p.content,
    fileUrl: p.fileUrl,
    cover: p.image,
    tags: p.tags,
  };
}

function toPolicy(d: LocalDocument): Policy {
  const country = places.countries.find((c) => c.name === d.country);
  const org = places.organizations.find((o) => o.key === d.organization);
  const level = (org ? org.level : 'national') as Policy['level'];
  return {
    id: `${LOCAL_PREFIX}${d.id}`,
    title: d.title,
    country: country ? country.name : '',
    countryCode: country ? country.iso2 : '',
    region: country ? country.region : '',
    year: d.year,
    type: level,
    level,
    organization: org ? org.label : undefined,
    organizationKey: org ? org.key : undefined,
    languages: d.languages.length ? d.languages : ['en'],
    summary: d.summary,
    themes: d.themes,
    fileUrl: d.fileUrl,
    tags: d.themes.map((t) => t.toLowerCase().replace(/\s+/g, '-')),
  };
}

// ── News ───────────────────────────────────────────────────────────

export async function fetchNewsArticles(): Promise<NewsArticle[]> {
  const [mine, theirs] = await Promise.all([
    orEmpty(local<LocalPost[]>('/news').then((list) => list.map(toNewsArticle))),
    orEmpty(wordpress.fetchNewsArticles()),
  ]);
  return [...mine, ...theirs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function fetchNewsArticleBySlug(slug: string): Promise<NewsArticle | null> {
  try {
    return toNewsArticle(await local<LocalPost>(`/news/${encodeURIComponent(slug)}`));
  } catch {
    return wordpress.fetchNewsArticleBySlug(slug);
  }
}

// ── Publications ───────────────────────────────────────────────────

export async function fetchPublications(): Promise<Publication[]> {
  const [mine, theirs] = await Promise.all([
    orEmpty(local<LocalPost[]>('/publications').then((list) => list.map(toPublication))),
    orEmpty(wordpress.fetchPublications()),
  ]);
  return [...mine, ...theirs];
}

export async function fetchPublicationBySlug(slug: string): Promise<Publication | null> {
  try {
    return toPublication(await local<LocalPost>(`/publications/${encodeURIComponent(slug)}`));
  } catch {
    return wordpress.fetchPublicationBySlug(slug);
  }
}

// ── Repository documents ───────────────────────────────────────────

export async function fetchAllDocuments(): Promise<Policy[]> {
  const [mine, theirs] = await Promise.all([
    orEmpty(local<LocalDocument[]>('/documents').then((list) => list.map(toPolicy))),
    orEmpty(wordpress.fetchAllDocuments()),
  ]);
  return [...mine, ...theirs];
}

export async function fetchDocumentById(id: string): Promise<Policy | null> {
  if (id.startsWith(LOCAL_PREFIX)) {
    try {
      return toPolicy(await local<LocalDocument>(`/documents/${encodeURIComponent(id.slice(LOCAL_PREFIX.length))}`));
    } catch {
      return null;
    }
  }
  return wordpress.fetchDocumentById(id);
}

// ── Latest updates bar (same behaviour as before, both sources) ────

const UPDATES_CACHE_KEY = 'aictig_updates_v2';
const UPDATES_CACHE_TTL = 15 * 60 * 1000;

export async function fetchLatestUpdates(count = 10): Promise<{ text: string; link: string }[]> {
  try {
    const raw = sessionStorage.getItem(UPDATES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { ts: number; items: { text: string; link: string }[] };
      if (Date.now() - cached.ts < UPDATES_CACHE_TTL) return cached.items;
    }
  } catch { /* ignore a broken cache */ }

  const [news, pubs, docs] = await Promise.all([fetchNewsArticles(), fetchPublications(), fetchAllDocuments()]);
  const merged = [
    ...news.map((a) => ({ text: a.title, link: `/news/${a.slug}`, date: new Date(a.date).getTime() })),
    ...pubs.map((p) => ({ text: p.title, link: `/publications/${p.slug}`, date: new Date(`${p.year}-01-01`).getTime() })),
    ...docs.map((d) => ({ text: d.title, link: `/repository/${d.id}`, date: new Date(`${d.year}-01-01`).getTime() })),
  ];
  merged.sort((a, b) => b.date - a.date);
  const items = merged.slice(0, count).map(({ text, link }) => ({ text, link }));
  try {
    sessionStorage.setItem(UPDATES_CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch { /* storage full: not important */ }
  return items;
}
