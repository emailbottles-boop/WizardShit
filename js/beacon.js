// Anonymous pageview tick, for the Control Room's ANALYTICS tab.
//
// One POST per page load with just the path — the worker folds it into a
// fixed set of buckets and keeps a per-day tally, nothing else. Loaded by
// the homepage, the crew pages, and the privacy page (after js/config.js,
// which sets window.WIZ_API_BASE). Does nothing if no backend is configured.
(function () {
  'use strict';
  var API = (window.WIZ_API_BASE || '').trim().replace(/\/+$/, '');
  if (!API) return;
  try {
    fetch(API + '/api/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: location.pathname || '/',
      keepalive: true,
    }).catch(function () {});
  } catch (e) { /* never let counting break the site */ }
})();
