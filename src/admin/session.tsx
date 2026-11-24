/**
 * Dashboard-wide state: who is signed in, notifications ("toasts"), and the
 * warning shown before leaving a page with unsaved changes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { api, setUnauthorizedHandler, type AdminUser } from './api';

// ── Signed-in user ────────────────────────────────────────────────

interface AuthState {
  /** undefined while checking, null when signed out */
  user: AdminUser | null | undefined;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sessionEnded: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null | undefined>(undefined);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    api.get<{ user: AdminUser }>('/me')
      .then((res) => setUser(res.user))
      .catch(() => setUser(null));
    setUnauthorizedHandler(() => {
      setSessionEnded(true);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: AdminUser }>('/login', { email, password });
    setSessionEnded(false);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/logout').catch(() => {});
    setSessionEnded(false);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, signIn, signOut, sessionEnded }), [user, signIn, signOut, sessionEnded]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

// ── Notifications ─────────────────────────────────────────────────

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

const ToastContext = createContext<(tone: Toast['tone'], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const notify = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, tone, message }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-lg"
          >
            {toast.tone === 'success' ? (
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-primary-500" aria-hidden="true" />
            ) : (
              <XCircleIcon className="h-5 w-5 flex-shrink-0 text-danger-500" aria-hidden="true" />
            )}
            <p className="flex-1 text-sm text-neutral-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-neutral-400 hover:text-neutral-600"
              aria-label="Dismiss"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ── Unsaved changes ───────────────────────────────────────────────

const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page and lose them?';

interface UnsavedState {
  setDirty: (dirty: boolean) => void;
  /** Ask before navigating away; returns true if it is OK to continue. */
  confirmLeave: () => boolean;
}

const UnsavedContext = createContext<UnsavedState>({ setDirty: () => {}, confirmLeave: () => true });

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirtyRef = useRef(false);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = LEAVE_MESSAGE;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const value = useMemo<UnsavedState>(() => ({
    setDirty: (dirty) => { dirtyRef.current = dirty; },
    confirmLeave: () => {
      if (!dirtyRef.current) return true;
      const ok = window.confirm(LEAVE_MESSAGE);
      if (ok) dirtyRef.current = false;
      return ok;
    },
  }), []);

  return <UnsavedContext.Provider value={value}>{children}</UnsavedContext.Provider>;
}

/** Register whether the current page has unsaved changes. */
export function useUnsavedChanges(dirty: boolean) {
  const { setDirty, confirmLeave } = useContext(UnsavedContext);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  return confirmLeave;
}

export function useConfirmLeave() {
  return useContext(UnsavedContext).confirmLeave;
}
