# Working on wizardshit.store

This repo is a live store. Real cards are charged and real garments are
printed. Read this before changing anything.

## Layout
- `index.html`, `js/shop.js`, `js/*.js` — the storefront, served by GitHub Pages
  from `main`. `js/shop.js` is cache-busted: **bump `?v=N` in index.html on every
  change to it**, or customers keep the old file.
- `api/` — the Cloudflare Worker (`src/shop.js` money path, `src/index.js`
  router + owner console API, `src/admin.js` console HTML, `schema.sql` D1).
- `test/browser/` — Playwright batteries that drive the real storefront against
  a stubbed API. `api/test/` — the Worker's vitest suite.

## Rules for any Claude Code session in this repo
1. **Never deploy, never touch secrets, never push to `main`.** `.claude/settings.json`
   denies `wrangler deploy`, `wrangler secret`, remote `d1 execute`, force pushes
   and `gh pr merge`. Do not work around it. The Worker deploys from `main`
   through `.github/workflows/deploy-worker.yml`; the owner merges.
2. Work on a branch, open a pull request, and let CI (`.github/workflows/ci.yml`)
   pass. Both halves must be green: `cd api && npx vitest run` and `npm test`
   at the repo root (browser batteries; set `CHROME=/path/to/chromium` if
   Playwright's own is not installed).
3. One concern per PR. A UI tidy and a money-path change never travel together.
4. Anything touching prices, totals, currencies, shipping rates, the donation,
   Stripe sessions, the webhook, or payout confirmation needs a test that fails
   on the old code before the change is proposed.
5. Keep what already works. Removing a button, a selector, a screen, or an API
   field is a change to the site's contract: search `test/browser/` and
   `js/shop.js` for every use first, and update the batteries in the same PR.
6. Do not report done until both test halves pass on the exact commit proposed.
7. Never print a secret's value: not from env, not from wrangler, not from a
   Stripe or Printful error. The console's CHECK KEYS shows shape only.

## Money-path invariants (must hold after every change)
- The customer is charged exactly the total shown beside PAY, or the order is
  refused (409) and re-quoted. Prices come from Printful at order time, never
  from the page.
- Nothing is confirmed at Printful until Stripe has the money; with
  CONFIRM_ON_PAYOUT the draft waits for `payout.paid`. Refunded, partially
  refunded and disputed charges are never confirmed. Test keys never confirm.
- A failed payment leaves an inert draft and a `payment_failed` row, never a
  charge with no order.
- Integer minor units everywhere; zero-decimal currencies are whole units.

## Rollback
- Worker: `cd api && npx wrangler rollback` (owner only, real terminal) rolls
  back to the previous deployed version in seconds. `npx wrangler deployments
  list` shows them.
- Storefront: `git revert <sha>` on `main`; GitHub Pages redeploys in about a
  minute. Bump `?v=N` if `js/shop.js` was involved.
