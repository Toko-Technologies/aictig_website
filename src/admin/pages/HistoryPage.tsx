import { useEffect, useState } from 'react';
import { Disclosure } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { api, type HistoryEntry } from '../api';
import { Alert, Card, EmptyState, LoadingState, PageHeader } from '../ui';
import { formatDateTime } from '../format';

function TextChange({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <p className="text-xs font-semibold text-neutral-700">{label}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Before</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-500 line-through decoration-neutral-300">{before}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">After</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-900">{after}</p>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<HistoryEntry[]>('/history?limit=200').then(setEntries).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Change history"
        description="Every change made in this dashboard, newest first. Use it to see who changed what, and to copy back an earlier wording if needed."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {!entries && !error && <LoadingState />}
      {entries && (
        <Card>
          {entries.length === 0 ? (
            <EmptyState title="No changes yet" />
          ) : (
            <ul className="-my-5 divide-y divide-neutral-100">
              {entries.map((entry) => {
                const changes = entry.details?.changes;
                return (
                  <li key={entry.id} className="py-4">
                    <Disclosure>
                      {({ open }) => (
                        <>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-neutral-900">{entry.summary}</p>
                              <p className="mt-0.5 text-xs text-neutral-500">
                                {entry.user || 'System'} · {formatDateTime(entry.at)}
                              </p>
                            </div>
                            {changes && changes.length > 0 && (
                              <Disclosure.Button className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700">
                                {open ? 'Hide details' : 'Show details'}
                                <ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                              </Disclosure.Button>
                            )}
                          </div>
                          {changes && (
                            <Disclosure.Panel className="mt-3 space-y-2">
                              {changes.map((c) => (
                                <TextChange key={c.key} label={c.label} before={c.before} after={c.after} />
                              ))}
                            </Disclosure.Panel>
                          )}
                        </>
                      )}
                    </Disclosure>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
