#!/usr/bin/env bash
# One command to put the memorial backend live. Run it from this api/ folder:
#
#   bash deploy.sh
#
# Safe to run as often as you like. schema.sql only ever ADDS missing tables
# (every statement is CREATE ... IF NOT EXISTS), so re-running it never touches
# a photo or a caption that is already there.
set -euo pipefail

echo "==> Applying the database schema (adds anything missing, changes nothing existing)"
npx --yes wrangler d1 execute memorial --remote --file=schema.sql

echo "==> Deploying the worker"
npx --yes wrangler deploy

cat <<'NOTE'

==> Done.

If you have not set the caretaker password yet, do it now — /admin will not
let anyone in until you do:

    npx wrangler secret put ADMIN_PASSWORD

NOTE
