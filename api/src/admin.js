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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Wizard Shit — Control Room</title>
<style>
  :root {
    --bg: #100b1d;
    --card: #191327;
    --card2: #201936;
    --border: rgba(255,255,255,0.09);
    --border-strong: rgba(255,255,255,0.16);
    --text: #ece9f1;
    --muted: #9b94ad;
    --accent: #f5b301;
    --accent-ink: #2b1a00;
    --danger: #ff6b6b;
    --radius: 10px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { min-height: 100%; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding-bottom: 5rem;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 860px; margin: 0 auto; padding: 1.5rem 1.2rem; }

  header { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.4rem 0 1.4rem; }
  header h1 { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.01em; }
  header h1 .at { color: var(--accent); }
  header .sub { font-size: 0.8rem; color: var(--muted); font-weight: 500; }
  #whoami { margin-left: auto; font-size: 0.78rem; color: var(--muted); }

  .tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin-bottom: 1.1rem; }
  .tab {
    padding: 0.55rem 0.9rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--muted);
    font: inherit;
    font-weight: 600;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--text); border-bottom-color: var(--accent); }

  .toolbar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; }
  .btn {
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--card2);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    font-size: 0.82rem;
    cursor: pointer;
  }
  .btn:hover { border-color: rgba(255,255,255,0.3); }
  .btn.primary { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .btn.primary:hover { filter: brightness(1.06); }
  .btn:disabled { opacity: 0.45; cursor: not-allowed; }
  #dirtyFlag { font-size: 0.78rem; color: var(--accent); display: none; font-weight: 500; }

  .item {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--card);
    padding: 1rem 1.1rem;
    margin-bottom: 0.8rem;
  }
  .item.hidden-item { opacity: 0.55; border-style: dashed; }
  .item-head { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.8rem; }
  .item-head .grow { flex: 1; font-weight: 600; font-size: 0.95rem; }
  .icon-btn {
    width: 30px; height: 30px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--card2);
    color: var(--muted); cursor: pointer; font-size: 0.8rem;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { color: var(--text); border-color: var(--border-strong); }
  .icon-btn.danger:hover { border-color: var(--danger); color: var(--danger); }

  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  .fields .full { grid-column: 1 / -1; }
  @media (max-width: 620px) { .fields { grid-template-columns: 1fr; } }
  label { display: block; font-size: 0.76rem; font-weight: 500; color: var(--muted); margin-bottom: 0.3rem; }
  input[type=text], input[type=password], textarea {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    padding: 0.5rem 0.65rem;
    font: inherit;
    font-size: 0.88rem;
  }
  input[type=text]:focus, input[type=password]:focus, textarea:focus { outline: none; border-color: var(--accent); }
  textarea { resize: vertical; min-height: 70px; }
  .check { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--muted); cursor: pointer; }
  .check input { width: 15px; height: 15px; accent-color: var(--accent); }
  .checks { display: flex; gap: 1.1rem; align-items: center; flex-wrap: wrap; padding-top: 0.2rem; }

  .thumb {
    width: 64px; height: 64px; border-radius: 8px; flex-shrink: 0;
    background-size: cover; background-position: center;
    border: 1px solid var(--border-strong);
    background-color: var(--bg);
  }
  .thumb.round { border-radius: 50%; }
  .img-row { display: flex; gap: 0.7rem; align-items: flex-end; }
  .img-row .grow { flex: 1; }
  .dropzone {
    display: flex; gap: 0.9rem; align-items: center;
    border: 1px dashed var(--border-strong);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .dropzone.dragging { border-color: var(--accent); background: rgba(245, 179, 1, 0.06); }
  .drop-hint { flex: 1; font-size: 0.78rem; color: var(--muted); text-align: right; }

  #toast {
    position: fixed; left: 50%; bottom: 1.4rem; transform: translateX(-50%);
    background: var(--card2);
    border: 1px solid var(--border-strong);
    border-left: 3px solid var(--accent);
    color: var(--text);
    border-radius: 8px;
    padding: 0.65rem 1.1rem;
    font-size: 0.85rem;
    z-index: 50;
    display: none;
    max-width: 90vw;
    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
  }
  #toast.error { border-left-color: var(--danger); }

  #loginOverlay {
    position: fixed; inset: 0; z-index: 40;
    background: var(--bg);
    display: none; align-items: center; justify-content: center; padding: 1.5rem;
  }
  #loginOverlay .box {
    width: min(370px, 92vw);
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    padding: 2.1rem 1.8rem 1.9rem;
    text-align: center;
    animation: rise 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes rise {
    from { transform: translateY(28px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .login-logo { width: 112px; display: block; margin: 0 auto 1rem; }
  #loginOverlay h2 { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.3rem; }
  #loginOverlay h2 .at { color: var(--accent); }
  #loginOverlay p { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.1rem; }
  #loginOverlay input { margin-bottom: 0.8rem; text-align: center; }
  #loginErr { color: var(--danger); font-size: 0.78rem; margin-top: 0.7rem; display: none; }

  .empty { text-align: center; color: var(--muted); padding: 2.5rem 1rem; font-size: 0.85rem; }

  /* photo framing sliders */
  .framing { display: flex; gap: 1rem; align-items: center; }
  .framing .sliders { flex: 1; display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 0.7rem; align-items: center; }
  .framing .sliders span { font-size: 0.74rem; color: var(--muted); }
  input[type=range] { width: 100%; accent-color: var(--accent); }
  .css-link { font-size: 0.74rem; color: var(--muted); cursor: pointer; text-decoration: underline; }
  .css-link:hover { color: var(--text); }

  /* messages inbox */
  .item.unread { border-left: 3px solid var(--accent); }
  .msg-meta { font-size: 0.74rem; color: var(--muted); }
  .msg-body { white-space: pre-wrap; font-size: 0.88rem; line-height: 1.55; }

  /* orders + printful import */
  .order-line { font-size: 0.84rem; color: var(--muted); line-height: 1.6; }
  .order-line a { color: var(--accent); }
  .pf-panel { border: 1px dashed var(--border-strong); border-radius: var(--radius); padding: 1rem 1.1rem; margin-bottom: 1rem; background: var(--card); }
  .pf-row { display: flex; gap: 0.8rem; align-items: center; padding: 0.45rem 0; border-bottom: 1px solid var(--border); }
  .pf-row:last-child { border-bottom: none; }
  .pf-row .thumb { width: 40px; height: 40px; }
  .pf-row .grow { flex: 1; font-size: 0.86rem; }
  .pf-note { font-size: 0.74rem; color: var(--muted); margin-top: 0.6rem; }

  /* analytics */
  .stat-tiles { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .tile {
    flex: 1; min-width: 130px;
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--card); padding: 0.9rem 1rem;
  }
  .tile .num { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; }
  .tile .lbl { font-size: 0.76rem; color: var(--muted); margin-top: 0.15rem; }
  .chart-card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); padding: 1rem 1.1rem; }
  .chart { display: flex; align-items: flex-end; gap: 2px; height: 140px; }
  .chart .bar { flex: 1; background: var(--accent); border-radius: 3px 3px 0 0; min-height: 2px; opacity: 0.9; }
  .chart .bar:hover { opacity: 1; }
  .chart .bar.zero { background: rgba(255,255,255,0.1); }
  .chart-x { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--muted); margin-top: 0.45rem; }
  .range-row { display: flex; gap: 0.4rem; margin-bottom: 0.9rem; }
  .range-btn { padding: 0.35rem 0.8rem; font-size: 0.78rem; }
  .range-btn.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .chart.monthly { height: 170px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 0.25rem; height: 100%; }
  .bar-col .bar { width: 100%; flex: none; }
  .bar-num { font-size: 0.72rem; color: var(--text); font-weight: 600; }
  .bar-mon { font-size: 0.68rem; color: var(--muted); margin-top: 0.25rem; }
  .month-list { margin-top: 1rem; }
  .month-row { display: flex; justify-content: space-between; padding: 0.4rem 0.1rem; border-bottom: 1px solid var(--border); font-size: 0.84rem; }
  .month-row:last-child { border-bottom: none; }
  .month-row .v { font-weight: 600; }
  #barTip {
    position: fixed; z-index: 60; display: none; pointer-events: none;
    background: var(--card2); border: 1px solid var(--border-strong);
    border-radius: 7px; padding: 0.3rem 0.6rem; font-size: 0.76rem; color: var(--text);
    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
