/**
 * Wizard Shit backend — a single Cloudflare Worker.
 *
 * Public endpoints (called by the GitHub Pages site):
 *   GET /api/content     -> { merch, credits, donators, panels } (visible only)
 *   GET /img/<key>       -> images uploaded through the admin panel (R2)
 *   POST /api/messages   -> the site's message bubble drops mail in the inbox
 *   POST /api/signup     -> the email-for-updates box adds to the signup list
 *   POST /api/claim      -> a crew member claims their credit card identity
 *   GET /api/claims-public -> names with a verified claim (for the crew page)
 *   POST /api/upload-work  -> a creator uploads work from their page
 *   GET /api/portal/uploads -> crew-only: a creator's uploads (or crew feed)
 *   GET /api/portal/panels  -> crew-only: creator work panels
 *   POST /api/apply        -> apply to work on the show (admin-only to read)
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
 *   GET /api/admin/uploads            -> all work uploads, newest first
 *   POST /api/admin/uploads/<id>/seen|verified|paid -> set an upload's mark
 *   DELETE /api/admin/uploads/<id>    -> delete an upload (and its R2 image)
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
  // Square panels on the madamstudio creator pages. `creator` is the credit
  // card name the panel belongs to, or the literal word "shared" for the
  // recent-projects column that shows on every creator's page.
  panels: {
    table: 'panels',
    columns: ['creator', 'title', 'url', 'image', 'visible', 'sort'],
    clean(item, i) {
      const creator = str(item.creator, 200);
      const title = str(item.title, 300);
      const url = str(item.url, 1000);
      const image = str(item.image, 1000);
      if (!creator) throw new BadInput('panel ' + (i + 1) + ': creator is required (a credit card name, or "shared")');
      if (!title && !image) throw new BadInput('panel ' + (i + 1) + ' (' + creator + '): give it a title or an image');
      if (url && !/^https?:\/\//i.test(url)) throw new BadInput('panel "' + (title || creator) + '": link must start with http(s)://');
      return [creator, title, url, image, bool(item.visible), i];
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

// Public GETs return data that is public anyway, so they keep a wildcard.
const PUBLIC_CORS = { 'Access-Control-Allow-Origin': '*' };

// The state-changing public POSTs (signup, message, claim, apply, upload) are
// locked to the site's own origins so another website can't silently drive
// them from its visitors' browsers. ALLOWED_ORIGINS is a comma-separated list
// in wrangler.toml; if it is unset we fall back to the wildcard rather than
// break the site. (A non-browser client ignores CORS entirely — the real
// abuse guards are the throttles and caps, not this.)
function writeCors(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  if (!allowed.length) return { 'Access-Control-Allow-Origin': '*' };
  if (origin && allowed.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  }
  return { 'Access-Control-Allow-Origin': allowed[0], Vary: 'Origin' };
}

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

/* ------------------------------------------------------- member accounts --- */
/*
 * Anyone can make an account (username + password) and browse. To become a
 * creator, a logged-in member ties an email and claims their credit card; a
 * founder approves the claim in the Control Room and the account then has hub
 * access to that card. Founders (the admin panel) are a separate system above;
 * this is the public membership layer.
 */

const PBKDF2_ITERS = 100000; // tune down only if the Workers CPU limit bites

