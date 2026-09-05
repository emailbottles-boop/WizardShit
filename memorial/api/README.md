# The worker

One Cloudflare Worker, and it is the whole site. It serves the page out of
`../site`, takes photo and recording uploads and stores the files in R2 and
the captions in D1, serves the wall and the recordings back to the page, and
hosts the password-protected `/admin` panel.

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

That creates the tables and deploys the worker — page, backend, domain, all in
one. It prints two addresses: `https://mahoganyjr.com` and a spare,
`https://mahoganyjr.yourname.workers.dev`, which is the same site and stays
working forever as a back door if the domain ever has a bad day.

Try `/admin` on either now — your password should get you in, to an empty
panel.

If instead it says the custom domain could not be attached, the domain is not
in your Cloudflare account yet. See the next section; the workers.dev address
works regardless.

### 6. Write his name

Open `/admin` → **Page text** → fill in the name, the dates, and whatever you
want people to read first. Save. That is the only place the name lives; you
never edit code to change it.

**At this point the site is live** — on mahoganyjr.com if the domain was in
your account, and on the workers.dev address either way.

---

## The domain — there is no DNS to do

`wrangler.toml` lists `mahoganyjr.com` and `www.mahoganyjr.com` as **Workers
Custom Domains**. When `deploy.sh` runs, Cloudflare creates the DNS records and
the HTTPS certificate for each one by itself. You never open a DNS panel.

The one thing it needs is for the domain to be a zone in *your* Cloudflare
account:

- **Bought through Cloudflare?** It already is. Nothing to do.
- **Bought somewhere else?** Once: Cloudflare dashboard → **Add a site** →
  `mahoganyjr.com` → Free. It shows two nameservers unique to your account,
  like `xxxx.ns.cloudflare.com`. Go to where you bought the domain, find its
  nameserver setting, replace what's there with those two, save. Cloudflare
  emails you when it's active — minutes to a day. Then `bash deploy.sh` once
  more and the domain attaches.

That nameserver swap happens at the registrar, and no command can reach it.
Everything else is the one deploy.

**Check it.** All three should work:

- `https://mahoganyjr.com` — the page, with his name on it
- `https://mahoganyjr.com/admin` — the caretaker sign-in
- `https://mahoganyjr.com/api/memorial` — a block of JSON

`site/js/config.js` is `""`, which means "call `/api/...` on whatever address
the page came from" — always right, since the page and the backend are the
same worker.

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
- The page's look → `site/css/style.css`, then `bash deploy.sh`.
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
