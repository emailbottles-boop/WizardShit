/**
 * Wizard Shit backend — a single Cloudflare Worker.
 *
 * Public endpoints (called by the GitHub Pages site):
 *   GET /api/content     -> { merch, credits, donators } (visible items only)
 *   GET /img/<key>       -> images uploaded through the admin panel (R2)
 *   POST /api/messages   -> the site's message bubble drops mail in the inbox
 *   POST /api/signup     -> the email-for-updates box adds to the signup list
 *   POST /api/claim      -> a crew member claims their credit card identity
 *   GET /api/claims-public -> names with a verified claim (for the crew page)
 *
 * Owner endpoints (require auth — Cloudflare Access, or ADMIN_PASSWORD):
 *   GET /admin                        -> the admin panel UI
 *   POST /api/admin/login             -> validates a password login
 *   GET /api/admin/content            -> all rows, hidden ones included
 *   PUT /api/admin/collection/<name>  -> replace a collection (merch|credits|donators)
 *   POST /api/admin/upload            -> upload an image to R2
 *   GET /api/admin/messages           -> the inbox, newest first
 *   POST /api/admin/messages/<id>/read -> toggle read
 *   DELETE /api/admin/messages/<id>   -> delete a message
 *   GET /api/admin/signups            -> the signup list, newest first
 *   DELETE /api/admin/signups/<id>    -> remove a signup (unsubscribe)
 *   GET /api/admin/claims             -> all wizard ID claims, newest first
 *   POST /api/admin/claims/<id>/verify -> mark a claim verified
 *   POST /api/admin/claims/<id>/deny  -> mark a claim denied
 *   DELETE /api/admin/claims/<id>     -> delete a claim
 *   GET /api/admin/orders             -> recent Printful orders (needs PRINTFUL_TOKEN)
 *   GET /api/admin/printful/products  -> Printful store products (needs PRINTFUL_TOKEN)
 */

import { ADMIN_HTML } from './admin.js';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const COLLECTIONS = {
  merch: {
    table: 'merch_items',
    columns: ['title', 'url', 'image', 'sticker', 'row_break', 'visible', 'sort'],
    clean(item, i) {
      const title = str(item.title, 300);
      const url = str(item.url, 1000);
      const image = str(item.image, 1000);
      if (!title) throw new BadInput('merch item ' + (i + 1) + ': title is required');
      if (!/^https?:\/\//i.test(url)) throw new BadInput('merch item "' + title + '": link must start with http(s)://');
      if (!image) throw new BadInput('merch item "' + title + '": image is required');
      return [title, url, image, bool(item.sticker), bool(item.row_break), bool(item.visible), i];
    },
  },
  credits: {
    table: 'credits',
    columns: ['name', 'roles', 'photo', 'photo_css', 'back_text', 'back_quote', 'back_show_name', 'visible', 'sort'],
    clean(item, i) {
      const name = str(item.name, 200);
      if (!name) throw new BadInput('credit ' + (i + 1) + ': name is required');
      return [
        name,
        str(item.roles, 1000),
        str(item.photo, 1000),
        str(item.photo_css, 500),
        str(item.back_text, 4000),
        bool(item.back_quote),
        bool(item.back_show_name),
        bool(item.visible),
        i,
      ];
    },
  },
  donators: {
    table: 'donators',
    columns: ['name', 'visible', 'sort'],
    clean(item, i) {
      const name = str(item.name, 200);
      if (!name) throw new BadInput('donator ' + (i + 1) + ': name is required');
      return [name, bool(item.visible), i];
    },
  },
};

class BadInput extends Error {}

function str(v, max) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}
function bool(v) {
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

const PUBLIC_CORS = { 'Access-Control-Allow-Origin': '*' };

/* ---------------------------------------------------------------- auth --- */

let accessKeyCache = { keys: null, fetchedAt: 0 };

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToJSON(s) {
  return JSON.parse(new TextDecoder().decode(b64urlDecode(s)));
}

async function getAccessKeys(teamDomain) {
  const now = Date.now();
  if (accessKeyCache.keys && now - accessKeyCache.fetchedAt < 60 * 60 * 1000) {
    return accessKeyCache.keys;
  }
  const res = await fetch('https://' + teamDomain + '/cdn-cgi/access/certs');
  if (!res.ok) throw new Error('could not fetch Access signing keys');
  const data = await res.json();
  accessKeyCache = { keys: data.keys || [], fetchedAt: now };
  return accessKeyCache.keys;
}

async function verifyAccessJwt(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = b64urlToJSON(parts[0]);
    payload = b64urlToJSON(parts[1]);
  } catch {
    return null;
  }
  const keys = await getAccessKeys(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]),
  );
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(env.ACCESS_AUD)
    : payload.aud === env.ACCESS_AUD;
  if (!audOk) return null;
  if (payload.iss !== 'https://' + env.ACCESS_TEAM_DOMAIN) return null;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  return { email: payload.email || 'access-user' };
}

