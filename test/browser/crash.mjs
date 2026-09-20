// Crash tests: edge cases the happy-path tests don't cover.
// Each scenario runs in its own browser context (fresh localStorage) and fails
// loudly on the first broken assertion or any uncaught page error.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8090;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.PNG': 'image/png', '.mp4': 'video/mp4' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const base = 'http://localhost:' + PORT;

// A hoodie with a deliberate hole: Purple exists only in L (no Purple/S) -> SOLD OUT combo.
const HOODIE = { id: 1, printful_id: 501, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/unisex-hoodie', image: 'hoodie-front.png', sticker: false, row_break: false, currency: 'USD', price_min: 4500, price_max: 4750, colors: ['Black', 'Purple'], sizes: ['S', 'L'],
  variants: [
    { id: 9001, color: 'Black', size: 'S', price: 4500, image: 'hoodie-front.png' },
    { id: 9002, color: 'Black', size: 'L', price: 4500, image: 'hoodie-front.png' },
    { id: 9003, color: 'Purple', size: 'L', price: 4750, image: 'hoodie-2.png' },
  ] };
const STICKER = { id: 2, printful_id: 502, title: 'STICKER OF RATH', url: 'https://wizard.printful.me/product/sticker-of-rath', image: 'rath.PNG', sticker: true, row_break: false, currency: 'USD', price_min: 400, price_max: 400, colors: [], sizes: [], variants: [{ id: 9101, color: '', size: '', price: 400, image: '' }] };
const PRODUCTS = { shop: true, donate: true, mode: 'payout', products: [HOODIE, STICKER] };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
let failures = 0;
const results = [];
let seenOrder = null;

// Make a fresh page wired to a configurable stub. opts:
//   productsStatus: HTTP status for /api/shop/products (default 200)
//   noShip: true -> shipping quote returns no rates
async function mkPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('https://wizardshit.store/**', async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
    const catalog = opts.products || PRODUCTS;
    if (p === '/api/shop/products') return json(opts.productsStatus ? { error: 'boom' } : (opts.stripePk ? { ...catalog, stripe_pk: opts.stripePk } : catalog), opts.productsStatus || 200);
    if (p === '/api/content') return json({ merch: catalog.products.map((x) => ({ title: x.title, url: x.url, image: x.image, sticker: x.sticker ? 1 : 0, row_break: 0 })), credits: [], donators: [] });
    if (p === '/api/shop/shipping') {
      if (opts.quoteDelay) await new Promise((r) => setTimeout(r, opts.quoteDelay));
      return json({ rates: opts.noShip ? [] : [{ id: 'STD', name: 'Flat Rate (Estimated delivery: Sep 26–28)', rate: 499, currency: 'USD', min_days: 3, max_days: 7 }], subtotal: opts.quoteSubtotal ?? 9900, currency: 'USD' });
    }
    if (p === '/api/shop/orders') {
      if (opts.orderError) return json({ error: opts.orderError }, 409);
      const body = route.request().postDataJSON();
      seenOrder = body;
      if (body.checkout === 'embedded' && opts.stripePk) return json({ url: null, client_secret: 'cs_secret_1', reference: 'WIZ-CRASH', total: 9999, currency: 'USD' });
      return json({ url: 'https://checkout.stripe.com/c/pay/cs_x', reference: 'WIZ-CRASH', total: 9999, currency: 'USD' });
    }
    if (p === '/api/donate') return json({ url: 'https://checkout.stripe.com/c/pay/cs_d', reference: 'GIFT-CRASH' });
    return json({ ok: true });
  });
  await page.route('https://checkout.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
  await page.route('https://js.stripe.com/**', (r) => opts.stripeJsDown ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body:
    "window.Stripe = function (pk) { return { initEmbeddedCheckout: function (o) { return Promise.resolve({ mount: function (sel) { var d = document.createElement('div'); d.className = 'fake-stripe'; d.textContent = pk + '|' + o.clientSecret; document.querySelector(sel).appendChild(d); }, destroy: function () { window.__destroyed = (window.__destroyed || 0) + 1; } }); } }; };" }));
  return { ctx, page, errors };
}

async function scenario(name, fn, opts) {
  const { ctx, page, errors } = await mkPage(opts);
  try {
    await fn(page);
    if (errors.length) throw new Error('page errors: ' + errors.join(' | '));
    results.push('  ✓ ' + name);
  } catch (e) {
    failures++;
    results.push('  ✗ ' + name + '  ->  ' + e.message);
  } finally {
    await ctx.close();
  }
}
const seed = (page, lines) => page.evaluate((ls) => localStorage.setItem('wiz_cart_v1', JSON.stringify({ lines: ls })), lines);

