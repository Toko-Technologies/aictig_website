import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, ArrowUpTrayIcon, DocumentTextIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { api, ApiError, type LibraryDocument } from '../api';
import { useToast, useUnsavedChanges } from '../session';
import { Alert, Badge, Button, Card, ConfirmDialog, Field, LoadingState, PageHeader, SaveBar, TextArea, TextInput, Toggle } from '../ui';
import { formatSize, useLibraryOptions } from '../library';

interface Form {
  title: string;
  summary: string;
  year: string;
  scope: 'country' | 'organization';
  country: string;
  organization: string;
  languages: string[];
  themes: string[];
  visible: boolean;
}

const EMPTY: Form = { title: '', summary: '', year: '', scope: 'country', country: '', organization: '', languages: ['en'], themes: [], visible: true };
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear + 2 - 1960 }, (_, i) => String(thisYear + 1 - i));
const selectClass = 'block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

const toForm = (d: LibraryDocument): Form => ({
  title: d.title, summary: d.summary, year: String(d.year), scope: d.organization ? 'organization' : 'country',
  country: d.country, organization: d.organization, languages: d.languages, themes: d.themes, visible: !d.hidden,
});

function Checkboxes({ items, selected, onChange, label }: {
  items: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((s) => s !== value) : [...selected, value]);
  return (
    <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-3" role="group" aria-label={label}>
      {items.map((item) => (
        <label key={item.value} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={selected.includes(item.value)} onChange={() => toggle(item.value)}
            className="h-4 w-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500" />
          {item.label}
        </label>
      ))}
    </div>
  );
}

