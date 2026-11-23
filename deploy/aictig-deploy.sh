#!/usr/bin/env bash
#
# aictig.org production deploy. Invoked by GitHub Actions over SSH as a
# FORCED COMMAND, so the CI key can only ever trigger this - never get a shell.
#
# Install (as root, by hand - deliberately NOT self-updating, because the file
# GitHub can trigger must not be rewritable by a push):
#   install -m 700 -o root -g root /opt/aictig-website/deploy/aictig-deploy.sh /usr/local/sbin/aictig-deploy.sh
# Copy it from a LINUX checkout, or strip CRLF first - bash dies on a CR.
#
# Run by hand:  /usr/local/sbin/aictig-deploy.sh            (restart only if needed)
#               /usr/local/sbin/aictig-deploy.sh --restart  (always restart)
#
# PRIVILEGE SEPARATION - root never executes code from the repository:
#   aictig-build  owns /opt/aictig-website; runs git, npm ci and the build.
#                 Anything a push can do (npm lifecycle scripts, vite plugins,
#                 git config) happens as this user.
#   aictig-run    runs the site (PM2 drops to it before node starts). It can
#                 read the checkout but not write it, so a compromised site
#                 cannot plant code for the next start.
#   root          only: this script, `pm2 restart`, health checks. PM2's own
#                 definition is the root-owned JSON /etc/aictig-website/pm2.json,
#                 parsed rather than executed.
#
# ZERO DOWNTIME for normal deploys: the build goes to dist.new and is swapped
# in with two renames; Express reads dist/ from disk per request, so new files
# are live without a restart. The process is restarted ONLY when server.cjs or
# dependencies changed (sub-second; Apache has retry=0 so it cannot amplify it).
#
# Also: `git merge --ff-only` (refuses to overwrite edits made on the box),
# health check of the served page AND its bundle, Telegram either way, and a
# non-zero exit so the GitHub Action goes red.

set -uo pipefail
umask 022

APP_DIR=/opt/aictig-website
PM2_NAME=aictig-website
PM2_CONFIG=/etc/aictig-website/pm2.json
BUILD_USER=aictig-build
BUILD_HOME=/var/lib/aictig-build
RUN_USER=aictig-run
BRANCH=production
HEALTH_URL=http://127.0.0.1:3001/
PUBLIC_URL=https://aictig.org/
LOCK=/var/lock/aictig-deploy.lock
LOG=/var/log/aictig-deploy.log
NOTIFY=/usr/local/sbin/toko-telegram-notify
SELF=/usr/local/sbin/aictig-deploy.sh
# A change to any of these needs the node process restarted.
RESTART_PATHS=(server.cjs package.json package-lock.json)

if [ "$(id -u)" != "0" ]; then
  echo "must run as root" >&2
  exit 1
fi

FORCE_RESTART=0
case "${1:-}" in
  "") ;;
  --restart) FORCE_RESTART=1 ;;
  *) echo "usage: $0 [--restart]" >&2; exit 2 ;;
esac

exec > >(tee -a "$LOG") 2>&1
echo "=============================================================="
# GitHub Actions and a person both arrive over SSH; only the address differs.
if [ -n "${SSH_CONNECTION:-}" ]; then
  TRIGGERED_BY="ssh from ${SSH_CONNECTION%% *}"
else
  TRIGGERED_BY="local shell"
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

# ---------------------------------------------------------------- run as user
# Everything that touches repository content runs as BUILD_USER, with a clean
# environment, no stdin, no controlling terminal (setsid: so it cannot push
# keystrokes into root's terminal on a hand run) and without our lock fd.
as_build() {
  setsid -w runuser -u "$BUILD_USER" -- \
    env -i HOME="$BUILD_HOME" PATH=/usr/bin:/bin LANG=C.UTF-8 \
        npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false \
    "$@" </dev/null 9>&-
}
git_b() { as_build git -C "$APP_DIR" -c core.hooksPath=/dev/null "$@"; }

