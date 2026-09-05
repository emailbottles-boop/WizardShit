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
  var stories = [];     // every visible story, newest first
  var oldest = null;    // id of the last one loaded, for paging
  var cursor = 0;       // the last change event this page has applied
  var loading = false;

  // Names are never written on the wall, in the row, or under a recording.
  // Who added a photo and who took it are shown in one place only: inside
  // the photo, once it is opened.

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
  // The wall gets the small copy where there is one; opening a photo gets
  // the full one.
  function thumbUrl(p) {
    return p.thumb ? (/^https?:\/\//.test(p.thumb) ? p.thumb : API + p.thumb) : fileUrl(p);
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
    // The heading is written into the page. The database can only ever
    // override it, for the day someone wants it to read differently.
    if (s.name) {
      $('name').textContent = s.name;
      document.title = s.name + ' — The Real MJ';
    }
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
    if (r.duration) {
      var by = document.createElement('div');
      by.className = 'by';
      by.textContent = fmtDur(r.duration);
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

  /* ------------------------------------------------------------ stories --- */

  function storyCard(st, fresh) {
    var el = document.createElement('article');
    el.className = 'story' + (fresh ? ' fresh' : '');
    el.dataset.id = st.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    if (st.image) {
      var pic = document.createElement('img');
      pic.loading = 'lazy';
      pic.decoding = 'async';
      pic.src = thumbUrl(st);
      pic.alt = '';
      el.appendChild(pic);
    }
    var text = document.createElement('p');
    text.textContent = st.caption || '';
    el.appendChild(text);
    var hint = document.createElement('div');
    hint.className = 'more-hint';
    hint.textContent = 'Read';
    el.appendChild(hint);
    function open() { openReader(st); }
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    return el;
  }

  // Stories with a photograph come first, then the written ones; newest
  // first within each.
  function storyOrder(a, b) {
    var ai = a.image ? 1 : 0, bi = b.image ? 1 : 0;
    return bi - ai || b.id - a.id;
  }

  function renderStories() {
    var list = $('storyList');
    list.innerHTML = '';
    stories.sort(storyOrder);
    stories.forEach(function (st) { list.appendChild(storyCard(st, false)); });
    $('stories').hidden = stories.length === 0;
  }

  function openReader(st) {
    $('readerImg').hidden = !st.image;
    if (st.image) $('readerImg').src = fileUrl(st); else $('readerImg').removeAttribute('src');
    $('readerText').textContent = st.caption || '';
    $('readerBy').textContent = st.uploader ? 'told by ' + st.uploader : '';
    $('readerBy').hidden = !st.uploader;
    $('reader').hidden = false;
    document.body.style.overflow = 'hidden';
    $('closeReader').focus();
  }
  function closeReader() {
    $('reader').hidden = true;
    document.body.style.overflow = '';
  }
  $('closeReader').addEventListener('click', closeReader);
  $('reader').addEventListener('click', function (e) { if (e.target === $('reader')) closeReader(); });

  /* --------------------------------------------------------------- wall --- */

  function tile(p, fresh, eager) {
    var fig = document.createElement('figure');
    fig.className = 'tile' + (fresh ? ' fresh' : '');
    fig.dataset.id = p.id;
    fig.tabIndex = 0;
    fig.setAttribute('role', 'button');

    var img = document.createElement('img');
    // The first few photos are what the page opens on, so they are asked for
    // straight away; everything below the fold waits until it is scrolled to.
    img.loading = eager ? 'eager' : 'lazy';
    if (eager === 'high') img.fetchPriority = 'high';
    img.decoding = 'async';
    img.src = thumbUrl(p);
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
    // The reserved shape is only a guess until the photo arrives. Once it has,
    // the photo's own proportions take over, no matter what was recorded for
    // it — so a photo can never be squashed or stretched to fit a box of the
    // wrong shape (which is what happened to older phone photos whose
    // recorded width and height were the wrong way round).
    function settle() {
      img.style.aspectRatio = '';
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.classList.add('in');
    }
    if (img.complete && img.naturalWidth) settle();
    else {
      img.addEventListener('load', settle, { once: true });
      // A photo that cannot be shown still gets its box revealed, rather than
      // an empty patch that looks like something is about to happen.
      img.addEventListener('error', function () { img.classList.add('in'); }, { once: true });
    }
    fig.appendChild(img);

    // Nothing is written under a photo on the wall. The words that came with
    // it, and who added it, are shown only when the photo is opened.
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
    list.forEach(function (p, i) {
      var eager = append ? false : (i < 2 ? 'high' : i < 8);
      wall.appendChild(tile(p, false, eager));
    });
    $('wallTitle').hidden = photos.length === 0;
  }

  function loadFirst() {
    return api('/api/memorial').then(function (d) {
      applySettings(d.settings);
      recordings = d.recordings || [];
      renderRecordings();
      stories = d.stories || [];
      renderStories();
      photos = d.photos || [];
      oldest = photos.length ? photos[photos.length - 1].id : null;
      render(photos, false);
      $('state').hidden = photos.length > 0;
      if (!photos.length) $('state').textContent = recordings.length ? 'No photographs yet.' : 'Nothing here yet. Yours can be the first.';
      $('more').hidden = !d.more;
      cursor = d.cursor || 0;
      stripRefresh();
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
    $('lightCap').hidden = !p.caption;
    $('lightBy').textContent = p.uploader ? 'added by ' + p.uploader : '';
    $('lightBy').hidden = !p.uploader;
    $('lightPhotoBy').textContent = p.photographer ? 'photo by ' + p.photographer : '';
    $('lightPhotoBy').hidden = !p.photographer;
    $('light').hidden = false;
    // Fetch the neighbours now, so the arrows feel instant rather than each
    // one starting a download.
    [i + 1, i - 1].forEach(function (n) {
      if (n >= 0 && n < photos.length) { var pre = new Image(); pre.src = fileUrl(photos[n]); }
    });
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
    } else if (!$('reader').hidden && e.key === 'Escape') {
      closeReader();
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
    storyButton();
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
  var THUMB_EDGE = 900;              // the small copy the wall loads
  var ORIGINAL_MAX = 40 * 1024 * 1024; // the untouched file, kept for the caretaker
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

  function toBlob(canvas, quality) {
    return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', quality || 0.88); });
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
    // the first frame and throw the animation away. Sent as they are; the
    // stored file is the original.
    if (type === 'image/gif') {
      return file.size <= SERVER_MAX
        ? Promise.resolve({ display: file, thumb: null, original: null, isImage: true })
        : Promise.reject(new Error('too large'));
    }

    // Three copies of a photo leave the phone: the one the site shows (at
    // most 2400px), a small one for the wall, and — whenever the shown copy
    // had to be re-encoded — the file exactly as it was, for the caretaker.
    return decode(file).then(function (src) {
      var w = src.width, h = src.height;
      if (!w || !h) throw new Error('could not read');

      function scaled(edge, quality) {
        var scale = Math.min(1, edge / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        // JPEG has no transparency, so anything see-through would come out
        // black. White reads as paper, which is what a scan of a print wants.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(src, 0, 0, cw, ch);
        return toBlob(canvas, quality);
      }

      var keepAsIs = KEEP[type] && file.size <= SEND_AS_IS;
      var wantThumb = Math.max(w, h) > THUMB_EDGE;
      return Promise.all([
        keepAsIs ? Promise.resolve(file) : scaled(MAX_EDGE, 0.88),
        wantThumb ? scaled(THUMB_EDGE, 0.8) : Promise.resolve(null),
      ]).then(function (out) {
        if (src.close) src.close();
        var display = out[0], thumb = out[1];
        if (!display) throw new Error('could not read');
        // Re-encoding a small PNG can come out bigger than the file itself;
        // keep whichever is smaller, as long as the server takes the format.
        if (!keepAsIs && KEEP[type] && file.size <= display.size && file.size <= SERVER_MAX) display = file;
        var original = display !== file && file.size <= ORIGINAL_MAX ? file : null;
        return { display: display, thumb: thumb, original: original, isImage: true };
      });
    });
  }

  /* ---------------------------------------------------------- uploading --- */

  function send(item, caption, by, story) {
    var photoBy = $('photoBy').value.trim();
    var trap = $('website').value;
    var q = trap ? '?website=' + encodeURIComponent(trap) : '';

    if (item.isImage) {
      // A form with up to three parts: the copy the site shows, a small copy
      // for the wall, and the untouched file for the caretaker. The browser
      // sets the multipart boundary itself, so no Content-Type here.
      var t = item.display.type;
      var fd = new FormData();
      fd.append('display', item.display, 'photo.' + (t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : t === 'image/gif' ? 'gif' : 'jpg'));
      if (item.thumb) fd.append('thumb', item.thumb, 'thumb.jpg');
      if (item.original) fd.append('original', item.original, item.original.name || 'original');
      fd.append('caption', caption);
      fd.append('by', by);
      fd.append('photo_by', photoBy);
      if (story) fd.append('story', story);
      return api('/api/photos' + q, { method: 'POST', body: fd });
    }

    // A recording: one file, sent exactly as it is.
    q += (q ? '&' : '?') + 'caption=' + encodeURIComponent(caption) + '&by=' + encodeURIComponent(by);
    if (photoBy) q += '&photo_by=' + encodeURIComponent(photoBy);
    if (item.duration) q += '&duration=' + encodeURIComponent(Math.round(item.duration * 10) / 10);
    return api('/api/photos' + q, {
      method: 'POST',
      headers: { 'Content-Type': item.type },
      body: item.blob,
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
            var size = blob.isAudio ? blob.blob.size : blob.display.size;
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
          $('wallTitle').hidden = false;
          stripRefresh();
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

  /* -------------------------------------------------------------- story --- */

  function storyButton() {
    var has = $('story').value.trim().length >= 2;
    $('sendStory').disabled = !has;
    $('sendStory').textContent = chosen.length === 1 ? 'Add the photo with the story' : 'Add the story';
  }
  $('story').addEventListener('input', storyButton);

  function placeStory(st) {
    stories.push(st);
    stories.sort(storyOrder);
    renderStories();
    var el = findStory(st.id);
    if (el) el.classList.add('fresh');
  }

  $('sendStory').addEventListener('click', function () {
    var text = $('story').value.trim();
    if (text.length < 2) return;
    var msg = $('msg');
    var btn = $('sendStory');
    msg.className = 'msg';

    // A story goes with one photograph or none. More than one, or a
    // recording, is asked to be sorted out rather than guessed at.
    if (chosen.length > 1) {
      msg.className = 'msg bad';
      msg.textContent = 'Choose just one photo to go with a story, or none.';
      return;
    }
    if (chosen.length === 1 && audioType(chosen[0])) {
      msg.className = 'msg bad';
      msg.textContent = 'A story goes with a photo, not a recording. Add the recording to the wall on its own.';
      return;
    }

    btn.disabled = true;
    msg.textContent = 'Adding…';
    var by = $('by').value.trim();
    var work = chosen.length === 1
      ? prepare(chosen[0]).then(function (item) { return send(item, '', by, text); }).then(function (d) { return d && d.photo; })
      : api('/api/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ story: text, by: by, website: $('website').value }),
        }).then(function (d) { return d && d.story; });

    work.then(function (st) {
      if (st) placeStory(st);
      msg.className = 'msg good';
      msg.textContent = 'Added. Thank you.';
      $('story').value = '';
      chosen = [];
      $('files').value = '';
      listChosen();
      setTimeout(function () {
        closeSheet();
        msg.textContent = '';
        // Let them see it: the new frame is at the top of the stories.
        $('stories').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 1400);
    }).catch(function (err) {
      msg.className = 'msg bad';
      msg.textContent = err.message === 'could not read' ? "Couldn't read that photo. Try a different copy of it."
        : (err.message === 'too large' ? 'That photo is too large.' : (err.message || 'Could not add that just now. Please try again.'));
      btn.disabled = false;
    });
  });

  /* -------------------------------------------------------------- strip --- */

  // A row of his photographs under his name that turn over one at a time,
  // like pages. They are the same small copies the wall loads, so the row
  // costs nothing extra to show. It only moves while it is on screen and the
  // tab is being looked at, and it stops moving altogether for anyone who has
  // asked their phone for less motion.

  var STRIP_EVERY = 4200;      // how often one photo turns over
  var STRIP_MIN = 3;           // fewer photographs than this and there is no row
  var slots = [];              // { el, imgs:[a,b], face:0|1, photo }
  var stripTimer = null;
  var stripNext = 0;           // which slot turns over next
  var stripSeen = false;       // is the row on screen right now
  var stripStill = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function stripCount() {
    var w = window.innerWidth;
    return w >= 1100 ? 4 : w >= 700 ? 3 : 2;
  }

  // The row runs through the photographs in the order they were added,
  // starting from the bottom of the wall (the first ones up) and working
  // towards the newest, then around again. Ids only ever go up as photos are
  // added, so "the next one" is simply the smallest id above the last shown,
  // which stays right even as new photos arrive or the caretaker hides some.
  var stripLast = 0;           // id of the photo most recently put in the row

  function stripPick() {
    var next = null;
    for (var i = photos.length - 1; i >= 0; i--) {
      if (photos[i].id > stripLast) { next = photos[i]; break; }
    }
    if (!next) {
      // Reached the newest. If the wall has older pages it has not fetched
      // yet, bring the next one in first so the row can start from the true
      // bottom; otherwise go around again from the oldest that is loaded.
      if (!$('more').hidden) { if (!loading) loadMore(); return null; }
      stripLast = 0;
      next = photos.length ? photos[photos.length - 1] : null;
    }
    if (next) stripLast = next.id;
    return next;
  }

  function stripShow(slot, p, instant) {
    if (!p) return;
    var back = slot.imgs[1 - slot.face];
    var front = slot.imgs[slot.face];
    var prev = slot.photo;
    slot.photo = p;
    slot.el.setAttribute('aria-label', p.caption ? p.caption : 'Photograph');
    back.alt = p.caption || '';
    var swap = function () {
      back.classList.add('show');
      front.classList.remove('show');
      slot.face = 1 - slot.face;
    };
    if (instant) {
      back.src = thumbUrl(p);
      swap();
      return;
    }
    back.classList.remove('show');
    back.onload = function () { back.onload = null; swap(); };
    back.onerror = function () { back.onerror = null; slot.photo = prev; };
    back.src = thumbUrl(p);
  }

  function stripBuild() {
    var row = $('stripRow');
    row.innerHTML = '';
    slots = [];
    var n = stripCount();
    for (var i = 0; i < n; i++) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'slot';
      var imgs = [];
      for (var k = 0; k < 2; k++) {
        var img = document.createElement('img');
        img.decoding = 'async';
        img.alt = '';
        el.appendChild(img);
        imgs.push(img);
      }
      var slot = { el: el, imgs: imgs, face: 0, photo: null };
      (function (slot) {
        slot.el.addEventListener('click', function () {
          var at = slot.photo ? photos.indexOf(slot.photo) : -1;
          if (at >= 0) openLight(at);
        });
      })(slot);
      row.appendChild(el);
      slots.push(slot);
    }
    // Fill left to right with the first photographs that went up.
    stripLast = 0;
    stripNext = 0;
    slots.forEach(function (slot) { stripShow(slot, stripPick(), true); });
  }

  function stripTurn() {
    if (!slots.length || photos.length < STRIP_MIN) return;
    var p = stripPick();
    if (!p) return;                       // an older page is on its way; try next time
    var slot = slots[stripNext % slots.length];
    stripNext++;
    stripShow(slot, p, false);
  }

  function stripRun() {
    var go = stripSeen && !document.hidden && !stripStill && photos.length > slots.length;
    if (go && !stripTimer) stripTimer = setInterval(stripTurn, STRIP_EVERY);
    if (!go && stripTimer) { clearInterval(stripTimer); stripTimer = null; }
  }

  // Called whenever the set of photos changes: first load, an upload, a live
  // update. Shows or hides the row and fills any slot that has nothing in it.
  function stripRefresh() {
    var strip = $('strip');
    if (photos.length < STRIP_MIN) { strip.hidden = true; stripRun(); return; }
    if (!slots.length || slots.length !== stripCount()) stripBuild();
    else slots.forEach(function (slot) { if (!slot.photo) stripShow(slot, stripPick(), true); });
    strip.hidden = false;
    stripRun();
  }

  // A photo the caretaker just hid must not sit in the row.
  function stripDrop(id) {
    slots.forEach(function (slot) {
      if (slot.photo && slot.photo.id === id) { slot.photo = null; stripShow(slot, stripPick(), false); }
    });
    if (photos.length < STRIP_MIN) stripRefresh();
  }

  var resizeWait = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeWait);
    resizeWait = setTimeout(function () {
      if (slots.length && slots.length !== stripCount()) stripRefresh();
    }, 200);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      stripSeen = entries.some(function (e) { return e.isIntersecting; });
      stripRun();
    }, { threshold: 0.2 }).observe($('strip'));
  } else {
    stripSeen = true;
  }
  document.addEventListener('visibilitychange', stripRun);

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
  function findStory(id) { return $('storyList').querySelector('.story[data-id="' + id + '"]'); }

  function emptyText() {
    return recordings.length ? 'No photographs yet.' : 'Nothing here yet. Yours can be the first.';
  }

  function dropItem(id) {
    var t = findTile(id); if (t) t.remove();
    var r = findRec(id);  if (r) r.remove();
    var st = findStory(id); if (st) st.remove();
    photos = photos.filter(function (p) { return p.id !== id; });
    recordings = recordings.filter(function (p) { return p.id !== id; });
    stories = stories.filter(function (p) { return p.id !== id; });
    if (!recordings.length) $('recordings').hidden = true;
    if (!stories.length) $('stories').hidden = true;
    if (!photos.length) { $('state').hidden = false; $('state').textContent = emptyText(); $('wallTitle').hidden = true; }
    stripDrop(id);
  }

  function placeItem(p) {
    if (p.kind === 'story') {
      var have = findStory(p.id);
      if (have) {
        var tx = have.querySelector('p'); if (tx) tx.textContent = p.caption || '';
        for (var si = 0; si < stories.length; si++) if (stories[si].id === p.id) { stories[si] = p; break; }
        return;
      }
      placeStory(p);
      return;
    }
    // Already on the page — this device uploaded it, or an earlier poll
    // delivered it. Refresh the words under it and leave it where it is.
    var existing = p.kind === 'audio' ? findRec(p.id) : findTile(p.id);
    if (existing) {
      var cap = existing.querySelector('.cap');
      if (cap) cap.textContent = p.caption || (p.kind === 'audio' ? 'Untitled recording' : '');
      // The caretaker may have trimmed it: the file behind it changed, so
      // the picture on the wall, in the row and in the opened view follow.
      var list = p.kind === 'audio' ? recordings : photos;
      var at = -1;
      for (var k = 0; k < list.length; k++) if (list[k].id === p.id) { at = k; break; }
      if (at >= 0 && (list[at].image !== p.image || list[at].thumb !== p.thumb)) {
        list[at] = p;
        var img = existing.querySelector('img');
        if (img) { img.style.aspectRatio = ''; img.removeAttribute('width'); img.removeAttribute('height'); img.src = thumbUrl(p); }
        slots.forEach(function (slot) { if (slot.photo && slot.photo.id === p.id) stripShow(slot, p, true); });
      } else if (at >= 0) {
        list[at].caption = p.caption;
        list[at].uploader = p.uploader;
        list[at].photographer = p.photographer;
      }
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
    $('wallTitle').hidden = false;
    stripRefresh();
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