export default function DocumentEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const notify = useToast();
  const { options, error: optionsError } = useLibraryOptions();
  const [doc, setDoc] = useState<LibraryDocument | null>(null);
  const [initial, setInitial] = useState<Form | null>(isNew ? EMPTY : null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [newTheme, setNewTheme] = useState('');
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) return;
    api.get<LibraryDocument>(`/library/documents/${id}`)
      .then((d) => { setDoc(d); setInitial(toForm(d)); setForm(toForm(d)); })
      .catch((e) => setError(e.message));
  }, [id, isNew]);

  const dirty = useMemo(() => !!initial && (JSON.stringify(form) !== JSON.stringify(initial) || !!file), [form, initial, file]);
  useUnsavedChanges(dirty && !saving && !deleting);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const themeItems = useMemo(
    () => [...new Set([...(options?.themes || []), ...form.themes])].sort((a, b) => a.localeCompare(b)).map((t) => ({ value: t, label: t })),
    [options, form.themes],
  );

  if (optionsError) return <Alert tone="error">{optionsError}</Alert>;
  if (!initial || !options) return error ? <Alert tone="error">{error}</Alert> : <LoadingState />;

  const mainLanguages = ['en', 'fr', 'pt', 'ar', 'sw', 'ha'];
  const languageItems = options.languages
    .filter((l) => showAllLanguages || mainLanguages.includes(l.code) || form.languages.includes(l.code))
    .map((l) => ({ value: l.code, label: l.name }));

  const save = async () => {
    setError(null);
    const missing = [
      isNew && !file && 'the file',
      !form.title.trim() && 'a title',
      !form.year && 'the year',
      form.scope === 'country' ? !form.country && 'the country' : !form.organization && 'the region or organisation',
      !form.languages.length && 'a language',
    ].filter(Boolean);
    if (missing.length) {
      setError(`Please add ${missing.join(', ')}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const data = {
      title: form.title,
      summary: form.summary,
      year: Number(form.year),
      country: form.scope === 'country' ? form.country : '',
      organization: form.scope === 'organization' ? form.organization : '',
      languages: form.languages,
      themes: form.themes,
      hidden: !form.visible,
    };
    setSaving(true);
    try {
      let saved: LibraryDocument;
      if (isNew) saved = await api.uploadTo<LibraryDocument>('/library/documents', file!, data);
      else if (file) {
        const body = new FormData();
        body.append('data', JSON.stringify(data));
        body.append('file', file);
        saved = await api.put<LibraryDocument>(`/library/documents/${id}`, body);
      } else saved = await api.put<LibraryDocument>(`/library/documents/${id}`, data);
      setDoc(saved);
      setInitial(toForm(saved));
      setForm(toForm(saved));
      setFile(null);
      notify('success', isNew ? 'Document added to the repository.' : 'Document saved.');
      if (isNew) navigate(`/admin/repository/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/library/documents/${id}`);
      notify('success', `“${doc?.title}” was deleted.`);
      navigate('/admin/repository', { replace: true });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete it.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <Link to="/admin/repository" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        All documents
      </Link>
      <PageHeader
        title={isNew ? 'Add a document' : doc?.title || 'Edit document'}
        description={isNew
          ? 'Upload the file, then describe it so visitors can find it by country, year, language and theme.'
          : doc?.hidden ? <Badge>Hidden from the website</Badge> : <Badge tone="green">Visible on the website</Badge>}
        actions={!isNew && doc ? (
          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50">
            <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
            Open file
          </a>
        ) : undefined}
      />

      {error && <div className="mb-6"><Alert tone="error">{error}</Alert></div>}

      <div className="space-y-6">
        <Card title="File" description="PDF or Word document, up to 30 MB.">
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,application/pdf" className="hidden"
            onChange={(e) => {
              const chosen = e.target.files?.[0] || null;
              setFile(chosen);
              if (chosen && !form.title) set('title', chosen.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
              e.target.value = '';
            }} />
          {file || doc ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3">
              <span className="flex min-w-0 items-center gap-2 text-sm text-neutral-800">
                <DocumentTextIcon className="h-5 w-5 flex-shrink-0 text-primary-600" aria-hidden="true" />
                <span className="truncate">{file ? file.name : doc?.fileName}</span>
                <span className="flex-shrink-0 text-neutral-500">({formatSize(file ? file.size : doc?.fileSize || 0)})</span>
                {file && doc && <Badge tone="amber">Replaces the current file when you save</Badge>}
              </span>
              <Button size="sm" onClick={() => fileInput.current?.click()}>{doc ? 'Replace file' : 'Choose another'}</Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed border-neutral-300 px-6 py-8 text-sm text-neutral-600 hover:border-primary-400 hover:bg-primary-50/40">
              <ArrowUpTrayIcon className="h-7 w-7 text-neutral-400" aria-hidden="true" />
              <span className="font-medium text-primary-700">Choose a file</span>
              <span className="text-xs text-neutral-500">PDF, DOC or DOCX</span>
            </button>
          )}
        </Card>

        <Card title="Description">
          <div className="space-y-5">
            <Field label="Title" required help="The official name, for example “Data Protection Act 2023”.">
              {({ id: fid }) => <TextInput id={fid} value={form.title} maxLength={300} onChange={(e) => set('title', e.target.value)} />}
            </Field>
            <Field label="Short summary" help="Optional. One or two sentences about what the document covers." counter={{ length: form.summary.length, max: 3000 }}>
              {({ id: fid }) => <TextArea id={fid} minRows={3} value={form.summary} onChange={(e) => set('summary', e.target.value)} />}
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Field label="Year" required>
                {({ id: fid }) => (
                  <select id={fid} value={form.year} onChange={(e) => set('year', e.target.value)} className={selectClass}>
                    <option value="">Choose…</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Applies to" required>
                {({ id: fid }) => (
                  <select id={fid} value={form.scope} onChange={(e) => set('scope', e.target.value as Form['scope'])} className={selectClass}>
                    <option value="country">One country</option>
                    <option value="organization">A region or organisation</option>
                  </select>
                )}
              </Field>
              {form.scope === 'country' ? (
                <Field label="Country" required>
                  {({ id: fid }) => (
                    <select id={fid} value={form.country} onChange={(e) => set('country', e.target.value)} className={selectClass}>
                      <option value="">Choose…</option>
                      {options.countries.map((c) => <option key={c.iso2} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                </Field>
              ) : (
                <Field label="Region or organisation" required>
                  {({ id: fid }) => (
                    <select id={fid} value={form.organization} onChange={(e) => set('organization', e.target.value)} className={selectClass}>
                      <option value="">Choose…</option>
                      {(['continental', 'regional', 'international'] as const).map((level) => (
                        <optgroup key={level} label={level === 'continental' ? 'Continental' : level === 'regional' ? 'Regional' : 'International'}>
                          {options.organizations.filter((o) => o.level === level).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>
          </div>
        </Card>

        <Card title="Languages" description="The languages the document is written in.">
          <Checkboxes label="Languages" items={languageItems} selected={form.languages} onChange={(v) => set('languages', v)} />
          {!showAllLanguages && (
            <button type="button" onClick={() => setShowAllLanguages(true)} className="mt-3 text-sm font-medium text-secondary-600 hover:text-secondary-700">
              Show more languages
            </button>
          )}
        </Card>

        <Card title="Themes" description="Topics the document covers. Visitors can filter the repository by theme.">
          <Checkboxes label="Themes" items={themeItems} selected={form.themes} onChange={(v) => set('themes', v)} />
          <div className="mt-4 flex max-w-md gap-2">
            <TextInput placeholder="Add another theme…" value={newTheme} onChange={(e) => setNewTheme(e.target.value)} aria-label="New theme" />
            <Button icon={<PlusIcon className="h-4 w-4" />} disabled={!newTheme.trim()}
              onClick={() => {
                const theme = newTheme.trim();
                if (!form.themes.includes(theme)) set('themes', [...form.themes, theme]);
                setNewTheme('');
              }}>
              Add
            </Button>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Show on the website" description="Turn off to hide the document from the repository without deleting it." />
            {!isNew && (
              <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>Delete document</Button>
            )}
          </div>
        </Card>
      </div>

      <SaveBar
        visible={dirty || isNew}
        message={isNew ? 'New document, not saved yet' : 'You have unsaved changes'}
        onSave={save}
        onDiscard={isNew ? undefined : () => { if (initial) setForm(initial); setFile(null); }}
        saving={saving}
        saveLabel={isNew ? 'Add to repository' : 'Save changes'}
      />

      <ConfirmDialog open={confirmDelete} title={`Delete “${doc?.title}”?`} confirmLabel="Delete" danger busy={deleting}
        onConfirm={remove} onClose={() => setConfirmDelete(false)}>
        The document is removed from the repository and the dashboard. To take it off the website for now, turn off “Show on the website” instead.
      </ConfirmDialog>
    </>
  );
}
