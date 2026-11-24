import { useEffect, useState, type FormEvent } from 'react';
import { TrashIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { api, ApiError, type AdminUser } from '../api';
import { useAuth, useToast } from '../session';
import { Alert, Badge, Button, Card, ConfirmDialog, Field, LoadingState, PageHeader, TextInput } from '../ui';
import { timeAgo } from '../format';

export default function UsersPage() {
  const { user: me } = useAuth();
  const notify = useToast();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<AdminUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = () => api.get<AdminUser[]>('/users').then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setAdding(true);
    try {
      const created = await api.post<AdminUser>('/users', form);
      setForm({ name: '', email: '', password: '' });
      notify('success', `${created.name} can now sign in with ${created.email}.`);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not add this user.');
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!toRemove) return;
    setRemoving(true);
    try {
      await api.delete(`/users/${toRemove.id}`);
      notify('success', `${toRemove.name} can no longer sign in.`);
      setToRemove(null);
      load();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not remove this user.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard users"
        description="People who can sign in to this dashboard. Everyone listed here can change the website, so only add people you trust."
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="People with access">
            {!users && !error && <LoadingState />}
            {users && (
              <ul className="-my-5 divide-y divide-neutral-100">
                {users.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        {u.name}
                        {u.id === me?.id && <Badge tone="blue">You</Badge>}
                      </p>
                      <p className="text-sm text-neutral-500">{u.email}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">Last signed in: {timeAgo(u.lastLoginAt)}</p>
                    </div>
                    {u.id !== me?.id && (
                      <Button variant="ghost" size="sm" icon={<TrashIcon className="h-4 w-4" />} onClick={() => setToRemove(u)}>
                        Remove access
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Add a person" description="Give them the email and password below. They should change the password after their first sign-in, under “My account”.">
          <form onSubmit={add} className="space-y-4" noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <Field label="Full name" required>
              {({ id }) => <TextInput id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
            </Field>
            <Field label="Email address" required>
              {({ id }) => <TextInput id={id} type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
            </Field>
            <Field label="Temporary password" required help="At least 10 characters.">
              {({ id }) => <TextInput id={id} type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            </Field>
            <Button type="submit" variant="primary" loading={adding} icon={<UserPlusIcon className="h-4 w-4" />} className="w-full">
              Give access
            </Button>
          </form>
        </Card>
      </div>

      <ConfirmDialog
        open={!!toRemove}
        title={`Remove access for ${toRemove?.name}?`}
        confirmLabel="Remove access"
        danger
        busy={removing}
        onConfirm={remove}
        onClose={() => setToRemove(null)}
      >
        They will be signed out and will no longer be able to sign in. The changes they made stay on the website.
      </ConfirmDialog>
    </>
  );
}
