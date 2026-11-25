import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowRightIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CalendarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import Seo from '../components/Seo';
import PolicyCard from '../components/PolicyCard';
import PublicationCard from '../components/PublicationCard';
import CountryFlag from '../components/CountryFlag';
import { SkeletonCard } from '../components/Skeleton';
import { fetchAllDocuments, fetchPublications, fetchNewsArticles } from '../utils/content';
import { Policy, Publication, NewsArticle } from '../types';

/* ── Lightweight localStorage cache (stale-while-revalidate) ──── */
const CACHE_KEY = 'aictig_home_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes — after this, background refresh

/** Number of languages the site is translated into (src/i18n/locales). */
const LANGUAGE_COUNT = 7;

interface RepositoryStats {
  totalPolicies: number;
  totalPublications: number;
  totalCountries: number;
  /** Countries with the most documents, for the flag row in the hero. */
  topCountries: { code: string; name: string }[];
  /** Themes with the most documents, for the bars in the hero card. */
  topThemes: { name: string; count: number }[];
}

interface HomeCache extends RepositoryStats {
  ts: number;
  policies: Policy[];
  publications: Publication[];
  news: NewsArticle[];
}

const EMPTY_STATS: RepositoryStats = {
  totalPolicies: 0,
  totalPublications: 0,
  totalCountries: 0,
  topCountries: [],
  topThemes: [],
};

function readCache(): HomeCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HomeCache;
  } catch {
    return null;
  }
}

function writeCache(data: HomeCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

function computeStats(policies: Policy[], publications: Publication[]): RepositoryStats {
  const countries = new Map<string, { name: string; count: number }>();
  const themes = new Map<string, number>();
  for (const p of policies) {
    const code = (p.countryCode || '').toLowerCase();
    if (/^[a-z]{2}$/.test(code)) {
      const entry = countries.get(code) || { name: p.country, count: 0 };
      entry.count += 1;
      countries.set(code, entry);
    }
    for (const theme of p.themes || []) {
      const name = theme.trim();
      if (name) themes.set(name, (themes.get(name) || 0) + 1);
    }
  }
  return {
    totalPolicies: policies.length,
    totalPublications: publications.length,
    totalCountries: countries.size,
    topCountries: [...countries.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6)
      .map(([code, { name }]) => ({ code, name })),
    topThemes: [...themes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count })),
  };
}

/* ── Motion helpers ───────────────────────────────────────────── */

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** True once the element has scrolled into view (stays true). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

/** Counts from 0 up to `target` once `start` is true. */
function useCountUp(target: number, start: boolean, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion() || target <= 0) {
      setValue(target);
      return;
    }
    let frame = 0;
    const begin = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, start, duration]);
  return value;
}

function CountUp({ value, start }: { value: number; start: boolean }) {
  const shown = useCountUp(value, start);
  return <>{value > 0 ? shown.toLocaleString() : '—'}</>;
}

/* ── Small building blocks ────────────────────────────────────── */

function SectionHeader({ id, title, linkTo, linkLabel }: { id: string; title: string; linkTo: string; linkLabel: string }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h2 id={id} className="text-2xl font-bold text-neutral-900 md:text-3xl">
        {title}
      </h2>
      <Link
        to={linkTo}
        className="inline-flex items-center gap-1 rounded text-sm font-semibold text-primary-600 hover:text-primary-700 hover:underline focus-ring"
      >
        {linkLabel}
        <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      </Link>
    </div>
  );
}

const FEATURES = [
  {
    key: 'repository',
    to: '/repository',
    Icon: DocumentTextIcon,
    tile: 'bg-primary-50 text-primary-600',
  },
  {
    key: 'multilingual',
    to: '/consultancy',
    Icon: BriefcaseIcon,
    tile: 'bg-accent-50 text-accent-700',
  },
  {
    key: 'openAccess',
    to: '/publications',
    Icon: BookOpenIcon,
    tile: 'bg-secondary-50 text-secondary-600',
  },
] as const;

/* ── Page ─────────────────────────────────────────────────────── */