/* ---- Google sign-in: verify an ID token, issue our own session token ---- */

let googleKeyCache = { keys: null, fetchedAt: 0 };

async function getGoogleKeys() {
  const now = Date.now();
  if (googleKeyCache.keys && now - googleKeyCache.fetchedAt < 60 * 60 * 1000) {
    return googleKeyCache.keys;
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('could not fetch Google signing keys');
  const data = await res.json();
  googleKeyCache = { keys: data.keys || [], fetchedAt: now };
  return googleKeyCache.keys;
}

function founderEmails(env) {
  return (env.FOUNDER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function verifyGoogleIdToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = b64urlToJSON(parts[0]);
    payload = b64urlToJSON(parts[1]);
  } catch {
    return null;
  }
  const keys = await getGoogleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]),
  );
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.GOOGLE_CLIENT_ID) return null;
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;
  if (!payload.email || payload.email_verified !== true) return null;
  return { email: String(payload.email).toLowerCase() };
}

// Session tokens are signed with a key derived from ADMIN_PASSWORD, so no
// extra secret needs configuring; changing the password logs everyone out.
async function sessionKey(env) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('wiz-session-v1:' + (env.ADMIN_PASSWORD || '')),
  );
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64urlEncode(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeSessionToken(email, env) {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload = email + '|' + exp;
  const key = await sessionKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return 'wiztok.' + b64urlEncode(new TextEncoder().encode(payload)) + '.' + b64urlEncode(sig);
}

async function verifySessionToken(token, env) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'wiztok') return null;
  let payload;
  try {
    payload = new TextDecoder().decode(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  const key = await sessionKey(env);
  const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(payload));
  if (!ok) return null;
  const [email, expStr] = payload.split('|');
  if (!email || Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  if (!founderEmails(env).includes(email)) return null; // removed founders lose access immediately
  return { email };
}

async function timingSafeEqualStr(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Returns { ok: true, mode, email } or { ok: false, error, status }.
 * Access mode wins when configured; the password is only a fallback.
 */
async function checkAuth(request, env) {
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return { ok: false, status: 401, error: 'Not authenticated (Cloudflare Access token missing)' };
    try {
      const who = await verifyAccessJwt(token, env);
      if (who) return { ok: true, mode: 'access', email: who.email };
    } catch (e) {
      return { ok: false, status: 503, error: 'Could not verify Access token: ' + e.message };
    }
    return { ok: false, status: 401, error: 'Invalid Cloudflare Access token' };
  }
  if (env.ADMIN_PASSWORD) {
    const auth = request.headers.get('Authorization') || '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (given.startsWith('wiztok.')) {
      const who = await verifySessionToken(given, env);
      if (who) return { ok: true, mode: 'google', email: who.email };
      return { ok: false, status: 401, error: 'Session expired — sign in again' };
    }
    if (given && (await timingSafeEqualStr(given, env.ADMIN_PASSWORD))) {
      return { ok: true, mode: 'password', email: 'owner' };
    }
    return { ok: false, status: 401, error: 'Wrong or missing password' };
  }
  return {
    ok: false,
    status: 503,
    error: 'No auth configured. Set up Cloudflare Access (ACCESS_TEAM_DOMAIN + ACCESS_AUD) or run: npx wrangler secret put ADMIN_PASSWORD',
  };
}