async function pbkdf2(password, salt, iters) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' }, km, 256);
  return new Uint8Array(bits);
}
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
  return 'pbkdf2$' + PBKDF2_ITERS + '$' + b64urlEncode(salt) + '$' + b64urlEncode(hash);
}
async function verifyPassword(password, stored) {
  const parts = (stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = Number(parts[1]);
  if (!Number.isInteger(iters) || iters < 1 || iters > 5000000) return false;
  let salt, expected;
  try {
    salt = b64urlDecode(parts[2]);
    expected = b64urlDecode(parts[3]);
  } catch {
    return false;
  }
  const actual = await pbkdf2(password, salt, iters);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

// Member session tokens are signed with a key derived from SESSION_SECRET (or
// ADMIN_PASSWORD as a fallback so no new secret is strictly required). Distinct
// namespace from the founder session key, so the two token families can never
// be confused for one another.
async function accountKey(env) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) throw new BadInput('Accounts are not configured (set SESSION_SECRET or ADMIN_PASSWORD)');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wiz-account-v1:' + secret));
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeAccountToken(id, username, env) {
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const payload = id + '|' + username + '|' + exp;
  const key = await accountKey(env);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return 'wizacct.' + b64urlEncode(new TextEncoder().encode(payload)) + '.' + b64urlEncode(sig);
}
async function verifyAccountToken(token, env) {
  const parts = (token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'wizacct') return null;
  let payload;
  try {
    payload = new TextDecoder().decode(b64urlDecode(parts[1]));
  } catch {
    return null;
  }
  const key = await accountKey(env);
  const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), new TextEncoder().encode(payload));
  if (!ok) return null;
  const [id, username, expStr] = payload.split('|');
  if (!id || Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return { id: Number(id), username };
}
// Returns { id, username } for a valid member token, else null.
async function checkAccount(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given.startsWith('wizacct.')) return null;
  try {
    return await verifyAccountToken(given, env);
  } catch {
    return null;
  }
}
// Does this account have a founder-approved claim on this creator card?
async function accountHasCreator(env, accountId, creatorName) {
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM claims WHERE account_id = ? AND credit_name = ? AND status = 'verified'",
  ).bind(accountId, creatorName).first();
  return !!row;
}
// The gate for the inner work portal: a valid member token AND at least one
// founder-approved claim. Verified crew see all crew work; everyone else —
// logged out or a plain fan — is refused, so the work can't be scraped from
// outside. Returns the account or null.
async function checkCrew(request, env) {
  const acct = await checkAccount(request, env);
  if (!acct) return null;
  const row = await env.DB.prepare(
    "SELECT 1 AS ok FROM claims WHERE account_id = ? AND status = 'verified' LIMIT 1",
  ).bind(acct.id).first();
  return row ? acct : null;
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
      console.error('Access verify failed:', e);
      return { ok: false, status: 503, error: 'Could not verify Access token' };
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
  const [merch, credits, donators, panels] = await Promise.all([
    env.DB.prepare('SELECT * FROM merch_items' + where + ' ORDER BY sort').all(),
    env.DB.prepare('SELECT * FROM credits' + where + ' ORDER BY sort').all(),
    env.DB.prepare('SELECT * FROM donators' + where + ' ORDER BY sort').all(),
    // Missing until upgrade-panels.sql has run — never let that take down
    // /api/content for the whole site.
    env.DB.prepare('SELECT * FROM panels' + where + ' ORDER BY sort').all().catch(() => ({ results: [] })),
  ]);
  return { merch: merch.results, credits: credits.results, donators: donators.results, panels: panels.results };
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
  // The claim must name a real credit card, so the WIZARD IDS queue can't be
  // flooded with made-up names. It still needs a founder to verify — the typed
  // email is never trusted — but this keeps the queue to actual crew cards.
  const known = await env.DB.prepare('SELECT 1 AS ok FROM credits WHERE name = ?').bind(name).first();
  if (!known) return json({ error: 'Pick your credit card first' }, 400, PUBLIC_CORS);
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

/* --------------------------------------------------- account endpoints --- */

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Gmail (and Google's alias domain) users are steered to Sign in with Google
// so they don't end up with both a password account and a Google account on
// the same address.
const ROLES = ['fan', 'applicant', 'crew'];
function accountInfo(id, username, email, role) {
  return { id, username, email: email || '', role: ROLES.includes(role) ? role : 'fan' };
}

async function accountSignup(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  const uname = str(data.username, 254).toLowerCase();
  const password = typeof data.password === 'string' ? data.password : '';
  const asEmail = EMAIL_RE.test(uname);
  // Username may be a handle OR an email address (Gmail included — anyone can
  // make a plain email + password account here).
  if (!asEmail && !USERNAME_RE.test(uname)) {
    return json({ error: 'Username: 3–32 letters, numbers, _ . - , or your email' }, 400, PUBLIC_CORS);
  }
  if (password.length < 8 || password.length > 200) {
    return json({ error: 'Password must be at least 8 characters' }, 400, PUBLIC_CORS);
  }
  if (!(await allowPublicWrite(request, 'acctnew'))) {
    return json({ error: 'Slow down a moment and try again.' }, 429, PUBLIC_CORS);
  }
  // Uniqueness across both username and email so one address = one account.
  const clash = asEmail
    ? await env.DB.prepare('SELECT 1 AS ok FROM accounts WHERE username = ? OR email = ?').bind(uname, uname).first()
    : await env.DB.prepare('SELECT 1 AS ok FROM accounts WHERE username = ?').bind(uname).first();
  if (clash) return json({ error: 'That username or email is already taken' }, 409, PUBLIC_CORS);
  const role = ROLES.includes(data.role) ? data.role : 'fan';
  const email = asEmail ? uname : ''; // an email username doubles as the tied email
  const pass = await hashPassword(password);
  const res = await env.DB.prepare('INSERT INTO accounts (username, pass_hash, role, email) VALUES (?, ?, ?, ?)')
    .bind(uname, pass, role, email).run();
  const id = res.meta && res.meta.last_row_id;
  return json({ ok: true, token: await makeAccountToken(id, uname, env), account: accountInfo(id, uname, email, role) }, 200, PUBLIC_CORS);
}

// Member Sign in with Google: verify the Google token, then resolve to the ONE
// account for that email — found by email, or by an email-as-username account,
// or created fresh. This is what keeps a Gmail user from having a duplicate
// password account, and connects them to whatever creator card was authorized
// for their email (claims are keyed to the account id this returns).
async function accountGoogleLogin(request, env) {
  if (!env.GOOGLE_CLIENT_ID) return json({ error: "Google sign-in isn't set up yet" }, 501, PUBLIC_CORS);
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  const who = await verifyGoogleIdToken(String(data.credential || ''), env);
  if (!who) return json({ error: 'Google sign-in failed — try again' }, 401, PUBLIC_CORS);
  const email = who.email; // already lowercased + verified by Google
  let row = await env.DB.prepare('SELECT id, username, email, role FROM accounts WHERE email = ?').bind(email).first();
  if (!row) {
    // Someone who signed up with this email as a username but never set the
    // email column: adopt it so the two identities are the same account.
    row = await env.DB.prepare('SELECT id, username, email, role FROM accounts WHERE username = ?').bind(email).first();
    if (row && !row.email) {
      await env.DB.prepare('UPDATE accounts SET email = ? WHERE id = ?').bind(email, row.id).run();
      row.email = email;
    }
  }
  if (!row) {
    const res = await env.DB.prepare('INSERT INTO accounts (username, pass_hash, role, email) VALUES (?, ?, ?, ?)')
      .bind(email, '', 'fan', email).run();
    row = { id: res.meta && res.meta.last_row_id, username: email, email, role: 'fan' };
  }
  return json(
    { ok: true, token: await makeAccountToken(row.id, row.username, env), account: accountInfo(row.id, row.username, row.email, row.role) },
    200,
    PUBLIC_CORS,
  );
}

async function accountLogin(request, env) {
  if ((await authFailCount(request, 'acct')) >= AUTH_FAIL_MAX) {
    return json({ error: 'Too many attempts — wait a few minutes.' }, 429, PUBLIC_CORS);
  }
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  const uname = str(data.username, 254).toLowerCase();
  const password = typeof data.password === 'string' ? data.password : '';
  // People can sign in with their username OR the email tied to their account
  // (any address, Gmail included). Only treat it as an email lookup when it
  // actually looks like one, so a plain username can't accidentally match an
  // email column.
  const row = uname.includes('@')
    ? await env.DB.prepare('SELECT id, username, pass_hash, email, role FROM accounts WHERE username = ? OR email = ?').bind(uname, uname).first()
    : await env.DB.prepare('SELECT id, username, pass_hash, email, role FROM accounts WHERE username = ?').bind(uname).first();
  const ok = row && (await verifyPassword(password, row.pass_hash));
  if (!ok) {
    await recordAuthFail(request, 'acct');
    return json({ error: 'Wrong username or password' }, 401, PUBLIC_CORS);
  }
  return json(
    { ok: true, token: await makeAccountToken(row.id, row.username, env), account: accountInfo(row.id, row.username, row.email, row.role) },
    200,
    PUBLIC_CORS,
  );
}

// Everything the logged-in member's account page needs: who they are, the
// email tied to the account, the creators they can access, and pending claims.
async function accountMe(env, acct) {
  const row = await env.DB.prepare('SELECT id, username, email, role FROM accounts WHERE id = ?').bind(acct.id).first();
  if (!row) return json({ error: 'Account not found' }, 404, PUBLIC_CORS);
  const claims = await env.DB.prepare('SELECT credit_name, status FROM claims WHERE account_id = ?').bind(acct.id).all();
  const verified = [];
  const pending = []; // anything not yet green (requested/red or staged/yellow), still in review
  for (const c of claims.results) {
    if (c.status === 'verified') verified.push(c.credit_name);
    else if (c.status === 'pending' || c.status === 'staged') pending.push(c.credit_name);
  }
  // Payments the creator can see: everything paid to a card they're verified on.
  let payments = [];
  let paidTotal = 0;
  if (verified.length) {
    const marks = verified.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      'SELECT creator, amount, note, created_at FROM payments WHERE creator IN (' + marks + ') ORDER BY id DESC LIMIT 200',
    ).bind(...verified).all();
    payments = rows.results;
    paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  return json(
    { account: accountInfo(row.id, row.username, row.email, row.role), creators: verified, pending, payments, paidTotal },
    200,
    PUBLIC_CORS,
  );
}

async function accountSetRole(request, env, acct) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  if (!ROLES.includes(data.role)) return json({ error: 'Unknown role' }, 400, PUBLIC_CORS);
  await env.DB.prepare('UPDATE accounts SET role = ? WHERE id = ?').bind(data.role, acct.id).run();
  return json({ ok: true, role: data.role }, 200, PUBLIC_CORS);
}

async function accountSetEmail(request, env, acct) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  const email = str(data.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return json({ error: 'Please enter a valid email' }, 400, PUBLIC_CORS);
  }
  // One address = one account: don't let two accounts tie the same email.
  const taken = await env.DB.prepare('SELECT 1 AS ok FROM accounts WHERE email = ? AND id <> ?').bind(email, acct.id).first();
  if (taken) return json({ error: 'That email is already on another account' }, 409, PUBLIC_CORS);
  await env.DB.prepare('UPDATE accounts SET email = ? WHERE id = ?').bind(email, acct.id).run();
  return json({ ok: true, email }, 200, PUBLIC_CORS);
}

