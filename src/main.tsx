import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { trackWebVital } from './utils/analytics';
import { loadSiteContent } from './content/siteContent';
import { INITIAL_LANGUAGE, loadLanguage } from './i18n';

// Before the first render: apply texts and settings from the admin dashboard,
// and download the visitor's language if it is not English (both in parallel).
Promise.allSettled([loadSiteContent(), loadLanguage(INITIAL_LANGUAGE)]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});

// Report Core Web Vitals to Matomo as custom events
import { onCLS, onINP, onLCP, onTTFB } from 'web-vitals';
onCLS((m) => trackWebVital('CLS', m.value));
onINP((m) => trackWebVital('INP', m.value));
onLCP((m) => trackWebVital('LCP', m.value));
onTTFB((m) => trackWebVital('TTFB', m.value));
