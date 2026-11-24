/** Shared helpers for the News, Publications and Repository screens. */
import { useEffect, useState } from 'react';
import { api, type LibraryOptions, type UploadedFile } from './api';

let optionsRequest: Promise<LibraryOptions> | null = null;

/** Countries, organisations, languages, themes and publication types for the forms. */
export function useLibraryOptions() {
  const [options, setOptions] = useState<LibraryOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!optionsRequest) optionsRequest = api.get<LibraryOptions>('/library/options');
    optionsRequest.then(setOptions).catch((e) => {
      optionsRequest = null;
      setError(e.message);
    });
  }, []);
  return { options, error };
}

/** Upload a picture or document from the dashboard; returns its address on this website. */
export function uploadFile(file: File) {
  return api.uploadTo<UploadedFile>('/files', file);
}

export const POST_STATUS = {
  published: { label: 'Published', tone: 'green' as const },
  draft: { label: 'Draft', tone: 'neutral' as const },
};

export function formatDate(date: string | number) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