// A logged-in member claims a credit card. Requires an email tied to the
// account (that email is what the founder checks against). Lands as a pending
// claim in the Control Room; approval grants this account hub access.
async function accountClaim(request, env, acct) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  const name = str(data.name, 200);
  if (!name) return json({ error: 'Pick your credit card' }, 400, PUBLIC_CORS);
  const known = await env.DB.prepare('SELECT 1 AS ok FROM credits WHERE name = ?').bind(name).first();
  if (!known) return json({ error: 'Pick your credit card' }, 400, PUBLIC_CORS);
  const me = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(acct.id).first();
  if (!me || !me.email) {
    return json({ error: 'Tie your email to your account first' }, 400, PUBLIC_CORS);
  }
  const dupe = await env.DB.prepare('SELECT status FROM claims WHERE account_id = ? AND credit_name = ?')
    .bind(acct.id, name).first();
  if (dupe) return json({ ok: true, status: dupe.status }, 200, PUBLIC_CORS);
  if (!(await allowPublicWrite(request, 'claim'))) {
    return json({ error: 'Give it a minute and try again.' }, 429, PUBLIC_CORS);
  }
  await env.DB.prepare('INSERT INTO claims (credit_name, email, account_id, status) VALUES (?, ?, ?, ?)')
    .bind(name, me.email, acct.id, 'pending')
    .run();
  return json({ ok: true, status: 'pending' }, 200, PUBLIC_CORS);
}

