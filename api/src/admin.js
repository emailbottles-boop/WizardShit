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
  </nav>

  <div class="toolbar">
    <button class="btn" id="addBtn">+ ADD</button>
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

  function imageField(labelText, item, key, round) {
    var box = el('div', 'full');
    box.appendChild(el('label', '', labelText));
    var row = el('div', 'img-row');
    var thumb = el('div', 'thumb' + (round ? ' round' : ''));
    function refresh() {
      var u = imgPreviewUrl(item[key]);
      thumb.style.backgroundImage = u ? 'url("' + u.replace(/"/g, '%22') + '")' : 'none';
    }
    refresh();
    var grow = el('div', 'grow');
    var input = el('input');
    input.type = 'text';
    input.value = item[key] || '';
    input.placeholder = 'filename on the site, or full URL';
    input.addEventListener('input', function () { item[key] = input.value; refresh(); setDirty(true); });
    grow.appendChild(input);
    var up = el('button', 'btn', 'UPLOAD');
    up.type = 'button';
    var file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.style.display = 'none';
    up.onclick = function () { file.click(); };
    file.addEventListener('change', function () {
      var f = file.files[0];
      if (!f) return;
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
          input.value = d.url;
          refresh();
          setDirty(true);
          toast('Image uploaded');
        })
        .catch(function (e) { toast(e.message, true); })
        .then(function () { up.disabled = false; up.textContent = 'UPLOAD'; });
    });
    row.appendChild(thumb);
    row.appendChild(grow);
    row.appendChild(up);
    row.appendChild(file);
    box.appendChild(row);
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
      body.appendChild(field('Photo framing CSS (optional)', item.photo_css, function (v) { item.photo_css = v; }, true));
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

  function render() {
    listEl.innerHTML = '';
    if (tab === 'merch') renderMerch();
    else if (tab === 'credits') renderCredits();
    else renderDonators();
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
    };
  });

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
