/**
 * Memorial site backend — a single Cloudflare Worker.
 *
 * It does three things:
 *
 *   1. Accepts photos and recordings from anyone with the link, into R2.
 *   2. Serves the wall, the recordings and the headline text as JSON.
 *   3. Hosts a password-protected /admin page for taking anything down.
 *
 * Routes
 *   GET    /api/memorial          -> headline text, recordings, first page of photos
 *   GET    /api/photos?before=ID  -> older photos (infinite scroll)
 *   POST   /api/photos            -> upload one photo or recording (raw body)
 *   GET    /img/<key>             -> the file itself, out of R2 (photos and audio;
 *                                    honours Range so recordings can seek)
 *   GET    /admin                 -> the caretaker panel (HTML)
 *   POST   /api/admin/login       -> exchange the password for a session token
 *   GET    /api/admin/photos      -> every photo, including hidden ones
 *   POST   /api/admin/photos/<id> -> hide / unhide / re-caption a photo
 *   DELETE /api/admin/photos/<id> -> delete a photo and its file, for good
 *   PUT    /api/admin/settings    -> save the headline text
 *
 * Uploads are public and appear on the wall immediately — that is the point,
 * so a grieving friend never hits a login wall. Everything that guards that
 * openness is therefore technical rather than social: real-image checks, a
 * size ceiling, a pixel ceiling, and a per-IP throttle. The human recourse is
 * the admin panel, where anything unwanted comes down in one click.
 */

import { ADMIN_HTML } from './admin.js';

/* ------------------------------------------------------------- helpers --- */

// Phone photos land around 2-5MB and the uploader re-encodes anything larger
// before it ever gets here, so 12MB is generous headroom rather than a target.
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

// Recordings are a different animal: an MP3 is roughly a megabyte a minute,
// but an uncompressed WAV is ten times that — a four-minute song is 40MB.
// This is sized so a real WAV of a real song gets through, while the free
// tier's 10GB bucket still holds a couple of hundred of them.
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;

// Recordings are few and precious, so the page gets every visible one at once
// rather than paging through them.
const MAX_RECORDINGS = 200;

// How many photos the wall asks for at a time.
const PAGE_SIZE = 60;

function str(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const PUBLIC_CORS = { 'Access-Control-Allow-Origin': '*' };

/**
 * CORS for state-changing calls. Reads are open to everyone, but a POST is
 * only echoed back as allowed when it comes from an origin we listed, so a
 * random page on the web can't quietly drive uploads from a visitor's browser.
 * With ALLOWED_ORIGINS unset (a fresh deploy, before the domain exists) this
 * falls back to open rather than locking the owner out of their own site.
 */
function writeCors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = str(env.ALLOWED_ORIGINS, 2000);
  const base = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (!allowed) return { ...base, 'Access-Control-Allow-Origin': origin || '*' };
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  if (origin && list.includes(origin)) return { ...base, 'Access-Control-Allow-Origin': origin };
  return base; // no allow-origin header => the browser refuses the response
}

/* ---------------------------------------------------------------- auth --- */

function b64urlEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constant-time string compare. Comparing the admin password with === leaks
 * how many leading characters were right through the time it takes to fail;
 * HMAC-ing both sides under a random per-call key removes that signal without
 * needing the strings to be the same length.
 */
async function timingSafeEqualStr(a, b) {
  const enc = new TextEncoder();
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [ma, mb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const x = new Uint8Array(ma);
  const y = new Uint8Array(mb);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function sessionKey(env) {
  const secret = str(env.SESSION_SECRET, 500) || str(env.ADMIN_PASSWORD, 500);
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('memorial-session:' + secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * A session token is just "expiry.signature". There is no session table: the
 * signature is what makes it valid, so a stolen token expires on its own and
 * changing ADMIN_PASSWORD invalidates every outstanding one at once.
 */
async function makeSessionToken(env, days = 7) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const key = await sessionKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(exp)));
  return exp + '.' + b64urlEncode(sig);
}

async function verifySessionToken(token, env) {
  const t = str(token, 500);
  const dot = t.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(t.slice(0, dot));
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const key = await sessionKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(exp)));
  return timingSafeEqualStr(b64urlEncode(sig), t.slice(dot + 1));
}

