// Drives wizardshit.store's shop UI in Chromium against a stubbed Worker.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8081;
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

const PRODUCTS = {
  shop: true, donate: true, mode: 'payout',
  products: [
    { id: 1, printful_id: 501, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/unisex-hoodie', image: 'hoodie-front.png', sticker: false, row_break: false, currency: 'USD', price_min: 4500, price_max: 4750, colors: ['Black', 'Purple'], sizes: ['S', 'L'],
      variants: [
        { id: 9001, color: 'Black', size: 'S', price: 4500, image: '' },
        { id: 9002, color: 'Black', size: 'L', price: 4500, image: '' },
        { id: 9003, color: 'Purple', size: 'L', price: 4750, image: '' },
      ] },
    { id: 2, printful_id: 502, title: 'STICKER OF RATH', url: 'https://wizard.printful.me/product/sticker-of-rath', image: 'rath.PNG', sticker: true, row_break: true, currency: 'USD', price_min: 400, price_max: 400, colors: [], sizes: [], variants: [{ id: 9101, color: '', size: '', price: 400, image: '' }] },
    { id: 3, printful_id: null, title: 'MYSTERY TOTE', url: 'https://wizard.printful.me/product/tote', image: 'hhtote.PNG', sticker: false, row_break: false, currency: 'USD', price_min: null, price_max: null, colors: [], sizes: [], variants: [] },
  ],
};

const seen = { shipping: null, orders: null, donate: null };
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.route('https://wizardshit.store/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
  if (url.pathname === '/api/content') return json({ merch: PRODUCTS.products.map((p) => ({ title: p.title, url: p.url, image: p.image, sticker: p.sticker ? 1 : 0, row_break: p.row_break ? 1 : 0 })), credits: [], donators: [] });
  if (url.pathname === '/api/hit') return json({ ok: true });
  if (url.pathname === '/api/shop/products') return json(process.env.SHOP_CLOSED ? { shop: false, donate: false, mode: 'payout', products: [] } : PRODUCTS);
  if (url.pathname === '/api/shop/shipping') { seen.shipping = req.postDataJSON(); return json({ rates: [{ id: 'STANDARD', name: 'Flat Rate', rate: 499, currency: 'USD', min_days: 3, max_days: 7 }, { id: 'EXPRESS', name: 'Express', rate: 1499, currency: 'USD', min_days: 1, max_days: 3 }], subtotal: 9900, currency: 'USD' }); }
  if (url.pathname === '/api/shop/orders') { seen.orders = req.postDataJSON(); return json({ url: 'https://checkout.stripe.com/c/pay/cs_x', reference: 'WIZ-TEST', total: 10399, currency: 'USD' }); }
  if (url.pathname === '/api/donate') { seen.donate = req.postDataJSON(); return json({ url: 'https://checkout.stripe.com/c/pay/cs_d', reference: 'GIFT-TEST' }); }
  return json({ error: 'unstubbed ' + url.pathname }, 404);
});
await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stripe</title>ok' }));

const fail = (m) => { throw new Error(m); };
const base = 'http://localhost:' + PORT;

if (process.env.SHOP_CLOSED) {
  await page.goto(base + '/merch');
  await page.waitForTimeout(800);
  const links = await page.$$eval('#merch .merch-grid a.merch-feature', (a) => a.map((x) => x.href));
  if (links.length < 3 || !links[0].includes('printful')) fail('closed shop should keep link cards: ' + links.join(','));
  const buyable = await page.$$('#merch .merch-feature.buyable');
  if (buyable.length) fail('closed shop rendered buyable cards');
  const donateHref = await page.$eval('.donate-btn', (a) => a.href);
  if (!donateHref.includes('donorbox')) fail('closed donate should keep Donorbox link');
  console.log('closed-shop fallback OK');
  await browser.close(); server.close(); process.exit(errors.length ? 1 : 0);
}

