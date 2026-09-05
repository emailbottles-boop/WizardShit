# Santana Turner — mahoganyjr.com

A quiet website where the people who knew Santana can put their photographs in
one place, so the pictures that only exist on one person's phone don't stay
there.

Anyone with the link can add a photo or a recording. No account, no app, no
sign-in. Photos go on the wall and recordings into their own section, straight
away. You keep a private `/admin` page where you can hide or delete anything.

It runs entirely on Cloudflare's free tier and costs nothing to keep online:
100,000 requests a day, a 5GB database, 10GB of photo storage. Roughly ten
thousand phone photos before you'd approach any limit. Nothing sleeps, nothing
expires, and there is no monthly bill to forget about.

## How it fits together

```
Visitor ─▶ mahoganyjr.com
              ├─ the page, CSS, JavaScript ──▶ Cloudflare Pages
              └─ /api/*  /img/*  /admin  ──▶ Cloudflare Worker
                                                 ├──▶ D1  (captions, names, dates)
                                                 └──▶ R2  (the photos and recordings)
You ────▶ /admin  (password protected)
```

Everything is on Cloudflare, in your existing account: the page on Pages, the
backend a Worker in [`api/`](api/). The page itself is plain HTML, CSS and
JavaScript — no build step, no framework, nothing to update. If you open it in
five years it will still make sense.

## Setting it up

Full walkthrough, including the DNS, in **[api/README.md](api/README.md)**.
Short version, all from your terminal:

1. `cd api && npx wrangler login`
2. `npx wrangler d1 create memorial` — paste the id it prints into `wrangler.toml`
3. `npx wrangler r2 bucket create memorial-photos`
4. `npx wrangler secret put ADMIN_PASSWORD` — choose the caretaker password
5. `bash deploy.sh` — the backend
6. `cd .. && bash deploy-site.sh` — the page; live at `mahoganyjr.pages.dev`
7. Attach the domain: Cloudflare dashboard → Workers & Pages → mahoganyjr →
   Custom domains → add `mahoganyjr.com` and `www.mahoganyjr.com`

Then open `https://mahoganyjr.com/admin`, sign in, and fill in his dates and
whatever you want people to read first, in the **Page text** tab. His name is
already on the page; the database version overrides it if you ever want to
change how it reads.

## Looking after it

**Taking something down.** Go to `/admin`. Every photo and recording has
**Hide** (comes off the site, file kept, reversible) and **Delete** (gone
permanently, including the file). Uploads are public the moment they are made,
so `/admin` is worth having bookmarked on your phone.

**Recordings.** MP3, WAV, M4A, OGG and FLAC, up to 60MB each. They are stored
exactly as uploaded — nothing re-encodes his music — so a WAV stays a WAV. A
WAV is about ten times the size of an MP3 of the same song; the free 10GB
bucket holds a couple of hundred of them, or a couple of thousand MP3s.

**Getting photos off Facebook.** In the photo viewer, the `...` menu in the
top corner has **Save/Download**, which gives you the real full-resolution
file. Use that rather than screenshotting — a screenshot bakes in the status
bar, the black bars and the like-button strip, at a fraction of the quality.

If you have already screenshotted a pile of them, this trims the furniture back
off (originals untouched, and it is safe to run twice):

```
python3 tools/crop-screenshots.py ~/Pictures/screenshots
```

**Someone can't add a photo.** Almost always an iPhone HEIC that their browser
won't decode. The page says so and suggests screenshotting it, which works.
Most phones convert to JPEG automatically on upload, so this is uncommon.

**Keeping a copy.** These photos may be the only copies of some of them. Once
or twice a year:

```
cd api
bash backup.sh https://mahoganyjr.com
```

That downloads every photo file plus all the captions into a dated folder.
Keep it somewhere that isn't Cloudflare.

## What's in here

| | |
|---|---|
| `index.html` | the memorial page |
| `css/style.css` | all the styling |
| `js/main.js` | loading the wall, the lightbox, uploading |
| `js/config.js` | one line: where the backend lives |
| `api/src/index.js` | the Worker — uploads, the wall, admin |
| `api/src/admin.js` | the caretaker panel |
| `api/schema.sql` | the two database tables |
| `deploy-site.sh` | puts the page live on Cloudflare Pages |
| `api/deploy.sh` | puts the backend live |
| `api/backup.sh` | downloads everything onto your computer |
| `tools/crop-screenshots.py` | trims phone/Facebook furniture off screenshots |

## A note on what this does with photos

Before a photo leaves the browser it is resized to 2400px on its long edge and
re-encoded. (Recordings are never touched.) That is mostly for speed, but it has a side effect worth knowing:
it strips the EXIF metadata, so the GPS coordinates that phones quietly attach
to photos are not published along with them.

Photos are public to anyone with the link. There is no password on the wall
itself — that is deliberate, so nobody is locked out at a bad moment — but it
does mean the link is the only thing protecting it. Share it the way you'd
share a funeral notice.
