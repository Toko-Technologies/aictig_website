import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { api, ApiError, type ContentValue, type TranslationStatus } from '../api';
import { contentSchema, getPage, maxLengthFor, type SchemaField } from '../schema';
import { useToast, useUnsavedChanges } from '../session';
import { Alert, Badge, Card, Field, LoadingState, PageHeader, SaveBar, TextArea, TextInput } from '../ui';
import { formatDateTime } from '../format';

type Values = Record<string, ContentValue>;

function savedText(value: ContentValue) {
  return value.override ?? value.original;
}

function validateDraft(field: SchemaField, draft: string): string | null {
  const text = draft.trim();
  if (!text) return 'This cannot be empty. Use “Restore original” to go back to the original wording.';
  const max = maxLengthFor(field);
  if (text.length > max) return `Too long: ${text.length} characters (maximum ${max}).`;
  if (!field.multiline && text.includes('\n')) return 'This must be a single line.';
  if (field.key === 'common:footer.copyright' && !text.includes('{{year}}')) return 'Keep {{year}} in the text.';
  return null;
}

export default function PageEditorPage() {
  const { pageId } = useParams();
  const page = getPage(pageId);
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = contentSchema.languages.some((l) => l.code === searchParams.get('lang')) ? searchParams.get('lang')! : 'en';
  const language = contentSchema.languages.find((l) => l.code === lang)!;
  const notify = useToast();

  const [values, setValues] = useState<Values | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [translation, setTranslation] = useState<TranslationStatus | null>(null);

  useEffect(() => {
    api.get<TranslationStatus>('/translation').then(setTranslation).catch(() => {});
  }, []);

  /** After an English save: wait for the background translation and report the result. */
  const followTranslation = () => {
    const started = Date.now();
    const check = () => {
      api.get<TranslationStatus>('/translation')
        .then((status) => {
          setTranslation(status);
          if (status.busy && Date.now() - started < 5 * 60 * 1000) {
            window.setTimeout(check, 2000);
          } else if (status.lastError) {
            notify('error', status.lastError);
          } else if (!status.busy) {
            notify('success', 'Translations updated in all languages.');
          }
        })
        .catch(() => {});
    };
    window.setTimeout(check, 1500);
  };

  const fieldsByKey = useMemo(() => {
    const map = new Map<string, SchemaField>();
    page?.sections.forEach((s) => s.fields.forEach((f) => map.set(f.key, f)));
    return map;
  }, [page]);

  const resetFrom = useCallback((next: Values) => {
    setValues(next);
    const d: Record<string, string> = {};
    fieldsByKey.forEach((_, key) => { d[key] = next[key] ? savedText(next[key]) : ''; });
    setDrafts(d);
    setErrors({});
  }, [fieldsByKey]);

  useEffect(() => {
    if (!page) return;
    let active = true;
    setValues(null);
    setLoadError(null);
    setQuery('');
    api.get<{ values: Values }>(`/content/${lang}`)
      .then((res) => { if (active) resetFrom(res.values); })
      .catch((e) => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [page, lang, resetFrom]);

  const changedKeys = useMemo(() => {
    if (!values) return [];
    return [...fieldsByKey.keys()].filter((key) => values[key] && drafts[key] !== savedText(values[key]));
  }, [values, drafts, fieldsByKey]);

  const confirmLeave = useUnsavedChanges(changedKeys.length > 0);

  if (!page) return <Navigate to="/admin" replace />;

  const setDraft = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  const changeLanguage = (code: string) => {
    if (code === lang || !confirmLeave()) return;
    setSearchParams(code === 'en' ? {} : { lang: code });
  };

  const scrollToField = (key: string) => {
    document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const save = async () => {
    if (!values) return;
    const problems: Record<string, string> = {};
    for (const key of changedKeys) {
      const problem = validateDraft(fieldsByKey.get(key)!, drafts[key]);
      if (problem) problems[key] = problem;
    }
    if (Object.keys(problems).length) {
      setErrors(problems);
      scrollToField(Object.keys(problems)[0]);
      return;
    }
    const changes: Record<string, string | null> = {};
    for (const key of changedKeys) {
      const draft = drafts[key].trim();
      changes[key] = draft === values[key].original.trim() ? null : draft;
    }
    setSaving(true);
    try {
      const res = await api.put<{ changed: number; values: Values }>(`/content/${lang}`, { changes });
      resetFrom(res.values);
      if (!res.changed) {
        notify('success', 'Nothing needed saving.');
      } else if (lang === 'en' && translation?.enabled) {
        notify('success', `Saved. Now translating into the other ${translation.languages.length} languages…`);
        followTranslation();
      } else {
        notify('success', `Saved. The ${page.label.toLowerCase()} now shows your changes.`);
      }
    } catch (err) {
      const key = err instanceof ApiError ? err.details?.key : undefined;
      if (key) {
        setErrors({ [key]: (err as ApiError).message });
        scrollToField(key);
      } else {
        notify('error', err instanceof Error ? err.message : 'Could not save. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const sections = page.sections
    .map((section) => ({
      ...section,
      fields: q
        ? section.fields.filter((f) => f.label.toLowerCase().includes(q) || (drafts[f.key] || '').toLowerCase().includes(q))
        : section.fields,
    }))
    .filter((section) => section.fields.length > 0);
  const totalFields = page.sections.reduce((n, s) => n + s.fields.length, 0);

  return (
    <>
      <PageHeader
        title={page.label}
        description={page.description}
        actions={
          <>
            <label className="sr-only" htmlFor="language">Language</label>
            <select
              id="language"
              value={lang}
              onChange={(e) => changeLanguage(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-neutral-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {contentSchema.languages.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
            <a
              href={page.path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
              View page
            </a>
          </>
        }
      />

      <div className="mb-6">
        <Alert tone="info">
          You are editing the <strong>{language.name}</strong> version.{' '}
          {lang === 'en' && translation?.enabled &&
            `When you save, your changes are translated automatically into the other ${translation.languages.length} languages. Texts that someone changed by hand in another language are left as they are.`}
          {lang === 'en' && translation && !translation.enabled &&
            'Automatic translation is off, so visitors who choose another language keep seeing that language’s own text. To change it too, choose the language in the language menu.'}
          {lang !== 'en' && translation?.enabled &&
            'Texts marked “Auto-translated” follow the English automatically. If you change one here, your wording is kept and it is no longer updated automatically.'}
          {lang !== 'en' && translation && !translation.enabled &&
            'Texts that were never translated show the English wording until you change them here.'}
        </Alert>
      </div>

      {loadError && <Alert tone="error">{loadError}</Alert>}
      {!values && !loadError && <LoadingState />}

      {values && (
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
          {/* Section shortcuts */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              {totalFields > 12 && (
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
                  <TextInput
                    type="search"
                    placeholder="Find a text…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-8"
                    aria-label="Find a text on this page"
                  />
                </div>
              )}
              <nav aria-label="Sections on this page">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Sections</p>
                <ul className="space-y-0.5 border-l border-neutral-200">
                  {page.sections.map((section) => {
                    const pending = section.fields.filter((f) => changedKeys.includes(f.key)).length;
                    return (
                      <li key={section.id}>
                        <a
                          href={`#section-${section.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setQuery('');
                            window.setTimeout(() => document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: 'smooth' }), 0);
                          }}
                          className="-ml-px flex items-center justify-between gap-2 border-l-2 border-transparent py-1 pl-3 text-sm text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
                        >
                          <span className="truncate">{section.label}</span>
                          {pending > 0 && (
                            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-accent-500" title={`${pending} unsaved`} />
                          )}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>
          </aside>

          <div className="space-y-6 min-w-0">
            {totalFields > 12 && (
              <div className="relative lg:hidden">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" aria-hidden="true" />
                <TextInput type="search" placeholder="Find a text…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" aria-label="Find a text on this page" />
              </div>
            )}

            {sections.length === 0 && (
              <Card><p className="text-sm text-neutral-500">No texts match “{query}”.</p></Card>
            )}

            {sections.map((section) => (
              <Card key={section.id} id={`section-${section.id}`} title={section.label} description={section.description}>
                <div className="space-y-6">
                  {section.fields.map((field) => {
                    const value = values[field.key];
                    if (!value) return null;
                    const draft = drafts[field.key] ?? '';
                    const changed = draft !== savedText(value);
                    const differsFromOriginal = draft.trim() !== value.original.trim();
                    const max = maxLengthFor(field);
                    return (
                      <div key={field.key} id={`field-${field.key}`} className="scroll-mt-28">
                        <Field
                          label={field.label}
                          help={field.help}
                          error={errors[field.key]}
                          counter={{ length: draft.trim().length, max }}
                          badge={
                            changed ? <Badge tone="amber">Not saved</Badge>
                              : value.source === 'auto' ? (
                                <span title="Translated automatically from the English text. If you change it here, it keeps your wording and is no longer updated automatically.">
                                  <Badge tone="blue">Auto-translated</Badge>
                                </span>
                              )
                              : value.override !== null ? (
                                <span title={value.updatedAt ? `Changed ${formatDateTime(value.updatedAt)}${value.updatedBy ? ` by ${value.updatedBy}` : ''}` : undefined}>
                                  <Badge tone="green">Edited</Badge>
                                </span>
                              ) : null
                          }
                          aside={
                            differsFromOriginal && value.original ? (
                              <button
                                type="button"
                                onClick={() => setDraft(field.key, value.original)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-secondary-600 hover:text-secondary-700"
                                title={`Original: ${value.original}`}
                              >
                                <ArrowUturnLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                Restore original
                              </button>
                            ) : null
                          }
                        >
                          {({ id, describedBy, invalid }) =>
                            field.multiline ? (
                              <TextArea
                                id={id}
                                aria-describedby={describedBy}
                                invalid={invalid}
                                minRows={2}
                                value={draft}
                                onChange={(e) => setDraft(field.key, e.target.value)}
                              />
                            ) : (
                              <TextInput
                                id={id}
                                aria-describedby={describedBy}
                                invalid={invalid}
                                value={draft}
                                onChange={(e) => setDraft(field.key, e.target.value)}
                              />
                            )
                          }
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}

            <SaveBar
              visible={changedKeys.length > 0}
              message={`${changedKeys.length} unsaved change${changedKeys.length === 1 ? '' : 's'} (${language.name})`}
              onSave={save}
              onDiscard={() => values && resetFrom(values)}
              saving={saving}
            />
          </div>
        </div>
      )}
    </>
  );
}
