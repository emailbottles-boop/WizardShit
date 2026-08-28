// "Message the wizards" box.
//
// Nothing is added to the page until a visitor starts typing their email
// into the existing signup field — then an optional message box unfolds
// right under the form. The email signup itself still goes to Formspree,
// untouched; the message lands in the Control Room's MESSAGES tab.
// If no backend is configured, this script does nothing at all.
(function () {
  'use strict';

  var API = (window.WIZ_API_BASE || '').trim().replace(/\/+$/, '');
  if (!API) return;

  var emailInput = document.getElementById('emailInput');
  var emailForm = document.getElementById('emailForm');
  if (!emailInput || !emailForm) return;

  var css =
    '#wizMsgBox{overflow:hidden;max-height:0;opacity:0;transition:max-height .35s ease,opacity .35s ease,margin .35s ease;' +
    'margin:0 auto;width:min(340px,90vw);text-align:left}' +
    '#wizMsgBox.open{max-height:260px;opacity:1;margin-top:0.9rem}' +
    '#wizMsgBox .inner{background:rgba(20,6,40,.85);border:2px solid rgba(180,80,255,.5);border-radius:14px;' +
    'padding:.9rem;box-shadow:0 0 30px rgba(140,40,255,.3)}' +
    '#wizMsgBox h4{color:rgb(255,210,60);font-size:.72rem;letter-spacing:.14em;margin:0 0 .55rem;text-transform:uppercase}' +
    '#wizMsgBox textarea{width:100%;box-sizing:border-box;background:rgba(0,0,0,.35);border:1.5px solid rgba(180,80,255,.35);' +
    'border-radius:8px;color:#fff;padding:.5rem .65rem;font-size:.85rem;font-family:inherit;min-height:72px;resize:vertical}' +
    '#wizMsgBox textarea:focus{outline:none;border-color:rgb(255,210,60)}' +
    '#wizMsgSend{margin-top:.55rem;width:100%;border:none;border-radius:10px;padding:.6rem;cursor:pointer;font-weight:800;' +
    'letter-spacing:.08em;background:linear-gradient(160deg,rgb(255,210,60) 0%,rgb(255,170,30) 100%);color:#2a0550}' +
    '#wizMsgSend:disabled{opacity:.5;cursor:wait}' +
    '#wizMsgDone{display:none;color:#fff;font-size:.85rem;text-align:center;padding:.6rem 0}' +
    '.wiz-msg-hp{position:absolute;left:-5000px;opacity:0;height:1px;overflow:hidden}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var box = null;
  var sent = false;

  function buildBox() {
    box = document.createElement('div');
    box.id = 'wizMsgBox';
    box.innerHTML =
      '<div class="inner">' +
      '<h4>Wanna say something to the wizards too? (optional)</h4>' +
      '<div class="wiz-msg-hp"><input type="text" id="wizMsgHp" tabindex="-1" autocomplete="off"></div>' +
      '<textarea id="wizMsgText" placeholder="say the magic words…" maxlength="4000"></textarea>' +
      '<button id="wizMsgSend" type="button">SEND MESSAGE ✨</button>' +
      '<div id="wizMsgDone">🧙 Message received. The wizards thank you.</div>' +
      '</div>';
    emailForm.insertAdjacentElement('afterend', box);

    document.getElementById('wizMsgSend').addEventListener('click', function () {
      var text = document.getElementById('wizMsgText').value.trim();
      if (!text) return;
      var send = document.getElementById('wizMsgSend');
      send.disabled = true;
      fetch(API + '/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '',
          email: emailInput.value,
          website: document.getElementById('wizMsgHp').value,
          message: text,
        }),
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, d: d }; }); })
        .then(function (out) {
          if (!out.ok) throw new Error(out.d.error || 'Could not send');
          sent = true;
          document.getElementById('wizMsgText').style.display = 'none';
          send.style.display = 'none';
          document.getElementById('wizMsgDone').style.display = 'block';
          setTimeout(function () { box.classList.remove('open'); }, 2600);
        })
        .catch(function (err) {
          send.disabled = false;
          alert('The owl got lost: ' + err.message);
        });
    });
  }

  emailInput.addEventListener('input', function () {
    if (sent) return;
    var typing = emailInput.value.trim().length > 0;
    if (typing && !box) buildBox();
    if (box) {
      var hasDraft = (document.getElementById('wizMsgText') || {}).value;
      box.classList.toggle('open', typing || !!hasDraft);
    }
  });
})();
