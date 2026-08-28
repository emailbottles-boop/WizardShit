// Floating "message the wizards" bubble.
//
// Collapsed to a small round button until tapped, so it costs no screen
// space. Messages POST to the backend (see js/config.js) and land in the
// Control Room's MESSAGES tab. If no backend is configured, the bubble
// simply doesn't appear.
(function () {
  'use strict';

  var API = (window.WIZ_API_BASE || '').trim().replace(/\/+$/, '');
  if (!API) return;

  var css =
    '#wizMsgBtn{position:fixed;right:16px;bottom:16px;z-index:90;width:54px;height:54px;' +
    'border-radius:50%;border:2px solid rgba(255,210,60,.7);cursor:pointer;font-size:1.35rem;' +
    'background:rgba(20,6,40,.92);color:rgb(255,210,60);box-shadow:0 0 22px rgba(140,40,255,.5);' +
    'display:flex;align-items:center;justify-content:center;transition:transform .15s ease;padding:0}' +
    '#wizMsgBtn:hover{transform:scale(1.1)}' +
    '#wizMsgBox{position:fixed;right:16px;bottom:82px;z-index:91;width:min(320px,calc(100vw - 32px));' +
    'background:#140628;border:2px solid rgba(180,80,255,.55);border-radius:16px;padding:1.1rem;' +
    'box-shadow:0 0 45px rgba(140,40,255,.45);display:none;font-family:system-ui,sans-serif}' +
    '#wizMsgBox.open{display:block}' +
    '#wizMsgBox h3{color:rgb(255,210,60);font-size:.9rem;letter-spacing:.12em;margin:0 0 .7rem;text-transform:uppercase}' +
    '#wizMsgBox input,#wizMsgBox textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.35);' +
    'border:1.5px solid rgba(180,80,255,.35);border-radius:8px;color:#fff;padding:.5rem .65rem;' +
    'font-size:.85rem;font-family:inherit;margin-bottom:.55rem}' +
    '#wizMsgBox input:focus,#wizMsgBox textarea:focus{outline:none;border-color:rgb(255,210,60)}' +
    '#wizMsgBox textarea{min-height:84px;resize:vertical}' +
    '#wizMsgSend{width:100%;border:none;border-radius:10px;padding:.65rem;cursor:pointer;font-weight:800;' +
    'letter-spacing:.08em;background:linear-gradient(160deg,rgb(255,210,60) 0%,rgb(255,170,30) 100%);color:#2a0550}' +
    '#wizMsgSend:disabled{opacity:.5;cursor:wait}' +
    '#wizMsgDone{display:none;color:#fff;font-size:.85rem;text-align:center;padding:.8rem 0}' +
    '.wiz-msg-hp{position:absolute;left:-5000px;opacity:0;height:1px;overflow:hidden}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'wizMsgBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Message the wizards');
  btn.textContent = '✉';

  var box = document.createElement('div');
  box.id = 'wizMsgBox';
  box.innerHTML =
    '<h3>Message the wizards</h3>' +
    '<form id="wizMsgForm">' +
    '<input type="text" name="name" placeholder="name (optional)" maxlength="200">' +
    '<input type="email" name="email" placeholder="email, if you want a reply (optional)" maxlength="200">' +
    '<div class="wiz-msg-hp"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
    '<textarea name="message" placeholder="say the magic words…" maxlength="4000" required></textarea>' +
    '<button id="wizMsgSend" type="submit">SEND ✨</button>' +
    '</form>' +
    '<div id="wizMsgDone">🧙 Message received. The wizards thank you.</div>';

  document.body.appendChild(box);
  document.body.appendChild(btn);

  btn.addEventListener('click', function () {
    box.classList.toggle('open');
    if (box.classList.contains('open')) {
      var ta = box.querySelector('textarea');
      if (ta) ta.focus();
    }
  });

  box.querySelector('#wizMsgForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var send = document.getElementById('wizMsgSend');
    send.disabled = true;
    fetch(API + '/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value,
        email: form.email.value,
        website: form.website.value,
        message: form.message.value,
      }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
      .then(function (out) {
        if (!out.ok) throw new Error(out.d.error || 'Could not send');
        form.style.display = 'none';
        document.getElementById('wizMsgDone').style.display = 'block';
        setTimeout(function () {
          box.classList.remove('open');
          form.reset();
          form.style.display = '';
          send.disabled = false;
          document.getElementById('wizMsgDone').style.display = 'none';
        }, 2600);
      })
      .catch(function (err) {
        send.disabled = false;
        alert('The owl got lost: ' + err.message);
      });
  });
})();
