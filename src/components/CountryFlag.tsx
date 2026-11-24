import { useState } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

/**
 * Country flags are bundled SVGs in /public/flags (from the MIT-licensed
 * country-flag-icons package). Images are used instead of flag emojis
 * because Windows renders flag emojis as plain letters ("NG", "KE").
 */
export function getCountryFlagUrl(iso2: string): string | null {
  if (!iso2 || !/^[a-z]{2}$/i.test(iso2)) return null;
  return `/flags/${iso2.toLowerCase()}.svg`;
}

interface CountryFlagProps {
  countryCode: string;
  countryName?: string;
  size?: 'sm' | 'md' | 'lg';
}

// 3:2 boxes, roughly matching the footprint of the previous emoji sizes.
const sizeClasses = {
  sm: 'w-[21px] h-[14px]',
  md: 'w-[30px] h-5',
  lg: 'w-12 h-8',
};

export default function CountryFlag({ countryCode, countryName, size = 'md' }: CountryFlagProps) {
  const [failed, setFailed] = useState(false);
  const url = getCountryFlagUrl(countryCode);
  const label = countryName || countryCode || 'Africa';
  const box = `inline-block flex-shrink-0 ${sizeClasses[size]}`;

  // No country (regional / continental documents) or unknown code: neutral globe.
  if (!url || failed) {
    return (
      <span
        className={`${box} inline-flex items-center justify-center rounded-sm bg-primary-50 text-primary-600`}
        role="img"
        aria-label={label}
        title={label}
      >
        <GlobeAltIcon className="w-[70%] h-[70%]" aria-hidden="true" />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={label}
      title={label}
      width={size === 'lg' ? 48 : size === 'md' ? 30 : 21}
      height={size === 'lg' ? 32 : size === 'md' ? 20 : 14}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`${box} rounded-sm object-cover ring-1 ring-black/10`}
    />
  );
}
