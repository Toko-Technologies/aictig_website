#!/usr/bin/env node
/**
 * Create a dashboard account, or reset the password of an existing one.
 *
 *   node scripts/create-admin.cjs --email owner@aictig.org --name "Jane Doe"
 *   node scripts/create-admin.cjs --email owner@aictig.org --reset-password
 *
 * You will be asked for the password (it is not shown while typing).
 * On the server, run it as the app user with the same data folder, e.g.:
 *
 *   sudo -u aictig-run AICTIG_DATA_DIR=/var/lib/aictig-website \
 *     node /opt/aictig-website/scripts/create-admin.cjs --email ... --name ...
 */
const readline = require('readline');
const { loadConfig } = require('../server/config.cjs');
const { openDatabase, logChange } = require('../server/db.cjs');
const { createUser, hashPassword, validatePassword } = require('../server/auth.cjs');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = (s) => { if (!rl.stdoutMuted) rl.output.write(s); };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

async function main() {
  const email = arg('email');
  const reset = process.argv.includes('--reset-password');
  const name = arg('name');
  if (!email || (!reset && !name)) {
    console.log('Usage:\n  node scripts/create-admin.cjs --email <email> --name "<full name>"\n  node scripts/create-admin.cjs --email <email> --reset-password');
    process.exit(1);
  }

  const config = loadConfig();
  const db = openDatabase(config.dbFile);
  console.log(`Database: ${config.dbFile}`);

  let password = process.env.AICTIG_ADMIN_PASSWORD;
  if (!password) {
    password = await askHidden('Password (at least 10 characters): ');
    const again = await askHidden('Repeat password: ');
    if (password !== again) {
      console.error('The passwords do not match. Nothing was changed.');
      process.exit(1);
    }
  }
  const problem = validatePassword(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }

  if (reset) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
    if (!user) {
      console.error(`No account with the email ${email}.`);
      process.exit(1);
    }
    db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?')
      .run(hashPassword(password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    logChange(db, null, 'account.password', `Password reset from the server for ${user.name} (${user.email})`);
    console.log(`Password updated for ${user.email}. They can now sign in at /admin.`);
  } else {
    try {
      const user = createUser(db, { name, email, password });
      logChange(db, null, 'users.create', `Dashboard account created from the server for ${user.name} (${user.email})`);
      console.log(`Account created for ${user.email}. Sign in at /admin.`);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }
  db.close();
}

main();