/* ---------------------------------------------------------------- data --- */

async function readCollections(env, includeHidden) {
  const where = includeHidden ? '' : ' WHERE visible = 1';
  const [merch, credits, donators] = await Promise.all([
    env.DB.prepare('SELECT * FROM merch_items' + where + ' ORDER BY sort').all(),
    env.DB.prepare('SELECT * FROM credits' + where + ' ORDER BY sort').all(),
    env.DB.prepare('SELECT * FROM donators' + where + ' ORDER BY sort').all(),
  ]);
  return { merch: merch.results, credits: credits.results, donators: donators.results };
}

async function replaceCollection(env, name, items) {
  const spec = COLLECTIONS[name];
  if (!Array.isArray(items)) throw new BadInput('expected a JSON array of items');
  if (items.length > 500) throw new BadInput('too many items');
  const placeholders = spec.columns.map(() => '?').join(', ');
  const insert = 'INSERT INTO ' + spec.table + ' (' + spec.columns.join(', ') + ') VALUES (' + placeholders + ')';
  const stmts = [env.DB.prepare('DELETE FROM ' + spec.table)];
  items.forEach((item, i) => {
    stmts.push(env.DB.prepare(insert).bind(...spec.clean(item, i)));
  });
  await env.DB.batch(stmts); // D1 batches run as a single transaction
}

/* ------------------------------------------------------------ messages --- */

async function receiveMessage(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  // Honeypot: real visitors never fill the hidden "website" field. Pretend
  // success so bots don't learn they were caught.
  if (str(data.website, 50)) return json({ ok: true }, 200, PUBLIC_CORS);
  const body = str(data.message, 4000);
  if (!body) return json({ error: 'Message is empty' }, 400, PUBLIC_CORS);
  const email = str(data.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Add your email so the wizards can reply' }, 400, PUBLIC_CORS);
  }
  // The honeypot only stops naive bots -- it is a field anyone can read in our
  // own JS. This is the guard that actually protects D1's daily write quota,
  // so it sits immediately before the only public INSERT in the worker.
  if (!(await allowPublicWrite(request, 'msg'))) {
    return json(
      { error: "That's a lot of messages at once — give it a minute and try again." },
      429,
      PUBLIC_CORS,
    );
  }
  await env.DB.prepare('INSERT INTO messages (name, email, body) VALUES (?, ?, ?)')
    .bind(str(data.name, 200), str(data.email, 200), body)
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
}

/* ------------------------------------------------------------- signups --- */

// The email-for-updates box. This used to post to Formspree; it now lands in
// our own D1 table so the whole stack stays on Cloudflare. Duplicates are
// silently absorbed (UNIQUE + OR IGNORE) so a repeat subscriber just sees
// success again and the list stays clean.
async function receiveSignup(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  // Same honeypot idea as messages: the form ships a hidden "website" field
  // real visitors never see. Pretend success so bots don't learn they missed.
  if (str(data.website, 50)) return json({ ok: true }, 200, PUBLIC_CORS);
  const email = str(data.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email' }, 400, PUBLIC_CORS);
  }
  if (!(await allowPublicWrite(request, 'signup'))) {
    return json(
      { error: 'Too many signups at once — give it a minute and try again.' },
      429,
      PUBLIC_CORS,
    );
  }
  await env.DB.prepare('INSERT OR IGNORE INTO signups (email) VALUES (?)')
    .bind(email.toLowerCase())
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
}

/* -------------------------------------------------------- wizard claims --- */

