/**
 * The wizardshit.store shop and donations — cart, checkout, and the money path.
 *
 * Buying used to bounce out to Printful's hosted store. Now it happens here:
 * the page shows Printful's products with their colours and sizes, the
 * browser keeps a cart, and this module takes it from there. The rules are
 * the same ones the DNR Customs storefront lives by:
 *
 *   - The client never sends a price. It sends variant ids and quantities;
 *     every number the customer is charged is looked up here, from Printful.
 *   - The Printful order is created as an UNCONFIRMED DRAFT. A draft is never
 *     printed and never billed. Only a verified Stripe event promotes it.
 *   - Confirm-on-payout (CONFIRM_ON_PAYOUT=true, the default): a paid order
 *     stays a draft until Stripe has actually paid that money out to the bank.
 *     Printful bills for printing the moment an order confirms, so this is
 *     what stops the studio ever fronting a print run out of its own pocket.
 *   - Every order and every donation is a row in D1, so the console can show
 *     who bought what, whether it is paid, whether it is printed, and whether
 *     the money has reached the bank.
 *
 * Money is integer minor units (cents) everywhere. Printful sends prices as
 * decimal strings ("29.50"); they are parsed into cents at the boundary and
 * stay integers until rendered. Floating-point money is how a shop ends up
 * charging $29.509999.
 *
 * Secrets (npx wrangler secret put …): PRINTFUL_TOKEN, STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET. Vars (wrangler.toml): CONFIRM_ON_PAYOUT, SITE_URL,
 * PRINTFUL_STORE_ID (only for an account-level token), STRIPE_TAX (set to
 * "true" once a tax registration exists in Stripe), STRIPE_PUBLISHABLE_KEY
 * (the public pk_… key; with it the storefront mounts Stripe's checkout on its
 * own cart screen instead of sending customers to a Stripe page).
 */

/* --------------------------------------------------------------- basics --- */

export class ShopError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function str(v, max) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every order is capped at this many units across all lines. Not a float
 *  guard — confirm-on-payout removes that — but a sanity ceiling: a
 *  fat-fingered 999 is an order the shop would then have to honour. */
export const MAX_UNITS_PER_ORDER = 25;
const MAX_LINES = 12;

/** Donations: a dollar to ten thousand. Below a dollar the card fee eats it. */
export const MIN_DONATION = 100;
export const MAX_DONATION = 1000000;

export function shopEnabled(env) {
  return !!(cleanSecret(env.PRINTFUL_TOKEN) && cleanSecret(env.STRIPE_SECRET_KEY));
}
export function donateEnabled(env) {
  return !!cleanSecret(env.STRIPE_SECRET_KEY);
}
/** True on test keys, where no real money moves. Printful has no test mode —
 *  its API always prints and always bills — so test payments never confirm. */
export function stripeTestMode(env) {
  // Secret keys are sk_…, restricted keys rk_…; either can be a test key.
  // Read the CLEANED value: cleanSecret() is what authenticates the request,
  // so a key pasted as "sk_test_…" (quotes and all) talks to the test account
  // while a raw test here would read false and confirm a real print job.
  return /^(sk|rk)_test_/.test(cleanSecret(env.STRIPE_SECRET_KEY));
}
/** Confirm on payout unless explicitly switched off. */
export function confirmOnPayout(env) {
  return String(env.CONFIRM_ON_PAYOUT ?? 'true').trim() !== 'false';
}
function siteUrl(env) {
  return String(env.SITE_URL || 'https://wizardshit.store').replace(/\/+$/, '');
}

/* ---------------------------------------------------------------- money --- */

/** "29.50" -> 2950, without ever touching a float. */
// Currencies Stripe counts in whole units, with no hundredths. Everything else
// is held in minor units (cents); these are held in their whole unit — which is
// exactly what Stripe expects as unit_amount for them, so a ¥2,950 tee is 2950,
// never 295000. Deliberately NOT here: UGX and ISK, which Stripe still wants
// scaled by 100 for backwards compatibility, and HUF/TWD, which it charges in
// hundredths. (Stripe's own list; Printful today only prices in AUD, CAD, EUR,
// GBP and USD, all ordinary two-decimal currencies.)
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
// Currencies Stripe counts in thousandths. Nothing here handles them, and a
// mishandled one would charge a tenth of the price — so they are refused.
const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
export function minorUnits(currency) {
  return ZERO_DECIMAL.has(String(currency || 'USD').toUpperCase()) ? 1 : 100;
}

// Currencies Stripe charges in hundredths but cannot split below the unit: the
// amount must end in 00. A fractional price in one of these is unchargeable.
const WHOLE_UNITS_ONLY = new Set(['ISK', 'UGX', 'HUF', 'TWD']);

export function parseMoney(text, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  if (THREE_DECIMAL.has(code)) throw new ShopError('Unsupported currency from Printful: ' + code, 502);
  const s = String(text ?? '').trim();
  const m = s.match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/);
  // Twelve integer digits keeps every product exact in a JS number (well
  // below 2^53), and no real price comes anywhere near it.
  if (!m || m[2].length > 12) throw new ShopError('Unreadable price from Printful: ' + JSON.stringify(text), 502);
  const whole = Number(m[2]);
  const hundredths = Number((m[3] || '').padEnd(2, '0'));
  // A currency that cannot carry a fraction below the unit must not be given
  // one: refuse, rather than silently round to a price Printful never quoted
  // or hand Stripe an amount it will reject after the draft already exists.
  if (hundredths !== 0 && (minorUnits(code) === 1 || WHOLE_UNITS_ONLY.has(code))) {
    throw new ShopError('Unreadable price from Printful: ' + JSON.stringify(text) + ' ' + code, 502);
  }
  const units = minorUnits(code) === 1 ? whole : whole * 100 + hundredths;
  return m[1] ? -units : units;
}

export function formatMoney(amount, currency = 'USD') {
  const code = String(currency || 'USD').toUpperCase();
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const symbol = code === 'USD' ? '$' : code + ' ';
  if (minorUnits(code) === 1) return sign + symbol + abs.toLocaleString('en-US');
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return sign + symbol + whole.toLocaleString('en-US') + '.' + frac;
}

/* ------------------------------------------------------------- printful --- */

export class PrintfulError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
  get retryable() {
    return this.status === 429 || this.status >= 500;
  }
}

/**
 * A secret exactly as the upstream expects it, however it was pasted in. A
 * Windows pipe adds a line break; cmd's echo keeps its quotes; a copy from a
 * web page can carry zero-width characters. All of those make Stripe say
 * "Invalid API Key provided: rk_live_…????" — the ???? being those bytes.
 */
