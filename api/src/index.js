/**
 * Wizard Shit backend — a single Cloudflare Worker.
 *
 * Public endpoints (called by the GitHub Pages site):
 *   GET /api/content     -> { merch, credits, donators } (visible items only)
 *   GET /img/<key>       -> images uploaded through the admin panel (R2)
 *   POST /api/messages   -> the site's message bubble drops mail in the inbox
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
  await env.DB.prepare('INSERT INTO messages (name, email, body) VALUES (?, ?, ?)')
    .bind(str(data.name, 200), str(data.email, 200), body)
    .run();
  return json({ ok: true }, 200, PUBLIC_CORS);
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

const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
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
