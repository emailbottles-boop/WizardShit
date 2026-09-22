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

  .tabs { display: flex; gap: 0.25rem; flex-wrap: wrap; border-bottom: 1px solid var(--border); margin-bottom: 0.7rem; }
  #tabHelp { color: var(--muted); font-size: 0.82rem; line-height: 1.45; margin-bottom: 1rem; }
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

  /* Covers the page from the first paint. Without this the console renders
     first and only gets covered once the auth request comes back, which
     flashes the whole Control Room at anyone who opens the page. */
  #loginOverlay {
    position: fixed; inset: 0; z-index: 40;
    background: var(--bg);
    display: flex; align-items: center; justify-content: center; padding: 1.5rem;
  }
  #loginOverlay .box {
    width: min(370px, 92vw);
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--card);
    padding: 2.1rem 1.8rem 1.9rem;
    text-align: center;
    visibility: hidden;
  }
  #loginOverlay.ask .box {
    visibility: visible;
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
  .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.04em; border: 1px solid var(--border-strong); color: var(--muted); margin-left: 0.4rem; white-space: nowrap; }
  .badge.good { color: #7ff0a8; border-color: rgba(127,240,168,0.5); }
  .badge.wait { color: #ffe066; border-color: rgba(255,224,102,0.5); }
  .badge.bad { color: #ff7f9c; border-color: rgba(255,127,156,0.5); }
  .mode-line { font-size: 0.8rem; color: var(--muted); padding: 0.6rem 0.9rem; border: 1px dashed var(--border-strong); border-radius: var(--radius); margin-bottom: 0.9rem; line-height: 1.5; }
  .mode-line strong { color: var(--text); }
  .order-actions { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.5rem; flex-wrap: wrap; }
  .totals-row { display: flex; gap: 1.2rem; flex-wrap: wrap; margin-bottom: 0.9rem; }
  .totals-row .stat { flex: 1; min-width: 140px; padding: 0.8rem 1rem; border-radius: var(--radius); background: var(--card); border: 1px solid var(--border); }
  .totals-row .stat .n { font-size: 1.3rem; font-weight: 700; display: block; }
  .totals-row .stat .l { font-size: 0.72rem; color: var(--muted); letter-spacing: 0.04em; }

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
  .col-label { font-size: 0.66rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin: 0.2rem 0 0.7rem; font-weight: 700; }
  .col-label:not(:first-child) { margin-top: 1.4rem; }
</style>
</head>
<body>

<div id="loginOverlay">
  <div class="box">
    <img class="login-logo" src="https://wizardshit.store/wizshtlogo_trans.png" alt="Wiz@rd Shit" onerror="this.style.display='none'">
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
    <!-- Store console only. The Madam Studio platform tabs (Wizard IDs,
         Creators, Uploads, Payments, Apps, Panels) live in the separate
         Madam Studio console at madamwizzy.com/admin. -->
    <button class="tab active" data-tab="merch">Merch</button>
    <button class="tab" data-tab="credits">Credits</button>
    <button class="tab" data-tab="donators">Donators</button>
    <button class="tab" data-tab="messages">Messages</button>
    <button class="tab" data-tab="signups">Signups</button>
    <button class="tab" data-tab="orders">Orders</button>
    <button class="tab" data-tab="donations">Donations</button>
    <button class="tab" data-tab="analytics">Analytics</button>
  </nav>

  <div id="tabHelp"></div>

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

  // The overlay is up from the first paint; these two decide whether it is
  // showing the password box or getting out of the way.
  function showLoginPrompt() {
    var ov = document.getElementById('loginOverlay');
    ov.style.display = 'flex';
    ov.classList.add('ask');
  }
  function hideLoginPrompt() {
    var ov = document.getElementById('loginOverlay');
    ov.classList.remove('ask');
    ov.style.display = 'none';
  }

  // This is the STORE console (wizardshit.store/login): merch, credits,
  // donators, the inbox, the mailing list, Printful orders, traffic.
  // Crew/creator admin — wizard IDs, uploads, payments, applications, panels —
  // lives in the Madam Studio console instead, at madamwizzy.com/admin.
  var state = { merch: [], credits: [], donators: [] };
  var inbox = null;        // fetched on first visit to MESSAGES
  var signups = null;      // fetched on first visit to SIGNUPS
  var orders = null;       // fetched on first visit to ORDERS ({ orders, mode, test_mode })
  var donations = null;    // fetched on first visit to DONATIONS
  var pfLoading = false;   // Printful product list, shared by the picker + import panel
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
        showLoginPrompt();
        setupGoogleButton();
        throw new Error('login required');
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data.error || ('HTTP ' + res.status));
          if (data && data.failed) err.failed = data.failed;
          throw err;
        }
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
                  hideLoginPrompt();
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
        hideLoginPrompt();
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

    // A card sold through Printful can take Printful's own mockup as its
    // picture, without the owner downloading and re-uploading it.
    var pf = null;
    if (key === 'image' && item.printful_id) {
      pf = el('button', 'btn', 'Use Printful photo');
      pf.type = 'button';
      pf.style.marginLeft = '0.5rem';
      pf.onclick = function () {
        pf.disabled = true;
        pf.textContent = '...';
        api('/api/admin/shop/products/' + item.printful_id + '/mockup', { method: 'POST' })
          .then(function (d) {
            item[key] = d.url;
            refresh();
            setDirty(true);
            toast('Printful photo set \u2014 hit SAVE to publish it');
          })
          .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); })
          .then(function () { pf.disabled = false; pf.textContent = 'Use Printful photo'; });
      };
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
    if (pf) zone.appendChild(pf);
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

  // Which Printful product a card sells. Set, the card on the site gets its
  // colours, sizes, price and an ADD TO CART button; unset, it stays a link.
  function pfPicker(item) {
    var box = el('div', 'full');
    box.appendChild(el('label', '', 'Sold on the site as (Printful product)'));
    var sel = el('select');
    var none = el('option', '', pfProducts === null ? 'Loading Printful products\u2026' : '\u2014 link only, not sold on the site \u2014');
    none.value = '';
    sel.appendChild(none);
    if (Array.isArray(pfProducts)) {
      pfProducts.forEach(function (p) {
        var o = el('option', '', p.name);
        o.value = String(p.id);
        if (item.printful_id && Number(item.printful_id) === Number(p.id)) o.selected = true;
        sel.appendChild(o);
      });
      if (item.printful_id && !pfProducts.some(function (p) { return Number(p.id) === Number(item.printful_id); })) {
        var gone = el('option', '', 'Printful product #' + item.printful_id + ' (no longer in the store)');
        gone.value = String(item.printful_id);
        gone.selected = true;
        sel.appendChild(gone);
      }
    } else if (typeof pfProducts === 'string') {
      none.textContent = pfProducts;
    }
    sel.addEventListener('change', function () {
      item.printful_id = sel.value ? Number(sel.value) : null;
      setDirty(true);
    });
    box.appendChild(sel);
    if (pfProducts === null) loadPfProducts();
    return box;
  }

  // The colours a card sells, changed in Printful itself: tick to add (the
  // design is copied onto that colour in every size sold), untick to remove.
  // Takes effect in Printful straight away — no SAVE involved.
  function colorsPanel(item) {
    var box = el('div', 'full');
    var open = false;
    var toggle = el('button', 'btn', 'Colors \u25B8');
    toggle.type = 'button';
    var panel = el('div', 'mode-line');
    panel.style.display = 'none';
    panel.style.marginTop = '0.5rem';
    function load() {
      panel.textContent = 'Asking Printful\u2026';
      return api('/api/admin/shop/products/' + item.printful_id + '/colors').then(function (d) {
        panel.innerHTML = '';
        var head = el('div', '', d.product.catalog_name + (d.sizes.length ? ' \u00b7 sizes sold: ' + d.sizes.join(', ') : ''));
        head.style.marginBottom = '0.4rem';
        panel.appendChild(head);
        panel.appendChild(el('div', '', 'Tick a colour to sell it (your design is copied onto it in those sizes); untick to stop. This changes the product in Printful right away.'));
        if (d.embroidered) {
          var emb = el('div', '', 'Embroidered product: Printful\u2019s API will not accept a copied embroidery variant, so adding a colour here will be refused. Add colours in Printful\u2019s product editor instead (or duplicate the product there with the colours you want, then point this card at it above). Removing a colour here still works.');
          emb.style.color = '#ffcc66';
          emb.style.margin = '0.4rem 0';
          panel.appendChild(emb);
        }
        d.colors.forEach(function (c) {
          var row = el('label', '');
          row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '0.5rem'; row.style.margin = '0.35rem 0'; row.style.cursor = 'pointer';
          var cb = el('input'); cb.type = 'checkbox'; cb.checked = c.offered > 0;
          var sw = el('span', ''); sw.style.width = '14px'; sw.style.height = '14px'; sw.style.borderRadius = '50%'; sw.style.border = '1px solid #888'; sw.style.background = c.color_code || 'transparent';
          var note = c.offered ? 'offered in ' + c.offered + (c.offered === 1 ? ' size' : ' sizes') : (c.would_add ? 'would add ' + c.would_add + (c.would_add === 1 ? ' size' : ' sizes') : 'nothing to add');
          if (!c.in_stock) {
            var where = (c.stock || []).filter(function (r) { return r.status !== 'in_stock'; }).map(function (r) { return r.region + ': ' + String(r.status).replace(/_/g, ' '); }).join(', ');
            note += ' \u00b7 out of stock at Printful' + (where ? ' (' + where + ')' : '') + ' \u2014 it comes back on its own when Printful restocks';
          }
          var txt = el('span', '', c.color + ' \u2014 ' + note);
          if (!c.in_stock) txt.style.color = '#ff7a7a';
          cb.disabled = (!c.offered && !c.would_add) || (d.embroidered && !c.offered);
          cb.addEventListener('change', function () {
            var adding = cb.checked;
            var msg = adding
              ? 'Sell ' + item.title + ' in ' + c.color + '? This creates ' + c.would_add + ' variant' + (c.would_add === 1 ? '' : 's') + ' in Printful with your current design.'
              : 'Stop selling ' + item.title + ' in ' + c.color + '? This deletes ' + c.offered + ' variant' + (c.offered === 1 ? '' : 's') + ' in Printful.';
            if (!confirm(msg)) { cb.checked = !adding; return; }
            cb.disabled = true;
            var req = adding
              ? api('/api/admin/shop/products/' + item.printful_id + '/colors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ color: c.color }) })
              : api('/api/admin/shop/products/' + item.printful_id + '/colors/' + encodeURIComponent(c.color), { method: 'DELETE' });
            var showSent = function (bad) {
              // A refusal, with the request it refused, stays on screen to be copied.
              var box = el('pre', '');
              box.style.whiteSpace = 'pre-wrap'; box.style.fontSize = '0.72rem'; box.style.userSelect = 'all'; box.style.color = '#ff7a7a';
              box.textContent = bad.map(function (f) { return f.size + ': ' + f.error + (f.sent ? '\\nsent: ' + JSON.stringify(f.sent) : ''); }).join('\\n\\n');
              panel.appendChild(box);
            };
            req.then(function (r) {
              var n = adding ? r.created.length : r.removed.length;
              var bad = r.failed || [];
              toast((adding ? 'Added ' : 'Removed ') + c.color + ' (' + n + ')' + (bad.length ? ' \u2014 ' + bad.length + ' failed: ' + bad.map(function (f) { return f.size + ': ' + f.error; }).join('; ') : ''), bad.length > 0);
              return load().then(function () { if (bad.length) showSent(bad); });
            }).catch(function (e) {
              toast(e.message, true);
              return load().then(function () {
                if (e.failed) showSent(e.failed);
              });
            });
          });
          row.appendChild(cb); row.appendChild(sw); row.appendChild(txt);
          panel.appendChild(row);
        });
        // The design data a copy is made from, for when Printful refuses one.
        var det = el('button', 'btn', 'Show design details');
        det.type = 'button';
        det.style.marginTop = '0.4rem';
        var pre = el('pre', '');
        pre.style.display = 'none';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.fontSize = '0.72rem';
        pre.style.userSelect = 'all';
        pre.textContent = JSON.stringify(d.design, null, 1);
        det.addEventListener('click', function () { pre.style.display = pre.style.display === 'none' ? '' : 'none'; });
        panel.appendChild(det);
        panel.appendChild(pre);
      }).catch(function (e) {
        panel.textContent = e.message === 'login required' ? '' : e.message;
      });
    }
    toggle.addEventListener('click', function () {
      open = !open;
      toggle.textContent = open ? 'Colors \u25BE' : 'Colors \u25B8';
      panel.style.display = open ? '' : 'none';
      if (open) load();
    });
    box.appendChild(toggle);
    box.appendChild(panel);
    return box;
  }

  function loadPfProducts() {
    if (pfLoading) return;
    pfLoading = true;
    api('/api/admin/printful/products')
      .then(function (d) { pfProducts = d.result || []; })
      .catch(function (e) { if (e.message !== 'login required') pfProducts = e.message; })
      .then(function () { pfLoading = false; render(); });
  }

  function renderMerch() {
    state.merch.forEach(function (item, i) {
      var body = el('div', 'fields');
      body.appendChild(field('Title', item.title, function (v) { item.title = v; }));
      body.appendChild(field('Printful link (fallback while the shop is closed)', item.url, function (v) { item.url = v; }));
      body.appendChild(pfPicker(item));
      if (item.printful_id) body.appendChild(colorsPanel(item));
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

  /* ---- the shop's orders ---- */
  function loadOrders() {
    ordersError = '';
    api('/api/admin/shop/orders')
      .then(function (d) { orders = d; render(); })
      .catch(function (e) {
        if (e.message === 'login required') return;
        orders = { orders: [] };
        ordersError = e.message;
        render();
      });
  }

  function cents(n, currency) {
    var code = String(currency || 'USD').toUpperCase();
    // Currencies counted in whole units (no hundredths) are held and shown as such.
    var zero = /^(BIF|CLP|DJF|GNF|JPY|KMF|KRW|MGA|PYG|RWF|VND|VUV|XAF|XOF|XPF)$/.test(code);
    var v = Math.abs(Number(n) || 0);
    var sign = Number(n) < 0 ? '-' : '';
    var sym = code === 'USD' ? '$' : code + ' ';
    if (zero) return sign + sym + v.toLocaleString('en-US');
    var whole = Math.floor(v / 100);
    var frac = String(v % 100);
    if (frac.length < 2) frac = '0' + frac;
    return sign + sym + whole.toLocaleString('en-US') + '.' + frac;
  }

  /* ---- receipts: what the owner sends the customer, by hand ---- */
  function receiptEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function receiptFirstName(o) {
    var n = String(o.name || '').trim();
    return n ? n.split(/\\s+/)[0] : 'there';
  }
  function receiptLines(o) {
    return (o.items || []).map(function (it) {
      var qty = Number(it.quantity) || 1;
      var each = Number(it.unit_price) || 0;
      return { label: qty + '× ' + it.name + (it.option ? ' (' + it.option + ')' : ''), amount: cents(qty * each, o.currency) };
    });
  }
  function receiptStatus(o) {
    if (o.status === 'confirmed') return 'It is being printed now and ships straight from the printer. You will get a tracking email when it is on its way.';
    if (o.status === 'paid') return 'Your payment is in. It goes to print as soon as the payment settles (a few business days), then ships straight from the printer.';
    if (o.status === 'refunded') return 'This order has been refunded to your card.';
    if (o.status === 'missing') return 'Your payment is in and we are sorting out the print by hand. We will be in touch.';
    return '';
  }
  function receiptSubject(o) {
    return 'Your Wizard Shit order ' + o.reference;
  }
  function receiptText(o) {
    var out = [];
    out.push('Hi ' + receiptFirstName(o) + ',');
    out.push('');
    out.push('Thanks for your order from Wizard Shit. Here is your receipt.');
    out.push('');
    out.push('Order ' + o.reference + ' — placed ' + String(o.created_at || '').slice(0, 10));
    if (o.name || o.place) out.push('Ship to: ' + [o.name, o.place].filter(Boolean).join(' · '));
    out.push('');
    receiptLines(o).forEach(function (l) { out.push(l.label + ' — ' + l.amount); });
    out.push('');
    out.push('Subtotal: ' + cents(o.subtotal, o.currency));
    out.push('Shipping: ' + cents(o.shipping, o.currency));
    if (o.donation > 0) out.push('Gift to Wizard Shit: ' + cents(o.donation, o.currency));
    out.push('Total paid: ' + cents(o.total, o.currency) + ' ' + String(o.currency || 'USD').toUpperCase());
    var st = receiptStatus(o);
    if (st) { out.push(''); out.push(st); }
    out.push('');
    out.push('Questions? Just reply to this email.');
    out.push('');
    out.push('— Wizard Shit');
    out.push('https://wizardshit.store');
    return out.join('\\n');
  }
  function receiptHtml(o) {
    var rows = receiptLines(o).map(function (l) {
      return '<tr><td>' + receiptEsc(l.label) + '</td><td class="n">' + receiptEsc(l.amount) + '</td></tr>';
    }).join('');
    var st = receiptStatus(o);
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + receiptEsc('Receipt ' + o.reference) + '</title>' +
      '<style>body{font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px;margin:2.5rem auto;padding:0 1.25rem}' +
      'h1{font-size:1.5rem;margin:0}h1 span{color:#ff8a1f}.muted{color:#666}table{width:100%;border-collapse:collapse;margin:1.25rem 0}' +
      'td{padding:0.45rem 0;border-bottom:1px solid #e5e5e5;vertical-align:top}td.n{text-align:right;white-space:nowrap}tr.total td{border-bottom:0;font-weight:700;font-size:1.05rem}' +
      '.foot{margin-top:2rem;font-size:0.9rem;color:#666}@media print{body{margin:0}button{display:none}}</style></head><body>' +
      '<h1>Wiz<span>@</span>rd Shit</h1><div class="muted">wizardshit.store</div>' +
      '<p style="margin-top:1.5rem"><strong>Receipt</strong><br>Order ' + receiptEsc(o.reference) + ' · placed ' + receiptEsc(String(o.created_at || '').slice(0, 10)) + '</p>' +
      (o.name || o.place || o.email ? '<p>' + receiptEsc([o.name, o.place].filter(Boolean).join(' · ')) + (o.email ? '<br><span class="muted">' + receiptEsc(o.email) + '</span>' : '') + '</p>' : '') +
      '<table>' + rows +
      '<tr><td>Subtotal</td><td class="n">' + receiptEsc(cents(o.subtotal, o.currency)) + '</td></tr>' +
      '<tr><td>Shipping</td><td class="n">' + receiptEsc(cents(o.shipping, o.currency)) + '</td></tr>' +
      (o.donation > 0 ? '<tr><td>Gift to Wizard Shit</td><td class="n">' + receiptEsc(cents(o.donation, o.currency)) + '</td></tr>' : '') +
      '<tr class="total"><td>Total paid</td><td class="n">' + receiptEsc(cents(o.total, o.currency) + ' ' + String(o.currency || 'USD').toUpperCase()) + '</td></tr></table>' +
      (st ? '<p>' + receiptEsc(st) + '</p>' : '') +
      '<p class="foot">Thanks for supporting Wizard Shit. Questions? Reply to the email this came with.</p>' +
      '<p><button onclick="window.print()">Print / save as PDF</button></p></body></html>';
  }
  function receiptButtons(o, acts) {
    if (o.status === 'pending_payment' || o.status === 'payment_failed') return;
    var mail = el('a', 'btn receipt-mail', 'Email receipt');
    mail.href = 'mailto:' + encodeURIComponent(o.email || '') + '?subject=' + encodeURIComponent(receiptSubject(o)) + '&body=' + encodeURIComponent(receiptText(o));
    mail.title = o.email ? 'Opens your email app with the receipt written out, addressed to ' + o.email : 'No email on this order';
    acts.appendChild(mail);
    var copy = el('button', 'btn receipt-copy', 'Copy receipt');
    copy.type = 'button';
    copy.title = 'Copies the receipt text, ready to paste into any email';
    copy.onclick = function () {
      var text = receiptText(o);
      var done = function () { toast('Receipt copied' + (o.email ? ' — paste it into an email to ' + o.email : '')); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy the receipt:', text); });
      else window.prompt('Copy the receipt:', text);
    };
    acts.appendChild(copy);
    var print = el('button', 'btn receipt-print', 'Print receipt');
    print.type = 'button';
    print.title = 'Opens a clean receipt page: print it, or save it as a PDF to attach';
    print.onclick = function () {
      var w = window.open('', '_blank');
      if (!w) { toast('Allow pop-ups for this page to open the receipt', true); return; }
      w.document.open();
      w.document.write(receiptHtml(o));
      w.document.close();
    };
    acts.appendChild(print);
  }

  function orderBadge(o) {
    if (o.status === 'confirmed') return el('span', 'badge good', 'PRINTING · ' + (o.printful_status || 'pending'));
    if (o.status === 'paid' && o.confirm_error) return el('span', 'badge bad', 'PAID' + (o.stripe_payout ? ' · IN BANK' : '') + ' — PRINTFUL WOULD NOT PRINT IT: ' + o.confirm_error + ' — fix that at Printful, then press Confirm');
    if (o.status === 'paid') return el('span', 'badge wait', o.stripe_payout ? 'PAID · IN BANK' : 'PAID · WAITING FOR PAYOUT');
    if (o.status === 'pending_payment') return el('span', 'badge', 'NOT PAID (abandoned checkout \u2014 or a missed Stripe message: press CHECK PAYMENTS)');
    if (o.status === 'payment_failed') return el('span', 'badge bad', 'PAYMENT FAILED');
    if (o.status === 'refunded') return el('span', 'badge bad', 'REFUNDED');
    if (o.status === 'missing') return el('span', 'badge bad', 'PAID BUT NO PRINTFUL ORDER — fulfil by hand');
    return el('span', 'badge', o.status);
  }

  function renderOrders() {
    if (orders === null) {
      listEl.appendChild(el('div', 'empty', 'Fetching the order book…'));
      return;
    }
    if (ordersError) {
      listEl.appendChild(el('div', 'empty', ordersError));
      return;
    }
    var mode = el('div', 'mode-line');
    if (!orders.shop) {
      mode.appendChild(el('strong', '', 'Shop closed. '));
      mode.appendChild(document.createTextNode('Cards on the site link out to Printful until PRINTFUL_TOKEN and STRIPE_SECRET_KEY are set on the worker.'));
    } else if (orders.test_mode) {
      mode.appendChild(el('strong', '', 'Stripe is on TEST keys. '));
      mode.appendChild(document.createTextNode('Nothing will be sent to print.'));
    } else if (orders.mode === 'payout') {
      mode.appendChild(el('strong', '', 'Confirm on payout. '));
      mode.appendChild(document.createTextNode('A paid order waits as a Printful draft until Stripe has paid that money into the bank, then goes to print on its own. CONFIRM sends one to print now instead.'));
    } else {
      mode.appendChild(el('strong', '', 'Confirm on payment. '));
      mode.appendChild(document.createTextNode('Orders go to print the moment the card is charged.'));
    }
    listEl.appendChild(mode);
    // One click tells the owner whether the keys the worker holds actually
    // work, without showing the keys.
    var check = el('button', 'btn', 'CHECK KEYS');
    check.style.marginBottom = '0.9rem';
    check.type = 'button';
    var report = el('div', 'mode-line');
    report.style.display = 'none';
    check.addEventListener('click', function () {
      check.disabled = true;
      report.style.display = '';
      report.textContent = 'Asking Stripe and Printful…';
      api('/api/admin/shop/health').then(function (h) {
        report.innerHTML = '';
        var line = function (ok, text) {
          var d = el('div', '', (ok ? '✓ ' : '✗ ') + text);
          d.style.color = ok ? '' : '#ff7a7a';
          report.appendChild(d);
        };
        var shapeText = function (k) {
          if (!k.set) return 'not set';
          var notes = [];
          if (k.stray) notes.push('stray characters were cleaned off');
          if (k.odd) notes.push(k.odd + ' character' + (k.odd === 1 ? '' : 's') + ' that cannot be part of a key — re-enter it');
          return k.prefix + '… (' + k.length + ' characters' + (notes.length ? ', ' + notes.join('; ') : '') + ')';
        };
        // A key with characters that cannot belong in one is wrong, whatever else is true.
        line(h.stripe.set && !h.stripe.odd && h.stripe.live === 'ok', 'Stripe secret key ' + shapeText(h.stripe) + (h.stripe.set ? ' — ' + (h.stripe.live === 'ok' ? 'Stripe accepts it' : h.stripe.live) : ''));
        line(h.printful.set && !h.printful.odd && h.printful.live === 'ok', 'Printful token ' + shapeText(h.printful) + (h.printful.set ? ' — ' + (h.printful.live === 'ok' ? 'Printful accepts it' : h.printful.live) : ''));
        line((h.webhook.set && !h.webhook.odd && /^whsec_/.test(h.webhook.prefix)) || h.webhook.stored, 'Stripe webhook secret ' + shapeText(h.webhook) + (h.webhook.set && h.webhook.odd ? ' — orders will never be marked paid until this is fixed' : '') + (h.webhook.stored ? ' — plus the one the Worker keeps for the endpoint it made' : ''));
        // The endpoint Stripe actually has: a typo in its address bounces
        // every delivery, and the shop never hears that anyone paid.
        var ep = h.webhook.endpoint;
        if (ep) {
          var epText = ep.ok ? ep.url + ' — enabled, every event on' : (ep.problem || 'not right');
          if (ep.ok && !h.webhook.usable) epText += ' — but the signing secret cannot check anything, so every message is refused';
          line(ep.ok && h.webhook.usable, 'Stripe webhook endpoint ' + epText);
          if (!ep.ok || !h.webhook.usable) {
            var fix = el('button', 'btn primary', 'FIX WEBHOOK');
            fix.type = 'button';
            fix.style.marginTop = '0.4rem';
            fix.title = 'Point Stripe at ' + ep.url + ' with every event the shop needs (or create the endpoint)';
            fix.addEventListener('click', function () {
              fix.disabled = true;
              api('/api/admin/shop/webhook/repair', { method: 'POST' }).then(function (r) {
                var what = r.action === 'moved' ? 'moved the endpoint to ' + r.url
                  : r.action === 'created' ? 'created the endpoint at ' + r.url + ' (the Worker keeps its signing secret)'
                  : r.action === 'replaced' ? 'made a fresh endpoint at ' + r.url + ' and switched the old one off (the Worker keeps the new signing secret)'
                  : r.action === 'updated' ? 'switched on every event at ' + r.url
                  : 'already right';
                toast('Webhook: ' + what + (r.ok ? '' : ' — still: ' + r.problem), !r.ok);
                check.click();
              }).catch(function (e) {
                if (e.message !== 'login required') toast(e.message, true);
                fix.disabled = false;
              });
            });
            report.appendChild(fix);
          }
        }
        line(h.publishable, 'Publishable key ' + (h.publishable ? 'set (checkout opens on the site)' : 'not set (checkout uses the Stripe page)'));
        if (h.stripe.test_mode) line(false, 'Stripe is on TEST keys — nothing goes to print.');
      }).catch(function (e) {
        report.textContent = e.message;
      }).then(function () { check.disabled = false; });
    });
    // And one that shows what Printful is actually offering for each card,
    // with stock status — why a colour or size is missing from the site.
    var cat = el('button', 'btn', 'CHECK CATALOG');
    cat.type = 'button';
    cat.style.marginBottom = '0.9rem';
    cat.style.marginLeft = '0.6rem';
    var catReport = el('div', 'mode-line');
    catReport.style.display = 'none';
    cat.addEventListener('click', function () {
      cat.disabled = true;
      catReport.style.display = '';
      catReport.textContent = 'Asking Printful about every card…';
      api('/api/admin/shop/catalog').then(function (d) {
        catReport.innerHTML = '';
        (d.products || []).forEach(function (p) {
          var head = el('div', '', (p.visible ? '' : '(hidden) ') + p.title + (p.printful_name ? ' — Printful: ' + p.printful_name : ' — not linked to a Printful product'));
          head.style.fontWeight = '700';
          head.style.marginTop = '0.5rem';
          catReport.appendChild(head);
          if (p.error) {
            var er = el('div', '', '  ✗ Printful could not serve this product: ' + p.error);
            er.style.color = '#ff7a7a';
            catReport.appendChild(er);
            return;
          }
          if (!p.variants.length && p.printful_id) catReport.appendChild(el('div', '', '  (no variants synced)'));
          p.variants.forEach(function (v) {
            var label = [v.color, v.size].filter(Boolean).join(' / ') || v.name;
            var line = el('div', '', (v.on_site ? '  ✓ ' : '  ✗ ') + label + ' · ' + cents(v.price, v.currency) + (v.on_site ? '' : ' · ' + v.status.replace(/_/g, ' ') + ' at Printful — hidden from the site until it is active'));
            if (!v.on_site) line.style.color = '#ff7a7a';
            catReport.appendChild(line);
          });
        });
        if (!(d.products || []).length) catReport.textContent = 'No merch cards yet.';
      }).catch(function (e) {
        catReport.textContent = e.message;
      }).then(function () { cat.disabled = false; });
    });
    // The safety net for a webhook that never arrived: ask Stripe directly
    // about every unpaid order and mark the paid ones.
    var rec = el('button', 'btn primary', 'CHECK PAYMENTS');
    rec.type = 'button';
    rec.style.marginBottom = '0.9rem';
    rec.style.marginLeft = '0.6rem';
    rec.title = 'Ask Stripe about every order still marked unpaid and mark the paid ones; then send any order Stripe has paid out to print';
    rec.addEventListener('click', function () {
      rec.disabled = true;
      api('/api/admin/shop/reconcile', { method: 'POST' }).then(function (r) {
        var bits = [];
        if (r.paid.length) bits.push('marked paid: ' + r.paid.join(', ') + (r.mode === 'payout' ? ' (held for payout)' : ''));
        if (r.confirmed.length) bits.push('sent to print: ' + r.confirmed.join(', '));
        if (r.paid_gifts.length) bits.push('gifts paid: ' + r.paid_gifts.join(', '));
        if (r.paid_out && r.paid_out.length) bits.push('paid out, now sent to print: ' + r.paid_out.join(', '));
        if (r.still_held && r.still_held.length) bits.push(r.still_held.length + ' paid, waiting for Stripe to pay out (press again after the payout)');
        if (r.still_unpaid.length) bits.push(r.still_unpaid.length + ' still unpaid at Stripe');
        if (r.errors.length) bits.push(r.errors.length + ' could not be checked: ' + r.errors.map(function (x) { return x.reference + ' \u2014 ' + x.error; }).join('; '));
        toast('Checked ' + r.checked + ' \u2014 ' + (bits.join(' \u00b7 ') || 'nothing to mark'), r.errors.length > 0);
        loadOrders();
      }).catch(function (e) {
        if (e.message !== 'login required') toast(e.message, true);
      }).then(function () { rec.disabled = false; });
    });
    listEl.appendChild(check);
    listEl.appendChild(rec);
    listEl.appendChild(cat);
    listEl.appendChild(report);
    listEl.appendChild(catReport);

    var rows = orders.orders || [];
    if (!rows.length) {
      listEl.appendChild(el('div', 'empty', 'No orders yet. Go make Rathew famous.'));
      return;
    }
    rows.forEach(function (o) {
      var card = el('div', 'item' + (o.status === 'pending_payment' ? ' hidden-item' : ''));
      var head = el('div', 'item-head');
      var who = el('strong', 'grow', o.reference + ' — ' + (o.name || 'unknown') + (o.place ? ' · ' + o.place : ''));
      who.appendChild(orderBadge(o));
      head.appendChild(who);
      head.appendChild(el('span', 'msg-meta', (o.created_at || '').slice(0, 16)));
      card.appendChild(head);
      var items = (o.items || []).map(function (it) {
        return it.quantity + '× ' + it.name + (it.option ? ' (' + it.option + ')' : '');
      }).join(', ');
      card.appendChild(el('div', 'order-line', items + ' · ' + cents(o.total, o.currency) + ' incl. ' + cents(o.shipping, o.currency) + ' shipping' + (o.donation > 0 ? ' + ' + cents(o.donation, o.currency) + ' donation' : '') + (o.email ? ' · ' + o.email : '')));
      var acts = el('div', 'order-actions');
      if (o.printful_order_id) {
        var pf = el('a', '', 'Printful #' + o.printful_order_id);
        pf.href = 'https://www.printful.com/dashboard/default/orders/' + o.printful_order_id;
        pf.target = '_blank';
        pf.rel = 'noopener';
        pf.style.fontSize = '0.8rem';
        acts.appendChild(pf);
      }
      if (o.status === 'paid') {
        var cB = el('button', 'btn primary', 'Confirm — send to print now');
        cB.onclick = function () {
          if (!window.confirm('Send ' + o.reference + ' to print now? Printful bills for it the moment it confirms.')) return;
          cB.disabled = true;
          api('/api/admin/shop/orders/' + encodeURIComponent(o.reference) + '/confirm', { method: 'POST' })
            .then(function () { toast('Confirmed — Printful is printing it'); orders = null; render(); loadOrders(); })
            .catch(function (e) { cB.disabled = false; if (e.message !== 'login required') toast(e.message, true); });
        };
        acts.appendChild(cB);
      }
      receiptButtons(o, acts);
      if (acts.childNodes.length) card.appendChild(acts);
      listEl.appendChild(card);
    });
  }

  /* ---- donations ---- */
  function loadDonations() {
    api('/api/admin/donations')
      .then(function (d) { donations = d; render(); })
      .catch(function (e) { if (e.message !== 'login required') toast(e.message, true); });
  }

  function donationBadge(d) {
    if (d.status === 'paid_out') return el('span', 'badge good', 'IN BANK');
    if (d.status === 'paid') return el('span', 'badge wait', 'PAID · ON ITS WAY TO THE BANK');
    if (d.status === 'pending') return el('span', 'badge', 'NOT COMPLETED');
    if (d.status === 'refunded') return el('span', 'badge bad', 'REFUNDED');
    if (d.status === 'failed') return el('span', 'badge bad', 'FAILED');
    return el('span', 'badge', d.status);
  }

  function renderDonations() {
    if (donations === null) {
      listEl.appendChild(el('div', 'empty', 'Counting the gifts…'));
      return;
    }
    var t = donations.totals || {};
    var totals = el('div', 'totals-row');
    [['Received', cents(t.received)], ['In the bank', cents(t.in_bank)], ['Gifts', String(t.gifts || 0)]].forEach(function (pair) {
      var st = el('div', 'stat');
      st.appendChild(el('span', 'n', pair[1]));
      st.appendChild(el('span', 'l', pair[0]));
      totals.appendChild(st);
    });
    listEl.appendChild(totals);
    if (!donations.donate) {
      listEl.appendChild(el('div', 'mode-line', 'Donations through the site are off until STRIPE_SECRET_KEY is set on the worker; the DONATE buttons use the old link meanwhile.'));
    }
    var rows = donations.donations || [];
    if (!rows.length) {
      listEl.appendChild(el('div', 'empty', 'No donations yet.'));
      return;
    }
    rows.forEach(function (d) {
      var card = el('div', 'item' + (d.status === 'pending' || d.status === 'failed' ? ' hidden-item' : ''));
      var head = el('div', 'item-head');
      var who = el('strong', 'grow', cents(d.amount, d.currency) + ' — ' + (d.name || 'anonymous') + (d.email ? ' · ' + d.email : ''));
      who.appendChild(donationBadge(d));
      if (d.public) who.appendChild(el('span', 'badge', 'OK TO THANK BY NAME'));
      if (d.source === 'order') who.appendChild(el('span', 'badge', 'WITH ORDER ' + d.reference));
      head.appendChild(who);
      head.appendChild(el('span', 'msg-meta', (d.paid_at || d.created_at || '').slice(0, 16)));
      card.appendChild(head);
      if (d.message) card.appendChild(el('div', 'order-line', '“' + d.message + '”'));
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
          printful_id: p.id,
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

  // One plain-English line per tab, shown under the tab row, so nobody has to
  // guess what a tab is for.
  var TAB_HELP = {
    merch: 'The products shown in the MERCH section of the website. Import them from Printful, or add one by hand, then hit Save & publish.',
    credits: 'The flip cards in the CREDITS section \\u2014 who worked on the show, their photo, and the bio on the back of the card.',
    donators: 'The list of names thanked in the DONATORS section of the website.',
    messages: 'Messages people sent you from the box on the website. Each one comes with the sender\\u2019s email so you can write back.',
    signups: 'Everyone who put their email in the signup box on the website \\u2014 your mailing list. Download it as a CSV.',
    orders: 'Every order placed on the website: who bought what, whether they paid, whether the money has reached the bank, and whether Printful is printing it yet.',
    donations: 'Every donation made through the DONATE button: who gave, how much, and whether it has reached the bank. Add names you want to thank to the DONATORS tab.',
    analytics: 'How much traffic the website is getting \\u2014 visits per day for the last month, or per month for the last year.'
  };

  function render() {
    listEl.innerHTML = '';
    document.getElementById('tabHelp').textContent = TAB_HELP[tab] || '';
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
    else if (tab === 'donations') { renderDonations(); return; }
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
      if (tab === 'donations' && donations === null) loadDonations();
      if (tab === 'analytics' && stats === null) loadStats();
    };
  });

  document.getElementById('printfulBtn').onclick = function () {
    pfOpen = !pfOpen;
    render();
    if (pfOpen && pfProducts === null) {
      loadPfProducts();
    }
  };

  document.getElementById('addBtn').onclick = function () {
    var fresh;
    if (tab === 'merch') fresh = { title: '', url: 'https://wizard.printful.me/product/', image: '', sticker: 0, row_break: 0, visible: 1, printful_id: null };
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
    if (tab === 'donations') { donations = null; render(); loadDonations(); return; }
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
            showLoginPrompt();
            setupGoogleButton();
          } else {
            // Not an auth problem — get the cover out of the way so the
            // console and the error are both visible.
            hideLoginPrompt();
            toast(out.d.error || 'Backend not ready', true);
          }
          return;
        }
        hideLoginPrompt();
        document.getElementById('whoami').textContent =
          'logged in' + (out.d.email && out.d.email !== 'owner' ? ' as ' + out.d.email : '') +
          (out.d.mode === 'access' ? ' via Cloudflare Access' : out.d.mode === 'google' ? ' via Google' : '');
        load();
      })
      .catch(function () { hideLoginPrompt(); toast('Cannot reach the backend', true); });
  }

  boot();
})();
</script>
</body>
</html>`;