export function cleanSecret(raw) {
  let s = String(raw ?? '');
  // Every kind of whitespace, control and zero-width character, anywhere.
  s = s.replace(/[\s\u0000-\u001f\u007f\u0080-\u00a0\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, '');
  // Quotes a shell kept around the value.
  s = s.replace(/^["'`]+|["'`]+$/g, '');
  return s;
}

async function printful(env, path, opts = {}) {
  if (!env.PRINTFUL_TOKEN) throw new ShopError('The shop is not connected to Printful yet.', 503);
  const headers = { Authorization: 'Bearer ' + cleanSecret(env.PRINTFUL_TOKEN) };
  if (env.PRINTFUL_STORE_ID) headers['X-PF-Store-Id'] = String(env.PRINTFUL_STORE_ID);
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('https://api.printful.com' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(20000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through with data = null
  }
  if (!res.ok) {
    const raw = data && (data.error?.message || data.result);
    const msg = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : 'HTTP ' + res.status;
    throw new PrintfulError('Printful: ' + msg, res.status);
  }
  return data && data.result !== undefined ? data.result : data;
}

/**
 * Printful names variants "<Product> - <Colour> / <Size>", or with just one of
 * the two. That suffix is the only place the colour and size live without a
 * second round of catalog calls, so it is parsed here into the two pickers
 * the page shows. A lone part that looks like a size is a size; otherwise it
 * is treated as a colour.
 */
// A measurement: 3, 5.5, 3″, 4", 12 in, 30cm, 15oz — and a pair of them
// joined by x or × is a size too (stickers: 3″×3″, 5.5″×5.5″; posters: 18×24).
const DIM = '\\d+(?:\\.\\d+)?\\s?(?:in|cm|mm|oz|″|′|"|\')?';
const SIZE_RE = new RegExp('^(?:xxs|xs|s|m|l|xl|\\dxl|xxl|xxxl|one size|os|' + DIM + '(?:\\s?[x×]\\s?' + DIM + ')?)$', 'i');

export function parseVariantName(productName, variantName) {
  let rest = String(variantName || '');
  const prefix = String(productName || '');
  if (prefix && rest.startsWith(prefix)) rest = rest.slice(prefix.length);
  rest = rest.replace(/^\s*-\s*/, '').trim();
  if (!rest) return { color: '', size: '' };
  const parts = rest.split('/').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { color: parts[0], size: parts.slice(1).join(' / ') };
  return SIZE_RE.test(parts[0]) ? { color: '', size: parts[0] } : { color: parts[0], size: '' };
}

function publicImage(url) {
  const u = String(url || '');
  return /^https:\/\//i.test(u) && u.length <= 2048 ? u : '';
}

/** One Printful sync product with its buyable variants, prices in cents. */
async function productDetail(env, printfulId) {
  const r = await printful(env, '/store/products/' + encodeURIComponent(printfulId));
  const sp = r.sync_product || {};
  const variants = (r.sync_variants || [])
    .filter((v) => !v.is_ignored)
    .map((v) => {
      // Printful also reports the two axes as fields on the sync variant; when
      // it does, they beat the name (a sticker's "3″×3″" is a size, whatever
      // the name looks like). Older payloads carry neither, and the name is
      // parsed as before.
      // Each axis takes Printful's field when it has one and the name
      // otherwise — a beanie can come back as size "One size" with its colour
      // only in the name. A name part already used as the other axis is not
      // reused (a sticker's "3″×3″" is its size, never also a colour).
      const parsed = parseVariantName(sp.name, v.name);
      const apiColor = typeof v.color === 'string' ? v.color.trim() : '';
      const apiSize = typeof v.size === 'string' ? v.size.trim() : '';
      const color = apiColor || (parsed.color !== apiSize ? parsed.color : '');
      const size = apiSize || (parsed.size !== apiColor ? parsed.size : '');
      // The picture for this colour: Printful's mockup of the design on it
      // when one exists, else Printful's catalog photo of the blank garment in
      // that colour, else the product's own thumbnail. The page swaps the
      // card's image to this whenever a colour is picked.
      const preview = (v.files || []).find((f) => f.type === 'preview' && f.preview_url);
      const catalogPhoto = v.product && v.product.image;
      return {
        id: v.id,
        catalog_id: v.variant_id,
        name: v.name,
        color,
        size,
        price: parseMoney(v.retail_price, v.currency),
        currency: String(v.currency || 'USD').toUpperCase(),
        image: publicImage(preview && preview.preview_url) || publicImage(catalogPhoto) || publicImage(sp.thumbnail_url),
        available: !v.availability_status || v.availability_status === 'active',
        status: v.availability_status || 'active',
      };
    });
  return { id: sp.id, name: sp.name, thumbnail: publicImage(sp.thumbnail_url), variants };
}

/* -------------------------------------------------------------- catalog --- */

const CATALOG_CACHE_KEY = 'https://wizardshit.store/api/shop/products';

/**
 * The merch grid, joined to Printful. The owner curates the list (order,
 * picture, sticker style) in the console; each item points at a Printful
 * product by id, and Printful supplies the colours, sizes, and prices. Items
 * with no Printful id keep their link and stay a link on the page.
 */
/**
 * Several Printful products, a few at a time. Printful rate-limits per token,
 * and an un-batched fan-out on one request is enough to trip it — which then
 * empties the catalog for everyone. `onError` makes a product optional (the
 * grid); without it a failure throws (the order path, which must never quietly
 * mis-price a cart).
 */
async function productDetails(env, ids, onError) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 4) {
    await Promise.all(
      ids.slice(i, i + 4).map(async (id) => {
        try {
          out.set(id, await productDetail(env, id));
        } catch (e) {
          if (!onError) throw e;
          onError(id, e);
        }
      }),
    );
  }
  return out;
}

async function buildCatalog(env) {
  const rows = await env.DB.prepare(
    'SELECT id, title, url, image, sticker, row_break, printful_id FROM merch_items WHERE visible = 1 ORDER BY sort',
  ).all();
  const items = rows.results || [];
  const ids = [...new Set(items.map((i) => i.printful_id).filter(Boolean))];
  let missing = 0;
  const details = await productDetails(env, ids, (id, e) => {
    // One product Printful cannot serve right now should not blank the whole
    // grid; that card falls back to its link. But the result is incomplete,
    // and handleProducts must not cache it for long.
    missing++;
    console.error('catalog: product ' + id + ':', e.message);
  });
  const products = items.map((item) => {
    const d = item.printful_id ? details.get(item.printful_id) : null;
    const variants = d ? d.variants.filter((v) => v.available) : [];
    const colors = [...new Set(variants.map((v) => v.color).filter(Boolean))];
    const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
    const prices = variants.map((v) => v.price);
    return {
      id: item.id,
      printful_id: d ? d.id : null,
      title: item.title,
      url: item.url,
      image: item.image,
      sticker: !!item.sticker,
      row_break: !!item.row_break,
      currency: variants[0] ? variants[0].currency : 'USD',
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
      colors,
      sizes,
      variants: variants.map((v) => ({
        id: v.id,
        color: v.color,
        size: v.size,
        price: v.price,
        image: v.image,
      })),
    };
  });
  return { products, degraded: missing > 0 };
}

/** How long a good grid is held, and how long a broken one is. */
const CATALOG_TTL = 120;
const DEGRADED_TTL = 15;

export async function handleProducts(env, ctx, request) {
  const cors = { 'Access-Control-Allow-Origin': '*' };
  const status = { shop: shopEnabled(env), donate: donateEnabled(env), mode: confirmOnPayout(env) ? 'payout' : 'payment', tax: taxEnabled(env), stripe_pk: publishableKey(env) };
  if (!status.shop) return json({ ...status, products: [] }, 200, { ...cors, 'Cache-Control': 'public, max-age=' + CATALOG_TTL });

  const cache = caches.default;
  const key = new Request(CATALOG_CACHE_KEY);
  const hit = await cache.match(key);
  if (hit) return hit;

  const { products, degraded } = await buildCatalog(env);
  // A grid Printful could not fill has empty variants, and the page turns every
  // such card back into a plain Printful link. Holding that for two minutes
  // turns a rate-limit blip into a shop-wide outage — so a degraded grid is
  // cached only briefly. Still cached, though: rebuilding it on every request
  // would hammer the very limit that caused it.
  const maxAge = degraded ? DEGRADED_TTL : CATALOG_TTL;
  if (degraded) console.warn('catalog served degraded; holding it for ' + maxAge + 's only.');
  const res = json({ ...status, products }, 200, { ...cors, 'Cache-Control': 'public, max-age=' + maxAge });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export async function purgeCatalogCache() {
  await caches.default.delete(new Request(CATALOG_CACHE_KEY)).catch(() => {});
}

/* ------------------------------------------------------------ checkout --- */

function cleanRecipient(input) {
  const r = input && typeof input === 'object' ? input : {};
  const out = {
    name: str(r.name, 100),
    address1: str(r.address1, 200),
    address2: str(r.address2, 200),
    city: str(r.city, 100),
    state_code: str(r.state_code, 20).toUpperCase(),
    country_code: str(r.country_code, 2).toUpperCase(),
    zip: str(r.zip, 20),
    email: str(r.email, 200).toLowerCase(),
    phone: str(r.phone, 40),
  };
  if (!out.name) throw new ShopError('Enter the name the parcel is for.');
  if (!out.address1) throw new ShopError('Enter a street address.');
  if (!out.city) throw new ShopError('Enter a city.');
  if (!/^[A-Z]{2}$/.test(out.country_code)) throw new ShopError('Pick a country.');
  if ((out.country_code === 'US' || out.country_code === 'CA') && !out.state_code) {
    throw new ShopError('Enter a state or province.');
  }
  if (!out.zip) throw new ShopError('Enter a postal code.');
  if (!EMAIL_RE.test(out.email)) throw new ShopError('Enter a valid email for the receipt.');
  return out;
}

function cleanItems(input) {
  if (!Array.isArray(input) || !input.length) throw new ShopError('Your cart is empty.');
  if (input.length > MAX_LINES) throw new ShopError('Too many different items in one order.');
  const items = input.map((it) => {
    const product_id = Number(it && it.product_id);
    const variant_id = Number(it && it.variant_id);
    const quantity = Number(it && it.quantity);
    if (!Number.isInteger(product_id) || product_id <= 0) throw new ShopError('A cart line is missing its product.');
    if (!Number.isInteger(variant_id) || variant_id <= 0) throw new ShopError('A cart line is missing its size or colour.');
    if (!Number.isInteger(quantity) || quantity < 1) throw new ShopError('Quantities must be at least 1.');
    return { product_id, variant_id, quantity };
  });
  const units = items.reduce((n, it) => n + it.quantity, 0);
  if (units > MAX_UNITS_PER_ORDER) {
    throw new ShopError('Orders are limited to ' + MAX_UNITS_PER_ORDER + ' items. For more, email us.');
  }
  return items;
}

/**
 * Re-prices a cart from Printful, live. Returns one line per cart entry with
 * the price Printful reports today, the catalog variant id shipping is quoted
 * on, and a name a human can read on the payment page.
 */
async function priceLines(env, items) {
  const ids = [...new Set(items.map((i) => i.product_id))];
  // The catalog hides invisible products, but nothing stopped a stale page (or
  // a crafted POST) from ordering one by variant id. The order path checks too.
  const shown = await env.DB.prepare('SELECT printful_id FROM merch_items WHERE visible = 1 AND printful_id IS NOT NULL').all();
  const sellable = new Set((shown.results || []).map((r) => Number(r.printful_id)));
  // Enforced only when the table actually answered. An empty result means the
  // catalog could not be read, and refusing every order on a failed read would
  // turn a hiccup into a closed shop — today there is no check here at all, so
  // failing open is no worse than the status quo and strictly better when the
  // rows are there.
  if (sellable.size) {
    for (const id of ids) {
      if (!sellable.has(Number(id))) {
        throw new ShopError('An item in your cart is no longer for sale. Please review your cart.', 409);
      }
    }
  } else {
    console.warn('merch_items returned no sellable rows; skipping the visibility check for this order.');
  }
  // Batched for the same reason the catalog is: MAX_LINES distinct products
  // would otherwise be MAX_LINES simultaneous Printful calls, per request, on
  // an endpoint anyone can reach.
  const products = await productDetails(env, ids);
  const lines = items.map((it) => {
    const p = products.get(it.product_id);
    const v = p && p.variants.find((x) => x.id === it.variant_id);
    if (!v) throw new ShopError('An item in your cart is no longer for sale. Please review your cart.', 409);
    if (!v.available) throw new ShopError(p.name + ' is sold out in that option right now.', 409);
    const option = [v.color, v.size].filter(Boolean).join(' / ');
    return {
      product_id: p.id,
      variant_id: v.id,
      catalog_id: v.catalog_id,
      name: p.name,
      option,
      quantity: it.quantity,
      unit_price: v.price,
      currency: v.currency,
      image: v.image,
    };
  });
  const currency = lines[0].currency;
  if (lines.some((l) => l.currency !== currency)) throw new ShopError('Mixed currencies in one cart.', 409);
  return lines;
}

function isCarbonOffset(r) {
  const id = String(r?.id || '').toUpperCase();
  const name = String(r?.name || '').toLowerCase();
  return /_?CO2\b/.test(id) || /\bco2\b|carbon/.test(name);
}

async function quoteRates(env, recipient, lines) {
  const rates = await printful(env, '/shipping/rates', {
    method: 'POST',
    body: {
      recipient: {
        address1: recipient.address1,
        address2: recipient.address2 || undefined,
        city: recipient.city,
        state_code: recipient.state_code || undefined,
        country_code: recipient.country_code,
        zip: recipient.zip,
      },
      items: lines.map((l) => ({ variant_id: l.catalog_id, quantity: l.quantity })),
    },
  });
  // Printful also quotes a carbon-offset twin of its standard service (same
  // carrier, same window, usually the same price). The owner doesn't want it
  // offered, so it is dropped here, where both the quote and the order see
  // one list — unless it is somehow the only way to ship the parcel.
  const offered = (rates || []).filter((r) => !isCarbonOffset(r));
  const quoted = (offered.length ? offered : rates || []).map((r) => ({
    id: String(r.id),
    name: String(r.name || r.id),
    rate: parseMoney(r.rate, r.currency),
    currency: String(r.currency || 'USD').toUpperCase(),
    min_days: r.minDeliveryDays ?? null,
    max_days: r.maxDeliveryDays ?? null,
  }));
  // A rate is added to the items' subtotal and charged under the items'
  // currency, so it must be quoted in that currency — anything else could be
  // off by a hundredfold with no error. Printful quotes in the store currency;
  // refuse rather than assume if it ever does not.
  const itemCurrency = lines[0].currency;
  if (quoted.some((r) => r.currency !== itemCurrency)) {
    throw new ShopError('Shipping was quoted in a different currency than the items.', 502);
  }
  return quoted;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ShopError('Body must be JSON.');
  }
}

/** Per-IP throttle on the public POSTs, using the edge cache as the counter
 *  so a looping client can never burn the day's D1 write quota. */
async function throttle(request, bucket, seconds) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return true;
  const key = new Request('https://ratelimit.invalid/' + bucket + '/' + encodeURIComponent(ip));
  try {
    const cache = caches.default;
    if (await cache.match(key)) return false;
    await cache.put(key, new Response('1', { headers: { 'Cache-Control': 'max-age=' + seconds } }));
    return true;
  } catch {
    return true;
  }
}

export async function handleShipping(request, env, cors) {
  const body = await readJson(request);
  const recipient = cleanRecipient({ ...body.recipient, email: 'quote@example.com', name: 'quote' });
  const items = cleanItems(body.items);
  const lines = await priceLines(env, items);
  const rates = await quoteRates(env, recipient, lines);
  const subtotal = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
  // `tax` rides along live (the products status is edge-cached) so the
  // storefront can label the total "+ tax" at the moment that matters.
  return json({ rates, subtotal, currency: lines[0].currency, tax: taxEnabled(env) }, 200, cors);
}

function orderReference(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return prefix + '-' + stamp + '-' + random;
}

/* --------------------------------------------------------------- stripe --- */

/** Stripe's API is form-encoded with bracketed paths for nested values. */
export function encodeForm(value, prefix = '', params = new URLSearchParams()) {
  if (value === undefined || value === null) return params;
  if (Array.isArray(value)) {
    value.forEach((item, i) => encodeForm(item, prefix + '[' + i + ']', params));
    return params;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) encodeForm(v, prefix ? prefix + '[' + k + ']' : k, params);
    return params;
  }
  params.append(prefix, String(value));
  return params;
}