/**
 * Brute-force guard for the admin password. The endpoint and the token format
 * are public (this repo is readable), so without a cap an attacker could guess
 * at full speed. Failures are counted per IP in the edge cache — which costs
 * no database quota — and only failures count, so signing in correctly a
 * hundred times never locks the caretaker out. Fails open on a cache error:
 * the job is to defeat high-rate guessing, not to be a perfect limiter.
 */
const AUTH_FAIL_WINDOW = 600;
const AUTH_FAIL_MAX = 10;

function authFailKey(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  return new Request('https://ratelimit.invalid/authfail/' + encodeURIComponent(ip));
}
async function authFailCount(request) {
  try {
    const hit = await caches.default.match(authFailKey(request));
    return hit ? Number(await hit.text()) || 0 : 0;
  } catch {
    return 0;
  }
}
async function recordAuthFail(request) {
  try {
    const n = (await authFailCount(request)) + 1;
    await caches.default.put(
      authFailKey(request),
      new Response(String(n), { headers: { 'Cache-Control': 'max-age=' + AUTH_FAIL_WINDOW } }),
    );
  } catch {
    /* fail open */
  }
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

async function isAdmin(request, env) {
  const token = bearer(request);
  return token ? verifySessionToken(token, env) : false;
}

/* ------------------------------------------------------------ throttle --- */

// A memorial gets used in bursts: someone opens an album and adds fifteen
// photos in a row. So the limit is a budget over a window rather than a delay
// between uploads — a person emptying their camera roll never notices it, and
// a script trying to fill the bucket runs out almost immediately.
const UPLOAD_WINDOW = 60;  // seconds the budget covers
const UPLOAD_BURST = 30;   // photos one IP may add within that window

/**
 * Per-IP upload budget, counted in the edge cache rather than the database so
 * refusing a flood costs no D1 write quota.
 *
 * Two things worth knowing about it: the cache is per Cloudflare colo, and it
 * fails open if the cache errors. So this is a brake on casual flooding, not a
 * guarantee — the byte ceiling and the pixel ceiling below are what actually
 * bound what anyone can store here.
 */
async function allowUpload(request) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  const key = new Request('https://ratelimit.invalid/upload/' + encodeURIComponent(ip));
  try {
    const cache = caches.default;
    const hit = await cache.match(key);
    const used = hit ? Number(await hit.text()) || 0 : 0;
    if (used >= UPLOAD_BURST) return false;
    // Deliberately NOT re-written once over budget: every put refreshes the
    // entry's lifetime, so counting refusals too would let someone hammering
    // the endpoint hold their own block open indefinitely. Leaving it alone
    // means the window expires 60s after the last ACCEPTED upload.
    await cache.put(
      key,
      new Response(String(used + 1), { headers: { 'Cache-Control': 'max-age=' + UPLOAD_WINDOW } }),
    );
    return true;
  } catch {
    return true;
  }
}

/* --------------------------------------------------------------- image --- */

// No SVG. An SVG can carry script, and /img/* is served from the same origin
// as /admin, so allowing one would hand any uploader a foothold in the
// caretaker's session. Raster formats only keeps that door shut.
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// A pixel bomb is a tiny file that decodes to an enormous bitmap — a flat
// 20000x20000 PNG is a few KB on disk and several gigabytes of RGBA in a
// viewer's browser. The byte ceiling does nothing about that, so the real
// guard is a budget on decoded pixels, read from the format's own header.
const MAX_IMAGE_DIM = 10000;
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000;

// Browsers disagree on what to call the same audio file (a WAV arrives as
// audio/wav, audio/x-wav or audio/wave depending on the OS), so every alias
// maps to one extension, and the file is STORED under the one canonical type
// in CANONICAL_AUDIO so the player is always handed a Content-Type it accepts.
const AUDIO_TYPES = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac', 'audio/x-flac': 'flac',
};
const CANONICAL_AUDIO = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };

function be32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

function tag(b, o, text) {
  for (let i = 0; i < text.length; i++) if (b[o + i] !== text.charCodeAt(i)) return false;
  return true;
}

