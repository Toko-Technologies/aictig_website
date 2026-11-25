import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  ScaleIcon,
  ClipboardDocumentCheckIcon,
  AcademicCapIcon,
  MapIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import Seo from '../components/Seo';
import PageHeader from '../components/PageHeader';

export default function Consultancy() {
  const { t } = useTranslation(['common']);

  const services = [
    {
      id: 'policy-development',
      title: t('consultancy.services.policyDevelopment.title'),
      description: t('consultancy.services.policyDevelopment.description'),
      icon: DocumentTextIcon,
      features: [
        t('consultancy.services.policyDevelopment.feature1'),
        t('consultancy.services.policyDevelopment.feature2'),
        t('consultancy.services.policyDevelopment.feature3'),
      ],
    },
    {
      id: 'legal-analysis',
      title: t('consultancy.services.legalAnalysis.title'),
      description: t('consultancy.services.legalAnalysis.description'),
      icon: ScaleIcon,
      features: [
        t('consultancy.services.legalAnalysis.feature1'),
        t('consultancy.services.legalAnalysis.feature2'),
        t('consultancy.services.legalAnalysis.feature3'),
      ],
    },
    {
      id: 'legal-drafting',
      title: t('consultancy.services.legalDrafting.title'),
      description: t('consultancy.services.legalDrafting.description'),
      icon: DocumentTextIcon,
      features: [
        t('consultancy.services.legalDrafting.feature1'),
        t('consultancy.services.legalDrafting.feature2'),
        t('consultancy.services.legalDrafting.feature3'),
      ],
    },
    {
      id: 'regulatory-compliance',
      title: t('consultancy.services.regulatoryCompliance.title'),
      description: t('consultancy.services.regulatoryCompliance.description'),
      icon: ClipboardDocumentCheckIcon,
      features: [
        t('consultancy.services.regulatoryCompliance.feature1'),
        t('consultancy.services.regulatoryCompliance.feature2'),
        t('consultancy.services.regulatoryCompliance.feature3'),
      ],
    },
    {
      id: 'data-protection-training',
      title: t('consultancy.services.dataProtectionTraining.title'),
      description: t('consultancy.services.dataProtectionTraining.description'),
      icon: ShieldCheckIcon,
      features: [
        t('consultancy.services.dataProtectionTraining.feature1'),
        t('consultancy.services.dataProtectionTraining.feature2'),
        t('consultancy.services.dataProtectionTraining.feature3'),
      ],
    },
    {
      id: 'mapping-studies',
      title: t('consultancy.services.mappingStudies.title'),
      description: t('consultancy.services.mappingStudies.description'),
      icon: MapIcon,
      features: [
        t('consultancy.services.mappingStudies.feature1'),
        t('consultancy.services.mappingStudies.feature2'),
        t('consultancy.services.mappingStudies.feature3'),
      ],
    },
    {
      id: 'policy-evaluation',
      title: t('consultancy.services.policyEvaluation.title'),
      description: t('consultancy.services.policyEvaluation.description'),
      icon: ChartBarIcon,
      features: [
        t('consultancy.services.policyEvaluation.feature1'),
        t('consultancy.services.policyEvaluation.feature2'),
        t('consultancy.services.policyEvaluation.feature3'),
      ],
    },
    {
      id: 'awareness-training',
      title: t('consultancy.services.awarenessTraining.title'),
      description: t('consultancy.services.awarenessTraining.description'),
      icon: AcademicCapIcon,
      features: [
        t('consultancy.services.awarenessTraining.feature1'),
        t('consultancy.services.awarenessTraining.feature2'),
        t('consultancy.services.awarenessTraining.feature3'),
      ],
    },
    {
      id: 'electronic-evidence',
      title: t('consultancy.services.electronicEvidence.title'),
      description: t('consultancy.services.electronicEvidence.description'),
      icon: DocumentTextIcon,
      features: [
        t('consultancy.services.electronicEvidence.feature1'),
        t('consultancy.services.electronicEvidence.feature2'),
        t('consultancy.services.electronicEvidence.feature3'),
      ],
    },
    {
      id: 'breach-management',
      title: t('consultancy.services.breachManagement.title'),
      description: t('consultancy.services.breachManagement.description'),
      icon: ExclamationTriangleIcon,
      features: [
        t('consultancy.services.breachManagement.feature1'),
        t('consultancy.services.breachManagement.feature2'),
        t('consultancy.services.breachManagement.feature3'),
      ],
    },
  ];

  return (
    <>
      <Seo
        title={t('consultancy.meta.title')}
        description={t('consultancy.meta.description')}
      />
      <main className="bg-neutral-50 min-h-screen">
        <PageHeader title={t('consultancy.hero.title')} subtitle={t('consultancy.hero.subtitle')} />

        {/* Services Overview */}
        <section className="py-16 md:py-20">
          <div className="container-custom">
            <div className="mb-10">
              <h2 className="mb-3 text-2xl font-bold text-neutral-900 md:text-3xl">
                {t('consultancy.overview.title')}
              </h2>
              <p className="max-w-3xl text-lg text-neutral-600">
                {t('consultancy.overview.description')}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-xl border border-neutral-200 bg-white p-8"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50">
                      <service.icon className="h-6 w-6 text-primary-600" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-neutral-900 mb-2">
                        {service.title}
                      </h3>
                      <p className="text-neutral-600 mb-4 leading-relaxed">
                        {service.description}
                      </p>
                      <ul className="space-y-2">
                        {service.features.map((feature, index) => (
                          <li key={index} className="flex items-start text-sm text-neutral-600">
                            <svg
                              className="w-5 h-5 text-primary-600 me-2 flex-shrink-0 mt-0.5"
                              aria-hidden="true"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why Choose Us */}
        <section className="py-16 md:py-20 bg-white">
          <div className="container-custom">
            <h2 className="mb-10 text-2xl font-bold text-neutral-900 md:text-3xl">
              {t('consultancy.whyChoose.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { Icon: AcademicCapIcon, tile: 'bg-primary-50 text-primary-600', key: 'expertise' },
                { Icon: MapIcon, tile: 'bg-secondary-50 text-secondary-600', key: 'regional' },
                { Icon: ChartBarIcon, tile: 'bg-accent-50 text-accent-700', key: 'evidenceBased' },
              ].map(({ Icon, tile, key }) => (
                <div key={key} className="rounded-xl border border-neutral-200 bg-white p-8">
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-lg ${tile}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-neutral-900">
                    {t(`consultancy.whyChoose.${key}.title`)}
                  </h3>
                  <p className="leading-relaxed text-neutral-600">
                    {t(`consultancy.whyChoose.${key}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-primary-700 py-16 text-white md:py-20">
          <div className="container-custom flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-bold md:text-3xl">
                {t('consultancy.cta.title')}
              </h2>
              <p className="mt-3 text-lg leading-relaxed text-primary-50">
                {t('consultancy.cta.description')}
              </p>
            </div>
            <Link
              to="/contact"
              className="inline-flex flex-shrink-0 items-center justify-center self-start rounded-lg bg-white px-6 py-3 font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700 lg:self-auto"
            >
              {t('consultancy.cta.button')}
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
