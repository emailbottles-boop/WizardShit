// The shop: merch cards you can add to a cart, the cart itself, checkout, and
// the donate popup. Talks to the Worker's /api/shop/* and /api/donate (see
// api/src/shop.js). Every price shown here is a preview — the Worker re-prices
// from Printful before anyone is charged.
//
// If the Worker says the shop is closed (no Stripe key yet, or no Printful
// token), the cards stay plain links to Printful and the DONATE buttons keep
// their old link, so nothing on the page ever goes dead.
(function () {
  'use strict';

  var API = (window.WIZ_API_BASE || '').trim().replace(/\/+$/, '');
  if (!API) return;

  var CART_KEY = 'wiz_cart_v1';
  var FORM_KEY = 'wiz_checkout_v1';
  var MAX_UNITS = 25;

  var products = [];   // from /api/shop/products
  var shopOpen = false;
  var donateOpen = false;
  var rates = null;    // shipping options for the current cart + address
  var ratesFor = '';   // fingerprint of what `rates` was quoted for
  var busy = false;

  /* ---------------------------------------------------------------- utils --- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function money(cents, currency) {
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(cents);
    var whole = Math.floor(abs / 100);
    var frac = String(abs % 100);
    if (frac.length < 2) frac = '0' + frac;
    var sym = !currency || currency === 'USD' ? '$' : currency + ' ';
    return sign + sym + whole.toLocaleString('en-US') + '.' + frac;
  }
  function imageUrl(v) {
    return /^https?:\/\//i.test(v) ? v : String(v || '').replace(/^\//, '');
  }
  function api(path, body) {
    return fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong (HTTP ' + res.status + ')');
        return data;
      });
    });
  }
  function go(screenId) {
    var s = document.getElementById(screenId);
    if (s && typeof window.showScreen === 'function') window.showScreen(s);
  }

  /* ----------------------------------------------------------------- cart --- */

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      var lines = Array.isArray(raw.lines) ? raw.lines : [];
      var out = [];
      var budget = MAX_UNITS;
      lines.forEach(function (l) {
        var qty = Math.min(Math.max(1, Math.floor(Number(l.qty) || 1)), budget);
        if (qty < 1 || !l.variant_id || !l.product_id) return;
        budget -= qty;
        out.push({
          product_id: Number(l.product_id),
          variant_id: Number(l.variant_id),
          title: String(l.title || ''),
          option: String(l.option || ''),
          price: Number(l.price) || 0,
          currency: String(l.currency || 'USD'),
          image: String(l.image || ''),
          qty: qty,
        });
      });
      return out;
    } catch (e) {
      return [];
    }
  }
  var cart = loadCart();

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify({ lines: cart })); } catch (e) { /* private mode */ }
    updateCount();
  }
  function units(except) {
    return cart.reduce(function (n, l) { return l.variant_id === except ? n : n + l.qty; }, 0);
  }
  function addLine(product, variant, qty) {
    var existing = cart.filter(function (l) { return l.variant_id === variant.id; })[0];
    var allowance = MAX_UNITS - units(variant.id);
    var want = (existing ? existing.qty : 0) + qty;
    var clamped = Math.max(0, Math.min(want, allowance));
    if (clamped === 0) return false;
    if (existing) {
      existing.qty = clamped;
    } else {
      cart.push({
        product_id: product.printful_id,
        variant_id: variant.id,
        title: product.title,
        option: [variant.color, variant.size].filter(Boolean).join(' / '),
        price: variant.price,
        currency: product.currency,
        image: variant.image || imageUrl(product.image),
        qty: clamped,
      });
    }
    rates = null;
    saveCart();
    return true;
  }
  function setQty(variantId, qty) {
    cart.forEach(function (l) {
      if (l.variant_id !== variantId) return;
      var allowance = MAX_UNITS - units(variantId);
      l.qty = Math.max(1, Math.min(qty, allowance));
    });
    rates = null;
    saveCart();
  }
  function removeLine(variantId) {
    cart = cart.filter(function (l) { return l.variant_id !== variantId; });
    rates = null;
    saveCart();
  }
  function subtotal() {
    return cart.reduce(function (n, l) { return n + l.price * l.qty; }, 0);
  }
  function updateCount() {
    var n = units();
    var label = n ? String(n) : '';
    // Every cart button (the merch header one and the floating one) carries a .count span.
    document.querySelectorAll('.cart-nav .count').forEach(function (el) { el.textContent = label; });
    document.querySelectorAll('.cart-nav').forEach(function (b) { b.classList.toggle('has-items', n > 0); });
  }

  /* ---------------------------------------------------------- merch cards --- */

  function pickVariant(product, color, size) {
    var hits = product.variants.filter(function (v) {
      return (!color || v.color === color) && (!size || v.size === size);
    });
    return hits[0] || null;
  }

  function renderCards() {
    var grid = document.querySelector('#merch .merch-grid');
    if (!grid || !products.length) return;
    grid.dataset.shop = '1';
    var frag = document.createDocumentFragment();
    products.forEach(function (p) {
      var buyable = shopOpen && p.variants && p.variants.length > 0;
      // Old-style tile: just the picture and the name. A buyable tile opens its own
      // product page; when the shop is closed it stays a plain link to Printful.
      var card = el(buyable ? 'div' : 'a', 'merch-feature' + (p.row_break ? ' merch-break' : '') + (buyable ? ' buyable' : ''));
      if (buyable) {
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.setAttribute('aria-label', 'Open ' + p.title);
        card.addEventListener('click', function () { openProduct(p); });
        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); openProduct(p); }
        });
      } else {
        card.href = p.url;
        card.target = '_blank';
        card.rel = 'noopener';
      }
      var thumb = el('div', 'merch-thumb' + (p.sticker ? ' sticker' : ''));
      var img = el('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = imageUrl(p.image);
      img.alt = p.title;
      thumb.appendChild(img);
      card.appendChild(thumb);
      card.appendChild(el('div', 'merch-title', p.title));
      frag.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
  }

  /* --------------------------------------------------------- product page --- */

  function variantImageForColor(p, color) {
    var vs = p.variants.filter(function (v) { return !color || v.color === color; });
    for (var i = 0; i < vs.length; i++) if (vs[i].image) return vs[i].image;
    return imageUrl(p.image);
  }
  function priceRange(p) {
    return p.price_min === p.price_max
      ? money(p.price_min, p.currency)
      : money(p.price_min, p.currency) + ' – ' + money(p.price_max, p.currency);
  }

  // Build a Printful-style detail page for one product: big picture, colour
  // swatches, size buttons, a quantity stepper and ADD TO CART.
  function openProduct(p) {
    var host = document.getElementById('productDetail');
    if (!host) return;
    host.innerHTML = '';
    var chosen = { color: p.colors.length === 1 ? p.colors[0] : '', size: p.sizes.length === 1 ? p.sizes[0] : '' };
    var qty = 1;

    // Left column: the big picture, which follows the chosen colour.
    var media = el('div', 'product-media');
    var hero = el('div', 'product-hero' + (p.sticker ? ' sticker' : ''));
    var heroImg = el('img');
    heroImg.alt = p.title;
    hero.appendChild(heroImg);
    media.appendChild(hero);

    // Right column: name, price, colour, size, quantity, add.
    var info = el('div', 'product-info');
    info.appendChild(el('h2', 'product-name', p.title));
    var priceEl = el('div', 'product-price');
    info.appendChild(priceEl);

    var swatches = [];
    var chosenName = null;
    if (p.colors.length > 1) {
      var colourLabel = el('div', 'product-label', 'COLOUR');
      chosenName = el('span', 'product-chosen', '');
      colourLabel.appendChild(chosenName);
      info.appendChild(colourLabel);
      var swWrap = el('div', 'product-swatches');
      p.colors.forEach(function (c) {
        var b = el('button', 'product-swatch');
        b.type = 'button';
        b.title = c;
        b.setAttribute('aria-label', c);
        b.dataset.color = c;
        var im = el('img'); im.src = variantImageForColor(p, c); im.alt = c;
        b.appendChild(im);
        b.addEventListener('click', function () { chosen.color = c; refresh(); });
        swatches.push(b);
        swWrap.appendChild(b);
      });
      info.appendChild(swWrap);
    }

    var sizes = [];
    if (p.sizes.length > 1) {
      info.appendChild(el('div', 'product-label', 'SIZE'));
      var szWrap = el('div', 'product-sizes');
      p.sizes.forEach(function (s) {
        var b = el('button', 'product-size', s);
        b.type = 'button';
        b.dataset.size = s;
        b.addEventListener('click', function () { chosen.size = s; refresh(); });
        sizes.push(b);
        szWrap.appendChild(b);
      });
      info.appendChild(szWrap);
    }

    info.appendChild(el('div', 'product-label', 'QUANTITY'));
    var qtyWrap = el('div', 'product-qty');
    var minus = el('button', 'qty-btn', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Fewer');
    var qtyVal = el('span', 'qty-val', '1');
    var plus = el('button', 'qty-btn', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'More');
    function setQtyVal(n) { qty = Math.max(1, Math.min(n, MAX_UNITS)); qtyVal.textContent = String(qty); }
    minus.addEventListener('click', function () { setQtyVal(qty - 1); });
    plus.addEventListener('click', function () { setQtyVal(qty + 1); });
    qtyWrap.appendChild(minus); qtyWrap.appendChild(qtyVal); qtyWrap.appendChild(plus);
    info.appendChild(qtyWrap);

    var addB = el('button', 'product-add', 'ADD TO CART');
    addB.type = 'button';
    info.appendChild(addB);
    info.appendChild(el('div', 'shop-note', 'Printed to order. You pay securely on Stripe, and it ships once your payment settles.'));

    function refresh() {
      swatches.forEach(function (b) { b.classList.toggle('selected', b.dataset.color === chosen.color); });
      sizes.forEach(function (b) { b.classList.toggle('selected', b.dataset.size === chosen.size); });
      if (chosenName) chosenName.textContent = chosen.color ? ': ' + chosen.color : '';
      var v = pickVariant(p, chosen.color, chosen.size);
      var needsColor = p.colors.length > 1 && !chosen.color;
      var needsSize = p.sizes.length > 1 && !chosen.size;
      heroImg.src = (v && v.image) ? v.image : variantImageForColor(p, chosen.color);
      if (v && !needsColor && !needsSize) {
        priceEl.textContent = money(v.price, p.currency);
        addB.disabled = false;
        addB.textContent = 'ADD TO CART';
      } else if (needsColor || needsSize) {
        priceEl.textContent = priceRange(p);
        addB.disabled = true;
        addB.textContent = needsColor ? 'PICK A COLOUR' : 'PICK A SIZE';
      } else {
        priceEl.textContent = '';
        addB.disabled = true;
        addB.textContent = 'SOLD OUT';
      }
    }

    addB.addEventListener('click', function () {
      if (addB.disabled) return;
      var v = pickVariant(p, chosen.color, chosen.size);
      if (!v) return;
      if (addLine(p, v, qty)) {
        addB.textContent = 'ADDED ✓';
        setTimeout(function () { addB.textContent = 'ADD TO CART'; }, 1400);
      } else {
        addB.textContent = 'CART IS FULL';
        setTimeout(refresh, 1600);
      }
    });

    host.appendChild(media);
    host.appendChild(info);
    refresh();
    go('product');
  }

  /* ----------------------------------------------------------- cart screen --- */

  var COUNTRIES = [
    ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'],
    ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['NL', 'Netherlands'], ['BE', 'Belgium'], ['ES', 'Spain'],
    ['PT', 'Portugal'], ['IT', 'Italy'], ['AT', 'Austria'], ['CH', 'Switzerland'], ['SE', 'Sweden'], ['NO', 'Norway'],
    ['DK', 'Denmark'], ['FI', 'Finland'], ['PL', 'Poland'], ['CZ', 'Czechia'], ['HU', 'Hungary'], ['GR', 'Greece'],
    ['RO', 'Romania'], ['BG', 'Bulgaria'], ['HR', 'Croatia'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['LT', 'Lithuania'],
    ['LV', 'Latvia'], ['EE', 'Estonia'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['AR', 'Argentina'], ['CL', 'Chile'],
    ['CO', 'Colombia'], ['JP', 'Japan'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['HK', 'Hong Kong'], ['TW', 'Taiwan'],
    ['PH', 'Philippines'], ['MY', 'Malaysia'], ['TH', 'Thailand'], ['IN', 'India'], ['AE', 'United Arab Emirates'],
    ['IL', 'Israel'], ['ZA', 'South Africa'], ['TR', 'Türkiye'],
  ];

  function loadForm() {
    try { return JSON.parse(localStorage.getItem(FORM_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function readForm() {
    var f = document.getElementById('checkoutForm');
    var out = {};
    ['name', 'email', 'address1', 'address2', 'city', 'state_code', 'zip', 'country_code', 'phone'].forEach(function (k) {
      var i = f.elements[k];
      out[k] = i ? String(i.value || '').trim() : '';
    });
    try { localStorage.setItem(FORM_KEY, JSON.stringify(out)); } catch (e) { /* fine */ }
    return out;
  }
  function fingerprint(recipient) {
    return JSON.stringify([recipient.address1, recipient.city, recipient.state_code, recipient.zip, recipient.country_code, cart.map(function (l) { return [l.variant_id, l.qty]; })]);
  }
  function setMsg(text, isError) {
    var m = document.getElementById('checkoutMsg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'shop-msg' + (isError ? ' error' : '');
    // .shop-msg is display:none by default, so '' would keep it hidden — force it shown.
    m.style.display = text ? 'block' : 'none';
  }

  function renderCart() {
    var linesEl = document.getElementById('cartLines');
    var emptyEl = document.getElementById('cartEmpty');
    var totalsEl = document.getElementById('cartTotals');
    var checkout = document.getElementById('checkoutBox');
    if (!linesEl) return;
    linesEl.innerHTML = '';
    var has = cart.length > 0;
    emptyEl.style.display = has ? 'none' : '';
    totalsEl.style.display = has ? '' : 'none';
    checkout.style.display = has && shopOpen ? '' : 'none';
    if (!has) return;

    cart.forEach(function (l) {
      var row = el('div', 'cart-line');
      var img = el('img');
      img.src = imageUrl(l.image);
      img.alt = l.title;
      row.appendChild(img);
      var info = el('div', 'cart-info');
      info.appendChild(el('div', 'cart-title', l.title));
      if (l.option) info.appendChild(el('div', 'cart-option', l.option));
      info.appendChild(el('div', 'cart-each', money(l.price, l.currency) + ' each'));
      row.appendChild(info);
      var right = el('div', 'cart-right');
      var allowance = MAX_UNITS - units(l.variant_id);
      var qtyWrap = el('div', 'product-qty cart-qtystep');
      var minus = el('button', 'qty-btn', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Fewer ' + l.title); minus.disabled = l.qty <= 1;
      var qtyVal = el('span', 'qty-val', String(l.qty));
      var plus = el('button', 'qty-btn', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'More ' + l.title); plus.disabled = l.qty >= allowance;
      minus.addEventListener('click', function () { setQty(l.variant_id, l.qty - 1); renderCart(); });
      plus.addEventListener('click', function () { setQty(l.variant_id, l.qty + 1); renderCart(); });
      qtyWrap.appendChild(minus); qtyWrap.appendChild(qtyVal); qtyWrap.appendChild(plus);
      right.appendChild(qtyWrap);
      right.appendChild(el('div', 'cart-linetotal', money(l.price * l.qty, l.currency)));
      var rm = el('button', 'cart-remove', 'REMOVE');
      rm.type = 'button';
      rm.addEventListener('click', function () { removeLine(l.variant_id); renderCart(); });
      right.appendChild(rm);
      row.appendChild(right);
      linesEl.appendChild(row);
    });

    var currency = cart[0].currency;
    document.getElementById('cartSubtotal').textContent = money(subtotal(), currency);
    var shipEl = document.getElementById('cartShipping');
    var totalEl = document.getElementById('cartTotal');
    var picked = rates && rates.filter(function (r) { return r.picked; })[0];
    shipEl.textContent = picked ? money(picked.rate, currency) : 'quoted at checkout';
    totalEl.textContent = picked ? money(subtotal() + picked.rate, currency) : money(subtotal(), currency) + ' + shipping';
    document.getElementById('cartCap').textContent = units() >= MAX_UNITS ? 'That is the most one order can hold (' + MAX_UNITS + '). For more, email us.' : '';
    renderRates();
    if (!shopOpen) setMsg('Checkout is not open yet — the items above are still available on our Printful store.', false);
  }

  function renderRates() {
    var box = document.getElementById('shipOptions');
    var pay = document.getElementById('payBtn');
    box.innerHTML = '';
    if (!rates) {
      // Nothing quoted yet: the button's job is to ask for the options.
      pay.disabled = busy;
      pay.textContent = 'GET SHIPPING OPTIONS';
      return;
    }
    if (!rates.length) {
      box.appendChild(el('div', 'shop-msg error', 'We cannot ship this order to that address.'));
      pay.disabled = true;
      pay.textContent = 'PAY WITH CARD';
      return;
    }
    rates.forEach(function (r, i) {
      var lab = el('label', 'ship-option' + (r.picked ? ' picked' : ''));
      var input = el('input');
      input.type = 'radio';
      input.name = 'shipping';
      input.value = r.id;
      input.checked = !!r.picked;
      input.addEventListener('change', function () {
        rates.forEach(function (x, j) { x.picked = i === j; });
        renderCart();
      });
      lab.appendChild(input);
      var text = r.name + ' — ' + money(r.rate, r.currency);
      if (r.min_days && r.max_days) text += ' · ' + r.min_days + '–' + r.max_days + ' days';
      lab.appendChild(el('span', '', text));
      box.appendChild(lab);
    });
    pay.disabled = !rates.some(function (r) { return r.picked; });
    pay.textContent = 'PAY WITH CARD';
  }

  function quoteShipping() {
    var recipient = readForm();
    var fp = fingerprint(recipient);
    if (rates && ratesFor === fp) return Promise.resolve();
    setMsg('');
    busy = true;
    document.getElementById('payBtn').disabled = true;
    return api('/api/shop/shipping', {
      recipient: recipient,
      items: cart.map(function (l) { return { product_id: l.product_id, variant_id: l.variant_id, quantity: l.qty }; }),
    }).then(function (d) {
      rates = (d.rates || []).map(function (r, i) { r.picked = i === 0; return r; });
      // cheapest first, and picked
      rates.sort(function (a, b) { return a.rate - b.rate; });
      rates.forEach(function (r, i) { r.picked = i === 0; });
      ratesFor = fp;
    }).catch(function (e) {
      rates = null;
      setMsg(e.message, true);
    }).then(function () {
      busy = false;
      renderCart();
    });
  }

  function pay() {
    if (busy) return;
    var recipient = readForm();
    var picked = rates && rates.filter(function (r) { return r.picked; })[0];
    if (!picked || ratesFor !== fingerprint(recipient)) { quoteShipping(); return; }
    var btn = document.getElementById('payBtn');
    busy = true;
    btn.disabled = true;
    btn.textContent = 'ONE MOMENT…';
    setMsg('');
    api('/api/shop/orders', {
      recipient: recipient,
      items: cart.map(function (l) { return { product_id: l.product_id, variant_id: l.variant_id, quantity: l.qty }; }),
      shipping_id: picked.id,
    }).then(function (d) {
      if (!d.url) throw new Error('No payment page came back.');
      location.href = d.url;
    }).catch(function (e) {
      busy = false;
      setMsg(e.message, true);
      btn.disabled = false;
      btn.textContent = 'PAY WITH CARD';
      if (/no longer|sold out|cart/i.test(e.message)) { rates = null; }
    });
  }

  function wireCartScreen() {
    var f = document.getElementById('checkoutForm');
    if (!f) return;
    var country = f.elements.country_code;
    COUNTRIES.forEach(function (c) {
      var o = el('option', '', c[1]);
      o.value = c[0];
      country.appendChild(o);
    });
    var saved = loadForm();
    Object.keys(saved).forEach(function (k) { if (f.elements[k] && saved[k]) f.elements[k].value = saved[k]; });
    if (!country.value) country.value = 'US';

    // Address fields changing means the quote is stale.
    ['address1', 'city', 'state_code', 'zip', 'country_code'].forEach(function (k) {
      f.elements[k].addEventListener('change', function () { rates = null; renderRates(); });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!f.reportValidity()) return;
      if (!rates) quoteShipping();
      else pay();
    });
  }

  /* ---------------------------------------------------------------- donate --- */

  var PRESETS = [500, 1000, 2500, 5000, 10000];

  function wireDonate() {
    var modal = document.getElementById('donateModal');
    if (!modal) return;
    var amountBox = document.getElementById('donateAmounts');
    var custom = document.getElementById('donateCustom');
    var giveB = document.getElementById('donateGive');
    var msg = document.getElementById('donateMsg');
    var chosen = 2500;

    function paint() {
      amountBox.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('picked', Number(b.dataset.cents) === chosen);
      });
      giveB.textContent = 'GIVE ' + money(chosen);
    }
    PRESETS.forEach(function (c) {
      var b = el('button', 'donate-amt', money(c).replace(/\.00$/, ''));
      b.type = 'button';
      b.dataset.cents = String(c);
      b.addEventListener('click', function () { chosen = c; custom.value = ''; paint(); });
      amountBox.appendChild(b);
    });
    custom.addEventListener('input', function () {
      var dollars = Number(custom.value);
      if (dollars >= 1) { chosen = Math.round(dollars * 100); paint(); }
    });
    paint();

    function open() {
      modal.hidden = false;
      document.body.classList.add('donate-open');
      msg.textContent = '';
      setTimeout(function () { var first = amountBox.querySelector('button'); if (first) first.focus(); }, 50);
    }
    function close() {
      modal.hidden = true;
      document.body.classList.remove('donate-open');
    }
    document.getElementById('donateClose').addEventListener('click', close);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) close(); });

    giveB.addEventListener('click', function () {
      if (busy) return;
      if (chosen < 100 || chosen > 1000000) { msg.textContent = 'Donations are from $1 to $10,000.'; return; }
      busy = true;
      giveB.disabled = true;
      msg.textContent = '';
      api('/api/donate', {
        amount: chosen,
        name: document.getElementById('donateName').value,
        message: document.getElementById('donateNote').value,
        public: document.getElementById('donatePublic').checked,
      }).then(function (d) {
        if (!d.url) throw new Error('No payment page came back.');
        location.href = d.url;
      }).catch(function (e) {
        busy = false;
        giveB.disabled = false;
        msg.textContent = e.message;
      });
    });

    // The DONATE buttons: with Stripe on, open the popup instead of leaving
    // for the old donation page. Without it, they stay exactly as they were.
    document.querySelectorAll('.donate-btn').forEach(function (a) {
      if (!donateOpen) return;
      a.innerHTML = '';
      a.appendChild(el('span', 'donate-heart', '♥'));
      a.appendChild(document.createTextNode(' DONATE'));
      a.addEventListener('click', function (e) { e.preventDefault(); open(); });
    });
  }

  /* ---------------------------------------------------------- arrivals --- */

  function thanks(title, text) {
    var t = document.getElementById('thanksTitle');
    var p = document.getElementById('thanksText');
    if (t) t.textContent = title;
    if (p) p.textContent = text;
    go('thanks');
  }

  function handleArrival() {
    var params = new URLSearchParams(location.search);
    var order = params.get('order');
    var donated = params.get('donated');
    var screen = params.get('screen');
    if (!order && !donated && !screen) return;
    history.replaceState(null, '', '/');
    if (order) {
      cart = [];
      rates = null;
      saveCart();
      thanks('THANK YOU', 'Order ' + order + ' is paid. It goes to print once your payment settles, usually within a few business days, and a receipt is on its way to your email.');
    } else if (donated) {
      thanks('THANK YOU', 'Your donation went through. You are keeping the wizards animated.');
    } else if (screen === 'cart') {
      go('cart');
    }
  }

  /* ----------------------------------------------------------------- boot --- */

  updateCount();
  wireCartScreen();
  document.querySelectorAll('.cart-nav').forEach(function (b) {
    b.addEventListener('click', function () { renderCart(); go('cart'); });
  });
  var cartScreen = document.getElementById('cart');
  if (cartScreen) {
    // Re-render whenever the cart screen is shown, so it is always current.
    new MutationObserver(function () { if (cartScreen.classList.contains('active')) renderCart(); }).observe(cartScreen, { attributes: true, attributeFilter: ['class'] });
  }

  api('/api/shop/products')
    .then(function (d) {
      shopOpen = !!d.shop;
      donateOpen = !!d.donate;
      products = Array.isArray(d.products) ? d.products : [];
      if (shopOpen) renderCards();
      wireDonate();
      renderCart();
      handleArrival();
    })
    .catch(function (e) {
      console.warn('[wiz shop] shop unavailable, keeping links:', e);
      wireDonate();
      handleArrival();
    });
})();
