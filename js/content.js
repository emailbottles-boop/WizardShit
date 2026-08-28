// Live content loader.
//
// Fetches merch, credits, and donators from the backend (see js/config.js)
// and swaps them into the page. The hardcoded HTML renders instantly and
// stays up as the fallback whenever the API is unset or unreachable.
(function () {
  'use strict';

  var API = (window.WIZ_API_BASE || '').trim().replace(/\/+$/, '');
  if (!API) return;

  // one anonymous pageview tick per visit, for the Control Room's ANALYTICS tab
  try {
    fetch(API + '/api/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: location.pathname || '/',
      keepalive: true,
    }).catch(function () {});
  } catch (e) { /* never let counting break the site */ }

  fetch(API + '/api/content')
    .then(function (res) {
      if (!res.ok) throw new Error('content API HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      try { if (Array.isArray(data.merch)) renderMerch(data.merch); } catch (e) { warn('merch', e); }
      try { if (Array.isArray(data.credits)) renderCredits(data.credits); } catch (e) { warn('credits', e); }
      try { if (Array.isArray(data.donators)) renderDonators(data.donators); } catch (e) { warn('donators', e); }
    })
    .catch(function (e) { warn('fetch', e); });

  function warn(what, e) {
    // Keep the static fallback quietly; log for debugging.
    console.warn('[wiz content] keeping built-in ' + what + ':', e);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function imageUrl(v) {
    return /^https?:\/\//i.test(v) ? v : v.replace(/^\//, '');
  }

  function renderMerch(items) {
    var grid = document.querySelector('#merch .merch-grid');
    if (!grid || !items.length) return;
    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
      var a = el('a', 'merch-feature' + (item.row_break ? ' merch-break' : ''));
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener';
      var thumb = el('div', 'merch-thumb' + (item.sticker ? ' sticker' : ''));
      var img = el('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = imageUrl(item.image);
      img.alt = item.title;
      thumb.appendChild(img);
      a.appendChild(thumb);
      a.appendChild(el('div', 'merch-title', item.title));
      frag.appendChild(a);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
  }

  function renderCredits(items) {
    var container = document.querySelector('#credits .credits-cards-container');
    if (!container || !items.length) return;
    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
      var card = el('div', 'bio-card');
      var inner = el('div', 'bio-card-inner');

      var front = el('div', 'bio-card-front');
      var photo = el('div', 'bio-photo');
      if (item.photo) {
        photo.style.cssText =
          'background-image:url("' + imageUrl(item.photo).replace(/"/g, '%22') + '");' +
          'background-size:cover;background-position:center;' +
          (item.photo_css || '');
      }
      front.appendChild(photo);
      front.appendChild(el('div', 'bio-name', item.name));
      var role = el('div', 'bio-role');
      String(item.roles || '').split('\n').forEach(function (line, i) {
        if (i > 0) role.appendChild(document.createElement('br'));
        role.appendChild(document.createTextNode(line));
      });
      front.appendChild(role);
      inner.appendChild(front);

      if (item.back_text) {
        var back = el('div', 'bio-card-back');
        if (item.back_show_name) back.appendChild(el('div', 'bio-name', item.name));
        var p = el('p', '', item.back_quote ? '"' + item.back_text + '"' : item.back_text);
        if (item.back_quote) p.style.fontStyle = 'italic';
        back.appendChild(p);
        inner.appendChild(back);
        // Same behaviors the page wires up at load for the built-in cards:
        back.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
        card.addEventListener('click', function () { card.classList.toggle('flipped'); });
      } else {
        card.style.cursor = 'default';
      }

      card.appendChild(inner);
      frag.appendChild(card);
    });
    container.innerHTML = '';
    container.appendChild(frag);
  }

  function renderDonators(items) {
    var list = document.getElementById('donatorsList');
    if (!list || !items.length) return;
    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
      frag.appendChild(el('div', 'donator-name', item.name));
    });
    list.innerHTML = '';
    list.appendChild(frag);
  }
})();