// A: a colour+size combo with no variant is SOLD OUT; picking a colour swaps the hero image.
await scenario('SOLD OUT for a missing colour/size combo + hero image follows colour', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable'); // hoodie is first
  await page.waitForSelector('#product.active');
  const img0 = await page.$eval('.product-hero img', (e) => e.src);
  await page.click('.product-swatch[data-color="Purple"]');
  const img1 = await page.$eval('.product-hero img', (e) => e.src);
  if (img0 === img1) throw new Error('hero image should change when colour changes');
  await page.click('.product-size[data-size="S"]'); // Purple/S does not exist
  const st = await page.$eval('.product-add', (b) => b.textContent + '|' + b.disabled);
  if (st !== 'SOLD OUT|true') throw new Error('Purple/S should be SOLD OUT + disabled, got ' + st);
  await page.click('.product-size[data-size="L"]'); // Purple/L exists
  const ok = await page.$eval('.product-add', (b) => b.textContent + '|' + b.disabled);
  if (ok !== 'ADD TO CART|false') throw new Error('Purple/L should be addable, got ' + ok);
  if ((await page.$eval('.product-price', (e) => e.textContent)) !== '$47.50') throw new Error('Purple/L price wrong');
});

// B: the 25-unit cap holds — the cart flags it and further adds are refused.
await scenario('MAX_UNITS cap (25): cart flags it, product page refuses more', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 25 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  if (!/25/.test(await page.$eval('#cartCap', (e) => e.textContent))) throw new Error('cart should show the 25-unit cap note');
  const plusDisabled = await page.$eval('#cartLines .cart-qtystep .qty-btn:last-child', (b) => b.disabled);
  if (!plusDisabled) throw new Error('cart + should be disabled at the cap');
  // Try to add a hoodie on top -> refused with CART IS FULL.
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable');
  await page.waitForSelector('#product.active');
  await page.click('.product-swatch[data-color="Black"]');
  await page.click('.product-size[data-size="L"]');
  await page.click('.product-add');
  await page.waitForTimeout(150);
  if ((await page.$eval('.product-add', (b) => b.textContent)) !== 'CART IS FULL') throw new Error('adding past 25 should say CART IS FULL');
  if ((await page.$eval('.cart-float .count', (e) => e.textContent)) !== '25') throw new Error('count must stay 25');
});

// C: removing the last line returns the cart to its empty state and hides checkout.
await scenario('removing the last item shows the empty state + hides checkout', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await page.click('#cartLines .cart-remove');
  await page.waitForTimeout(150);
  if (await page.$eval('#cartEmpty', (e) => getComputedStyle(e).display === 'none')) throw new Error('empty note should be visible');
  if (await page.$eval('#checkoutBox', (e) => getComputedStyle(e).display !== 'none')) throw new Error('checkout should be hidden when empty');
  if ((await page.$eval('.cart-float .count', (e) => e.textContent)) !== '') throw new Error('count should be blank when empty');
});

// D: adding the same variant twice from separate visits merges into one line.
await scenario('same variant added twice merges into one line (qty 2)', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  const openHoodieAddBlackL = async () => {
    await page.click('#merch .merch-feature.buyable');
    await page.waitForSelector('#product.active');
    await page.click('.product-swatch[data-color="Black"]');
    await page.click('.product-size[data-size="L"]');
    await page.click('.product-add');
    await page.waitForTimeout(150);
    await page.click('#backFromProductBtn');
    await page.waitForSelector('#merch.active');
  };
  await openHoodieAddBlackL();
  await openHoodieAddBlackL();
  await page.click('.cart-float');
  await page.waitForSelector('#cart.active');
  const lines = await page.$$eval('#cartLines .cart-line', (ls) => ls.length);
  if (lines !== 1) throw new Error('should be a single merged line, got ' + lines);
  if ((await page.$eval('#cartLines .qty-val', (e) => e.textContent)) !== '2') throw new Error('merged line qty should be 2');
});

// E: an un-shippable address surfaces a clear message and blocks pay.
await scenario('un-shippable address blocks pay with a clear message', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await page.fill('#checkoutForm input[name=name]', 'Nowhere');
  await page.fill('#checkoutForm input[name=email]', 'no@example.com');
  await page.fill('#checkoutForm input[name=address1]', '1 Moon Base');
  await page.fill('#checkoutForm input[name=city]', 'Luna');
  await page.fill('#checkoutForm input[name=zip]', '00000');
  await page.selectOption('#checkoutForm select[name=country_code]', 'US');
  await page.click('#payBtn');
  await page.waitForSelector('#shipOptions .shop-msg.error');
  if (!/cannot ship/i.test(await page.$eval('#shipOptions .shop-msg.error', (e) => e.textContent))) throw new Error('should say it cannot ship there');
  if (!(await page.$eval('#payBtn', (b) => b.disabled))) throw new Error('pay should be disabled with no shipping');
}, { noShip: true });