// 1. tiles are plain now: picture + title only, no inline price/pickers/add
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
const cards = await page.$$('#merch .merch-feature');
if (cards.length !== 3) fail('expected 3 tiles, got ' + cards.length);
if ((await page.$$('#merch .merch-feature .merch-add')).length) fail('tiles should have no inline ADD button');
if ((await page.$$('#merch .merch-feature select.merch-pick')).length) fail('tiles should have no inline pickers');
if ((await page.$$('#merch .merch-feature .merch-price')).length) fail('tiles should show no inline price');
if ((await cards[2].evaluate((e) => e.tagName)) !== 'A') fail('link-only item should stay a link');

// 2. click the hoodie tile -> its product page; pick colour + size + quantity
await cards[0].click();
await page.waitForSelector('#product.active');
const pname = await page.$eval('.product-name', (e) => e.textContent);
if (pname !== 'EARL CROUCH HOODIE') fail('product name ' + pname);
let addText = await page.$eval('.product-add', (b) => b.textContent + '|' + b.disabled);
if (!/PICK A COLOR\|true/.test(addText)) fail('add should wait for color: ' + addText);
await page.click('.product-swatch[data-color="Purple"]');
await page.click('.product-size[data-size="L"]');
const price = await page.$eval('.product-price', (e) => e.textContent);
if (price !== '$47.50') fail('price for Purple/L should be $47.50, got ' + price);
await page.click('.product-qty .qty-btn:last-child'); // + -> qty 2
if ((await page.$eval('.qty-val', (e) => e.textContent)) !== '2') fail('qty stepper should reach 2');
await page.click('.product-add');
await page.waitForTimeout(200);
let count = await page.$eval('.cart-float .count', (e) => e.textContent);
if (count !== '2') fail('two hoodies -> count 2, got ' + JSON.stringify(count));

// 3. back to merch, open the single-variant sticker, add one
await page.click('#backFromProductBtn');
await page.waitForSelector('#merch.active');
await (await page.$$('#merch .merch-feature'))[1].click();
await page.waitForSelector('#product.active');
if ((await page.$$('.product-swatch')).length) fail('single-variant sticker should have no colour swatches');
if ((await page.$$('.product-size')).length) fail('single-variant sticker should have no size buttons');
if ((await page.$eval('.product-price', (e) => e.textContent)) !== '$4.00') fail('sticker price should be $4.00');
await page.click('.product-add');
await page.waitForTimeout(200);
count = await page.$eval('.cart-float .count', (e) => e.textContent);
if (count !== '3') fail('cart count should be 3, got ' + JSON.stringify(count));

// 4. cart (reachable from the product page's CART button)
await page.click('#product .cart-nav');
await page.waitForSelector('#cart.active');
const lines = await page.$$eval('#cartLines .cart-line', (ls) => ls.map((l) => l.querySelector('.cart-title').textContent + '|' + (l.querySelector('.cart-option') || {}).textContent + '|' + l.querySelector('.qty-val').textContent + '|' + l.querySelector('.cart-linetotal').textContent));
if (lines.join(';') !== 'EARL CROUCH HOODIE|Purple / L|2|$95.00;STICKER OF RATH|undefined|1|$4.00') fail('cart lines: ' + lines.join(';'));
const sub = await page.$eval('#cartSubtotal', (e) => e.textContent);
if (sub !== '$99.00') fail('subtotal ' + sub);