/* -------------------------------------------------------- applications --- */

// Apply-to-Wizard-Shit form on madamstudio: name, email, portfolio link,
// message. Applications are private — readable only through the admin
// endpoints, never exposed publicly, so applicants can't be doxed. Same
// honeypot + per-IP throttle as every other public write.
async function receiveApplication(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400, PUBLIC_CORS);
  }
  if (str(data.website, 50)) return json({ ok: true }, 200, PUBLIC_CORS);
  const email = str(data.email, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email' }, 400, PUBLIC_CORS);
  }
  const portfolio = str(data.portfolio, 1000);
  if (portfolio && !/^https?:\/\//i.test(portfolio)) {
    return json({ error: 'Portfolio link must start with http(s)://' }, 400, PUBLIC_CORS);
  }
  const message = str(data.message, 4000);
  if (!portfolio && !message) {
    return json({ error: 'Add a portfolio link or a message' }, 400, PUBLIC_CORS);
  }
  if (!(await allowPublicWrite(request, 'apply'))) {
    return json({ error: 'One application at a time — give it a minute.' }, 429, PUBLIC_CORS);
  }
  await env.DB.prepare('INSERT INTO applications (name, email, portfolio, message) VALUES (?, ?, ?, ?)')
    .bind(str(data.name, 200), email.toLowerCase(), portfolio, message)
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
}

/* --------------------------------------------------------- work uploads --- */

