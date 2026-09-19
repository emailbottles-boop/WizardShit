import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_UNITS_PER_ORDER,
  adminConfirmOrder,
  chargesInPayout,
  encodeForm,
  formatMoney,
  handleDonate,
  handlePlaceOrder,
  handleProducts,
  handleShipping,
  handleStripeWebhook,
  parseMoney,
  parseVariantName,
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
    { id: 9001, variant_id: 4011, name: 'Unisex Hoodie - Black / S', retail_price: '45.00', currency: 'USD', availability_status: 'active', files: [{ type: 'preview', preview_url: 'https://files.cdn.printful.com/black.png' }] },
    { id: 9002, variant_id: 4012, name: 'Unisex Hoodie - Black / L', retail_price: '45.00', currency: 'USD', availability_status: 'active', files: [{ type: 'preview', preview_url: 'https://files.cdn.printful.com/black.png' }] },
    { id: 9003, variant_id: 4021, name: 'Unisex Hoodie - Purple / L', retail_price: '47.50', currency: 'USD', availability_status: 'active', files: [{ type: 'preview', preview_url: 'https://files.cdn.printful.com/purple.png' }] },
    { id: 9004, variant_id: 4022, name: 'Unisex Hoodie - Purple / XL', retail_price: '47.50', currency: 'USD', availability_status: 'out_of_stock', files: [] },
  ],
};
const STICKER = {
  sync_product: { id: 502, name: 'Sticker of Rath', thumbnail_url: 'https://files.cdn.printful.com/rath.png' },
  sync_variants: [{ id: 9101, variant_id: 5001, name: 'Sticker of Rath - 3″×3″', retail_price: '4.00', currency: 'USD', availability_status: 'active', files: [] }],
};

let calls = [];
let statements = [];
let rows = {}; // handlers keyed by a fragment of SQL -> row(s)
let draftStatus = 'draft';
let confirmFails = new Set();
let payoutCharges = [];
let stripeFails = false;

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
    if (url.startsWith('https://api.printful.com/store/products/')) return jsonRes({ code: 404, result: 'Not Found' }, 404);
    if (url.startsWith('https://api.printful.com/shipping/rates')) {
      return pfEnvelope([
        { id: 'STANDARD', name: 'Flat Rate', rate: '4.99', currency: 'USD', minDeliveryDays: 3, maxDeliveryDays: 7 },
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
      return jsonRes({ id: 'cs_test_123', url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
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
});

describe('variant names', () => {
  it('splits colour and size off Printful names', () => {
    expect(parseVariantName('Unisex Hoodie', 'Unisex Hoodie - Black / L')).toEqual({ color: 'Black', size: 'L' });
    expect(parseVariantName('Wizard Beanie', 'Wizard Beanie - Navy')).toEqual({ color: 'Navy', size: '' });
    expect(parseVariantName('Tee', 'Tee - XL')).toEqual({ color: '', size: 'XL' });
    expect(parseVariantName('Sticker of Rath', 'Sticker of Rath - 3″×3″')).toEqual({ color: '3″×3″', size: '' });
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
    expect(hoodie.colors).toEqual(['Black', 'Purple']);
    expect(hoodie.sizes).toEqual(['S', 'L']); // Purple/XL is out of stock, so XL is gone
    expect(hoodie.price_min).toBe(4500);
    expect(hoodie.price_max).toBe(4750);
    expect(hoodie.variants).toHaveLength(3);
    expect(hoodie.variants[2]).toEqual({ id: 9003, color: 'Purple', size: 'L', price: 4750, image: 'https://files.cdn.printful.com/purple.png' });
    expect(data.products[1].sticker).toBe(true);
    expect(data.products[1].variants[0].price).toBe(400);
    // No Printful id: no variants, so the page keeps it as a link.
    expect(data.products[2].variants).toEqual([]);
    expect(data.products[2].url).toContain('printful.me');
  });

  it('reports the shop closed with no Stripe key, so the page falls back to links', async () => {
    const res = await handleProducts(env({ STRIPE_SECRET_KEY: '' }), ctx, new Request('https://wizardshit.store/api/shop/products'));
    const data = await res.json();
    expect(data.shop).toBe(false);
    expect(data.products).toEqual([]);
    expect(call(/printful/)).toBeUndefined();
  });
});

describe('placing an order', () => {
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
    expect(out.rates.map((r) => [r.id, r.rate])).toEqual([
      ['STANDARD', 499],
      ['EXPRESS', 1499],
    ]);
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

  it('never confirms on test keys', async () => {
    const res = await deliver(env({ STRIPE_SECRET_KEY: 'sk_test_x', CONFIRM_ON_PAYOUT: 'false' }), paidSession('WIZ-TEST'));
    expect(await res.json()).toEqual({ received: true, confirmed: false, testMode: true });
    expect(call(/\/confirm$/)).toBeUndefined();
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
    let res = await run(handleDonate(post('/api/donate', { amount: 50 }), env(), CORS));
    expect(res.status).toBe(400);
    res = await run(handleDonate(post('/api/donate', { amount: 12.5 }), env(), CORS));
    expect(res.status).toBe(400);
    res = await run(handleDonate(post('/api/donate', { amount: 99999999 }), env(), CORS));
    expect(res.status).toBe(400);
    expect(call(/stripe/)).toBeUndefined();
  });

  it('is off without a Stripe key', async () => {
    const res = await run(handleDonate(post('/api/donate', { amount: 500 }), env({ STRIPE_SECRET_KEY: '' }), CORS));
    expect(res.status).toBe(503);
  });
});

describe('the console', () => {
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
