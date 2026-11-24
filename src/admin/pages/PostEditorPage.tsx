import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, DocumentTextIcon, PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import { api, ApiError, type LibraryKind, type LibraryPost } from '../api';
import { useToast, useUnsavedChanges } from '../session';
import { Alert, Badge, Button, Card, ConfirmDialog, Field, LoadingState, PageHeader, TextArea, TextInput } from '../ui';
import RichTextEditor from '../RichTextEditor';
import { POST_STATUS, todayIso, uploadFile, useLibraryOptions } from '../library';
import { KIND_TEXT } from './PostsListPage';

interface Form {
  title: string;
  excerpt: string;
  content: string;
  image: string;
  date: string;
  tags: string;
  type: string;
  authors: string;
  fileUrl: string;
  fileName: string;
}

const EMPTY: Form = { title: '', excerpt: '', content: '', image: '', date: todayIso(), tags: '', type: '', authors: '', fileUrl: '', fileName: '' };

function toForm(p: LibraryPost): Form {
  return {
    title: p.title, excerpt: p.excerpt, content: p.content, image: p.image, date: p.date, tags: p.tags.join(', '),
    type: p.type, authors: p.authors.join(', '), fileUrl: p.fileUrl, fileName: p.fileUrl ? p.fileUrl.split('/').pop() || '' : '',
  };
}

const splitList = (text: string) => text.split(',').map((t) => t.trim()).filter(Boolean);