/**
 * Same idea as readImageSize, for sound: the declared type proves nothing, so
 * the file's own header decides. Returns null when the bytes really are the
 * format claimed, else a short reason. There is no audio equivalent of a pixel
 * bomb — the only thing a recording can do to a listener is be long — so the
 * byte ceiling is the whole size story here.
 */
function checkAudioBytes(buf, ext) {
  const b = new Uint8Array(buf);
  if (b.length < 12) return 'That file is too small to be a recording';
  if (ext === 'mp3') {
    // Either an ID3v2 tag up front, or straight into an MPEG frame: 11 sync
    // bits set, i.e. 0xFF then a byte whose top three bits are set.
    if (tag(b, 0, 'ID3')) return null;
    if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return null;
    return 'That is not a real MP3';
  }
  if (ext === 'wav') return tag(b, 0, 'RIFF') && tag(b, 8, 'WAVE') ? null : 'That is not a real WAV';
  if (ext === 'm4a') return tag(b, 4, 'ftyp') ? null : 'That is not a real M4A';
  if (ext === 'ogg') return tag(b, 0, 'OggS') ? null : 'That is not a real OGG';
  if (ext === 'flac') return tag(b, 0, 'fLaC') ? null : 'That is not a real FLAC';
  return 'Unsupported recording type';
}

/**
 * Returns { width, height } when the bytes really are the declared format and
 * decode to a sane size, or a string describing what is wrong.
 *
 * The Content-Type header is chosen by whoever is uploading, so it proves
 * nothing. This is the check that actually keeps a renamed executable, an HTML
 * page, or a decompression bomb out of the bucket: magic numbers first, then
 * the dimensions straight out of the file's own header.
 */