export class StripeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function stripe(env, method, path, payload, idempotencyKey) {
  if (!env.STRIPE_SECRET_KEY) throw new ShopError('Payments are not switched on yet.', 503);
  const headers = { Authorization: 'Bearer ' + cleanSecret(env.STRIPE_SECRET_KEY) };
  let url = 'https://api.stripe.com/v1' + path;
  let body;
  if (method === 'GET') {
    if (payload) url += '?' + encodeForm(payload).toString();
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = encodeForm(payload).toString();
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  }
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new StripeError('Stripe: ' + ((data && data.error && data.error.message) || 'HTTP ' + res.status), res.status);
  }
  return data;
}

function taxEnabled(env) {
  return String(env.STRIPE_TAX || '').trim() === 'true';
}
/** The public Stripe key, which lets the storefront mount Stripe's checkout on
 *  its own page. Unset (or not a pk_ key) means the hosted Stripe page. */
export function publishableKey(env) {
  const pk = String(env.STRIPE_PUBLISHABLE_KEY || '').trim();
  return /^pk_(live|test)_/.test(pk) ? pk : null;
}

/**
 * Places an order: re-price, quote shipping, create the Printful draft, record
 * it, then hand the customer to Stripe. A payment failure therefore leaves an
 * inert draft and a pending row — never a charge with no order behind it.
 */
