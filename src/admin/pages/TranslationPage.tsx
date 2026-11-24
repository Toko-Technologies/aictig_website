import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { api, ApiError, type TranslationSettings, type TranslationStatus } from '../api';
import { useToast, useUnsavedChanges } from '../session';
import { Alert, Badge, Button, Card, Field, LoadingState, PageHeader, SaveBar, TextArea, TextInput, Toggle } from '../ui';
import { timeAgo } from '../format';

function toForm(s: TranslationSettings) {
  return { enabled: s.enabled, email: s.email, keepTerms: s.keepTerms.join('\n') };
}

export default function TranslationPage() {
  const notify = useToast();
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [form, setForm] = useState<ReturnType<typeof toForm> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get<TranslationStatus>('/translation').then((s) => {
    setStatus(s);
    return s;
  }), []);

  useEffect(() => {
    load().then((s) => setForm(toForm(s.settings))).catch((e) => setError(e.message));
  }, [load]);

  // While translations run, refresh every few seconds.
  useEffect(() => {
    if (!status?.busy) return undefined;
    const timer = window.setTimeout(() => { load().catch(() => {}); }, 2500);
    return () => window.clearTimeout(timer);
  }, [status, load]);

  const dirty = useMemo(
    () => !!form && !!status && JSON.stringify(form) !== JSON.stringify(toForm(status.settings)),
    [form, status],
  );
  useUnsavedChanges(dirty);

  if (!status || !form) return error ? <Alert tone="error">{error}</Alert> : <LoadingState />;

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.put<TranslationStatus>('/translation/settings', {
        enabled: form.enabled,
        email: form.email.trim(),
        keepTerms: form.keepTerms.split('\n').map((t) => t.trim()).filter(Boolean),
      });
      setStatus(next);
      setForm(toForm(next.settings));
      notify('success', 'Translation settings saved.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      setStatus(await api.post<TranslationStatus>('/translation/run'));
      notify('success', 'Translating the out-of-date texts now. This page updates when it is done.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not start the translation.');
    }
  };

  const free = status.providerId === 'mymemory';
  const usedPct = status.usage ? Math.min(100, Math.round((status.usage.today / status.usage.limit) * 100)) : 0;

  return (
    <>
      <PageHeader
        title="Translation"
        description={`How texts you change in English reach the other ${status.languages.length} languages (${status.languages.join(', ')}).`}
      />

      <div className="space-y-6">
        <Card
          title="Status"
          actions={status.enabled
            ? (status.busy ? <Badge tone="blue">Translating…</Badge> : <Badge tone="green">On</Badge>)
            : <Badge>Off</Badge>}
        >
          <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-neutral-500">Translation service</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">{status.provider}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Texts waiting for translation</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">{status.outdated}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Last translation run</dt>
              <dd className="mt-0.5 font-medium text-neutral-900">
                {status.lastRunAt ? timeAgo(status.lastRunAt) : 'Not yet'}
                {status.lastResult && status.lastResult.translated > 0 && (
                  <span className="font-normal text-neutral-500"> · {status.lastResult.translated} translated</span>
                )}
              </dd>
            </div>
          </dl>

          {status.usage && (
            <div className="mt-6">
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="text-neutral-600">Free allowance used today</span>
                <span className="tabular-nums text-neutral-900">
                  {status.usage.today.toLocaleString()} / {status.usage.limit.toLocaleString()} characters
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-full rounded-full ${usedPct > 90 ? 'bg-accent-500' : 'bg-primary-500'}`} style={{ width: `${usedPct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-neutral-500">Resets every day. Sentences that were translated before are reused and do not count again.</p>
            </div>
          )}

          {status.lastError && <div className="mt-6"><Alert tone="warning">{status.lastError}</Alert></div>}

          {status.enabled && status.outdated > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md bg-neutral-50 px-4 py-3">
              <p className="text-sm text-neutral-700">
                {status.outdated} translation{status.outdated === 1 ? ' is' : 's are'} missing or older than the English text.
                They are retried automatically every hour.
              </p>
              <Button size="sm" icon={<ArrowPathIcon className="h-4 w-4" />} onClick={runNow} disabled={status.busy}>
                Translate now
              </Button>
            </div>
          )}
        </Card>

        <Card title="Settings">
          <div className="space-y-6">
            <Toggle
              checked={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
              label="Translate English changes automatically"
              description="When off, each language is edited separately and nothing is sent to the translation service."
            />

            {free && (
              <Field
                label="Contact email for the translation service"
                help="Optional but recommended: with an email address the free limit rises from 5,000 to 50,000 characters a day. MyMemory only uses it to contact you if there is a problem."
              >
                {({ id }) => (
                  <TextInput id={id} type="email" placeholder="webmaster@aictig.org" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} />
                )}
              </Field>
            )}

            <Field
              label="Words that must never be translated"
              help="One per line. Use this for names of people, organisations and products, for example TETRALEX. Web addresses, email addresses and {{year}} are always kept automatically."
            >
              {({ id }) => (
                <TextArea id={id} minRows={4} value={form.keepTerms}
                  onChange={(e) => setForm({ ...form, keepTerms: e.target.value })} />
              )}
            </Field>
          </div>
        </Card>

        <Card title="Good to know">
          <ul className="list-disc space-y-2 pl-5 text-sm text-neutral-600">
            <li>Automatic translations are marked <strong>Auto-translated</strong> in the page editor. Check important texts, especially headings, and correct them by hand if needed. A text you correct by hand is never overwritten.</li>
            <li>Office addresses and the example name and email in the contact form are copied as they are, not translated.</li>
            <li>A translation is not saved if a protected word or {'{{year}}'} went missing. The text then keeps its previous wording.</li>
            {free && <li>Texts are translated by MyMemory (Translated srl, Italy), which keeps the texts it receives. Only public website texts are sent, never messages or personal data.</li>}
          </ul>
        </Card>
      </div>

      <SaveBar visible={dirty} message="You have unsaved changes" onSave={save} onDiscard={() => setForm(toForm(status.settings))} saving={saving} />
    </>
  );
}
