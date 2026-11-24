/**
 * Production server for AICTiG website.
 *
 * Serves the Vite-built SPA from dist/ and proxies WordPress API
 * requests internally so Apache never has to proxy to itself.
 *
 * Apache only needs:  ProxyPass / http://localhost:3001/
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const { createBackend, injectSiteData } = require('./server/backend.cjs');

const app = express();
const PORT = process.env.PORT || 3001;

// Apache forwards requests from the same machine; trust it for the visitor's IP
// (used to rate-limit dashboard sign-in attempts).
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

// ─── WordPress backend ────────────────────────────────────────────
// be.aictig.org resolves to the server's own IP via /etc/hosts
// (77.237.243.210) so the connection stays local — no Cloudflare
// round-trip, no SNI mismatch.
const WP_BACKEND = 'https://be.aictig.org';

// ─── GraphQL proxy: /wp-graphql → WordPress WPGraphQL ────────────
app.use('/wp-graphql', createProxyMiddleware({
  target: WP_BACKEND + '/index.php?graphql',
  changeOrigin: true,
  secure: false,
  ignorePath: true,
}));

// ─── Documents proxy: /documents/* → wp-content/uploads/* ────────
app.use('/documents', createProxyMiddleware({
  target: WP_BACKEND,
  changeOrigin: true,
  secure: false,
  pathRewrite: { '^/': '/wp-content/uploads/' },
}));

// ─── Matomo analytics proxy: /m/* → analytics.aictig.org ─────────
// Proxying through the main domain avoids ad-blocker interference.
const MATOMO_BACKEND = 'https://analytics.aictig.org';

app.use('/m/matomo.js', createProxyMiddleware({
  target: MATOMO_BACKEND + '/matomo.js',
  changeOrigin: true,
  secure: false,
  ignorePath: true,
}));

app.use('/m/matomo.php', createProxyMiddleware({
  target: MATOMO_BACKEND + '/matomo.php',
  changeOrigin: true,
  secure: false,
  ignorePath: false,
  pathRewrite: { '^/m/matomo.php': '/matomo.php' },
}));

// --- Backend: dashboard API, public content API, uploaded images ---
// See server/backend.cjs. Data lives in AICTIG_DATA_DIR (default ./data).
// If the backend cannot start (for example the data folder is missing or not
// writable), the public website keeps working with its built-in texts and
// only the dashboard reports the problem.
let backend = null;
try {
  backend = createBackend();
  app.use(backend.router);
} catch (err) {
  console.error('[backend] Could not start the dashboard backend. The public site runs with built-in texts.', err);
  app.use('/api/admin', (req, res) => res.status(503).json({
    error: 'The dashboard is not available right now: the server could not open its data folder. Please contact the website administrator.',
  }));
}
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// --- Static files from Vite build ---
// index: false so "/" goes through the SPA handler below, which adds the
// edited texts to the page.
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

// ─── SPA fallback (client-side routing) ──────────────────────────
const INDEX_FILE = path.join(__dirname, 'dist', 'index.html');
let indexCache = { mtimeMs: 0, html: '' };
function readIndexHtml() {
  const { mtimeMs } = fs.statSync(INDEX_FILE);
  if (mtimeMs !== indexCache.mtimeMs) {
    indexCache = { mtimeMs, html: fs.readFileSync(INDEX_FILE, 'utf8') };
  }
  return indexCache.html;
}

app.get('*', (req, res) => {
  // Don't serve index.html for missing static assets
  if (/\.\w+$/.test(req.path)) {
    return res.status(404).end();
  }
  if (req.path === '/admin' || req.path.startsWith('/admin/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', 'DENY');
  }
  res.setHeader('Cache-Control', 'no-cache');
  const html = readIndexHtml();
  return res.type('html').send(backend ? injectSiteData(html, backend.siteData()) : html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AICTiG server running on http://0.0.0.0:${PORT}`);
});