export async function handlePlaceOrder(request, env, cors) {
  if (!shopEnabled(env)) throw new ShopError('The shop is not open for orders yet.', 503);
  if (!(await throttle(request, 'order', 5))) throw new ShopError('One moment — try again in a few seconds.', 429);

  const body = await readJson(request);
  const recipient = cleanRecipient(body.recipient);
  const items = cleanItems(body.items);
  const lines = await priceLines(env, items);
  const currency = lines[0].currency;

  const rates = await quoteRates(env, recipient, lines);
  if (!rates.length) throw new ShopError('Printful cannot ship this order to that address.', 409);
  const wanted = str(body.shipping_id, 40);
  const chosen = rates.find((r) => r.id === wanted) || rates.reduce((low, r) => (r.rate < low.rate ? r : low));

  const subtotal = lines.reduce((n, l) => n + l.unit_price * l.quantity, 0);
  const shipping = chosen.rate;
  // An optional gift on top, in minor units of the order's currency. Blank,
  // null or 0 is simply no gift; anything else must be a whole non-negative
  // integer within the donation ceiling, or the order is refused rather than
  // guessed at.
  const donation = orderDonation(body.donation);
  const total = subtotal + shipping + donation;

  // The storefront sends the total it showed beside PAY (integer cents) and
  // the currency it showed it in. Only a real integer switches the guard on;
  // anything else — an older cached storefront, null, a string — simply gets
  // live pricing as before, which never undercharges. With the guard on, the
  // rate they picked must still exist (no silent stand-in, even at the same
  // price), the currency must match, and live subtotal + shipping must equal
  // what they saw; otherwise refuse before drafting anything and let the
  // storefront re-quote. Tax, when on, is added by Stripe on top of both
  // sides, so the comparison is pre-tax.
  const expected = body.expected_total;
  if (typeof expected === 'number' && Number.isInteger(expected)) {
    if (chosen.id !== wanted) {
      throw new ShopError('The shipping option you picked is no longer available — please review your cart and try again.', 409);
    }
    const expectedCurrency = typeof body.expected_currency === 'string' ? body.expected_currency.toUpperCase() : null;
    if (expectedCurrency && expectedCurrency !== String(currency).toUpperCase()) {
      throw new ShopError('Prices or shipping changed while you were checking out — please review your cart and try again.', 409);
    }
    if (expected !== total) {
      throw new ShopError('Prices or shipping changed while you were checking out — please review your cart and try again.', 409);
    }
  }
  const units = lines.reduce((n, l) => n + l.quantity, 0);
  const reference = orderReference('WIZ');

  // The draft. confirm=false is the single flag between a failed payment and
  // a printed garment.
  const draft = await printful(env, '/orders?confirm=false', {
    method: 'POST',
    body: {
      external_id: reference,
      recipient: {
        name: recipient.name,
        address1: recipient.address1,
        address2: recipient.address2 || undefined,
        city: recipient.city,
        state_code: recipient.state_code || undefined,
        country_code: recipient.country_code,
        zip: recipient.zip,
        email: recipient.email,
        phone: recipient.phone || undefined,
      },
      shipping: chosen.id,
      items: lines.map((l) => ({ sync_variant_id: l.variant_id, quantity: l.quantity })),
    },
  });

  const place = [recipient.city, recipient.state_code, recipient.country_code].filter(Boolean).join(', ');
  await env.DB.prepare(
    'INSERT INTO orders (reference, status, email, name, place, items, units, subtotal, shipping, total, currency, printful_order_id, printful_status) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      reference,
      'pending_payment',
      recipient.email,
      recipient.name,
      place,
      JSON.stringify(lines.map((l) => ({ variant_id: l.variant_id, name: l.name, option: l.option, quantity: l.quantity, unit_price: l.unit_price }))),
      units,
      subtotal,
      shipping,
      total,
      currency,
      draft.id ?? null,
      draft.status || 'draft',
    )
    .run();
  if (donation > 0) {
    await ensureDonationColumn(env);
    await env.DB.prepare('UPDATE orders SET donation = ? WHERE reference = ?').bind(donation, reference).run();
  }

  const site = siteUrl(env);
  // The storefront asks for the payment to be embedded on its own cart screen
  // (Stripe's frame, mounted there); an older cached storefront still gets
  // the hosted page. Either way Stripe brings them back to /?order=… when paid.
  const embedded = body.checkout === 'embedded';
  const payload = {
    mode: 'payment',
    ...(embedded
      ? { ui_mode: EMBEDDED_MODES[0], return_url: site + '/?order=' + encodeURIComponent(reference) + (donation > 0 ? '&tip=' + donation : '') }
      : { success_url: site + '/?order=' + encodeURIComponent(reference) + (donation > 0 ? '&tip=' + donation : ''), cancel_url: site + '/?screen=cart' }),
    customer_email: recipient.email,
    client_reference_id: reference,
    metadata: { order_reference: reference },
    // The same reference on the PaymentIntent, which Stripe copies to the
    // charge. A payout only knows its charges, so this is how confirm-on-
    // payout finds the order behind each one.
    payment_intent_data: {
      metadata: { order_reference: reference },
      description: 'Wizard Shit order ' + reference,
    },
    line_items: [
      ...lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: l.unit_price,
          ...(taxEnabled(env) ? { tax_behavior: 'exclusive' } : {}),
          product_data: {
            name: l.name,
            ...(l.option ? { description: l.option } : {}),
            ...(l.image ? { images: [l.image] } : {}),
          },
        },
      })),
      // The gift is its own line on the receipt, never folded into a product
      // price; it is not a taxable sale, and Stripe Tax is told so.
      ...(donation > 0
        ? [{
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: donation,
              ...(taxEnabled(env) ? { tax_behavior: 'exclusive', tax_code: 'txcd_00000000' } : {}),
              product_data: { name: 'Donation to Wizard Shit', description: 'Thank you — this keeps the wizards animated.' },
            },
          }]
        : []),
    ],
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: chosen.name,
          fixed_amount: { amount: shipping, currency: currency.toLowerCase() },
          ...(taxEnabled(env) ? { tax_behavior: 'exclusive', tax_code: 'txcd_92010001' } : {}),
        },
      },
    ],
  };

  if (taxEnabled(env)) {
    // Stripe Tax needs an address to tax against. The customer already typed
    // their shipping address into our form, so it goes to Stripe as a
    // Customer rather than being asked for twice on the payment page.
    const customer = await stripe(
      env,
      'POST',
      '/customers',
      {
        email: recipient.email,
        name: recipient.name,
        shipping: {
          name: recipient.name,
          address: {
            line1: recipient.address1,
            line2: recipient.address2 || undefined,
            city: recipient.city,
            state: recipient.state_code || undefined,
            postal_code: recipient.zip,
            country: recipient.country_code,
          },
        },
      },
      reference + ':customer',
    );
    payload.customer = customer.id;
    payload.automatic_tax = { enabled: true };
    delete payload.customer_email;
  }

  let session;
  try {
    session = await createCheckoutSession(env, payload, reference);
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE reference = ?").bind(reference).run();
    throw e;
  }
  await env.DB.prepare('UPDATE orders SET stripe_session = ? WHERE reference = ?').bind(session.id || '', reference).run();

  return json({ url: session.url || null, client_secret: session.client_secret || null, reference, total, donation, currency }, 200, cors);
}

/** Stripe renamed the on-site checkout mode: newer API versions want
 *  `embedded_page` and reject `embedded`; older ones the reverse. The first
 *  name is tried, and a refusal that names ui_mode is retried with the next
 *  (under its own idempotency key — Stripe replays a stored refusal otherwise). */
const EMBEDDED_MODES = ['embedded_page', 'embedded'];

async function createCheckoutSession(env, payload, reference) {
  if (!payload.ui_mode) return stripe(env, 'POST', '/checkout/sessions', payload, reference);
  let lastError;
  for (let i = 0; i < EMBEDDED_MODES.length; i++) {
    const mode = EMBEDDED_MODES[i];
    try {
      return await stripe(env, 'POST', '/checkout/sessions', { ...payload, ui_mode: mode }, i === 0 ? reference : reference + ':' + mode);
    } catch (e) {
      lastError = e;
      const refusedMode = e instanceof StripeError && e.status === 400 && /ui_mode/i.test(String(e.message));
      if (!refusedMode) throw e;
      console.warn('Stripe refused ui_mode=' + mode + ' for ' + reference + '; trying the next name.');
    }
  }
  throw lastError;
}

/** The optional gift on an order: 0 when blank, else a whole non-negative
 *  number of minor units up to the donation ceiling. Anything else refuses. */
export function orderDonation(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === 0) return 0;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > MAX_DONATION) {
    throw new ShopError('The donation must be a whole amount up to ' + formatMoney(MAX_DONATION) + ', or left blank.');
  }
  return raw;
}

/** orders.donation arrived after the table did. Add it in place the first
 *  time it is needed (once per isolate), so a deploy is all an upgrade takes. */
let ordersHaveDonation = false;
export function forgetSchemaForTests() { ordersHaveDonation = false; }
export async function ensureDonationColumn(env) {
  if (ordersHaveDonation) return;
  const info = await env.DB.prepare('PRAGMA table_info(orders)').all();
  const cols = (info && info.results ? info.results : []).map((c) => c && c.name);
  if (!cols.includes('donation')) {
    try {
      await env.DB.prepare('ALTER TABLE orders ADD COLUMN donation INTEGER NOT NULL DEFAULT 0').run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e && e.message))) throw e;
    }
  }
  ordersHaveDonation = true;
}

/* ------------------------------------------------------------ donations --- */

export async function handleDonate(request, env, cors) {
  if (!donateEnabled(env)) throw new ShopError('Donations are not switched on yet.', 503);
  if (!(await throttle(request, 'donate', 5))) throw new ShopError('One moment — try again in a few seconds.', 429);

  const body = await readJson(request);
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < MIN_DONATION || amount > MAX_DONATION) {
    throw new ShopError('Donations are from ' + formatMoney(MIN_DONATION) + ' to ' + formatMoney(MAX_DONATION) + '.');
  }
  const name = str(body.name, 100);
  const message = str(body.message, 300);
  const isPublic = body.public === true || body.public === 1 ? 1 : 0;
  const reference = orderReference('GIFT');

  await env.DB.prepare(
    "INSERT INTO donations (reference, status, amount, currency, name, message, public) VALUES (?, 'pending', ?, 'USD', ?, ?, ?)",
  )
    .bind(reference, amount, name, message, isPublic)
    .run();

  const site = siteUrl(env);
  const session = await stripe(
    env,
    'POST',
    '/checkout/sessions',
    {
      mode: 'payment',
      submit_type: 'donate',
      success_url: site + '/?donated=' + encodeURIComponent(reference),
      cancel_url: site + '/',
      client_reference_id: reference,
      metadata: { kind: 'donation', donation_reference: reference },
      payment_intent_data: {
        metadata: { kind: 'donation', donation_reference: reference },
        description: 'Wizard Shit donation ' + reference,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: 'Donation to Wizard Shit', description: 'Keeps the wizards animated. Thank you.' },
          },
        },
      ],
    },
    reference,
  );
  await env.DB.prepare('UPDATE donations SET stripe_session = ? WHERE reference = ?').bind(session.id || '', reference).run();
  return json({ url: session.url, reference }, 200, cors);
}

