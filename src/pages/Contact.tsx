import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckCircleIcon,
  ClockIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  MapPinIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import PageHeader from '../components/PageHeader';
import { getSocialLinks } from '../utils/socialLinks';
import { getSiteSettings } from '../content/siteContent';

const TOPICS = ['general', 'research', 'training', 'partnership', 'media', 'technical'] as const;
type FieldName = 'name' | 'email' | 'topic' | 'message';
const EMPTY = { name: '', email: '', topic: '', message: '', website: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MAX = 5000;

/** "Abuja: 18 Bendel Street…" lines → bold city name + address. */
function AddressLines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const match = line.match(/^([^:：]+)[:：]\s*(.+)$/);
        return (
          <p key={i}>
            {match ? (
              <>
                <span className="font-medium text-neutral-900">{match[1]}:</span> {match[2]}
              </>
            ) : (
              line
            )}
          </p>
        );
      })}
    </>
  );
}

function InfoBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        {icon}
      </div>
      <div className="min-w-0 text-sm text-neutral-600 leading-relaxed">
        <h3 className="mb-1 text-base font-semibold text-neutral-900">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function Contact() {
  const { t, i18n } = useTranslation(['contact', 'common']);
  const { contactEmails } = getSiteSettings();
  const socialLinks = getSocialLinks('h-5 w-5');

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const startedAt = useRef(Date.now());
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({});

  const validate = () => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!form.name.trim()) next.name = t('validation.name');
    if (!EMAIL_RE.test(form.email.trim())) next.email = t('validation.email');
    if (!form.topic) next.topic = t('validation.topic');
    if (form.message.trim().length < 10) next.message = t('validation.message');
    return next;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name as FieldName]) setErrors((errs) => ({ ...errs, [name]: undefined }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    const first = (['name', 'email', 'topic', 'message'] as FieldName[]).find((f) => found[f]);
    if (first) {
      fieldRefs.current[first]?.focus();
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          lang: i18n.language,
          elapsedMs: Date.now() - startedAt.current,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.details?.field) {
          const field = data.details.field as FieldName;
          setErrors({ [field]: t(`validation.${field}`) });
          setStatus('idle');
          fieldRefs.current[field]?.focus();
          return;
        }
        setErrorMessage(res.status === 429 ? t('error.tooMany') : t('error.message'));
        setStatus('error');
        return;
      }
      setStatus('sent');
      setForm(EMPTY);
    } catch {
      setErrorMessage(t('error.message'));
      setStatus('error');
    }
  };

  const inputClass = (field: FieldName) =>
    `block w-full rounded-lg border bg-white px-4 py-3 text-neutral-900 shadow-sm placeholder:text-neutral-400 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
      errors[field] ? 'border-danger-400' : 'border-neutral-300'
    }`;

  const fieldError = (field: FieldName) =>
    errors[field] ? (
      <p id={`${field}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm text-danger-600">
        <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        {errors[field]}
      </p>
    ) : null;

  const label = (field: FieldName, text: string) => (
    <label htmlFor={`contact-${field}`} className="mb-1.5 block text-sm font-medium text-neutral-800">
      {text} <span className="text-danger-500" aria-hidden="true">*</span>
    </label>
  );

  return (
    <>
      <Seo
        title={t('title')}
        description="Get in touch with the African Institute for Cybersecurity & Tele-Informatics Governance. Contact us for research collaboration, consultancy, or partnership inquiries."
      />
      <main className="bg-neutral-50 min-h-screen">
        <PageHeader title={t('title')} subtitle={t('subtitle')} />

        <section className="py-12 md:py-16">
          <div className="container-custom">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
              {/* Contact details */}
              <aside className="lg:col-span-2">
                <div className="rounded-xl border border-neutral-200 bg-white p-6 md:p-8 shadow-sm space-y-8">
                  <h2 className="text-xl font-bold text-neutral-900">{t('info.title')}</h2>

                  {contactEmails.length > 0 && (
                    <InfoBlock icon={<EnvelopeIcon className="h-5 w-5" aria-hidden="true" />} title={t('info.email')}>
                      <ul className="space-y-1">
                        {contactEmails.map((email) => (
                          <li key={email}>
                            <a href={`mailto:${email}`} className="font-medium text-secondary-600 hover:text-secondary-700 hover:underline break-all">
                              {email}
                            </a>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 flex items-start gap-1.5 text-neutral-500">
                        <ClockIcon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        {t('info.response')}
                      </p>
                    </InfoBlock>
                  )}

                  <InfoBlock icon={<MapPinIcon className="h-5 w-5" aria-hidden="true" />} title={t('info.offices')}>
                    <div className="space-y-4">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('common:footer.nigeriaOffice')}</p>
                        <div className="space-y-1">
                          <AddressLines text={t('common:footer.nigeriaAddress')} />
                        </div>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{t('common:footer.southAfricaOffice')}</p>
                        <p>{t('common:footer.southAfricaAddress')}</p>
                      </div>
                    </div>
                  </InfoBlock>

                  {socialLinks.length > 0 && (
                    <div className="border-t border-neutral-100 pt-6">
                      <h3 className="mb-3 text-sm font-semibold text-neutral-900">{t('info.follow')}</h3>
                      <div className="flex flex-wrap gap-2">
                        {socialLinks.map((social) => (
                          <a
                            key={social.name}
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={social.name}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 focus-ring"
                          >
                            {social.icon}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>

              {/* Form */}
              <div className="lg:col-span-3">
                <div className="rounded-xl border border-neutral-200 bg-white p-6 md:p-10 shadow-sm">
                  {status === 'sent' ? (
                    <div className="py-10 text-center" role="status">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-50">
                        <CheckCircleIcon className="h-8 w-8 text-primary-600" aria-hidden="true" />
                      </div>
                      <h2 className="mt-5 text-2xl font-bold text-neutral-900">{t('success.title')}</h2>
                      <p className="mx-auto mt-2 max-w-md text-neutral-600">{t('success.message')}</p>
                      <button
                        type="button"
                        onClick={() => {
                          startedAt.current = Date.now();
                          setStatus('idle');
                        }}
                        className="mt-8 inline-flex items-center rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-ring"
                      >
                        {t('success.again')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-2xl font-bold text-neutral-900">{t('form.title')}</h2>
                      <p className="mt-2 mb-8 text-neutral-600">{t('form.intro')}</p>

                      {status === 'error' && (
                        <div role="alert" className="mb-6 flex gap-3 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800">
                          <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 text-danger-500" aria-hidden="true" />
                          <div>
                            <p>{errorMessage}</p>
                            {contactEmails[0] && (
                              <p className="mt-1">
                                {t('error.emailUs')}{' '}
                                <a href={`mailto:${contactEmails[0]}`} className="font-medium underline">{contactEmails[0]}</a>.
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleSubmit} noValidate className="space-y-6">
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                          <div>
                            {label('name', t('form.name'))}
                            <input
                              ref={(el) => { fieldRefs.current.name = el; }}
                              id="contact-name"
                              name="name"
                              type="text"
                              autoComplete="name"
                              maxLength={120}
                              value={form.name}
                              onChange={handleChange}
                              placeholder={t('form.namePlaceholder')}
                              aria-invalid={!!errors.name}
                              aria-describedby={errors.name ? 'name-error' : undefined}
                              className={inputClass('name')}
                            />
                            {fieldError('name')}
                          </div>
                          <div>
                            {label('email', t('form.email'))}
                            <input
                              ref={(el) => { fieldRefs.current.email = el; }}
                              id="contact-email"
                              name="email"
                              type="email"
                              autoComplete="email"
                              maxLength={254}
                              value={form.email}
                              onChange={handleChange}
                              placeholder={t('form.emailPlaceholder')}
                              aria-invalid={!!errors.email}
                              aria-describedby={errors.email ? 'email-error' : undefined}
                              className={inputClass('email')}
                            />
                            {fieldError('email')}
                          </div>
                        </div>

                        <div>
                          {label('topic', t('form.topic'))}
                          <select
                            ref={(el) => { fieldRefs.current.topic = el; }}
                            id="contact-topic"
                            name="topic"
                            value={form.topic}
                            onChange={handleChange}
                            aria-invalid={!!errors.topic}
                            aria-describedby={errors.topic ? 'topic-error' : undefined}
                            className={`${inputClass('topic')} ${form.topic ? '' : 'text-neutral-400'}`}
                          >
                            <option value="">{t('form.topicPlaceholder')}</option>
                            {TOPICS.map((topic) => (
                              <option key={topic} value={topic} className="text-neutral-900">{t(`topics.${topic}`)}</option>
                            ))}
                          </select>
                          {fieldError('topic')}
                        </div>

                        <div>
                          {label('message', t('form.message'))}
                          <textarea
                            ref={(el) => { fieldRefs.current.message = el; }}
                            id="contact-message"
                            name="message"
                            rows={7}
                            maxLength={MESSAGE_MAX}
                            value={form.message}
                            onChange={handleChange}
                            placeholder={t('form.messagePlaceholder')}
                            aria-invalid={!!errors.message}
                            aria-describedby={errors.message ? 'message-error' : undefined}
                            className={`${inputClass('message')} resize-y`}
                          />
                          <div className="flex items-start justify-between gap-4">
                            <div>{fieldError('message')}</div>
                            <p className="mt-1.5 text-xs tabular-nums text-neutral-400">{form.message.length} / {MESSAGE_MAX}</p>
                          </div>
                        </div>

                        {/* Hidden from people; bots that fill it in are ignored. */}
                        <div className="hidden" aria-hidden="true">
                          <label htmlFor="contact-website">Website</label>
                          <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={handleChange} />
                        </div>

                        <div className="flex flex-col-reverse gap-4 border-t border-neutral-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-neutral-500">
                            {t('form.privacy')}{' '}
                            <Link to="/legal/privacy" className="font-medium text-secondary-600 hover:text-secondary-700 hover:underline">
                              {t('form.privacyLink')}
                            </Link>
                          </p>
                          <button
                            type="submit"
                            disabled={status === 'sending'}
                            className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-primary-300 focus-ring"
                          >
                            <PaperAirplaneIcon className="h-5 w-5" aria-hidden="true" />
                            {status === 'sending' ? t('form.submitting') : t('form.submit')}
                          </button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
