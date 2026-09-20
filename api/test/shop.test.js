import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_UNITS_PER_ORDER,
  adminConfirmOrder,
  adminAddColor,
  adminCatalogHealth,
  adminProductColors,
  adminRemoveColor,
  adminDonations,
  adminShopHealth,
  chargesInPayout,
  cleanSecret,
  cloneOptions,
  encodeForm,
  forgetSchemaForTests,
  formatMoney,
  handleDonate,
  handlePlaceOrder,
  handleProducts,
  handleShipping,
  handleStripeWebhook,
  orderDonation,
  parseMoney,
  parseVariantName,
  redactUpstream,
  signForTests,
  shopErrorResponse,
  verifyStripeSignature,
} from '../src/shop.js';

/**
 * The shop's money path, driven end to end against stand-in Printful and
 * Stripe. Both upstreams are impersonated by a fetch stub that records every
 * call, and D1 by a fake that records every statement, so a wrong URL, a
 * price taken from the client, or a confirm sent before the money landed
 * shows up as a failed assertion rather than as a real garment printed on
 * credit.
 */

const SECRET = 'whsec_test_secret';
const PRODUCT = {
  sync_product: { id: 501, name: 'Unisex Hoodie', thumbnail_url: 'https://files.cdn.printful.com/hoodie.png' },
  sync_variants: [
    { id: 9001, variant_id: 4011, name: 'Unisex Hoodie - Black / S', retail_price: '45.00', currency: 'USD', availability_status: 'active', product: { variant_id: 4011, product_id: 146, name: 'Hoodie Black / S' }, options: [{ id: 'stitch_color', value: 'white' }], files: [{ id: 771, type: 'front', url: 'https://files.cdn.printful.com/front.png', options: [{ id: 'thread_colors', value: ['#000000', '#FFFFFF'] }], position: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 } }, { type: 'preview', preview_url: 'https://files.cdn.printful.com/black.png' }] },
    { id: 9002, variant_id: 4012, name: 'Unisex Hoodie - Black / L', retail_price: '45.00', currency: 'USD', availability_status: 'active', product: { variant_id: 4012, product_id: 146, name: 'Hoodie Black / L' }, options: [{ id: 'stitch_color', value: 'white' }], files: [{ id: 771, type: 'front', url: 'https://files.cdn.printful.com/front.png' }, { type: 'preview', preview_url: 'https://files.cdn.printful.com/black.png' }] },
    { id: 9003, variant_id: 4021, name: 'Unisex Hoodie - Purple / L', retail_price: '47.50', currency: 'USD', availability_status: 'active', product: { variant_id: 4021, product_id: 146, name: 'Hoodie Purple / L' }, files: [{ id: 772, type: 'front', url: 'https://files.cdn.printful.com/front-p.png' }, { type: 'preview', preview_url: 'https://files.cdn.printful.com/purple.png' }] },
    { id: 9004, variant_id: 4022, name: 'Unisex Hoodie - Purple / XL', retail_price: '47.50', currency: 'USD', availability_status: 'out_of_stock', product: { variant_id: 4022, product_id: 146, name: 'Hoodie Purple / XL' }, files: [] },
    // No mockup for this one: the catalog photo of the blank in that colour stands in.
    { id: 9005, variant_id: 4031, name: 'Unisex Hoodie - Gold / L', retail_price: '47.50', currency: 'USD', availability_status: 'active', files: [], product: { variant_id: 4031, product_id: 146, image: 'https://files.cdn.printful.com/catalog/gold.jpg', name: 'Hoodie Gold / L' } },
  ],
};
// A beanie as Printful reports it: size field "One size", colour only in the name.
const BEANIE_OPTIONS = [
  { id: 'embroidery_type', value: 'flat' },
  { id: 'thread_colors', value: [] },
  { id: 'text_thread_colors', value: [] },
  { id: 'thread_colors_3d', value: ['#000000', '#ffffff'] },
  { id: 'license_type', value: [] },
];
const BEANIE = {
  sync_product: { id: 503, name: 'Wizard Beanie', thumbnail_url: 'https://files.cdn.printful.com/beanie.png' },
  sync_variants: [
    { id: 9201, variant_id: 6001, name: 'Wizard Beanie - Black', size: 'One size', color: null, retail_price: '22.00', currency: 'USD', availability_status: 'active', product: { variant_id: 6001, product_id: 300 }, options: BEANIE_OPTIONS, files: [{ id: 937410063, type: 'default', options: [], position: null }] },
    { id: 9202, variant_id: 6002, name: 'Wizard Beanie - White', size: 'One size', color: null, retail_price: '22.00', currency: 'USD', availability_status: 'active', product: { variant_id: 6002, product_id: 300 }, options: BEANIE_OPTIONS, files: [{ id: 937410063, type: 'default', options: [], position: null }] },
  ],
};
const BEANIE_CATALOG = { product: { id: 300, title: 'Cuffed Beanie | Yupoong 1501KC' }, variants: [
  { id: 6001, product_id: 300, color: 'Black', color_code: '#000', size: 'One size', in_stock: true },
  { id: 6002, product_id: 300, color: 'White', color_code: '#fff', size: 'One size', in_stock: true },
  { id: 6003, product_id: 300, color: 'Navy', color_code: '#003', size: 'One size', in_stock: true },
] };
// A product sold in one colour only (the last colour can never be removed).
const ONECOLOR = {
  sync_product: { id: 505, name: 'Wizard Tote', thumbnail_url: 'https://files.cdn.printful.com/tote.png' },
  sync_variants: [{ id: 9501, variant_id: 7001, name: 'Wizard Tote - Black', retail_price: '20.00', currency: 'USD', availability_status: 'active', product: { variant_id: 7001, product_id: 301 }, files: [{ id: 790, type: 'front' }] }],
};
const ONECOLOR_CATALOG = { product: { id: 301, title: 'Tote' }, variants: [{ id: 7001, product_id: 301, color: 'Black', size: 'One size', in_stock: true }, { id: 7002, product_id: 301, color: 'Natural', size: 'One size', in_stock: true }] };
// The catalog product behind the hoodie: what Printful makes it in.
const HOODIE_CATALOG = {
  product: { id: 146, title: 'Unisex Hoodie' },
  variants: [
    { id: 4011, product_id: 146, color: 'Black', color_code: '#000', size: 'S', in_stock: true },
    { id: 4012, product_id: 146, color: 'Black', color_code: '#000', size: 'L', in_stock: true },
    { id: 4013, product_id: 146, color: 'Black', color_code: '#000', size: 'XL', in_stock: true },
    { id: 4021, product_id: 146, color: 'Purple', color_code: '#609', size: 'L', in_stock: true },
    { id: 4022, product_id: 146, color: 'Purple', color_code: '#609', size: 'XL', in_stock: false },
    { id: 4031, product_id: 146, color: 'Gold', color_code: '#fc0', size: 'L', in_stock: true },
    { id: 4041, product_id: 146, color: 'White', color_code: '#fff', size: 'S', in_stock: true },
    { id: 4042, product_id: 146, color: 'White', color_code: '#fff', size: 'L', in_stock: true },
    { id: 4043, product_id: 146, color: 'White', color_code: '#fff', size: 'XL', in_stock: false },
    { id: 4044, product_id: 146, color: 'White', color_code: '#fff', size: '5XL', in_stock: true }, // a size not sold today: not added
  ],
};
const STICKER = {
  sync_product: { id: 502, name: 'Sticker of Rath', thumbnail_url: 'https://files.cdn.printful.com/rath.png' },
  sync_variants: [
    { id: 9101, variant_id: 5001, name: 'Sticker of Rath - 3″×3″', retail_price: '4.00', currency: 'USD', availability_status: 'active', files: [] },
    // Newer payloads carry the axes as fields; the name alone would also parse.
    { id: 9102, variant_id: 5002, name: 'Sticker of Rath - 5.5″×5.5″', size: '5.5″×5.5″', color: null, retail_price: '6.00', currency: 'USD', availability_status: 'active', files: [] },
    // The size field can be junk-free but old-style: the name still carries a measurement.
    { id: 9103, variant_id: 5003, name: 'Sticker of Rath - 4″×4″', size: '', color: '', retail_price: '5.00', currency: 'USD', availability_status: 'active', files: [] },
  ],
};

