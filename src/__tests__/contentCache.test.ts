import { describe, it, expect, vi, beforeEach } from 'vitest';

const wp = vi.hoisted(() => ({
  fetchAllDocuments: vi.fn(),
  fetchDocumentById: vi.fn(),
  fetchNewsArticles: vi.fn(),
  fetchNewsArticleBySlug: vi.fn(),
  fetchPublications: vi.fn(),
  fetchPublicationBySlug: vi.fn(),
}));
vi.mock('../utils/graphql', () => wp);

const doc = (id: string, year: number) => ({
  id, title: `Doc ${id}`, country: 'Nigeria', countryCode: 'NG', region: 'West Africa', year,
  type: 'national', level: 'national', languages: ['en'], summary: '', themes: [], fileUrl: '', tags: [],
});

async function freshModule() {
  vi.resetModules();
  return import('../utils/content');
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // The site's own backend has nothing: only WordPress items.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
  wp.fetchAllDocuments.mockResolvedValue([doc('1', 2019), doc('2', 2023)]);
});

describe('content: shared list cache', () => {
  it('fetches the repository once for many callers', async () => {
    const content = await freshModule();
    const [a, b] = await Promise.all([content.fetchAllDocuments(), content.fetchAllDocuments()]);
    await content.fetchAllDocuments();
    expect(wp.fetchAllDocuments).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('gives each caller its own copy of the list', async () => {
    const content = await freshModule();
    const first = await content.fetchAllDocuments();
    first.sort((x, y) => y.year - x.year);
    const second = await content.fetchAllDocuments();
    expect(second.map((d) => d.id)).toEqual(['1', '2']);
  });

  it('opens a document from the cached list without another request', async () => {
    const content = await freshModule();
    await content.fetchAllDocuments();
    expect(await content.fetchDocumentById('2')).toMatchObject({ id: '2' });
    expect(wp.fetchDocumentById).not.toHaveBeenCalled();
  });

  it('survives a reload through sessionStorage', async () => {
    await (await freshModule()).fetchAllDocuments();
    const reloaded = await freshModule();
    expect(await reloaded.fetchAllDocuments()).toHaveLength(2);
    expect(wp.fetchAllDocuments).toHaveBeenCalledTimes(1);
  });

  it('does not cache an empty result (sources unavailable)', async () => {
    wp.fetchAllDocuments.mockRejectedValueOnce(new Error('offline'));
    const content = await freshModule();
    expect(await content.fetchAllDocuments()).toEqual([]);
    expect(await content.fetchAllDocuments()).toHaveLength(2);
    expect(wp.fetchAllDocuments).toHaveBeenCalledTimes(2);
  });
});
