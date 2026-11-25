import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarIcon,
  ShareIcon,
  ArrowLeftIcon,
  UserIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import Breadcrumbs from '../components/Breadcrumbs';
import Tag from '../components/Tag';
import { useToast } from '../context/UiContext';
import { TextSkeleton } from '../components/Skeleton';
import { fetchPublicationBySlug } from '../utils/content';
import type { Publication } from '../types';

export default function PublicationDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation(['pubs', 'common']);
  const { showToast } = useToast();
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    fetchPublicationBySlug(slug)
      .then((data) => setPublication(data))
      .catch((err) => console.error('Failed to fetch publication:', err))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: publication?.title,
          text: publication?.abstract,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast(t('pubs:shareCopied', 'Link copied!'), 'success');
    }
  };

  if (loading) {
    return (
      <main className="bg-neutral-50 min-h-screen py-16">
        <div className="container-custom max-w-4xl">
          <TextSkeleton lines={15} />
        </div>
      </main>
    );
  }

  if (!publication) {
    return (
      <main className="bg-neutral-50 min-h-screen py-16">
        <div className="container-custom text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            {t('common:notFound')}
          </h1>
          <p className="text-neutral-600 mb-6">
            The publication you're looking for doesn't exist.
          </p>
          <Link to="/publications" className="btn-primary">
            {t('pubs:backToPublications', 'Back to Publications')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <Seo
        title={publication.title}
        description={publication.abstract}
        image={publication.cover}
      />
      <main className="bg-neutral-50 min-h-screen py-16">
        <div className="container-custom max-w-4xl">
          <Breadcrumbs />

          {/* Back button */}
          <Link
            to="/publications"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900 mb-6 mt-6"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            {t('pubs:backToPublications', 'Back to Publications')}
          </Link>

          <article className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {/* Featured image */}
            {publication.cover && (
              <div className="aspect-[21/9] overflow-hidden bg-neutral-200">
                <img
                  src={publication.cover}
                  alt={`Cover image for ${publication.title}`}
                  loading="eager"
                  decoding="async"
                  width="1200"
                  height="514"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-8 md:p-12">
              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-600 mb-6">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  <span>{publication.authors.join(', ')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{publication.year}</span>
                </div>
                <Tag label={publication.type} variant="primary" />
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 hover:text-primary-600 transition-colors ml-auto"
                >
                  <ShareIcon className="w-4 h-4" />
                  {t('pubs:share', 'Share')}
                </button>
              </div>

              {/* Title */}
              <h1 className="text-4xl font-bold text-neutral-900 mb-6">
                {publication.title}
              </h1>

              {/* Tags */}
              {publication.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {publication.tags.map((tag) => (
                    <Tag key={tag} variant="default">
                      {tag}
                    </Tag>
                  ))}
                </div>
              )}

              {/* Attached file (publications added in the dashboard) */}
              {publication.fileUrl && (
                <a
                  href={publication.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-8 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 font-medium text-white hover:bg-primary-700"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
                  {t('pubs:detail.downloadPdf', 'Download PDF')}
                </a>
              )}

              {/* Body */}
              <div className="wp-content" dangerouslySetInnerHTML={{ __html: publication.content }} />
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