// The Upload button on a creator's hub: raw image body, creator + title in the
// query string. Identity is NOT the URL param — it's the logged-in account:
// the request must carry a valid member token AND that account must have a
// founder-approved (verified) claim on the creator it's uploading as. This is
// what makes uploads genuinely belong to the creator instead of anyone who can
// edit a URL. New uploads land "new"; founders move them to seen/verified/paid.
async function receiveWorkUpload(request, env, origin) {
  const url = new URL(request.url);
  const creator = str(url.searchParams.get('creator'), 200);
  const title = str(url.searchParams.get('title'), 300);
  if (!creator) return json({ error: 'Missing creator' }, 400, PUBLIC_CORS);

  const acct = await checkAccount(request, env);
  if (!acct) return json({ error: 'Sign in to upload' }, 401, PUBLIC_CORS);
  if (!(await accountHasCreator(env, acct.id, creator))) {
    return json({ error: 'Your account is not verified for this creator' }, 403, PUBLIC_CORS);
  }

  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return json({ error: 'Images only (png, jpg, gif, webp)' }, 415, PUBLIC_CORS);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'Empty upload' }, 400, PUBLIC_CORS);
  if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413, PUBLIC_CORS);
  const bad = checkImageBytes(body, type);
  if (bad) return json({ error: bad }, 415, PUBLIC_CORS);

  if (!(await allowPublicWrite(request, 'upwork'))) {
    return json({ error: 'One upload at a time — give it a minute.' }, 429, PUBLIC_CORS);
  }

  // Cap un-reviewed uploads per creator so the fail-open per-colo throttle
  // can't be turned into an R2 storage bomb: at most MAX_PENDING_UPLOADS files
  // can pile up before a founder has to clear them (mark or delete).
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM uploads WHERE creator = ? AND status = 'new'")
    .bind(creator)
    .first();
  if (pending && pending.n >= MAX_PENDING_UPLOADS) {
    return json({ error: 'Too many uploads waiting for review — hang tight.' }, 429, PUBLIC_CORS);
  }

  const key = 'upload-' + Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '.' + ext;
  await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
  await env.DB.prepare('INSERT INTO uploads (creator, title, image) VALUES (?, ?, ?)')
    .bind(creator, title, origin + '/img/' + key)
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
}

