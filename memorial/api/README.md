# The backend

One Cloudflare Worker. It takes photo and recording uploads, stores the files
in R2 and the captions in D1, serves the wall and the recordings to the page,
and hosts the password-protected `/admin` panel.

This is a **separate** worker, database and bucket from anything else in the
account. It shares nothing with any other site you run — separate names,
separate storage — so deploying it cannot affect them.

Everything fits in Cloudflare's free tier: 100,000 requests/day, 5GB database,
10GB photo storage. No card required, nothing sleeps.

---

## Setting it up

You need [Node.js](https://nodejs.org) and your Cloudflare account. All the
commands below run from **this `api/` folder**. Budget about fifteen minutes.

### 1. Let wrangler into your account

```
npx wrangler login
```

Opens a browser and asks you to approve. If you have more than one Cloudflare
account it will ask which — pick the one you already use.

### 2. Make the database

```
npx wrangler d1 create memorial
```

It prints a block containing a `database_id`. Copy that id into
`wrangler.toml`, replacing `PASTE_YOUR_DATABASE_ID_HERE`.

### 3. Make the photo bucket

```
npx wrangler r2 bucket create memorial-photos
```

If this errors, R2 needs enabling once: Cloudflare dashboard → **R2** → accept
the free plan. It is $0 within the limits above.

### 4. Choose the caretaker password

```
npx wrangler secret put ADMIN_PASSWORD
```

It prompts for a value. This is what you'll type at `/admin` to hide or delete
photos. Pick something long. It is stored as a Cloudflare secret, never written
into this repo — which matters, because this repo is public.

### 5. Deploy

```
bash deploy.sh
```

That creates the tables and deploys the worker. It prints your worker address,
something like `https://memorial-api.yourname.workers.dev`.

Try `https://memorial-api.yourname.workers.dev/admin` now — your password
should get you in, to an empty panel.

### 6. Put the page live

From the repo root (one folder up):

```
cd ..
bash deploy-site.sh
```

The first run creates a Cloudflare Pages project called `mahoganyjr`; it
prints the address, `https://mahoganyjr.pages.dev`. The page is live there
straight away, but it can't talk to the backend yet — that happens when both
share the domain in the next section. To try it before then, put the worker's
address into `js/config.js` temporarily:

```js
window.MEMORIAL_API = "https://memorial-api.yourname.workers.dev";
```

and run `bash deploy-site.sh` again. Set it back to `""` once the domain is on.

### 7. Write his name

Open `/admin` → **Page text** → fill in the name, the dates, and whatever you
want people to read first. Save. That is the only place the name lives; you
never edit code to change it.

**At this point the site works.** Everything below is for moving it onto your
own domain.

---

## Putting it on mahoganyjr.com — the DNS

There is no list of records to type in. Cloudflare writes them itself; your
job is two clicks in the right place. In order:

**1. Get the domain into your Cloudflare account** (skip this if you bought it
through Cloudflare — it's already there).

Dashboard → **Add a site** → `mahoganyjr.com` → Free plan. It shows you two
nameservers, unique to your account, like `xxxx.ns.cloudflare.com`. Go to
wherever you bought the domain, find its nameserver setting, and replace what's
there with those two. Cloudflare emails you when it's active — anywhere from a
few minutes to a day.

Nothing else works until this step is done, so if something below doesn't
take, this is the first thing to check.

**2. Attach the domain to the page.** Dashboard → **Workers & Pages** →
**mahoganyjr** (the Pages project `deploy-site.sh` made) → **Custom domains**
→ **Set up a custom domain** → `mahoganyjr.com` → Activate. Then the same
again for `www.mahoganyjr.com`.

That's the whole DNS. Cloudflare creates the records for you; afterwards the
**DNS** tab of the zone shows exactly this, and if it doesn't, something above
didn't finish:

| Type | Name | Content | Proxy status |
|---|---|---|---|
| CNAME | `mahoganyjr.com` | `mahoganyjr.pages.dev` | Proxied (orange cloud) |
| CNAME | `www` | `mahoganyjr.pages.dev` | Proxied (orange cloud) |

Both must be **Proxied**. That is what lets the worker's routes in the next
step intercept `/api/*`, `/img/*` and `/admin` on the same hostname while
everything else goes to the page. HTTPS is automatic.

**3. Attach the backend.** The `routes` block in `wrangler.toml` is already
written for `mahoganyjr.com`. If you ran `bash deploy.sh` before the domain
was in your account, run it once more now so the routes take. Do **not**
widen the routes to `mahoganyjr.com/*` — that would put the worker in front of
the whole site, including the homepage it doesn't serve.

**4. Check it.** All three should work:

- `https://mahoganyjr.com` — the page, with his name on it
- `https://mahoganyjr.com/admin` — the caretaker sign-in
- `https://mahoganyjr.com/api/memorial` — a block of JSON

**5. Only once mahoganyjr.com is actually loading the site**, you can narrow
who may upload:

```toml
ALLOWED_ORIGINS = "https://mahoganyjr.com,https://www.mahoganyjr.com"
```

It ships empty on purpose. List every address the site answers on — anything
left out has its uploads refused by the browser, with nothing shown to the
person uploading to explain why. Leaving it empty is not a security hole in any
way that matters here: the wall is public and uploads are open by design.

Then `bash deploy.sh` again for it to take.

`js/config.js` should be `""`, which means "call `/api/...` on whatever address
the page is being served from". Once the domain is on, that is mahoganyjr.com
and the page and backend are one site.

The `workers.dev` address keeps working alongside the domain — deliberately, so
there's still a way into `/admin` if DNS ever has a bad day.

---

## What guards the uploads

Anyone with the link can upload, with no account. That is the point, so nobody
is stopped at a login box at a bad moment. What keeps it from being abused:

- **Real files only.** The file's own magic numbers are checked — a PNG's
  signature, an MP3's frame sync, a WAV's RIFF/WAVE header — not the content
  type the uploader claims. A renamed script, an HTML file or an executable
  is refused whatever it calls itself.
- **No SVG.** An SVG can carry JavaScript, and `/img/` is the same origin as
  `/admin` — allowing one would hand any uploader a way into your session.
- **A pixel ceiling as well as a byte ceiling.** A tiny file can decode into a
  gigapixel image that crashes the viewer's browser; dimensions are read from
  the file header and refused above 40MP.
- **Photos are served inert** — `nosniff`, and a content policy that lets them
  do nothing but be pictures.
- **A per-IP budget** of 30 uploads a minute: enough for someone emptying a
  camera roll, not enough to fill the bucket. Photos are capped at 12MB and
  recordings at 60MB — room for a real WAV of a real song.
- **A honeypot field** that only automated form-fillers ever complete.
- **Brute-force limits on the admin password** — ten wrong guesses per IP per
  ten minutes.

None of that judges *content*. A photo nobody wants on a memorial is a human
problem, and the answer is `/admin`: **Hide** takes it off the wall and keeps
the file; **Delete** removes both, permanently.

## Changing things

- The name, dates, intro text → `/admin`, not code.
- The page's look → `css/style.css` in the repo root.
- The API or the admin panel → `src/`, then `bash deploy.sh`.
- Locally → `npx wrangler dev`, with the schema loaded via
  `npx wrangler d1 execute memorial --local --file=schema.sql` and a test
  password in `.dev.vars` (`ADMIN_PASSWORD=whatever`).

## Backing up

```
bash backup.sh https://your-site-address.com
```

Downloads every photo and all the captions into a dated folder. Do it once or
twice a year and keep the result somewhere that isn't Cloudflare — for some of
these photos, this may be the only copy left.
