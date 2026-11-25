import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect, lazy, Suspense } from 'react';
import './i18n';
import { UiProvider } from './context/UiContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Toast from './components/Toast';
import Home from './pages/Home';
import { pageLoaders, prefetchAllPages } from './pages/loaders';
import { trackPageView, initAnalytics } from './utils/analytics';
import ErrorBoundary from './components/ErrorBoundary';

// Pages are loaded on demand; see pages/loaders.ts for the prefetching.
const Repository = lazy(pageLoaders.repository);
const PolicyDetail = lazy(pageLoaders.policyDetail);
const Publications = lazy(pageLoaders.publications);
const PublicationDetail = lazy(pageLoaders.publicationDetail);
const Gallery = lazy(pageLoaders.gallery);
const News = lazy(pageLoaders.news);
const NewsDetail = lazy(pageLoaders.newsDetail);
const About = lazy(pageLoaders.about);
const Expert = lazy(pageLoaders.expert);
const FocusAreas = lazy(pageLoaders.focusAreas);
const Consultancy = lazy(pageLoaders.consultancy);
const Contact = lazy(pageLoaders.contact);
const Legal = lazy(pageLoaders.legal);
const AdminApp = lazy(() => import('./admin/AdminApp'));

// Initialize Matomo analytics (once, on app boot)
initAnalytics();

const isAdminPath = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/');

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    // The private dashboard is not counted in the website statistics.
    if (!isAdminPath(pathname)) trackPageView(pathname, pathname);
  }, [pathname]);

  return null;
}

/** Once the first page has fully loaded, fetch the other pages' code in the background. */
function PrefetchPages() {
  useEffect(() => {
    if (document.readyState === 'complete') {
      prefetchAllPages();
      return;
    }
    window.addEventListener('load', prefetchAllPages, { once: true });
    return () => window.removeEventListener('load', prefetchAllPages);
  }, []);
  return null;
}

/** Shown only when a page is opened directly and its code is still downloading. */
function LoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neutral-200 border-t-primary-600" />
    </div>
  );
}

function AppRoutes() {
  const { pathname } = useLocation();

  // The admin dashboard has its own layout (no public header or footer).
  if (isAdminPath(pathname)) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PrefetchPages />
      <Header />
      <div id="main-content" className="flex-grow">
        <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/experts/:slug" element={<Expert />} />
            <Route path="/focus-areas" element={<FocusAreas />} />
            <Route path="/consultancy" element={<Consultancy />} />
            <Route path="/repository" element={<Repository />} />
            <Route path="/repository/:id" element={<PolicyDetail />} />
            <Route path="/publications" element={<Publications />} />
            <Route path="/publications/:slug" element={<PublicationDetail />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/news" element={<News />} />
            <Route path="/news/:slug" element={<NewsDetail />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/legal/:page" element={<Legal />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </ErrorBoundary>
      </div>
      <Footer />
      <Toast />
    </div>
  );
}

function NotFound() {
  return (
    <main className="container-custom py-16">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-neutral-900 mb-4">404</h1>
        <p className="text-xl text-neutral-600 mb-8">Page not found</p>
        <a href="/" className="btn-primary">
          Go Home
        </a>
      </div>
    </main>
  );
}

export default function App() {
  return (
    // v7_startTransition: when a link is clicked, the current page stays on
    // screen until the next one is ready, instead of flashing a spinner.
    <BrowserRouter future={{ v7_startTransition: true }}>
      <UiProvider>
        <ScrollToTop />
        <AppRoutes />
      </UiProvider>
    </BrowserRouter>
  );
}
