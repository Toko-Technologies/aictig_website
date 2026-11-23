/**
 * PM2 definition for aictig-website. The single source is deploy/pm2.json.
 *
 * On the server PM2 is started from a ROOT-OWNED copy:
 *   /etc/aictig-website/pm2.json   (installed from deploy/pm2.json)
 * never from this file: PM2 runs as root and `require`s a .cjs config, and
 * the checkout is owned by the unprivileged aictig-build user. JSON is parsed,
 * not executed. See DEPLOYMENT.md section 9.
 */
module.exports = require('./deploy/pm2.json');