// F: if the shop API fails, tiles fall back to Printful links and nothing throws.
await scenario('API failure falls back to Printful links, no crash', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForTimeout(600);
  const tiles = await page.$$eval('#merch .merch-feature', (a) => a.map((x) => x.tagName + '|' + (x.getAttribute('href') || '')));
  if (!tiles.length) throw new Error('tiles should still be present');
  if (!tiles.every((t) => t.startsWith('A|') && /printful/.test(t))) throw new Error('tiles should be Printful links on API failure: ' + tiles.join(','));
}, { productsStatus: 500 });

// G: deep-linking straight to /cart with a saved cart renders it correctly.
await scenario('deep link to /cart renders a saved cart', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 9003, variant_id: 9003, title: 'EARL CROUCH HOODIE', option: 'Purple / L', price: 4750, currency: 'USD', image: 'hoodie-2.png', qty: 2 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== '$95.00') throw new Error('deep-linked cart subtotal wrong');
  if ((await page.$eval('.cart-float .count', (e) => e.textContent)) !== '2') throw new Error('deep-linked count wrong');
});

// H: the price is one number that follows the picked size — never a range.
// One colour (auto-picked), two sizes priced differently, like the live hoodies.
const SIZED = { id: 3, printful_id: 503, title: 'PASS THE HOODIE', url: 'https://wizard.printful.me/product/hoodie', image: 'hoodie-2.png', sticker: false, row_break: false, currency: 'USD', price_min: 2942, price_max: 3982, colors: ['Black'], sizes: ['S', '2XL'],
  variants: [
    { id: 9201, color: 'Black', size: 'S', price: 2942, image: '' },
    { id: 9202, color: 'Black', size: '2XL', price: 3982, image: '' },
  ] };
await scenario('price is one number that follows the picked size, never a range', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable');
  await page.waitForSelector('#product.active');
  const before = await page.$eval('.product-price', (e) => e.textContent);
  if (before !== '$29.42') throw new Error('should open on the lowest price as one number, got ' + JSON.stringify(before));
  await page.click('.product-size[data-size="2XL"]');
  const after = await page.$eval('.product-price', (e) => e.textContent);
  if (after !== '$39.82') throw new Error('2XL should show $39.82, got ' + after);
  const st = await page.$eval('.product-add', (b) => b.textContent + '|' + b.disabled);
  if (st !== 'ADD TO CART|false') throw new Error('2XL should be addable at that price, got ' + st);
  await page.click('.product-size[data-size="S"]');
  if ((await page.$eval('.product-price', (e) => e.textContent)) !== '$29.42') throw new Error('S should drop back to $29.42');
  // And no product-page price may ever read as a range.
  if (/–/.test(before + after)) throw new Error('a price read as a range');
}, { products: { shop: true, donate: true, mode: 'payout', products: [SIZED] } });

// I: a line saved at an old price is brought up to date once the catalog
// arrives, and adding the same variant again merges at the current price.
await scenario('stale saved cart price reconciles to the current catalog price', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  // Sticker is $4.00 in the catalog; pretend it was saved at $1.00.
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 100, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  const each = await page.$eval('#cartLines .cart-each', (e) => e.textContent);
  if (each !== '$4.00 each') throw new Error('stale line should reconcile to $4.00 each, got ' + JSON.stringify(each));
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== '$4.00') throw new Error('subtotal should use the current price');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wiz_cart_v1')).lines[0].price);
  if (saved !== 400) throw new Error('reconciled price should be saved back, got ' + saved);
  // Add the same sticker again: merges into one line at the current price.
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await (await page.$$('#merch .merch-feature.buyable'))[1].click(); // sticker
  await page.waitForSelector('#product.active');
  await page.click('.product-add');
  await page.waitForTimeout(150);
  await page.click('#product .cart-nav'); // the floating cart is kept off the product page
  await page.waitForSelector('#cart.active .cart-line');
  if ((await page.$$eval('#cartLines .cart-line', (ls) => ls.length)) !== 1) throw new Error('should merge into one line');
  if ((await page.$eval('#cartLines .qty-val', (e) => e.textContent)) !== '2') throw new Error('merged qty should be 2');
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== '$8.00') throw new Error('2 × $4.00 should be $8.00');
});

