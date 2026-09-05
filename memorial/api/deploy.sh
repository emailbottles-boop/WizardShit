#!/usr/bin/env bash
# One command to put the whole site live — page, backend, domain. Run it from
# this api/ folder:
#
#   bash deploy.sh
#
# Safe to run as often as you like. schema.sql only ever ADDS missing tables
# (every statement is CREATE ... IF NOT EXISTS), so re-running it never touches
# a photo or a caption that is already there.
set -euo pipefail

echo "==> Applying the database schema (adds anything missing, changes nothing existing)"
npx --yes wrangler d1 execute memorial --remote --file=schema.sql

# A database made before recordings existed is missing three columns. Each
# ALTER is run on its own so that "duplicate column name" — the normal answer
# from a database that already has them — stops only that one line.
echo "==> Making sure the recordings columns exist"
for col in "kind TEXT NOT NULL DEFAULT 'photo'" "mime TEXT NOT NULL DEFAULT ''" "duration REAL NOT NULL DEFAULT 0" "photographer TEXT NOT NULL DEFAULT ''"; do
  npx --yes wrangler d1 execute memorial --remote --command "ALTER TABLE photos ADD COLUMN $col" >/dev/null 2>&1 || true
done

echo "==> Deploying the worker"
npx --yes wrangler deploy

cat <<'NOTE'

==> Done.

If you have not set the caretaker password yet, do it now — /admin will not
let anyone in until you do:

    npx wrangler secret put ADMIN_PASSWORD

NOTE
