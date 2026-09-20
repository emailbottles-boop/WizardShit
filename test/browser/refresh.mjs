// Refresh safety: a fresh load of /product has nothing to show and must land on
// the merch grid, while going BACK to a product that is already open must keep it.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8091;
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

const PRODUCTS = { shop: true, donate: true, mode: 'payout', products: [
  { id: 2, printful_id: 502, title: 'STICKER OF RATH', url: 'https://wizard.printful.me/product/sticker-of-rath', image: 'rath.PNG', sticker: true, row_break: false, currency: 'USD', price_min: 400, price_max: 400, colors: [], sizes: [], variants: [{ id: 9101, color: '', size: '', price: 400, image: '' }] },
]};
const stub = (route) => {
  const p = new URL(route.request().url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
  if (p === '/api/shop/products') return json(PRODUCTS);
  if (p === '/api/content') return json({ merch: [{ title: 'STICKER OF RATH', url: 'x', image: 'rath.PNG', sticker: 1, row_break: 0 }], credits: [], donators: [] });
  return json({ ok: true });
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const fail = (m) => { throw new Error(m); };
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
await page.route('https://wizardshit.store/**', stub);

// 1. Fresh load of /product -> merch grid, address rewritten, product screen not shown.
await page.goto(base + '/product');
await page.waitForSelector('#merch.active');
if (await page.$('#product.active')) fail('fresh /product should not show the empty product screen');
if (!/\/merch$/.test(page.url())) fail('address should be rewritten to /merch, got ' + page.url());

// 2. Open a tile, go to the cart, then BACK: the open product must still be there.
await page.waitForSelector('#merch .merch-feature.buyable');
await page.click('#merch .merch-feature.buyable');
await page.waitForSelector('#product.active');
if ((await page.$eval('.product-name', (e) => e.textContent)) !== 'STICKER OF RATH') fail('product should open');
await page.click('#product .cart-nav');
await page.waitForSelector('#cart.active');
await page.goBack();
await page.waitForSelector('#product.active');
if ((await page.$eval('.product-name', (e) => e.textContent)) !== 'STICKER OF RATH') fail('back should return to the still-open product');

// 3. Refreshing ordinary screens restores them.
for (const s of ['merch', 'cart', 'credits']) {
  await page.goto(base + '/' + s);
  await page.waitForSelector('#' + s + '.active');
}

await browser.close();
server.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log('refresh OK');