// J: a variant Printful left with a blank axis stays pickable and priced.
// Colours ["Black"] (auto-picked, no swatch), sizes ["S","M"], but the M
// variant has no colour — it must count as the lowest price and be addable.
const BLANK_AXIS = { id: 4, printful_id: 504, title: 'WIZARD TEE', url: 'https://wizard.printful.me/product/tee', image: 'hoodie-front.png', sticker: false, row_break: false, currency: 'USD', price_min: 1500, price_max: 2000, colors: ['Black'], sizes: ['S', 'M'],
  variants: [
    { id: 9301, color: 'Black', size: 'S', price: 2000, image: '' },
    { id: 9302, color: '', size: 'M', price: 1500, image: '' },
  ] };
await scenario('blank-axis variant is priced and pickable, never SOLD OUT', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable');
  await page.waitForSelector('#product.active');
  const open = await page.$eval('.product-price', (e) => e.textContent);
  if (open !== '$15.00') throw new Error('lowest fitting price should include the blank-colour M at $15.00, got ' + open);
  await page.click('.product-size[data-size="M"]');
  const st = await page.$eval('.product-add', (b) => b.textContent + '|' + b.disabled);
  if (st !== 'ADD TO CART|false') throw new Error('M exists and must be addable, got ' + st);
  if ((await page.$eval('.product-price', (e) => e.textContent)) !== '$15.00') throw new Error('M should show $15.00');
  await page.click('.product-size[data-size="S"]');
  if ((await page.$eval('.product-price', (e) => e.textContent)) !== '$20.00') throw new Error('S should show $20.00');
}, { products: { shop: true, donate: true, mode: 'payout', products: [BLANK_AXIS] } });

// K: at the cap, re-adding a variant that is ALREADY in the cart must refuse
// (CART IS FULL), not claim ADDED while adding nothing.
await scenario('at the cap, re-adding an existing variant says CART IS FULL, not ADDED', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 25 }]);
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await (await page.$$('#merch .merch-feature.buyable'))[1].click(); // the sticker itself
  await page.waitForSelector('#product.active');
  await page.click('.product-add');
  await page.waitForTimeout(150);
  if ((await page.$eval('.product-add', (b) => b.textContent)) !== 'CART IS FULL') throw new Error('re-adding at the cap must say CART IS FULL');
  if ((await page.$eval('.cart-float .count', (e) => e.textContent)) !== '25') throw new Error('count must stay 25');
});

// L: a line whose product is missing from the catalog keeps a stale preview
// price, but once the Worker quotes, ITS subtotal is what the cart shows.
await scenario('quoted total comes from the Worker, even with a stale unmatched line', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  // Product 999 is not in the catalog, so reconcile cannot touch this line.
  await seed(page, [{ product_id: 999, variant_id: 9999, title: 'GHOST TEE', option: 'M', price: 100, currency: 'USD', image: 'hoodie-front.png', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== '$1.00') throw new Error('before a quote the stored price is the preview');
  await page.fill('#checkoutForm input[name=name]', 'Sam');
  await page.fill('#checkoutForm input[name=email]', 'sam@example.com');
  await page.fill('#checkoutForm input[name=address1]', '14 Example Ave');
  await page.fill('#checkoutForm input[name=city]', 'Renton');
  await page.fill('#checkoutForm input[name=state_code]', 'WA');
  await page.fill('#checkoutForm input[name=zip]', '98058');
  await page.selectOption('#checkoutForm select[name=country_code]', 'US');
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  const sub = await page.$eval('#cartSubtotal', (e) => e.textContent);
  if (sub !== '$4.00') throw new Error('after the quote the Worker subtotal ($4.00) must show, got ' + sub);
  const total = await page.$eval('#cartTotal', (e) => e.textContent);
  if (total !== '$8.99') throw new Error('total must be Worker subtotal + shipping = $8.99, got ' + total);
}, { quoteSubtotal: 400 });

// M: with the shop API down, a saved cart still renders on a /cart deep link.
await scenario('saved cart renders on /cart even when the shop API is down', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForTimeout(400);
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 2 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  if (await page.$eval('#cartEmpty', (e) => getComputedStyle(e).display !== 'none')) throw new Error('must not read as empty with items saved');
  if ((await page.$eval('.cart-float .count', (e) => e.textContent)) !== '2') throw new Error('count should be 2');
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== '$8.00') throw new Error('subtotal should be $8.00');
}, { productsStatus: 500 });

