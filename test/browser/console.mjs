// Drives the store console (ADMIN_HTML) in Chromium against stubbed admin APIs.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
import http from 'node:http';

const html = (await import(new URL('../../api/src/admin.js', import.meta.url).href)).ADMIN_HTML;
const PORT = 8082;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); });
await new Promise((r) => server.listen(PORT, r));

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

const confirmed = [];
await page.route('**/api/**', async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
  if (p === '/api/login-config') return json({ google_client_id: '' });
  if (p === '/api/admin/login') return (req.headers()['authorization'] || '').includes('hunter2') ? json({ ok: true, mode: 'password', email: 'owner' }) : json({ error: 'Wrong or missing password' }, 401);
  if (p === '/api/admin/content') return json({ merch: [{ id: 1, title: 'EARL CROUCH HOODIE', url: 'https://wizard.printful.me/product/unisex-hoodie', image: 'hoodie-front.png', sticker: 0, row_break: 0, visible: 1, printful_id: 501 }, { id: 2, title: 'TOTE', url: 'https://wizard.printful.me/product/tote', image: 'tote.png', sticker: 0, row_break: 0, visible: 1, printful_id: null }], credits: [], donators: [] });
  if (p === '/api/admin/printful/products') return json({ result: [{ id: 501, name: 'Unisex Hoodie', thumbnail_url: '' }, { id: 502, name: 'Sticker of Rath', thumbnail_url: '' }] });
  if (p === '/api/admin/shop/orders') return json({ mode: 'payout', shop: true, test_mode: false, orders: [
    { id: 2, reference: 'WIZ-TWO', status: 'paid', name: 'Sam Buyer', place: 'Renton, WA, US', email: 'sam@example.com', items: [{ name: 'Unisex Hoodie', option: 'Purple / L', quantity: 2, unit_price: 4750 }], units: 2, subtotal: 9500, shipping: 499, total: 9999, currency: 'USD', printful_order_id: 771122, printful_status: 'draft', stripe_payout: '', created_at: '2026-09-19 03:00:00' },
    { id: 1, reference: 'WIZ-ONE', status: 'confirmed', name: 'Jo', place: 'Austin, TX, US', email: '', items: [{ name: 'Sticker of Rath', option: '', quantity: 1, unit_price: 400 }], units: 1, subtotal: 400, shipping: 399, total: 799, currency: 'USD', printful_order_id: 771100, printful_status: 'pending', stripe_payout: 'po_1', created_at: '2026-09-18 03:00:00' },
  ] });
  if (/\/api\/admin\/shop\/orders\/WIZ-TWO\/confirm$/.test(p) && req.method() === 'POST') { confirmed.push('WIZ-TWO'); return json({ ok: true, status: 'confirmed', orderId: 771122 }); }
  if (p === '/api/admin/donations') return json({ donate: true, totals: { received: 3500, in_bank: 2500, gifts: 2 }, donations: [
    { id: 2, reference: 'GIFT-B', status: 'paid', amount: 1000, currency: 'USD', name: '', email: 'x@example.com', message: '', public: 0, created_at: '2026-09-19 04:00:00', paid_at: '2026-09-19 04:01:00' },
    { id: 1, reference: 'GIFT-A', status: 'paid_out', amount: 2500, currency: 'USD', name: 'A Fan', email: 'fan@example.com', message: 'love the show', public: 1, created_at: '2026-09-18 04:00:00', paid_at: '2026-09-18 04:01:00' },
  ] });
  return json({ error: 'unstubbed ' + p }, 404);
});

const fail = (m) => { throw new Error(m); };
await page.goto('http://localhost:' + PORT + '/login');
await page.fill('#pwInput', 'hunter2');
await page.press('#pwInput', 'Enter');
await page.waitForSelector('#list .item');
// merch picker
await page.waitForFunction(() => { const s = document.querySelector('#list .item select'); return s && s.options.length > 2; });
const picked = await page.$$eval('#list .item select', (sels) => sels.map((s) => s.value + ':' + s.options[s.selectedIndex].textContent));
if (picked[0] !== '501:Unisex Hoodie') fail('hoodie picker should preselect its Printful product: ' + picked[0]);
if (!/^:/.test(picked[1])) fail('tote picker should be link only: ' + picked[1]);
await page.selectOption('#list .item:nth-child(2) select', '502');
const dirty = await page.$eval('#dirtyFlag', (e) => getComputedStyle(e).display !== 'none');
if (!dirty) fail('changing the picker should mark unsaved changes');

// orders tab
await page.click('.tab[data-tab=orders]');
await page.waitForSelector('.mode-line');
const modeText = await page.$eval('.mode-line', (e) => e.textContent);
if (!/Confirm on payout/.test(modeText)) fail('mode line: ' + modeText);
const badges = await page.$$eval('#list .item .badge', (b) => b.map((x) => x.textContent));
if (!badges.includes('PAID · WAITING FOR PAYOUT') || !badges.includes('PRINTING · pending')) fail('badges ' + JSON.stringify(badges));
page.once('dialog', (d) => d.accept());
await page.click('#list .item button.primary');
await page.waitForFunction(() => document.body.textContent.includes('Confirmed'));
if (confirmed[0] !== 'WIZ-TWO') fail('confirm should call the endpoint for WIZ-TWO');

// donations tab
await page.click('.tab[data-tab=donations]');
await page.waitForSelector('.totals-row');
const stats = await page.$$eval('.totals-row .stat .n', (n) => n.map((x) => x.textContent));
if (stats.join('|') !== '$35.00|$25.00|2') fail('totals ' + stats.join('|'));
const dBadges = await page.$$eval('#list .item .badge', (b) => b.map((x) => x.textContent));
if (!dBadges.includes('IN BANK') || !dBadges.includes('OK TO THANK BY NAME')) fail('donation badges ' + JSON.stringify(dBadges));
await page.screenshot({ path: OUT + 'console-donations.png', fullPage: true });

await browser.close();
server.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log('console smoke OK');