</style>
</head>
<body>

<div id="loginOverlay">
  <div class="box">
    <img class="login-logo" src="https://wizardshit.store/wizshtlogo_trans.png" alt="" onerror="this.style.display='none'">
    <h2>Wiz<span class="at">@</span>rd Shit</h2>
    <p>Owners only — enter the admin password.</p>
    <input type="password" id="pwInput" placeholder="password" autocomplete="current-password">
    <button class="btn primary" id="pwBtn" style="width:100%">Enter</button>
    <div id="gDivider" style="display:none;margin:0.9rem 0 0.7rem;font-size:0.78rem;color:var(--muted)">or</div>
    <div id="gBtn" style="display:flex;justify-content:center"></div>
    <div id="loginErr"></div>
  </div>
</div>

<div class="wrap">
  <header>
    <h1>Wiz<span class="at">@</span>rd Shit</h1>
    <div class="sub">Control Room</div>
    <div id="whoami"></div>
  </header>

  <nav class="tabs">
    <button class="tab active" data-tab="merch">Merch</button>
    <button class="tab" data-tab="credits">Credits</button>
    <button class="tab" data-tab="donators">Donators</button>
    <button class="tab" data-tab="messages">Messages</button>
    <button class="tab" data-tab="signups">Signups</button>
    <button class="tab" data-tab="orders">Orders</button>
    <button class="tab" data-tab="analytics">Analytics</button>
  </nav>

  <div class="toolbar">
    <button class="btn" id="addBtn">+ Add</button>
    <button class="btn" id="printfulBtn" style="display:none">Import from Printful</button>
    <span id="dirtyFlag">● unsaved changes</span>
    <span style="flex:1"></span>
    <button class="btn" id="reloadBtn">Reload</button>
    <button class="btn primary" id="saveBtn">Save &amp; publish</button>
  </div>

  <div id="list"></div>
