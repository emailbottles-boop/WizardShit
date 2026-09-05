#!/usr/bin/env node
/**
 * Trim the bars and phone furniture off every photo on the wall, unattended.
 *
 *   cd tools && npm install            (once)
 *   ADMIN_PASSWORD=... node trim-all.mjs [--dry-run] [--base https://mahoganyjr.com]
 *
 * Signs in as the caretaker, walks every photo, looks at the ones not yet
 * trimmed, and for each one where it finds a bar — a black letterbox band,
 * a status bar, a flat grey viewer strip — it cuts the photograph out and
 * puts the cut copy on the wall through the same endpoint the admin page's
 * Trim button uses. Nothing is lost: the copy it replaces is kept, and the
 * admin page shows an Untrim button on every photo this touched.
 *
 * Deliberately cautious. A photo is only trimmed when the bars are real
 * (at least 3% off one edge) and the photograph is most of the frame (at
 * least 40% of it stays). Anything else is left alone and listed.
 *
 * How it finds the photo: furniture is smooth from pixel to pixel along a
 * row; a photograph never is. Same method, same numbers, as the Trim button
 * and tools/crop-screenshots.py.
 */
import sharp from 'sharp';
import { writeFileSync, appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const baseAt = args.indexOf('--base');
const BASE = (baseAt >= 0 ? args[baseAt + 1] : 'https://mahoganyjr.com').replace(/\/+$/, '');
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const LOG = new URL('./trim-all.log', import.meta.url);

if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD to the caretaker password first.');
  process.exit(2);
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
function say(line) { console.log(line); appendFileSync(LOG, line + '\n'); }

async function api(path, opts = {}, token) {
  const headers = Object.assign({}, opts.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, Object.assign({}, opts, { headers }));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status + ' on ' + path));
  return d;
}

function longestRun(flags) {
  let best = null;
  for (let i = 0; i < flags.length;) {
    if (flags[i]) {
      const start = i;
      while (i < flags.length && flags[i]) i++;
      if (!best || i - start > best[1] - best[0]) best = [start, i];
    }
    i++;
  }
  return best;
}

// The photo's box {x, y, w, h} in the image's own pixels, or null.
async function findBars(buf) {
  const meta = await sharp(buf).metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) return null;
  const scale = Math.min(1, 1600 / Math.max(W, H));
  const { data, info } = await sharp(buf).rotate().resize({ width: Math.max(2, Math.round(W * scale)), height: Math.max(2, Math.round(H * scale)), fit: 'fill' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const rows = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let t = 0; const o = y * w;
    for (let x = 1; x < w; x++) t += Math.abs(data[o + x] - data[o + x - 1]);
    rows[y] = t / (w - 1) >= 0.5 ? 1 : 0;
  }
  const band = longestRun(rows);
  if (!band || band[1] - band[0] < Math.max(40, h * 0.12)) return null;
  const cols = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let t = 0;
    for (let y = band[0] + 1; y < band[1]; y++) t += Math.abs(data[y * w + x] - data[(y - 1) * w + x]);
    cols[x] = t / (band[1] - band[0] - 1) >= 0.5 ? 1 : 0;
  }
  let cband = longestRun(cols);
  if (!cband || cband[1] - cband[0] < Math.max(40, w * 0.12)) cband = [0, w];
  const box = {
    x: Math.round(cband[0] / scale), y: Math.round(band[0] / scale),
    w: Math.round((cband[1] - cband[0]) / scale), h: Math.round((band[1] - band[0]) / scale),
  };
  box.w = Math.min(box.w, W - box.x); box.h = Math.min(box.h, H - box.y);
  // Only a real bar counts: 3% or more off at least one edge, and most of
  // the frame kept. Anything subtler is the method's own jitter, or a
  // photo that simply has a dark edge, and is left alone.
  const cut = { top: box.y / H, bottom: (H - box.y - box.h) / H, left: box.x / W, right: (W - box.x - box.w) / W };
  const biggest = Math.max(cut.top, cut.bottom, cut.left, cut.right);
  if (biggest < 0.03) return null;
  if ((box.w * box.h) / (W * H) < 0.4) return null;
  return Object.assign(box, { W, H });
}

async function cropTo(buf, box, edge, quality) {
  const s = Math.min(1, edge / Math.max(box.w, box.h));
  return sharp(buf).rotate().extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize({ width: Math.max(1, Math.round(box.w * s)), height: Math.max(1, Math.round(box.h * s)), fit: 'fill' })
    .flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer();
}

async function main() {
  writeFileSync(LOG, '');
  say('==== ' + stamp() + '  trim-all on ' + BASE + (DRY ? '  (dry run: nothing changed)' : ''));
  const { token } = await api('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });

  const all = [];
  let before = null;
  for (;;) {
    const d = await api('/api/admin/photos' + (before ? '?before=' + before : ''), {}, token);
    const page = d.photos || [];
    all.push(...page);
    if (!d.more || !page.length) break;
    before = page[page.length - 1].id;
  }
  const todo = all.filter((p) => p.kind !== 'audio' && p.image && !p.hidden && !p.trimmed && !/gif/i.test(p.mime || '') && !/\.gif$/i.test(p.image || ''));
  say(all.length + ' items on the site, ' + todo.length + ' photos to look at.');

  let trimmed = 0, clean = 0, skipped = 0, failed = 0;
  for (const p of todo) {
    const label = '#' + p.id + (p.caption ? ' "' + p.caption.slice(0, 30) + '"' : '');
    try {
      const r = await fetch(BASE + p.image);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching the photo');
      const buf = Buffer.from(await r.arrayBuffer());
      const box = await findBars(buf);
      if (!box) { clean++; say('  ok     ' + label + '  no bars'); continue; }
      const what = box.W + 'x' + box.H + ' -> ' + box.w + 'x' + box.h + ' (from x' + box.x + ' y' + box.y + ')';
      if (DRY) { trimmed++; say('  would  ' + label + '  ' + what); continue; }
      const [display, thumb] = await Promise.all([cropTo(buf, box, 2400, 90), cropTo(buf, box, 900, 85)]);
      const fd = new FormData();
      fd.append('display', new Blob([display], { type: 'image/jpeg' }), 'photo.jpg');
      fd.append('thumb', new Blob([thumb], { type: 'image/jpeg' }), 'thumb.jpg');
      await api('/api/admin/photos/' + p.id + '/trim', { method: 'POST', body: fd }, token);
      trimmed++;
      say('  TRIM   ' + label + '  ' + what);
    } catch (e) {
      failed++;
      say('  FAIL   ' + label + '  ' + e.message);
    }
  }
  say('==== ' + stamp() + '  ' + (DRY ? 'would trim ' : 'trimmed ') + trimmed + ', left alone ' + clean + ', failed ' + failed + '. Every trim can be undone in /admin with Untrim.');
  if (failed) process.exitCode = 1;
}

main().catch((e) => { say('FAILED: ' + e.message); process.exit(1); });
