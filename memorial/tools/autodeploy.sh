#!/usr/bin/env bash
# Keep the live site matching the branch, with no one at the keyboard.
#
# Meant to run every few minutes from a scheduled task. It asks GitHub whether
# the branch moved; if not, it exits at once and costs nothing. If it did, it
# pulls, deploys (bash api/deploy.sh — which also applies any new database
# columns and attaches the domain) and runs the seed, which only ever sends
# photos it has not sent before.
#
# Nothing here is interactive: wrangler is already signed in on this
# computer, and when it runs without a terminal it answers its own prompts.
set -euo pipefail
cd "$(dirname "$0")/.."     # the memorial folder
LOG="autodeploy.log"
git fetch -q origin || { echo "$(date -u +%FT%TZ) fetch failed" >> "$LOG"; exit 0; }
LOCAL=$(git rev-parse HEAD); REMOTE=$(git rev-parse '@{u}')
[ "$LOCAL" = "$REMOTE" ] && exit 0
{
  echo "==== $(date -u +%FT%TZ) branch moved $LOCAL -> $REMOTE"
  git checkout -q -- . && git pull -q
  ( cd api && bash deploy.sh )
  bash seed/seed.sh || true
  echo "==== $(date -u +%FT%TZ) done"
} >> "$LOG" 2>&1
