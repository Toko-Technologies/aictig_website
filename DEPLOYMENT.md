# AICTiG Website — Deployment Guide

**Stack:** Vite + React SPA → Express + PM2 (port 3001) → Apache reverse proxy (Virtualmin) → Contabo VPS  
**Backend:** WordPress + WPGraphQL at `be.aictig.org` (proxied, never exposed to browser)

> **Deploying a change:** `git push origin main:production`. That's it — see
> [section 9](#9-update--redeploy-automatic). The app now lives in
> `/opt/aictig-website` (root-owned), not `/home/aictig/public_html`.

---

## Architecture Overview

```
Browser → https://www.aictig.org
                │
           Apache (port 443)
                │
         ProxyPass /*
                │
         localhost:3001
         (Express + PM2)
                │
      ┌─────────┼─────────────────┐
      │         │                 │
  /wp-graphql   /documents/*   Static + SPA
      │         │                 │
  proxy to    proxy to       dist/ files
  be.aictig   be.aictig      + index.html
  .org        .org             fallback
```

Apache does **one thing**: reverse proxy everything to Node.js on port 3001.  
The Express server handles WordPress communication internally via `/etc/hosts` (local loopback).  
The WordPress backend domain (`be.aictig.org`) is **never** exposed to the browser.

---

## Prerequisites

- Contabo VPS with Virtualmin/Webmin installed
- Domain `aictig.org` / `www.aictig.org` DNS pointing to your VPS IP
- SSH access (root or sudo user)
- Node.js 18+ installed on the server
- Git installed on the server

---

## 1. Server Preparation (one-time)

### 1.1 Install Node.js (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # should be 20.x
npm -v
```

### 1.2 Enable required Apache modules

```bash
sudo a2enmod proxy proxy_http rewrite headers ssl
sudo systemctl restart apache2
```

### 1.3 Create the virtual server in Virtualmin

1. Log in to **Virtualmin** (`https://your-ip:10000`)
2. **Create Virtual Server** (or select existing one for `aictig.org`)
   - Domain: `aictig.org`
   - Home directory: `/home/aictig`
   - Document root will be: `/home/aictig/public_html`

---

## 2. Push Code to GitHub (from your local machine)

On your local Windows machine:

```powershell
cd C:\Users\USER\Desktop\AICTIG\Website

# Initialize git if not done already
git init
git remote add origin https://github.com/YOUR_USERNAME/aictig-website.git

# Add and commit
git add .
git commit -m "Production deploy"

# Push
git push -u origin main
```

---

## 3. Clone & Build on the Server

The site is built and run by two dedicated, no-login users — never root, and
never the Virtualmin vhost user `aictig`:

| User | Does | Can write |
|---|---|---|
| `aictig-build` | git, `npm ci`, `npm run build` | `/opt/aictig-website`, `/var/lib/aictig-build` (npm cache) |
| `aictig-run` | runs `server.cjs` (the live site) | nothing in the checkout |

SSH into your VPS as root:

```bash
# Users (one-time)
useradd --system --user-group --home-dir /var/lib/aictig-build --no-create-home \
        --shell /usr/sbin/nologin aictig-build
install -d -m 750 -o aictig-build -g aictig-build /var/lib/aictig-build
useradd --system --user-group --home-dir /nonexistent --no-create-home \
        --shell /usr/sbin/nologin aictig-run

# Checkout: owned by aictig-build; aictig-run may enter (group) but not write
install -d -m 750 -o aictig-build -g aictig-run /opt/aictig-website
B="setsid -w runuser -u aictig-build -- env -i HOME=/var/lib/aictig-build PATH=/usr/bin:/bin"
$B git clone -b production https://github.com/Toko-Technologies/aictig_website.git /opt/aictig-website
$B sh -c 'cd /opt/aictig-website && npm ci && npm run build'
```

The `npm run build` command produces a `dist/` folder. The Express server (`server.cjs`) serves it.
Apache proxies to port 3001, so the checkout location does not matter to it.

---

## 4. Install & Start PM2

### 4.1 Install PM2 globally (one-time)

```bash
sudo npm install -g pm2
pm2 -v
```

### 4.2 Create logs directory

```bash
install -d -m 750 -o root -g root /var/log/aictig-website
```

PM2 (running as root) writes these logs itself; the site user cannot read them.

### 4.3 Start the app with PM2

PM2 is started from a **root-owned copy** of `deploy/pm2.json`. Never run
`pm2 start ecosystem.config.cjs` from the checkout as root: PM2 *executes* a
`.cjs` config, and the checkout belongs to `aictig-build`. The JSON is only
parsed, and it tells PM2 to drop to `aictig-run` before starting node.

```bash
install -d -m 755 /etc/aictig-website
install -m 644 -o root -g root /opt/aictig-website/deploy/pm2.json /etc/aictig-website/pm2.json
pm2 start /etc/aictig-website/pm2.json
pm2 status                                          # "aictig-website" online
ps -o user= -p "$(pm2 pid aictig-website)"          # must print: aictig-run
```

### 4.4 Auto-start PM2 on server reboot

```bash
pm2 save        # the saved list keeps uid/gid, so after a reboot the site
                # comes back as aictig-run, not root
# On this server PM2 is already enabled at boot as root (pm2-root.service),
# shared with the other apps. On a fresh server: pm2 startup systemd
```

### 4.5 Verify the Node server is running

```bash
curl http://localhost:3001    # should return HTML
```

---

## 5. DNS Override (critical — one-time)

Since `be.aictig.org` resolves to Cloudflare externally, Apache cannot proxy to it
without SNI/SSL conflicts (both domains share the same server IP). Fix this by adding
a `/etc/hosts` entry so the server resolves `be.aictig.org` directly to itself:

```bash
# Add this line (use your server's public IP)
echo "77.237.243.210 be.aictig.org" | sudo tee -a /etc/hosts

# Verify
getent hosts be.aictig.org
# Should show: 77.237.243.210  be.aictig.org
```

This ensures the Express server connects to WordPress locally, bypassing Cloudflare.

---

## 6. Apache Virtual Host Configuration

Apache only does **one thing**: reverse proxy everything to the Express server on port 3001.  
No WordPress proxy rules needed — Express handles those internally.

Go to **Virtualmin → Select `aictig.org` → Server Configuration → Edit Directives** and ensure
the `:443` block contains:

```apache
<VirtualHost 77.237.243.210:443>
    SuexecUserGroup #1003 #1003
    ServerName aictig.org
    ServerAlias www.aictig.org
    ServerAlias mail.aictig.org
    ServerAlias webmail.aictig.org
    ServerAlias admin.aictig.org

    # ─── Let's Encrypt / ACME challenge ─────────────────────
    ProxyPass /.well-known !

    # ─── Reverse Proxy: Everything → Node.js (Express) ──────
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    # ─── Security Headers ───────────────────────────────────
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set X-XSS-Protection "1; mode=block"

    # ─── Caching for static assets ──────────────────────────
    <LocationMatch "\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </LocationMatch>

    # ─── Gzip compression ───────────────────────────────────
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/css
        AddOutputFilterByType DEFLATE application/javascript application/json
        AddOutputFilterByType DEFLATE image/svg+xml
    </IfModule>

    # ─── Webmail/Admin redirects (Virtualmin) ───────────────
    RewriteEngine on
    RewriteCond %{HTTP_HOST} =webmail.aictig.org
    RewriteRule ^/(?!.well-known)(.*)$ https://aictig.org:20000/ [R]
    RewriteCond %{HTTP_HOST} =admin.aictig.org
    RewriteRule ^/(?!.well-known)(.*)$ https://aictig.org:10000/ [R]

    # ─── SSL (Virtualmin-managed) ───────────────────────────
    SSLEngine on
    SSLCertificateFile /etc/ssl/virtualmin/17615693042813697/ssl.combined
    SSLCertificateKeyFile /etc/ssl/virtualmin/17615693042813697/ssl.key
    SSLProtocol all -SSLv2 -SSLv3 -TLSv1 -TLSv1.1

    # ─── Logging ────────────────────────────────────────────
    ErrorLog /var/log/virtualmin/aictig.org_error_log
    CustomLog /var/log/virtualmin/aictig.org_access_log combined
</VirtualHost>
```

> **Note:** No `SSLProxyEngine`, no `ProxyPass` to WordPress, no `<Location>` blocks.
> Express handles all WordPress communication internally.

---

## 7. SSL Certificate (Let's Encrypt via Virtualmin)

1. In Virtualmin, select your domain `aictig.org`
2. Go to **Server Configuration → Manage SSL Certificate → Let's Encrypt**
3. Enter domain names: `aictig.org` and `www.aictig.org`
4. Click **Request Certificate**
5. Enable **Auto-renewal** (checkbox)

Virtualmin will automatically update the SSL paths in your Apache config.

---

## 8. Verify & Restart

```bash
# Test Apache config for syntax errors
sudo apachectl configtest

# Restart Apache
sudo systemctl restart apache2

# Verify PM2 is running
pm2 status

# Verify the site
curl -I https://www.aictig.org       # should return 200
curl -s https://www.aictig.org/wp-graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ mediaItems(first:1) { nodes { title } } }"}' | head -c 200
# should return GraphQL JSON data
```

---

## 9. Update / Redeploy (automatic)

Deploys are automatic (CI/CD via GitHub Actions). Work on `main` as usual;
when you want it live:

```bash
git push origin main:production
```

Or open **GitHub → Actions → Deploy to production → Run workflow** to redeploy
without a push.

### What happens

1. **verify** (on GitHub): `npm ci`, unit tests (`vitest run`), then
   `npm run build` (typecheck + vite). If any fails, it stops here and the
   server is never touched.
2. **deploy**: GitHub SSHes into the VPS with a key that can do exactly one
   thing — run `/usr/local/sbin/aictig-deploy.sh` (forced command). As root it
   only checks and restarts; every step that touches repository code runs as
   `aictig-build`. It:
   - verifies the trust chain (root-owned script and PM2 config; checkout
     owned by `aictig-build` and not writable by `aictig-run`) — refuses if not,
   - fast-forwards `/opt/aictig-website` to `origin/production`
     (refuses if someone edited tracked files on the box),
   - runs `npm ci` only if `package.json`/`package-lock.json` changed,
   - builds into `dist.new`, then swaps it in for `dist`,
   - **restarts the process only if `server.cjs` or dependencies changed.**
     Otherwise there is no restart at all: Express reads `dist/` from disk on
     every request, so the new build is live the moment it is swapped in —
     zero downtime. A restart, when needed, is sub-second, and Apache's
     `retry=0` stops it turning into a minute of 503s,
   - checks the site returns 200, **serves the new bundle**, and that the
     process runs as `aictig-run` with no root uid/gid/groups (from `/proc`),
   - posts the result to the Telegram alerts group.
3. The Action confirms `https://aictig.org/` and `https://www.aictig.org/`
   return 200 from the public internet.

### Pieces

| What | Where |
|---|---|
| Workflow | `.github/workflows/deploy.yml` |
| Server script (source) | `deploy/aictig-deploy.sh` |
| Server script (installed) | `/usr/local/sbin/aictig-deploy.sh` |
| Deploy log | `/var/log/aictig-deploy.log` |
| App checkout | `/opt/aictig-website` (branch `production`), `aictig-build:aictig-run 750` |
| PM2 definition (source) | `deploy/pm2.json` (`ecosystem.config.cjs` just re-exports it) |
| PM2 definition (installed) | `/etc/aictig-website/pm2.json` (root, 644) |
| Users | `aictig-build` (builds), `aictig-run` (runs the site) |
| PM2 logs | `/var/log/aictig-website/` |
| Apache vhost | `/etc/apache2/sites-available/aictig.org.conf` → `localhost:3001` with `retry=0` |
| Repo secrets | `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS` |
| CI key on server | `/root/.ssh/aictig_ci_deploy` (+ `authorized_keys` entry `github-actions-aictig-deploy`) |

### Rules

- **Rollback:** revert the bad commit on `main` and push it to `production`
  again. The previous build is also kept at `/opt/aictig-website/.dist.old`.
- **Don't edit files on the server.** The next deploy will stop and say so.
- **Root-owned copies are never updated by a push** — on purpose, so a push can
  never change what root runs. Every deploy compares them with the repo and says
  `NOTE: ... differs` in its log and Telegram message until you install them.
  After the change has been deployed (so it is in the Linux checkout), review it, then:
  - `deploy/aictig-deploy.sh`:
    `install -m 700 -o root -g root /opt/aictig-website/deploy/aictig-deploy.sh /usr/local/sbin/aictig-deploy.sh`
  - `deploy/pm2.json` (port, log paths, memory limit, users):
    `install -m 644 -o root -g root /opt/aictig-website/deploy/pm2.json /etc/aictig-website/pm2.json`
    then `pm2 delete aictig-website && pm2 start /etc/aictig-website/pm2.json && pm2 save`
    (a sub-second gap; for zero downtime use the bridge procedure in
    `/root/SERVER-RUNBOOK.md`, "aictig.org — unprivileged runtime").
- **Never `pm2 start ecosystem.config.cjs` as root on the server** (see 4.3).
- **Redeploy by hand** (on the server): `/usr/local/sbin/aictig-deploy.sh`
  (`--restart` to force a process restart).
- **Tailwind scans `src/**` including tests**, so a class-like word in a test
  (e.g. `visible`) adds CSS to production. Harmless, but keep it in mind when a
  "test-only" change produces new asset hashes.

---

## Proxy Summary

| Browser URL | Proxied To | Purpose |
|---|---|---|
| `www.aictig.org/*` | `localhost:3001` (Express/PM2) | Everything |
| Express `/wp-graphql` | `be.aictig.org/index.php?graphql` (local via /etc/hosts) | GraphQL API |
| Express `/documents/*` | `be.aictig.org/wp-content/uploads/*` (local via /etc/hosts) | PDF files |

Apache only proxies to `localhost:3001`. Express handles WordPress communication internally.  
The backend domain `be.aictig.org` is **never visible** in the browser.

---

## Troubleshooting

### Site shows 502 Bad Gateway

Apache can't reach the Node.js app. Check PM2:

```bash
pm2 status
pm2 logs aictig-website --lines 20

# If stopped, restart it:
pm2 restart aictig-website

# Verify it's listening:
curl http://localhost:3001
```

### 404 on page refresh (e.g. /repository/123)

`vite preview` handles SPA routing automatically — it serves `index.html` for all routes.  
If this still fails, check that the PM2 app is running and port 3001 is correct.

### GraphQL returns 502 or 503

Apache can't reach the backend. Check:

```bash
# Test from the server directly
curl -s https://be.aictig.org/index.php?graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ generalSettings { title } }"}'
```

If this fails, the WordPress backend may be down or blocking the VPS IP.

### Documents not loading (PDF preview/download)

```bash
# Test the proxy route
curl -I https://www.aictig.org/documents/
# Should return a response (even if 403 for directory listing)

# Test from server directly
curl -I https://be.aictig.org/wp-content/uploads/
```

### SSL certificate errors

In Virtualmin: **Server Configuration → Manage SSL Certificate** → verify the cert is valid.  
Re-request if expired: **Let's Encrypt → Request Certificate**.

### Check Apache error logs

```bash
sudo tail -f /home/aictig/logs/error.log
# or
sudo tail -f /var/log/apache2/error.log
```

---

## Firewall

Ensure ports 80 and 443 are open:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
sudo ufw status
```

---

## Security Checklist

- [x] HTTPS enforced (HTTP → HTTPS redirect)
- [x] Security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- [x] Backend domain hidden behind reverse proxy
- [x] Node.js app on localhost only (port 3001 not exposed externally)
- [x] PM2 auto-restarts on crash and server reboot
- [x] WordPress admin only accessible on `be.aictig.org` (not proxied)
- [x] Firewall configured (only 80/443 open)

---

## PM2 Commands Reference

| Task | Command |
|---|---|
| Check status | `pm2 status` |
| View logs | `pm2 logs aictig-website` |
| View last 100 lines | `pm2 logs aictig-website --lines 100` |
| Restart app | `pm2 restart aictig-website` |
| Stop app | `pm2 stop aictig-website` |
| Delete from PM2 | `pm2 delete aictig-website` |
| Monitor resources | `pm2 monit` |
| Save process list | `pm2 save` |
