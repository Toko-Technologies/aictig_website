/**
 * Small client for the dashboard API (/api/admin/...). Every request sends the
 * X-AICTiG-Admin header the server requires for anti-forgery protection, and
 * errors come back as ApiError with the server's plain-language message.
 */

export class ApiError extends Error {
  status: number;
  details?: { key?: string; field?: string };

  constructor(status: number, message: string, details?: { key?: string; field?: string }) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

/** Called when the session has ended, so the app can show the sign-in page. */
export function setUnauthorizedHandler(listener: UnauthorizedListener | null) {
  onUnauthorized = listener;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-AICTiG-Admin': '1',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your internet connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // '/me' is the initial "am I signed in?" check: a 401 there is not an ended session.
    if (res.status === 401 && path !== '/login' && path !== '/me' && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data.error || 'Something went wrong. Please try again.', data.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('POST', '/uploads', form);
  },
  /** Multipart upload to any dashboard endpoint (file + optional JSON "data" field). */
  uploadTo: <T>(path: string, file: File, data?: unknown) => {
    const form = new FormData();
    if (data !== undefined) form.append('data', JSON.stringify(data));
    form.append('file', file);
    return request<T>('POST', path, form);
  },
};

// ── Shared response types ─────────────────────────────────────────

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  lastLoginAt: number | null;
  createdAt?: number;
}

export interface ContentValue {
  original: string;
  override: string | null;
  /** 'manual' = typed in the dashboard, 'auto' = translated automatically from English */
  source: 'manual' | 'auto' | null;
  updatedAt: number | null;
  updatedBy: string | null;
}

export interface TranslationSettings {
  enabled: boolean;
  /** Sent to MyMemory with each request; raises the free daily limit. */
  email: string;
  /** Words and names that are never translated. */
  keepTerms: string[];
}

export interface TranslationStatus {
  enabled: boolean;
  provider: string;
  providerId: 'mymemory' | 'claude' | string;
  busy: boolean;
  lastError: string | null;
  lastRunAt: number | null;
  lastResult: { translated: number; failed: number; at: number } | null;
  /** Texts whose automatic translation is missing or older than the English. */
  outdated: number;
  /** Characters used today out of the free daily limit (MyMemory only). */
  usage: { today: number; limit: number } | null;
  settings: TranslationSettings;
  languages: string[];
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  topic: string;
  topicLabel: string;
  message: string;
  lang: string | null;
  createdAt: number;
  readAt: number | null;
}

export interface HistoryEntry {
  id: number;
  user: string | null;
  action: string;
  summary: string;
  details: {
    lang?: string;
    changes?: { key: string; label: string; before: string; after: string }[];
  } | null;
  at: number;
}

export interface AdminTeamMember {
  id: number;
  slug: string;
  published: boolean;
  position: number;
  name: string;
  role: string;
  photo: string;
  summary: string;
  email: string;
  linkedin: string;
  googleScholar: string;
  bio: string[];
  expertise: string[];
  regionalFocus: string[];
  projects: string[];
  publications: string[];
  conferences: string[];
}

export type SocialNetwork = 'facebook' | 'linkedin' | 'x' | 'instagram' | 'whatsapp';

export interface AdminSettings {
  socialLinks: Record<SocialNetwork, string>;
  contactEmails: string[];
}

// ── News, publications and repository documents (dashboard library) ──

export type LibraryKind = 'news' | 'publications';

export interface LibraryPost {
  id: number;
  kind: LibraryKind;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  image: string;
  tags: string[];
  type: string;
  authors: string[];
  fileUrl: string;
  status: 'published' | 'draft';
  date: string;
  updatedAt: number;
}

export interface LibraryDocument {
  id: number;
  title: string;
  summary: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mime: string;
  year: number;
  country: string;
  organization: string;
  languages: string[];
  themes: string[];
  hidden: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface LibraryOptions {
  countries: { name: string; iso2: string; region: string }[];
  organizations: { key: string; label: string; level: 'continental' | 'regional' | 'international' }[];
  languages: { code: string; name: string }[];
  themes: string[];
  publicationTypes: string[];
}

export interface UploadedFile {
  url: string;
  name: string;
  size: number;
  mime: string;
}
