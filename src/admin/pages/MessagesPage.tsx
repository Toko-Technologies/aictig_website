import { useEffect, useState } from 'react';
import {
  ArrowUturnLeftIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  InboxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { api, type ContactMessage } from '../api';
import { useToast } from '../session';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, LoadingState, PageHeader } from '../ui';
import { formatDateTime, timeAgo } from '../format';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', pt: 'Portuguese', ar: 'Arabic', sw: 'Swahili', ru: 'Russian', zh: 'Chinese',
};

/** Tell the menu badge to refresh its unread count. */
function announceUnreadChange() {
  window.dispatchEvent(new Event('aictig:messages-changed'));
}

export default function MessagesPage() {
  const notify = useToast();
  const [messages, setMessages] = useState<ContactMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<ContactMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get<{ messages: ContactMessage[] }>('/messages')
      .then((res) => setMessages(res.messages))
      .catch((e) => setError(e.message));
  }, []);

  const replace = (updated: ContactMessage) =>
    setMessages((list) => list && list.map((m) => (m.id === updated.id ? updated : m)));

  const setRead = async (message: ContactMessage, read: boolean) => {
    try {
      replace(await api.put<ContactMessage>(`/messages/${message.id}`, { read }));
      announceUnreadChange();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not update this message.');
    }
  };

  const open = (message: ContactMessage) => {
    setSelectedId(message.id);
    if (!message.readAt) setRead(message, true);
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/messages/${toDelete.id}`);
      setMessages((list) => list && list.filter((m) => m.id !== toDelete.id));
      if (selectedId === toDelete.id) setSelectedId(null);
      announceUnreadChange();
      notify('success', 'Message deleted.');
      setToDelete(null);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not delete this message.');
    } finally {
      setDeleting(false);
    }
  };

  const unread = messages ? messages.filter((m) => !m.readAt).length : 0;
  const shown = messages ? messages.filter((m) => filter === 'all' || !m.readAt) : [];
  const selected = messages?.find((m) => m.id === selectedId) || null;

  return (
    <>
      <PageHeader
        title="Messages"
        description="Messages sent through the contact form on the website. To answer, click “Reply by email”: your email program opens with the visitor’s address filled in."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!messages && !error && <LoadingState />}

      {messages && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-2 self-start">
            <div className="-mx-6 -mt-5 mb-3 flex gap-1 border-b border-neutral-100 px-4 pt-3">
              {(['all', 'unread'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium ${
                    filter === value ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {value === 'all' ? `All (${messages.length})` : `Unread (${unread})`}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <EmptyState
                title={filter === 'unread' ? 'No unread messages' : 'No messages yet'}
                description={filter === 'unread' ? 'You have read everything.' : 'Messages from the contact form will appear here.'}
              />
            ) : (
              <ul className="-mx-6 -mb-5 divide-y divide-neutral-100">
                {shown.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => open(m)}
                      className={`w-full px-6 py-3.5 text-left transition-colors ${
                        selectedId === m.id ? 'bg-primary-50' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className={`truncate text-sm ${m.readAt ? 'text-neutral-700' : 'font-semibold text-neutral-900'}`}>
                          {!m.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary-600 align-middle" aria-label="Unread" />}
                          {m.name}
                        </p>
                        <span className="flex-shrink-0 text-xs text-neutral-400">{timeAgo(m.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-neutral-500">{m.topicLabel}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-neutral-500">{m.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="lg:col-span-3">
            {selected ? (
              <Card
                title={selected.name}
                description={<>{selected.topicLabel} · {formatDateTime(selected.createdAt)}</>}
                actions={selected.readAt ? <Badge>Read</Badge> : <Badge tone="green">New</Badge>}
              >
                <dl className="mb-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-neutral-500">Email address</dt>
                    <dd className="font-medium text-neutral-900 break-all">{selected.email}</dd>
                  </div>
                  {selected.lang && (
                    <div>
                      <dt className="text-neutral-500">Website language they used</dt>
                      <dd className="font-medium text-neutral-900">{LANGUAGE_NAMES[selected.lang] || selected.lang}</dd>
                    </div>
                  )}
                </dl>
                <div className="whitespace-pre-line rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-800">
                  {selected.message}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <a
                    href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.topicLabel}`)}`}
                    className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  >
                    <ArrowUturnLeftIcon className="h-4 w-4" aria-hidden="true" />
                    Reply by email
                  </a>
                  <Button
                    icon={selected.readAt ? <EnvelopeIcon className="h-4 w-4" /> : <EnvelopeOpenIcon className="h-4 w-4" />}
                    onClick={() => setRead(selected, !selected.readAt)}
                  >
                    {selected.readAt ? 'Mark as unread' : 'Mark as read'}
                  </Button>
                  <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={() => setToDelete(selected)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
                <InboxIcon className="h-10 w-10 text-neutral-300" aria-hidden="true" />
                <p className="mt-3 text-sm text-neutral-500">Choose a message on the left to read it.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this message?"
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      >
        The message from {toDelete?.name} will be deleted permanently.
      </ConfirmDialog>
    </>
  );
}