export default function PostEditorPage({ kind }: { kind: LibraryKind }) {
  const text = KIND_TEXT[kind];
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const notify = useToast();
  const { options } = useLibraryOptions();
  const [post, setPost] = useState<LibraryPost | null>(null);
  const [initial, setInitial] = useState<Form | null>(isNew ? EMPTY : null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'published' | 'draft' | null>(null);
  const [uploading, setUploading] = useState<'image' | 'file' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew) return;
    api.get<LibraryPost>(`/library/${kind}/${id}`)
      .then((p) => { setPost(p); setInitial(toForm(p)); setForm(toForm(p)); })
      .catch((e) => setLoadError(e.message));
  }, [id, isNew, kind]);

  const dirty = useMemo(() => !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  useUnsavedChanges(dirty && !saving && !deleting);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const upload = async (e: ChangeEvent<HTMLInputElement>, what: 'image' | 'file') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(what);
    try {
      const saved = await uploadFile(file);
      if (what === 'image') set('image', saved.url);
      else setForm((f) => ({ ...f, fileUrl: saved.url, fileName: saved.name }));
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'The upload failed.');
    } finally {
      setUploading(null);
    }
  };

  const save = async (status: 'published' | 'draft') => {
    setFormError(null);
    if (!form.title.trim()) {
      setFormError('Please enter a title.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(status);
    const body = {
      title: form.title, excerpt: form.excerpt, content: form.content, image: form.image, date: form.date,
      tags: splitList(form.tags), type: form.type, authors: splitList(form.authors), fileUrl: form.fileUrl, status,
    };
    try {
      const saved = isNew
        ? await api.post<LibraryPost>(`/library/${kind}`, body)
        : await api.put<LibraryPost>(`/library/${kind}/${id}`, body);
      const next = { ...toForm(saved), fileName: form.fileUrl === saved.fileUrl ? form.fileName : toForm(saved).fileName };
      setPost(saved);
      setInitial(next);
      setForm(next);
      notify('success', status === 'published' ? `Published. The ${text.one} is now on the website.` : 'Saved as a draft. It is not shown on the website.');
      if (isNew) navigate(`/admin/${kind}/${saved.id}`, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/library/${kind}/${id}`);
      notify('success', `“${post?.title}” was deleted.`);
      navigate(`/admin/${kind}`, { replace: true });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not delete it.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!initial) return <LoadingState />;

  const status = post ? POST_STATUS[post.status] : null;

  return (
    <>
      <Link to={`/admin/${kind}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        All {text.title.toLowerCase()}
      </Link>
      <PageHeader
        title={isNew ? `New ${text.one}` : form.title || `Edit ${text.one}`}
        description={status ? (
          <span className="inline-flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            {post?.status === 'published' ? 'Visible on the website' : 'Not visible on the website'}
          </span>
        ) : undefined}
        actions={post?.status === 'published' ? (
          <a href={`${text.publicPath}/${post.slug}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50">
            <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
            View on website
          </a>
        ) : undefined}
      />

      {formError && <div className="mb-6"><Alert tone="error">{formError}</Alert></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="space-y-5">
              <Field label="Title" required>
                {({ id: fid }) => <TextInput id={fid} value={form.title} maxLength={300} onChange={(e) => set('title', e.target.value)} className="!text-base font-medium" />}
              </Field>
              <Field label="Summary" help="One or two sentences, shown in lists and in bold above the text." counter={{ length: form.excerpt.length, max: 1000 }}>
                {({ id: fid }) => <TextArea id={fid} minRows={2} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />}
              </Field>
              <div>
                <p className="mb-1.5 text-sm font-medium text-neutral-800">Text</p>
                <RichTextEditor value={form.content} onChange={(html) => set('content', html)} onUpload={uploadFile} />
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Publish">
            <div className="space-y-3">
              <Button variant="primary" className="w-full" loading={saving === 'published'} disabled={!!saving} onClick={() => save('published')}>
                {post?.status === 'published' ? 'Update on website' : 'Publish'}
              </Button>
              <Button className="w-full" loading={saving === 'draft'} disabled={!!saving} onClick={() => save('draft')}>
                {post?.status === 'published' ? 'Unpublish (save as draft)' : 'Save as draft'}
              </Button>
              <p className="text-xs text-neutral-500">Drafts are kept here but not shown on the website.</p>
              {dirty && <p className="text-xs font-medium text-accent-700">You have unsaved changes.</p>}
            </div>
          </Card>

          <Card title="Picture" description="Shown at the top of the page and on the card in lists.">
            <div className="aspect-[16/9] overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
              {form.image
                ? <img src={form.image} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full flex-col items-center justify-center gap-1 text-neutral-400"><PhotoIcon className="h-8 w-8" /><span className="text-xs">No picture</span></div>}
            </div>
            <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e, 'image')} />
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={uploading === 'image'} onClick={() => imageInput.current?.click()}>{form.image ? 'Change picture' : 'Upload picture'}</Button>
              {form.image && <Button size="sm" variant="ghost" onClick={() => set('image', '')}>Remove</Button>}
            </div>
          </Card>

          <Card title="Details">
            <div className="space-y-5">
              <Field label="Date">
                {({ id: fid }) => <TextInput id={fid} type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />}
              </Field>
              {kind === 'publications' && (
                <>
                  <Field label="Type of publication">
                    {({ id: fid }) => (
                      <select id={fid} value={form.type} onChange={(e) => set('type', e.target.value)}
                        className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">Not specified</option>
                        {(options?.publicationTypes || []).map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Authors" help="Separate several authors with commas. Leave empty for “AICTiG”.">
                    {({ id: fid }) => <TextInput id={fid} value={form.authors} onChange={(e) => set('authors', e.target.value)} />}
                  </Field>
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-neutral-800">PDF to download</p>
                    {form.fileUrl ? (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                        <a href={form.fileUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 text-secondary-700 hover:underline">
                          <DocumentTextIcon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                          <span className="truncate">{form.fileName || 'Attached file'}</span>
                        </a>
                        <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, fileUrl: '', fileName: '' }))}>Remove</Button>
                      </div>
                    ) : (
                      <Button size="sm" loading={uploading === 'file'} onClick={() => fileInput.current?.click()}>Attach a PDF</Button>
                    )}
                    <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,application/pdf" className="hidden" onChange={(e) => upload(e, 'file')} />
                    <p className="mt-1.5 text-xs text-neutral-500">Optional. Visitors get a “Download PDF” button.</p>
                  </div>
                </>
              )}
              <Field label="Tags" help="Separate with commas. Items with the same tag are shown as related.">
                {({ id: fid }) => <TextInput id={fid} value={form.tags} onChange={(e) => set('tags', e.target.value)} />}
              </Field>
            </div>
          </Card>

          {!isNew && (
            <Button variant="danger" className="w-full" icon={<TrashIcon className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
              Delete this {text.one}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${post?.title}”?`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        It will be removed from the website and from the dashboard. To take it off the website for now, use “Unpublish” instead.
      </ConfirmDialog>
    </>
  );
}
