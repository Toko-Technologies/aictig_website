import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { ApiError } from '../api';
import { useAuth } from '../session';
import { Alert, Button, Field, LoadingState, TextInput } from '../ui';

export default function LoginPage() {
  const { user, signIn, sessionEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user === undefined) return <LoadingState />;
  if (user) return <Navigate to={from && from.startsWith('/admin') ? from : '/admin'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center text-center">
          <img src="/aictig-logo-text.svg" alt="AICTiG" className="h-12 w-auto" />
          <h1 className="mt-6 text-xl font-semibold text-neutral-900">Sign in to the website dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">For AICTiG staff who update the website.</p>
        </div>

        <div className="mt-8 rounded-lg border border-neutral-200 bg-white px-6 py-7 shadow-sm">
          <form onSubmit={submit} className="space-y-5" noValidate>
            {sessionEnded && !error && (
              <Alert tone="info">Your session ended. Please sign in again.</Alert>
            )}
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="Email address">
              {({ id }) => (
                <TextInput
                  id={id}
                  type="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
            </Field>

            <Field
              label="Password"
              aside={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700"
                >
                  {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              }
            >
              {({ id }) => (
                <TextInput
                  id={id}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
            </Field>

            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={!email || !password}
              className="w-full"
              icon={<LockClosedIcon className="h-4 w-4" />}
            >
              Sign in
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Forgot your password? Ask another dashboard user or your website administrator to reset it.
        </p>
        <p className="mt-2 text-center text-xs">
          <a href="/" className="font-medium text-secondary-600 hover:text-secondary-700">← Back to the website</a>
        </p>
      </div>
    </div>
  );
}