// 3. checkout
await page.fill('#checkoutForm input[name=name]', 'Sam Buyer');
await page.fill('#checkoutForm input[name=email]', 'sam@example.com');
await page.fill('#checkoutForm input[name=address1]', '14 Example Ave');
await page.fill('#checkoutForm input[name=city]', 'Renton');
await page.fill('#checkoutForm input[name=state_code]', 'WA');
await page.fill('#checkoutForm input[name=zip]', '98058');
await page.selectOption('#checkoutForm select[name=country_code]', 'US');
await page.click('#payBtn');
await page.waitForSelector('.ship-option');
if (!seen.shipping) fail('no shipping request');
if (seen.shipping.items.length !== 2 || seen.shipping.items[0].quantity !== 2 || seen.shipping.items[0].variant_id !== 9003) fail('shipping items ' + JSON.stringify(seen.shipping.items));
let payText = await page.$eval('#payBtn', (b) => b.textContent + '|' + b.disabled);
if (payText !== 'PAY WITH CARD|false') fail('pay button ' + payText);
const total = await page.$eval('#cartTotal', (e) => e.textContent);
if (total !== '$103.99') fail('total with cheapest shipping ' + total);
await page.click('.ship-option:nth-child(2) input');
await page.waitForTimeout(200);
await page.click('#payBtn');
await page.waitForURL(/checkout\.stripe\.com/);
if (!seen.orders) fail('no order request');
if (seen.orders.shipping_id !== 'EXPRESS') fail('picked shipping ' + seen.orders.shipping_id);
if (seen.orders.expected_total !== 9900 + 1499) fail('the order must carry the total the customer saw beside PAY: ' + seen.orders.expected_total);
if (seen.orders.recipient.zip !== '98058' || seen.orders.recipient.email !== 'sam@example.com') fail('recipient ' + JSON.stringify(seen.orders.recipient));
if (Object.keys(seen.orders.items[0]).sort().join() !== 'product_id,quantity,variant_id') fail('order items carry only ids and quantities: ' + JSON.stringify(seen.orders.items[0]));

// 4. arrival after paying
await page.goto(base + '/?order=WIZ-TEST');
await page.waitForSelector('#thanks.active');
const thanksText = await page.$eval('#thanksText', (e) => e.textContent);
if (!/WIZ-TEST/.test(thanksText) || !/settles/.test(thanksText)) fail('thanks text ' + thanksText);
const cartAfter = await page.evaluate(() => localStorage.getItem('wiz_cart_v1'));
if (!/"lines":\[\]/.test(cartAfter)) fail('cart should be cleared after paying: ' + cartAfter);

// 5. donate
await page.goto(base + '/');
await page.waitForFunction(() => document.querySelector('.donate-btn') && /♥/.test(document.querySelector('.donate-btn').textContent));
await page.click('.donate-wrap .donate-btn');
await page.waitForSelector('#donateModal:not([hidden])');
await page.click('.donate-amt:nth-child(2)');
const give = await page.$eval('#donateGive', (b) => b.textContent);
if (give !== 'GIVE $10.00') fail('give label ' + give);
await page.fill('#donateName', 'A Fan');
await page.check('#donatePublic');
await page.click('#donateGive');
await page.waitForURL(/checkout\.stripe\.com/);
if (!seen.donate || seen.donate.amount !== 1000 || seen.donate.name !== 'A Fan' || seen.donate.public !== true) fail('donate body ' + JSON.stringify(seen.donate));

// 6. mobile layout sanity: no horizontal overflow on the cart screen
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
await mobile.route('https://wizardshit.store/**', (route) => {
  const p = new URL(route.request().url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
  if (p === '/api/shop/products') return json(PRODUCTS);
  if (p === '/api/content') return json({ merch: [], credits: [], donators: [] });
  return json({ ok: true });
});
await mobile.goto(base + '/merch');
await mobile.waitForSelector('#merch .merch-feature.buyable');
await mobile.evaluate(() => localStorage.setItem('wiz_cart_v1', JSON.stringify({ lines: [{ product_id: 501, variant_id: 9003, title: 'EARL CROUCH HOODIE', option: 'Purple / L', price: 4750, currency: 'USD', image: 'hoodie-front.png', qty: 2 }] })));
await mobile.goto(base + '/?screen=cart');
await mobile.waitForSelector('#cart.active .cart-line');
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (overflow > 2) fail('mobile cart overflows horizontally by ' + overflow + 'px');
await mobile.screenshot({ path: OUT + 'cart-mobile.png', fullPage: true });
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
await page.screenshot({ path: OUT + 'merch-desktop.png' });

await browser.close();
server.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log('site smoke OK');
