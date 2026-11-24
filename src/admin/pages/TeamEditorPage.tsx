import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  EyeIcon,
  PencilSquareIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import InlineMarkdown from '../../components/InlineMarkdown';
import { api, ApiError, type AdminTeamMember } from '../api';
import { useToast, useUnsavedChanges } from '../session';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  Field,
  LoadingState,
  PageHeader,
  SaveBar,
  TextArea,
  TextInput,
  Toggle,
} from '../ui';

interface Form {
  name: string;
  role: string;
  summary: string;
  photo: string;
  email: string;
  linkedin: string;
  googleScholar: string;
  published: boolean;
  bio: string;
  expertise: string;
  regionalFocus: string;
  projects: string;
  publications: string;
  conferences: string;
}

const EMPTY: Form = {
  name: '', role: '', summary: '', photo: '', email: '', linkedin: '', googleScholar: '', published: true,
  bio: '', expertise: '', regionalFocus: '', projects: '', publications: '', conferences: '',
};

const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

function toForm(m: AdminTeamMember): Form {
  return {
    name: m.name, role: m.role, summary: m.summary, photo: m.photo, email: m.email || '',
    linkedin: m.linkedin || '', googleScholar: m.googleScholar || '', published: m.published,
    bio: m.bio.join('\n\n'),
    expertise: m.expertise.join('\n'),
    regionalFocus: (m.regionalFocus || []).join('\n'),
    projects: (m.projects || []).join('\n'),
    publications: (m.publications || []).join('\n'),
    conferences: (m.conferences || []).join('\n'),
  };
}

function toPayload(f: Form) {
  return {
    name: f.name, role: f.role, summary: f.summary, photo: f.photo, email: f.email,
    linkedin: f.linkedin, googleScholar: f.googleScholar, published: f.published,
    bio: paragraphs(f.bio),
    expertise: lines(f.expertise),
    regionalFocus: lines(f.regionalFocus),
    projects: lines(f.projects),
    publications: lines(f.publications),
    conferences: lines(f.conferences),
  };
}

const FORMAT_HELP = (
  <>
    To add a link, write <code className="rounded bg-neutral-100 px-1">[text to show](https://address)</code>. For{' '}
    <em>italics</em>, put stars around the words: <code className="rounded bg-neutral-100 px-1">*Journal name*</code>.
  </>
);

function PreviewButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick} icon={active ? <PencilSquareIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}>
      {active ? 'Back to editing' : 'Preview'}
    </Button>
  );
}

function PreviewBox({ empty, children }: { empty: boolean; children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm">
      {empty ? <p className="text-neutral-400">Nothing written yet.</p> : children}
      {!empty && <p className="mt-4 text-xs text-neutral-400">Preview: this is how it will look on the profile page.</p>}
    </div>
  );
}

