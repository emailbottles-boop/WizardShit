/**
 * The memorial page: loads the wall, opens photos, and takes new ones.
 *
 * No framework and no build step — one file, loaded directly. It is meant to
 * be readable by whoever looks after this site in five years, which may well
 * not be a programmer.
 */
(function () {
  'use strict';

  var API = (window.MEMORIAL_API || '').replace(/\/+$/, '');
  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------- state --- */

  var photos = [];      // everything currently on the wall, newest first
  var recordings = [];  // every visible recording, newest first
  var oldest = null;    // id of the last one loaded, for paging
  var cursor = 0;       // the last change event this page has applied
  var loading = false;

  /* ------------------------------------------------------------ helpers --- */

  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.error || 'Something went wrong');
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }

  // The database stores a file as a path (/img/<key>), so the same row works
  // whichever address the page is talking to. Older rows may carry a full
  // URL; those are used as they are.
  function fileUrl(p) {
    return /^https?:\/\//.test(p.image) ? p.image : API + p.image;
  }

  // Captions and names are typed by the public, so they are only ever put on
  // the page through textContent or through this. Never innerHTML with them.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------------------------------------ heading --- */

  function applySettings(s) {
    s = s || {};
    // His name is written into index.html, so an empty database is not an error
    // and must not blank the heading — the database only ever OVERRIDES what is
    // already on the page, for when someone wants to change how it reads.
    if (s.name) {
      $('name').textContent = s.name;
      document.title = s.name + ' — The Real MJ';
    }
    if (s.dates) $('dates').textContent = s.dates;
    if (s.intro) $('intro').textContent = s.intro;
    // The line above the button is empty unless the caretaker writes one.
    if (s.invite) { $('invite').textContent = s.invite; $('invite').hidden = false; }
  }

  /* --------------------------------------------------------- recordings --- */

  function fmtDur(sec) {
    sec = Math.round(sec);
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function recCard(r, fresh) {
    var el = document.createElement('div');
    el.className = 'rec' + (fresh ? ' fresh' : '');
    el.dataset.id = r.id;

    var meta = document.createElement('div');
    meta.className = 'rec-meta';
    var cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = r.caption || 'Untitled recording';
    meta.appendChild(cap);
    var bits = [];
    if (r.uploader) bits.push('added by ' + r.uploader);
    if (r.duration) bits.push(fmtDur(r.duration));
    if (bits.length) {
      var by = document.createElement('div');
      by.className = 'by';
      by.textContent = bits.join(' \u00b7 ');
      meta.appendChild(by);
    }
    el.appendChild(meta);

    var a = document.createElement('audio');
    a.controls = true;
    // Nothing downloads until someone presses play — a page with twenty
    // recordings on it should not pull twenty files just to be looked at.
    a.preload = 'none';
    a.src = fileUrl(r);
    // One at a time. Two of his recordings playing over each other is not a
    // thing anyone wants to happen by accident.
    a.addEventListener('play', function () {
      var all = document.querySelectorAll('.rec audio');
      for (var i = 0; i < all.length; i++) if (all[i] !== a) all[i].pause();
    });
    el.appendChild(a);
    return el;
  }

  function renderRecordings() {
    var list = $('recList');
    list.innerHTML = '';
    recordings.forEach(function (r) { list.appendChild(recCard(r, false)); });
    $('recordings').hidden = recordings.length === 0;
  }

  /* --------------------------------------------------------------- wall --- */

  function tile(p, fresh) {
    var fig = document.createElement('figure');
    fig.className = 'tile' + (fresh ? ' fresh' : '');
    fig.dataset.id = p.id;
    fig.tabIndex = 0;
    fig.setAttribute('role', 'button');

    var img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = fileUrl(p);
    // The caption is the only description we have; without one the photo is
    // decorative as far as a screen reader is concerned.
    img.alt = p.caption || '';
    // Reserving the real proportions stops the wall reflowing as photos load,
    // which on a long wall is the difference between calm and chaotic.
    if (p.width && p.height) {
      img.width = p.width;
      img.height = p.height;
      img.style.aspectRatio = p.width + ' / ' + p.height;
    }
    fig.appendChild(img);

    if (p.caption || p.uploader) {
      var cap = document.createElement('figcaption');
      if (p.caption) {
        var c = document.createElement('div');
        c.className = 'cap';
        c.textContent = p.caption;
        cap.appendChild(c);
      }
      if (p.uploader) {
        var b = document.createElement('div');
        b.className = 'by';
        b.textContent = 'added by ' + p.uploader;
        cap.appendChild(b);
      }
      fig.appendChild(cap);
    }

    function open() { openLight(photos.indexOf(p)); }
    fig.addEventListener('click', open);
    fig.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return fig;
  }

  function render(list, append) {
    var wall = $('wall');
    if (!append) wall.innerHTML = '';
    list.forEach(function (p) { wall.appendChild(tile(p, false)); });
  }

  function loadFirst() {
    return api('/api/memorial').then(function (d) {
      applySettings(d.settings);
      recordings = d.recordings || [];
      renderRecordings();
      photos = d.photos || [];
      oldest = photos.length ? photos[photos.length - 1].id : null;
      render(photos, false);
      $('state').hidden = photos.length > 0;
      if (!photos.length) $('state').textContent = recordings.length ? 'No photographs yet.' : 'Nothing here yet. Yours can be the first.';
      $('more').hidden = !d.more;
      cursor = d.cursor || 0;
      startLive();
    }).catch(function () {
      // The wall is the whole page, so a failure here needs saying out loud
      // rather than leaving a blank screen.
      $('state').hidden = false;
      $('state').textContent = 'The photographs could not be loaded just now. Please refresh in a moment.';
    });
  }

  function loadMore() {
    if (loading || !oldest) return;
    loading = true;
    $('more').textContent = 'Loading…';
    api('/api/photos?before=' + oldest).then(function (d) {
      var list = d.photos || [];
      photos = photos.concat(list);
      if (list.length) oldest = list[list.length - 1].id;
      render(list, true);
      $('more').hidden = !d.more;
      $('more').textContent = 'Show older photos';
    }).catch(function () {
      $('more').textContent = 'Could not load more — tap to try again';
    }).then(function () { loading = false; });
  }

  $('more').addEventListener('click', loadMore);

  /* ----------------------------------------------------------- lightbox --- */

  var lightAt = -1;

  function openLight(i) {
    if (i < 0 || i >= photos.length) return;
    lightAt = i;
    var p = photos[i];
    $('lightImg').src = fileUrl(p);
    $('lightImg').alt = p.caption || '';
    $('lightCap').textContent = p.caption || '';
    $('lightBy').textContent = p.uploader ? 'added by ' + p.uploader : '';
    $('light').hidden = false;
    document.body.style.overflow = 'hidden';
    $('closeLight').focus();
  }

  function closeLight() {
    $('light').hidden = true;
    // Drop the source so a large photo is not held in memory behind a closed
    // lightbox while someone keeps scrolling.
    $('lightImg').removeAttribute('src');
    document.body.style.overflow = '';
  }

  function step(by) {
    var n = lightAt + by;
    // Reaching the end of what is loaded pulls the next page in, so arrowing
    // through the wall never stops at an arbitrary boundary.
    if (n >= photos.length && !$('more').hidden) {
      loadMore();
      return;
    }
    if (n < 0 || n >= photos.length) return;
    openLight(n);
  }

  $('closeLight').addEventListener('click', closeLight);
  $('prev').addEventListener('click', function () { step(-1); });
  $('next').addEventListener('click', function () { step(1); });
  $('light').addEventListener('click', function (e) {
    // Clicking the backdrop closes; clicking the photo itself does not.
    if (e.target === $('light') || e.target.tagName === 'FIGURE') closeLight();
  });

  document.addEventListener('keydown', function (e) {
    if (!$('light').hidden) {
      if (e.key === 'Escape') closeLight();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
    } else if (!$('sheet').hidden && e.key === 'Escape') {
      closeSheet();
    }
  });

  /* ------------------------------------------------------------- adding --- */

  var chosen = [];

  function openSheet() {
    $('sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('sheet').hidden = true;
    document.body.style.overflow = '';
  }

  $('openAdd').addEventListener('click', openSheet);
  $('closeAdd').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (e) {
    if (e.target === $('sheet')) closeSheet();
  });

  function niceSize(n) {
    return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB'
                           : (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function listChosen() {
    var ul = $('picked');
    ul.innerHTML = '';
    chosen.forEach(function (f, i) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="nm"></span><span class="sz"></span>';
      li.querySelector('.nm').textContent = f.name;
      li.querySelector('.sz').textContent = niceSize(f.size);
      li.dataset.i = i;
      ul.appendChild(li);
    });
    $('send').disabled = chosen.length === 0;
    $('send').textContent = chosen.length > 1
      ? 'Add ' + chosen.length + ' photos to the wall'
      : 'Add to the wall';
  }

  // Note the class list is rebuilt rather than replaced: 'sz' is the hook this
  // very function uses to find the element again, so overwriting className
  // outright would make the next call unable to find it.
  function mark(i, cls, text) {
    var li = $('picked').querySelector('li[data-i="' + i + '"]');
    if (!li) return;
    var sz = li.querySelector('.sz');
    if (!sz) return;
    sz.className = 'sz' + (cls ? ' ' + cls : '');
    sz.textContent = text;
  }

  function take(files) {
    // Only ever add to what is already chosen, so picking twice (or picking
    // then dragging) does not silently throw the first batch away.
    for (var i = 0; i < files.length; i++) {
      if (chosen.length >= 40) break;
      chosen.push(files[i]);
    }
    listChosen();
  }

  $('files').addEventListener('change', function (e) { take(e.target.files); });

  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) take(e.dataTransfer.files);
  });

  /* ---------------------------------------------------------- preparing --- */

  // Long enough that a photo still looks good full-screen on a large monitor,
  // small enough that thirty of them are a quick upload on a phone.
  var MAX_EDGE = 2400;
  var SEND_AS_IS = 4 * 1024 * 1024;
  var SERVER_MAX = 12 * 1024 * 1024;
  var AUDIO_MAX = 60 * 1024 * 1024;
  var KEEP = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

  // Some browsers report no type at all for a picked audio file; the
  // extension is the fallback, and the server checks the bytes regardless.
  var AUDIO_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', flac: 'audio/flac' };

  function audioType(file) {
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('audio/') === 0) return t;
    var m = /\.([a-z0-9]+)$/i.exec(file.name || '');
    return m && AUDIO_EXT[m[1].toLowerCase()] ? AUDIO_EXT[m[1].toLowerCase()] : '';
  }

  // Best effort: ask the browser how long the recording is, for the label
  // next to it. Anything goes wrong or takes too long, it just has no label.
  function readDuration(file) {
    return new Promise(function (res) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; res(v); } };
      try {
        var url = URL.createObjectURL(file);
        var a = document.createElement('audio');
        a.preload = 'metadata';
        a.onloadedmetadata = function () { URL.revokeObjectURL(url); finish(isFinite(a.duration) ? a.duration : 0); };
        a.onerror = function () { URL.revokeObjectURL(url); finish(0); };
        a.src = url;
        setTimeout(function () { finish(0); }, 8000);
      } catch (e) { finish(0); }
    });
  }

  function toBlob(canvas) {
    return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.88); });
  }

  /**
   * Decode a picked file to something we can draw.
   *
   * createImageBitmap is the good path: it is fast, it does not block the page,
   * and `from-image` applies the EXIF rotation so photos taken sideways on a
   * phone are not stored sideways forever. Not every browser accepts the
   * options argument, so an <img> is the fallback — browsers apply EXIF
   * orientation when rendering one of those anyway.
   */
  function decode(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return createImageBitmap(file); })
        .catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
  }

  function decodeViaImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('could not read')); };
      img.src = url;
    });
  }

  /**
   * Turn whatever someone picked into something the server will accept.
   *
   * Re-encoding in the browser is what makes this work on a phone: it handles
   * HEIC (which iPhones shoot by default and the server does not accept),
   * strips the GPS coordinates and camera serial that ride along in EXIF, bakes
   * in the rotation, and turns a 9MB photo into a few hundred KB before it
   * touches the network.
   *
   * Files already small and already in an accepted format are passed straight
   * through, so nothing gets quietly degraded for no reason.
   */
  function prepare(file) {
    var type = (file.type || '').toLowerCase();

    // A recording is sent exactly as it is. Nothing here re-encodes sound,
    // and nobody wants a memorial to have quietly turned his WAV into
    // something smaller.
    var at = audioType(file);
    if (at) {
      if (file.size > AUDIO_MAX) return Promise.reject(new Error('too large'));
      return readDuration(file).then(function (d) {
        return { blob: file, type: at, duration: d, isAudio: true };
      });
    }

    // Animated GIFs only survive as GIFs — drawing one to a canvas would keep
    // the first frame and throw the animation away.
    if (type === 'image/gif') {
      return file.size <= SERVER_MAX
        ? Promise.resolve(file)
        : Promise.reject(new Error('too large'));
    }

    if (KEEP[type] && file.size <= SEND_AS_IS) return Promise.resolve(file);

    return decode(file).then(function (src) {
      var w = src.width, h = src.height;
      if (!w || !h) throw new Error('could not read');
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));

      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      // JPEG has no transparency, so anything see-through would come out black.
      // White reads as paper, which is what a scan of a print wants anyway.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(src, 0, 0, cw, ch);
      if (src.close) src.close();

      return toBlob(canvas).then(function (blob) {
        if (!blob) throw new Error('could not read');
        // Re-encoding a small PNG can come out bigger than the original; keep
        // whichever is smaller, as long as the server takes the format.
        if (KEEP[type] && file.size <= blob.size && file.size <= SERVER_MAX) return file;
        return blob;
      });
    });
  }

  /* ---------------------------------------------------------- uploading --- */

  function send(item, caption, by) {
    // `item` is either a Blob (a photo) or { blob, type, duration } (a recording).
    var blob = item.blob || item;
    var type = item.type || blob.type || 'image/jpeg';
    var q = '?caption=' + encodeURIComponent(caption) + '&by=' + encodeURIComponent(by);
    if (item.isAudio && item.duration) q += '&duration=' + encodeURIComponent(Math.round(item.duration * 10) / 10);
    var trap = $('website').value;
    if (trap) q += '&website=' + encodeURIComponent(trap);
    return api('/api/photos' + q, {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: blob,
    });
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  $('send').addEventListener('click', function () {
    if (!chosen.length) return;

    var caption = $('caption').value.trim();
    var by = $('by').value.trim();
    var msg = $('msg');
    var btn = $('send');
    btn.disabled = true;
    msg.className = 'msg';

    var added = [];
    var stuck = [];   // the actual File objects that did not make it

    // One at a time, on purpose. Photos off a phone are large, and firing
    // twenty parallel uploads over a weak connection is how you get twenty
    // timeouts instead of twenty photos.
    var chain = Promise.resolve();
    chosen.forEach(function (file, i) {
      chain = chain.then(function () {
        msg.textContent = 'Adding photo ' + (i + 1) + ' of ' + chosen.length + '…';
        try { mark(i, '', 'adding…'); } catch (e) { /* cosmetic only */ }
        return prepare(file)
          .then(function (blob) {
            var size = blob.blob ? blob.blob.size : blob.size;
            if (size > (blob.isAudio ? AUDIO_MAX : SERVER_MAX)) throw new Error('too large');
            return send(blob, caption, by).catch(function (err) {
              // The per-IP budget is generous but a big album can still reach
              // it. Wait it out once rather than making someone re-pick files.
              if (err.status !== 429) throw err;
              msg.textContent = 'Pausing a moment so the server keeps up…';
              return wait(20000).then(function () { return send(blob, caption, by); });
            });
          })
          .then(function (d) {
            if (d && d.photo) added.push(d.photo);
            mark(i, 'ok', 'added');
          })
          .catch(function (err) {
            stuck.push(file);
            mark(i, 'err', err.message === 'could not read'
              ? "couldn't read this one"
              : (err.message === 'too large' ? 'too large' : (err.message || 'failed')));
          });
      });
    });

    // A rejection anywhere above would otherwise leave the button disabled and
    // the message frozen mid-sentence, with no way out but a page reload. The
    // per-photo catch should make that impossible; this is here so that if it
    // ever is possible, the person still gets an answer and a working button.
    chain.catch(function () {}).then(function () {
      if (added.length) {
        // Put them straight on the page rather than making anyone reload to
        // see that their photo arrived.
        var newPhotos = added.filter(function (p) { return p.kind !== 'audio'; });
        var newRecs = added.filter(function (p) { return p.kind === 'audio'; });
        if (newPhotos.length) {
          photos = newPhotos.concat(photos);
          var wall = $('wall');
          newPhotos.slice().reverse().forEach(function (p) {
            wall.insertBefore(tile(p, true), wall.firstChild);
          });
          $('state').hidden = true;
        }
        if (newRecs.length) {
          recordings = newRecs.concat(recordings);
          var list = $('recList');
          newRecs.slice().reverse().forEach(function (r) {
            list.insertBefore(recCard(r, true), list.firstChild);
          });
          $('recordings').hidden = false;
        }
      }

      var CANT_READ = ' A photo straight off a phone is sometimes in a format' +
        ' this site cannot read — screenshotting it and adding the screenshot' +
        ' almost always works. Recordings need to be mp3, wav, m4a, ogg or flac.';

      if (stuck.length && !added.length) {
        msg.className = 'msg bad';
        msg.textContent = (stuck.length === 1 ? 'That photo could not be added.' : 'None of those photos could be added.') + CANT_READ;
        btn.disabled = false;
        return;
      }

      // Some worked, some did not. Saying only "Added, thank you" here would
      // send someone away believing a photo is on the wall when it never
      // arrived — so the failures are always named, the ones that failed stay
      // on screen with their reason, and the panel does not close itself.
      if (stuck.length) {
        msg.className = 'msg bad';
        msg.textContent = (added.length === 1 ? 'One photo was added, but ' : added.length + ' photos were added, but ') +
          (stuck.length === 1 ? 'one could not be.' : stuck.length + ' could not be.') + CANT_READ;
        chosen = stuck;
        $('files').value = '';
        listChosen();
        btn.disabled = false;
        return;
      }

      msg.className = 'msg good';
      msg.textContent = added.length === 1 ? 'Added. Thank you.' : 'Added ' + added.length + '. Thank you.';

      // Clear the picker but leave their name filled in — most people add a
      // few photos in a row and retyping it every time is a small cruelty.
      chosen = [];
      $('files').value = '';
      $('caption').value = '';
      listChosen();
      setTimeout(function () {
        closeSheet();
        msg.textContent = '';
        btn.disabled = true;
      }, 1600);
    });
  });

  /* --------------------------------------------------------------- live --- */

  // Nobody should have to refresh. Every few seconds the page asks the server
  // what has happened since the last thing it heard about — a photo added
  // from someone else's phone, a recording, the caretaker hiding something —
  // and applies exactly that, in place. It only asks while the tab is actually
  // being looked at, and asks the moment it is looked at again.
  var LIVE_EVERY = 5000;
  var liveTimer = null;
  var polling = false;

  function findTile(id) { return $('wall').querySelector('.tile[data-id="' + id + '"]'); }
  function findRec(id)  { return $('recList').querySelector('.rec[data-id="' + id + '"]'); }

  function emptyText() {
    return recordings.length ? 'No photographs yet.' : 'Nothing here yet. Yours can be the first.';
  }

  function dropItem(id) {
    var t = findTile(id); if (t) t.remove();
    var r = findRec(id);  if (r) r.remove();
    photos = photos.filter(function (p) { return p.id !== id; });
    recordings = recordings.filter(function (p) { return p.id !== id; });
    if (!recordings.length) $('recordings').hidden = true;
    if (!photos.length) { $('state').hidden = false; $('state').textContent = emptyText(); }
  }

  function placeItem(p) {
    // Already on the page — this device uploaded it, or an earlier poll
    // delivered it. Refresh the words under it and leave it where it is.
    var existing = p.kind === 'audio' ? findRec(p.id) : findTile(p.id);
    if (existing) {
      var cap = existing.querySelector('.cap');
      if (cap) cap.textContent = p.caption || (p.kind === 'audio' ? 'Untitled recording' : '');
      var by = existing.querySelector('.by');
      if (by) by.textContent = p.uploader ? 'added by ' + p.uploader : '';
      return;
    }
    // New to this page. Slot it by id so order stays newest-first even when
    // several arrive at once.
    var byId = function (a, b) { return b.id - a.id; };
    var before = function (parent) {
      return Array.prototype.find.call(parent.children, function (el) { return Number(el.dataset.id) < p.id; }) || null;
    };
    if (p.kind === 'audio') {
      recordings.push(p); recordings.sort(byId);
      $('recList').insertBefore(recCard(p, true), before($('recList')));
      $('recordings').hidden = false;
      return;
    }
    photos.push(p); photos.sort(byId);
    $('wall').insertBefore(tile(p, true), before($('wall')));
    $('state').hidden = true;
  }

  function applyEvents(evs) {
    evs.forEach(function (e) {
      if (e.kind === 'hide') dropItem(e.id);
      else if (e.kind === 'show' && e.item) placeItem(e.item);
    });
  }

  function poll() {
    if (polling || document.hidden) return;
    polling = true;
    api('/api/changes?cursor=' + cursor).then(function (d) {
      if (d && typeof d.cursor === 'number') {
        if (d.events && d.events.length) applyEvents(d.events);
        cursor = d.cursor;
      }
    }).catch(function () {
      // A missed poll is nothing; the next one asks from the same cursor.
    }).then(function () { polling = false; });
  }

  function startLive() {
    if (liveTimer) return;
    liveTimer = setInterval(poll, LIVE_EVERY);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  }

  /* --------------------------------------------------------------- boot --- */

  loadFirst();
})();
