#!/usr/bin/env bash
# Put the page itself live on Cloudflare Pages. Run from the repo root:
#
#   bash deploy-site.sh
#
# Only the files a visitor's browser needs are uploaded — the page, its CSS
# and JavaScript, the 404 page. The api/ folder is the worker's source and is
# deployed separately by api/deploy.sh; publishing it as static files would be
# pointless at best.
#
# The first run creates the Pages project. Every run after that is an update,
# live within a minute. Safe to run as often as you like.
set -euo pipefail

PROJECT="mahoganyjr"

rm -rf dist && mkdir dist
cp index.html 404.html robots.txt dist/
cp -r css js dist/

# Creating a project that already exists just errors; that error is the normal
# answer on every run after the first, so it is ignored rather than tested for.
echo "==> Making sure the Pages project '$PROJECT' exists"
npx --yes wrangler pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true

echo "==> Uploading the site"
npx --yes wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true

cat <<NOTE

==> Done. The site is live at https://$PROJECT.pages.dev

To put it on mahoganyjr.com: Cloudflare dashboard -> Workers & Pages ->
$PROJECT -> Custom domains -> add mahoganyjr.com, then add www.mahoganyjr.com.
Cloudflare writes the DNS records itself. Full steps: api/README.md.
NOTE
