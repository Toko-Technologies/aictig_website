import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Extra content under the subtitle (buttons, meta, ...). */
  children?: ReactNode;
}

/**
 * Solid brand-blue banner at the top of an inner page. Matches the home page
 * hero so every page opens the same way.
 */
export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <section className="bg-secondary-700 text-white">
      <div className="container-custom py-12 md:py-16">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">{title}</h1>
        {subtitle && (
          <p className="mt-4 max-w-3xl text-lg leading-relaxed text-secondary-100 md:text-xl">{subtitle}</p>
        )}
        {children}
      </div>
    </section>
  );
}
