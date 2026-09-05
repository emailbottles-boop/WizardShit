# A memorial photo wall

A quiet website where the people who knew someone can put their photographs in
one place, so the pictures that only exist on one person's phone don't stay
there.

Anyone with the link can add a photo. No account, no app, no sign-in. Photos
appear on the wall straight away. You keep a private `/admin` page where you
can hide or delete anything.

It runs entirely on Cloudflare's free tier and costs nothing to keep online:
100,000 requests a day, a 5GB database, 10GB of photo storage. Roughly ten
thousand phone photos before you'd approach any limit. Nothing sleeps, nothing
expires, and there is no monthly bill to forget about.

## How it fits together

```
Visitor ─▶ your domain (GitHub Pages: the page, the CSS, the layout)
              │  fetches /api/memorial
              ▼
         Cloudflare Worker ──▶ D1  (captions, names, dates)
              ▲                └──▶ R2  (the photo files)
              │
You ────▶ /admin  (password protected)
```

Two moving parts: this repo, and one Cloudflare Worker in [`api/`](api/). The
page itself is plain HTML, CSS and JavaScript — no build step, no framework,
nothing to update. If you open it in five years it will still make sense.

## Setting it up

Full walkthrough in **[api/README.md](api/README.md)**. Short version:

1. `cd api && npx wrangler login`
2. `npx wrangler d1 create memorial` — paste the id it prints into `wrangler.toml`
3. `npx wrangler r2 bucket create memorial-photos`
4. `npx wrangler secret put ADMIN_PASSWORD` — choose the caretaker password
5. `bash deploy.sh`
6. Paste the worker URL it prints into `js/config.js`, commit, push
7. Turn on GitHub Pages for this repo (Settings → Pages → deploy from `main`)

Then open `/admin`, sign in, and type his name and dates into the **Page text**
tab. That is the only place the name lives — you never have to edit code to
change it.

## Looking after it

**Taking something down.** Go to `/admin`. Every photo has **Hide** (comes off
the wall, file kept, reversible) and **Delete** (gone permanently, including the
file). Uploads are public the moment they are made, so `/admin` is worth having
bookmarked on your phone.

**Someone can't add a photo.** Almost always an iPhone HEIC that their browser
won't decode. The page says so and suggests screenshotting it, which works.
Most phones convert to JPEG automatically on upload, so this is uncommon.

**Keeping a copy.** These photos may be the only copies of some of them. Once
or twice a year:

```
cd api
bash backup.sh https://your-site-address.com
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
| `api/backup.sh` | downloads everything onto your computer |

## A note on what this does with photos

Before a photo leaves the browser it is resized to 2400px on its long edge and
re-encoded. That is mostly for speed, but it has a side effect worth knowing:
it strips the EXIF metadata, so the GPS coordinates that phones quietly attach
to photos are not published along with them.

Photos are public to anyone with the link. There is no password on the wall
itself — that is deliberate, so nobody is locked out at a bad moment — but it
does mean the link is the only thing protecting it. Share it the way you'd
share a funeral notice.
