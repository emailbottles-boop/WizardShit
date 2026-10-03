// Proves the DONATE buttons honour a Stripe Payment Link pasted into
// js/config.js (WIZ_DONATE_LINK), and only when the Worker's own donate
// popup is off:
//   - link set, popup off  -> every DONATE button goes to the link (new tab)
//   - link set, popup on   -> the popup still wins, nothing leaves the page
//   - link set, API down   -> the link still applies (nothing goes dead)
//   - no link,  popup off  -> the original link stays exactly as it was
//   - junk link            -> ignored, the original link stays
// Serves the repo root on its own port and stubs the Worker, like site.mjs.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const PORT = 8086;
const LINK = 'https://donate.stripe.com/test_wizardshit';
const ORIGINAL = 'https://donorbox.org/wiz-rd-shit?';

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
const CONFIG = fs.readFileSync(path.join(ROOT, 'js/config.js'), 'utf8');

const fail = (m) => { throw new Error(m); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const errors = [];

// One page per case: `link` is what js/config.js says, `donate` what the
// Worker says, `down` makes every API call fail.
async function open({ link, donate, down }) {
  // Routes go on the context, so the tab a DONATE click opens is stubbed too.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.close = () => context.close();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // The real config.js, with the link line replaced by this case's value.
  await context.route('**/js/config.js', (route) => {
    let body = CONFIG;
    if (link !== undefined) {
      if (!/window\.WIZ_DONATE_LINK\s*=/.test(body)) fail('js/config.js has no WIZ_DONATE_LINK line');
      body = body.replace(/window\.WIZ_DONATE_LINK\s*=\s*"[^"]*";/, 'window.WIZ_DONATE_LINK = ' + JSON.stringify(link) + ';');
    }
    return route.fulfill({ status: 200, contentType: 'text/javascript', body });
  });
  let answered;
  const asked = new Promise((r) => { answered = r; });
  await context.route('https://wizardshit.store/**', (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/shop/products') setTimeout(answered, 0);
    if (down) return route.abort('failed');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    if (p === '/api/shop/products') return json({ shop: false, donate: !!donate, mode: 'payout', products: [] });
    if (p === '/api/content') return json({ merch: [], credits: [], donators: [] });
    return json({ ok: true });
  });
  await context.route(LINK + '**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stripe</title>ok' }));
  await page.goto(base + '/');
  // shop.js wires the buttons right after /api/shop/products answers (or
  // fails), so wait for that call and give it a beat.
  await asked;
  await page.waitForTimeout(500);
  return page;
}

const buttons = (page) => page.$$eval('.donate-btn', (as) => as.map((a) => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent.trim(), img: !!a.querySelector('img') })));

// 1. link set, popup off: both DONATE buttons go to the link, in a new tab
{
  const page = await open({ link: LINK, donate: false });
  const bs = await buttons(page);
  if (bs.length < 2) fail('expected the header and the mobile footer DONATE buttons, got ' + bs.length);
  for (const b of bs) {
    if (b.href !== LINK) fail('DONATE should go to the Stripe link, got ' + b.href);
    if (b.target !== '_blank') fail('DONATE should open the Stripe link in a new tab, got target=' + JSON.stringify(b.target));
    if (!/noopener/.test(b.rel)) fail('DONATE link should carry rel=noopener, got ' + JSON.stringify(b.rel));
    if (!/♥/.test(b.text) || !/DONATE/.test(b.text) || b.img) fail('DONATE should read "♥ DONATE" without the old logo, got ' + JSON.stringify(b.text) + ' img=' + b.img);
  }
  // Clicking really leaves for the link, and the popup never appears.
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('.donate-wrap .donate-btn')]);
  await popup.waitForLoadState();
  if (!popup.url().startsWith(LINK)) fail('click should open the Stripe link, opened ' + popup.url());
  if (!(await page.$eval('#donateModal', (m) => m.hidden))) fail('the popup must stay closed when the link is in use');
  await popup.close();
  await page.close();
  console.log('link + popup off OK');
}

// 2. link set, popup on: the popup wins and nothing leaves the page
{
  const page = await open({ link: LINK, donate: true });
  let navigated = null;
  page.on('popup', (p) => { navigated = p.url(); });
  await page.click('.donate-wrap .donate-btn');
  await page.waitForSelector('#donateModal:not([hidden])');
  await page.waitForTimeout(200);
  if (navigated) fail('the popup should win over the link, but a tab opened: ' + navigated);
  if (page.url() !== base + '/') fail('the popup should keep the page put, but it went to ' + page.url());
  await page.close();
  console.log('link + popup on OK');
}

// 3. link set, Worker unreachable: the link still applies
{
  const page = await open({ link: LINK, donate: false, down: true });
  const bs = await buttons(page);
  for (const b of bs) if (b.href !== LINK) fail('with the Worker down DONATE should still go to the link, got ' + b.href);
  await page.close();
  console.log('link + API down OK');
}

// 4. no link, popup off: the original link stays exactly as it was
{
  const page = await open({ link: '', donate: false });
  const bs = await buttons(page);
  for (const b of bs) {
    if (b.href !== ORIGINAL) fail('with no link DONATE must keep its original link, got ' + b.href);
    if (!b.img) fail('with no link DONATE must keep its original look');
  }
  await page.close();
  console.log('no link OK');
}

// 5. a junk value is ignored: the original link stays
for (const junk of ['javascript:alert(1)', 'donate.stripe.com/no-scheme', 'http://donate.stripe.com/plain', 'https://bad link']) {
  const page = await open({ link: junk, donate: false });
  const bs = await buttons(page);
  for (const b of bs) if (b.href !== ORIGINAL) fail('junk link ' + JSON.stringify(junk) + ' should be ignored, got ' + b.href);
  await page.close();
}
console.log('junk link ignored OK');

await browser.close();
server.close();
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log('donate-link OK');
