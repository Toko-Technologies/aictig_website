import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import type { TeamMember as Expert } from '../content/team';
import ExpertPhoto from './ExpertPhoto';

/** Team card linking to an expert's profile page. */
export default function ExpertCard({ expert }: { expert: Expert }) {
  const { t } = useTranslation('about');
  return (
    <Link
      to={`/experts/${expert.slug}`}
      className="group flex flex-col bg-white rounded-xl border border-neutral-200 overflow-hidden transition hover:border-primary-300 hover:shadow-md focus-ring"
    >
      <div className="aspect-[4/5] overflow-hidden bg-neutral-200">
        <ExpertPhoto member={expert} />
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-xl font-bold text-neutral-900 mb-1 group-hover:text-primary-600 transition-colors">
          {expert.name}
        </h3>
        <p className="text-primary-600 font-semibold text-sm mb-3">{expert.role}</p>
        <p className="text-neutral-600 text-sm leading-relaxed line-clamp-3 mb-4">{expert.summary}</p>
        <span className="mt-auto inline-flex items-center text-sm font-medium text-primary-600">
          {t('experts.viewProfile')}
          <ArrowRightIcon className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