function readImageSize(buf, type) {
  const b = new Uint8Array(buf);
  let dims = null;
  if (type === 'image/png') {
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return 'That is not a real PNG';
    dims = [be32(b, 16), be32(b, 20)];
  } else if (type === 'image/jpeg') {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return 'That is not a real JPEG';
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const t = b[i + 1];
      if (t === 0xff || t === 0x01 || t === 0xd8 || (t >= 0xd0 && t <= 0xd9)) { i += t === 0xff ? 1 : 2; continue; }
      // Any SOF marker carries the real size; SOF4/8/12 are tables, not frames.
      if (t >= 0xc0 && t <= 0xcf && t !== 0xc4 && t !== 0xc8 && t !== 0xcc) {
        dims = [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
        break;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    if (!dims) return 'Could not read that JPEG';
  } else if (type === 'image/gif') {
    if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return 'That is not a real GIF';
    dims = [b[6] | (b[7] << 8), b[8] | (b[9] << 8)];
  } else if (type === 'image/webp') {
    if (b.length < 30 || b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46 ||
        b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return 'That is not a real WebP';
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === 'VP8X') {
      dims = [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    } else if (fourcc === 'VP8 ') {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return 'Could not read that WebP';
      dims = [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
    } else if (fourcc === 'VP8L') {
      if (b[20] !== 0x2f) return 'Could not read that WebP';
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      dims = [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
    } else return 'Could not read that WebP';
  } else return 'Photos only, please (jpg, png, gif or webp)';
  const w = dims[0], h = dims[1];
  if (!(w > 0 && h > 0)) return 'That image looks broken';
  if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM || w * h > MAX_IMAGE_PIXELS) return 'That image is too many pixels';
  return { width: w, height: h };
}

/* --------------------------------------------------------------- wall --- */

function photoRow(r) {
  return {
    id: r.id,
    kind: r.kind || 'photo',
    image: r.image,
    caption: r.caption || '',
    uploader: r.uploader || '',
    photographer: r.photographer || '',
    width: r.width || 0,
    height: r.height || 0,
    duration: r.duration || 0,
    created_at: r.created_at,
  };
}

const ROW_COLS = 'id, kind, image, caption, uploader, photographer, width, height, duration, created_at';

async function listPhotos(env, beforeId, by) {
  const before = Number(beforeId);
  const paged = Number.isFinite(before) && before > 0;
  const where = ["hidden = 0", "kind = 'photo'"];
  const binds = [];
  if (by) { where.push('uploader = ?'); binds.push(by); }
  if (paged) { where.push('id < ?'); binds.push(before); }
  binds.push(PAGE_SIZE);
  const { results } = await env.DB.prepare(
    'SELECT ' + ROW_COLS + ' FROM photos WHERE ' + where.join(' AND ') + ' ORDER BY id DESC LIMIT ?',
  ).bind(...binds).all();
  const photos = (results || []).map(photoRow);
  return { photos, more: photos.length === PAGE_SIZE };
}

// Everyone who has put their name to a visible photo, most photos first. This
// is what lets the page show one person's photos as a set.
async function listPeople(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT uploader AS name, COUNT(*) AS n FROM photos WHERE hidden = 0 AND kind = 'photo' AND uploader <> '' GROUP BY uploader ORDER BY n DESC, name ASC LIMIT 200",
    ).all();
    return (results || []).map((r) => ({ name: r.name, count: r.n }));
  } catch {
    return [];
  }
}

async function listRecordings(env) {
  const { results } = await env.DB.prepare(
    'SELECT ' + ROW_COLS + " FROM photos WHERE hidden = 0 AND kind = 'audio' ORDER BY id DESC LIMIT ?",
  ).bind(MAX_RECORDINGS).all();
  return (results || []).map(photoRow);
}

/* --------------------------------------------------------------- live --- */

// Every add, hide, un-hide and delete is appended to `changes`, so an open page
// can ask "what happened after event N?" with one indexed query and apply just
// that. Viewers who are caught up all ask with the same N, so the edge cache
// collapses them into a single database read every few seconds no matter how
// many people are watching.
async function logChange(env, kind, itemId) {
  try {
    await env.DB.prepare('INSERT INTO changes (item_id, kind) VALUES (?, ?)').bind(itemId, kind).run();
  } catch {
    // The table comes from schema.sql. A database that predates it just loses
    // live updates until deploy.sh runs — the change itself still happened.
  }
}

async function latestCursor(env) {
  try {
    const row = await env.DB.prepare('SELECT MAX(seq) AS seq FROM changes').first();
    return (row && row.seq) || 0;
  } catch {
    return 0;
  }
}

/**
 * Everything after `cursor`, reduced to what a page needs to do: `show` an
 * item (with its current data) or `hide` one. Present state wins — an item
 * added and then hidden inside one window is simply not sent, rather than
 * shown and snatched away — and only the last word about each item is kept.
 */
async function changesSince(env, cursor) {
  const { results } = await env.DB.prepare(
    'SELECT c.seq, c.kind AS ev, c.item_id, p.hidden, p.id, p.kind, p.image, p.caption, p.uploader, p.photographer, ' +
    'p.width, p.height, p.duration, p.created_at ' +
    'FROM changes c LEFT JOIN photos p ON p.id = c.item_id WHERE c.seq > ? ORDER BY c.seq ASC LIMIT 200',
  ).bind(cursor).all();
  const byItem = new Map();
  let last = cursor;
  for (const r of results || []) {
    last = r.seq;
    if (r.ev === 'add' || r.ev === 'show') {
      if (r.id == null || r.hidden) byItem.set(r.item_id, { kind: 'hide', id: r.item_id });
      else byItem.set(r.item_id, { kind: 'show', id: r.item_id, item: photoRow(r) });
    } else {
      byItem.set(r.item_id, { kind: 'hide', id: r.item_id });
    }
  }
  return { events: Array.from(byItem.values()), cursor: last };
}

// Defaults exist so the site is never blank and never shows a raw placeholder
// before anyone has opened the admin panel.
const DEFAULT_SETTINGS = {
  name: '',
  dates: '',
  intro: '',
  invite: '',
};

async function readSettings(env) {
  const out = { ...DEFAULT_SETTINGS };
  try {
    const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
    for (const row of results || []) {
      if (row.key in out) out[row.key] = row.value;
    }
  } catch {
    // Settings table not created yet — the defaults above are a fine answer.
  }
  return out;
}

async function writeSettings(env, body) {
  const stmts = [];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in body)) continue;
    stmts.push(
      env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(key, str(body[key], 4000)),
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return readSettings(env);
}

/* ------------------------------------------------------------- upload --- */

/**
 * Take one photo or recording and put it on the site.
 *
 * The body is the raw file; the caption and the uploader's name ride along in
 * the query string. That keeps this endpoint trivial to call from the page and
 * avoids buffering a whole multipart parse for a single file. Which of the two
 * it is comes from the Content-Type — and then the bytes are checked against
 * that claim, because the header is whatever the uploader says it is.
 */
async function receiveUpload(request, env, origin) {
  const url = new URL(request.url);

  // Bots fill in every field they find. A real person never sees this one, so
  // anything in it is automated — answered with a cheerful 200 so the bot has
  // no signal that it was caught.
  if (str(url.searchParams.get('website'), 100)) return json({ ok: true }, 200, PUBLIC_CORS);

  if (!(await allowUpload(request))) {
    return json({ error: 'That is a lot of photos at once. Give it a minute and add the rest.' }, 429, { ...PUBLIC_CORS, 'Retry-After': String(UPLOAD_WINDOW) });
  }

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const isImage = !!IMAGE_TYPES[type];
  const ext = isImage ? IMAGE_TYPES[type] : AUDIO_TYPES[type];
  if (!ext) {
    return json({ error: 'Photos (jpg, png, gif, webp) or recordings (mp3, wav, m4a, ogg, flac) only' }, 415, PUBLIC_CORS);
  }
  const kind = isImage ? 'photo' : 'audio';
  const limit = isImage ? MAX_UPLOAD_BYTES : MAX_AUDIO_BYTES;
  const tooBig = isImage ? 'That photo is larger than 12MB' : 'That recording is larger than 60MB';

  // Refuse on the declared length before reading the body, so an oversized
  // upload is rejected without pulling all of it through the worker first.
  const length = Number(request.headers.get('Content-Length') || '0');
  if (length > limit) return json({ error: tooBig }, 413, PUBLIC_CORS);

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'That file was empty' }, 400, PUBLIC_CORS);
  if (body.byteLength > limit) return json({ error: tooBig }, 413, PUBLIC_CORS);

  let width = 0, height = 0, storedType = type;
  if (isImage) {
    const size = readImageSize(body, type);
    if (typeof size === 'string') return json({ error: size }, 415, PUBLIC_CORS);
    width = size.width;
    height = size.height;
  } else {
    const bad = checkAudioBytes(body, ext);
    if (bad) return json({ error: bad }, 415, PUBLIC_CORS);
    storedType = CANONICAL_AUDIO[ext];
  }

  const caption = str(url.searchParams.get('caption'), 600);
  const uploader = str(url.searchParams.get('by'), 80);
  const photographer = str(url.searchParams.get('photo_by'), 80);
  // The browser reads the length before uploading; it is display-only, so a
  // wrong or missing value costs nothing but a label. Capped at ten hours.
  const duration = isImage ? 0 : Math.max(0, Math.min(36000, Number(url.searchParams.get('duration')) || 0));

  // Random key, not the uploader's filename: a filename is attacker-controlled
  // and would otherwise let one upload overwrite another, or smuggle a path.
  const key = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 12) + '.' + ext;

  // Stored as a PATH, not a full URL. This worker answers on mahoganyjr.com
  // and on its workers.dev address, and whichever one happened to receive an
  // upload must not get baked into the database for good — the page prefixes
  // the path with wherever it is talking to, so the same row works from any
  // address, including a future one.
  const image = '/img/' + key;

  await env.IMAGES.put(key, body, { httpMetadata: { contentType: storedType } });

  // If the row fails to insert, the file is already in R2 and nothing points
  // at it. Clean it up rather than leaving an orphan quietly using storage.
  let row;
  try {
    row = await env.DB.prepare(
      'INSERT INTO photos (kind, mime, image, r2_key, caption, uploader, photographer, width, height, duration, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ' + ROW_COLS,
    )
      .bind(kind, storedType, image, key, caption, uploader, photographer, width, height, duration, body.byteLength)
      .first();
  } catch (err) {
    await env.IMAGES.delete(key).catch(() => {});
    throw err;
  }

  await logChange(env, 'add', row.id);
  await purgeWallCache(origin);
  return json({ ok: true, photo: photoRow(row) }, 200, PUBLIC_CORS);
}

