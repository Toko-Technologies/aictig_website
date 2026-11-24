/**
 * Backend configuration.
 *
 * AICTIG_DATA_DIR is where the backend keeps everything it writes: the SQLite
 * database and uploaded images. In production it must be a folder the app
 * user (aictig-run) can write to, outside the code checkout — for example
 * /var/lib/aictig-website. Locally it defaults to ./data (git-ignored).
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadConfig(overrides = {}) {
  const env = overrides.env ?? process.env.NODE_ENV ?? 'development';
  const isProd = env === 'production';
  const dataDir = path.resolve(overrides.dataDir ?? process.env.AICTIG_DATA_DIR ?? path.join(ROOT, 'data'));

  return {
    root: ROOT,
    isProd,
    dataDir,
    dbFile: path.join(dataDir, 'aictig.sqlite'),
    uploadsDir: path.join(dataDir, 'uploads'),
    // Cookies are marked Secure (HTTPS only) in production.
    secureCookies: overrides.secureCookies ?? isProd,
  };
}

module.exports = { loadConfig, ROOT };