// The Wizard ID page on madamstudio: a crew member clicks their credit card,
// enters their gmail, and the claim lands here as "pending". A founder then
// verifies or denies it in the Control Room's WIZARD IDS tab — the human
// review IS the verification, so nothing here trusts the typed email.
async function receiveClaim(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  if (str(data.website, 50)) return json({ ok: true }, 200, PUBLIC_CORS);
  const name = str(data.name, 200);
  if (!name) return json({ error: 'Pick your credit card first' }, 400, PUBLIC_CORS);
  const email = str(data.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email' }, 400, PUBLIC_CORS);
  }
  if (!(await allowPublicWrite(request, 'claim'))) {
    return json(
      { error: 'Too many claims at once — give it a minute and try again.' },
      429,
      PUBLIC_CORS,
    );
  }
  await env.DB.prepare('INSERT OR IGNORE INTO claims (credit_name, email) VALUES (?, ?)')
    .bind(name, email.toLowerCase())
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
}

// Names with at least one verified claim, so the crew page can show a badge.
// Emails deliberately never leave the admin endpoints.
async function verifiedClaims(env) {
  const rows = await env.DB.prepare(
    "SELECT DISTINCT credit_name FROM claims WHERE status = 'verified'",
  ).all();
  return json(
    { verified: rows.results.map((r) => r.credit_name) },
    200,
    { ...PUBLIC_CORS, 'Cache-Control': 'public, max-age=60' },
  );
}

/**
 * Throttle for the public write endpoints (messages, signups): at most one
 * write per IP per MESSAGE_MIN_SECONDS, counted separately per bucket.
 *
 * This is deliberately NOT Cloudflare's [[ratelimits]] binding. That binding
 * is present at runtime on this account but never enforces -- limit() was
 * observed returning {success:true} for 14 consecutive posts from one IP, so
 * it would have looked configured while allowing an unlimited flood.
 *
 * The edge cache is used as the counter because it costs nothing and, unlike
 * D1, writing to it does not consume the very quota this is protecting. It is
 * per-colo and races under exact simultaneity, so it is a flood guard rather
 * than an exact limiter -- enough to protect D1's daily write cap. A WAF rate
 * limiting rule is the stronger control if one is ever added.
 *
 * Fails OPEN: if the cache misbehaves, a real visitor can still send a message.
 */
const MESSAGE_MIN_SECONDS = 6;

async function allowPublicWrite(request, bucket) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  const key = new Request('https://ratelimit.invalid/' + bucket + '/' + encodeURIComponent(ip));
  try {
    const cache = caches.default;
    if (await cache.match(key)) return false;
    await cache.put(
      key,
      new Response('1', { headers: { 'Cache-Control': 'max-age=' + MESSAGE_MIN_SECONDS } }),
    );
    return true;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------ printful --- */

async function printfulProxy(env, apiPath) {
  if (!env.PRINTFUL_TOKEN) {
    return json(
      { error: 'Printful is not connected yet. Run: npx wrangler secret put PRINTFUL_TOKEN (from the api/ folder) with a token from https://developers.printful.com' },
      501,
    );
  }
  const res = await fetch('https://api.printful.com' + apiPath, {
    headers: { Authorization: 'Bearer ' + env.PRINTFUL_TOKEN },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    return json({ error: 'Printful returned a non-JSON response (HTTP ' + res.status + ')' }, 502);
  }
  if (!res.ok) {
    return json({ error: 'Printful: ' + (data?.error?.message || 'HTTP ' + res.status) }, res.status >= 500 ? 502 : res.status);
  }
  return json({ result: data.result ?? data, paging: data.paging }, 200, { 'Cache-Control': 'no-store' });
}

/* -------------------------------------------------------------- upload --- */

// No SVG: an uploaded SVG can carry scripts, and /img/* serves from the same
// origin as the admin panel — raster formats only keeps that door closed.
const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

async function handleUpload(request, env, origin) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return json({ error: 'Unsupported image type: ' + (type || 'none') }, 415);
  const length = Number(request.headers.get('Content-Length') || '0');
  if (length > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'Empty upload' }, 400);
  if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413);

  const given = (new URL(request.url).searchParams.get('name') || 'image')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 40) || 'image';
  const key = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '-' + given + '.' + ext;

  await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
  return json({ key, url: origin + '/img/' + key });
}

