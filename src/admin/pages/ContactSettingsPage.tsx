import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { api, ApiError, type AdminSettings, type SocialNetwork } from '../api';
import { useToast, useUnsavedChanges } from '../session';
import { Alert, Button, Card, Field, LoadingState, PageHeader, SaveBar, TextInput } from '../ui';

const NETWORKS: { key: SocialNetwork; label: string; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/…' },
  { key: 'x', label: 'X (Twitter)', placeholder: 'https://x.com/…' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/2348000000000' },
];

const PLACEHOLDER_WHATSAPP = 'https://wa.me/0000000000';

export default function ContactSettingsPage() {
  const notify = useToast();
  const [saved, setSaved] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<AdminSettings>('/settings')
      .then((s) => { setSaved(s); setForm(s); })
      .catch((e) => setError(e.message));
  }, []);

  const dirty = useMemo(() => !!form && JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  useUnsavedChanges(dirty);

  if (!form) return error ? <Alert tone="error">{error}</Alert> : <LoadingState />;

  const setEmail = (i: number, value: string) =>
    setForm({ ...form, contactEmails: form.contactEmails.map((e, j) => (j === i ? value : e)) });

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = await api.put<AdminSettings>('/settings', {
        socialLinks: form.socialLinks,
        contactEmails: form.contactEmails.filter((e) => e.trim()),
      });
      setSaved(next);
      setForm(next);
      notify('success', 'Saved. The header and footer now show the new details.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Contact details"
        description="Email addresses and social media links shown in the header and footer of every page."
      />

      {error && <div className="mb-6"><Alert tone="error">{error}</Alert></div>}

      <div className="space-y-6">
        <Card title="Email addresses" description="Listed under “Email” in the footer. Visitors can click them to write to you.">
          <div className="space-y-3">
            {form.contactEmails.length === 0 && (
              <p className="text-sm text-neutral-500">No email addresses. The “Email” heading is hidden in the footer.</p>
            )}
            {form.contactEmails.map((email, i) => (
              <div key={i} className="flex gap-2">
                <TextInput
                  type="email"
                  aria-label={`Email address ${i + 1}`}
                  value={email}
                  placeholder="info@aictig.org"
                  onChange={(e) => setEmail(i, e.target.value)}
                />
                <Button
                  variant="ghost"
                  aria-label={`Remove ${email || 'this address'}`}
                  icon={<TrashIcon className="h-4 w-4" />}
                  onClick={() => setForm({ ...form, contactEmails: form.contactEmails.filter((_, j) => j !== i) })}
                />
              </div>
            ))}
            {form.contactEmails.length < 5 && (
              <Button
                size="sm"
                icon={<PlusIcon className="h-4 w-4" />}
                onClick={() => setForm({ ...form, contactEmails: [...form.contactEmails, ''] })}
              >
                Add email address
              </Button>
            )}
          </div>
        </Card>

        <Card title="Social media" description="The icons at the top of every page and in the footer. Leave a box empty to hide that icon.">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {NETWORKS.map((network) => (
              <Field
                key={network.key}
                label={network.label}
                help={network.key === 'whatsapp' ? 'Your number in international format, without + or spaces, after https://wa.me/' : undefined}
              >
                {({ id }) => (
                  <TextInput
                    id={id}
                    type="url"
                    placeholder={network.placeholder}
                    value={form.socialLinks[network.key]}
                    onChange={(e) => setForm({ ...form, socialLinks: { ...form.socialLinks, [network.key]: e.target.value } })}
                  />
                )}
              </Field>
            ))}
          </div>
          {form.socialLinks.whatsapp === PLACEHOLDER_WHATSAPP && (
            <div className="mt-5">
              <Alert tone="warning" title="The WhatsApp link is a placeholder">
                It points to the number 0000000000, so the WhatsApp icon on the website leads nowhere. Enter your real
                number, or empty the box to hide the icon.
              </Alert>
            </div>
          )}
        </Card>

        <p className="text-sm text-neutral-500">
          Office addresses are changed under{' '}
          <Link to="/admin/pages/header-footer" className="font-medium text-secondary-600 hover:text-secondary-700">
            Menu and footer
          </Link>
          .
        </p>
      </div>

      <SaveBar
        visible={dirty}
        message="You have unsaved changes"
        onSave={save}
        onDiscard={() => saved && setForm(saved)}
        saving={saving}
      />
    </>
  );
}
