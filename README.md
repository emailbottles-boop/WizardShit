# Wizard Shit — wizardshit.store

The site for the Wizard Shit animated series, by Madam Studio.

- The pages, images and scripts in this folder are served by GitHub Pages.
- Everything dynamic — the merch shop and cart, donations, the crew pages,
  the mailing list, the message bubble, and the owners' console at
  `/login` — runs on one Cloudflare Worker in [`api/`](api/). Its README has
  the setup and every upgrade note.

Merch is printed to order by Printful and paid for through Stripe on the site
itself. Orders go to print only once the money has reached the bank; see
"the shop" in `api/README.md`.

## Checks and safety rails

- `cd api && npx vitest run` — the Worker's money-path tests.
- `npm test` at the repo root — the storefront browser batteries (Playwright;
  `npx playwright install chromium` once, or `CHROME=/path/to/chromium npm test`).
- Every pull request and every push to `main` runs both in GitHub Actions
  (`.github/workflows/ci.yml`). Turn on branch protection for `main` (Settings →
  Branches → "Require status checks to pass": Worker tests, Storefront browser
  batteries) so nothing unreviewed can land.
- The Worker deploys from `main` by `.github/workflows/deploy-worker.yml` once
  the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets are
  set; until then `cd api && npx wrangler deploy` by hand. Roll back with
  `npx wrangler rollback`.
- `CLAUDE.md` holds the rules any Claude Code session must follow here, and
  `.claude/settings.json` denies deploys, secrets and pushes to `main` from it.