// A creator's uploads with their marks, for the middle of their page.
// Without a name: the latest uploads across the whole crew, so members can
// see what everyone is working on. Never includes anything but the credit
// name, title, image, mark, and date.
//
// Crew work portal feed. This is gated (checkCrew in the router), so it can
// show works-in-progress across the crew — verified members see each other's
// work. With a name: that creator's uploads; without: the whole crew's latest.
// no-store because it's private per-request, never cached at the edge.
async function portalUploads(env, name) {
  const who = str(name, 200);
  const rows = who
    ? await env.DB.prepare(
        'SELECT creator, title, image, status, created_at FROM uploads WHERE creator = ? ORDER BY id DESC LIMIT 100',
      ).bind(who).all()
    : await env.DB.prepare(
        'SELECT creator, title, image, status, created_at FROM uploads ORDER BY id DESC LIMIT 40',
      ).all();
  return json({ uploads: rows.results }, 200, { 'Cache-Control': 'no-store' });
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

/**
 * Brute-force guard for admin login. The password branch of checkAuth does a
 * constant-time compare with no attempt limit, and the endpoint + token format
 * are documented in this public repo, so without this an attacker could guess
 * unlimited passwords per second and, on success, read every applicant and
 * crew email. This caps failed attempts per IP over a rolling window using the
 * edge cache as the counter (same reason as allowPublicWrite: it doesn't burn
 * D1 quota). Only FAILURES are counted, so a legitimate owner is never locked
 * out by their own successful logins. Fails open on cache error — the point is
 * to defeat high-rate guessing, not to be a perfect limiter.
 */
const AUTH_FAIL_WINDOW = 600; // seconds a failure is remembered
const AUTH_FAIL_MAX = 10; // failures per window before we start refusing

function authFailKey(request, scope) {
  const ip = request.headers.get('CF-Connecting-IP') || 'noip';
  return new Request('https://ratelimit.invalid/authfail/' + (scope || 'admin') + '/' + encodeURIComponent(ip));
}
async function authFailCount(request, scope) {
  try {
    const hit = await caches.default.match(authFailKey(request, scope));
    return hit ? Number(await hit.text()) || 0 : 0;
  } catch {
    return 0;
  }
}
async function recordAuthFail(request, scope) {
  try {
    const n = (await authFailCount(request, scope)) + 1;
    await caches.default.put(
      authFailKey(request, scope),
      new Response(String(n), { headers: { 'Cache-Control': 'max-age=' + AUTH_FAIL_WINDOW } }),
    );
  } catch {
    /* fail open */
  }
}

/**
 * Hard cap on how many un-reviewed uploads one creator can accumulate, so the
 * per-IP throttle (which is per-colo and fails open) can't be sidestepped into
 * an R2 storage bomb. Once a founder marks an upload seen/verified/paid it no
 * longer counts, so this only ever blocks an unreviewed backlog.
 */
const MAX_PENDING_UPLOADS = 25;

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

// Room for a big art scan or a high-MP phone photo, but tight enough that a
// pixel bomb (tiny file, colossal decoded image) is refused before it can
// blow up a viewer's browser: a flat-color 8000px image is a few KB on disk
// yet decodes to hundreds of MB of RGBA, so the pixel budget — not the byte
// size — is the real guard here.
const MAX_IMAGE_DIM = 8000;
const MAX_IMAGE_PIXELS = 25 * 1000 * 1000;

function be32(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}

/**
 * Returns null when the bytes are genuinely the declared image format with
 * sane dimensions, else a short error string. The Content-Type header is
 * caller-controlled, so this is what actually keeps a renamed executable,
 * an HTML file, or a decompression bomb out of the bucket: magic numbers
 * first, then the pixel size straight from the format's own header.
 */
function checkImageBytes(buf, type) {
  const b = new Uint8Array(buf);
  let dims = null;
  if (type === 'image/png') {
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return 'Not a real PNG';
    dims = [be32(b, 16), be32(b, 20)];
  } else if (type === 'image/jpeg') {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return 'Not a real JPEG';
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const t = b[i + 1];
      if (t === 0xff || t === 0x01 || t === 0xd8 || (t >= 0xd0 && t <= 0xd9)) { i += t === 0xff ? 1 : 2; continue; }
      if (t >= 0xc0 && t <= 0xcf && t !== 0xc4 && t !== 0xc8 && t !== 0xcc) {
        dims = [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
        break;
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    if (!dims) return 'Could not read JPEG size';
  } else if (type === 'image/gif') {
    if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return 'Not a real GIF';
    dims = [b[6] | (b[7] << 8), b[8] | (b[9] << 8)];
  } else if (type === 'image/webp') {
    if (b.length < 30 || b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46 ||
        b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return 'Not a real WebP';
    const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (fourcc === 'VP8X') {
      dims = [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    } else if (fourcc === 'VP8 ') {
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return 'Could not read WebP size';
      dims = [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
    } else if (fourcc === 'VP8L') {
      if (b[20] !== 0x2f) return 'Could not read WebP size';
      const n = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      dims = [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)];
    } else return 'Could not read WebP size';
  } else return 'Unsupported image type';
  const w = dims[0], h = dims[1];
  if (!(w > 0 && h > 0)) return 'Broken image';
  if (w > MAX_IMAGE_DIM || h > MAX_IMAGE_DIM || w * h > MAX_IMAGE_PIXELS) return 'Image dimensions too large';
  return null;
}

async function handleUpload(request, env, origin) {
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return json({ error: 'Unsupported image type: ' + (type || 'none') }, 415);
  const length = Number(request.headers.get('Content-Length') || '0');
  if (length > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'Empty upload' }, 400);
  if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413);
  const bad = checkImageBytes(body, type);
  if (bad) return json({ error: bad }, 415);

  const given = (new URL(request.url).searchParams.get('name') || 'image')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .slice(0, 40) || 'image';
  const key = Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '-' + given + '.' + ext;

  await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
  return json({ key, url: origin + '/img/' + key });
}

// Founder places work directly into a creator's feed from the Control Room.
// Same image safety as every upload, but it lands already "verified" (a
// founder put it there) so it's live in that creator's portal immediately —
// this is how the three of you fill a creator's page before they ever log in.
async function founderUploadFor(request, env, origin) {
  const url = new URL(request.url);
  const creator = str(url.searchParams.get('creator'), 200);
  const title = str(url.searchParams.get('title'), 300);
  if (!creator) return json({ error: 'Pick a creator' }, 400);
  const known = await env.DB.prepare('SELECT 1 AS ok FROM credits WHERE name = ?').bind(creator).first();
  if (!known) return json({ error: 'Unknown creator' }, 400);
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return json({ error: 'Images only (png, jpg, gif, webp)' }, 415);
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: 'Empty upload' }, 400);
  if (body.byteLength > MAX_UPLOAD_BYTES) return json({ error: 'Image too large (8MB max)' }, 413);
  const bad = checkImageBytes(body, type);
  if (bad) return json({ error: bad }, 415);
  const key = 'upload-' + Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8) + '.' + ext;
  await env.IMAGES.put(key, body, { httpMetadata: { contentType: type } });
  await env.DB.prepare("INSERT INTO uploads (creator, title, image, status) VALUES (?, ?, ?, 'verified')")
    .bind(creator, title, origin + '/img/' + key)
    .run();
  return json({ ok: true, url: origin + '/img/' + key });
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

async function route(request, env, ctx, url, path, method) {
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
        // Panels are creator WORK — they live behind the crew portal, not in
        // the public feed. Merch/credits/donators stay public (the storefront
        // and the public crew directory need names/roles/photos).
        delete data.panels;
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
      // ---- member accounts ----
      if (method === 'POST' && path === '/api/account/signup') {
        return accountSignup(request, env);
      }
      if (method === 'POST' && path === '/api/account/login') {
        return accountLogin(request, env);
      }
      if (method === 'POST' && path === '/api/account/glogin') {
        return accountGoogleLogin(request, env);
      }
      if (path === '/api/account/me' || path === '/api/account/email' || path === '/api/account/claim' || path === '/api/account/role') {
        const acct = await checkAccount(request, env);
        if (!acct) return json({ error: 'Sign in first' }, 401, PUBLIC_CORS);
        if (method === 'GET' && path === '/api/account/me') return accountMe(env, acct);
        if (method === 'POST' && path === '/api/account/email') return accountSetEmail(request, env, acct);
        if (method === 'POST' && path === '/api/account/claim') return accountClaim(request, env, acct);
        if (method === 'POST' && path === '/api/account/role') return accountSetRole(request, env, acct);
      }
      if (method === 'GET' && path === '/api/claims-public') {
        return verifiedClaims(env);
      }
      if (method === 'POST' && path === '/api/apply') {
        return receiveApplication(request, env);
      }
      if (method === 'POST' && path === '/api/upload-work') {
        return receiveWorkUpload(request, env, url.origin);
      }
      // ---- crew work portal (verified crew only) ----
      if (method === 'GET' && (path === '/api/portal/uploads' || path === '/api/portal/panels')) {
        const crew = await checkCrew(request, env);
        if (!crew) return json({ error: 'Crew only — sign in with a verified account.' }, 403, PUBLIC_CORS);
        if (path === '/api/portal/uploads') {
          return portalUploads(env, url.searchParams.get('name') || '');
        }
        const data = await readCollections(env, false);
        return json({ panels: data.panels }, 200, { 'Cache-Control': 'no-store' });
      }
      if (method === 'POST' && path === '/api/hit') {
        // pageview beacon, counted per UTC day. The label is caller-controlled,
        // so it is folded into a tiny fixed set: junk requests can nudge counts
        // but can never grow the table with garbage rows. Throttled per IP like
        // every other write — without this one guard a single client could loop
        // this endpoint and exhaust the day's D1 write quota, taking every other
        // write (signups, claims, uploads, admin edits) offline.
        if (!(await allowPublicWrite(request, 'hit'))) return json({ ok: true }, 200, PUBLIC_CORS);
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
        if ((await authFailCount(request)) >= AUTH_FAIL_MAX) {
          return json({ error: 'Too many attempts — wait a few minutes and try again.' }, 429);
        }
        const auth = await checkAuth(request, env);
        if (!auth.ok) {
          // Count only real credential rejections, so brute force is throttled
          // but a legitimate owner is never locked out by their own logins.
          if (auth.status === 401) await recordAuthFail(request);
          return json({ error: auth.error }, auth.status);
        }

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
        if (method === 'POST' && path === '/api/admin/upload-for') {
          return founderUploadFor(request, env, url.origin);
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
        if (method === 'GET' && path === '/api/admin/applications') {
          const rows = await env.DB.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT 500').all();
          return json({ applications: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          const m = path.match(/^\/api\/admin\/applications\/(\d+)(\/read)?$/);
          if (m && method === 'POST' && m[2]) {
            await env.DB.prepare('UPDATE applications SET read = 1 - read WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
          if (m && method === 'DELETE' && !m[2]) {
            await env.DB.prepare('DELETE FROM applications WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/uploads') {
          // Capped low: the tab renders every row's image as a thumbnail, so a
          // huge page would decode a lot of pixels in the owner's browser.
          const rows = await env.DB.prepare('SELECT * FROM uploads ORDER BY id DESC LIMIT 100').all();
          return json({ uploads: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          const m = path.match(/^\/api\/admin\/uploads\/(\d+)(?:\/(seen|verified|paid))?$/);
          if (m && method === 'POST' && m[2]) {
            await env.DB.prepare('UPDATE uploads SET status = ? WHERE id = ?').bind(m[2], Number(m[1])).run();
            return json({ ok: true });
          }
          if (m && method === 'DELETE' && !m[2]) {
            const row = await env.DB.prepare('SELECT image FROM uploads WHERE id = ?').bind(Number(m[1])).first();
            if (row && row.image) {
              const key = row.image.split('/img/').pop();
              if (key) await env.IMAGES.delete(key).catch(() => {});
            }
            await env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/claims') {
          // Join the account so a founder can see the username behind a claim
          // when deciding whether to verify it.
          const rows = await env.DB.prepare(
            'SELECT c.*, a.username AS account_username FROM claims c LEFT JOIN accounts a ON a.id = c.account_id ORDER BY c.id DESC LIMIT 500',
          ).all();
          return json({ claims: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        {
          // Verify board lights: pending(red) -> staged(yellow) -> verified(green).
          // Only verified/green grants creator-hub access (see accountHasCreator).
          // 'deny' parks it; 'stage' is also how you switch a green one back off.
          const m = path.match(/^\/api\/admin\/claims\/(\d+)(?:\/(stage|verify|deny))?$/);
          if (m && method === 'POST' && m[2]) {
            const status = { stage: 'staged', verify: 'verified', deny: 'denied' }[m[2]];
            await env.DB.prepare('UPDATE claims SET status = ? WHERE id = ?').bind(status, Number(m[1])).run();
            return json({ ok: true });
          }
          if (m && method === 'DELETE' && !m[2]) {
            await env.DB.prepare('DELETE FROM claims WHERE id = ?').bind(Number(m[1])).run();
            return json({ ok: true });
          }
        }
        if (method === 'GET' && path === '/api/admin/payments') {
          const rows = await env.DB.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 500').all();
          return json({ payments: rows.results }, 200, { 'Cache-Control': 'no-store' });
        }
        if (method === 'POST' && path === '/api/admin/payments') {
          let body;
          try {
            body = await request.json();
          } catch {
            return json({ error: 'Body must be JSON' }, 400);
          }
          const creator = str(body.creator, 200);
          const amount = Number(body.amount);
          const note = str(body.note, 500);
          if (!creator) return json({ error: 'Pick a creator' }, 400);
          const known = await env.DB.prepare('SELECT 1 AS ok FROM credits WHERE name = ?').bind(creator).first();
          if (!known) return json({ error: 'Unknown creator' }, 400);
          if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
            return json({ error: 'Enter a valid amount' }, 400);
          }
          await env.DB.prepare('INSERT INTO payments (creator, amount, note) VALUES (?, ?, ?)')
            .bind(creator, Math.round(amount * 100) / 100, note)
            .run();
          return json({ ok: true });
        }
        {
          const m = path.match(/^\/api\/admin\/payments\/(\d+)$/);
          if (m && method === 'DELETE') {
            await env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(Number(m[1])).run();
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
      // Log the real error server-side; return a generic message so raw
      // exception text (SQL fragments, binding names) never reaches a caller.
      console.error(e);
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      // These POSTs all send a non-simple Content-Type (application/json or
      // image/*), so the browser always preflights here first. Restricting the
      // preflight origin to the site's own origins is what actually stops a
      // third-party page from driving the write endpoints via a visitor's
      // browser — the actual POST never fires if this preflight refuses it.
      // DELETE is allowed too: the Madam Studio console removes claims,
      // payments and uploads cross-origin.
      return new Response(null, {
        status: 204,
        headers: {
          ...writeCors(request, env),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const resp = await route(request, env, ctx, url, path, method);
    // The Madam Studio admin console is hosted on a different origin
    // (madamwizzy.com) but calls these same owner-only + login endpoints, so
    // their responses must carry an Access-Control-Allow-Origin the browser
    // will accept. They remain auth-gated — CORS only lets the trusted studio
    // origin read the reply. Public GETs keep their own wildcard CORS.
    if (
      path === '/api/login-config' ||
      path === '/api/glogin' ||
      path === '/api/admin/login' ||
      path.startsWith('/api/admin/')
    ) {
      const ac = writeCors(request, env);
      const out = new Response(resp.body, resp);
      for (const k in ac) out.headers.set(k, ac[k]);
      return out;
    }
    return resp;
  },
};