/* -------------------------------------------------------------- webhook --- */

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text)));
}

async function sameDigest(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Stripe signs `${t}.${rawBody}` with the endpoint's signing secret. The check
 * is over the exact bytes Stripe sent, rejects anything older than five
 * minutes (replays), and compares in constant time.
 */
export async function verifyStripeSignature(rawBody, header, secret, now = Date.now(), toleranceSec = 300) {
  if (!secret) return { valid: false, reason: 'no signing secret configured' };
  if (!header) return { valid: false, reason: 'missing stripe-signature header' };
  const parts = Object.create(null);
  const sigs = [];
  for (const piece of header.split(',')) {
    const [k, v] = piece.split('=', 2).map((s) => (s || '').trim());
    if (k === 't') parts.t = v;
    else if (k === 'v1' && v) sigs.push(v);
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !sigs.length) return { valid: false, reason: 'malformed stripe-signature header' };
  if (Math.abs(now / 1000 - t) > toleranceSec) return { valid: false, reason: 'timestamp outside tolerance' };
  const expected = await hmacHex(secret, parts.t + '.' + rawBody);
  for (const s of sigs) if (await sameDigest(s, expected)) return { valid: true };
  return { valid: false, reason: 'signature mismatch' };
}

/** Test helper for the suite: what Stripe would put in the header. */
export async function signForTests(rawBody, secret, tSeconds) {
  return 't=' + tSeconds + ',v1=' + (await hmacHex(secret, tSeconds + '.' + rawBody));
}

/**
 * Confirms a draft for production, by our reference. Idempotent: an order
 * already past draft is reported as such, never re-confirmed, so Stripe's
 * retries can never double-print.
 */
/**
 * Every consequential UPDATE in this file carries a status guard. A guard that
 * matches no row means the recorded state has diverged from reality — the most
 * expensive case being a garment already at the printer against a row that
 * still says pending_payment. Returns the row count and shouts if it is zero.
 */
async function runGuarded(stmt, what, reference) {
  const res = await stmt.run();
  const changes = res && res.meta && typeof res.meta.changes === 'number' ? res.meta.changes : null;
  if (changes === 0) {
    console.error('STATE DIVERGED: ' + what + ' matched no row for ' + reference + '. Reality and the order book disagree.');
  }
  return changes;
}

export async function confirmOrder(env, reference) {
  let existing;
  try {
    existing = await printful(env, '/orders/@' + encodeURIComponent(reference));
  } catch (e) {
    if (e instanceof PrintfulError && e.status === 404) return { status: 'not-found' };
    throw e;
  }
  let outcome;
  if (existing.status !== 'draft') {
    outcome = { status: 'already-confirmed', orderId: existing.id, printfulStatus: existing.status };
  } else {
    const confirmed = await printful(env, '/orders/' + existing.id + '/confirm', { method: 'POST' });
    outcome = { status: 'confirmed', orderId: confirmed.id, printfulStatus: confirmed.status || 'pending' };
  }
  const changes = await runGuarded(
    env.DB.prepare(
      "UPDATE orders SET status = 'confirmed', printful_order_id = ?, printful_status = ?, confirmed_at = COALESCE(confirmed_at, datetime('now')) WHERE reference = ? AND status IN ('paid', 'confirmed')",
    ).bind(outcome.orderId, outcome.printfulStatus, reference),
    'confirm',
    reference,
  );
  // Printful is already printing. If the row did not move, say so out loud
  // rather than answering {confirmed: true} over a book that records nothing.
  return { ...outcome, recorded: changes !== 0 };
}

async function markOrderPaid(env, reference, session) {
  const details = session.customer_details || {};
  return runGuarded(
    env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = datetime('now'), stripe_session = ?, stripe_payment_intent = ?, email = CASE WHEN ? <> '' THEN ? ELSE email END WHERE reference = ? AND status IN ('pending_payment', 'payment_failed')",
  )
      .bind(session.id || '', typeof session.payment_intent === 'string' ? session.payment_intent : '', details.email || '', details.email || '', reference),
    'mark-paid',
    reference,
  );
}

async function markDonationPaid(env, reference, session) {
  const details = session.customer_details || {};
  await env.DB.prepare(
    "UPDATE donations SET status = 'paid', paid_at = datetime('now'), stripe_session = ?, stripe_payment_intent = ?, amount = COALESCE(?, amount), email = ?, name = CASE WHEN name = '' THEN ? ELSE name END WHERE reference = ? AND status = 'pending'",
  )
    .bind(
      session.id || '',
      typeof session.payment_intent === 'string' ? session.payment_intent : '',
      Number.isInteger(session.amount_total) ? session.amount_total : null,
      details.email || '',
      details.name || '',
      reference,
    )
    .run();
}

/**
 * Which orders and donations a payout paid for. A payout names no orders,
 * only charges, and only when asked: list its balance transactions with the
 * charge expanded, read our reference off each charge's metadata (stamped
 * there via the PaymentIntent at checkout). Refunded and disputed charges are
 * reported as skipped, never confirmed — printing a refunded order is how a
 * refund turns into a loss.
 */
export async function chargesInPayout(env, payoutId) {
  const orders = [];
  const donations = [];
  const skipped = [];
  const seen = new Set();
  let startingAfter;
  for (let page = 0; page < 20; page++) {
    const params = { payout: payoutId, limit: 100, expand: ['data.source'] };
    if (startingAfter) params.starting_after = startingAfter;
    const list = await stripe(env, 'GET', '/balance_transactions', params);
    const data = (list && list.data) || [];
    for (const txn of data) {
      const c = txn.source;
      if (!c || typeof c !== 'object' || c.object !== 'charge') continue;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const meta = c.metadata || {};
      if (c.refunded) {
        skipped.push({ charge: c.id, reason: 'refunded', order: meta.order_reference || '', donation: meta.donation_reference || '' });
        continue;
      }
      // Stripe sets `refunded` only at 100%. A charge refunded down to pennies
      // is not money in the bank either: skip it, but do not mark the order
      // refunded — a human decides what a partial refund meant.
      if (Number(c.amount_refunded || 0) > 0) {
        console.warn('charge ' + c.id + ' is partially refunded (' + c.amount_refunded + ' of ' + c.amount + '); not confirming.');
        skipped.push({ charge: c.id, reason: 'partially-refunded', order: meta.order_reference || '', donation: meta.donation_reference || '' });
        continue;
      }
      if (c.disputed) {
        skipped.push({ charge: c.id, reason: 'disputed', order: meta.order_reference || '', donation: meta.donation_reference || '' });
        continue;
      }
      if (meta.order_reference) orders.push({ reference: meta.order_reference, charge: c.id });
      else if (meta.donation_reference) donations.push({ reference: meta.donation_reference, charge: c.id });
      else skipped.push({ charge: c.id, reason: 'no-reference' });
    }
    if (!list.has_more || !data.length) break;
    startingAfter = data[data.length - 1].id;
  }
  return { orders, donations, skipped };
}

async function handlePayoutPaid(env, payout) {
  const payoutId = payout && payout.id;
  if (!payoutId) return json({ received: true, confirmed: false });

  let batch;
  try {
    batch = await chargesInPayout(env, payoutId);
  } catch (e) {
    console.error('payout ' + payoutId + ': could not read charges:', e);
    return json({ error: 'Could not read the payout.' }, 503);
  }

  // Bookkeeping first, whatever the mode: this money is in the bank now.
  for (const d of batch.donations) {
    await env.DB.prepare("UPDATE donations SET stripe_payout = ?, status = CASE WHEN status = 'paid' THEN 'paid_out' ELSE status END WHERE reference = ?")
      .bind(payoutId, d.reference)
      .run();
  }
  for (const s of batch.skipped) {
    console.warn('payout ' + payoutId + ': charge ' + s.charge + ' skipped (' + s.reason + ')');
    if (s.reason === 'refunded' && s.order) {
      await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE reference = ? AND status IN ('paid', 'pending_payment')").bind(s.order).run();
    }
    if (s.reason === 'refunded' && s.donation) {
      await env.DB.prepare("UPDATE donations SET status = 'refunded' WHERE reference = ?").bind(s.donation).run();
    }
  }

  const confirmed = [];
  const failed = [];
  const missing = [];
  for (const o of batch.orders) {
    await env.DB.prepare('UPDATE orders SET stripe_payout = ? WHERE reference = ?').bind(payoutId, o.reference).run();
    if (!confirmOnPayout(env)) continue; // the charge event already confirmed it
    if (stripeTestMode(env)) {
      console.warn('TEST MODE — not confirming ' + o.reference);
      continue;
    }
    try {
      const outcome = await confirmOrder(env, o.reference);
      if (outcome.status === 'not-found') {
        console.error('PAID BUT NO ORDER: no Printful draft for ' + o.reference + ' (payout ' + payoutId + ').');
        // Guarded on 'paid', so the very race that causes the miss would also
        // swallow the alarm. runGuarded logs when it matches nothing.
        await runGuarded(
          env.DB.prepare("UPDATE orders SET status = 'missing' WHERE reference = ? AND status = 'paid'").bind(o.reference),
          'flag-missing',
          o.reference,
        );
        missing.push(o.reference);
      } else {
        confirmed.push(o.reference);
      }
    } catch (e) {
      console.error('payout ' + payoutId + ': failed to confirm ' + o.reference + ':', e);
      failed.push(o.reference);
    }
  }

  if (failed.length) {
    // 5xx earns a Stripe retry. Everything confirmed stays confirmed; the
    // retry only has the failures left to do.
    return json({ error: 'Could not confirm every order.', confirmed, failed }, 503);
  }
  console.info('payout ' + payoutId + ': ' + confirmed.length + ' confirmed, ' + batch.donations.length + ' donations in bank, ' + batch.skipped.length + ' skipped.');
  return json({ received: true, confirmed: confirmed.length > 0, orders: confirmed, donations: batch.donations.map((d) => d.reference), ...(missing.length ? { missing } : {}) });
}

