/**
 * Dashboard UI building blocks. All dashboard screens use these so they look
 * and behave the same. Colours come from the website theme (tailwind.config.js):
 * green (primary) for main actions, blue (secondary) for links, slate (neutral).
 */
import {
  Fragment,
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';

// ── Button ────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm disabled:bg-primary-300',
  secondary: 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50 shadow-sm disabled:text-neutral-400',
  danger: 'bg-white text-danger-600 border border-danger-200 hover:bg-danger-50 shadow-sm disabled:text-danger-300',
  ghost: 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:text-neutral-300',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}) {
  const sizing = size === 'sm' ? 'px-2.5 py-1.5 text-sm gap-1.5' : 'px-4 py-2 text-sm gap-2';
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${sizing} ${buttonStyles[variant]} ${className}`}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-neutral-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ── Layout pieces ─────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-600 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  id,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`bg-white border border-neutral-200 rounded-lg shadow-sm scroll-mt-24 ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-neutral-100">
          <div>
            {title && <h2 className="text-base font-semibold text-neutral-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'blue' | 'amber'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-neutral-100 text-neutral-700',
    green: 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200',
    blue: 'bg-secondary-50 text-secondary-700 ring-1 ring-inset ring-secondary-200',
    amber: 'bg-accent-50 text-accent-800 ring-1 ring-inset ring-accent-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ReactNode;
}) {
  const styles = {
    info: ['bg-secondary-50 border-secondary-200 text-secondary-800', InformationCircleIcon, 'text-secondary-500'],
    success: ['bg-primary-50 border-primary-200 text-primary-800', CheckCircleIcon, 'text-primary-500'],
    warning: ['bg-accent-50 border-accent-200 text-accent-900', ExclamationTriangleIcon, 'text-accent-600'],
    error: ['bg-danger-50 border-danger-200 text-danger-800', XCircleIcon, 'text-danger-500'],
  } as const;
  const [box, Icon, iconColor] = styles[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${box}`}>
      <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── Form fields ───────────────────────────────────────────────────

const inputBase =
  'block w-full rounded-md border bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-neutral-50 disabled:text-neutral-500';

export function Field({
  label,
  help,
  error,
  required,
  badge,
  aside,
  counter,
  children,
  id,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  required?: boolean;
  badge?: ReactNode;
  aside?: ReactNode;
  counter?: { length: number; max: number };
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
  id?: string;
}) {
  const autoId = useId();
  const fieldId = id || autoId;
  const helpId = `${fieldId}-help`;
  const nearLimit = counter && counter.length > counter.max * 0.8;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          {label}
          {required && <span className="text-danger-500" aria-hidden="true">*</span>}
          {badge}
        </label>
        {aside}
      </div>
      {children({ id: fieldId, describedBy: help || error ? helpId : undefined, invalid: !!error })}
      <div id={helpId} className="mt-1.5 flex items-start justify-between gap-3">
        <div className="text-xs">
          {error ? <p className="text-danger-600 font-medium">{error}</p> : help && <p className="text-neutral-500">{help}</p>}
        </div>
        {nearLimit && (
          <p className={`text-xs tabular-nums flex-shrink-0 ${counter.length > counter.max ? 'text-danger-600 font-medium' : 'text-neutral-500'}`}>
            {counter.length} / {counter.max}
          </p>
        )}
      </div>
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ invalid, className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`${inputBase} ${invalid ? 'border-danger-400' : 'border-neutral-300'} ${className}`}
        {...props}
      />
    );
  },
);

/** A textarea that grows with its content. */
export function TextArea({
  invalid,
  className = '',
  minRows = 3,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      aria-invalid={invalid || undefined}
      className={`${inputBase} resize-y leading-relaxed ${invalid ? 'border-danger-400' : 'border-neutral-300'} ${className}`}
      {...props}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${checked ? 'bg-primary-600' : 'bg-neutral-300'}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-neutral-800">{label}</span>
        {description && <span className="block text-neutral-500">{description}</span>}
      </label>
    </div>
  );
}

// ── Sticky save bar ───────────────────────────────────────────────

export function SaveBar({
  visible,
  message,
  onSave,
  onDiscard,
  saving,
  saveLabel = 'Save changes',
}: {
  visible: boolean;
  message: string;
  onSave: () => void;
  onDiscard?: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  if (!visible) return null;
  return (
    <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 mt-8 border-t border-neutral-200 bg-white/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-700">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-500 mr-2 align-middle" aria-hidden="true" />
          {message}
        </p>
        <div className="flex gap-2">
          {onDiscard && (
            <Button onClick={onDiscard} disabled={saving}>
              Discard
            </Button>
          )}
          <Button variant="primary" onClick={onSave} loading={saving}>
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={busy ? () => {} : onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-150"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-neutral-900/40" aria-hidden="true" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-150"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-100"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <Dialog.Title className="text-base font-semibold text-neutral-900">{title}</Dialog.Title>
              <div className="mt-2 text-sm text-neutral-600">{children}</div>
              <div className="mt-6 flex justify-end gap-2">
                <Button onClick={onClose} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant={danger ? 'danger' : 'primary'}
                  className={danger ? '!bg-danger-600 !text-white !border-danger-600 hover:!bg-danger-700' : ''}
                  onClick={onConfirm}
                  loading={busy}
                >
                  {confirmLabel}
                </Button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  );
}
