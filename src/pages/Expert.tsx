import { Fragment, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Disclosure, Transition } from '@headlessui/react';
import {
  ArrowLeftIcon,
  EnvelopeIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import ExpertCard from '../components/ExpertCard';
import ExpertPhoto from '../components/ExpertPhoto';
import InlineMarkdown from '../components/InlineMarkdown';
import { TextSkeleton } from '../components/Skeleton';
import { useTeam } from '../content/team';

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

/** Collapsible profile section ("dropdown"), built on Headless UI Disclosure. */
function ProfileSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Disclosure as="div" defaultOpen={defaultOpen} className="bg-white rounded-lg shadow-md border border-neutral-200 overflow-hidden">
      {({ open }) => (
        <>
          <Disclosure.Button className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left hover:bg-neutral-50 transition-colors focus-ring">
            <span className="flex items-center gap-3">
              <span className="text-xl font-bold text-neutral-900">{title}</span>
              {count !== undefined && (
                <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-full bg-primary-100 text-primary-700 text-sm font-semibold">
                  {count}
                </span>
              )}
            </span>
            <ChevronDownIcon
              className={`h-6 w-6 flex-shrink-0 text-primary-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Disclosure.Button>
          <Transition
            as={Fragment}
            enter="transition duration-150 ease-out"
            enterFrom="opacity-0 -translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition duration-100 ease-in"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Disclosure.Panel className="px-6 pb-6 pt-1 border-t border-neutral-100">
              {children}
            </Disclosure.Panel>
          </Transition>
        </>
      )}
    </Disclosure>
  );
}

function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="mt-4 space-y-4">
      {items.map((item, index) => (
        <li key={index} className="flex gap-4">
          <span className="flex-shrink-0 w-8 text-right font-semibold text-primary-600 tabular-nums">
            {index + 1}.
          </span>
          <span className="text-neutral-700 leading-relaxed">
            <InlineMarkdown>{item}</InlineMarkdown>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Expert() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('about');
  const team = useTeam();

  if (team === null) {
    return (
      <main className="bg-neutral-50 min-h-screen py-16">
        <div className="container-custom max-w-4xl">
          <TextSkeleton lines={12} />
        </div>
      </main>
    );
  }

  const expert = team.find((member) => member.slug === slug);
  if (!expert) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-neutral-900 mb-4">{t('experts.notFound')}</h1>
          <Link to="/about#team" className="text-primary-600 hover:text-primary-700 font-medium">
            {t('experts.backToTeam')}
          </Link>
        </div>
      </div>
    );
  }

  const others = team.filter((e) => e.slug !== expert.slug);
  const secondaryButton =
    'inline-flex items-center px-4 py-2 bg-white text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors focus-ring font-medium';

  return (
    <>
      <Seo title={expert.name} description={`${expert.role} at AICTiG. ${expert.summary}`} image={expert.photo} />

      <main>
        {/* Back link */}
        <div className="bg-white border-b border-neutral-200">
          <div className="container-custom py-4">
            <Link
              to="/about#team"
              className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium focus-ring rounded px-2 py-1"
            >
              <ArrowLeftIcon className="h-5 w-5 mr-2" aria-hidden="true" />
              {t('experts.backToTeam')}
            </Link>
          </div>
        </div>

        {/* Hero */}
        <section className="bg-gradient-to-br from-primary-50 to-secondary-50 py-12 md:py-20">
          <div className="container-custom">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 items-center">
              <div className="flex justify-center md:justify-start">
                <div className="w-56 md:w-full max-w-xs aspect-[4/5] rounded-lg shadow-lg overflow-hidden bg-neutral-200 ring-4 ring-white">
                  <ExpertPhoto member={expert} eager />
                </div>
              </div>

              <div className="md:col-span-2 text-center md:text-left">
                <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-2">{expert.name}</h1>
                <p className="text-xl md:text-2xl text-primary-600 font-semibold mb-6">{expert.role}</p>
                <p className="text-lg text-neutral-700 leading-relaxed mb-8 max-w-2xl md:mx-0 mx-auto">
                  {expert.summary}
                </p>

                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {expert.email && (
                    <a
                      href={`mailto:${expert.email}`}
                      className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors focus-ring font-medium"
                    >
                      <EnvelopeIcon className="h-5 w-5 mr-2" aria-hidden="true" />
                      {expert.email}
                    </a>
                  )}
                  {expert.linkedin && (
                    <a href={expert.linkedin} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                      <LinkedInIcon className="h-5 w-5 mr-2 text-[#0A66C2]" />
                      {t('experts.linkedin')}
                    </a>
                  )}
                  {expert.googleScholar && (
                    <a href={expert.googleScholar} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
                      <AcademicCapIcon className="h-5 w-5 mr-2 text-primary-600" aria-hidden="true" />
                      {t('experts.googleScholar')}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Biography */}
        <section className="py-12 md:py-16 bg-white">
          <div className="container-custom max-w-4xl">
            <h2 className="text-3xl font-bold text-neutral-900 mb-6">{t('experts.biography')}</h2>
            <div className="space-y-5">
              {expert.bio.map((paragraph, index) => (
                <p key={index} className="text-lg text-neutral-700 leading-relaxed">
                  <InlineMarkdown>{paragraph}</InlineMarkdown>
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* Collapsible profile sections */}
        <section className="py-12 md:py-16 bg-neutral-50">
          <div className="container-custom max-w-4xl space-y-4">
            <ProfileSection title={t('experts.areasOfExpertise')} defaultOpen>
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {expert.expertise.map((item) => (
                  <li key={item} className="flex items-center p-3 bg-primary-50 rounded-lg border border-primary-200">
                    <span className="w-2 h-2 bg-primary-600 rounded-full mr-3 flex-shrink-0" aria-hidden="true" />
                    <span className="text-neutral-700 font-medium">{item}</span>
                  </li>
                ))}
              </ul>
              {expert.regionalFocus && expert.regionalFocus.length > 0 && (
                <p className="mt-5 flex flex-wrap items-center gap-2 text-neutral-700">
                  <MapPinIcon className="h-5 w-5 text-primary-600" aria-hidden="true" />
                  <span className="font-semibold">{t('experts.regionalFocus')}:</span>
                  {expert.regionalFocus.join(', ')}
                </p>
              )}
            </ProfileSection>

            {expert.projects && expert.projects.length > 0 && (
              <ProfileSection title={t('experts.projects')} count={expert.projects.length}>
                <NumberedList items={expert.projects} />
              </ProfileSection>
            )}

            {expert.publications && expert.publications.length > 0 && (
              <ProfileSection title={t('experts.publications')} count={expert.publications.length}>
                <NumberedList items={expert.publications} />
              </ProfileSection>
            )}

            {expert.conferences && expert.conferences.length > 0 && (
              <ProfileSection title={t('experts.conferences')} count={expert.conferences.length}>
                <NumberedList items={expert.conferences} />
              </ProfileSection>
            )}
          </div>
        </section>

        {/* Other experts */}
        {others.length > 0 && (
          <section className="py-12 md:py-16 bg-white">
            <div className="container-custom">
              <h2 className="text-3xl font-bold text-neutral-900 mb-8">{t('experts.otherExperts')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {others.map((member) => (
                  <ExpertCard key={member.slug} expert={member} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
