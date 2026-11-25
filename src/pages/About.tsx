import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AcademicCapIcon,
  GlobeAltIcon,
  LightBulbIcon,
  BookOpenIcon,
  BuildingLibraryIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import PageHeader from '../components/PageHeader';
import ExpertCard from '../components/ExpertCard';
import { useTeam } from '../content/team';

export default function About() {
  const { t } = useTranslation(['about', 'common']);
  const { hash } = useLocation();
  const team = useTeam();

  // Support links such as /about#team (e.g. "Back to team" on expert pages).
  useEffect(() => {
    if (hash && team) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash, team]);

  const missionItems = [
    {
      icon: BeakerIcon,
      title: t('about:mission.research.title'),
      description: t('about:mission.research.description'),
    },
    {
      icon: BuildingLibraryIcon,
      title: t('about:mission.repository.title'),
      description: t('about:mission.repository.description'),
    },
    {
      icon: AcademicCapIcon,
      title: t('about:mission.capacity.title'),
      description: t('about:mission.capacity.description'),
    },
    {
      icon: BookOpenIcon,
      title: t('about:mission.publications.title'),
      description: t('about:mission.publications.description'),
    },
  ];

  return (
    <>
      <Seo
        title={t('about:meta.title')}
        description={t('about:meta.description')}
      />
      <main className="bg-neutral-50 min-h-screen">
        <PageHeader title={t('about:hero.title')} subtitle={t('about:hero.subtitle')} />

        {/* About Section */}
        <section className="py-16 md:py-20 bg-white">
          <div className="container-custom">
            <div className="max-w-4xl space-y-5 text-lg leading-relaxed text-neutral-700">
              <p>{t('about:about.paragraph2')}</p>
              <p>{t('about:about.paragraph3')}</p>
              <p className="border-s-4 border-primary-500 ps-4 font-medium text-neutral-900">
                {t('about:about.incorporation')}
              </p>
            </div>
          </div>
        </section>

        {/* Vision & Mission */}
        <section className="py-16 md:py-20">
          <div className="container-custom">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Vision */}
              <div className="rounded-xl border border-neutral-200 bg-white p-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-600">
                  <GlobeAltIcon className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
                <h2 className="mb-3 text-2xl font-bold text-neutral-900">
                  {t('about:vision.title')}
                </h2>
                <p className="text-lg leading-relaxed text-neutral-700">
                  {t('about:vision.description')}
                </p>
              </div>

              {/* Mission Header */}
              <div className="rounded-xl border border-neutral-200 bg-white p-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-600">
                  <LightBulbIcon className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
                <h2 className="mb-3 text-2xl font-bold text-neutral-900">
                  {t('about:mission.title')}
                </h2>
                <p className="leading-relaxed text-neutral-700">
                  {t('about:mission.intro')}
                </p>
              </div>
            </div>

            {/* Mission Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {missionItems.map((item, index) => (
                <div key={index} className="rounded-xl border border-neutral-200 bg-white p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary-50">
                    <item.icon className="h-6 w-6 text-primary-600" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-neutral-900">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-neutral-600">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Team section */}
        <section id="team" className="py-16 md:py-20 bg-white scroll-mt-24">
          <div className="container-custom">
            <h2 className="mb-4 text-2xl font-bold text-neutral-900 md:text-3xl">
              {t('about:team.title')}
            </h2>
            <p className="mb-10 max-w-3xl text-lg leading-relaxed text-neutral-700">
              {t('about:team.intro')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(team ?? []).map((expert) => (
                <ExpertCard key={expert.slug} expert={expert} />
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
