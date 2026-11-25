import { useTranslation } from 'react-i18next';
import type { TeamMember } from '../content/team';

/** A team member's portrait, or their initials when no photo was uploaded. */
export default function ExpertPhoto({
  member,
  eager = false,
  className = '',
}: {
  member: Pick<TeamMember, 'name' | 'photo'>;
  eager?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('about');

  if (!member.photo) {
    const initials = member.name
      .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    return (
      <div
        role="img"
        aria-label={member.name}
        className={`w-full h-full flex items-center justify-center bg-secondary-600 ${className}`}
      >
        <span className="text-5xl font-bold text-white/90">{initials}</span>
      </div>
    );
  }

  return (
    <img
      src={member.photo}
      alt={t('experts.photoAlt', { name: member.name })}
      width={640}
      height={800}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`w-full h-full object-cover object-top ${className}`}
    />
  );
}