export async function handleStripeWebhook(request, env) {
  const secret = cleanSecret(env.STRIPE_WEBHOOK_SECRET);
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set; refusing to process.');
    return json({ error: 'Webhook is not configured.' }, 500);
  }
  // Raw text, never request.json(): re-serialising changes the bytes.
  const rawBody = await request.text();
  const check = await verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret);
  if (!check.valid) {
    console.warn('webhook rejected: ' + check.reason);
    return json({ error: 'Invalid signature.' }, 400);
  }
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Malformed payload.' }, 400);
  }
  const type = String(event.type || '');
  const obj = (event.data && event.data.object) || {};

  if (type === 'payout.paid') return handlePayoutPaid(env, obj);

  if (type === 'payout.failed' || type === 'payout.canceled') {
    console.warn('payout ' + (obj.id || '?') + ' ' + type.slice(7) + '; orders it covered stay drafts.');
    return json({ received: true, confirmed: false });
  }

  if (type === 'charge.refunded') {
    const meta = obj.metadata || {};
    if (obj.refunded && meta.order_reference) {
      await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE reference = ?").bind(meta.order_reference).run();
    }
    if (obj.refunded && meta.donation_reference) {
      await env.DB.prepare("UPDATE donations SET status = 'refunded' WHERE reference = ?").bind(meta.donation_reference).run();
    }
    return json({ received: true });
  }

  if (type === 'checkout.session.async_payment_failed') {
    const meta = obj.metadata || {};
    if (meta.kind === 'donation' && meta.donation_reference) {
      await env.DB.prepare("UPDATE donations SET status = 'failed' WHERE reference = ? AND status = 'pending'").bind(meta.donation_reference).run();
    } else {
      const ref = obj.client_reference_id || meta.order_reference;
      if (ref) await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE reference = ? AND status = 'pending_payment'").bind(ref).run();
    }
    return json({ received: true, confirmed: false });
  }

  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return json({ received: true, ignored: type });
  }

  // Both of these mean the money is in Stripe's balance. `completed` covers
  // cards; `async_payment_succeeded` covers slower methods whose session
  // completes before the payment clears.
  if (obj.payment_status && obj.payment_status !== 'paid') {
    return json({ received: true, confirmed: false, pending: obj.payment_status });
  }
  const meta = obj.metadata || {};

  if (meta.kind === 'donation') {
    const ref = meta.donation_reference || obj.client_reference_id;
    if (!ref) return json({ received: true, confirmed: false });
    await markDonationPaid(env, ref, obj);
    return json({ received: true, donation: ref });
  }

  const reference = obj.client_reference_id || meta.order_reference;
  if (!reference) {
    console.error('session ' + (obj.id || '?') + ' carried no order reference.');
    return json({ received: true, confirmed: false });
  }
  await markOrderPaid(env, reference, obj);

  if (stripeTestMode(env)) {
    console.warn('TEST MODE — ' + reference + ' recorded as paid, not confirmed.');
    return json({ received: true, confirmed: false, testMode: true });
  }
  if (confirmOnPayout(env)) {
    console.info(reference + ' is paid and held as a draft until Stripe pays it out.');
    return json({ received: true, confirmed: false, heldForPayout: true });
  }
  try {
    const outcome = await confirmOrder(env, reference);
    if (outcome.status === 'not-found') {
      console.error('PAID BUT NO ORDER: no Printful draft for ' + reference + '.');
      await env.DB.prepare("UPDATE orders SET status = 'missing' WHERE reference = ? AND status = 'paid'").bind(reference).run();
      return json({ received: true, confirmed: false });
    }
    return json({ received: true, confirmed: true });
  } catch (e) {
    console.error('failed to confirm ' + reference + ':', e);
    return json({ error: 'Could not confirm the order.' }, 503);
  }
}

/* ---------------------------------------------------------------- admin --- */

/**
 * What each secret looks like and whether its upstream accepts it — for the
 * owner's console, never the value itself. "stray" is true when the stored
 * value carried characters that had to be cleaned off (quotes, a line break).
 */
/**
 * Upstream error text, safe to show the owner. Stripe redacts the middle of a
 * key it rejects but prints the last four in clear, and Printful names the
 * store and token id; neither belongs on a screen or in a response body.
 */
