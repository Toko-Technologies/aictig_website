#!/usr/bin/env bash
#
# aictig.org production deploy. Invoked by GitHub Actions over SSH as a
# FORCED COMMAND, so the CI key can only ever trigger this - never get a shell.
#
# Install (as root, by hand - deliberately NOT self-updating, because the file
# GitHub can trigger must not be rewritable by a push):
#   install -m 700 -o root -g root deploy/aictig-deploy.sh /usr/local/sbin/aictig-deploy.sh
# Copy it from a LINUX checkout, or strip CRLF first - bash dies on a CR.
#
# Run by hand:  /usr/local/sbin/aictig-deploy.sh
#
# Design notes (same contract as /usr/local/sbin/amda-deploy.sh):
#   - Build into dist.new and swap it in only once it is complete. The running
#     Express server reads dist/ from disk on every request, so building in
#     place would break the live site for the length of the build - and leave
#     it broken if the build failed.
#   - `git merge --ff-only`, never `reset --hard`: if someone edited tracked
#     files on the box, this stops and says so instead of destroying the work.
#   - Health-checked after restart, including one built asset, because
#     "pm2 says online" is not "the site works".
#   - Exits non-zero on failure so the Action goes red, and reports to Telegram.

set -uo pipefail

APP_DIR=/opt/aictig-website
PM2_NAME=aictig-website
BRANCH=production
HEALTH_URL=http://127.0.0.1:3001/
PUBLIC_URL=https://aictig.org/
LOCK=/var/lock/aictig-deploy.lock
LOG=/var/log/aictig-deploy.log
NOTIFY=/usr/local/sbin/toko-telegram-notify

exec > >(tee -a "$LOG") 2>&1
echo "=============================================================="
if [ -n "${SSH_CONNECTION:-}" ]; then
  TRIGGERED_BY="CI from ${SSH_CONNECTION%% *}"
else
  TRIGGERED_BY="hand"
fi
echo "deploy started $(date -Is) by ${TRIGGERED_BY}"

# ------------------------------------------------------------------ telegram
# toko-telegram-notify exits 0 only when Telegram accepted the message.
notify() {
  if [ -x "$NOTIFY" ]; then
    "$NOTIFY" "$1" "$2" >/dev/null 2>&1 \
      || logger -t aictig-deploy "telegram notify FAILED for: $1"
  else
    logger -t aictig-deploy "$NOTIFY missing; alert not sent: $1"
  fi
}

fail() {
  echo "DEPLOY FAILED: $1"
  notify "aictig.org deploy FAILED" "${1}

Commit: ${NEW_SHA:-unknown}
Stage: ${STAGE:-setup}
Host: $(hostname)
Log: ${LOG}
${SITE_STATE:-The site is still serving the previous build.}"
  exit 1
}

# Root runs npm lifecycle scripts and the built app from APP_DIR. If any
# directory on the way to it can be renamed by a non-root user, that user can
# swap in their own package.json and get root on the next deploy. This is why
# the checkout lives in /opt and not in /home/aictig (owned by the vhost user).
# Re-checked on every run so the mistake cannot quietly return.
check_trust_path() {
  local p=$APP_DIR bad="" owner mode
  while :; do
    # A path that cannot be stat'ed is not a path that has been checked.
    if ! owner=$(stat -c %U "$p" 2>/dev/null); then
      bad="${bad}  ${p} cannot be read, so it cannot be trusted
"
      break
    fi
    mode=$(stat -c %A "$p" 2>/dev/null)
    if [ "$owner" != "root" ]; then
      bad="${bad}  ${p} is owned by ${owner}, not root
"
    elif [ "${mode:5:1}" = "w" ] || [ "${mode:8:1}" = "w" ]; then
      bad="${bad}  ${p} is group/other writable (${mode})
"
    fi
    [ "$p" = "/" ] && break
    p=$(dirname "$p")
  done
  [ -z "$bad" ] || fail "unsafe path to ${APP_DIR}: root would execute code from a directory a non-root user can replace.
${bad}"
}

# -------------------------------------------------------------------- locked
exec 9>"$LOCK" || fail "cannot open lock file $LOCK"
flock -n 9 || { echo "another deploy is running; exiting"; exit 0; }

cd "$APP_DIR" || fail "APP_DIR $APP_DIR does not exist"
[ -d .git ] || fail "$APP_DIR is not a git checkout"
check_trust_path

CUR_BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$CUR_BRANCH" = "$BRANCH" ] || fail "checkout is on branch '${CUR_BRANCH}', expected '${BRANCH}'"

OLD_SHA=$(git rev-parse --short HEAD)

# --------------------------------------------------------------------- fetch
STAGE=fetch
git -c core.hooksPath=/dev/null fetch --quiet --prune origin "$BRANCH" || fail "git fetch failed"
NEW_SHA=$(git rev-parse --short "origin/${BRANCH}")

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  echo "already at ${NEW_SHA}; rebuilding anyway (forced run)"
fi