const fillAddress = async (page) => {
  await page.fill('#checkoutForm input[name=name]', 'Sam');
  await page.fill('#checkoutForm input[name=email]', 'sam@example.com');
  await page.fill('#checkoutForm input[name=address1]', '14 Example Ave');
  await page.fill('#checkoutForm input[name=city]', 'Renton');
  await page.fill('#checkoutForm input[name=state_code]', 'WA');
  await page.fill('#checkoutForm input[name=zip]', '98058');
  await page.selectOption('#checkoutForm select[name=country_code]', 'US');
};

// N: with the shop open, a saved cart must never carry the closed-shop caption.
await scenario('no "not open yet" caption on an open shop', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('checkoutBox')).display !== 'none');
  const msg = await page.$eval('#checkoutMsg', (e) => e.textContent + '|' + getComputedStyle(e).display);
  if (/not open/i.test(msg) || !/\|none$/.test(msg)) throw new Error('closed-shop caption must not show on an open shop: ' + msg);
  if (/not open/i.test(await page.$eval('#cartCap', (e) => e.textContent))) throw new Error('cap line must not say not open on an open shop');
});

// O: a quote that lands after the cart changed must be thrown away, so PAY is
// never offered beside a total for a cart that no longer exists.
await scenario('a quote that lands after the cart changed cannot enable PAY', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn'); // the quote goes out and is held for 900ms
  await page.click('#cartLines .cart-qtystep .qty-btn:last-child'); // + while it is in flight
  await page.waitForTimeout(1400);
  const btn = await page.$eval('#payBtn', (b) => b.textContent + '|' + b.disabled);
  if (btn !== 'GET SHIPPING OPTIONS|false') throw new Error('a stale quote must not enable PAY, got ' + btn);
  if ((await page.$eval('#cartLines .qty-val', (e) => e.textContent)) !== '2') throw new Error('qty should be 2');
}, { quoteDelay: 900 });

// P: when the Worker refuses because prices moved, the customer is sent back
// to a fresh quote rather than left with PAY beside the old numbers.
await scenario('a "prices changed" refusal sends the customer back to a fresh quote', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  await page.click('#payBtn'); // PAY -> Worker says 409 prices changed
  await page.waitForFunction(() => /changed/i.test(document.getElementById('checkoutMsg').textContent));
  const btn = await page.$eval('#payBtn', (b) => b.textContent);
  if (btn !== 'GET SHIPPING OPTIONS') throw new Error('after a price change PAY must require a fresh quote, got ' + btn);
}, { orderError: 'Prices or shipping changed while you were checking out — please review your cart and try again.' });

// Q: address2 is sent to Printful with the quote, so typing an apartment
// number while a quote is in flight makes that quote stale — discard it.
await scenario('typing an apartment number mid-quote discards that quote', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn'); // quote goes out, held 900ms
  await page.fill('#checkoutForm input[name=address2]', 'Apt 4');
  await page.waitForTimeout(1400);
  const btn = await page.$eval('#payBtn', (b) => b.textContent + '|' + b.disabled);
  if (btn !== 'GET SHIPPING OPTIONS|false') throw new Error('a quote without the apartment number must not enable PAY, got ' + btn);
}, { quoteDelay: 900 });

// R: ANY refusal at order time — not just "prices changed" — must send the
// customer back to a fresh quote instead of leaving PAY beside stale figures.
await scenario('an unshippable-at-order refusal also returns to a fresh quote', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  await page.click('#payBtn'); // PAY -> Worker 409 cannot ship
  await page.waitForFunction(() => /cannot ship/i.test(document.getElementById('checkoutMsg').textContent));
  const btn = await page.$eval('#payBtn', (b) => b.textContent);
  if (btn !== 'GET SHIPPING OPTIONS') throw new Error('after any refusal PAY must require a fresh quote, got ' + btn);
}, { orderError: 'Printful cannot ship this order to that address.' });

// S: a zero-decimal currency is shown in whole units, never as if it had cents.
const YEN = { id: 5, printful_id: 505, title: 'WIZARD TEE (JP)', url: 'https://wizard.printful.me/product/tee-jp', image: 'hoodie-front.png', sticker: false, row_break: false, currency: 'JPY', price_min: 2950, price_max: 2950, colors: [], sizes: [], variants: [{ id: 9401, color: '', size: '', price: 2950, image: '' }] };
await scenario('a zero-decimal currency (JPY) shows whole units, not hundredths', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable');
  await page.waitForSelector('#product.active');
  const price = await page.$eval('.product-price', (e) => e.textContent);
  if (price !== 'JPY 2,950') throw new Error('JPY must show whole yen, got ' + JSON.stringify(price));
  await page.click('.product-add');
  await page.waitForTimeout(150);
  await page.click('#product .cart-nav');
  await page.waitForSelector('#cart.active .cart-line');
  if ((await page.$eval('#cartSubtotal', (e) => e.textContent)) !== 'JPY 2,950') throw new Error('cart must show whole yen too');
}, { products: { shop: true, donate: true, mode: 'payout', products: [YEN] } });

