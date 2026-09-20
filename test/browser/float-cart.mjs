// Verifies the site-wide floating cart button on wizardshit.store.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8085;
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
    { id: 2, printful_id: 502, title: 'STICKER OF RATH', url: 'https://wizard.printful.me/product/sticker-of-rath', image: 'rath.PNG', sticker: true, row_break: false, currency: 'USD', price_min: 400, price_max: 400, colors: [], sizes: [], variants: [{ id: 9101, color: '', size: '', price: 400, image: '' }] },
  ],
};

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
await page.route('https://wizardshit.store/**', (route) => {
  const p = new URL(route.request().url()).pathname;
  const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
  if (p === '/api/shop/products') return json(PRODUCTS);
  if (p === '/api/content') return json({ merch: PRODUCTS.products.map((x) => ({ title: x.title, url: x.url, image: x.image, sticker: 1, row_break: 0 })), credits: [], donators: [] });
  return json({ ok: true });
});

const fail = (m) => { throw new Error(m); };
const base = 'http://localhost:' + PORT;
// Visible = the screen gate on the wrap is open AND the badge has items to show.
const floatVisible = () => page.$eval('.cart-float', (e) => {
  const wrap = e.closest('.cart-float-wrap');
  return getComputedStyle(wrap).display !== 'none' && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
}).catch(() => false);
const floatCount = () => page.$eval('.cart-float .count', (e) => e.textContent);

// 1. Hidden on the landing/home screen.
await page.goto(base + '/');
await page.waitForTimeout(400);
if (await floatVisible()) fail('floating cart should be hidden on home');

// 2. Appears once you ENTER and start browsing.
await page.click('#enterBtn');
await page.waitForSelector('#updates.active');
if (await floatVisible()) fail('floating cart should stay hidden on updates while the cart is empty');
if ((await floatCount()) !== '') fail('empty cart should show no count, got ' + JSON.stringify(await floatCount()));

// 3. On merch, open the sticker's page and add it -> floating count updates and it glows.
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
if (await floatVisible()) fail('floating cart should stay hidden on merch while the cart is empty');
await page.click('#merch .merch-feature.buyable');
await page.waitForSelector('#product.active');
if (await floatVisible()) fail('floating cart should stay off the product page (it has its own CART button)');
await page.click('.product-add');
await page.waitForTimeout(200);
if ((await floatCount()) !== '1') fail('floating count should be 1, got ' + (await floatCount()));
if (!(await page.$eval('.cart-float', (e) => e.classList.contains('has-items')))) fail('floating cart should glow when it has items');
// Back on merch the badge now shows, bottom-right, orange, round.
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
if (!(await floatVisible())) fail('floating cart should appear on merch once the cart has an item');
await page.waitForTimeout(500); // let the pop-in animation finish before measuring
const badge = await page.$eval('.cart-float', (e) => {
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, w: r.width, h: r.height, radius: cs.borderRadius, bg: cs.backgroundColor };
});
if (Math.abs(badge.w - badge.h) > 1 || badge.radius !== '50%') fail('badge should be a circle, got ' + JSON.stringify(badge));
if (badge.right > 40 || badge.bottom > 40) fail('badge should sit in the bottom-right corner, got ' + JSON.stringify(badge));
if (badge.bg !== 'rgb(255, 138, 31)') fail('badge should be orange, got ' + badge.bg);

// 4. Cart persists across other screens (click around the site).
for (const s of ['content', 'credits', 'donators']) {
  await page.goto(base + '/' + s);
  await page.waitForSelector('#' + s + '.active');
  if (!(await floatVisible())) fail('floating cart should show on ' + s);
  if ((await floatCount()) !== '1') fail('floating count should stay 1 on ' + s + ', got ' + (await floatCount()));
}

// 5. Clicking the floating cart opens the cart screen, where it hides itself.
await page.click('.cart-float');
await page.waitForSelector('#cart.active');
await page.waitForTimeout(200);
if (await floatVisible()) fail('floating cart should hide on the cart screen itself');
const lines = await page.$$eval('#cartLines .cart-line', (ls) => ls.length);
if (lines !== 1) fail('cart should hold the added sticker, lines=' + lines);

// 6. It stays till removed: reload keeps the item (localStorage) and the count.
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
if ((await floatCount()) !== '1') fail('count should survive reload, got ' + (await floatCount()));

// 7. Remove from cart -> floating count clears and glow turns off.
await page.click('.cart-float');
await page.waitForSelector('#cart.active');
await page.click('#cartLines .cart-remove');
await page.waitForTimeout(200);
await page.goto(base + '/merch');
await page.waitForSelector('#merch .merch-feature.buyable');
if ((await floatCount()) !== '') fail('count should clear after removing, got ' + JSON.stringify(await floatCount()));
if (await page.$eval('.cart-float', (e) => e.classList.contains('has-items'))) fail('glow should be off with an empty cart');
if (await floatVisible()) fail('badge should disappear once the cart is empty again');

await page.screenshot({ path: OUT + 'float-cart.png' });
await browser.close();
server.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log('floating-cart OK');
