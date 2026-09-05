/**
 * The caretaker panel, served at /admin straight from the worker.
 *
 * It is one string rather than a separate deploy so there is exactly one thing
 * to keep alive: no second host, no build step, nothing that can drift out of
 * sync with the API it talks to.
 *
 * Everything here assumes photos are already public — uploads go straight to
 * the wall by design — so the panel is built around taking things down fast:
 * HIDE pulls a photo off the wall while keeping the file, DELETE removes both,
 * for good.
 */

export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:,">
<title>Caretaker</title>
<style>
  :root {
    --bg: #14110f; --panel: #1e1a17; --line: #332c27;
    --ink: #f2ece5; --soft: #a89c90; --accent: #d8a25c; --danger: #d4685c;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  /* A class with a display rule beats the browser's own [hidden] rule, so
     without this the "Load older photos" button stays on screen when there is
     nothing older, and any future display:* on a toggled element breaks the
     same way. The hidden attribute is the only switch used here; this makes it
     win. */
  [hidden] { display: none !important; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  header {
    padding: 18px 22px; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
    position: sticky; top: 0; background: var(--bg); z-index: 5;
  }
  h1 { font-size: 17px; margin: 0; letter-spacing: .08em; text-transform: uppercase; }
  .count { color: var(--soft); font-size: 13px; }
  main { padding: 22px; max-width: 1100px; margin: 0 auto; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 20px; }
  label { display: block; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--soft); margin: 14px 0 6px; }
  input, textarea {
    width: 100%; padding: 10px 12px; border-radius: 8px; font: inherit;
    background: #100d0b; border: 1px solid var(--line); color: var(--ink);
  }
  textarea { min-height: 90px; resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button {
    font: inherit; cursor: pointer; border-radius: 8px; padding: 9px 16px;
    border: 1px solid var(--line); background: #2a2420; color: var(--ink);
  }
  button:hover { border-color: var(--accent); }
  button.primary { background: var(--accent); border-color: var(--accent); color: #1a1410; font-weight: 600; }
  button.danger:hover { border-color: var(--danger); color: var(--danger); }
  .msg { margin-top: 14px; font-size: 14px; min-height: 20px; }
  .msg.bad { color: var(--danger); }
  .msg.good { color: var(--accent); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 22px; }
  .photo { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .photo.is-hidden { opacity: .45; }
  .photo img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; background: #0b0908; }
  .photo .rec { aspect-ratio: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 16px; background: #0b0908; }
  .photo .rec .tag { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--accent); text-align: center; }
  .photo .rec audio { width: 100%; }
  .photo .meta { padding: 12px; font-size: 13px; flex: 1; }
  .photo .cap { color: var(--ink); word-break: break-word; }
  .photo .by { color: var(--soft); font-size: 12px; margin-top: 5px; }
  .photo .by a { color: var(--accent); }
  .photo .acts { display: flex; gap: 8px; padding: 0 12px 12px; }
  .photo .acts button { flex: 1; padding: 7px 8px; font-size: 13px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 20px; }
  .tabs button[aria-selected="true"] { border-color: var(--accent); color: var(--accent); }
  .more { display: block; margin: 26px auto 0; }
  .empty { color: var(--soft); text-align: center; padding: 50px 0; }
  .hint { color: var(--soft); font-size: 13px; margin-top: 6px; }
  .toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .toolbar .hint { margin: 0; }
  .photo { position: relative; }
  .badge {
    position: absolute; top: 8px; left: 8px; z-index: 1;
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
    background: var(--accent); color: #1a1410; border-radius: 999px; padding: 4px 9px; font-weight: 600;
  }
  /* The trim dialog: the photo with the proposed crop drawn over it, four
     sliders to nudge the edges, and one button to make it so. */
  .trim { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; }
  .trim-inner { width: 100%; max-width: 760px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin: auto; }
  .trim-inner h2 { margin: 0 0 4px; font-size: 16px; letter-spacing: .06em; text-transform: uppercase; }
  .trim canvas { display: block; width: 100%; height: auto; max-height: 60vh; object-fit: contain; background: #0b0908; border-radius: 8px; margin-top: 12px; }
  .sliders { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-top: 12px; }
  .sliders label { margin: 0; display: flex; justify-content: space-between; }
  .sliders input[type=range] { width: 100%; padding: 0; background: none; border: 0; }
  .trim-acts { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
  .trim-acts .spacer { flex: 1; }
  @media (max-width: 520px) { .sliders { grid-template-columns: 1fr; } }
</style>
</head>
<body>

<div id="gate" hidden>
  <main style="max-width:420px;margin-top:12vh">
    <div class="card">
      <h1 style="margin-bottom:6px">Caretaker</h1>
      <p class="hint" style="margin-top:0">Sign in to manage the photo wall.</p>
      <label for="pw">Password</label>
      <input id="pw" type="password" autocomplete="current-password">
      <div style="margin-top:16px"><button class="primary" id="go">Sign in</button></div>
      <div class="msg" id="gateMsg"></div>
    </div>
  </main>
</div>

<div id="app" hidden>
  <header>
    <h1>Caretaker</h1>
    <span class="count" id="count"></span>
    <span style="flex:1"></span>
    <button id="out">Sign out</button>
  </header>
  <main>

    <section id="panePhotos">
      <div class="toolbar">
        <button id="scan">Find photos with bars</button>
        <span class="hint" id="scanMsg">Looks at every photo here for black bars or phone furniture around the edges.</span>
      </div>
      <div class="empty" id="loading">Loading…</div>
      <div class="grid" id="grid"></div>
      <button class="more" id="more" hidden>Load older photos</button>
    </section>

  </main>
</div>

<div class="trim" id="trim" hidden>
  <div class="trim-inner" role="dialog" aria-modal="true" aria-labelledby="trimTitle">
    <h2 id="trimTitle">Trim</h2>
    <p class="hint" style="margin:0">Everything outside the bright box is cut from what the site shows. The original file is kept exactly as it is, so this can always be undone.</p>
    <canvas id="trimCanvas"></canvas>
    <div class="sliders">
      <div><label for="cutTop">Top <span id="cutTopV"></span></label><input type="range" id="cutTop" min="0" max="45" step="0.5" value="0"></div>
      <div><label for="cutBottom">Bottom <span id="cutBottomV"></span></label><input type="range" id="cutBottom" min="0" max="45" step="0.5" value="0"></div>
      <div><label for="cutLeft">Left <span id="cutLeftV"></span></label><input type="range" id="cutLeft" min="0" max="45" step="0.5" value="0"></div>
      <div><label for="cutRight">Right <span id="cutRightV"></span></label><input type="range" id="cutRight" min="0" max="45" step="0.5" value="0"></div>
    </div>
    <div class="trim-acts">
      <button id="trimAuto">Find the bars again</button>
      <button id="trimReset">No trim</button>
      <span class="spacer"></span>
      <button id="trimCancel">Cancel</button>
      <button class="primary" id="trimApply">Trim and put on the wall</button>
    </div>
    <div class="msg" id="trimMsg"></div>
  </div>
</div>

<script>
(function () {
  var KEY = 'memorial-admin-token';
  var token = null;
  try { token = localStorage.getItem(KEY); } catch (e) {}

  var gate = document.getElementById('gate');
  var app = document.getElementById('app');
  var grid = document.getElementById('grid');
  var oldest = null;
  var cards = {};   // id -> { p, el } for everything on screen

  function niceSize(n) {
    return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function fmtDur(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('Please sign in again'); }
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Request failed');
        return d;
      });
    });
  }

  function show(el, on) { el.hidden = !on; }

  function signOut() {
    token = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
    show(app, false); show(gate, true);
  }

  document.getElementById('out').onclick = signOut;

  function signIn() {
    var pw = document.getElementById('pw').value;
    var msg = document.getElementById('gateMsg');
    msg.className = 'msg'; msg.textContent = 'Checking…';
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Could not sign in');
        return d;
      });
    }).then(function (d) {
      token = d.token;
      try { localStorage.setItem(KEY, token); } catch (e) {}
      msg.textContent = '';
      start();
    }).catch(function (e) {
      msg.className = 'msg bad'; msg.textContent = e.message;
    });
  }

  document.getElementById('go').onclick = signIn;
  document.getElementById('pw').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') signIn();
  });

  function card(p) {
    var el = document.createElement('div');
    el.className = 'photo' + (p.hidden ? ' is-hidden' : '');
    var media = p.kind === 'audio'
      ? '<div class="rec"><div class="tag">Recording' + (p.duration ? ' \u00b7 ' + fmtDur(p.duration) : '') + '</div>' +
        '<audio controls preload="none" src="' + esc(p.image) + '"></audio></div>'
      : '<img loading="lazy" src="' + esc(p.image) + '" alt="">';
    el.innerHTML =
      media +
      '<div class="meta">' +
        '<div class="cap">' + (p.caption ? esc(p.caption) : '<span style="color:var(--soft)">No caption</span>') + '</div>' +
        '<div class="by">' + (p.uploader ? 'added by ' + esc(p.uploader) : 'added anonymously') +
          (p.photographer ? ' \u00b7 photo by ' + esc(p.photographer) : '') +
          ' \u00b7 <a href="/api/admin/original/' + p.id + '?token=' + encodeURIComponent(token) + '">original' + (p.original_bytes ? ' ' + niceSize(p.original_bytes) : '') + '</a>' +
          ' · ' + esc(String(p.created_at || '').slice(0, 10)) + '</div>' +
      '</div>' +
      '<div class="acts">' +
        (p.kind === 'audio' || /\.gif$/i.test(p.image || '') ? '' : '<button data-act="trim">Trim</button>') +
        '<button data-act="hide">' + (p.hidden ? 'Put back' : 'Hide') + '</button>' +
        '<button class="danger" data-act="del">Delete</button>' +
      '</div>';

    var trimBtn = el.querySelector('[data-act="trim"]');
    if (trimBtn) trimBtn.onclick = function () { openTrim(p, el); };
    el.dataset.id = p.id;
    cards[p.id] = { p: p, el: el };

    el.querySelector('[data-act="hide"]').onclick = function () {
      api('/api/admin/photos/' + p.id, {
        method: 'POST',
        body: JSON.stringify({ hidden: p.hidden ? 0 : 1 }),
      }).then(function () {
        p.hidden = p.hidden ? 0 : 1;
        el.classList.toggle('is-hidden', !!p.hidden);
        el.querySelector('[data-act="hide"]').textContent = p.hidden ? 'Put back' : 'Hide';
      }).catch(function (e) { alert(e.message); });
    };

    el.querySelector('[data-act="del"]').onclick = function () {
      // Deleting removes the only copy on the site, and someone may have
      // uploaded the only copy that exists anywhere. Always confirm.
      if (!confirm('Delete this photo permanently? This cannot be undone.')) return;
      api('/api/admin/photos/' + p.id, { method: 'DELETE' })
        .then(function () { el.remove(); })
        .catch(function (e) { alert(e.message); });
    };
    return el;
  }

  function loadPhotos(append) {
    var url = '/api/admin/photos' + (append && oldest ? '?before=' + oldest : '');
    return api(url).then(function (d) {
      show(document.getElementById('loading'), false);
      if (!append) { grid.innerHTML = ''; cards = {}; }
      (d.photos || []).forEach(function (p) {
        grid.appendChild(card(p));
        oldest = p.id;
      });
      document.getElementById('count').textContent =
        d.total === 1 ? '1 item' : d.total + ' items';
      show(document.getElementById('more'), !!d.more);
      if (!d.total) grid.innerHTML = '<div class="empty">No photos yet.</div>';
    });
  }

  document.getElementById('more').onclick = function () { loadPhotos(true); };

  /* ----------------------------------------------------------- trimming --- */

  // Finding the photograph inside a screenshot. Phone and Facebook furniture
  // — status bars, black letterbox bands, flat grey panels, a blurred wash —
  // is SMOOTH: along one of its rows, neighbouring pixels are all but the
  // same. A photograph never is; even a night sky carries sensor noise. So
  // each row is scored by how much it changes from pixel to pixel, and the
  // photo is the longest run of rows that change. Then the same across, for
  // side bars. Same method as tools/crop-screenshots.py, which was measured
  // against real screenshots: furniture scores 0.00-0.13, photos 0.84 and up.
  function $(id) { return document.getElementById(id); }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Could not load that photo')); };
      im.src = src;
    });
  }

  function longestRun(flags) {
    var best = null, i = 0, n = flags.length;
    while (i < n) {
      if (flags[i]) {
        var start = i;
        while (i < n && flags[i]) i++;
        if (!best || i - start > best[1] - best[0]) best = [start, i];
      }
      i++;
    }
    return best;
  }

  // Returns the photo's box {x, y, w, h} in the image's own pixels, or null
  // when nothing looks like a bar. Works on a copy no larger than 1600px so
  // a 12MB photo does not take seconds; the noise the method relies on is
  // still there at that size.
  function findBars(im) {
    var W = im.naturalWidth, H = im.naturalHeight;
    if (!W || !H) return null;
    var scale = Math.min(1, 1600 / Math.max(W, H));
    var w = Math.max(2, Math.round(W * scale)), h = Math.max(2, Math.round(H * scale));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(im, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;
    var L = new Float32Array(w * h);
    for (var i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];

    var rows = new Uint8Array(h);
    for (var y = 0; y < h; y++) {
      var t = 0, o = y * w;
      for (var x = 1; x < w; x++) t += Math.abs(L[o + x] - L[o + x - 1]);
      rows[y] = t / (w - 1) >= 0.5 ? 1 : 0;
    }
    var band = longestRun(rows);
    if (!band || band[1] - band[0] < Math.max(40, h * 0.12)) return null;

    var cols = new Uint8Array(w);
    for (var x2 = 0; x2 < w; x2++) {
      var t2 = 0;
      for (var y2 = band[0] + 1; y2 < band[1]; y2++) t2 += Math.abs(L[y2 * w + x2] - L[(y2 - 1) * w + x2]);
      cols[x2] = t2 / (band[1] - band[0] - 1) >= 0.5 ? 1 : 0;
    }
    var cband = longestRun(cols);
    if (!cband || cband[1] - cband[0] < Math.max(40, w * 0.12)) cband = [0, w];

    var box = {
      x: Math.round(cband[0] / scale), y: Math.round(band[0] / scale),
      w: Math.round((cband[1] - cband[0]) / scale), h: Math.round((band[1] - band[0]) / scale),
    };
    box.w = Math.min(box.w, W - box.x); box.h = Math.min(box.h, H - box.y);
    // Under one percent off the full frame is the method's own jitter, not a bar.
    if (box.x < W * 0.01 && box.y < H * 0.01 && box.w > W * 0.98 && box.h > H * 0.98) return null;
    return box;
  }

  var trimming = null;   // { p, el, im, W, H }

  function cuts() {
    return {
      top: Number($('cutTop').value), bottom: Number($('cutBottom').value),
      left: Number($('cutLeft').value), right: Number($('cutRight').value),
    };
  }
  function setCuts(c) {
    $('cutTop').value = c.top; $('cutBottom').value = c.bottom; $('cutLeft').value = c.left; $('cutRight').value = c.right;
  }
  function boxFromCuts() {
    var c = cuts(), W = trimming.W, H = trimming.H;
    var x = Math.round(W * c.left / 100), y = Math.round(H * c.top / 100);
    var x2 = Math.round(W * (1 - c.right / 100)), y2 = Math.round(H * (1 - c.bottom / 100));
    return { x: x, y: y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) };
  }
  function cutsFromBox(b) {
    var W = trimming.W, H = trimming.H;
    var r = function (v) { return Math.round(v * 2) / 2; };
    return { top: r(b.y / H * 100), bottom: r((H - b.y - b.h) / H * 100), left: r(b.x / W * 100), right: r((W - b.x - b.w) / W * 100) };
  }

  function drawTrim() {
    if (!trimming) return;
    var im = trimming.im, W = trimming.W, H = trimming.H;
    var scale = Math.min(1, 1000 / Math.max(W, H));
    var cv = $('trimCanvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    var ctx = cv.getContext('2d');
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    var b = boxFromCuts();
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(0, 0, cv.width, b.y * scale);
    ctx.fillRect(0, (b.y + b.h) * scale, cv.width, cv.height - (b.y + b.h) * scale);
    ctx.fillRect(0, b.y * scale, b.x * scale, b.h * scale);
    ctx.fillRect((b.x + b.w) * scale, b.y * scale, cv.width - (b.x + b.w) * scale, b.h * scale);
    ctx.strokeStyle = '#d8a25c'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x * scale + 1, b.y * scale + 1, b.w * scale - 2, b.h * scale - 2);
    var c = cuts();
    $('cutTopV').textContent = c.top + '%'; $('cutBottomV').textContent = c.bottom + '%';
    $('cutLeftV').textContent = c.left + '%'; $('cutRightV').textContent = c.right + '%';
    $('trimApply').disabled = !(c.top || c.bottom || c.left || c.right);
    $('trimApply').textContent = $('trimApply').disabled ? 'Nothing to trim' : 'Trim and put on the wall  ' + b.w + '×' + b.h;
  }

  function openTrim(p, el) {
    var msg = $('trimMsg'); msg.className = 'msg'; msg.textContent = 'Loading the photo…';
    show($('trim'), true);
    document.body.style.overflow = 'hidden';
    loadImage(p.image).then(function (im) {
      trimming = { p: p, el: el, im: im, W: im.naturalWidth, H: im.naturalHeight };
      var box = findBars(im);
      setCuts(box ? cutsFromBox(box) : { top: 0, bottom: 0, left: 0, right: 0 });
      msg.textContent = box ? 'Found bars. Check the box, nudge the sliders if it needs it.' : 'No bars found. You can still trim by hand with the sliders.';
      drawTrim();
    }).catch(function (e) { msg.className = 'msg bad'; msg.textContent = e.message; });
  }

  function closeTrim() {
    show($('trim'), false);
    document.body.style.overflow = '';
    trimming = null;
  }

  ['cutTop', 'cutBottom', 'cutLeft', 'cutRight'].forEach(function (id) { $(id).addEventListener('input', drawTrim); });
  $('trimCancel').onclick = closeTrim;
  $('trimReset').onclick = function () { setCuts({ top: 0, bottom: 0, left: 0, right: 0 }); drawTrim(); };
  $('trimAuto').onclick = function () {
    if (!trimming) return;
    var box = findBars(trimming.im);
    setCuts(box ? cutsFromBox(box) : { top: 0, bottom: 0, left: 0, right: 0 });
    $('trimMsg').textContent = box ? 'Found bars.' : 'No bars found.';
    drawTrim();
  };
  $('trim').addEventListener('click', function (e) { if (e.target === $('trim')) closeTrim(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('trim').hidden) closeTrim(); });

  function cropTo(edge, quality) {
    var b = boxFromCuts();
    var s = Math.min(1, edge / Math.max(b.w, b.h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * s)); c.height = Math.max(1, Math.round(b.h * s));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(trimming.im, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
    return new Promise(function (res) { c.toBlob(res, 'image/jpeg', quality); });
  }

  $('trimApply').onclick = function () {
    if (!trimming) return;
    var t = trimming, msg = $('trimMsg');
    $('trimApply').disabled = true;
    msg.className = 'msg'; msg.textContent = 'Trimming…';
    Promise.all([cropTo(2400, 0.9), cropTo(900, 0.85)]).then(function (blobs) {
      var fd = new FormData();
      fd.append('display', blobs[0], 'photo.jpg');
      fd.append('thumb', blobs[1], 'thumb.jpg');
      return fetch('/api/admin/photos/' + t.p.id + '/trim', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd })
        .then(function (r) {
          if (r.status === 401) { signOut(); throw new Error('Please sign in again'); }
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok) throw new Error(d.error || 'Could not trim');
            return d;
          });
        });
    }).then(function (d) {
      t.p.image = d.image; t.p.width = d.width; t.p.height = d.height;
      var img = t.el.querySelector('img');
      if (img) img.src = d.image;
      var badge = t.el.querySelector('.badge');
      if (badge) badge.remove();
      msg.className = 'msg good'; msg.textContent = 'Done. It is on the wall like this now.';
      setTimeout(closeTrim, 900);
    }).catch(function (e) {
      msg.className = 'msg bad'; msg.textContent = e.message;
      $('trimApply').disabled = false;
    });
  };

  // Look at every photo on this screen and mark the ones with bars, so
  // they can be dealt with one after another instead of hunted for.
  $('scan').onclick = function () {
    var ids = Object.keys(cards).filter(function (id) { return cards[id].p.kind !== 'audio' && !/\.gif$/i.test(cards[id].p.image || ''); });
    var msg = $('scanMsg'), found = 0, done = 0;
    $('scan').disabled = true;
    var next = function () {
      if (!ids.length) {
        $('scan').disabled = false;
        msg.textContent = found ? found + ' with bars, marked above. Tap Trim on each.' : 'No bars found on any of the ' + done + ' photos here.';
        return;
      }
      var id = ids.shift(), c = cards[id];
      msg.textContent = 'Looking… ' + (done + 1) + ' of ' + (done + 1 + ids.length);
      loadImage(c.p.image).then(function (im) {
        var old = c.el.querySelector('.badge'); if (old) old.remove();
        if (findBars(im)) { found++; var b = document.createElement('span'); b.className = 'badge'; b.textContent = 'bars'; c.el.insertBefore(b, c.el.firstChild); }
      }).catch(function () {}).then(function () { done++; next(); });
    };
    next();
  };

  function start() {
    show(gate, false); show(app, true);
    oldest = null;
    loadPhotos(false).catch(function (e) {
      var l = document.getElementById('loading');
      l.hidden = false; l.textContent = e.message;
    });
  }

  // A stored token may have expired while the tab was closed; the first call
  // finds out and drops straight back to the sign-in box.
  if (token) start(); else show(gate, true);
})();
</script>
</body>
</html>`;