# ------------------------------------------------------------- trust checks
# Root trusts exactly: this script, the PM2 JSON, and the directories leading
# to them and to APP_DIR. Each must be root-owned and not group/other writable,
# or a non-root user could swap what root runs.
check_root_path() {
  local p=$1 bad="" owner mode
  while :; do
    if ! owner=$(stat -c %U "$p" 2>/dev/null); then
      bad="${bad}  ${p} cannot be read, so it cannot be trusted
"
      break
    fi
    mode=$(stat -c %A "$p")
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
  printf '%s' "$bad"
}

check_trust() {
  local bad="" p top
  for p in "$SELF" "$PM2_CONFIG" "$(dirname "$APP_DIR")"; do
    bad="${bad}$(check_root_path "$p")"
  done
  # The checkout: owned by BUILD_USER, group RUN_USER (read-only access), 750.
  top=$(stat -c '%U:%G %a' "$APP_DIR" 2>/dev/null)
  [ "$top" = "${BUILD_USER}:${RUN_USER} 750" ] \
    || bad="${bad}  ${APP_DIR} is '${top}', expected '${BUILD_USER}:${RUN_USER} 750'
"
  # Nothing inside may belong to anyone else, be world-writable, or be
  # writable by the runtime group (symlinks excluded: their mode is meaningless).
  # A find that errors (e.g. unknown user/group) prints nothing - that must
  # not read as "all clear".
  p=$(find "$APP_DIR" \( ! -user "$BUILD_USER" -o \( ! -type l \( -perm -0002 -o \( -group "$RUN_USER" -perm -0020 \) \) \) \) -print -quit) \
    || bad="${bad}  find over ${APP_DIR} failed, so its permissions are unverified
"
  [ -z "$p" ] || bad="${bad}  ${p} is not owned by ${BUILD_USER} or is writable by others/the runtime
"
  [ -z "$bad" ] || fail "trust check failed - refusing to deploy:
${bad}"
}

# The site must be running as RUN_USER, with no root uid/gid anywhere
# (real/effective/saved/fs) and no supplementary groups left over from root.
check_runtime_identity() {
  local pid uid_want gid_want uids gids groups
  pid=$(pm2 pid "$PM2_NAME" 2>/dev/null | tail -1)
  [ -n "$pid" ] && [ "$pid" != "0" ] && [ -r "/proc/$pid/status" ] \
    || fail "cannot find a running process for pm2 app ${PM2_NAME}"
  uid_want=$(id -u "$RUN_USER"); gid_want=$(id -g "$RUN_USER")
  uids=$(awk '/^Uid:/{print $2,$3,$4,$5}' "/proc/$pid/status")
  gids=$(awk '/^Gid:/{print $2,$3,$4,$5}' "/proc/$pid/status")
  groups=$(awk '/^Groups:/{$1=""; print}' "/proc/$pid/status" | xargs)
  if [ "$uids" != "$uid_want $uid_want $uid_want $uid_want" ] \
     || [ "$gids" != "$gid_want $gid_want $gid_want $gid_want" ] \
     || { [ -n "$groups" ] && [ "$groups" != "$gid_want" ]; }; then
    fail "site process ${pid} is NOT confined to ${RUN_USER} (Uid: ${uids}; Gid: ${gids}; Groups: ${groups:-none}).
Fix: pm2 delete ${PM2_NAME} && pm2 start ${PM2_CONFIG} && pm2 save"
  fi
  echo "runtime: pid ${pid} runs as ${RUN_USER} (uid ${uid_want}, no extra groups)"
}

# -------------------------------------------------------------------- locked
exec 9>"$LOCK" || fail "cannot open lock file $LOCK"
# Wait for a running deploy rather than skipping: a skipped deploy that reports
# success would be a silent failure.
flock -w 900 9 || fail "another deploy held the lock for 15 minutes"

