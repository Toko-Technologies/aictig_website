import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth, useToast } from '../session';
import { Alert, Button, Card, Field, PageHeader, TextInput } from '../ui';
import { formatDateTime } from '../format';

export default function AccountPage() {
  const { user } = useAuth();
  const notify = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError('The new password must be at least 10 characters long.');
    if (next !== repeat) return setError('The two new passwords do not match.');
    setSaving(true);
    try {
      await api.put('/account/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setRepeat('');
      notify('success', 'Password changed. You were signed out on any other devices.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the password.');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Your details">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-neutral-500">Name</dt>
              <dd className="font-medium text-neutral-900">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Email address (used to sign in)</dt>
              <dd className="font-medium text-neutral-900">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Signed in since</dt>
              <dd className="font-medium text-neutral-900">{formatDateTime(user?.lastLoginAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Change password" description="Use at least 10 characters. A short sentence is easy to remember and hard to guess.">
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Current password">
              {({ id }) => <TextInput id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
            </Field>
            <Field label="New password">
              {({ id }) => <TextInput id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
            </Field>
            <Field label="Repeat new password">
              {({ id }) => <TextInput id={id} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
            </Field>
            <Button type="submit" variant="primary" loading={saving} disabled={!current || !next || !repeat}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
