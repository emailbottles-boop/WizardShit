#!/usr/bin/env bash
# One-shot deploy for the Wizard Shit / Madam Studio backend.
# Run from the api/ folder:  bash deploy.sh
#
# schema.sql is additive (CREATE TABLE IF NOT EXISTS), so it safely creates any
# NEW tables — signups, panels, applications, uploads, accounts, payments,
# claims — on the already-live database without touching existing content.
# It deliberately does NOT run seed.sql, which would reset your live merch /
# credits / donators back to the old snapshot.
set -euo pipefail

echo "==> Applying schema (adds any missing tables; leaves existing data alone)"
npx --yes wrangler d1 execute wizardshit --remote --file=schema.sql

echo "==> Deploying the worker"
npx --yes wrangler deploy

echo "==> Done. Set any secrets you haven't yet (these prompt for a value):"
echo "    npx wrangler secret put ADMIN_PASSWORD     # founders' Control Room password"
echo "    npx wrangler secret put SESSION_SECRET     # optional; signs member logins"
echo "    npx wrangler secret put FOUNDER_EMAILS     # optional; Google founder sign-in"
echo "    npx wrangler secret put PRINTFUL_TOKEN     # optional; merch orders/import"
