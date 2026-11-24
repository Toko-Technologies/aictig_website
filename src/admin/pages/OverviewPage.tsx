import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenIcon,
  DocumentArrowUpIcon,
  HomeModernIcon,
  NewspaperIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, ExclamationTriangleIcon, MinusCircleIcon } from '@heroicons/react/20/solid';
import { api, type HistoryEntry, type TranslationStatus } from '../api';
import { useAuth } from '../session';
import { Alert, Card, EmptyState, LoadingState, PageHeader } from '../ui';
import { timeAgo } from '../format';

interface Overview {
  editedTexts: number;
  teamMembers: number;
  hiddenTeamMembers: number;
  users: number;
  unreadMessages: number;
  library: { news: number; publications: number; documents: number };
  translation: TranslationStatus;
  recentChanges: HistoryEntry[];
}

const ACTIONS: { to: string; label: string; hint: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/admin/news/new', label: 'Add a news article', hint: 'Shown on the News page', icon: NewspaperIcon },
  { to: '/admin/repository/new', label: 'Add a document', hint: 'Law, policy or strategy', icon: DocumentArrowUpIcon },
  { to: '/admin/publications/new', label: 'Add a publication', hint: 'Article, brief or report', icon: BookOpenIcon },
  { to: '/admin/pages/home', label: 'Edit the home page', hint: 'Banner and section texts', icon: HomeModernIcon },
];

function StatusLine({ state, children }: { state: 'ok' | 'off' | 'problem'; children: ReactNode }) {
  const Icon = state === 'ok' ? CheckCircleIcon : state === 'off' ? MinusCircleIcon : ExclamationTriangleIcon;
  const color = state === 'ok' ? 'text-primary-500' : state === 'off' ? 'text-neutral-400' : 'text-accent-500';
  return (
    <li className="flex items-start gap-2.5 py-2.5 text-sm text-neutral-700">
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${color}`} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Overview>('/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ''}`}
        description="What would you like to do? Changes appear on the website as soon as you save or publish them."
      />

      {error && <div className="mb-6"><Alert tone="error">{error}</Alert></div>}

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to}
            className="group flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-primary-300 hover:shadow">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 group-hover:bg-primary-100">
              <a.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-900">{a.label}</span>
              <span className="block text-xs text-neutral-500">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {data && data.unreadMessages > 0 && (
            <Link to="/admin/messages" className="flex items-center justify-between gap-4 rounded-lg border border-primary-200 bg-primary-50 px-5 py-4 hover:bg-primary-100/60">
              <span className="text-sm text-primary-900">
                <span className="font-semibold">{data.unreadMessages} new message{data.unreadMessages === 1 ? '' : 's'}</span> from the contact form
              </span>
              <span className="text-sm font-medium text-primary-700">Read →</span>
            </Link>
          )}

          <Card title="Status">
            {!data ? <LoadingState /> : (
              <ul className="-my-2 divide-y divide-neutral-100">
                <StatusLine state="ok">
                  Added in the dashboard: {data.library.news} news article{data.library.news === 1 ? '' : 's'}, {data.library.publications} publication{data.library.publications === 1 ? '' : 's'} and {data.library.documents} repository document{data.library.documents === 1 ? '' : 's'}.
                  Older items from WordPress are still shown on the website.
                </StatusLine>
                {data.translation.enabled ? (
                  <StatusLine state={data.translation.lastError ? 'problem' : 'ok'}>
                    Automatic translation is on ({data.translation.provider}).{' '}
                    {data.translation.lastError
                      ? <Link to="/admin/translation" className="font-medium text-secondary-600 hover:text-secondary-700">See the latest message</Link>
                      : 'English changes are translated into the other languages.'}
                  </StatusLine>
                ) : (
                  <StatusLine state="off">
                    Automatic translation is off.{' '}
                    <Link to="/admin/translation" className="font-medium text-secondary-600 hover:text-secondary-700">Switch it on</Link>
                  </StatusLine>
                )}
                <StatusLine state="ok">
                  {data.teamMembers} team member{data.teamMembers === 1 ? '' : 's'} on the About page
                  {data.hiddenTeamMembers ? ` (${data.hiddenTeamMembers} hidden)` : ''}.
                </StatusLine>
                <StatusLine state="ok">
                  {data.editedTexts} website text{data.editedTexts === 1 ? '' : 's'} changed from the original wording.
                </StatusLine>
              </ul>
            )}
          </Card>
        </div>

        <Card className="lg:self-start" title="Recent changes" actions={<Link to="/admin/history" className="text-sm font-medium text-secondary-600 hover:text-secondary-700">View all</Link>}>
          {!data && !error && <LoadingState />}
          {data && data.recentChanges.length === 0 && <EmptyState title="No changes yet" description="Changes you make will be listed here." />}
          {data && data.recentChanges.length > 0 && (
            <ul className="-my-2 divide-y divide-neutral-100">
              {data.recentChanges.map((entry) => (
                <li key={entry.id} className="py-3">
                  <p className="text-sm text-neutral-800">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">{entry.user || 'System'} · {timeAgo(entry.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
