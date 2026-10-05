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
const pricePuts = [];
const prices = { 9001: 4500, 9005: 4750, 9101: 400 };
const priceRow = (id, color, size, cost, suggested) => {
  const price = prices[id];
  const fee = Math.round(price * 0.029) + 30;
  const net = price - fee - cost;
  return { id, name: 'Unisex Hoodie - ' + color + ' / ' + size, color, size, price, currency: 'USD', cost, fee, net, margin: net / price, suggested };
};
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
  if (p === '/api/admin/shop/products/501/prices') return json({ product: { id: 501, name: 'Unisex Hoodie' }, target_margin: 0.3, variants: [priceRow(9001, 'Black', 'S', 2050, 3099), priceRow(9005, 'Gold', 'L', 3300, 4999)] });
  if (p === '/api/admin/shop/products/502/prices') return json({ product: { id: 502, name: 'Sticker of Rath' }, target_margin: 0.3, variants: [{ id: 9101, name: 'Sticker of Rath - 3\u2033\u00d73\u2033', color: '', size: '3\u2033\u00d73\u2033', price: prices[9101], currency: 'USD', cost: 300, fee: 42, net: 58, margin: 0.145, suggested: 499 }] });
  const pm = p.match(/^\/api\/admin\/shop\/products\/50[12]\/prices\/(\d+)$/);
  if (pm && req.method() === 'PUT') {
    const body = JSON.parse(req.postData());
    pricePuts.push({ id: Number(pm[1]), ...body });
    const before = prices[pm[1]];
    prices[pm[1]] = body.price;
    return json({ id: Number(pm[1]), before, price: body.price, currency: 'USD' });
  }
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
// prices: each variant's price, cost and margin, editable in place
const hoodie = page.locator('#list .item').first();
await hoodie.getByRole('button', { name: 'Prices \u25B8' }).click();
const goldRow = hoodie.locator('div', { hasText: /^Gold \/ L \u2014 cost/ }).last();
await goldRow.waitFor();
const goldText = await goldRow.locator('span').first().textContent();
if (!goldText.includes('cost $33.00 \u00b7 you keep $12.82 (27.0%)')) fail('gold margin line: ' + goldText);
const goldColor = await goldRow.locator('span').first().evaluate((e) => getComputedStyle(e).color);
if (goldColor !== 'rgb(255, 204, 102)') fail('an under-30% price should be flagged amber: ' + goldColor);
if ((await goldRow.locator('input').inputValue()) !== '47.50') fail('gold price input should hold 47.50');
if ((await hoodie.getByRole('button', { name: 'Use suggested price on the 1 under 30.0%' }).count()) !== 1) fail('one price under 30% should offer the bulk button');
await hoodie.screenshot({ path: OUT + 'console-prices.png' });
if (await hoodie.getByRole('button', { name: 'Suggest $30.99' }).count()) fail('a price above 30% should not be offered a cut');
// A typo is caught before anything is sent.
await goldRow.locator('input').fill('4o.00');
await goldRow.getByRole('button', { name: 'Save' }).click();
await page.waitForFunction(() => document.body.textContent.includes('Type a price like 23.99'));
if (pricePuts.length) fail('a bad price must not be sent');
await goldRow.getByRole('button', { name: 'Suggest $49.99' }).click();
if ((await goldRow.locator('input').inputValue()) !== '49.99') fail('suggest should fill 49.99');
let priceDialog = '';
page.once('dialog', (d) => { priceDialog = d.message(); d.accept(); });
await goldRow.getByRole('button', { name: 'Save' }).click();
await page.waitForFunction(() => document.body.textContent.includes('Gold / L is now $49.99'));
if (!priceDialog.includes('from $47.50 to $49.99')) fail('price confirm should name both prices: ' + priceDialog);
if (JSON.stringify(pricePuts) !== JSON.stringify([{ id: 9005, price: 4999 }])) fail('price PUT: ' + JSON.stringify(pricePuts));
// The panel reloads with the new price, and nothing is left under 30%.
await page.waitForFunction(() => [...document.querySelectorAll('#list .item input')].some((i) => i.value === '49.99' && i.getAttribute('aria-label') === 'Price for Gold / L'));
if (await hoodie.getByRole('button', { name: /Use suggested price/ }).count()) fail('bulk button should be gone once every price clears 30%');
await page.selectOption('#list .item:nth-child(2) select', '502');
const dirty = await page.$eval('#dirtyFlag', (e) => getComputedStyle(e).display !== 'none');
if (!dirty) fail('changing the picker should mark unsaved changes');

