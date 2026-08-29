# Wizard Shit Backend

A single Cloudflare Worker that powers the owner admin panel and serves the
site's editable content (merch, credits, donators). The public site on GitHub
Pages stays exactly where it is — it just fetches content from this API, and
falls back to the HTML baked into the page if the API is unreachable.

Everything here runs inside Cloudflare's free tier: 100k requests/day
(Workers), 5GB database (D1), 10GB image storage (R2). No sleeping, no
inactivity pausing.

```
Browser ──▶ wizardshit.store (GitHub Pages, static)
                 │  GET /api/content
                 ▼
            this Worker ──▶ D1 (content)  +  R2 (uploaded images)
                 ▲
Owners ────▶ /admin  (login required)
```

## One-time setup (about 15 minutes)

You need [Node.js](https://nodejs.org) installed and a free
[Cloudflare account](https://dash.cloudflare.com/sign-up).

All commands run from this `api/` folder.

**1. Log wrangler into your Cloudflare account** (opens a browser):

```
npx wrangler login
```

**2. Create the database** and copy its id into `wrangler.toml`:

```
npx wrangler d1 create wizardshit
```

The command prints a `database_id` — paste it into `wrangler.toml` where it
says `REPLACE_WITH_YOUR_DATABASE_ID`.

**3. Load the schema and the current site content:**

```
npx wrangler d1 execute wizardshit --remote --file=schema.sql
npx wrangler d1 execute wizardshit --remote --file=seed.sql
```

(`seed.sql` contains today's live merch, credits, and donators, so the admin
panel starts out matching the site. Run it once — running it again resets the
content back to this snapshot.)

**4. Create the image bucket:**

```
npx wrangler r2 bucket create wizardshit-images
```

If this errors, enable R2 once in the Cloudflare dashboard (R2 → purchase the
free plan — it's $0 within the limits above).

**5. Choose how owners log in.** Two options:

- **Option A — password (simplest).** Run:

  ```
  npx wrangler secret put ADMIN_PASSWORD
  ```

  and type a strong shared password. Owners enter it on the /admin login
  screen. Skip to step 6.

- **Option B — Cloudflare Access (nicer: per-person email login).** In the
  Cloudflare dashboard: **Zero Trust → Access → Applications → Add an
  application → Self-hosted.** Set the application domain to your worker's
  hostname (shown after step 6, e.g. `wizardshit-api.YOU.workers.dev`) with
  path `admin` — add a second one for `api/admin` — and create an Allow
  policy listing the owners' email addresses. Then copy your **team domain**
  (e.g. `yourteam.cloudflareaccess.com`) and the application's **Audience
  (AUD) tag** into the two `ACCESS_*` vars in `wrangler.toml` and deploy
  again. Owners then log in with a one-time code emailed to them; no shared
  password exists. (When Access is configured it takes over completely and
  the password, if any, stops being accepted.)

**6. Deploy:**

```
npx wrangler deploy
```

This prints your worker URL, e.g. `https://wizardshit-api.YOU.workers.dev`.

**7. Point the site at it.** In the repo root, edit `js/config.js`:

```js
window.WIZ_API_BASE = "https://wizardshit-api.YOU.workers.dev";
```

Commit and push that one line (this is the only git step, and it happens
once). From then on, owners change the site from the admin panel — no git,
no redeploys, changes are live the moment they hit SAVE.

## Daily use

Owners visit `https://wizardshit-api.YOU.workers.dev/admin`, log in, and get
three editors — MERCH, CREDITS, DONATORS — with add / delete / reorder /
hide, image uploads, and a SAVE & PUBLISH button. Hidden items stay in the
database but disappear from the site, which is handy for seasonal merch.

Merch items link out to `wizard.printful.me` product pages: the panel
controls what appears on wizardshit.store, while the products themselves are
managed in Printful's own dashboard as always.

## Changing things later

- Edit content → admin panel, not this folder.
- Edit the panel or API → change `src/`, run `npx wrangler deploy`.
- Local development → `npx wrangler dev` (uses a local database; load
  `schema.sql`/`seed.sql` with the same commands as step 3 but `--local`,
  and put a test password in `.dev.vars`: `ADMIN_PASSWORD=whatever`).

## Upgrade: messages inbox, orders, Printful import (2026-08)

One-time steps when deploying this upgrade:

1. Add the messages table to the live database:
   `npx wrangler d1 execute wizardshit --remote --file=upgrade-messages.sql`
2. (Optional, enables ORDERS + product import) Connect Printful: create a
   token at https://developers.printful.com for the wizard store, then
   `npx wrangler secret put PRINTFUL_TOKEN`
3. Redeploy: `npx wrangler deploy`

The site's floating message bubble goes live when GitHub Pages picks up the
merge — no extra steps. (Formspree kept handling the email-signup box at the
time; see the email-signups upgrade below, which moved that here too.)

## Upgrade: Google sign-in + analytics (2026-08)

1. Add the analytics table to the live database:
   `npx wrangler d1 execute wizardshit --remote --file=upgrade-analytics.sql`
2. (Optional — enables "Sign in with Google" on the login page) Create an
   OAuth Client ID at https://console.cloud.google.com/apis/credentials:
   New project → OAuth consent screen (External, just the app name + your
   email, no scopes) → Credentials → Create credentials → OAuth client ID →
   Web application → add BOTH Authorized JavaScript origins:
   `https://wizardshit.store` and
   `https://wizardshit-api.wizardshit-api.workers.dev`.
   Paste the Client ID into `GOOGLE_CLIENT_ID` in wrangler.toml, and store
   the allowed founder emails as a secret (kept out of the public repo):
   `npx wrangler secret put FOUNDER_EMAILS` — comma-separated list.
3. Redeploy: `npx wrangler deploy`

Founders on the list can then log in with one click if they're signed into
Google in their browser; the shared password keeps working alongside.
Google sessions last a week and are revoked by re-running the
FOUNDER_EMAILS secret without that email.

## Upgrade: email signups off Formspree (2026-08)

The EMAIL FOR UPDATES box now posts to this worker instead of Formspree, so
the whole stack is Cloudflare and the list shows up in the Control Room's
SIGNUPS tab (with a "Copy all" button for pasting into BCC). One-time steps:

1. Add the signups table to the live database:
   `npx wrangler d1 execute wizardshit --remote --file=upgrade-signups.sql`
2. Redeploy: `npx wrangler deploy`

The form switches over when GitHub Pages picks up the merge. Existing
subscribers live in the Formspree dashboard — export them there (Forms →
submissions → export CSV) before closing the account, and keep the emails
somewhere safe; there is deliberately no bulk-import endpoint, but a one-off
`INSERT` via `npx wrangler d1 execute` gets them into the table.

## Upgrade: wizard ID claims (2026-08)

The madamstudio site has a crew page where an artist clicks their credit
identity card and enters their gmail. The claim lands in the Control Room's
WIZARD IDS tab as PENDING; a founder verifies or denies it there — the
founder's judgement IS the verification, nothing trusts the typed email.
Verified names get a badge on the crew page (via /api/claims-public, which
only ever exposes names, never emails). One-time steps:

1. Add the claims table to the live database:
   `npx wrangler d1 execute wizardshit --remote --file=upgrade-claims.sql`
2. Redeploy: `npx wrangler deploy`

Founder access to the tab is the Control Room's existing login (the shared
ADMIN_PASSWORD secret, or Google sign-in for emails in FOUNDER_EMAILS).
The password is a secret on purpose — it must never be written into this
repo or the madamstudio repo, since both are public.

## Upgrade: creator-page panels (2026-08)

Each creator on the madamstudio site gets a page of square clickable
panels (a picture, a title, an optional link), plus a shared
"recent projects" column that shows on every creator's page. Panels are
edited in the Control Room's new PANELS tab — set the panel's "creator"
to the credit card name it belongs to, or to the word `shared` to put it
in the projects column. Pictures upload to R2 through the same
drag-and-drop widget as merch images. One-time steps:

1. Add the panels table to the live database:
   `npx wrangler d1 execute wizardshit --remote --file=upgrade-panels.sql`
2. Redeploy: `npx wrangler deploy`

The public /api/content response gains a `panels` key (visible panels
only); until the table exists the worker serves an empty list rather
than erroring, so deploy order doesn't matter for the rest of the site.