// T: on a phone, swiping the picture moves through the colours; VIEW CART
// appears beside ADD once something is in the cart; only one way back.
await scenario('swipe on the picture changes colour; VIEW CART appears after adding', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable'); // hoodie: Black, Purple
  await page.waitForSelector('#product.active');
  if (await page.$('#productToMerchBtn')) throw new Error('the duplicate ALL MERCH button should be gone');
  if ((await page.$$('.product-dot')).length !== 2) throw new Error('two colour dots expected');
  const swipe = (dx) => page.evaluate((dx) => {
    const hero = document.querySelector('.product-hero');
    const mk = (type, x) => new TouchEvent(type, { changedTouches: [new Touch({ identifier: 1, target: hero, clientX: x, clientY: 100 })], bubbles: true });
    hero.dispatchEvent(mk('touchstart', 200));
    hero.dispatchEvent(mk('touchend', 200 + dx));
  }, dx);
  await swipe(-120); // swipe left -> next colour (Black)
  if ((await page.$eval('.product-chosen', (e) => e.textContent)) !== ': Black') throw new Error('first swipe should pick Black');
  const img1 = await page.$eval('.product-hero img', (e) => e.src);
  await swipe(-120); // -> Purple
  if ((await page.$eval('.product-chosen', (e) => e.textContent)) !== ': Purple') throw new Error('second swipe should pick Purple');
  if ((await page.$eval('.product-hero img', (e) => e.src)) === img1) throw new Error('picture should change with the colour');
  if (!(await page.$eval('.product-dot:nth-child(2)', (d) => d.classList.contains('active')))) throw new Error('second dot should be active');
  await swipe(-30); // too short: no change
  if ((await page.$eval('.product-chosen', (e) => e.textContent)) !== ': Purple') throw new Error('a short swipe must not change colour');
  if (await page.$eval('.product-viewcart', (b) => getComputedStyle(b).display !== 'none')) throw new Error('VIEW CART hidden while the cart is empty');
  await page.click('.product-size[data-size="L"]');
  await page.click('.product-add');
  await page.waitForTimeout(150);
  if (await page.$eval('.product-viewcart', (b) => getComputedStyle(b).display === 'none')) throw new Error('VIEW CART should show after adding');
  await page.click('.product-viewcart');
  await page.waitForSelector('#cart.active .cart-line');
});

// U: with a publishable key, paying mounts Stripe's checkout ON the cart
// screen — no redirect — and CHANGE ORDER takes it down for a fresh quote.
await scenario('embedded checkout mounts on the cart screen, never leaves the site', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  await page.click('#payBtn'); // PAY
  await page.waitForSelector('#payPanel:not([hidden]) .fake-stripe');
  if (!/\/cart$/.test(page.url())) throw new Error('paying must not leave the site, url=' + page.url());
  if (!seenOrder || seenOrder.checkout !== 'embedded') throw new Error('order should ask for embedded checkout');
  const mounted = await page.$eval('.fake-stripe', (e) => e.textContent);
  if (mounted !== 'pk_test_x|cs_secret_1') throw new Error('Stripe should be mounted with our key + secret, got ' + mounted);
  if (await page.$eval('#checkoutBox', (e) => getComputedStyle(e).display !== 'none')) throw new Error('the address form should step aside while paying');
  await page.click('#payPanelBack');
  await page.waitForFunction(() => document.getElementById('payPanel').hidden);
  if ((await page.evaluate(() => window.__destroyed)) !== 1) throw new Error('the Stripe checkout should be destroyed on CHANGE ORDER');
  if ((await page.$eval('#payBtn', (b) => b.textContent)) !== 'GET SHIPPING OPTIONS') throw new Error('after changing the order a fresh quote is needed');
  if (await page.$eval('#checkoutBox', (e) => getComputedStyle(e).display === 'none')) throw new Error('the address form should be back');
}, { stripePk: 'pk_test_x' });

// V: changing a quantity while Stripe's checkout is open takes it down — the
// session was for a different order.
await scenario('changing the cart under an open embedded checkout tears it down', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  await page.click('#payBtn');
  await page.waitForSelector('#payPanel:not([hidden]) .fake-stripe');
  await page.click('#cartLines .cart-qtystep .qty-btn:last-child'); // + while paying
  await page.waitForFunction(() => document.getElementById('payPanel').hidden);
  if ((await page.evaluate(() => window.__destroyed)) !== 1) throw new Error('checkout should be destroyed when the order changes');
  if ((await page.$eval('#payBtn', (b) => b.textContent)) !== 'GET SHIPPING OPTIONS') throw new Error('a fresh quote is needed after the change');
}, { stripePk: 'pk_test_x' });