async function serveFile(request, env, key) {
  // Handing R2 the request headers lets it resolve a Range header itself.
  // Without this an <audio> player still plays, but every seek restarts the
  // download from byte zero — on a 40MB WAV that is the difference between
  // scrubbing to the chorus and waiting for it.
  // Only hand R2 the headers when a Range was actually asked for. Given
  // headers with no Range in them, R2 still reports a `range` covering the
  // whole object — and answering a plain GET with 206 is wrong, and stops
  // Cloudflare's edge cache from keeping the file.
  const wantsRange = request.headers.has('Range');
  let obj;
  try {
    obj = await env.IMAGES.get(key, wantsRange ? { range: request.headers } : undefined);
  } catch {
    obj = await env.IMAGES.get(key); // an unsatisfiable range: fall back to the whole file
  }
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = {
    'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
    // Keys are unique per upload and a file never changes, so it can be
    // cached forever — which is what keeps the site cheap to browse.
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Belt and braces around the no-SVG rule: even if something slipped
    // through, the browser will not sniff it into HTML or run script in it.
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Accept-Ranges': 'bytes',
    ...PUBLIC_CORS,
  };

  if (wantsRange && obj.range) {
    const start = obj.range.offset != null ? obj.range.offset : Math.max(0, obj.size - obj.range.suffix);
    const length = obj.range.length != null ? obj.range.length : obj.size - start;
    headers['Content-Range'] = 'bytes ' + start + '-' + (start + length - 1) + '/' + obj.size;
    headers['Content-Length'] = String(length);
    return new Response(obj.body, { status: 206, headers });
  }
  headers['Content-Length'] = String(obj.size);
  return new Response(obj.body, { headers });
}

