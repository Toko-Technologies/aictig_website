import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon,
  NewspaperIcon,
  PencilSquareIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { api, type LibraryKind, type LibraryPost } from '../api';
import { Alert, Badge, Card, EmptyState, LoadingState, PageHeader, TextInput } from '../ui';
import { formatDate, POST_STATUS } from '../library';
import * as wordpress from '../../utils/graphql';

export const KIND_TEXT: Record<LibraryKind, { title: string; one: string; description: string; publicPath: string }> = {
  news: {
    title: 'News',
    one: 'news article',
    description: 'News articles on the News page and the home page.',
    publicPath: '/news',
  },
  publications: {
    title: 'Publications',
    one: 'publication',
    description: 'Articles, policy briefs, reports and other publications on the Publications page.',
    publicPath: '/publications',
  },
};

interface Row {
  key: string;
  title: string;
  date: string;
  image: string;
  link: string;
  /** Set for items added in the dashboard (editable). */
  post?: LibraryPost;
}

export default function PostsListPage({ kind }: { kind: LibraryKind }) {
  const text = KIND_TEXT[kind];
  const [mine, setMine] = useState<LibraryPost[] | null>(null);
  const [older, setOlder] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setMine(null);
    setOlder(null);
    api.get<LibraryPost[]>(`/library/${kind}`).then(setMine).catch((e) => setError(e.message));
    const fromWordPress = kind === 'news'
      ? wordpress.fetchNewsArticles().then((list) => list.map((a) => ({ key: `wp-${a.id}`, title: a.title, date: a.date, image: a.image, link: `/news/${a.slug}` })))
      : wordpress.fetchPublications().then((list) => list.map((p) => ({ key: `wp-${p.id}`, title: p.title, date: `${p.year}-01-01`, image: p.cover, link: `/publications/${p.slug}` })));
    fromWordPress.then(setOlder).catch(() => setOlder([]));
  }, [kind]);

  const q = query.trim().toLowerCase();
  const match = (title: string) => !q || title.toLowerCase().includes(q);
  const rows: Row[] = [
    ...(mine || []).map((p) => ({ key: `local-${p.id}`, title: p.title, date: p.date, image: p.image, link: `${text.publicPath}/${p.slug}`, post: p })),
    ...(older || []),
  ].filter((r) => match(r.title));

  return (
    <>
      <PageHeader
        title={text.title}
        description={text.description}
        actions={
          <Link to={`/admin/${kind}/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700">
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add {text.one}
          </Link>
        }
      />

      {error && <div className="mb-6"><Alert tone="error">{error}</Alert></div>}

      {!mine && !error ? <LoadingState /> : (
        <Card>
          {(mine?.length || 0) + (older?.length || 0) > 6 && (
            <div className="relative mb-4 max-w-sm">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
              <TextInput type="search" placeholder="Search by title…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Search" />
            </div>
          )}
          {rows.length === 0 ? (
            <EmptyState
              title={q ? 'Nothing matches your search' : `No ${text.title.toLowerCase()} yet`}
              description={q ? undefined : `Click “Add ${text.one}” to write the first one.`}
            />
          ) : (
            <ul className="-mx-6 -my-5 divide-y divide-neutral-100">
              {rows.map((row) => {
                const status = row.post ? POST_STATUS[row.post.status] : null;
                const visible = !row.post || row.post.status === 'published';
                return (
                  <li key={row.key} className="flex flex-wrap items-center gap-4 px-6 py-4 sm:flex-nowrap">
                    <div className="h-14 w-20 flex-shrink-0 overflow-hidden rounded-md bg-neutral-100">
                      {row.image
                        ? <img src={row.image} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full items-center justify-center text-neutral-300"><NewspaperIcon className="h-6 w-6" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      {row.post
                        ? <Link to={`/admin/${kind}/${row.post.id}`} className="text-sm font-semibold text-neutral-900 hover:text-primary-700">{row.title}</Link>
                        : <span className="text-sm font-semibold text-neutral-900">{row.title}</span>}
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        {status ? <Badge tone={status.tone}>{status.label}</Badge> : <Badge tone="blue">From WordPress</Badge>}
                        {formatDate(row.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {visible && (
                        <a href={row.link} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-secondary-600 hover:bg-secondary-50">
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                          View
                        </a>
                      )}
                      {row.post && (
                        <Link to={`/admin/${kind}/${row.post.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50">
                          <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {older === null && <p className="mt-4 text-xs text-neutral-400">Loading older items from WordPress…</p>}
          {older && older.length > 0 && (
            <p className="mt-6 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
              Items marked “From WordPress” were published before the dashboard existed. They are still shown on the website but can only be changed in WordPress.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