</div>

<div id="toast"></div>

<script>
(function () {
  'use strict';

  var state = { merch: [], credits: [], donators: [] };
  var inbox = null;        // fetched on first visit to MESSAGES
  var signups = null;      // fetched on first visit to SIGNUPS
  var orders = null;       // fetched on first visit to ORDERS
  var stats = null;        // fetched on first visit to ANALYTICS
  var statRange = '30d';   // '30d' | '12m'
  var googleReady = false;
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
        setupGoogleButton();
        throw new Error('login required');
      }
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
        return data;
      });
    });
  }

  /* ---- Google sign-in on the login overlay ---- */
  function setupGoogleButton() {
    if (googleReady) return;
    fetch('/api/login-config')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        if (!cfg.google_client_id) return;
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = function () {
          if (googleReady || !window.google) return;
          googleReady = true;
          window.google.accounts.id.initialize({
            client_id: cfg.google_client_id,
            callback: function (resp) {
              fetch('/api/glogin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: resp.credential })
              })
                .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
                .then(function (out) {
                  if (!out.ok) {
                    var err = document.getElementById('loginErr');
                    err.textContent = out.d.error || 'Sign-in failed';
                    err.style.display = 'block';
                    return;
                  }
                  sessionStorage.setItem('wizpw', out.d.token);
                  document.getElementById('loginOverlay').style.display = 'none';
                  boot();
                })
                .catch(function () { toast('Network error', true); });
            }
          });
          document.getElementById('gDivider').style.display = 'block';
          window.google.accounts.id.renderButton(document.getElementById('gBtn'), {
            theme: 'filled_black', size: 'large', text: 'signin_with', width: 260
          });
        };
        document.head.appendChild(s);
      })
      .catch(function () {});
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
    var up = el('button', 'btn', item[key] ? 'Change image' : 'Upload image');
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
          up.textContent = item[key] ? 'Change image' : 'Upload image';
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

  /* ---- email signups ---- */
  function loadSignups() {
    api('/api/admin/signups')
      .then(function (d) { signups = d.signups; render(); })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); });
  }

  function renderSignups() {
    if (signups === null) {
      listEl.appendChild(el('div', 'empty', 'Fetching the list\\u2026'));
      return;
    }
    if (!signups.length) {
      listEl.appendChild(el('div', 'empty', 'No signups yet. The EMAIL FOR UPDATES box on the site delivers here.'));
      return;
    }
    var barCard = el('div', 'item');
    var bar = el('div', 'item-head');
    bar.appendChild(el('strong', 'grow', signups.length + ' subscriber' + (signups.length === 1 ? '' : 's')));
    var copyB = el('button', 'btn', 'Copy all');
    copyB.title = 'Copy every email, comma-separated \\u2014 ready to paste into BCC';
    copyB.onclick = function () {
      var all = signups.map(function (s) { return s.email; }).join(', ');
      navigator.clipboard.writeText(all).then(
        function () { toast('Copied ' + signups.length + ' email' + (signups.length === 1 ? '' : 's')); },
        function () { window.prompt('Copy the list:', all); }
      );
    };
    bar.appendChild(copyB);
    barCard.appendChild(bar);
    listEl.appendChild(barCard);
    signups.forEach(function (s) {
      var card = el('div', 'item');
      var head = el('div', 'item-head');
      head.appendChild(el('strong', 'grow', s.email));
      head.appendChild(el('span', 'msg-meta', (s.created_at || '').slice(0, 16)));
      var delB = el('button', 'icon-btn danger', '\\uD83D\\uDDD1');
      delB.title = 'Remove (unsubscribe)';
      delB.onclick = function () {
        if (!confirm('Remove ' + s.email + ' from the list?')) return;
        api('/api/admin/signups/' + s.id, { method: 'DELETE' }).then(loadSignups)
          .catch(function (e) { toast(e.message, true); });
      };
      head.appendChild(delB);
      card.appendChild(head);
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

  /* ---- analytics ---- */
  function loadStats() {
    api('/api/admin/analytics')
      .then(function (d) { stats = d; render(); })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); });
  }

  function renderAnalytics() {
    if (stats === null) {
      listEl.appendChild(el('div', 'empty', 'Counting the crystal balls\\u2026'));
      return;
    }
    // build a full 30-day series, zero-filling missing days
    var byDay = {};
    (stats.days || []).forEach(function (d) { byDay[d.day] = d.hits; });
    var series = [];
    var today = new Date().toISOString().slice(0, 10);
    for (var i = 29; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      series.push({ day: d, hits: byDay[d] || 0 });
    }
    var last30 = series.reduce(function (a, b) { return a + b.hits; }, 0);
    var todayHits = byDay[today] || 0;

    var tiles = el('div', 'stat-tiles');
    [[todayHits, 'Views today'], [last30, 'Last 30 days'], [stats.all_time || 0, 'All time']].forEach(function (t) {
      var tile = el('div', 'tile');
      tile.appendChild(el('div', 'num', String(t[0])));
      tile.appendChild(el('div', 'lbl', t[1]));
      tiles.appendChild(tile);
    });
    listEl.appendChild(tiles);

    // range toggle: last 30 days (daily) or last 12 months (monthly)
    var rangeRow = el('div', 'range-row');
    [['30d', '30 days'], ['12m', '12 months']].forEach(function (r) {
      var b = el('button', 'btn range-btn' + (statRange === r[0] ? ' on' : ''), r[1]);
      b.onclick = function () { statRange = r[0]; render(); };
      rangeRow.appendChild(b);
    });
    listEl.appendChild(rangeRow);

    var card = el('div', 'chart-card');
    var tip = document.getElementById('barTip');
    if (!tip) {
      tip = el('div');
      tip.id = 'barTip';
      document.body.appendChild(tip);
    }

    if (statRange === '30d') {
      var chart = el('div', 'chart');
      var max = Math.max.apply(null, series.map(function (s) { return s.hits; }).concat([1]));
      series.forEach(function (s) {
        var bar = el('div', 'bar' + (s.hits === 0 ? ' zero' : ''));
        bar.style.height = Math.max(2, Math.round((s.hits / max) * 100)) + '%';
        bar.setAttribute('aria-label', s.day + ': ' + s.hits + ' views');
        bar.addEventListener('mouseenter', function () {
          tip.textContent = s.day + ' \\u2014 ' + s.hits + ' view' + (s.hits === 1 ? '' : 's');
        tip.style.display = 'block';
        });
        bar.addEventListener('mousemove', function (e) {
          tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 150) + 'px';
          tip.style.top = (e.clientY - 34) + 'px';
        });
        bar.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
        chart.appendChild(bar);
      });
      card.appendChild(chart);
      var xAxis = el('div', 'chart-x');
      xAxis.appendChild(el('span', '', series[0].day.slice(5)));
      xAxis.appendChild(el('span', '', 'daily views \\u00B7 hover for counts'));
      xAxis.appendChild(el('span', '', 'today'));
      card.appendChild(xAxis);
      listEl.appendChild(card);
    } else {
      // last 12 months, zero-filled, count printed above each bar
      var byMonth = {};
      (stats.months || []).forEach(function (m) { byMonth[m.month] = m.hits; });
      var mSeries = [];
      var now = new Date();
      var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (var mi = 11; mi >= 0; mi--) {
        var dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - mi, 1));
        var key = dt.toISOString().slice(0, 7);
        mSeries.push({ key: key, label: MONTH_NAMES[dt.getUTCMonth()], hits: byMonth[key] || 0 });
      }
      var mMax = Math.max.apply(null, mSeries.map(function (s) { return s.hits; }).concat([1]));
      var mChart = el('div', 'chart monthly');
      mSeries.forEach(function (s) {
        var col = el('div', 'bar-col');
        col.appendChild(el('div', 'bar-num', String(s.hits)));
        var bar = el('div', 'bar' + (s.hits === 0 ? ' zero' : ''));
        bar.style.height = Math.max(2, Math.round((s.hits / mMax) * 72)) + '%';
        col.appendChild(bar);
        col.appendChild(el('div', 'bar-mon', s.label));
        mChart.appendChild(col);
      });
      card.appendChild(mChart);
      var mlist = el('div', 'month-list');
      mSeries.slice().reverse().forEach(function (s) {
        if (!s.hits) return;
        var row = el('div', 'month-row');
        row.appendChild(el('span', '', s.key));
        row.appendChild(el('span', 'v', s.hits + ' views'));
        mlist.appendChild(row);
      });
      if (mlist.children.length) card.appendChild(mlist);
      listEl.appendChild(card);
    }

    if (!stats.all_time) {
      listEl.appendChild(el('div', 'empty', 'No views counted yet \\u2014 the site starts reporting once this version is deployed.'));
    }
  }

  /* ---- printful import panel (merch tab) ---- */
  function slugify(name) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function renderPfPanel() {
    var panel = el('div', 'pf-panel');
    var head = el('div', 'item-head');
    head.appendChild(el('strong', 'grow', 'Printful products'));
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
      var addB = el('button', 'btn', existing[slug] ? 'On site' : '+ Add');
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
    else if (tab === 'signups') { renderSignups(); return; }
    else if (tab === 'analytics') { renderAnalytics(); return; }
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
      if (tab === 'signups' && signups === null) loadSignups();
      if (tab === 'orders' && orders === null) loadOrders();
      if (tab === 'analytics' && stats === null) loadStats();
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
    if (tab === 'signups') { signups = null; render(); loadSignups(); return; }
    if (tab === 'orders') { orders = null; render(); loadOrders(); return; }
    if (tab === 'analytics') { stats = null; render(); loadStats(); return; }
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
          if (out.status === 401) {
            document.getElementById('loginOverlay').style.display = 'flex';
            setupGoogleButton();
          } else toast(out.d.error || 'Backend not ready', true);
          return;
        }
        document.getElementById('whoami').textContent =
          'logged in' + (out.d.email && out.d.email !== 'owner' ? ' as ' + out.d.email : '') +
          (out.d.mode === 'access' ? ' via Cloudflare Access' : out.d.mode === 'google' ? ' via Google' : '');
        load();
      })
      .catch(function () { toast('Cannot reach the backend', true); });
  }

  boot();
})();
</script>
</body>
</html>`;