let calls = [];
let statements = [];
let rows = {}; // handlers keyed by a fragment of SQL -> row(s)
let draftStatus = 'draft';
let confirmFails = new Set();
let payoutCharges = [];
let stripeFails = false;
let stripeEmbeddedName = 'embedded_page'; // what the stand-in Stripe's API version calls the on-site mode

function pfEnvelope(result, code = 200) {
  return new Response(JSON.stringify({ code, result }), { status: code, headers: { 'Content-Type': 'application/json' } });
}
function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function installFetch() {
  vi.stubGlobal('fetch', async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init && init.method) || 'GET';
    const body = init && typeof init.body === 'string' ? init.body : '';
    const headers = (init && init.headers) || {};
    calls.push({ url, method, body, headers });

    if (url.startsWith('https://api.printful.com/store/products/501')) return pfEnvelope(PRODUCT);
    if (url.startsWith('https://api.printful.com/store/products/502')) return pfEnvelope(STICKER);
    if (url.startsWith('https://api.printful.com/store/products/503')) return pfEnvelope(BEANIE);
    if (url === 'https://api.printful.com/store/products/501/variants' && method === 'POST') return pfEnvelope({ id: 9900 + calls.length, ...JSON.parse(body) });
    if (/\/store\/variants\/\d+$/.test(url) && method === 'DELETE') return pfEnvelope(null);
    if (url === 'https://api.printful.com/products/146') return pfEnvelope(HOODIE_CATALOG);
    if (url === 'https://api.printful.com/products/300') return pfEnvelope(BEANIE_CATALOG);
    if (url === 'https://api.printful.com/store/products/503/variants' && method === 'POST') return pfEnvelope({ id: 9300, ...JSON.parse(body) });
    if (url.startsWith('https://api.printful.com/store/products/505')) return pfEnvelope(ONECOLOR);
    if (url === 'https://api.printful.com/products/301') return pfEnvelope(ONECOLOR_CATALOG);
    if (url.startsWith('https://api.printful.com/store/products/')) return jsonRes({ code: 404, result: 'Not Found' }, 404);
    if (url.startsWith('https://api.printful.com/shipping/rates')) {
      return pfEnvelope([
        { id: 'STANDARD', name: 'Flat Rate', rate: '4.99', currency: 'USD', minDeliveryDays: 3, maxDeliveryDays: 7 },
        { id: 'STANDARD_CO2', name: 'Standard with CO2 offsetting', rate: '4.99', currency: 'USD', minDeliveryDays: 3, maxDeliveryDays: 7 },
        { id: 'EXPRESS', name: 'Express', rate: '14.99', currency: 'USD', minDeliveryDays: 1, maxDeliveryDays: 3 },
      ]);
    }
    if (/\/orders\/\d+\/confirm$/.test(url)) {
      const ref = calls.filter((c) => c.url.includes('/orders/@')).pop();
      const reference = ref ? decodeURIComponent(ref.url.split('/orders/@')[1]) : '';
      if (confirmFails.has(reference)) return jsonRes({ code: 500, result: 'Printful is having a moment' }, 500);
      return pfEnvelope({ id: 771122, external_id: reference, status: 'pending' });
    }
    if (url.includes('https://api.printful.com/orders/@')) {
      const reference = decodeURIComponent(url.split('/orders/@')[1]);
      if (reference === 'WIZ-MISSING') return jsonRes({ code: 404, result: 'Not Found' }, 404);
      return pfEnvelope({ id: 771122, external_id: reference, status: draftStatus });
    }
    if (url.startsWith('https://api.printful.com/orders') && method === 'POST') {
      return pfEnvelope({ id: 771122, external_id: JSON.parse(body).external_id, status: 'draft' });
    }
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) {
      if (stripeFails) return jsonRes({ error: { message: 'Your card was declined, sort of' } }, 402);
      // Which name of the on-site mode this "API version" knows; the other is refused as Stripe does.
      const mode = new URLSearchParams(body).get('ui_mode');
      if (mode && mode !== stripeEmbeddedName) {
        return jsonRes({ error: { message: 'The ui_mode value `' + mode + '` is no longer supported. Use `' + stripeEmbeddedName + '` instead.' } }, 400);
      }
      return jsonRes({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123', client_secret: 'cs_test_123_secret_abc' });
    }
    if (url.startsWith('https://api.stripe.com/v1/customers')) return jsonRes({ id: 'cus_1' });
    if (url.startsWith('https://api.stripe.com/v1/balance_transactions')) {
      return jsonRes({
        data: payoutCharges.map((c) => ({ id: 'txn_' + c.id, type: 'charge', source: { object: 'charge', ...c } })),
        has_more: false,
      });
    }
    throw new Error('unexpected request: ' + method + ' ' + url);
  });
}

/** A D1 stand-in: records every statement, answers reads from `rows`. */
function fakeDb() {
  return {
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async run() {
          statements.push({ sql, args: stmt.args });
          return { success: true, meta: { changes: 1 } };
        },
        async first() {
          statements.push({ sql, args: stmt.args });
          const key = Object.keys(rows).find((k) => sql.includes(k));
          return key ? rows[key] : null;
        },
        async all() {
          statements.push({ sql, args: stmt.args });
          const key = Object.keys(rows).find((k) => sql.includes(k));
          return { results: key ? rows[key] : [] };
        },
      };
      return stmt;
    },
  };
}

function fakeCaches() {
  const store = new Map();
  return {
    default: {
      async match(req) {
        return store.get(req.url) || undefined;
      },
      async put(req, res) {
        store.set(req.url, res);
      },
      async delete(req) {
        return store.delete(req.url);
      },
    },
  };
}

function env(overrides = {}) {
  return {
    DB: fakeDb(),
    PRINTFUL_TOKEN: 'pf_fake',
    STRIPE_SECRET_KEY: 'sk_live_fake',
    STRIPE_WEBHOOK_SECRET: SECRET,
    SITE_URL: 'https://wizardshit.store',
    ...overrides,
  };
}

const ctx = { waitUntil() {} };
const CORS = { 'Access-Control-Allow-Origin': 'https://wizardshit.store' };

const RECIPIENT = {
  name: 'Sam Buyer',
  address1: '14 Example Ave',
  address2: '',
  city: 'Renton',
  state_code: 'WA',
  country_code: 'US',
  zip: '98058',
  email: 'sam@example.com',
  phone: '',
};

function post(path, body, headers = {}) {
  return new Request('https://wizardshit.store' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.' + Math.floor(Math.random() * 250), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function deliver(e, event) {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  return handleStripeWebhook(
    new Request('https://wizardshit.store/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': await signForTests(payload, SECRET, t) },
      body: payload,
    }),
    e,
  );
}

const stmt = (fragment) => statements.find((s) => s.sql.includes(fragment));
/** Runs a handler the way the Worker's router does: known errors become responses. */
async function run(promise) {
  try {
    return await promise;
  } catch (e) {
    const res = shopErrorResponse(e, CORS);
    if (res) return res;
    throw e;
  }
}
const call = (pattern, method) => calls.find((c) => pattern.test(c.url) && (!method || c.method === method));

