// sheetsSync.js — the one place that talks to Google Sheets.
//
// KuBi still runs from a local file with no server. This module is the
// only part that reaches the network, and it is entirely optional: leave
// CONFIG blank and the app behaves exactly as it always has, with history
// held in memory for the session.
//
// Transport is a plain fetch to an Apps Script web app, the same shape
// the clinic's other tools use: GET with a query string to read, POST
// with text/plain to write. text/plain matters — it keeps the request
// "simple" in CORS terms, so the browser sends it without a preflight,
// which an Apps Script /exec endpoint cannot answer.
//
// Nothing here throws into the app. Every failure resolves to a value the
// caller can act on, because a clinic with no internet must still open.

window.KuBi = window.KuBi || {};

// ---------------------------------------------------------------------
// CONFIG — the clinic fills these two in after deploying KuBi_History.gs.
// url:   the web app's /exec URL
// token: the same string set as TOKEN in the script
// Leave both empty to run without any sync at all.
// ---------------------------------------------------------------------
window.KuBi.SHEETS_CONFIG = {
  url: '',
  token: '',
};

window.KuBi.historySync = (function () {
  const TIMEOUT_MS = 8000;

  function config() { return window.KuBi.SHEETS_CONFIG || { url: '', token: '' }; }

  function isConfigured() {
    const c = config();
    return !!(c.url && typeof window.fetch === 'function');
  }

  // Resolves to null on any failure — never rejects, never throws.
  function request(opts) {
    if (!isConfigured()) return Promise.resolve(null);
    const c = config();

    let done = false;
    return new Promise(function (resolve) {
      const finish = function (value) { if (!done) { done = true; resolve(value); } };
      // Apps Script can hang; don't let a stalled request wedge a caller.
      setTimeout(function () { finish(null); }, TIMEOUT_MS);

      let url = c.url + '?action=' + encodeURIComponent(opts.action) +
                '&token=' + encodeURIComponent(c.token || '');
      const init = { method: opts.body ? 'POST' : 'GET' };
      if (opts.body) {
        // text/plain keeps this a simple request — no CORS preflight.
        init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        init.body = JSON.stringify(opts.body);
      }

      window.fetch(url, init)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          finish(json && json.status === 'ok' ? json : null);
        })
        .catch(function () { finish(null); });
    });
  }

  return {
    isConfigured: isConfigured,

    // Resolves to an array of snapshots, or null if unreachable. An empty
    // array means "reached the sheet, it holds nothing" — a real answer,
    // and deliberately distinct from null.
    load: function () {
      return request({ action: 'historyAll' }).then(function (json) {
        return json && Array.isArray(json.rows) ? json.rows : null;
      });
    },

    // Resolve true only on confirmed success, so the caller knows whether
    // it still needs to hold the write.
    save: function (snapshot) {
      return request({ action: 'historyPut', body: { snapshot: snapshot } })
        .then(function (json) { return !!json; });
    },

    remove: function (date) {
      return request({ action: 'historyRemove', body: { date: date } })
        .then(function (json) { return !!json; });
    },
  };
})();