/**
 * Drop the cached first page so a new photo shows up the moment it is added
 * rather than up to 30 seconds later. Only the first page is cached, so this
 * is the only key that needs clearing.
 */
async function purgeWallCache(origin) {
  try {
    await caches.default.delete(new Request(origin + '/api/memorial'));
  } catch {
    /* nothing depends on this succeeding */
  }
}

/* -------------------------------------------------------------- router --- */

async function route(request, env, ctx, url, path, method) {
  const origin = url.origin;

  if (method === 'GET' && path.startsWith('/img/')) {
    return serveFile(request, env, decodeURIComponent(path.slice('/img/'.length)));
  }

  if (path === '/admin' || path === '/admin/') {
    return new Response(ADMIN_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }

  /* ---- public ---- */

  // The whole first paint in one call: headline text, every recording, and
  // the newest photos.
  if (path === '/api/memorial' && method === 'GET') {
    const cache = caches.default;
    const cacheKey = new Request(origin + '/api/memorial');
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    const [settings, wall, recordings, cursor, people] = await Promise.all([
      readSettings(env), listPhotos(env, null), listRecordings(env), latestCursor(env), listPeople(env),
    ]);
    const res = json({ ...wall, recordings, settings, cursor, people }, 200, {
      ...PUBLIC_CORS,
      // Short, because a photo added now should appear almost at once for
      // everyone; the explicit purge above covers the uploader themselves.
      'Cache-Control': 'public, max-age=30',
    });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // What happened after event N. Cached for a few seconds keyed on N, which is
  // what lets a crowd of open pages cost one database read between them.
  if (path === '/api/changes' && method === 'GET') {
    const cursor = Math.max(0, Math.floor(Number(url.searchParams.get('cursor')) || 0));
    const cache = caches.default;
    const cacheKey = new Request(origin + '/api/changes?cursor=' + cursor);
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    let out;
    try {
      out = await changesSince(env, cursor);
    } catch {
      out = { events: [], cursor };
    }
    const res = json(out, 200, { ...PUBLIC_CORS, 'Cache-Control': 'public, max-age=3' });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // Older pages are not cached: they are read far less often, and they shift
  // as photos are hidden.
  if (path === '/api/photos' && method === 'GET') {
    return json(await listPhotos(env, url.searchParams.get('before'), str(url.searchParams.get('by'), 80)), 200, PUBLIC_CORS);
  }

  if (path === '/api/photos' && method === 'POST') {
    return receiveUpload(request, env, origin);
  }

  /* ---- admin ---- */

  if (path === '/api/admin/login' && method === 'POST') {
    const password = str(env.ADMIN_PASSWORD, 500);
    if (!password) {
      return json({ error: 'No admin password is set on this worker yet. Run: npx wrangler secret put ADMIN_PASSWORD' }, 503);
    }
    if ((await authFailCount(request)) >= AUTH_FAIL_MAX) {
      return json({ error: 'Too many attempts. Wait ten minutes and try again.' }, 429);
    }
    const body = await request.json().catch(() => ({}));
    if (!(await timingSafeEqualStr(str(body.password, 500), password))) {
      await recordAuthFail(request);
      return json({ error: 'That password is not right' }, 401);
    }
    return json({ ok: true, token: await makeSessionToken(env) });
  }

  if (path.startsWith('/api/admin/')) {
    if (!(await isAdmin(request, env))) return json({ error: 'Please sign in' }, 401);

    if (path === '/api/admin/photos' && method === 'GET') {
      const before = Number(url.searchParams.get('before'));
      const sql = Number.isFinite(before) && before > 0
        ? 'SELECT ' + ROW_COLS + ', bytes, hidden FROM photos WHERE id < ? ORDER BY id DESC LIMIT ?'
        : 'SELECT ' + ROW_COLS + ', bytes, hidden FROM photos ORDER BY id DESC LIMIT ?';
      const stmt = Number.isFinite(before) && before > 0
        ? env.DB.prepare(sql).bind(before, PAGE_SIZE)
        : env.DB.prepare(sql).bind(PAGE_SIZE);
      const { results } = await stmt.all();
      const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos').first();
      return json({ photos: results || [], more: (results || []).length === PAGE_SIZE, total: total?.n || 0 });
    }

    const photoMatch = path.match(/^\/api\/admin\/photos\/(\d+)$/);
    if (photoMatch) {
      const id = Number(photoMatch[1]);

      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const sets = [];
        const binds = [];
        if ('hidden' in body) { sets.push('hidden = ?'); binds.push(body.hidden ? 1 : 0); }
        if ('caption' in body) { sets.push('caption = ?'); binds.push(str(body.caption, 600)); }
        if ('uploader' in body) { sets.push('uploader = ?'); binds.push(str(body.uploader, 80)); }
        if ('photographer' in body) { sets.push('photographer = ?'); binds.push(str(body.photographer, 80)); }
        if (!sets.length) return json({ error: 'Nothing to change' }, 400);
        binds.push(id);
        await env.DB.prepare('UPDATE photos SET ' + sets.join(', ') + ' WHERE id = ?').bind(...binds).run();
        await logChange(env, 'hidden' in body && body.hidden ? 'hide' : 'show', id);
        await purgeWallCache(origin);
        return json({ ok: true });
      }

      if (method === 'DELETE') {
        // Read the key first: once the row is gone there is no way left to
        // find the file, and it would sit in R2 forever.
        const row = await env.DB.prepare('SELECT r2_key FROM photos WHERE id = ?').bind(id).first();
        if (!row) return json({ error: 'Already gone' }, 404);
        await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
        await env.IMAGES.delete(row.r2_key).catch(() => {});
        await logChange(env, 'remove', id);
        await purgeWallCache(origin);
        return json({ ok: true });
      }
    }

    if (path === '/api/admin/settings' && method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const settings = await writeSettings(env, body);
      await purgeWallCache(origin);
      return json({ ok: true, settings });
    }

    return json({ error: 'Not found' }, 404);
  }

  // Nothing matched. The page's files are served by the assets binding before
  // this code ever runs, so a request landing here for a browser is a mistyped
  // address — give it the site's own 404 page rather than a block of JSON.
  if (env.ASSETS && method === 'GET' && (request.headers.get('Accept') || '').includes('text/html')) {
    const page = await env.ASSETS.fetch(new Request(origin + '/404.html'));
    return new Response(page.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: writeCors(request, env) });
    }

    try {
      const res = await route(request, env, ctx, url, path, method);
      // Reads are public; writes had their origin checked at the preflight.
      if (method !== 'GET' && !res.headers.has('Access-Control-Allow-Origin')) {
        const cors = writeCors(request, env);
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      }
      return res;
    } catch (err) {
      // Never echo the internal message: it can carry SQL, keys or paths.
      console.error('memorial worker error:', err && err.stack ? err.stack : err);
      return json({ error: 'Something went wrong on our end. Please try again.' }, 500, PUBLIC_CORS);
    }
  },
};