async function serveImage(env, key) {
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      ...PUBLIC_CORS,
    },
  });
}

/**
 * Drop the cached /api/content response so a SAVE shows up immediately rather
 * than after the 60s max-age. Both hostnames are purged because the panel can
 * be reached on either, and each is a separate cache key.
 */
async function purgeContentCache() {
  const cache = caches.default;
  const urls = [
    'https://wizardshit.store/api/content',
    'https://wizardshit-api.wizardshit-api.workers.dev/api/content',
  ];
  await Promise.all(urls.map((u) => cache.delete(new Request(u)).catch(() => {})));
}

/* -------------------------------------------------------------- router --- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...PUBLIC_CORS,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // ---- public ----
      if (method === 'GET' && path === '/api/content') {
        // Every page view calls this, so serve it from the edge cache where we
        // can. Cache-Control alone only helps a repeat visitor's own browser;
        // this shares one copy per colo, which keeps the D1 read count flat as
        // traffic grows instead of rising with it. SAVE & PUBLISH purges it.
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;

        const data = await readCollections(env, false);
        const res = json(data, 200, { ...PUBLIC_CORS, 'Cache-Control': 'public, max-age=60' });
        ctx.waitUntil(cache.put(request, res.clone()));
        return res;
      }
      if (method === 'GET' && path.startsWith('/img/')) {
        return serveImage(env, path.slice('/img/'.length));
      }
      if (method === 'POST' && path === '/api/messages') {
        return receiveMessage(request, env);
      }
      if (method === 'POST' && path === '/api/signup') {
        return receiveSignup(request, env);
      }
      if (method === 'POST' && path === '/api/claim') {
        return receiveClaim(request, env);
      }
      if (method === 'GET' && path === '/api/claims-public') {
        return verifiedClaims(env);
      }
      if (method === 'POST' && path === '/api/hit') {
        // pageview beacon, counted per UTC day. The label is caller-controlled,
        // so it is folded into a tiny fixed set: junk requests can nudge counts
        // but can never grow the table with garbage rows.
        const raw = (await request.text()).slice(0, 100);
        let p;
        if (raw === '/' || raw === '/index.html') p = '/';
        else if (raw.startsWith('/crew/')) p = '/crew';
        else if (raw === '/privacy.html') p = '/privacy';
        else p = '/other';
        const day = new Date().toISOString().slice(0, 10);
        await env.DB.prepare(
          'INSERT INTO page_hits (day, path, hits) VALUES (?, ?, 1) ON CONFLICT(day, path) DO UPDATE SET hits = hits + 1',
        ).bind(day, p).run();
        return json({ ok: true }, 200, PUBLIC_CORS);
      }
      if (method === 'GET' && path === '/api/login-config') {
        return json({ google_client_id: env.GOOGLE_CLIENT_ID || '' }, 200, { 'Cache-Control': 'public, max-age=300' });
      }
      if (method === 'POST' && path === '/api/glogin') {
        if (!env.GOOGLE_CLIENT_ID) return json({ error: 'Google sign-in is not configured' }, 501);
        let body;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Body must be JSON' }, 400);
        }
        const who = await verifyGoogleIdToken(String(body.credential || ''), env);
        if (!who) return json({ error: 'Google sign-in failed — try again' }, 401);
        if (!founderEmails(env).includes(who.email)) {
          return json({ error: who.email + ' is not on the founders list' }, 403);
        }
        return json({ ok: true, token: await makeSessionToken(who.email, env), email: who.email });
      }
      if (method === 'GET' && (path === '/' || path === '/admin/' || path === '/login/')) {
        return Response.redirect(url.origin + '/login', 302);
      }
      if (method === 'GET' && (path === '/admin' || path === '/login')) {
        return new Response(ADMIN_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }

      // ---- owner-only ----
      if (path === '/api/admin/login' || path.startsWith('/api/admin/')) {
        const auth = await checkAuth(request, env);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        if (method === 'POST' && path === '/api/admin/login') {
          return json({ ok: true, mode: auth.mode, email: auth.email });
        }
        if (method === 'GET' && path === '/api/admin/content') {
          const data = await readCollections(env, true);
          return json(data, 200, { 'Cache-Control': 'no-store' });
        }
        if (method === 'PUT' && path.startsWith('/api/admin/collection/')) {
          const name = path.slice('/api/admin/collection/'.length);
          if (!COLLECTIONS[name]) return json({ error: 'Unknown collection: ' + name }, 404);
          let items;
          try {
            items = await request.json();
          } catch {
            return json({ error: 'Body must be JSON' }, 400);
          }
          await replaceCollection(env, name, items);
          await purgeContentCache();
          return json({ ok: true, saved: items.length });
        }
        if (method === 'POST' && path === '/api/admin/upload') {
          return handleUpload(request, env, url.origin);
        }
        if (method === 'GET' && path === '/api/admin/messages') {
          const rows = await env.DB.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 500').all();
          return json({ messages: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          const m = path.match(/^\/api\/admin\/messages\/(\d+)(\/read)?$/);
          if (m && method === 'POST' && m[2]) {
            await env.DB.prepare('UPDATE messages SET read = 1 - read WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
          if (m && method === 'DELETE' && !m[2]) {
            await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/signups') {
          const rows = await env.DB.prepare('SELECT * FROM signups ORDER BY id DESC LIMIT 1000').all();
          return json({ signups: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          const m = path.match(/^\/api\/admin\/signups\/(\d+)$/);
          if (m && method === 'DELETE') {
            await env.DB.prepare('DELETE FROM signups WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/claims') {
          const rows = await env.DB.prepare('SELECT * FROM claims ORDER BY id DESC LIMIT 500').all();
          return json({ claims: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          const m = path.match(/^\/api\/admin\/claims\/(\d+)(?:\/(verify|deny))?$/);
          if (m && method === 'POST' && m[2]) {
            const status = m[2] === 'verify' ? 'verified' : 'denied';
            await env.DB.prepare('UPDATE claims SET status = ? WHERE id = ?').bind(status, Number(m[1])).run();
            return json({ ok: true });
          }
          if (m && method === 'DELETE' && !m[2]) {
            await env.DB.prepare('DELETE FROM claims WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/analytics') {
          const days = await env.DB.prepare(
            "SELECT day, SUM(hits) AS hits FROM page_hits WHERE day >= date('now', '-29 days') GROUP BY day ORDER BY day",
          ).all();
          const months = await env.DB.prepare(
            "SELECT substr(day, 1, 7) AS month, SUM(hits) AS hits FROM page_hits WHERE day >= date('now', '-365 days') GROUP BY month ORDER BY month",
          ).all();
          const totals = await env.DB.prepare('SELECT SUM(hits) AS all_time FROM page_hits').first();
          return json(
            { days: days.results, months: months.results, all_time: (totals && totals.all_time) || 0 },
            200,
            { 'Cache-Control': 'no-store' },
          );
        }
        if (method === 'GET' && path === '/api/admin/orders') {
          return printfulProxy(env, '/orders?limit=50');
        }
        if (method === 'GET' && path === '/api/admin/printful/products') {
          return printfulProxy(env, '/store/products?limit=100');
        }
      }

      return json({ error: 'Not found' }, 404, PUBLIC_CORS);
    } catch (e) {
      if (e instanceof BadInput) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: 'Server error: ' + e.message }, 500);
    }
  },
};
