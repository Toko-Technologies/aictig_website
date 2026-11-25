import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  CpuChipIcon,
  ShieldCheckIcon,
  SignalIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ScaleIcon,
  BuildingLibraryIcon,
  RocketLaunchIcon,
  LinkIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import PageHeader from '../components/PageHeader';

export default function FocusAreas() {
  const { t } = useTranslation(['common']);

  const focusAreas = [
    {
      id: 'artificial-intelligence',
      title: t('focusAreas.ai.title'),
      description: t('focusAreas.ai.description'),
      icon: CpuChipIcon,
      color: 'primary',
    },
    {
      id: 'autonomous-weapons',
      title: t('focusAreas.autonomousWeapons.title'),
      description: t('focusAreas.autonomousWeapons.description'),
      icon: ShieldCheckIcon,
      color: 'danger',
    },
    {
      id: 'broadband-policy',
      title: t('focusAreas.broadband.title'),
      description: t('focusAreas.broadband.description'),
      icon: SignalIcon,
      color: 'secondary',
    },
    {
      id: '5g',
      title: t('focusAreas.5g.title'),
      description: t('focusAreas.5g.description'),
      icon: SignalIcon,
      color: 'accent',
    },
    {
      id: 'cybersecurity',
      title: t('focusAreas.cybersecurity.title'),
      description: t('focusAreas.cybersecurity.description'),
      icon: ShieldCheckIcon,
      color: 'primary',
    },
    {
      id: 'critical-infrastructure',
      title: t('focusAreas.criticalInfrastructure.title'),
      description: t('focusAreas.criticalInfrastructure.description'),
      icon: BuildingLibraryIcon,
      color: 'danger',
    },
    {
      id: 'cyberwarfare',
      title: t('focusAreas.cyberwarfare.title'),
      description: t('focusAreas.cyberwarfare.description'),
      icon: ShieldCheckIcon,
      color: 'danger',
    },
    {
      id: 'child-protection',
      title: t('focusAreas.childProtection.title'),
      description: t('focusAreas.childProtection.description'),
      icon: UserGroupIcon,
      color: 'accent',
    },
    {
      id: 'cryptocurrencies',
      title: t('focusAreas.crypto.title'),
      description: t('focusAreas.crypto.description'),
      icon: CurrencyDollarIcon,
      color: 'accent',
    },
    {
      id: 'data-protection',
      title: t('focusAreas.dataProtection.title'),
      description: t('focusAreas.dataProtection.description'),
      icon: ShieldCheckIcon,
      color: 'primary',
    },
    {
      id: 'digital-sovereignty',
      title: t('focusAreas.digitalSovereignty.title'),
      description: t('focusAreas.digitalSovereignty.description'),
      icon: GlobeAltIcon,
      color: 'secondary',
    },
    {
      id: 'digital-identity',
      title: t('focusAreas.digitalIdentity.title'),
      description: t('focusAreas.digitalIdentity.description'),
      icon: UserGroupIcon,
      color: 'primary',
    },
    {
      id: 'digital-trade',
      title: t('focusAreas.digitalTrade.title'),
      description: t('focusAreas.digitalTrade.description'),
      icon: GlobeAltIcon,
      color: 'accent',
    },
    {
      id: 'ecommerce',
      title: t('focusAreas.ecommerce.title'),
      description: t('focusAreas.ecommerce.description'),
      icon: CurrencyDollarIcon,
      color: 'secondary',
    },
    {
      id: 'electronic-evidence',
      title: t('focusAreas.electronicEvidence.title'),
      description: t('focusAreas.electronicEvidence.description'),
      icon: DocumentTextIcon,
      color: 'primary',
    },
    {
      id: 'digital-taxation',
      title: t('focusAreas.digitalTaxation.title'),
      description: t('focusAreas.digitalTaxation.description'),
      icon: CurrencyDollarIcon,
      color: 'secondary',
    },
    {
      id: 'telecommunications',
      title: t('focusAreas.telecom.title'),
      description: t('focusAreas.telecom.description'),
      icon: SignalIcon,
      color: 'primary',
    },
    {
      id: 'tech-human-rights',
      title: t('focusAreas.techRights.title'),
      description: t('focusAreas.techRights.description'),
      icon: ScaleIcon,
      color: 'accent',
    },
    {
      id: 'space-policy',
      title: t('focusAreas.space.title'),
      description: t('focusAreas.space.description'),
      icon: RocketLaunchIcon,
      color: 'secondary',
    },
    {
      id: 'regional-integration',
      title: t('focusAreas.regionalIntegration.title'),
      description: t('focusAreas.regionalIntegration.description'),
      icon: LinkIcon,
      color: 'primary',
    },
    {
      id: 'international-cooperation',
      title: t('focusAreas.intlCooperation.title'),
      description: t('focusAreas.intlCooperation.description'),
      icon: GlobeAltIcon,
      color: 'secondary',
    },
    {
      id: 'ict4d',
      title: t('focusAreas.ict4d.title'),
      description: t('focusAreas.ict4d.description'),
      icon: GlobeAltIcon,
      color: 'secondary',
    },
  ];

  const getColorClasses = (color: string) => {
    const colorMap: Record<string, { bg: string; icon: string; hover: string; border: string }> = {
      primary: {
        bg: 'bg-primary-50',
        icon: 'text-primary-600',
        hover: 'hover:border-primary-300',
        border: 'border-primary-200',
      },
      secondary: {
        bg: 'bg-secondary-50',
        icon: 'text-secondary-600',
        hover: 'hover:border-secondary-300',
        border: 'border-secondary-200',
      },
      accent: {
        bg: 'bg-accent-50',
        icon: 'text-accent-600',
        hover: 'hover:border-accent-300',
        border: 'border-accent-200',
      },
      danger: {
        bg: 'bg-danger-50',
        icon: 'text-danger-600',
        hover: 'hover:border-danger-300',
        border: 'border-danger-200',
      },
    };
    return colorMap[color] || colorMap.primary;
  };

  return (
    <>
      <Seo
        title={t('focusAreas.meta.title')}
        description={t('focusAreas.meta.description')}
      />
      <main className="bg-neutral-50 min-h-screen">
        <PageHeader title={t('focusAreas.hero.title')} subtitle={t('focusAreas.hero.subtitle')} />

        {/* Focus Areas Grid */}
        <section className="py-16 md:py-20">
          <div className="container-custom">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {focusAreas.map((area) => {
                const colors = getColorClasses(area.color);
                return (
                  <Link
                    key={area.id}
                    to={`/repository?theme=${encodeURIComponent(area.title)}`}
                    className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-primary-300 hover:shadow-md focus-ring"
                  >
                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${colors.bg}`}>
                      <area.icon className={`h-6 w-6 ${colors.icon}`} aria-hidden="true" />
                    </div>
                    <h2 className="mb-2 text-lg font-semibold text-neutral-900 group-hover:text-primary-700">
                      {area.title}
                    </h2>
                    <p className="flex-1 text-sm leading-relaxed text-neutral-600">
                      {area.description}
                    </p>
                    <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-primary-600">
                      {t('focusAreas.learnMore')}
                      <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-primary-700 py-16 text-white md:py-20">
          <div className="container-custom flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold md:text-3xl">
                {t('focusAreas.cta.title')}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-primary-50">
                {t('focusAreas.cta.description')}
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap gap-4">
              <Link
                to="/publications"
                className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700"
              >
                {t('focusAreas.cta.publications')}
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-lg border border-white/60 px-6 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700"
              >
                {t('focusAreas.cta.contact')}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
