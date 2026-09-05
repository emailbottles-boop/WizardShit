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
      <div class="empty" id="loading">Loading…</div>
      <div class="grid" id="grid"></div>
      <button class="more" id="more" hidden>Load older photos</button>
    </section>

  </main>
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
        '<button data-act="hide">' + (p.hidden ? 'Put back' : 'Hide') + '</button>' +
        '<button class="danger" data-act="del">Delete</button>' +
      '</div>';

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
      if (!append) grid.innerHTML = '';
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
