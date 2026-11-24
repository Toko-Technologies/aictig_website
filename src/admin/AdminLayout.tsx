import { Fragment, useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Dialog, Transition } from '@headlessui/react';
import {
  ArrowRightOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  Bars3Icon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  HomeIcon,
  InboxIcon,
  BookOpenIcon,
  FolderOpenIcon,
  NewspaperIcon,
  KeyIcon,
  LanguageIcon,
  UserCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { api } from './api';
import { useAuth, useConfirmLeave } from './session';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  end?: boolean;
  /** Show the number of unread contact messages next to this item. */
  badge?: 'unread';
}

const NAV_GROUPS: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: '/admin', label: 'Overview', icon: HomeIcon, end: true }] },
  {
    title: 'Content',
    items: [
      { to: '/admin/news', label: 'News', icon: NewspaperIcon },
      { to: '/admin/publications', label: 'Publications', icon: BookOpenIcon },
      { to: '/admin/repository', label: 'Repository', icon: FolderOpenIcon },
      { to: '/admin/pages', label: 'Website pages', icon: DocumentTextIcon },
      { to: '/admin/team', label: 'Team', icon: UserGroupIcon },
    ],
  },
  {
    title: 'Inbox',
    items: [{ to: '/admin/messages', label: 'Messages', icon: InboxIcon, badge: 'unread' }],
  },
  {
    title: 'Settings',
    items: [
      { to: '/admin/contact', label: 'Contact details', icon: EnvelopeIcon },
      { to: '/admin/translation', label: 'Translation', icon: LanguageIcon },
      { to: '/admin/users', label: 'Users', icon: KeyIcon },
      { to: '/admin/history', label: 'Change history', icon: ClockIcon },
    ],
  },
];

/** Number of unread contact messages, refreshed on every page change. */
function useUnreadCount() {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  useEffect(() => {
    const load = () => {
      api.get<{ unread: number }>('/messages/unread-count').then((r) => setCount(r.unread)).catch(() => {});
    };
    load();
    window.addEventListener('aictig:messages-changed', load);
    return () => window.removeEventListener('aictig:messages-changed', load);
  }, [pathname]);
  return count;
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const confirmLeave = useConfirmLeave();
  const unread = useUnreadCount();
  return (
    <nav aria-label="Dashboard" className="space-y-6">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.title || i}>
          {group.title && (
            <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{group.title}</p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={(e) => {
                    if (!confirmLeave()) e.preventDefault();
                    else onNavigate?.();
                  }}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-primary-600' : 'text-neutral-400 group-hover:text-neutral-500'}`}
                        aria-hidden="true"
                      />
                      {item.label}
                      {item.badge === 'unread' && unread > 0 && (
                        <span className="ml-auto rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
                          {unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <img src="/aictig-logo-text.svg" alt="AICTiG" className="h-9 w-auto" />
      <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-600">
        Dashboard
      </span>
    </div>
  );
}

export default function AdminLayout({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const confirmLeave = useConfirmLeave();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    if (!confirmLeave()) return;
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Mobile menu */}
      <Transition show={menuOpen} as={Fragment}>
        <Dialog onClose={setMenuOpen} className="relative z-50 lg:hidden">
          <Transition.Child
            as={Fragment}
            enter="transition-opacity duration-150"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-neutral-900/40" />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="transition duration-200 ease-out"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition duration-150 ease-in"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <Dialog.Panel className="fixed inset-y-0 left-0 w-72 overflow-y-auto bg-white px-4 py-5 shadow-xl">
              <div className="flex items-center justify-between mb-6 px-2">
                <Brand />
                <button type="button" onClick={() => setMenuOpen(false)} className="p-1 text-neutral-500" aria-label="Close menu">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <Navigation onNavigate={() => setMenuOpen(false)} />
            </Dialog.Panel>
          </Transition.Child>
        </Dialog>
      </Transition>

      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col border-r border-neutral-200 bg-white">
        <div className="flex h-16 items-center px-5 border-b border-neutral-100">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5">
          <Navigation />
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="-ml-1 p-1 text-neutral-600 lg:hidden"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="lg:hidden">
            <img src="/aictig-logo-text.svg" alt="AICTiG" className="h-8 w-auto" />
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-secondary-600 hover:bg-secondary-50"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">View website</span>
            </a>
            <span className="hidden h-6 w-px bg-neutral-200 sm:block" aria-hidden="true" />
            <NavLink
              to="/admin/account"
              onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
              className="hidden items-center gap-1.5 rounded-md px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 md:inline-flex"
              title="My account"
            >
              <UserCircleIcon className="h-5 w-5 text-neutral-400" aria-hidden="true" />
              {user?.name}
            </NavLink>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>

        <main className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children ?? <Outlet />}</div>
        </main>
      </div>
    </div>
  );
}