// W: if Stripe's script can't load, PAY still works — via Stripe's own page.
// X: the donation box is the last step. Blank means none; a plain amount rides
// the order inside the pinned total; anything else holds PAY and says so.
await scenario('donation box: blank = none, an amount joins the pinned total, garbage holds PAY', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  if (await page.$eval('#tipBox', (e) => getComputedStyle(e).display !== 'none')) throw new Error('the donation box should wait for the shipping step');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  if (await page.$eval('#tipBox', (e) => getComputedStyle(e).display === 'none')) throw new Error('the donation box should show with the shipping options');
  const total0 = await page.$eval('#cartTotal', (e) => e.textContent);
  if (total0 !== '$103.99') throw new Error('total before a gift should be $103.99, got ' + total0);
  // Garbage: PAY is held, the total ignores it.
  await page.fill('#tipAmount', 'five');
  await page.waitForTimeout(50);
  if (!(await page.$eval('#payBtn', (b) => b.disabled))) throw new Error('PAY should be held while the gift is unreadable');
  if ((await page.$eval('#cartTotal', (e) => e.textContent)) !== '$103.99') throw new Error('an unreadable gift must not change the total');
  // A real amount: shown on its own line, in the total, and sent inside expected_total.
  await page.fill('#tipAmount', '5.50');
  await page.waitForTimeout(50);
  if (await page.$eval('#payBtn', (b) => b.disabled)) throw new Error('PAY should be back with a readable gift');
  const row = await page.$eval('#cartDonation', (e) => getComputedStyle(e).display + '|' + e.textContent);
  if (row !== 'inline|$5.50' && row !== 'block|$5.50') throw new Error('the gift should show on its own line, got ' + row);
  if ((await page.$eval('#cartTotal', (e) => e.textContent)) !== '$109.49') throw new Error('total should include the gift');
  await page.click('#payBtn');
  await page.waitForSelector('#payPanel:not([hidden]) .fake-stripe');
  if (!seenOrder || seenOrder.donation !== 550) throw new Error('the order should carry donation 550, got ' + JSON.stringify(seenOrder && seenOrder.donation));
  if (seenOrder.expected_total !== 9900 + 499 + 550) throw new Error('expected_total should include the gift, got ' + seenOrder.expected_total);
  // Back to change the order: the quote is redone, so the box steps out of
  // sight — and out of the total — until the options are back.
  await page.click('#payPanelBack');
  await page.waitForFunction(() => document.getElementById('payPanel').hidden);
  if (await page.$eval('#tipBox', (e) => getComputedStyle(e).display !== 'none')) throw new Error('the donation box should wait for the fresh quote');
  if (await page.$eval('#cartDonation', (e) => getComputedStyle(e).display !== 'none')) throw new Error('a hidden box must not count in the total');
  if ((await page.$eval('#cartTotal', (e) => e.textContent)) !== '$4.00 + shipping') throw new Error('total without a quote should be the stored price + shipping, got ' + (await page.$eval('#cartTotal', (e) => e.textContent)));
  await page.click('#payBtn'); // fresh quote
  await page.waitForSelector('.ship-option');
  if ((await page.$eval('#cartTotal', (e) => e.textContent)) !== '$109.49') throw new Error('the typed gift should come back with the options');
  // Clear it: blank is zero, and the line goes away.
  await page.fill('#tipAmount', '');
  await page.waitForTimeout(50);
  if (await page.$eval('#cartDonation', (e) => getComputedStyle(e).display !== 'none')) throw new Error('a blank box should drop the gift line');
  await page.click('#payBtn'); // pay
  await page.waitForSelector('#payPanel:not([hidden]) .fake-stripe');
  if (seenOrder.donation !== 0 || seenOrder.expected_total !== 9900 + 499) throw new Error('blank should send donation 0, got ' + JSON.stringify([seenOrder.donation, seenOrder.expected_total]));
}, { stripePk: 'pk_test_x' });