export default function Home() {
  const { t } = useTranslation(['home', 'common']);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [stats, setStats] = useState<RepositoryStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [panelRef, panelInView] = useInView<HTMLDivElement>();

  const applyData = useCallback(
    (policiesData: Policy[], pubsData: Publication[], newsData: NewsArticle[]) => {
      const nextStats = computeStats(policiesData, pubsData);
      setStats(nextStats);
      setPolicies(policiesData.slice(0, 3));
      setPublications(pubsData.slice(0, 3));
      setNews(newsData.slice(0, 3));

      writeCache({
        ts: Date.now(),
        policies: policiesData.slice(0, 3),
        publications: pubsData.slice(0, 3),
        news: newsData.slice(0, 3),
        ...nextStats,
      });
    },
    [],
  );

  useEffect(() => {
    const cached = readCache();

    // Instantly hydrate from cache if available
    if (cached) {
      setPolicies(cached.policies);
      setPublications(cached.publications);
      setNews(cached.news);
      setStats({
        totalPolicies: cached.totalPolicies,
        totalPublications: cached.totalPublications,
        totalCountries: cached.totalCountries,
        topCountries: cached.topCountries || [],
        topThemes: cached.topThemes || [],
      });
      setLoading(false);

      // If cache is fresh, skip network request
      if (Date.now() - cached.ts < CACHE_TTL) return;
    }

    // Fetch fresh data (foreground if no cache, background if stale)
    Promise.all([
      fetchAllDocuments(),
      fetchPublications(),
      fetchNewsArticles(),
    ])
      .then(([policiesData, pubsData, newsData]) => {
        applyData(policiesData, pubsData, newsData);
      })
      .catch((error) => {
        console.error('Error loading data:', error);
      })
      .finally(() => setLoading(false));
  }, [applyData]);

  const maxThemeCount = stats.topThemes[0]?.count || 1;

  return (
    <>
      <Seo
        title={t('common:navigation.home')}
        description={t('home:hero.subtitle')}
        keywords={['cybersecurity', 'Africa', 'ICT governance', 'policy repository', 'digital transformation', 'data protection', 'AICTiG']}
      />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="bg-secondary-700 text-white" aria-labelledby="home-hero-title">
          <div className="container-custom">
            <div className="grid items-center gap-12 py-16 md:py-20 lg:grid-cols-12 lg:py-24">
              {/* Copy */}
              <div className="lg:col-span-7">
                <p className="text-sm font-semibold uppercase tracking-wider text-accent-400">
                  {t('hero.eyebrow')}
                </p>

                <h1
                  id="home-hero-title"
                  className="mt-4 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:whitespace-pre-line"
                >
                  {t('hero.title')}
                </h1>

                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-secondary-100 sm:text-xl">
                  {t('hero.subtitle')}
                </p>

                <div className="mt-10 flex flex-wrap gap-4">
                  <Link
                    to="/repository"
                    className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-6 py-3 font-semibold text-neutral-900 transition-colors hover:bg-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-700"
                  >
                    {t('hero.cta.repository')}
                    <ArrowRightIcon className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                  <Link
                    to="/news"
                    className="inline-flex items-center rounded-lg border border-white/60 px-6 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-secondary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-700"
                  >
                    {t('hero.cta.updates')}
                  </Link>
                </div>

                {stats.topCountries.length > 0 && (
                  <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-white/15 pt-6">
                    <div className="flex gap-1.5">
                      {stats.topCountries.map((c) => (
                        <CountryFlag key={c.code} countryCode={c.code} countryName={c.name} />
                      ))}
                    </div>
                    <p className="text-sm text-secondary-100">
                      <span className="font-semibold text-white">{stats.totalCountries}</span>{' '}
                      {t('stats.countries')}
                    </p>
                  </div>
                )}
              </div>

              {/* Repository card */}
              <div className="lg:col-span-5" ref={panelRef}>
                <div className="rounded-xl bg-white p-6 text-neutral-900 shadow-lg sm:p-8">
                  <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4">
                    <h2 className="text-base font-semibold text-neutral-900">{t('panel.title')}</h2>
                    <Link
                      to="/repository"
                      className="rounded text-sm font-medium text-primary-600 hover:text-primary-700 focus-ring"
                    >
                      {t('recentPolicies.viewAll')}
                    </Link>
                  </div>

                  <div className="mt-6">
                    <div className="text-5xl font-bold tracking-tight text-secondary-700">
                      {loading && !stats.totalPolicies ? (
                        <span className="inline-block h-12 w-28 animate-pulse rounded bg-neutral-200 align-middle" />
                      ) : (
                        <CountUp value={stats.totalPolicies} start={panelInView} />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-neutral-600">{t('stats.policies')}</p>
                  </div>

                  {(loading || stats.topThemes.length > 0) && (
                    <div className="mt-8">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        {t('panel.themes')}
                      </h3>
                      <ul className="mt-4 space-y-4">
                        {stats.topThemes.length > 0
                          ? stats.topThemes.map((theme) => (
                              <li key={theme.name}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                  <span className="truncate text-neutral-700">{theme.name}</span>
                                  <span className="font-semibold tabular-nums text-neutral-900">{theme.count}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                                  <div
                                    className="h-full rounded-full bg-primary-500"
                                    style={{ width: `${Math.max(4, (theme.count / maxThemeCount) * 100)}%` }}
                                  />
                                </div>
                              </li>
                            ))
                          : [0, 1, 2, 3].map((i) => (
                              <li key={i} className="space-y-2">
                                <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-200" />
                                <div className="h-2 animate-pulse rounded-full bg-neutral-100" />
                              </li>
                            ))}
                      </ul>
                    </div>
                  )}

                  <dl className="mt-8 grid grid-cols-3 divide-x divide-neutral-200 border-t border-neutral-200 pt-6 text-center rtl:divide-x-reverse">
                    {[
                      { label: t('stats.countries'), value: stats.totalCountries },
                      { label: t('stats.languages'), value: LANGUAGE_COUNT },
                      { label: t('stats.publications'), value: stats.totalPublications },
                    ].map((s) => (
                      <div key={s.label} className="flex flex-col-reverse px-2">
                        <dt className="mt-1 text-xs leading-snug text-neutral-500">{s.label}</dt>
                        <dd className="text-2xl font-bold tabular-nums text-neutral-900">
                          {loading && !s.value ? (
                            <span className="mx-auto block h-7 w-10 animate-pulse rounded bg-neutral-200" />
                          ) : (
                            <CountUp value={s.value} start={panelInView} />
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── What we offer ───────────────────────────────────── */}
        <section className="bg-neutral-50 py-16 md:py-20" aria-labelledby="home-features-title">
          <div className="container-custom">
            <h2 id="home-features-title" className="mb-10 text-2xl font-bold text-neutral-900 md:text-3xl">
              {t('features.title')}
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {FEATURES.map(({ key, to, Icon, tile }) => (
                <Link
                  key={key}
                  to={to}
                  className="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-8 transition-colors hover:border-primary-300 hover:shadow-md focus-ring"
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-lg ${tile}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-neutral-900 group-hover:text-primary-700">
                    {t(`features.${key}.title`)}
                  </h3>
                  <p className="mt-2 leading-relaxed text-neutral-600">{t(`features.${key}.description`)}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ── Recent policies ─────────────────────────────────── */}
        {(loading || policies.length > 0) && (
          <section className="bg-white py-16 md:py-20" aria-labelledby="home-policies-title">
            <div className="container-custom">
              <SectionHeader
                id="home-policies-title"
                title={t('recentPolicies.title')}
                linkTo="/repository"
                linkLabel={t('recentPolicies.viewAll')}
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loading && policies.length === 0
                  ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                  : policies.map((policy) => <PolicyCard key={policy.id} policy={policy} />)}
              </div>
            </div>
          </section>
        )}

        {/* ── Latest publications ─────────────────────────────── */}
        {(loading || publications.length > 0) && (
          <section className="bg-neutral-50 py-16 md:py-20" aria-labelledby="home-publications-title">
            <div className="container-custom">
              <SectionHeader
                id="home-publications-title"
                title={t('latestPublications.title')}
                linkTo="/publications"
                linkLabel={t('latestPublications.viewAll')}
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loading && publications.length === 0
                  ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                  : publications.map((pub) => <PublicationCard key={pub.id} publication={pub} />)}
              </div>
            </div>
          </section>
        )}

        {/* ── Latest news ─────────────────────────────────────── */}
        {(loading || news.length > 0) && (
          <section className="bg-white py-16 md:py-20" aria-labelledby="home-news-title">
            <div className="container-custom">
              <SectionHeader
                id="home-news-title"
                title={t('home:latestNews.title')}
                linkTo="/news"
                linkLabel={t('home:latestNews.viewAll')}
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loading && news.length === 0
                  ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                  : news.map((article) => (
                      <Link
                        key={article.id}
                        to={`/news/${article.slug}`}
                        className="group flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-primary-300 hover:shadow-md focus-ring"
                      >
                        <div className="aspect-[16/9] overflow-hidden bg-neutral-200">
                          <img
                            src={article.image}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            width="400"
                            height="225"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex flex-1 flex-col p-6">
                          <div className="flex items-center gap-1.5 text-sm text-neutral-500">
                            <CalendarIcon className="h-4 w-4" aria-hidden="true" />
                            <time dateTime={article.date}>{dayjs(article.date).format('MMM D, YYYY')}</time>
                          </div>
                          <h3 className="mt-2 text-lg font-semibold leading-snug text-neutral-900 line-clamp-2 group-hover:text-primary-700">
                            {article.title}
                          </h3>
                          {article.excerpt && (
                            <p className="mt-2 text-sm leading-relaxed text-neutral-600 line-clamp-3">{article.excerpt}</p>
                          )}
                        </div>
                      </Link>
                    ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Closing call to action ──────────────────────────── */}
        <section className="bg-primary-700 py-16 text-white md:py-20" aria-labelledby="home-cta-title">
          <div className="container-custom">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <h2 id="home-cta-title" className="text-2xl font-bold md:text-3xl">
                  {t('cta.title')}
                </h2>
                <p className="mt-3 text-lg leading-relaxed text-primary-50">{t('cta.text')}</p>
              </div>
              <div className="flex flex-shrink-0 flex-wrap gap-4">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700"
                >
                  {t('common:navigation.contact')}
                  <ArrowRightIcon className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </Link>
                <Link
                  to="/consultancy"
                  className="inline-flex items-center rounded-lg border border-white/60 px-6 py-3 font-semibold text-white transition-colors hover:bg-white hover:text-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700"
                >
                  {t('common:navigation.consultancy')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