export default function TeamEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const notify = useToast();

  const [member, setMember] = useState<AdminTeamMember | null>(null);
  const [initial, setInitial] = useState<Form | null>(isNew ? EMPTY : null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState({ bio: false, lists: false });

  useEffect(() => {
    if (isNew) {
      setMember(null);
      setInitial(EMPTY);
      setForm(EMPTY);
      return;
    }
    api.get<AdminTeamMember>(`/team/${id}`)
      .then((m) => {
        setMember(m);
        setInitial(toForm(m));
        setForm(toForm(m));
      })
      .catch((e) => setLoadError(e.message));
  }, [id, isNew]);

  const dirty = useMemo(() => !!initial && JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  useUnsavedChanges(dirty && !saving);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const bind = (key: Exclude<keyof Form, 'published'>) => ({
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
  });

  const uploadPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('error', 'This image is larger than 5 MB. Please choose a smaller image.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      set('photo', url);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'The upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setFormError(null);
    const missing = [
      !form.name.trim() && 'Full name',
      !form.role.trim() && 'Role / title',
      !form.summary.trim() && 'Short summary',
      !form.bio.trim() && 'Biography',
    ].filter(Boolean);
    if (missing.length) {
      setFormError(`Please fill in: ${missing.join(', ')}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const saved = isNew
        ? await api.post<AdminTeamMember>('/team', toPayload(form))
        : await api.put<AdminTeamMember>(`/team/${id}`, toPayload(form));
      setMember(saved);
      setInitial(toForm(saved));
      setForm(toForm(saved));
      notify('success', saved.published ? `Saved. ${saved.name}'s profile is updated on the website.` : `Saved. ${saved.name} is hidden from the website.`);
      if (isNew) navigate(`/admin/team/${saved.id}`, { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/team/${id}`);
      setInitial(form); // nothing left to lose
      notify('success', `${member?.name} was removed from the website.`);
      navigate('/admin/team', { replace: true });
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not remove this person.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!initial) return <LoadingState />;

  return (
    <>
      <Link to="/admin/team" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        All team members
      </Link>

      <PageHeader
        title={isNew ? 'Add team member' : member?.name || 'Edit team member'}
        description={isNew
          ? 'Fill in the details below. Fields marked * are required. The person appears on the website once you save.'
          : <>Profile page: <span className="font-mono text-neutral-700">/experts/{member?.slug}</span></>}
        actions={!isNew && member?.published ? (
          <a
            href={`/experts/${member.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
            View profile
          </a>
        ) : undefined}
      />

      {formError && <div className="mb-6"><Alert tone="error">{formError}</Alert></div>}

      <div className="space-y-6">
        <Card title="Basic details" description="Shown on the team card on the About page and at the top of the profile page.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
            <div>
              <p className="mb-1.5 text-sm font-medium text-neutral-800">Photo</p>
              <div className="aspect-[4/5] w-full max-w-[180px] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                {form.photo ? (
                  <img src={form.photo} alt="" className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-400">
                    <PhotoIcon className="h-10 w-10" aria-hidden="true" />
                    <span className="text-xs">No photo</span>
                  </div>
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={uploadPhoto} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => fileInput.current?.click()} loading={uploading}>
                  {form.photo ? 'Change photo' : 'Upload photo'}
                </Button>
                {form.photo && (
                  <Button size="sm" variant="ghost" onClick={() => set('photo', '')}>Remove</Button>
                )}
              </div>
              <p className="mt-2 text-xs text-neutral-500">JPG, PNG or WebP, up to 5 MB. A portrait (taller than wide) looks best.</p>
            </div>

            <div className="space-y-5">
              <Field label="Full name" required help="Include the title, for example “Dr Jane Doe”.">
                {({ id: fid }) => <TextInput id={fid} maxLength={120} {...bind('name')} />}
              </Field>
              <Field label="Role / title" required help="For example “Senior Fellow & Lead Researcher”.">
                {({ id: fid }) => <TextInput id={fid} maxLength={120} {...bind('role')} />}
              </Field>
              <Field
                label="Short summary"
                required
                help="One or two sentences shown on the team card and in search results."
                counter={{ length: form.summary.length, max: 400 }}
              >
                {({ id: fid }) => <TextArea id={fid} minRows={2} {...bind('summary')} />}
              </Field>
              <Toggle
                checked={form.published}
                onChange={(v) => set('published', v)}
                label="Show on the website"
                description="Turn off to hide this person without deleting their profile."
              />
            </div>
          </div>
        </Card>

        <Card title="Contact links" description="Shown as buttons on the profile page. Leave empty to hide a button.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field label="Email">
              {({ id: fid }) => <TextInput id={fid} type="email" placeholder="name@aictig.org" {...bind('email')} />}
            </Field>
            <Field label="LinkedIn link">
              {({ id: fid }) => <TextInput id={fid} type="url" placeholder="https://www.linkedin.com/in/…" {...bind('linkedin')} />}
            </Field>
            <Field label="Google Scholar link">
              {({ id: fid }) => <TextInput id={fid} type="url" placeholder="https://scholar.google.com/…" {...bind('googleScholar')} />}
            </Field>
          </div>
        </Card>

        <Card
          title="Biography"
          description="The main text of the profile page."
          actions={<PreviewButton active={preview.bio} onClick={() => setPreview((p) => ({ ...p, bio: !p.bio }))} />}
        >
          {preview.bio ? (
            <PreviewBox empty={!form.bio.trim()}>
              <div className="space-y-4">
                {paragraphs(form.bio).map((p, i) => (
                  <p key={i} className="leading-relaxed text-neutral-700"><InlineMarkdown>{p}</InlineMarkdown></p>
                ))}
              </div>
            </PreviewBox>
          ) : (
            <Field label="Biography" required help={<>Leave an empty line between paragraphs. {FORMAT_HELP} Use **double stars** for bold.</>}>
              {({ id: fid }) => <TextArea id={fid} minRows={8} {...bind('bio')} />}
            </Field>
          )}
        </Card>

        <Card title="Expertise" description="Shown in the “Areas of expertise” section of the profile page.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Areas of expertise" help="One area per line.">
              {({ id: fid }) => <TextArea id={fid} minRows={5} {...bind('expertise')} />}
            </Field>
            <Field label="Regional focus" help="Optional. One region or country per line, for example “West Africa”.">
              {({ id: fid }) => <TextArea id={fid} minRows={5} {...bind('regionalFocus')} />}
            </Field>
          </div>
        </Card>

        <Card
          title="Projects, publications and conferences"
          description="Each list becomes a section the visitor can open on the profile page. Empty lists are not shown."
          actions={<PreviewButton active={preview.lists} onClick={() => setPreview((p) => ({ ...p, lists: !p.lists }))} />}
        >
          {preview.lists ? (
            <div className="space-y-6">
              {([['Projects', form.projects], ['Publications', form.publications], ['Conferences and presentations', form.conferences]] as const).map(([title, text]) => (
                <div key={title}>
                  <p className="mb-2 text-sm font-semibold text-neutral-800">{title} ({lines(text).length})</p>
                  <PreviewBox empty={!lines(text).length}>
                    <ol className="list-decimal space-y-2 pl-5 marker:text-primary-600">
                      {lines(text).map((item, i) => (
                        <li key={i} className="leading-relaxed text-neutral-700"><InlineMarkdown>{item}</InlineMarkdown></li>
                      ))}
                    </ol>
                  </PreviewBox>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-6">
            <Field label="Projects" help={<>One project per line. {FORMAT_HELP}</>}>
              {({ id: fid }) => <TextArea id={fid} minRows={4} {...bind('projects')} />}
            </Field>
            <Field label="Publications" help="One publication per line, in the order you want them listed.">
              {({ id: fid }) => <TextArea id={fid} minRows={6} {...bind('publications')} />}
            </Field>
            <Field label="Conferences and presentations" help="One entry per line.">
              {({ id: fid }) => <TextArea id={fid} minRows={6} {...bind('conferences')} />}
            </Field>
          </div>
          )}
        </Card>

        {!isNew && (
          <Card title="Remove this person">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-neutral-600">
                Deletes the profile permanently. To take it off the website temporarily, turn off “Show on the website” instead.
              </p>
              <Button variant="danger" icon={<TrashIcon className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                Remove team member
              </Button>
            </div>
          </Card>
        )}
      </div>

      <SaveBar
        visible={dirty || isNew}
        message={isNew ? 'New team member, not saved yet' : 'You have unsaved changes'}
        onSave={save}
        onDiscard={isNew ? undefined : () => initial && setForm(initial)}
        saving={saving}
        saveLabel={isNew ? 'Add team member' : 'Save changes'}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove ${member?.name}?`}
        confirmLabel="Remove"
        danger
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        Their profile page and team card will disappear from the website. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}