// Y: measurement sizes (stickers) are picked from scaled thumbnails, and the
// picture itself grows and shrinks a little with the pick.
const SIZED_STICKER = { id: 6, printful_id: 506, title: 'HOLO STICKER', url: 'https://wizard.printful.me/product/holo', image: 'rath.PNG', sticker: true, row_break: false, currency: 'USD', price_min: 400, price_max: 650, colors: [], sizes: ['3″×3″', '5.5″×5.5″'],
  // As Printful serves it: a mockup of the design for the first size only, its stock photo of blank sheets for the second.
  variants: [{ id: 9601, color: '', size: '3″×3″', price: 400, image: 'holo-design.png', mockup: true }, { id: 9602, color: '', size: '5.5″×5.5″', price: 650, image: 'generic-sheet.jpg', mockup: false }] };
await scenario('sticker sizes are scaled thumbnails; the price and picture follow the pick', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await page.click('#merch .merch-feature.buyable');
  await page.waitForSelector('#product.active');
  if (await page.$('.product-swatch')) throw new Error('a sticker has no colour swatches');
  const tiles = await page.$$eval('.product-size-tile', (ts) => ts.map((t) => t.dataset.size + '|' + t.querySelector('img').style.width + '|' + t.querySelector('.tile-label').textContent));
  if (tiles.join(',') !== '3″×3″|73%|3″×3″,5.5″×5.5″|100%|5.5″×5.5″') throw new Error('size tiles should scale with the size, got ' + tiles.join(','));
  // Every tile, and the hero, show the design — never Printful's generic sheet for the size it did not render.
  const tileSrcs = await page.$$eval('.product-size-tile img', (is) => is.map((i) => i.getAttribute('src')));
  if (!tileSrcs.every((x) => /holo-design\.png$/.test(x))) throw new Error('every size tile should show the design mockup, got ' + tileSrcs.join(','));

  if ((await page.$eval('.product-add', (b) => b.textContent)) !== 'PICK A SIZE') throw new Error('two sizes: one must be picked');
  await page.click('.product-size-tile[data-size="3″×3″"]');
  const small = await page.$eval('.product-hero img', (e) => e.style.transform);
  const p1 = await page.$eval('.product-price', (e) => e.textContent);
  await page.click('.product-size-tile[data-size="5.5″×5.5″"]');
  const big = await page.$eval('.product-hero img', (e) => e.style.transform);
  if (!/holo-design\.png$/.test(await page.$eval('.product-hero img', (e) => e.getAttribute('src')))) throw new Error('the hero should show the design for a size Printful did not render');
  const p2 = await page.$eval('.product-price', (e) => e.textContent);
  if (p1 !== '$4.00' || p2 !== '$6.50') throw new Error('price should follow the size, got ' + p1 + ' / ' + p2);
  if (!/^scale\(0\.9[0-9]*\)$/.test(small) || big !== 'scale(1)') throw new Error('the picture should shrink for the small size and be full for the large, got ' + small + ' / ' + big);
  await page.click('.product-add');
  await page.waitForTimeout(100);
  const line = await page.evaluate(() => JSON.parse(localStorage.getItem('wiz_cart_v1')).lines[0]);
  if (line.variant_id !== 9602 || line.price !== 650 || line.option !== '5.5″×5.5″') throw new Error('the cart line should be the large sticker, got ' + JSON.stringify(line));
}, { products: { shop: true, donate: true, mode: 'payout', products: [SIZED_STICKER] } });

await scenario('when the on-site form cannot load, PAY falls back to the Stripe page', async (page) => {
  await page.goto(base + '/merch');
  await page.waitForSelector('#merch .merch-feature.buyable');
  await seed(page, [{ product_id: 502, variant_id: 9101, title: 'STICKER OF RATH', option: '', price: 400, currency: 'USD', image: 'rath.PNG', qty: 1 }]);
  await page.goto(base + '/cart');
  await page.waitForSelector('#cart.active .cart-line');
  await fillAddress(page);
  await page.click('#payBtn');
  await page.waitForSelector('.ship-option');
  // Shipping rows: service name (window trimmed), days, price.
  const row = await page.$eval('.ship-option', (l) => [l.querySelector('.ship-name').textContent, l.querySelector('.ship-days').textContent, l.querySelector('.ship-price').textContent].join('|'));
  if (row !== 'Flat Rate|3–7 days|$4.99') throw new Error('shipping row should read name|days|price, got ' + row);
  await page.click('#payBtn');
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 8000 });
  if (!seenOrder || seenOrder.checkout !== 'hosted') throw new Error('fallback should re-order as hosted, got ' + (seenOrder && seenOrder.checkout));
}, { stripePk: 'pk_test_x', stripeJsDown: true });

await browser.close();
server.close();
console.log('\nCRASH TESTS');
console.log(results.join('\n'));
console.log('\n' + (failures ? failures + ' FAILED' : 'ALL CRASH TESTS PASSED'));
process.exit(failures ? 1 : 0);
