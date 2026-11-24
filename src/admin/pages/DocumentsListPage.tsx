import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon, DocumentTextIcon, MagnifyingGlassIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import { api, type LibraryDocument } from '../api';
import { Alert, Badge, Button, Card, EmptyState, LoadingState, PageHeader, TextInput } from '../ui';
import { useLibraryOptions } from '../library';
import * as wordpress from '../../utils/graphql';

const PAGE_SIZE = 25;
const selectClass = 'rounded-md border border-neutral-300 bg-white py-2 pl-3 pr-8 text-sm text-neutral-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

interface Row {
  key: string;
  title: string;
  place: string;
  year: number;
  languages: string[];
  fileUrl: string;
  source: 'dashboard' | 'wordpress';
  hidden: boolean;
  id?: number;
}

export default function DocumentsListPage() {
  const { options } = useLibraryOptions();
  const [mine, setMine] = useState<LibraryDocument[] | null>(null);
  const [older, setOlder] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState('');
  const [year, setYear] = useState('');
  const [source, setSource] = useState<'all' | 'dashboard' | 'wordpress'>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get<LibraryDocument[]>('/library/documents').then(setMine).catch((e) => setError(e.message));
    wordpress.fetchAllDocuments()
      .then((docs) => setOlder(docs.map((d) => ({
        key: `wp-${d.id}`, title: d.title, place: d.organization || d.country || '—', year: d.year,
        languages: d.languages, fileUrl: d.fileUrl, source: 'wordpress' as const, hidden: false,
      }))))
      .catch(() => setOlder([]));
  }, []);

  const rows: Row[] = useMemo(() => {
    const orgLabel = (key: string) => options?.organizations.find((o) => o.key === key)?.label || key;
    return [
      ...(mine || []).map((d) => ({
        key: `local-${d.id}`, id: d.id, title: d.title, place: d.country || orgLabel(d.organization), year: d.year,
        languages: d.languages, fileUrl: d.fileUrl, source: 'dashboard' as const, hidden: d.hidden,
      })),
      ...(older || []),
    ];
  }, [mine, older, options]);

  const langName = (code: string) => options?.languages.find((l) => l.code === code)?.name || code.toUpperCase();
  const places = useMemo(() => [...new Set(rows.map((r) => r.place).filter((p) => p !== '—'))].sort(), [rows]);
  const years = useMemo(() => [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a), [rows]);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => (!q || r.title.toLowerCase().includes(q))
    && (!place || r.place === place) && (!year || String(r.year) === year) && (source === 'all' || r.source === source));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const change = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <>
      <PageHeader
        title="Repository"
        description="Laws, policies and strategies in the policy repository. Add new documents here; documents from WordPress are still shown on the website."
        actions={
          <Link to="/admin/repository/new" className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700">
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add document
          </Link>
        }
      />

      {error && <div className="mb-6"><Alert tone="error">{error}</Alert></div>}

      {!mine && !error ? <LoadingState /> : (
        <Card>
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
              <TextInput type="search" placeholder="Search by title…" value={query} onChange={(e) => change(setQuery)(e.target.value)} className="pl-8" aria-label="Search documents" />
            </div>
            <select aria-label="Country or region" value={place} onChange={(e) => change(setPlace)(e.target.value)} className={selectClass}>
              <option value="">All countries and regions</option>
              {places.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select aria-label="Year" value={year} onChange={(e) => change(setYear)(e.target.value)} className={selectClass}>
              <option value="">All years</option>
              {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select aria-label="Source" value={source} onChange={(e) => change(setSource)(e.target.value as typeof source)} className={selectClass}>
              <option value="all">All documents</option>
              <option value="dashboard">Added in the dashboard</option>
              <option value="wordpress">From WordPress</option>
            </select>
          </div>

          <p className="mb-2 text-xs text-neutral-500">
            {filtered.length} document{filtered.length === 1 ? '' : 's'}
            {older === null && ' · loading documents from WordPress…'}
          </p>

          {shown.length === 0 ? (
            <EmptyState title={rows.length ? 'No documents match' : 'No documents yet'} description={rows.length ? 'Try another search or filter.' : 'Click “Add document” to add the first one.'} />
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-y border-neutral-200 bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-6 py-2.5">Document</th>
                    <th className="px-3 py-2.5">Country / region</th>
                    <th className="px-3 py-2.5">Year</th>
                    <th className="px-3 py-2.5">Languages</th>
                    <th className="px-6 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {shown.map((r) => (
                    <tr key={r.key}>
                      <td className="px-6 py-3">
                        <div className="flex items-start gap-2">
                          <DocumentTextIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" aria-hidden="true" />
                          <div>
                            {r.id
                              ? <Link to={`/admin/repository/${r.id}`} className={`font-medium hover:text-primary-700 ${r.hidden ? 'text-neutral-500' : 'text-neutral-900'}`}>{r.title}</Link>
                              : <span className="font-medium text-neutral-900">{r.title}</span>}
                            <span className="ml-2 inline-flex gap-1 align-middle">
                              {r.source === 'wordpress' && <Badge tone="blue">From WordPress</Badge>}
                              {r.hidden && <Badge>Hidden</Badge>}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-neutral-600">{r.place}</td>
                      <td className="px-3 py-3 tabular-nums text-neutral-600">{r.year}</td>
                      <td className="px-3 py-3 text-neutral-600">{r.languages.map(langName).join(', ')}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" title="Open the file"
                          className="mr-1 inline-flex items-center rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800" aria-label={`Open the file of ${r.title}`}>
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                        {r.id && (
                          <Link to={`/admin/repository/${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50">
                            <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-neutral-500">Page {current} of {pages}</span>
              <div className="flex gap-2">
                <Button size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
                <Button size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
              </div>
            </div>
          )}
          {older && older.length > 0 && (
            <p className="mt-6 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
              Documents marked “From WordPress” were added before the dashboard existed. They stay on the website as they are and can only be changed in WordPress.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