beforeEach(() => {
  calls = [];
  statements = [];
  rows = {};
  draftStatus = 'draft';
  confirmFails = new Set();
  payoutCharges = [];
  stripeFails = false;
  stripeEmbeddedName = 'embedded_page';
  installFetch();
  vi.stubGlobal('caches', fakeCaches());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('money', () => {
  it('parses Printful decimal strings into cents without floats', () => {
    expect(parseMoney('29.50')).toBe(2950);
    expect(parseMoney('4')).toBe(400);
    expect(parseMoney('0.1')).toBe(10);
    expect(parseMoney('1234.56')).toBe(123456);
    expect(() => parseMoney('twelve')).toThrow();
  });
  it('formats cents for humans', () => {
    expect(formatMoney(4750)).toBe('$47.50');
    expect(formatMoney(100000)).toBe('$1,000.00');
    expect(formatMoney(5)).toBe('$0.05');
  });
  it('holds zero-decimal currencies in whole units, so Stripe is asked for the right amount', () => {
    expect(parseMoney('2950', 'JPY')).toBe(2950);
    expect(parseMoney('2950.00', 'JPY')).toBe(2950);
    expect(parseMoney('29.50', 'USD')).toBe(2950);
    expect(parseMoney('29.50')).toBe(2950);
    expect(formatMoney(2950, 'JPY')).toBe('JPY 2,950');
    expect(formatMoney(2950, 'jpy')).toBe('JPY 2,950');
    expect(formatMoney(-2950, 'KRW')).toBe('-KRW 2,950');
    expect(formatMoney(4750, 'USD')).toBe('$47.50');
    // Stripe still wants UGX and ISK scaled by 100 for backwards compatibility.
    expect(parseMoney('500', 'UGX')).toBe(50000);
    expect(parseMoney('500', 'ISK')).toBe(50000);
    expect(formatMoney(50000, 'UGX')).toBe('UGX 500.00');
    // A three-decimal currency mishandled would be a tenth of a charge: refuse.
    expect(() => parseMoney('5.12', 'KWD')).toThrow();
    expect(() => parseMoney('5', 'BHD')).toThrow();
  });
  it('refuses a price it could only charge by changing it', () => {
    // A fraction of a yen is not rounded to a price Printful never quoted.
    expect(() => parseMoney('2950.60', 'JPY')).toThrow();
    expect(() => parseMoney('0.50', 'JPY')).toThrow();
    // ISK/UGX/HUF/TWD amounts must end in 00 at Stripe; a fraction would be
    // rejected there, after a draft already existed — refuse up front instead.
    expect(() => parseMoney('500.50', 'UGX')).toThrow();
    expect(() => parseMoney('1000.5', 'TWD')).toThrow();
    expect(parseMoney('1000.00', 'HUF')).toBe(100000);
    // Beyond twelve integer digits a JS number is no longer exact; no real
    // price is, and a corrupted one must not be charged at all.
    expect(parseMoney('999999999999', 'USD')).toBe(99999999999900);
    expect(() => parseMoney('9007199254740993', 'USD')).toThrow();
  });
});

describe('variant names', () => {
  it('splits colour and size off Printful names', () => {
    expect(parseVariantName('Unisex Hoodie', 'Unisex Hoodie - Black / L')).toEqual({ color: 'Black', size: 'L' });
    expect(parseVariantName('Wizard Beanie', 'Wizard Beanie - Navy')).toEqual({ color: 'Navy', size: '' });
    expect(parseVariantName('Tee', 'Tee - XL')).toEqual({ color: '', size: 'XL' });
    // Measurements are sizes, whatever the marks: 3″×3″, 5.5″×5.5″, 4"x4", 18×24, 12 in.
    expect(parseVariantName('Sticker of Rath', 'Sticker of Rath - 3″×3″')).toEqual({ color: '', size: '3″×3″' });
    expect(parseVariantName('Sticker', 'Sticker - 5.5″×5.5″')).toEqual({ color: '', size: '5.5″×5.5″' });
    expect(parseVariantName('Bumper', 'Bumper - 15″×3.75″')).toEqual({ color: '', size: '15″×3.75″' });
    expect(parseVariantName('Sticker', 'Sticker - 4"x4"')).toEqual({ color: '', size: '4"x4"' });
    expect(parseVariantName('Poster', 'Poster - 18×24')).toEqual({ color: '', size: '18×24' });
    expect(parseVariantName('Poster', 'Poster - White / 12 in')).toEqual({ color: 'White', size: '12 in' });
    expect(parseVariantName('Tote', 'Tote')).toEqual({ color: '', size: '' });
  });
});

describe('stripe signatures', () => {
  it('accepts a genuine signature and rejects everything else', async () => {
    const body = '{"id":"evt_1"}';
    const t = Math.floor(Date.now() / 1000);
    const good = await signForTests(body, SECRET, t);
    expect((await verifyStripeSignature(body, good, SECRET)).valid).toBe(true);
    expect((await verifyStripeSignature(body + ' ', good, SECRET)).valid).toBe(false);
    expect((await verifyStripeSignature(body, good, 'whsec_other')).valid).toBe(false);
    expect((await verifyStripeSignature(body, null, SECRET)).valid).toBe(false);
    const stale = await signForTests(body, SECRET, t - 600);
    expect((await verifyStripeSignature(body, stale, SECRET)).reason).toMatch(/tolerance/);
  });
  it('form-encodes nested Stripe params', () => {
    const p = encodeForm({ line_items: [{ price_data: { unit_amount: 4500 } }], expand: ['data.source'] });
    expect(p.get('line_items[0][price_data][unit_amount]')).toBe('4500');
    expect(p.get('expand[0]')).toBe('data.source');
  });
});

describe('the catalog', () => {
  it('joins merch cards to Printful colours, sizes and prices, hiding sold-out options', async () => {
    rows['FROM merch_items'] = [
      { id: 1, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/unisex-hoodie', image: 'hoodie.png', sticker: 0, row_break: 0, printful_id: 501 },
      { id: 2, title: 'STICKER OF RATH', url: 'https://wizard.printful.me/product/sticker-of-rath', image: 'rath.PNG', sticker: 1, row_break: 1, printful_id: 502 },
      { id: 3, title: 'MYSTERY TOTE', url: 'https://wizard.printful.me/product/tote', image: 'tote.png', sticker: 0, row_break: 0, printful_id: null },
    ];
    const res = await handleProducts(env(), ctx, new Request('https://wizardshit.store/api/shop/products'));
    const data = await res.json();
    expect(data.shop).toBe(true);
    expect(data.mode).toBe('payout');
    const hoodie = data.products[0];
    expect(hoodie.colors).toEqual(['Black', 'Purple', 'Gold']);
    expect(hoodie.sizes).toEqual(['S', 'L']); // Purple/XL is out of stock, so XL is gone
    expect(hoodie.price_min).toBe(4500);
    expect(hoodie.price_max).toBe(4750);
    expect(hoodie.variants).toHaveLength(4);
    expect(hoodie.variants[2]).toEqual({ id: 9003, color: 'Purple', size: 'L', price: 4750, image: 'https://files.cdn.printful.com/purple.png' });
    // A colour with no mockup still gets its own picture: Printful's photo of the blank.
    expect(hoodie.variants[3].image).toBe('https://files.cdn.printful.com/catalog/gold.jpg');
    expect(data.products[1].sticker).toBe(true);
    expect(data.products[1].variants[0].price).toBe(400);
    // Sticker sizes are sizes, not colours — one from the name, one from Printful's fields.
    expect(data.products[1].colors).toEqual([]);
    expect(data.products[1].sizes).toEqual(['3″×3″', '5.5″×5.5″', '4″×4″']);
    // No Printful id: no variants, so the page keeps it as a link.
    expect(data.products[2].variants).toEqual([]);
    expect(data.products[2].url).toContain('printful.me');
  });

  it('keeps a colour that lives only in the name when Printful reports a size field', async () => {
    rows['FROM merch_items'] = [
      { id: 1, title: 'WIZARD BEANIE', url: 'https://wizard.printful.me/product/beanie', image: 'beanie.png', sticker: 0, row_break: 0, printful_id: 503 },
    ];
    const res = await handleProducts(env(), ctx, new Request('https://wizardshit.store/api/shop/products'));
    const beanie = (await res.json()).products[0];
    expect(beanie.colors).toEqual(['Black', 'White']);
    expect(beanie.sizes).toEqual(['One size']);
  });

  it('reports the shop closed with no Stripe key, so the page falls back to links', async () => {
    const res = await handleProducts(env({ STRIPE_SECRET_KEY: '' }), ctx, new Request('https://wizardshit.store/api/shop/products'));
    const data = await res.json();
    expect(data.shop).toBe(false);
    expect(data.products).toEqual([]);
    expect(call(/printful/)).toBeUndefined();
  });

  it('holds a complete grid for the full two minutes', async () => {
    rows['FROM merch_items'] = [
      { id: 1, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/h', image: 'h.png', sticker: 0, row_break: 0, printful_id: 501 },
    ];
    const res = await handleProducts(env(), ctx, new Request('https://wizardshit.store/api/shop/products'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120');
  });

  it('holds a grid Printful could not fill for seconds, not minutes', async () => {
    // A card whose product Printful will not serve: the grid still renders, but
    // that card has no variants, which the page turns back into a plain link.
    // Caching THAT for two minutes is how one rate-limit blip closes the shop.
    rows['FROM merch_items'] = [
      { id: 1, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/h', image: 'h.png', sticker: 0, row_break: 0, printful_id: 501 },
      { id: 2, title: 'GONE FOR NOW', url: 'https://wizard.printful.me/product/g', image: 'g.png', sticker: 0, row_break: 0, printful_id: 999 },
    ];
    const res = await handleProducts(env(), ctx, new Request('https://wizardshit.store/api/shop/products'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    const data = await res.json();
    expect(data.products[0].variants.length).toBeGreaterThan(0);
    expect(data.products[1].variants).toEqual([]);
  });

  it('asks Printful for the order products a few at a time, never all at once', async () => {
    // The order path is public and takes up to MAX_LINES distinct products.
    // Un-batched, one request is that many simultaneous Printful calls, which
    // is enough to trip the rate limit and empty the catalog for everyone.
    const realFetch = globalThis.fetch;
    let live = 0;
    let peak = 0;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('https://api.printful.com/store/products/')) {
        live++;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
        const id = Number(url.split('/').pop());
        return jsonRes({
          code: 200,
          result: {
            sync_product: { id, name: 'P' + id, thumbnail_url: 'https://files.cdn.printful.com/t.png' },
            sync_variants: [{ id: 7000 + id, variant_id: 100 + id, name: 'P' + id + ' - Black / M', size: 'M', color: 'Black', retail_price: '10.00', currency: 'USD', availability_status: 'active', files: [] }],
          },
        });
      }
      return realFetch(input, init);
    };
    try {
      const items = Array.from({ length: 9 }, (_, i) => ({ product_id: 600 + i, variant_id: 7600 + i, quantity: 1 }));
      const res = await run(handleShipping(post('/api/shop/shipping', { recipient: RECIPIENT, items }), env(), CORS));
      expect(res.status).toBe(200);
      expect(peak).toBeLessThanOrEqual(4);
      expect(peak).toBeGreaterThan(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

});

describe('placing an order', () => {
  it('falls back to the older name of the on-site mode when Stripe refuses the new one, and vice versa', async () => {
    stripeEmbeddedName = 'embedded'; // an account still on an API version that knows only the old name
    let res = await handlePlaceOrder(
      post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 502, variant_id: 9101, quantity: 1 }], shipping_id: 'STANDARD', checkout: 'embedded' }, { 'CF-Connecting-IP': '198.51.100.71' }),
      env(),
      CORS,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).client_secret).toBe('cs_test_123_secret_abc');
    const tries = calls.filter((c) => /checkout\/sessions/.test(c.url) && c.method === 'POST');
    expect(tries.map((c) => new URLSearchParams(c.body).get('ui_mode'))).toEqual(['embedded_page', 'embedded']);
    // The retry carries its own idempotency key, or Stripe would replay the refusal.
    expect(tries[0].headers['Idempotency-Key']).not.toBe(tries[1].headers['Idempotency-Key']);
    // Only one draft and one order row for the one order.
    expect(calls.filter((c) => /api\.printful\.com\/orders\?/.test(c.url)).length).toBe(1);
    expect(statements.filter((st) => st.sql.startsWith('INSERT INTO orders')).length).toBe(1);

    // A refusal about anything else is not retried.
    calls = [];
    stripeFails = true;
    res = await run(handlePlaceOrder(
      post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 502, variant_id: 9101, quantity: 1 }], shipping_id: 'STANDARD', checkout: 'embedded' }, { 'CF-Connecting-IP': '198.51.100.72' }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(502);
    expect(calls.filter((c) => /checkout\/sessions/.test(c.url) && c.method === 'POST').length).toBe(1);
  });

  it('adds a gift from the checkout box as its own Stripe line, inside the pinned total', async () => {
    const res = await handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'STANDARD',
        donation: 500,
        expected_total: 400 + 499 + 500,
        expected_currency: 'USD',
        checkout: 'embedded',
      }, { 'CF-Connecting-IP': '198.51.100.51' }),
      env(),
      CORS,
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.total).toBe(1399);
    expect(out.donation).toBe(500);
    const form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('400');
    expect(form.get('line_items[1][price_data][unit_amount]')).toBe('500');
    expect(form.get('line_items[1][price_data][product_data][name]')).toMatch(/donation/i);
    expect(form.get('line_items[1][quantity]')).toBe('1');
    expect(form.get('line_items[2][quantity]')).toBeNull();
    expect(form.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')).toBe('499');
    expect(form.get('return_url')).toBe('https://wizardshit.store/?order=' + out.reference + '&tip=500');
    // Printful sees only the items; the gift never becomes a product.
    const draft = JSON.parse(call(/api\.printful\.com\/orders\?/, 'POST').body);
    expect(draft.items).toEqual([{ sync_variant_id: 9101, quantity: 1 }]);
    // Recorded on the order, with the total the card is charged.
    const insert = statements.find((st) => st.sql.startsWith('INSERT INTO orders'));
    expect(insert.args[9]).toBe(1399);
    const gift = statements.find((st) => st.sql.startsWith('UPDATE orders SET donation'));
    expect(gift.args).toEqual([500, out.reference]);
  });

  it('with the gift left blank the order is exactly as before', async () => {
    const res = await handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'STANDARD',
        donation: null,
        expected_total: 400 + 499,
        expected_currency: 'USD',
      }, { 'CF-Connecting-IP': '198.51.100.52' }),
      env(),
      CORS,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).donation).toBe(0);
    const form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('line_items[1][quantity]')).toBeNull();
    expect(form.get('success_url')).toBe('https://wizardshit.store/?order=' + (await Promise.resolve(statements.find((st) => st.sql.startsWith('INSERT INTO orders')).args[0])));
    expect(statements.find((st) => st.sql.startsWith('UPDATE orders SET donation'))).toBeUndefined();
  });

  it('refuses a gift it cannot charge exactly, before drafting anything', async () => {
    for (const bad of [12.5, -1, '5', 1000001]) {
      calls = [];
      const res = await run(handlePlaceOrder(
        post('/api/shop/orders', {
          recipient: RECIPIENT,
          items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
          shipping_id: 'STANDARD',
          donation: bad,
          expected_total: 899,
        }, { 'CF-Connecting-IP': '198.51.100.6' + String(bad).length }),
        env(),
        CORS,
      ));
      expect(res.status, 'donation ' + String(bad)).toBe(400);
      expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
    }
    expect(orderDonation(undefined)).toBe(0);
    expect(orderDonation('')).toBe(0);
    expect(orderDonation(250)).toBe(250);
  });

  it('a gift that is not in the total the customer saw is refused like any other change', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'STANDARD',
        donation: 500,
        expected_total: 400 + 499, // the page showed a total without the gift
      }, { 'CF-Connecting-IP': '198.51.100.53' }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(409);
    expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
  });

  it('refuses when the total the customer saw has moved, before drafting anything', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [
          { product_id: 501, variant_id: 9003, quantity: 2 },
          { product_id: 502, variant_id: 9101, quantity: 1 },
        ],
        shipping_id: 'STANDARD',
        expected_total: 9500 + 400 + 499 - 1, // a cent short of live pricing
      }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed/i);
    // Refused before anything was drafted or recorded.
    expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
  });

  it('accepts the order when the expected total matches live pricing', async () => {
    const res = await handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [
          { product_id: 501, variant_id: 9003, quantity: 2 },
          { product_id: 502, variant_id: 9101, quantity: 1 },
        ],
        shipping_id: 'STANDARD',
        expected_total: 9500 + 400 + 499,
      }),
      env(),
      CORS,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).total).toBe(9500 + 400 + 499);
  });

  it('leaves an order without a real integer expected_total on live pricing, as before', async () => {
    // null (what a NaN serialises to), a digit string, a float: none switch
    // the guard on — they get live pricing, never a lockout. Each order comes
    // from its own address (outside the random pool) so the 5-second order
    // throttle can't collide across the loop.
    let n = 0;
    for (const expected_total of [null, '10399', 10399.5]) {
      n += 1;
      const res = await handlePlaceOrder(
        post('/api/shop/orders', {
          recipient: RECIPIENT,
          items: [
            { product_id: 501, variant_id: 9003, quantity: 2 },
            { product_id: 502, variant_id: 9101, quantity: 1 },
          ],
          shipping_id: 'STANDARD',
          expected_total,
        }, { 'CF-Connecting-IP': '198.51.100.' + n }),
        env(),
        CORS,
      );
      expect(res.status).toBe(200);
      expect((await res.json()).total).toBe(9500 + 400 + 499);
    }
  });

  it('still stands in a rate for an older storefront that sent no expected total', async () => {
    const res = await handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'GONE',
      }),
      env(),
      CORS,
    );
    expect(res.status).toBe(200);
  });

  it('refuses when the picked shipping option is gone, rather than standing one in', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'GONE',
        expected_total: 400 + 499,
      }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no longer available/i);
    expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
  });

  it('refuses shipping quoted in a different currency than the items, before drafting', async () => {
    // Printful quotes in the store currency; if it ever did not, adding that
    // rate to the subtotal could be off a hundredfold. Refuse instead.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.printful.com/shipping/rates')) {
        return pfEnvelope([{ id: 'STANDARD', name: 'Flat Rate', rate: '4.99', currency: 'EUR', minDeliveryDays: 3, maxDeliveryDays: 7 }]);
      }
      return realFetch(url, init);
    };
    try {
      const res = await run(handlePlaceOrder(
        post('/api/shop/orders', {
          recipient: RECIPIENT,
          items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
          shipping_id: 'STANDARD',
        }),
        env(),
        CORS,
      ));
      expect(res.status).toBe(502);
      expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('refuses a currency that is not the one it prices in', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'STANDARD',
        expected_total: 400 + 499,
        expected_currency: 'EUR',
      }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(409);
    expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
  });

  it('embeds the payment on the storefront when asked, hosted otherwise', async () => {
    const items = [{ product_id: 502, variant_id: 9101, quantity: 1 }];
    const hosted = await handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items, shipping_id: 'STANDARD' }, { 'CF-Connecting-IP': '198.51.100.21' }), env(), CORS);
    expect(hosted.status).toBe(200);
    let form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('ui_mode')).toBeNull();
    expect(form.get('success_url')).toBe('https://wizardshit.store/?order=' + encodeURIComponent((await hosted.json()).reference));

    calls.length = 0;
    const embedded = await handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items, shipping_id: 'STANDARD', checkout: 'embedded' }, { 'CF-Connecting-IP': '198.51.100.22' }), env(), CORS);
    expect(embedded.status).toBe(200);
    const out = await embedded.json();
    form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('ui_mode')).toBe('embedded_page');
    expect(form.get('return_url')).toBe('https://wizardshit.store/?order=' + encodeURIComponent(out.reference));
    expect(form.get('success_url')).toBeNull();
    expect(form.get('cancel_url')).toBeNull();
    expect(out.client_secret).toBe('cs_test_123_secret_abc');
  });

  it('publishes the Stripe key only when it is a real publishable key', async () => {
    // The status is edge-cached, so each look gets a fresh cache.
    const look = async (overrides) => {
      vi.stubGlobal('caches', fakeCaches());
      const res = await handleProducts(env(overrides), ctx, new Request('https://wizardshit.store/api/shop/products'));
      return (await res.json()).stripe_pk;
    };
    expect(await look({ STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' })).toBe('pk_test_abc');
    expect(await look({ STRIPE_PUBLISHABLE_KEY: 'sk_live_oops' })).toBeNull();
    expect(await look({})).toBeNull();
  });

  it('prices from Printful, drafts, records, and hands off to Stripe — in that order', async () => {
    const e = env();
    const res = await handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [
          { product_id: 501, variant_id: 9003, quantity: 2, price: 1 },
          { product_id: 502, variant_id: 9101, quantity: 1 },
        ],
        shipping_id: 'STANDARD',
      }),
      e,
      CORS,
    );
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
    expect(out.reference).toMatch(/^WIZ-[A-Z0-9]+-[A-Z0-9]{5}$/);
    // 2 x $47.50 + $4.00 + $4.99 shipping, from the catalog, not the browser's "price: 1".
    expect(out.total).toBe(9500 + 400 + 499);

    // The draft: confirm=false is the flag between a failed payment and a printed garment.
    const draft = call(/api\.printful\.com\/orders\?/, 'POST');
    expect(draft).toBeDefined();
    expect(draft.url).toContain('confirm=false');
    const draftBody = JSON.parse(draft.body);
    expect(draftBody.external_id).toBe(out.reference);
    expect(draftBody.items).toEqual([
      { sync_variant_id: 9003, quantity: 2 },
      { sync_variant_id: 9101, quantity: 1 },
    ]);
    expect(draftBody.recipient.zip).toBe('98058');
    expect(draftBody.shipping).toBe('STANDARD');

    // Shipping was quoted on the catalog variant ids, not the sync ids.
    const rates = call(/shipping\/rates/, 'POST');
    expect(JSON.parse(rates.body).items).toEqual([
      { variant_id: 4021, quantity: 2 },
      { variant_id: 5001, quantity: 1 },
    ]);

    // Recorded before Stripe is asked, as pending payment.
    const insert = stmt('INSERT INTO orders');
    expect(insert).toBeDefined();
    expect(insert.args[0]).toBe(out.reference);
    expect(insert.args[1]).toBe('pending_payment');
    expect(insert.args[6]).toBe(3); // units
    expect(insert.args[9]).toBe(9500 + 400 + 499); // total
    expect(JSON.parse(insert.args[5])[0]).toEqual({ variant_id: 9003, name: 'Unisex Hoodie', option: 'Purple / L', quantity: 2, unit_price: 4750 });

    // Stripe is told the server's numbers, and which order this is, twice over.
    const stripe = call(/api\.stripe\.com\/v1\/checkout\/sessions/, 'POST');
    const form = new URLSearchParams(stripe.body);
    expect(form.get('mode')).toBe('payment');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('4750');
    expect(form.get('line_items[0][quantity]')).toBe('2');
    expect(form.get('line_items[0][price_data][product_data][description]')).toBe('Purple / L');
    expect(form.get('line_items[1][price_data][unit_amount]')).toBe('400');
    expect(form.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')).toBe('499');
    expect(form.get('client_reference_id')).toBe(out.reference);
    expect(form.get('payment_intent_data[metadata][order_reference]')).toBe(out.reference);
    expect(form.get('success_url')).toBe('https://wizardshit.store/?order=' + out.reference);
    expect(form.get('customer_email')).toBe('sam@example.com');
    expect(stripe.headers['Idempotency-Key']).toBe(out.reference);
    expect(form.has('automatic_tax[enabled]')).toBe(false);

    // Nothing has been confirmed: nobody has paid.
    expect(call(/\/confirm$/)).toBeUndefined();
    expect(stmt('stripe_session = ?').args[0]).toBe('cs_test_123');
  });

  it('refuses more than the per-order cap', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 501, variant_id: 9001, quantity: MAX_UNITS_PER_ORDER + 1 }] }),
      env(),
      CORS,
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limited to 25/);
    expect(call(/printful/)).toBeUndefined();
  });

  it('refuses a sold-out option and an unknown one', async () => {
    let res = await run(handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 501, variant_id: 9004, quantity: 1 }] }), env(), CORS));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/sold out/);
    res = await run(handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 501, variant_id: 1, quantity: 1 }] }), env(), CORS));
    expect(res.status).toBe(409);
    expect(call(/api\.printful\.com\/orders/, 'POST')).toBeUndefined();
  });

  it('refuses an address it cannot ship to', async () => {
    const res = await run(handlePlaceOrder(post('/api/shop/orders', { recipient: { ...RECIPIENT, zip: '' }, items: [{ product_id: 501, variant_id: 9001, quantity: 1 }] }), env(), CORS));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/postal code/);
  });

  it('leaves an inert draft and a failed row when Stripe refuses the session', async () => {
    stripeFails = true;
    const res = await run(handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 501, variant_id: 9001, quantity: 1 }] }), env(), CORS));
    expect(res.status).toBe(502);
    expect(stmt("status = 'payment_failed'")).toBeDefined();
    expect(call(/\/confirm$/)).toBeUndefined();
  });

  it('turns on Stripe Tax against the shipping address when asked', async () => {
    const res = await handlePlaceOrder(post('/api/shop/orders', { recipient: RECIPIENT, items: [{ product_id: 501, variant_id: 9001, quantity: 1 }] }), env({ STRIPE_TAX: 'true' }), CORS);
    expect(res.status).toBe(200);
    const customer = call(/v1\/customers/, 'POST');
    expect(new URLSearchParams(customer.body).get('shipping[address][postal_code]')).toBe('98058');
    const form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('automatic_tax[enabled]')).toBe('true');
    expect(form.get('customer')).toBe('cus_1');
    expect(form.get('line_items[0][price_data][tax_behavior]')).toBe('exclusive');
  });

  it('quotes shipping for a cart', async () => {
    const res = await handleShipping(post('/api/shop/shipping', { recipient: { ...RECIPIENT, email: undefined, name: undefined }, items: [{ product_id: 501, variant_id: 9001, quantity: 1 }] }), env(), CORS);
    const out = await res.json();
    expect(out.subtotal).toBe(4500);
    // Printful's carbon-offset twin of the standard service is not offered.
    expect(out.rates.map((r) => [r.id, r.rate])).toEqual([
      ['STANDARD', 499],
      ['EXPRESS', 1499],
    ]);
  });

  it('never lets an order ride the carbon-offset rate, even when named directly', async () => {
    const res = await run(handlePlaceOrder(
      post('/api/shop/orders', {
        recipient: RECIPIENT,
        items: [{ product_id: 502, variant_id: 9101, quantity: 1 }],
        shipping_id: 'STANDARD_CO2',
        expected_total: 400 + 499,
        expected_currency: 'USD',
      }, { 'CF-Connecting-IP': '198.51.100.41' }),
      env(),
      CORS,
    ));
    // The pinned-total guard sees the pick is gone and refuses before drafting.
    expect(res.status).toBe(409);
    expect(call(/api\.printful\.com\/orders\?/, 'POST')).toBeUndefined();
  });

  it('still offers a carbon-offset rate when it is the only way to ship', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.printful.com/shipping/rates')) {
        return pfEnvelope([{ id: 'STANDARD_CO2', name: 'Standard with CO2 offsetting', rate: '4.99', currency: 'USD', minDeliveryDays: 3, maxDeliveryDays: 7 }]);
      }
      return realFetch(url, init);
    };
    try {
      const res = await handleShipping(post('/api/shop/shipping', { recipient: { ...RECIPIENT, email: undefined, name: undefined }, items: [{ product_id: 502, variant_id: 9101, quantity: 1 }] }), env(), CORS);
      expect((await res.json()).rates.map((r) => r.id)).toEqual(['STANDARD_CO2']);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('the webhook', () => {
  const paidSession = (reference, extra = {}) => ({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', client_reference_id: reference, payment_status: 'paid', payment_intent: 'pi_1', customer_details: { email: 'sam@example.com', name: 'Sam' }, ...extra } },
  });

  it('refuses a forged signature, so nobody can mark their own order paid', async () => {
    const payload = JSON.stringify(paidSession('WIZ-FORGED'));
    const res = await handleStripeWebhook(
      new Request('https://wizardshit.store/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=' + '0'.repeat(64) }, body: payload }),
      env(),
    );
    expect(res.status).toBe(400);
    expect(statements).toEqual([]);
  });

  it('records a payment and holds the draft until the payout (default mode)', async () => {
    const res = await deliver(env(), paidSession('WIZ-ONE'));
    expect(await res.json()).toEqual({ received: true, confirmed: false, heldForPayout: true });
    const paid = stmt("status = 'paid'");
    expect(paid).toBeDefined();
    expect(paid.args).toContain('WIZ-ONE');
    expect(paid.args).toContain('pi_1');
    expect(call(/\/confirm$/)).toBeUndefined();
  });

  it('confirms on the charge when confirm-on-payout is switched off', async () => {
    const res = await deliver(env({ CONFIRM_ON_PAYOUT: 'false' }), paidSession('WIZ-NOW'));
    expect(await res.json()).toEqual({ received: true, confirmed: true });
    expect(call(/\/orders\/@WIZ-NOW/)).toBeDefined();
    expect(call(/\/confirm$/, 'POST')).toBeDefined();
    const confirmed = stmt("status = 'confirmed'");
    expect(confirmed.args).toEqual([771122, 'pending', 'WIZ-NOW']);
  });

  it('never confirms on test keys, secret or restricted', async () => {
    for (const key of ['sk_test_x', 'rk_test_x']) {
      calls = [];
      const res = await deliver(env({ STRIPE_SECRET_KEY: key, CONFIRM_ON_PAYOUT: 'false' }), paidSession('WIZ-TEST'));
      expect(await res.json()).toEqual({ received: true, confirmed: false, testMode: true });
      expect(call(/\/confirm$/)).toBeUndefined();
    }
    // A live restricted key is live.
    calls = [];
    const live = await deliver(env({ STRIPE_SECRET_KEY: 'rk_live_x', CONFIRM_ON_PAYOUT: 'false' }), paidSession('WIZ-LIVE'));
    expect((await live.json()).confirmed).toBe(true);
  });

  it('leaves an unpaid session alone', async () => {
    const res = await deliver(env(), paidSession('WIZ-UNPAID', { payment_status: 'unpaid' }));
    expect((await res.json()).confirmed).toBe(false);
    expect(stmt("status = 'paid'")).toBeUndefined();
  });

  it('records a donation when its session is paid', async () => {
    const res = await deliver(env(), {
      id: 'evt_d',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_d', client_reference_id: 'GIFT-ONE', payment_status: 'paid', amount_total: 2500, payment_intent: 'pi_d', metadata: { kind: 'donation', donation_reference: 'GIFT-ONE' }, customer_details: { email: 'fan@example.com', name: 'A Fan' } } },
    });
    expect(await res.json()).toEqual({ received: true, donation: 'GIFT-ONE' });
    const upd = stmt('UPDATE donations');
    expect(upd.args).toEqual(['cs_d', 'pi_d', 2500, 'fan@example.com', 'A Fan', 'GIFT-ONE']);
    expect(call(/printful/)).toBeUndefined();
  });

  it('confirms every order in a payout, banks the donations, and skips refunds', async () => {
    payoutCharges = [
      { id: 'ch_1', metadata: { order_reference: 'WIZ-A' } },
      { id: 'ch_2', metadata: { order_reference: 'WIZ-B' } },
      { id: 'ch_3', metadata: { kind: 'donation', donation_reference: 'GIFT-A' } },
      { id: 'ch_4', metadata: { order_reference: 'WIZ-REFUNDED' }, refunded: true },
      { id: 'ch_5', metadata: {} }, // something else on the account
    ];
    const res = await deliver(env(), { id: 'evt_p', type: 'payout.paid', data: { object: { id: 'po_1', object: 'payout', status: 'paid' } } });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.orders).toEqual(['WIZ-A', 'WIZ-B']);
    expect(out.donations).toEqual(['GIFT-A']);
    expect(call(/balance_transactions\?payout=po_1/)).toBeDefined();
    expect(calls.filter((c) => /\/confirm$/.test(c.url))).toHaveLength(2);
    expect(statements.filter((s) => s.sql.includes("status = 'confirmed'")).map((s) => s.args[2])).toEqual(['WIZ-A', 'WIZ-B']);
    expect(stmt("'paid_out'").args).toEqual(['po_1', 'GIFT-A']);
    const refunded = stmt("UPDATE orders SET status = 'refunded'");
    expect(refunded.args).toEqual(['WIZ-REFUNDED']);
  });

  it('asks Stripe to retry when one confirm fails, without re-confirming the rest', async () => {
    payoutCharges = [
      { id: 'ch_a', metadata: { order_reference: 'WIZ-FINE' } },
      { id: 'ch_b', metadata: { order_reference: 'WIZ-BROKEN' } },
    ];
    confirmFails = new Set(['WIZ-BROKEN']);
    const first = await deliver(env(), { id: 'evt_p2', type: 'payout.paid', data: { object: { id: 'po_2', object: 'payout' } } });
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ error: 'Could not confirm every order.', confirmed: ['WIZ-FINE'], failed: ['WIZ-BROKEN'] });

    calls = [];
    confirmFails = new Set();
    draftStatus = 'pending'; // Printful now says both are past draft
    const retry = await deliver(env(), { id: 'evt_p2', type: 'payout.paid', data: { object: { id: 'po_2', object: 'payout' } } });
    expect(retry.status).toBe(200);
    expect(calls.filter((c) => /\/confirm$/.test(c.url))).toHaveLength(0);
  });

  it('with confirm-on-payout off, a payout only does the bookkeeping', async () => {
    payoutCharges = [{ id: 'ch_1', metadata: { order_reference: 'WIZ-A' } }];
    const res = await deliver(env({ CONFIRM_ON_PAYOUT: 'false' }), { id: 'evt_p3', type: 'payout.paid', data: { object: { id: 'po_3' } } });
    expect(res.status).toBe(200);
    expect(stmt('stripe_payout = ? WHERE reference').args).toEqual(['po_3', 'WIZ-A']);
    expect(call(/\/confirm$/)).toBeUndefined();
  });

  it('marks a paid-but-missing order so a human sees it', async () => {
    payoutCharges = [{ id: 'ch_m', metadata: { order_reference: 'WIZ-MISSING' } }];
    const res = await deliver(env(), { id: 'evt_p4', type: 'payout.paid', data: { object: { id: 'po_4' } } });
    expect((await res.json()).missing).toEqual(['WIZ-MISSING']);
    expect(stmt("status = 'missing'")).toBeDefined();
  });

  it('records refunds and failed payments, and ignores the rest', async () => {
    let res = await deliver(env(), { id: 'e1', type: 'charge.refunded', data: { object: { refunded: true, metadata: { order_reference: 'WIZ-R' } } } });
    expect(res.status).toBe(200);
    expect(stmt("UPDATE orders SET status = 'refunded'").args).toEqual(['WIZ-R']);
    res = await deliver(env(), { id: 'e2', type: 'checkout.session.async_payment_failed', data: { object: { client_reference_id: 'WIZ-F', metadata: {} } } });
    expect(stmt("status = 'payment_failed'").args).toEqual(['WIZ-F']);
    res = await deliver(env(), { id: 'e3', type: 'customer.created', data: { object: {} } });
    expect(await res.json()).toEqual({ received: true, ignored: 'customer.created' });
  });

  it('walks a paginated payout', async () => {
    vi.stubGlobal('fetch', async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push({ url });
      const u = new URL(url);
      if (u.searchParams.get('starting_after') === 'txn_1') {
        return jsonRes({ data: [{ id: 'txn_2', type: 'charge', source: { object: 'charge', id: 'ch_2', metadata: { order_reference: 'WIZ-P2' } } }], has_more: false });
      }
      return jsonRes({ data: [{ id: 'txn_1', type: 'charge', source: { object: 'charge', id: 'ch_1', metadata: { order_reference: 'WIZ-P1' } } }], has_more: true });
    });
    const out = await chargesInPayout(env(), 'po_9');
    expect(out.orders.map((o) => o.reference)).toEqual(['WIZ-P1', 'WIZ-P2']);
    expect(calls).toHaveLength(2);
  });
});

