// The admin panel, served by the worker at /admin.
// Kept as one self-contained page: no build step, no dependencies.
// NOTE: this file is a JS template literal — the page's own scripts use
// string concatenation (no backticks) so they don't terminate it.

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Wizard Shit — Control Room</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { min-height: 100%; }
  body {
    background: #0e0520;
    color: #fff;
    font-family: system-ui, sans-serif;
    padding-bottom: 6rem;
  }
  body::before {
    content: '';
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image:
      radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 30% 60%, rgba(255,255,255,0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 55% 25%, rgba(255,255,255,0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 75% 70%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 10%, rgba(255,255,255,0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 20% 85%, rgba(255,255,255,0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 65% 50%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 92% 45%, rgba(255,255,255,0.4) 0%, transparent 100%);
  }
  .wrap { position: relative; z-index: 1; max-width: 880px; margin: 0 auto; padding: 2rem 1.2rem; }

  header { text-align: center; margin-bottom: 2rem; }
  header h1 {
    font-size: clamp(1.6rem, 5vw, 2.4rem);
    font-weight: 900;
    letter-spacing: 0.08em;
    color: rgb(255, 210, 60);
    text-shadow: 0 0 25px rgba(255, 190, 40, 0.55);
  }
  header .sub { margin-top: 0.4rem; font-size: 0.8rem; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
  #whoami { margin-top: 0.6rem; font-size: 0.75rem; color: rgba(180, 80, 255, 0.9); }

  .tabs { display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1.6rem; }
  .tab {
    padding: 0.7rem 1.4rem;
    border: 2px solid rgba(180, 80, 255, 0.4);
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    color: #fff;
    font-weight: 800;
    letter-spacing: 0.12em;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.85rem;
  }
  .tab:hover { border-color: rgba(255, 220, 120, 0.6); transform: scale(1.04); }
  .tab.active {
    background: linear-gradient(160deg, rgb(255, 210, 60) 0%, rgb(255, 170, 30) 100%);
    color: #2a0550;
    border-color: transparent;
    box-shadow: 0 0 30px rgba(255, 190, 40, 0.45);
  }

  .toolbar { display: flex; gap: 0.6rem; align-items: center; margin-bottom: 1.2rem; flex-wrap: wrap; }
  .btn {
    padding: 0.55rem 1.1rem;
    border-radius: 10px;
    border: 2px solid rgba(180, 80, 255, 0.45);
    background: rgba(255,255,255,0.07);
    color: #fff;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.15s ease;
  }
  .btn:hover { border-color: rgba(255, 220, 120, 0.6); }
  .btn.primary {
    background: linear-gradient(160deg, rgb(255, 210, 60) 0%, rgb(255, 170, 30) 100%);
    color: #2a0550;
    border-color: transparent;
  }
  .btn.primary:hover { box-shadow: 0 0 25px rgba(255, 190, 40, 0.5); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  #dirtyFlag { font-size: 0.75rem; color: rgb(255, 160, 120); display: none; letter-spacing: 0.08em; }

  .item {
    border: 2px solid rgba(180, 80, 255, 0.3);
    border-radius: 14px;
    background: rgba(255,255,255,0.06);
    backdrop-filter: blur(8px);
    padding: 1rem;
    margin-bottom: 0.9rem;
  }
  .item.hidden-item { opacity: 0.45; border-style: dashed; }
  .item-head { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.8rem; }
  .item-head .grow { flex: 1; }
  .icon-btn {
    width: 32px; height: 32px;
    border-radius: 8px;
    border: 1.5px solid rgba(180, 80, 255, 0.4);
    background: rgba(255,255,255,0.06);
    color: #fff; cursor: pointer; font-size: 0.85rem;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { border-color: rgba(255, 220, 120, 0.7); }
  .icon-btn.danger:hover { border-color: rgba(255, 90, 90, 0.8); color: rgb(255, 120, 120); }

  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
  .fields .full { grid-column: 1 / -1; }
  @media (max-width: 620px) { .fields { grid-template-columns: 1fr; } }
  label { display: block; font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 0.3rem; }
  input[type=text], textarea {
    width: 100%;
    background: rgba(0,0,0,0.35);
    border: 1.5px solid rgba(180, 80, 255, 0.3);
    border-radius: 8px;
    color: #fff;
    padding: 0.55rem 0.7rem;
    font-size: 0.85rem;
    font-family: inherit;
  }
  input[type=text]:focus, textarea:focus { outline: none; border-color: rgb(255, 210, 60); }
  textarea { resize: vertical; min-height: 70px; }
  .check { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.75); cursor: pointer; }
  .check input { width: 16px; height: 16px; accent-color: rgb(255, 210, 60); }
  .checks { display: flex; gap: 1.2rem; align-items: center; flex-wrap: wrap; padding-top: 0.4rem; }

  .thumb {
    width: 64px; height: 64px; border-radius: 10px; flex-shrink: 0;
    background-size: cover; background-position: center;
    border: 2px solid rgba(255, 220, 120, 0.4);
    background-color: rgba(0,0,0,0.4);
  }
  .thumb.round { border-radius: 50%; }
  .img-row { display: flex; gap: 0.7rem; align-items: flex-end; }
  .img-row .grow { flex: 1; }
  .dropzone {
    display: flex; gap: 0.9rem; align-items: center;
    border: 2px dashed rgba(180, 80, 255, 0.35);
    border-radius: 12px;
    padding: 0.7rem 0.9rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .dropzone.dragging { border-color: rgb(255, 210, 60); background: rgba(255, 210, 60, 0.08); }
  .drop-hint { flex: 1; font-size: 0.72rem; color: rgba(255,255,255,0.45); letter-spacing: 0.08em; text-align: right; }

  #toast {
    position: fixed; left: 50%; bottom: 1.6rem; transform: translateX(-50%);
    background: rgba(20, 6, 40, 0.95);
    border: 2px solid rgb(255, 210, 60);
    color: #fff;
    border-radius: 12px;
    padding: 0.8rem 1.4rem;
    font-size: 0.85rem;
    z-index: 50;
    display: none;
    max-width: 90vw;
    box-shadow: 0 0 35px rgba(255, 190, 40, 0.35);
  }
  #toast.error { border-color: rgb(255, 90, 90); box-shadow: 0 0 35px rgba(255, 60, 60, 0.35); }

  #loginOverlay {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(7, 0, 15, 0.92);
    display: none; align-items: center; justify-content: center; padding: 1.5rem;
  }
  #loginOverlay .box {
    width: min(360px, 92vw);
    border: 2px solid rgba(180, 80, 255, 0.5);
    border-radius: 16px;
    background: #140628;
    padding: 2rem 1.6rem;
    text-align: center;
    box-shadow: 0 0 60px rgba(140, 40, 255, 0.4);
  }
  #loginOverlay h2 { color: rgb(255, 210, 60); letter-spacing: 0.1em; margin-bottom: 0.4rem; }
  #loginOverlay p { font-size: 0.75rem; color: rgba(255,255,255,0.6); margin-bottom: 1.2rem; }
  #loginOverlay input { margin-bottom: 0.9rem; text-align: center; }
  #loginErr { color: rgb(255, 120, 120); font-size: 0.75rem; margin-top: 0.7rem; display: none; }

  .empty { text-align: center; color: rgba(255,255,255,0.45); padding: 2.5rem 1rem; font-size: 0.85rem; letter-spacing: 0.08em; }

  /* photo framing sliders */
  .framing { display: flex; gap: 1rem; align-items: center; }
  .framing .sliders { flex: 1; display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.7rem; align-items: center; }
  .framing .sliders span { font-size: 0.6rem; letter-spacing: 0.15em; color: rgba(255,255,255,0.5); text-transform: uppercase; }
  input[type=range] { width: 100%; accent-color: rgb(255, 210, 60); }
  .css-link { font-size: 0.65rem; color: rgba(180, 80, 255, 0.9); cursor: pointer; text-decoration: underline; letter-spacing: 0.08em; }

  /* messages inbox */
  .item.unread { border-color: rgba(255, 210, 60, 0.65); }
  .msg-meta { font-size: 0.7rem; color: rgba(255,255,255,0.55); }
  .msg-body { white-space: pre-wrap; font-size: 0.85rem; line-height: 1.5; }

  /* orders + printful import */
  .order-line { font-size: 0.8rem; color: rgba(255,255,255,0.8); line-height: 1.6; }
  .order-line a { color: rgb(255, 210, 60); }
  .pf-panel { border: 2px dashed rgba(255, 220, 120, 0.45); border-radius: 14px; padding: 1rem; margin-bottom: 1rem; }
  .pf-row { display: flex; gap: 0.8rem; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .pf-row:last-child { border-bottom: none; }
  .pf-row .thumb { width: 44px; height: 44px; }
  .pf-row .grow { flex: 1; font-size: 0.85rem; }
  .pf-note { font-size: 0.68rem; color: rgba(255,255,255,0.5); margin-top: 0.6rem; }
</style>
</head>
<body>

<div id="loginOverlay">
  <div class="box">
    <h2>CONTROL ROOM</h2>
    <p>Owners only — enter the admin password.</p>
    <input type="password" id="pwInput" placeholder="password" autocomplete="current-password">
    <button class="btn primary" id="pwBtn" style="width:100%">ENTER</button>
    <div id="loginErr"></div>
  </div>
</div>

<div class="wrap">
  <header>
    <h1>WIZ@RD SHIT</h1>
    <div class="sub">Control Room</div>
    <div id="whoami"></div>
  </header>

  <nav class="tabs">
    <button class="tab active" data-tab="merch">MERCH</button>
    <button class="tab" data-tab="credits">CREDITS</button>
    <button class="tab" data-tab="donators">DONATORS</button>
    <button class="tab" data-tab="messages">MESSAGES</button>
    <button class="tab" data-tab="orders">ORDERS</button>
  </nav>

  <div class="toolbar">
    <button class="btn" id="addBtn">+ ADD</button>
    <button class="btn" id="printfulBtn" style="display:none">&#8681; IMPORT FROM PRINTFUL</button>
    <span id="dirtyFlag">● unsaved changes</span>
    <span style="flex:1"></span>
    <button class="btn" id="reloadBtn">RELOAD</button>
    <button class="btn primary" id="saveBtn">SAVE &amp; PUBLISH</button>
  </div>

  <div id="list"></div>
</div>

<div id="toast"></div>

<script>
(function () {
  'use strict';

  var state = { merch: [], credits: [], donators: [] };
  var inbox = null;        // fetched on first visit to MESSAGES
  var orders = null;       // fetched on first visit to ORDERS
  var ordersError = '';
  var pfProducts = null;   // Printful import panel data
  var pfOpen = false;
  var tab = 'merch';
  var dirty = false;
  var SITE = 'https://wizardshit.store/';

  var listEl = document.getElementById('list');
  var toastEl = document.getElementById('toast');
  var dirtyEl = document.getElementById('dirtyFlag');

  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.className = isErr ? 'error' : '';
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.display = 'none'; }, isErr ? 6000 : 2500);
  }

  function setDirty(v) {
    dirty = v;
    dirtyEl.style.display = v ? 'inline' : 'none';
  }
  window.addEventListener('beforeunload', function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---- auth-aware fetch ---- */
  function authHeaders() {
    var h = {};
    var pw = sessionStorage.getItem('wizpw');
    if (pw) h['Authorization'] = 'Bearer ' + pw;
    return h;
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, authHeaders());
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        document.getElementById('loginOverlay').style.display = 'flex';
        throw new Error('login required');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  document.getElementById('pwBtn').onclick = tryLogin;
  document.getElementById('pwInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryLogin();
  });
  function tryLogin() {
    var pw = document.getElementById('pwInput').value;
    sessionStorage.setItem('wizpw', pw);
    fetch('/api/admin/login', { method: 'POST', headers: authHeaders() })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (out) {
        if (!out.ok) {
          sessionStorage.removeItem('wizpw');
          var err = document.getElementById('loginErr');
          err.textContent = out.d.error || 'Login failed';
          err.style.display = 'block';
          return;
        }
        document.getElementById('loginOverlay').style.display = 'none';
        boot();
      })
      .catch(function () { toast('Network error', true); });
  }

  /* ---- rendering ---- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function imgPreviewUrl(v) {
    if (!v) return '';
    if (/^https?:\\/\\//i.test(v)) return v;
    return SITE + v.replace(/^\\//, '');
  }

  function field(labelText, value, onInput, full, multiline) {
    var box = el('div', full ? 'full' : '');
    box.appendChild(el('label', '', labelText));
    var input = multiline ? el('textarea') : el('input');
    if (!multiline) input.type = 'text';
    input.value = value || '';
    input.addEventListener('input', function () { onInput(input.value); setDirty(true); });
    box.appendChild(input);
    return box;
  }

  function checkbox(labelText, value, onChange) {
    var lab = el('label', 'check');
    var input = el('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.addEventListener('change', function () { onChange(input.checked); setDirty(true); });
    lab.appendChild(input);
    lab.appendChild(document.createTextNode(labelText));
    return lab;
  }

  // The picture, a drag-and-drop zone, and an upload button — the file's
  // address is tracked behind the scenes, owners never see it.
  function imageField(labelText, item, key, round) {
    var box = el('div', 'full');
    box.appendChild(el('label', '', labelText));
    var zone = el('div', 'dropzone');
    var thumb = el('div', 'thumb' + (round ? ' round' : ''));
    thumb.style.width = '72px';
    thumb.style.height = '72px';
    function refresh() {
      var u = imgPreviewUrl(item[key]);
      thumb.style.backgroundImage = u ? 'url("' + u.replace(/"/g, '%22') + '")' : 'none';
    }
    refresh();
    var hint = el('div', 'drop-hint', 'drag a picture here, or');
    var up = el('button', 'btn', item[key] ? 'CHANGE IMAGE' : 'UPLOAD IMAGE');
    up.type = 'button';
    var file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.style.display = 'none';

    function doUpload(f) {
      if (!f) return;
      if (!/^image\\//.test(f.type)) { toast('That is not an image file', true); return; }
      up.disabled = true;
      up.textContent = '...';
      fetch('/api/admin/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': f.type }, authHeaders()),
        body: f
      })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'upload failed'); return d; }); })
        .then(function (d) {
          item[key] = d.url;
          refresh();
          setDirty(true);
          toast('Image uploaded');
        })
        .catch(function (e) { toast(e.message, true); })
        .then(function () {
          up.disabled = false;
          up.textContent = item[key] ? 'CHANGE IMAGE' : 'UPLOAD IMAGE';
        });
    }

    up.onclick = function () { file.click(); };
    thumb.style.cursor = 'pointer';
    thumb.title = 'Click to pick an image';
    thumb.onclick = function () { file.click(); };
    file.addEventListener('change', function () { doUpload(file.files[0]); file.value = ''; });

    ['dragenter', 'dragover'].forEach(function (evName) {
      zone.addEventListener(evName, function (e) { e.preventDefault(); zone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (evName) {
      zone.addEventListener(evName, function (e) { e.preventDefault(); zone.classList.remove('dragging'); });
    });
    zone.addEventListener('drop', function (e) {
      doUpload(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    zone.appendChild(thumb);
    zone.appendChild(hint);
    zone.appendChild(up);
    zone.appendChild(file);
    box.appendChild(zone);
    return box;
  }

  /* ---- photo framing: sliders that write the CSS for you ---- */
  function parsePos(token) {
    token = (token || '').trim();
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return 100;
    if (token === 'center' || token === '') return 50;
    var m = token.match(/^(-?\\d+(?:\\.\\d+)?)%$/);
    return m ? Math.max(0, Math.min(100, Math.round(parseFloat(m[1])))) : null;
  }

  function parseFraming(css) {
    css = css || '';
    var out = { zoom: 100, x: 50, y: 50, raw: false };
    var size = css.match(/background-size:\\s*([^;]+)/i);
    var pos = css.match(/background-position:\\s*([^;]+)/i);
    if (size) {
      var sm = size[1].trim().match(/^(\\d+(?:\\.\\d+)?)%$/);
      if (sm) out.zoom = Math.round(parseFloat(sm[1]));
      else if (size[1].trim() !== 'cover') out.raw = true;
    }
    if (pos) {
      var parts = pos[1].trim().split(/\\s+/);
      var px = parsePos(parts[0]);
      var py = parts.length > 1 ? parsePos(parts[1]) : 50;
      if (px === null || py === null) out.raw = true;
      else { out.x = px; out.y = py; }
    }
    // anything beyond size/position means hand-written CSS we shouldn't clobber
    var leftovers = css.replace(/background-(size|position):[^;]+;?/gi, '').trim();
    if (leftovers) out.raw = true;
    return out;
  }

  function framingCss(f) {
    if (f.zoom === 100 && f.x === 50 && f.y === 50) return '';
    var css = '';
    if (f.zoom !== 100) css += 'background-size: ' + f.zoom + '%; ';
    css += 'background-position: ' + f.x + '% ' + f.y + '%;';
    return css;
  }

  function framingControl(item) {
    var box = el('div', 'full');
    box.appendChild(el('label', '', 'Photo framing — drag the sliders, the CSS writes itself'));
    var f = parseFraming(item.photo_css);

    var wrap = el('div', 'framing');
    var preview = el('div', 'thumb round');
    preview.style.width = '80px';
    preview.style.height = '80px';
    function paint() {
      var u = imgPreviewUrl(item.photo);
      preview.style.backgroundImage = u ? 'url("' + u.replace(/"/g, '%22') + '")' : 'none';
      preview.style.backgroundSize = f.zoom === 100 ? 'cover' : f.zoom + '%';
      preview.style.backgroundPosition = f.x + '% ' + f.y + '%';
    }

    var sliders = el('div', 'sliders');
    function slider(labelText, min, max, value, onChange) {
      sliders.appendChild(el('span', '', labelText));
      var input = el('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.value = value;
      input.addEventListener('input', function () {
        onChange(Number(input.value));
        item.photo_css = framingCss(f);
        rawInput.value = item.photo_css;
        paint();
        setDirty(true);
      });
      sliders.appendChild(input);
      return input;
    }
    slider('Zoom', 100, 300, f.zoom, function (v) { f.zoom = v; });
    slider('Left / right', 0, 100, f.x, function (v) { f.x = v; });
    slider('Up / down', 0, 100, f.y, function (v) { f.y = v; });

    wrap.appendChild(preview);
    wrap.appendChild(sliders);
    box.appendChild(wrap);

    // escape hatch for hand-written CSS; shown automatically when we detect it
    var link = el('span', 'css-link', 'edit css by hand');
    var rawBox = el('div');
    rawBox.style.display = f.raw ? '' : 'none';
    rawBox.style.marginTop = '0.5rem';
    var rawInput = el('input');
    rawInput.type = 'text';
    rawInput.value = item.photo_css || '';
    rawInput.placeholder = 'e.g. background-size: 170%; background-position: 65% 40%;';
    rawInput.addEventListener('input', function () {
      item.photo_css = rawInput.value;
      f = parseFraming(rawInput.value);
      paint();
      setDirty(true);
    });
    rawBox.appendChild(rawInput);
    link.onclick = function () { rawBox.style.display = rawBox.style.display === 'none' ? '' : 'none'; };
    box.appendChild(link);
    box.appendChild(rawBox);
    if (f.raw) {
      box.appendChild(el('div', 'pf-note', 'This photo uses hand-written CSS — moving a slider will rewrite it.'));
    }

    paint();
    return box;
  }

  function itemShell(items, i, titleText, bodyEl) {
    var item = items[i];
    var card = el('div', 'item' + (item.visible ? '' : ' hidden-item'));
    var head = el('div', 'item-head');
    var title = el('strong', 'grow', titleText || '(untitled)');
    title.style.letterSpacing = '0.06em';
    head.appendChild(title);

    var upB = el('button', 'icon-btn', '\\u2191');
    upB.title = 'Move up';
    upB.onclick = function () { if (i > 0) { items.splice(i - 1, 0, items.splice(i, 1)[0]); setDirty(true); render(); } };
    var downB = el('button', 'icon-btn', '\\u2193');
    downB.title = 'Move down';
    downB.onclick = function () { if (i < items.length - 1) { items.splice(i + 1, 0, items.splice(i, 1)[0]); setDirty(true); render(); } };
    var eyeB = el('button', 'icon-btn', item.visible ? '\\uD83D\\uDC41' : '\\u2716');
    eyeB.title = item.visible ? 'Visible on the site — click to hide' : 'Hidden from the site — click to show';
    eyeB.onclick = function () { item.visible = item.visible ? 0 : 1; setDirty(true); render(); };
    var delB = el('button', 'icon-btn danger', '\\uD83D\\uDDD1');
    delB.title = 'Delete';
    delB.onclick = function () {
      if (confirm('Delete "' + (titleText || 'this item') + '"? (Takes effect when you hit SAVE)')) {
        items.splice(i, 1);
        setDirty(true);
        render();
      }
    };
    head.appendChild(upB);
    head.appendChild(downB);
    head.appendChild(eyeB);
    head.appendChild(delB);
    card.appendChild(head);
    card.appendChild(bodyEl);
    return card;
  }

  function renderMerch() {
    state.merch.forEach(function (item, i) {
      var body = el('div', 'fields');
      body.appendChild(field('Title', item.title, function (v) { item.title = v; }));
      body.appendChild(field('Printful link', item.url, function (v) { item.url = v; }));
      body.appendChild(imageField('Product image', item, 'image', !!item.sticker));
      var checks = el('div', 'checks full');
      checks.appendChild(checkbox('sticker style', item.sticker, function (v) { item.sticker = v ? 1 : 0; }));
      checks.appendChild(checkbox('start new row', item.row_break, function (v) { item.row_break = v ? 1 : 0; }));
      body.appendChild(checks);
      listEl.appendChild(itemShell(state.merch, i, item.title, body));
    });
  }

  function renderCredits() {
    state.credits.forEach(function (item, i) {
      var body = el('div', 'fields');
      body.appendChild(field('Name', item.name, function (v) { item.name = v; }));
      body.appendChild(field('Roles (one per line)', item.roles, function (v) { item.roles = v; }, false, true));
      body.appendChild(imageField('Photo', item, 'photo', true));
      body.appendChild(framingControl(item));
      body.appendChild(field('Card back — bio or quote', item.back_text, function (v) { item.back_text = v; }, true, true));
      var checks = el('div', 'checks full');
      checks.appendChild(checkbox('style as quote', item.back_quote, function (v) { item.back_quote = v ? 1 : 0; }));
      checks.appendChild(checkbox('repeat name on back', item.back_show_name, function (v) { item.back_show_name = v ? 1 : 0; }));
      body.appendChild(checks);
      listEl.appendChild(itemShell(state.credits, i, item.name, body));
    });
  }

  function renderDonators() {
    state.donators.forEach(function (item, i) {
      var body = el('div', 'fields');
      body.appendChild(field('Name', item.name, function (v) { item.name = v; }, true));
      listEl.appendChild(itemShell(state.donators, i, item.name, body));
    });
  }

  /* ---- messages inbox ---- */
  function loadInbox() {
    api('/api/admin/messages')
      .then(function (d) { inbox = d.messages; render(); })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); });
  }

  function renderMessages() {
    if (inbox === null) {
      listEl.appendChild(el('div', 'empty', 'Fetching the mail\\u2026'));
      return;
    }
    if (!inbox.length) {
      listEl.appendChild(el('div', 'empty', 'No messages yet. The bubble on the site delivers here.'));
      return;
    }
    inbox.forEach(function (m) {
      var card = el('div', 'item' + (m.read ? '' : ' unread'));
      var head = el('div', 'item-head');
      var who = el('strong', 'grow', (m.name || 'anonymous') + (m.email ? ' \\u2014 ' + m.email : ''));
      head.appendChild(who);
      head.appendChild(el('span', 'msg-meta', (m.created_at || '').slice(0, 16)));
      var readB = el('button', 'icon-btn', m.read ? '\\u21BA' : '\\u2713');
      readB.title = m.read ? 'Mark unread' : 'Mark read';
      readB.onclick = function () {
        api('/api/admin/messages/' + m.id + '/read', { method: 'POST' }).then(loadInbox)
          .catch(function (e) { toast(e.message, true); });
      };
      var delB = el('button', 'icon-btn danger', '\\uD83D\\uDDD1');
      delB.title = 'Delete';
      delB.onclick = function () {
        if (!confirm('Delete this message forever?')) return;
        api('/api/admin/messages/' + m.id, { method: 'DELETE' }).then(loadInbox)
          .catch(function (e) { toast(e.message, true); });
      };
      head.appendChild(readB);
      head.appendChild(delB);
      card.appendChild(head);
      card.appendChild(el('div', 'msg-body', m.body));
      listEl.appendChild(card);
    });
  }

  /* ---- printful orders ---- */
  function loadOrders() {
    ordersError = '';
    api('/api/admin/orders')
      .then(function (d) { orders = d.result || []; render(); })
      .catch(function (e) {
        if (e.message === 'login required') return;
        orders = [];
        ordersError = e.message;
        render();
      });
  }

  function renderOrders() {
    if (orders === null) {
      listEl.appendChild(el('div', 'empty', 'Asking Printful\\u2026'));
      return;
    }
    if (ordersError) {
      listEl.appendChild(el('div', 'empty', ordersError));
      return;
    }
    if (!orders.length) {
      listEl.appendChild(el('div', 'empty', 'No orders yet. Go make Rathew famous.'));
      return;
    }
    orders.forEach(function (o) {
      var card = el('div', 'item');
      var head = el('div', 'item-head');
      head.appendChild(el('strong', 'grow', '#' + o.id + ' \\u2014 ' + ((o.recipient && o.recipient.name) || 'unknown')));
      head.appendChild(el('span', 'msg-meta', (o.status || '') + (o.created ? ' \\u00B7 ' + new Date(o.created * 1000).toLocaleDateString() : '')));
      card.appendChild(head);
      var items = (o.items || []).map(function (it) { return it.quantity + '\\u00D7 ' + it.name; }).join(', ');
      var line = el('div', 'order-line', items);
      card.appendChild(line);
      (o.shipments || []).forEach(function (s) {
        if (!s.tracking_number) return;
        var t = el('div', 'order-line');
        t.appendChild(document.createTextNode((s.carrier || 'tracking') + ': '));
        if (s.tracking_url) {
          var a = el('a', '', s.tracking_number);
          a.href = s.tracking_url;
          a.target = '_blank';
          a.rel = 'noopener';
          t.appendChild(a);
        } else {
          t.appendChild(document.createTextNode(s.tracking_number));
        }
        card.appendChild(t);
      });
      listEl.appendChild(card);
    });
  }

  /* ---- printful import panel (merch tab) ---- */
  function slugify(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function renderPfPanel() {
    var panel = el('div', 'pf-panel');
    var head = el('div', 'item-head');
    head.appendChild(el('strong', 'grow', 'PRINTFUL PRODUCTS'));
    var closeB = el('button', 'icon-btn', '\\u2716');
    closeB.onclick = function () { pfOpen = false; render(); };
    head.appendChild(closeB);
    panel.appendChild(head);
    if (pfProducts === null) {
      panel.appendChild(el('div', 'empty', 'Asking Printful\\u2026'));
      return panel;
    }
    if (typeof pfProducts === 'string') {
      panel.appendChild(el('div', 'empty', pfProducts));
      return panel;
    }
    var existing = {};
    state.merch.forEach(function (m) { existing[slugify(m.title)] = true; });
    pfProducts.forEach(function (p) {
      var row = el('div', 'pf-row');
      var thumb = el('div', 'thumb');
      if (p.thumbnail_url) thumb.style.backgroundImage = 'url("' + p.thumbnail_url.replace(/"/g, '%22') + '")';
      row.appendChild(thumb);
      row.appendChild(el('div', 'grow', p.name));
      var slug = slugify(p.name);
      var addB = el('button', 'btn', existing[slug] ? 'ON SITE' : '+ ADD');
      addB.disabled = !!existing[slug];
      addB.onclick = function () {
        state.merch.unshift({
          title: (p.name || '').toUpperCase(),
          url: 'https://wizard.printful.me/product/' + slug,
          image: p.thumbnail_url || '',
          sticker: /sticker/i.test(p.name) ? 1 : 0,
          row_break: 0,
          visible: 1,
        });
        setDirty(true);
        render();
        toast('Added \\u2014 check its link, then SAVE & PUBLISH');
      };
      row.appendChild(addB);
      panel.appendChild(row);
    });
    panel.appendChild(el('div', 'pf-note', 'Product links are a best guess from the name \\u2014 double-check them before saving.'));
    return panel;
  }

  function render() {
    listEl.innerHTML = '';
    var editable = tab === 'merch' || tab === 'credits' || tab === 'donators';
    document.getElementById('addBtn').style.display = editable ? '' : 'none';
    document.getElementById('saveBtn').style.display = editable ? '' : 'none';
    document.getElementById('printfulBtn').style.display = tab === 'merch' ? '' : 'none';
    if (tab === 'merch') {
      if (pfOpen) listEl.appendChild(renderPfPanel());
      renderMerch();
    } else if (tab === 'credits') renderCredits();
    else if (tab === 'donators') renderDonators();
    else if (tab === 'messages') { renderMessages(); return; }
    else { renderOrders(); return; }
    if (!state[tab].length) {
      listEl.appendChild(el('div', 'empty', 'Nothing here yet — hit + ADD.'));
    }
  }

  /* ---- toolbar ---- */
  document.querySelectorAll('.tab').forEach(function (btn) {
    btn.onclick = function () {
      document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      tab = btn.dataset.tab;
      render();
      if (tab === 'messages' && inbox === null) loadInbox();
      if (tab === 'orders' && orders === null) loadOrders();
    };
  });

  document.getElementById('printfulBtn').onclick = function () {
    pfOpen = !pfOpen;
    render();
    if (pfOpen && pfProducts === null) {
      api('/api/admin/printful/products')
        .then(function (d) { pfProducts = d.result || []; render(); })
        .catch(function (e) {
          if (e.message === 'login required') return;
          pfProducts = e.message;
          render();
        });
    }
  };

  document.getElementById('addBtn').onclick = function () {
    var fresh;
    if (tab === 'merch') fresh = { title: '', url: 'https://wizard.printful.me/product/', image: '', sticker: 0, row_break: 0, visible: 1 };
    else if (tab === 'credits') fresh = { name: '', roles: '', photo: '', photo_css: '', back_text: '', back_quote: 0, back_show_name: 0, visible: 1 };
    else fresh = { name: '', visible: 1 };
    state[tab].unshift(fresh);
    setDirty(true);
    render();
  };

  document.getElementById('reloadBtn').onclick = function () {
    if (tab === 'messages') { inbox = null; render(); loadInbox(); return; }
    if (tab === 'orders') { orders = null; render(); loadOrders(); return; }
    if (dirty && !confirm('Throw away unsaved changes and reload?')) return;
    load();
  };

  document.getElementById('saveBtn').onclick = function () {
    var btn = document.getElementById('saveBtn');
    btn.disabled = true;
    api('/api/admin/collection/' + tab, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state[tab])
    })
      .then(function (d) {
        setDirty(false);
        toast('Saved — ' + d.saved + ' item' + (d.saved === 1 ? '' : 's') + ' live on the site \\u2728');
      })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); })
      .then(function () { btn.disabled = false; });
  };

  /* ---- boot ---- */
  function load() {
    api('/api/admin/content')
      .then(function (data) {
        state = data;
        setDirty(false);
        render();
      })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); });
  }

  function boot() {
    fetch('/api/admin/login', { method: 'POST', headers: authHeaders() })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function (out) {
        if (!out.ok) {
          if (out.status === 401) document.getElementById('loginOverlay').style.display = 'flex';
          else toast(out.d.error || 'Backend not ready', true);
          return;
        }
        document.getElementById('whoami').textContent =
          'logged in' + (out.d.email && out.d.email !== 'owner' ? ' as ' + out.d.email : '') +
          (out.d.mode === 'access' ? ' via Cloudflare Access' : '');
        load();
      })
      .catch(function () { toast('Cannot reach the backend', true); });
  }

  boot();
})();
</script>
</body>
</html>`;
