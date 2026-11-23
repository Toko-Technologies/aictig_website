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

SSH into your VPS:

```bash
# Clone the production branch into a ROOT-OWNED directory (not /home/aictig:
# the vhost user owns that and could swap code that PM2 runs as root)
git clone -b production https://github.com/Toko-Technologies/aictig_website.git /opt/aictig-website
chmod 750 /opt/aictig-website

# Install dependencies and build
cd /opt/aictig-website
npm ci
npm run build
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

### 4.3 Start the app with PM2

The project includes `ecosystem.config.cjs` which runs the Express server on port 3001:

```bash
cd /opt/aictig-website
pm2 start ecosystem.config.cjs
pm2 status    # should show "aictig-website" as online
```

### 4.4 Auto-start PM2 on server reboot

```bash
pm2 save
pm2 startup
# PM2 will print a sudo command — copy and run it, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u aictig --hp /home/aictig
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

1. **verify** (on GitHub): `npm ci` + `npm run build` (typecheck + vite). If the
   commit does not build, it stops here and the server is never touched.
2. **deploy**: GitHub SSHes into the VPS with a key that can do exactly one
   thing — run `/usr/local/sbin/aictig-deploy.sh` (forced command). It:
   - fast-forwards `/opt/aictig-website` to `origin/production`
     (refuses if someone edited tracked files on the box),
   - runs `npm ci` only if `package.json`/`package-lock.json` changed,
   - builds into `dist.new`, then swaps it in for `dist` (the live site keeps
     serving the old build until the new one is complete),
   - `pm2 restart aictig-website`, then checks `127.0.0.1:3001` and its JS
     bundle return 200,
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
| App checkout | `/opt/aictig-website` (branch `production`) |
| PM2 logs | `/var/log/aictig-website/` |
| Repo secrets | `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS` |
| CI key on server | `/root/.ssh/aictig_ci_deploy` (+ `authorized_keys` entry `github-actions-aictig-deploy`) |

### Rules

- **Rollback:** revert the bad commit on `main` and push it to `production`
  again. The previous build is also kept at `/opt/aictig-website/.dist.old`.
- **Don't edit files on the server.** The next deploy will stop and say so.
- **Changing `deploy/aictig-deploy.sh`** does not update the server copy — on
  purpose, so a push can never rewrite what the CI key runs. Reinstall by hand:
  `install -m 700 -o root -g root deploy/aictig-deploy.sh /usr/local/sbin/aictig-deploy.sh`
  (from a Linux checkout, or with CRLF stripped).
- **Changing `ecosystem.config.cjs`** (port, log paths, memory limit) needs
  `pm2 delete aictig-website && pm2 start /opt/aictig-website/ecosystem.config.cjs && pm2 save`
  on the server; a normal deploy only restarts.
- **Redeploy by hand** (on the server): `/usr/local/sbin/aictig-deploy.sh`

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