// Use all suggested prices: every linked card at once, only ever a raise.
// The hoodie already sits at its suggestions; the sticker card just linked
// to 502 is under, so exactly that one variant is raised.
const allBtn = page.getByRole('button', { name: 'Use all suggested prices' });
if (!(await allBtn.isVisible())) fail('the all-prices button belongs on the merch tab');
let allDialog = '';
page.once('dialog', (d) => { allDialog = d.message(); d.accept(); });
const putsBefore = pricePuts.length;
await allBtn.click();
await page.waitForFunction(() => document.body.textContent.includes('Updated 1 of 1 price'));
if (!allDialog.includes('Raise 1 price to the suggested price')) fail('all-prices confirm header: ' + allDialog);
if (!allDialog.includes('TOTE (3\u2033\u00d73\u2033): $4.00 \u2192 $4.99')) fail('all-prices confirm should list the change: ' + allDialog);
if (allDialog.includes('Gold') || allDialog.includes('Black')) fail('prices already at their suggestion must not be listed: ' + allDialog);
if (JSON.stringify(pricePuts.slice(putsBefore)) !== JSON.stringify([{ id: 9101, price: 499 }])) fail('all-prices PUTs: ' + JSON.stringify(pricePuts.slice(putsBefore)));
// Run again: nothing left under its suggestion, nothing sent, no dialog.
page.once('dialog', (d) => { fail('no confirm expected when nothing changes: ' + d.message()); d.dismiss(); });
await allBtn.click();
await page.waitForFunction(() => document.body.textContent.includes('Every price is already at or above its suggested price'));
if (pricePuts.length !== putsBefore + 1) fail('a second run must send nothing');
page.removeAllListeners('dialog');

// orders tab
await page.click('.tab[data-tab=orders]');
await page.waitForSelector('.mode-line');
const modeText = await page.$eval('.mode-line', (e) => e.textContent);
if (!/Confirm on payout/.test(modeText)) fail('mode line: ' + modeText);
const badges = await page.$$eval('#list .item .badge', (b) => b.map((x) => x.textContent));
if (!badges.includes('PAID · WAITING FOR PAYOUT') || !badges.includes('PRINTING · pending')) fail('badges ' + JSON.stringify(badges));
// receipts: every paid or printing order offers an email, a copy and a printable page
const mailHrefs = await page.$$eval('#list .item a.receipt-mail', (a) => a.map((x) => x.getAttribute('href')));
if (mailHrefs.length !== 2) fail('expected a receipt email link per paid order, got ' + mailHrefs.length);
const samMail = mailHrefs.find((h) => h.startsWith('mailto:sam%40example.com'));
if (!samMail) fail('receipt email should be addressed to the buyer: ' + JSON.stringify(mailHrefs));
const samBody = decodeURIComponent(samMail.split('&body=')[1]);
for (const want of ['Hi Sam,', 'Order WIZ-TWO', '2\u00d7 Unisex Hoodie (Purple / L) \u2014 $95.00', 'Shipping: $4.99', 'Total paid: $99.99 USD', 'Expect it at your door in about 12 days.', 'Questions? Email receipts@wizardshit.store.']) {
  if (!samBody.includes(want)) fail('receipt body missing ' + JSON.stringify(want) + ':\n' + samBody);
}
if (!decodeURIComponent(samMail).includes('subject=Your Wizard Shit order WIZ-TWO')) fail('receipt subject: ' + samMail);
const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#list .item button.receipt-print')]);
await popup.waitForFunction(() => document.body && document.body.textContent.includes('Total paid'));
const receiptText = await popup.evaluate(() => document.body.textContent);
for (const want of ['Receipt', 'Order WIZ-TWO', 'Sam Buyer', 'Unisex Hoodie (Purple / L)', '$99.99 USD']) {
  if (!receiptText.includes(want)) fail('printable receipt missing ' + JSON.stringify(want));
}
await popup.close();
if ((await page.$$('#list .item button.receipt-copy')).length !== 2) fail('expected a copy button per paid order');

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