# Tracked changes only. An untracked stray file cannot be destroyed by a
# fast-forward; an edit to a tracked file can, and that is what we refuse on.
DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  fail "working tree at $APP_DIR has local changes to tracked files, refusing to overwrite:
$(printf '%s' "$DIRTY" | head -10)
Resolve on the box, then re-run."
fi

UNTRACKED=$(git status --porcelain --untracked-files=all | grep '^??' || true)
if [ -n "$UNTRACKED" ]; then
  echo "note: untracked files present (ignored by this deploy):"
  printf '%s\n' "$UNTRACKED" | head -5
fi

git -c core.hooksPath=/dev/null merge --ff-only --quiet "origin/${BRANCH}" \
  || fail "cannot fast-forward to origin/${BRANCH} (diverged history)"
NEW_SHA=$(git rev-parse --short HEAD)
SUBJECT=$(git log -1 --pretty='%s' | cut -c1-120)
AUTHOR=$(git log -1 --pretty='%an')
echo "at ${NEW_SHA}: ${SUBJECT} (${AUTHOR})"

# ------------------------------------------------------------------- install
# Only reinstall when the lockfile actually moved - most pushes are content or
# code only, and npm ci is by far the slowest step.
STAGE=install
if [ "$OLD_SHA" != "$NEW_SHA" ] && ! git diff --quiet "$OLD_SHA" "$NEW_SHA" -- package-lock.json package.json; then
  echo "dependencies changed -> npm ci"
  npm ci --no-audit --no-fund || fail "npm ci failed"
else
  echo "dependencies unchanged -> skipping npm ci"
  [ -d node_modules ] || { echo "no node_modules -> npm ci"; npm ci --no-audit --no-fund || fail "npm ci failed"; }
fi

# --------------------------------------------------------------------- build
# `npm run build` is `tsc && vite build`; the extra args reach vite, so the
# output goes to dist.new while the live site keeps serving dist/.
STAGE=build
rm -rf "$APP_DIR/dist.new"          # half-written output of an earlier failed build
npm run build -- --outDir dist.new --emptyOutDir || fail "npm run build failed (typecheck or vite)"
[ -s dist.new/index.html ] || fail "build produced no dist.new/index.html"

# ---------------------------------------------------------------------- swap
# Two renames; the gap between them is microseconds. .dist.old is the previous
# build, kept for a by-hand rollback (see SERVER-RUNBOOK.md) - one generation.
STAGE=swap
SITE_STATE="The new build was ready but the swap did not complete - CHECK THE SITE."
rm -rf "$APP_DIR/.dist.old"
if [ -d dist ]; then mv dist .dist.old || fail "could not move dist aside"; fi
mv dist.new dist || fail "could not move dist.new into place"

# ------------------------------------------------------------------- restart
# Restart picks up server.cjs and dependency changes. Named, never `all`:
# other apps on this box share the same PM2.
STAGE=restart
SITE_STATE="The site may be DOWN. Roll back by reverting the commit on the production branch."
pm2 restart "$PM2_NAME" >/dev/null 2>&1 || fail "pm2 restart $PM2_NAME failed"
pm2 save --force >/dev/null 2>&1 || echo "warning: pm2 save failed (process list not persisted)"

# -------------------------------------------------------------- health check
STAGE=health
ok=0
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL")
  if [ "$code" = "200" ]; then ok=1; echo "health: 200 after ${i} attempt(s)"; break; fi
  sleep 3
done
[ "$ok" = "1" ] || fail "app did not return 200 on ${HEALTH_URL} within 60s
$(pm2 logs "$PM2_NAME" --lines 15 --nostream --err 2>/dev/null | tail -15)"

# index.html answering is not enough: the JS bundle it points at must load.
ASSET=$(curl -s --max-time 10 "$HEALTH_URL" | grep -o '/assets/[^"]*\.js' | head -1)
if [ -n "$ASSET" ]; then
  acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL%/}${ASSET}")
  echo "asset: ${ASSET} -> ${acode}"
  [ "$acode" = "200" ] || fail "index.html loads but its bundle ${ASSET} returns ${acode}"
else
  fail "served index.html references no /assets/*.js bundle"
fi

# Verified from outside too - an app that answers on localhost while the world
# sees 522 is exactly the trap in the runbook. Reported, not fatal here: the
# GitHub Action checks the public URL independently.
PUB=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$PUBLIC_URL")
echo "public: ${PUBLIC_URL} -> ${PUB}"

echo "deploy OK ${OLD_SHA} -> ${NEW_SHA} at $(date -Is)"
notify "aictig.org deployed" "${OLD_SHA} -> ${NEW_SHA}
${SUBJECT}
by ${AUTHOR}

Public check: HTTP ${PUB}"
exit 0