export function redactUpstream(message) {
  return String(message ?? '')
    // A whole key-shaped token, however Stripe chose to mask its middle.
    .replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9_*?-]+/g, '$1_…')
    // A bare tail left after somebody else's asterisks.
    .replace(/\*{2,}[A-Za-z0-9]+/g, '****')
    // Long digit runs: store ids, token ids, account ids — but not a hex
    // colour like #000000, which Printful lists in its own error messages.
    .replace(/(?<![#A-Za-z0-9_])\d{6,}\b/g, '…');
}

/**
 * Every merch card with the variants Printful actually reports for it and
 * each one's stock status — so the owner can see why a colour or size is
 * missing from the site (never set up in Printful, or out of stock there)
 * instead of guessing.
 */
export async function adminCatalogHealth(env) {
  const rows = await env.DB.prepare('SELECT id, title, visible, printful_id FROM merch_items ORDER BY sort').all();
  const items = rows.results || [];
  const ids = [...new Set(items.map((i) => i.printful_id).filter(Boolean))];
  const errors = new Map();
  const details = await productDetails(env, ids, (id, e) => errors.set(id, redactUpstream(e.message)));
  const products = items.map((item) => {
    const d = item.printful_id ? details.get(item.printful_id) : null;
    return {
      id: item.id,
      title: item.title,
      visible: !!item.visible,
      printful_id: item.printful_id || null,
      printful_name: d ? d.name : null,
      error: item.printful_id ? errors.get(item.printful_id) || null : null,
      variants: d
        ? d.variants.map((v) => ({ name: v.name, color: v.color, size: v.size, price: v.price, currency: v.currency, status: v.status, on_site: v.available }))
        : [],
    };
  });
  return json({ products }, 200, { 'Cache-Control': 'no-store' });
}

/* ------------------------------------------------ colours, from the console --- */

/**
 * A sync product with the catalog product behind it, so each sync variant can
 * be named by the catalog's own colour and size (the only reliable source:
 * sync variant names are free text).
 */
async function productWithCatalog(env, printfulId) {
  const r = await printful(env, '/store/products/' + encodeURIComponent(printfulId));
  const product = r.sync_product || {};
  const variants = (r.sync_variants || []).filter((v) => !v.is_ignored);
  if (!variants.length) throw new ShopError('That Printful product has no variants to copy a design from.', 409);
  const catalogId = variants[0].product && variants[0].product.product_id;
  if (!catalogId) throw new ShopError('Printful did not say which catalog product this is.', 502);
  const cat = await printful(env, '/products/' + encodeURIComponent(catalogId));
  const catalogVariants = cat.variants || [];
  const byId = new Map(catalogVariants.map((cv) => [cv.id, cv]));
  const colorOf = (v) => (byId.get(v.variant_id) || {}).color || '';
  const sizeOf = (v) => (byId.get(v.variant_id) || {}).size || '';
  return { product, variants, catalogId, catalogName: (cat.product && cat.product.title) || '', catalogVariants, colorOf, sizeOf };
}

/** Printful's own mockup of a product: the first variant's preview, else the
 *  product thumbnail. The console offers it as the card image, so the owner
 *  never has to download and re-upload Printful's picture. */
export async function printfulMockup(env, printfulId) {
  const r = await printful(env, '/store/products/' + encodeURIComponent(printfulId));
  const product = r.sync_product || {};
  const variants = (r.sync_variants || []).filter((v) => !v.is_ignored);
  let url = '';
  for (const v of variants) {
    const preview = (v.files || []).find((f) => f.type === 'preview' && f.preview_url);
    if (preview) { url = preview.preview_url; break; }
  }
  if (!url) url = product.thumbnail_url || '';
  if (!/^https:\/\/[^/]+\.printful\.com\//i.test(url)) throw new ShopError('Printful has no mockup for this product yet — try again in a few minutes.', 409);
  return { url, name: String(product.name || 'printful') };
}

/** Every colour the catalog makes this product in, and which ones are sold. */
export async function adminProductColors(env, printfulId) {
  const p = await productWithCatalog(env, printfulId);
  const synced = new Set(p.variants.map((v) => v.variant_id));
  // The sizes sold today; a new colour mirrors them (or everything, for a
  // product with no size axis yet).
  const sizes = [...new Set(p.variants.map(p.sizeOf).filter(Boolean))];
  const colors = new Map();
  // Printful's word on stock, per region: the dashboard only offers colours
  // in stock for the store's region, and the API refuses the rest (with a
  // message that does not say so). Surface it, so a missing colour reads as
  // "out of stock in USA" rather than a mystery.
  const regionStatus = (cv) => (Array.isArray(cv.availability_status) ? cv.availability_status : []).map((a) => ({ region: a.region, status: a.status }));
  const anyInStock = (cv) => {
    const rs = regionStatus(cv);
    if (rs.length) return rs.some((r) => r.status === 'in_stock');
    return cv.in_stock !== false;
  };
  for (const cv of p.catalogVariants) {
    const key = cv.color || '';
    if (!colors.has(key)) colors.set(key, { color: key, color_code: cv.color_code || null, offered: 0, in_stock: 0, would_add: 0, sizes: [], stock: [] });
    const c = colors.get(key);
    const inStock = anyInStock(cv);
    const isSynced = synced.has(cv.id);
    const wanted = !sizes.length || sizes.includes(cv.size);
    c.sizes.push({ size: cv.size, in_stock: inStock, offered: isSynced, stock: regionStatus(cv) });
    if (isSynced) c.offered++;
    if (inStock) c.in_stock++;
    if (!isSynced && wanted && inStock) c.would_add++;
    for (const r of regionStatus(cv)) {
      const existing = c.stock.find((x) => x.region === r.region);
      if (!existing) c.stock.push({ region: r.region, status: r.status });
      else if (r.status === 'in_stock') existing.status = 'in_stock';
    }
  }
  // What a clone copies: the design files and options as Printful stores
  // them on the existing variants. Owner-only, and the quickest way to see
  // why Printful refuses a copy.
  const design = p.variants.map((v) => ({
    id: v.id,
    color: p.colorOf(v),
    size: p.sizeOf(v),
    options: v.options || [],
    files: (v.files || []).filter((f) => f.type !== 'preview').map((f) => ({ id: f.id || null, type: f.type, options: f.options || [], position: f.position || null })),
    // The mockup Printful serves for this variant — what the product page
    // shows. A duplicated product keeps the original's until regenerated.
    mockup: ((v.files || []).find((f) => f.type === 'preview' && f.preview_url) || {}).preview_url || null,
  }));
  // Printful's API does not accept a cloned embroidered variant the way its
  // editor does (every shape tried is refused with a thread-colour message
  // while the editor makes the same colour fine). Say so, rather than let
  // the owner tick a box that cannot work.
  const embroidered = p.variants.some((v) => (v.options || []).some((o) => o.id === 'embroidery_type'));
  return json(
    {
      product: { id: p.product.id, name: p.product.name, catalog_id: p.catalogId, catalog_name: p.catalogName },
      sizes,
      colors: [...colors.values()],
      design,
      embroidered,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/**
 * A variant's options as Printful will accept them on a new variant. Printful
 * hands back every option slot it knows, empty ones included, and refuses an
 * empty `thread_colors` on a flat-embroidery product ("thread_colors option is
 * missing or incorrect"). So: empty slots are dropped, hex colours are
 * uppercased the way Printful lists them, and when `thread_colors` is empty
 * but another thread list has values (a beanie stored its black and white
 * under `thread_colors_3d`), those fill it.
 */
export function cloneOptions(options, { uppercase = false } = {}) {
  const hex = (v) => (uppercase && typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : v);
  const filled = (o) => o && o.id && o.value !== null && o.value !== undefined && o.value !== '' && !(Array.isArray(o.value) && !o.value.length);
  const out = (options || []).filter(filled).map((o) => ({ id: o.id, value: Array.isArray(o.value) ? o.value.map(hex) : hex(o.value) }));
  if (!out.some((o) => o.id === 'thread_colors')) {
    const threads = [...new Set(out.filter((o) => /^thread_colors/.test(o.id) && Array.isArray(o.value)).flatMap((o) => o.value))];
    if (threads.length) out.push({ id: 'thread_colors', value: threads });
  }
  return out;
}

/**
 * The bodies to try, in order, when cloning a template variant onto a
 * catalog variant. Printful's refusal for embroidery ("thread_colors option
 * is missing or incorrect") does not say which shape it wants, and a refused
 * attempt creates nothing, so several shapes are tried: exactly as stored
 * (case and all), then without the file-level copy, then without the 3D
 * slot, then uppercased. The first accepted wins.
 */
export function cloneAttempts(template, catalogVariantId, libraryFiles) {
  const base = { variant_id: catalogVariantId, retail_price: template.retail_price, is_ignored: false };
  const withThreadsOnFiles = (files, options) => {
    const threads = options.find((o) => o.id === 'thread_colors');
    return files.map((f) => (threads && !(f.options || []).some((o) => o.id === 'thread_colors') ? { ...f, options: [...(f.options || []), threads] } : f));
  };
  const stored = cloneOptions(template.options);
  const files = libraryFiles(template);
  const attempts = [
    { label: 'as stored, thread colours on file and variant', body: { ...base, files: withThreadsOnFiles(files, stored), options: stored } },
    { label: 'as stored, variant only', body: { ...base, files, options: stored } },
  ];
  if (stored.some((o) => o.id === 'thread_colors_3d')) {
    const flatOnly = stored.filter((o) => o.id !== 'thread_colors_3d');
    attempts.push({ label: 'without the 3D slot', body: { ...base, files: withThreadsOnFiles(files, flatOnly), options: flatOnly } });
  }
  const upper = cloneOptions(template.options, { uppercase: true });
  if (JSON.stringify(upper) !== JSON.stringify(stored)) {
    attempts.push({ label: 'uppercased', body: { ...base, files: withThreadsOnFiles(files, upper), options: upper } });
  }
  // Printful itself stored the template with no thread colours at all
  // (thread_colors: []), so the shapes that carry none come next: only the
  // non-thread options, then no options at all, then the file by URL rather
  // than library id in case the id reference is what fails the check.
  const noThreads = stored.filter((o) => !/thread_colors/.test(o.id));
  attempts.push({ label: 'no thread colours, other options kept', body: { ...base, files, options: noThreads } });
  attempts.push({ label: 'no options at all', body: { ...base, files } });
  const byUrl = (template.files || []).filter((f) => f.type !== 'preview' && f.url).map((f) => ({ type: f.type, url: f.url }));
  if (byUrl.length) attempts.push({ label: 'file by URL, no options', body: { ...base, files: byUrl } });
  return attempts;
}

/**
 * Offer a colour: one new sync variant per size sold today, each carrying
 * the design files and options of the existing variant in that size (or the
 * first one), at its price. Additive: nothing existing is touched. Needs a
 * Printful token with the store-products write scope.
 */
export async function adminAddColor(env, printfulId, color) {
  color = String(color || '').trim();
  if (!color) throw new ShopError('Which colour?');
  const p = await productWithCatalog(env, printfulId);
  const synced = new Set(p.variants.map((v) => v.variant_id));
  const sizes = [...new Set(p.variants.map(p.sizeOf).filter(Boolean))];
  const targets = p.catalogVariants.filter((cv) => (cv.color || '') === color && !synced.has(cv.id) && (!sizes.length || sizes.includes(cv.size)));
  if (!targets.length) {
    throw new ShopError(color + ' is already offered in every size you sell, or Printful does not make this product in it.', 409);
  }
  const created = [];
  const failed = [];
  // Only a variant that actually carries a design file can be copied; a
  // blank variant would sell a blank garment.
  // Each file goes over by library id with its own options and placement:
  // for embroidery the thread colours live on the file, and a file without
  // them is refused by Printful ("thread_colors option is missing").
  const libraryFiles = (v) => (v.files || [])
    .filter((f) => f.type !== 'preview' && f.id)
    .map((f) => ({
      id: f.id,
      type: f.type,
      ...(Array.isArray(f.options) && f.options.length ? { options: cloneOptions(f.options) } : {}),
      ...(f.position && typeof f.position === 'object' ? { position: f.position } : {}),
    }));
  const withDesign = p.variants.filter((v) => libraryFiles(v).length);
  if (!withDesign.length) throw new ShopError('None of this product\'s variants carries a design file to copy. Set the design up in Printful first.', 409);
  for (const cv of targets) {
    // The existing variant in the same size (same placement and scale), else any with a design.
    const template = withDesign.find((v) => p.sizeOf(v) === cv.size) || withDesign[0];
    const refusals = [];
    let made = null;
    for (const attempt of cloneAttempts(template, cv.id, libraryFiles)) {
      try {
        made = await printful(env, '/store/products/' + encodeURIComponent(p.product.id) + '/variants', { method: 'POST', body: attempt.body });
        break;
      } catch (e) {
        // What was sent travels with the refusal (no secrets in it), so a
        // refusal can be read against the request without guessing.
        const { variant_id, retail_price, files, options } = attempt.body;
        refusals.push({ attempt: attempt.label, error: redactUpstream(e.message), sent: { variant_id, retail_price, files, options } });
        // Anything but a validation refusal (a scope, an outage) is not worth retrying.
        if (!(e instanceof PrintfulError) || e.status !== 400) break;
      }
    }
    if (made) created.push({ id: made.id, size: cv.size, attempts: refusals.length + 1 });
    else failed.push({ size: cv.size, error: refusals.map((r) => r.attempt + ': ' + r.error).join(' | '), sent: refusals.map((r) => r.sent) });
  }
  await purgeCatalogCache();
  // When nothing could be made, say why in `error` too: the console shows
  // that field, and Printful's reason (a missing scope, a rejected file) is
  // the whole point.
  const allFailed = failed.length && !created.length;
  return json(
    { color, created, failed, ...(allFailed ? { error: 'Printful would not add ' + color + ': ' + failed.map((f) => f.size + ' — ' + f.error).join('; ') } : {}) },
    allFailed ? 502 : 200,
    { 'Cache-Control': 'no-store' },
  );
}

/** Stop offering a colour: delete its sync variants. Never the last colour. */
export async function adminRemoveColor(env, printfulId, color) {
  color = String(color || '').trim();
  if (!color) throw new ShopError('Which colour?');
  const p = await productWithCatalog(env, printfulId);
  const doomed = p.variants.filter((v) => p.colorOf(v) === color);
  if (!doomed.length) throw new ShopError(color + ' is not offered on this product.', 409);
  if (doomed.length === p.variants.length) {
    throw new ShopError('That is the only colour left. Add another first, or hide the card instead.', 409);
  }
  const removed = [];
  const failed = [];
  for (const v of doomed) {
    try {
      await printful(env, '/store/variants/' + encodeURIComponent(v.id), { method: 'DELETE' });
      removed.push({ id: v.id, size: p.sizeOf(v) });
    } catch (e) {
      failed.push({ size: p.sizeOf(v), error: redactUpstream(e.message) });
    }
  }
  await purgeCatalogCache();
  const allFailed = failed.length && !removed.length;
  return json(
    { color, removed, failed, ...(allFailed ? { error: 'Printful would not remove ' + color + ': ' + failed.map((f) => f.size + ' — ' + f.error).join('; ') } : {}) },
    allFailed ? 502 : 200,
    { 'Cache-Control': 'no-store' },
  );
}

export async function adminShopHealth(env) {
  const shape = (raw) => {
    const value = String(raw ?? '');
    const clean = cleanSecret(value);
    return {
      set: clean.length > 0,
      // Capped: without a ceiling a key whose first underscore falls late
      // would hand back most of itself.
      prefix: clean.slice(0, Math.min(clean.indexOf('_') > 0 ? clean.indexOf('_') + 1 : 4, 8)),
      length: clean.length,
      stray: clean !== value,
      // Keys are plain letters, digits, _ and -; anything else (a lookalike
      // letter from a copy, say) can only mean the key was mangled.
      odd: (clean.match(/[^A-Za-z0-9_-]/g) || []).length,
    };
  };
  const probe = async (fn) => {
    try {
      await fn();
      return 'ok';
    } catch (e) {
      return redactUpstream(String((e && e.message) || e));
    }
  };
  const stripeKey = shape(env.STRIPE_SECRET_KEY);
  const printfulToken = shape(env.PRINTFUL_TOKEN);
  const webhook = shape(env.STRIPE_WEBHOOK_SECRET);
  const [stripeLive, printfulLive] = await Promise.all([
    stripeKey.set ? probe(() => stripe(env, 'GET', '/checkout/sessions', { limit: 1 })) : 'not set',
    // Asked with a scope the shop actually uses (the catalog), not store details.
    printfulToken.set ? probe(() => printful(env, '/store/products?limit=1')) : 'not set',
  ]);
  return json(
    {
      stripe: { ...stripeKey, test_mode: stripeTestMode(env), live: stripeLive },
      printful: { ...printfulToken, live: printfulLive },
      webhook,
      publishable: !!publishableKey(env),
      mode: confirmOnPayout(env) ? 'payout' : 'payment',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

export async function adminOrders(env) {
  const rows = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300').all();
  return json(
    {
      orders: (rows.results || []).map((r) => ({ ...r, items: safeJson(r.items) })),
      mode: confirmOnPayout(env) ? 'payout' : 'payment',
      shop: shopEnabled(env),
      test_mode: stripeTestMode(env),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

/** The manual confirm: the owner's override when a payout never comes, or
 *  when they simply want it printed now. Only a row our own verified webhook
 *  marked paid can be confirmed, and never on test keys. */
export async function adminConfirmOrder(env, reference) {
  if (stripeTestMode(env)) throw new ShopError('Stripe is on test keys; confirming would print a garment nobody paid for.', 409);
  const row = await env.DB.prepare('SELECT status FROM orders WHERE reference = ?').bind(reference).first();
  if (!row) throw new ShopError('No order ' + reference + '.', 404);
  if (row.status !== 'paid' && row.status !== 'confirmed') {
    throw new ShopError('Order ' + reference + ' is ' + row.status.replace('_', ' ') + ', not paid. Not confirming.', 409);
  }
  const outcome = await confirmOrder(env, reference);
  if (outcome.status === 'not-found') throw new ShopError('No Printful order found for ' + reference + '.', 404);
  return json({ ok: true, ...outcome });
}

export async function adminDonations(env) {
  await ensureDonationColumn(env);
  // Gifts left in the checkout box ride the order's charge, so they live on
  // the order row; here they are read back in the same shape as a DONATE
  // gift, with the order's payment state translated to a gift's.
  const ORDER_GIFT_STATUS =
    "CASE WHEN status = 'refunded' THEN 'refunded' WHEN stripe_payout <> '' THEN 'paid_out' " +
    "WHEN status IN ('paid', 'confirmed', 'missing') THEN 'paid' WHEN status = 'payment_failed' THEN 'failed' ELSE 'pending' END";
  const [rows, giftTotals, orderTotals] = await Promise.all([
    env.DB.prepare(
      'SELECT reference, status, amount, currency, name, email, message, public, stripe_payout, created_at, paid_at, \'gift\' AS source FROM donations ' +
        'UNION ALL ' +
        'SELECT reference, ' + ORDER_GIFT_STATUS + " AS status, donation AS amount, currency, name, email, '' AS message, 0 AS public, stripe_payout, created_at, paid_at, 'order' AS source " +
        'FROM orders WHERE donation > 0 ' +
        'ORDER BY created_at DESC LIMIT 500',
    ).all(),
    env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN status IN ('paid', 'paid_out') THEN amount END), 0) AS received, " +
        "COALESCE(SUM(CASE WHEN status = 'paid_out' THEN amount END), 0) AS in_bank, " +
        "COUNT(CASE WHEN status IN ('paid', 'paid_out') THEN 1 END) AS gifts FROM donations",
    ).first(),
    env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN status IN ('paid', 'confirmed', 'missing') THEN donation END), 0) AS received, " +
        "COALESCE(SUM(CASE WHEN status IN ('paid', 'confirmed', 'missing') AND stripe_payout <> '' THEN donation END), 0) AS in_bank, " +
        "COUNT(CASE WHEN status IN ('paid', 'confirmed', 'missing') THEN 1 END) AS gifts FROM orders WHERE donation > 0",
    ).first(),
  ]);
  const g = giftTotals || {};
  const o = orderTotals || {};
  const totals = {
    received: (g.received || 0) + (o.received || 0),
    in_bank: (g.in_bank || 0) + (o.in_bank || 0),
    gifts: (g.gifts || 0) + (o.gifts || 0),
  };
  return json({ donations: rows.results || [], totals, donate: donateEnabled(env) }, 200, {
    'Cache-Control': 'no-store',
  });
}

/* --------------------------------------------------------------- errors --- */

/** Turns the module's errors into responses; anything else is rethrown so
 *  the Worker's own catch logs it and returns its generic 500. */
export function shopErrorResponse(e, cors = {}) {
  // ShopError messages are ours, written for customers.
  if (e instanceof ShopError) return json({ error: e.message }, e.status, cors);
  // Upstream messages are NOT. Stripe's rejection of a key prints its last four
  // characters in clear, and Printful's errors name the store and token id.
  // These routes are public, so that detail stays in the log.
  if (e instanceof PrintfulError) {
    console.error(e.message);
    return json(
      { error: e.retryable ? 'Our print partner is busy — try again in a moment.' : 'We could not price that order right now.' },
      e.retryable ? 503 : 502,
      cors,
    );
  }
  if (e instanceof StripeError) {
    console.error(e.message);
    return json({ error: 'Payments are having a moment — try again shortly.' }, e.status >= 500 ? 503 : 502, cors);
  }
  return null;
}
