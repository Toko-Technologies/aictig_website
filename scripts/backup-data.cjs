#!/usr/bin/env node
/**
 * Make a consistent copy of the dashboard database while the site is running.
 *
 *   node scripts/backup-data.cjs /root/backups/aictig-2026-11-24.sqlite
 *
 * On the server:
 *   sudo -u aictig-run AICTIG_DATA_DIR=/var/lib/aictig-website \
 *     node /opt/aictig-website/scripts/backup-data.cjs /var/lib/aictig-website/backups/aictig-$(date +%F).sqlite
 *
 * Uploaded images live next to the database in uploads/; back that folder up
 * as well (for example with tar or rsync).
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { loadConfig } = require('../server/config.cjs');

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node scripts/backup-data.cjs <backup-file.sqlite>');
    process.exit(1);
  }
  const { dbFile } = loadConfig();
  if (!fs.existsSync(dbFile)) {
    console.error(`No database found at ${dbFile}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  await db.backup(path.resolve(target));
  db.close();
  console.log(`Backup written to ${path.resolve(target)}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