describe('donations', () => {
  it('creates a donate session and records the gift as pending', async () => {
    const res = await handleDonate(post('/api/donate', { amount: 2500, name: 'A Fan', message: 'love the show', public: true }), env(), CORS);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.reference).toMatch(/^GIFT-/);
    const insert = stmt('INSERT INTO donations');
    expect(insert.args).toEqual([out.reference, 2500, 'A Fan', 'love the show', 1]);
    const form = new URLSearchParams(call(/checkout\/sessions/, 'POST').body);
    expect(form.get('submit_type')).toBe('donate');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('2500');
    expect(form.get('metadata[kind]')).toBe('donation');
    expect(form.get('payment_intent_data[metadata][donation_reference]')).toBe(out.reference);
    expect(form.get('success_url')).toBe('https://wizardshit.store/?donated=' + out.reference);
  });

  it('refuses silly amounts', async () => {
    // Distinct IPs so the per-IP throttle can't collide across the three calls.
    let res = await run(handleDonate(post('/api/donate', { amount: 50 }, { 'CF-Connecting-IP': '198.51.100.31' }), env(), CORS));
    expect(res.status).toBe(400);
    res = await run(handleDonate(post('/api/donate', { amount: 12.5 }, { 'CF-Connecting-IP': '198.51.100.32' }), env(), CORS));
    expect(res.status).toBe(400);
    res = await run(handleDonate(post('/api/donate', { amount: 99999999 }, { 'CF-Connecting-IP': '198.51.100.33' }), env(), CORS));
    expect(res.status).toBe(400);
    expect(call(/stripe/)).toBeUndefined();
  });

  it('is off without a Stripe key', async () => {
    const res = await run(handleDonate(post('/api/donate', { amount: 500 }), env({ STRIPE_SECRET_KEY: '' }), CORS));
    expect(res.status).toBe(503);
  });
});