STAGE=checks
cd "$APP_DIR" || fail "APP_DIR $APP_DIR does not exist"
[ -d .git ] || fail "$APP_DIR is not a git checkout"
check_trust

CUR_BRANCH=$(git_b rev-parse --abbrev-ref HEAD) || fail "git rev-parse failed"
[ "$CUR_BRANCH" = "$BRANCH" ] || fail "checkout is on branch '${CUR_BRANCH}', expected '${BRANCH}'"
OLD_SHA=$(git_b rev-parse --short HEAD) || fail "git rev-parse failed"

# --------------------------------------------------------------------- fetch
STAGE=fetch
git_b fetch --quiet --prune origin "$BRANCH" || fail "git fetch failed"
NEW_SHA=$(git_b rev-parse --short "origin/${BRANCH}") || fail "git rev-parse failed"

if [ "$OLD_SHA" = "$NEW_SHA" ]; then
  echo "already at ${NEW_SHA}; rebuilding anyway (forced run)"
fi

# Tracked changes only. An untracked stray file cannot be destroyed by a
# fast-forward; an edit to a tracked file can, and that is what we refuse on.
DIRTY=$(git_b status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  fail "working tree at $APP_DIR has local changes to tracked files, refusing to overwrite:
$(printf '%s' "$DIRTY" | head -10)
Resolve on the box, then re-run."
fi

UNTRACKED=$(git_b status --porcelain --untracked-files=all | grep '^??' || true)
if [ -n "$UNTRACKED" ]; then
  echo "note: untracked files present (ignored by this deploy):"
  printf '%s\n' "$UNTRACKED" | head -5
fi

git_b merge --ff-only --quiet "origin/${BRANCH}" \
  || fail "cannot fast-forward to origin/${BRANCH} (diverged history)"
NEW_SHA=$(git_b rev-parse --short HEAD)
SUBJECT=$(git_b log -1 --pretty='%s' | cut -c1-120)
AUTHOR=$(git_b log -1 --pretty='%an')
echo "at ${NEW_SHA}: ${SUBJECT} (${AUTHOR})"

# What does this change need?
RESTART=$FORCE_RESTART
DEPS_CHANGED=0
if [ "$OLD_SHA" != "$NEW_SHA" ]; then
  git_b diff --quiet "$OLD_SHA" "$NEW_SHA" -- package.json package-lock.json || DEPS_CHANGED=1
  git_b diff --quiet "$OLD_SHA" "$NEW_SHA" -- "${RESTART_PATHS[@]}" || RESTART=1
fi

# Root-owned copies are never updated by a push. Say so loudly when the repo
# version has moved on, so the by-hand install is not forgotten.
# Repo files are read as BUILD_USER (root does not follow links planted in a
# tree it does not own); root hashes its own copies.
repo_sha() { as_build sh -c 'sha256sum < "$1"' sh "$APP_DIR/$1" | cut -d' ' -f1; }
NOTES=""
[ "$(repo_sha deploy/pm2.json)" = "$(sha256sum < "$PM2_CONFIG" | cut -d' ' -f1)" ] \
  || NOTES="${NOTES}NOTE: deploy/pm2.json differs from ${PM2_CONFIG} - review and install by hand (DEPLOYMENT.md s.9).
"
[ "$(repo_sha deploy/aictig-deploy.sh)" = "$(sha256sum < "$SELF" | cut -d' ' -f1)" ] \
  || NOTES="${NOTES}NOTE: deploy/aictig-deploy.sh differs from ${SELF} - review and install by hand.
"
[ -z "$NOTES" ] || printf '%s' "$NOTES"

# ------------------------------------------------------------------- install
# Only reinstall when the lockfile actually moved - most pushes are content or
# code only, and npm ci is by far the slowest step.
STAGE=install
if [ "$DEPS_CHANGED" = "1" ]; then
  echo "dependencies changed -> npm ci (as ${BUILD_USER})"
  as_build sh -c 'cd "$1" && npm ci' sh "$APP_DIR" || fail "npm ci failed"
elif [ ! -d node_modules ]; then
  echo "no node_modules -> npm ci (as ${BUILD_USER})"
  as_build sh -c 'cd "$1" && npm ci' sh "$APP_DIR" || fail "npm ci failed"
else
  echo "dependencies unchanged -> skipping npm ci"
fi

# --------------------------------------------------------------------- build
# `npm run build` is `tsc && vite build`; the extra args reach vite, so the
# output goes to dist.new while the live site keeps serving dist/.
STAGE=build
as_build sh -c 'cd "$1" && rm -rf dist.new && npm run build -- --outDir dist.new --emptyOutDir' sh "$APP_DIR" \
  || fail "npm run build failed (typecheck or vite)"
NEW_BUNDLE=$(as_build sh -c 'grep -o "/assets/index-[^\"]*\.js" "$1/dist.new/index.html"' sh "$APP_DIR" | head -1)
[ -n "$NEW_BUNDLE" ] || fail "dist.new/index.html references no /assets/index-*.js bundle"

# ---------------------------------------------------------------------- swap
# Two renames; the gap between them is microseconds. .dist.old is the previous
# build, kept for a by-hand rollback - one generation.
STAGE=swap
SITE_STATE="The new build was ready but the swap did not complete - CHECK THE SITE."
as_build sh -c 'cd "$1" && rm -rf .dist.old && { [ ! -d dist ] || mv dist .dist.old; } && mv dist.new dist' sh "$APP_DIR" \
  || fail "could not swap dist.new into place"
echo "swapped in new build (${NEW_BUNDLE})"

# ------------------------------------------------------------------- restart
STAGE=restart
if [ "$RESTART" = "1" ]; then
  # Named, never `all`: other apps on this box share the same PM2.
  SITE_STATE="The site may be DOWN. Roll back by reverting the commit on the production branch."
  echo "server.cjs or dependencies changed (or --restart) -> pm2 restart ${PM2_NAME}"
  pm2 restart "$PM2_NAME" >/dev/null 2>&1 || fail "pm2 restart $PM2_NAME failed"
  pm2 save --force >/dev/null 2>&1 || echo "warning: pm2 save failed (process list not persisted)"
else
  echo "server.cjs and dependencies unchanged -> no restart needed (zero downtime)"
fi

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

check_runtime_identity

# The page being served must be the NEW build, and its bundle must load.
SERVED_BUNDLE=$(curl -s --max-time 10 "$HEALTH_URL" | grep -o '/assets/index-[^"]*\.js' | head -1)
[ "$SERVED_BUNDLE" = "$NEW_BUNDLE" ] \
  || fail "site serves bundle '${SERVED_BUNDLE}', expected the new '${NEW_BUNDLE}'"
acode=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL%/}${SERVED_BUNDLE}")
echo "bundle: ${SERVED_BUNDLE} -> ${acode}"
[ "$acode" = "200" ] || fail "index.html loads but its bundle ${SERVED_BUNDLE} returns ${acode}"

# Verified from outside too - an app that answers on localhost while the world
# sees 522 is exactly the trap in the runbook. Reported, not fatal here: the
# GitHub Action checks the public URL independently.
PUB=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$PUBLIC_URL")
echo "public: ${PUBLIC_URL} -> ${PUB}"

if [ "$RESTART" = "1" ]; then HOW="restarted"; else HOW="no restart (zero downtime)"; fi
echo "deploy OK ${OLD_SHA} -> ${NEW_SHA}, ${HOW}, at $(date -Is)"
notify "aictig.org deployed" "${OLD_SHA} -> ${NEW_SHA}
${SUBJECT}
by ${AUTHOR}

${HOW}
Public check: HTTP ${PUB}
${NOTES}"
exit 0