describe('the console', () => {
  it('clones an embroidered beanie with its thread colours filled in the way Printful accepts', async () => {
    const res = await adminAddColor(env(), 503, 'Navy');
    expect(res.status).toBe(200);
    const post = JSON.parse(calls.find((c) => c.url.endsWith('/store/products/503/variants') && c.method === 'POST').body);
    expect(post.variant_id).toBe(6003);
    expect(post.files).toEqual([{ id: 937410063, type: 'default' }]);
    // Empty slots dropped, hex uppercased, and thread_colors filled from the list that had values.
    expect(post.options).toEqual([
      { id: 'embroidery_type', value: 'flat' },
      { id: 'thread_colors_3d', value: ['#000000', '#FFFFFF'] },
      { id: 'thread_colors', value: ['#000000', '#FFFFFF'] },
    ]);
    expect(cloneOptions([{ id: 'thread_colors', value: ['#cc3366'] }, { id: 'x', value: '' }])).toEqual([{ id: 'thread_colors', value: ['#CC3366'] }]);
    expect(cloneOptions(undefined)).toEqual([]);
  });

  it('redacts keys and long ids out of upstream error text', () => {
    expect(redactUpstream('Invalid API Key provided: rk_live_****abcd????')).toBe('Invalid API Key provided: rk_…');
    expect(redactUpstream('bad whsec_1234567890abcdef here')).toBe('bad whsec_… here');
    expect(redactUpstream('scopes: sync_products/write (store 12345678)')).toBe('scopes: sync_products/write (store …)');
    expect(redactUpstream('order 12345 ok')).toBe('order 12345 ok'); // short numbers are fine
    expect(redactUpstream('Allowed values: #FFFFFF, #000000, #333333, #96A1A8')).toBe('Allowed values: #FFFFFF, #000000, #333333, #96A1A8'); // hex colours are not ids
  });

  it('lists the colours Printful makes a product in, and which are sold', async () => {
    const out = await (await adminProductColors(env(), 501)).json();
    expect(out.product).toEqual({ id: 501, name: 'Unisex Hoodie', catalog_id: 146, catalog_name: 'Unisex Hoodie' });
    expect(out.sizes).toEqual(['S', 'L', 'XL']);
    const by = Object.fromEntries(out.colors.map((c) => [c.color, c]));
    expect(by.Black).toMatchObject({ offered: 2, would_add: 1, color_code: '#000' }); // XL not sold yet
    expect(by.White).toMatchObject({ offered: 0, would_add: 3 }); // S, L, XL — never 5XL
    expect(by.Purple).toMatchObject({ offered: 2, would_add: 0, in_stock: 1 });
    // The design data a copy is made from, per variant, previews left out.
    expect(out.design[0]).toEqual({
      id: 9001, color: 'Black', size: 'S', options: [{ id: 'stitch_color', value: 'white' }],
      files: [{ id: 771, type: 'front', options: [{ id: 'thread_colors', value: ['#000000', '#FFFFFF'] }], position: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 } }],
    });
  });

  it('adds a colour by cloning the design onto it in every size sold, then clears the catalog cache', async () => {
    vi.stubGlobal('caches', fakeCaches());
    await caches.default.put(new Request('https://wizardshit.store/api/shop/products'), new Response('stale'));
    const res = await adminAddColor(env(), 501, 'White');
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.created.map((c) => c.size)).toEqual(['S', 'L', 'XL']);
    expect(out.failed).toEqual([]);
    const posts = calls.filter((c) => c.url.endsWith('/store/products/501/variants') && c.method === 'POST').map((c) => JSON.parse(c.body));
    expect(posts.map((b) => b.variant_id)).toEqual([4041, 4042, 4043]);
    // Same size's design where one exists (S -> Black/S file 771, with the file's own thread colours and placement, and the variant's options).
    const file771 = { id: 771, type: 'front', options: [{ id: 'thread_colors', value: ['#000000', '#FFFFFF'] }], position: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 } };
    expect(posts[0]).toEqual({ variant_id: 4041, retail_price: '45.00', files: [file771], options: [{ id: 'stitch_color', value: 'white' }], is_ignored: false });
    // L copies Black/L (file 771 without options: none to copy).
    expect(posts[1].files).toEqual([{ id: 771, type: 'front' }]);
    // XL: the only XL sold (Purple/XL) has no design file, so it is never the template; the first variant with one is.
    expect(posts[2].files).toEqual([file771]);
    expect(await caches.default.match(new Request('https://wizardshit.store/api/shop/products'))).toBeUndefined();
    // Nothing to add is a refusal, not a silent no-op.
    const dup = await run(adminAddColor(env(), 501, 'Purple'));
    expect(dup.status).toBe(409);
    // Printful refusing every size: the reason reaches the console's `error` field, redacted.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/store/products/501/variants') && init.method === 'POST') {
        return jsonRes({ code: 403, result: 'This endpoint requires any of the following scopes granted: sync_products/write! (store 12345678)' }, 403);
      }
      return realFetch(url, init);
    };
    try {
      const res = await adminAddColor(env(), 501, 'White');
      expect(res.status).toBe(502);
      const out = await res.json();
      expect(out.created).toEqual([]);
      expect(out.failed).toHaveLength(3);
      expect(out.error).toMatch(/would not add White: S — .*sync_products\/write/);
      expect(out.error).not.toContain('12345678');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('removes a colour by deleting its variants, but never the last colour', async () => {
    const out = await (await adminRemoveColor(env(), 501, 'Purple')).json();
    expect(out.removed.map((r) => r.id)).toEqual([9003, 9004]);
    expect(calls.filter((c) => /\/store\/variants\/900[34]$/.test(c.url) && c.method === 'DELETE')).toHaveLength(2);
    const none = await run(adminRemoveColor(env(), 501, 'Teal'));
    expect(none.status).toBe(409);
    // A one-colour product keeps it.
    const last = await run(adminRemoveColor(env(), 505, 'Black'));
    expect(last.status).toBe(409);
    expect((await last.json()).error).toMatch(/only colour left/i);
    expect(calls.filter((c) => /\/store\/variants\/9501$/.test(c.url))).toHaveLength(0);
  });

  it("lists every card's Printful variants with stock status, so a missing colour explains itself", async () => {
    rows['FROM merch_items'] = [
      { id: 1, title: 'EARL CROUCH HOODIE', visible: 1, printful_id: 501 },
      { id: 3, title: 'MYSTERY TOTE', visible: 0, printful_id: null },
    ];
    const out = await (await adminCatalogHealth(env())).json();
    expect(out.products).toHaveLength(2);
    const hoodie = out.products[0];
    expect(hoodie.printful_name).toBe('Unisex Hoodie');
    // Purple / XL is out of stock at Printful: listed, flagged, not on the site.
    const xl = hoodie.variants.find((v) => v.size === 'XL');
    expect(xl).toMatchObject({ color: 'Purple', status: 'out_of_stock', on_site: false, price: 4750 });
    expect(hoodie.variants.filter((v) => v.on_site)).toHaveLength(4);
    expect(out.products[1]).toMatchObject({ title: 'MYSTERY TOTE', visible: false, printful_id: null, variants: [] });
  });

  it('cleans a pasted secret of quotes, line breaks and invisible characters', () => {
    expect(cleanSecret('"rk_live_abc"\r\n')).toBe('rk_live_abc');
    expect(cleanSecret(" 'whsec_x'\n")).toBe('whsec_x');
    expect(cleanSecret('\u200brk_live_q\ufeff')).toBe('rk_live_q');
    expect(cleanSecret('rk_live_q\u00a0')).toBe('rk_live_q');
    expect(cleanSecret('plain-token')).toBe('plain-token');
    expect(cleanSecret(undefined)).toBe('');
  });

  it('reports the shape of each secret and whether the upstream takes it, never the value', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.startsWith('https://api.stripe.com/v1/checkout/sessions')) {
        const key = (init.headers.Authorization || '').replace('Bearer ', '');
        return key === 'rk_live_good'
          ? jsonRes({ object: 'list', data: [] })
          : jsonRes({ error: { message: 'Invalid API Key provided: rk_live_****????' } }, 401);
      }
      if (u === 'https://api.printful.com/store/products?limit=1') return pfEnvelope([]);
      return realFetch(url, init);
    };
    try {
      let out = await (await adminShopHealth(env({ STRIPE_SECRET_KEY: '"rk_live_good"\r\n', PRINTFUL_TOKEN: 'pf_fake', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PUBLISHABLE_KEY: 'pk_live_1' }))).json();
      expect(out.stripe).toEqual({ set: true, prefix: 'rk_', length: 12, stray: true, odd: 0, test_mode: false, live: 'ok' });
      expect(out.printful.live).toBe('ok');
      expect(out.webhook).toEqual({ set: true, prefix: 'whsec_', length: 7, stray: false, odd: 0 });
      expect(out.publishable).toBe(true);
      expect(JSON.stringify(out)).not.toContain('rk_live_good');
      out = await (await adminShopHealth(env({ STRIPE_SECRET_KEY: 'rk_live_bаd!', STRIPE_WEBHOOK_SECRET: '' }))).json(); // a Cyrillic а and a !
      expect(out.stripe.live).toMatch(/Invalid API Key/);
      expect(out.stripe.odd).toBe(2);
      expect(out.webhook.set).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('lists gifts left with an order beside DONATE gifts, and counts both', async () => {
    forgetSchemaForTests();
    rows['PRAGMA table_info(orders)'] = [{ name: 'reference' }, { name: 'total' }];
    rows['FROM donations UNION ALL'] = [
      { reference: 'GIFT-1', status: 'paid_out', amount: 2500, currency: 'USD', source: 'gift' },
      { reference: 'WIZ-1', status: 'paid', amount: 500, currency: 'USD', source: 'order' },
    ];
    rows["THEN 1 END) AS gifts FROM donations"] = { received: 2500, in_bank: 2500, gifts: 1 };
    rows['FROM orders WHERE donation > 0'] = { received: 500, in_bank: 0, gifts: 1 };
    const res = await adminDonations(env());
    const out = await res.json();
    expect(out.donations.map((d) => d.reference)).toEqual(['GIFT-1', 'WIZ-1']);
    expect(out.totals).toEqual({ received: 3000, in_bank: 2500, gifts: 2 });
    // The column is added in place when an older table lacks it.
    expect(statements.some((st) => st.sql.startsWith('ALTER TABLE orders ADD COLUMN donation'))).toBe(true);
  });

  it('lets the owner confirm a paid order by hand, and nothing else', async () => {
    rows['SELECT status FROM orders'] = { status: 'paid' };
    const res = await adminConfirmOrder(env(), 'WIZ-HAND');
    expect((await res.json()).ok).toBe(true);
    expect(call(/\/confirm$/, 'POST')).toBeDefined();

    calls = [];
    rows['SELECT status FROM orders'] = { status: 'pending_payment' };
    await expect(adminConfirmOrder(env(), 'WIZ-UNPAID')).rejects.toThrow(/not paid/);
    expect(call(/\/confirm$/)).toBeUndefined();

    rows['SELECT status FROM orders'] = { status: 'paid' };
    await expect(adminConfirmOrder(env({ STRIPE_SECRET_KEY: 'sk_test_x' }), 'WIZ-T')).rejects.toThrow(/test keys/);
  });
});
