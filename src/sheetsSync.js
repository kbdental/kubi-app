// sheetsSync.js â€” the one place that talks to Google Sheets.
//
// KuBi still runs from a local file with no server. This module is the
// only part that reaches the network, and it is entirely optional: leave
// CONFIG blank and the app behaves exactly as it always has, with history
// held in memory for the session.
//
// Transport is a plain fetch to an Apps Script web app, the same shape
// the clinic's other tools use: GET with a query string to read, POST
// with text/plain to write. text/plain matters â€” it keeps the request
// "simple" in CORS terms, so the browser sends it without a preflight,
// which an Apps Script /exec endpoint cannot answer.
//
// Nothing here throws into the app. Every failure resolves to a value the
// caller can act on, because a clinic with no internet must still open.

window.KuBi = window.KuBi || {};

// ---------------------------------------------------------------------
// CONFIG â€” the clinic fills these two in after deploying KuBi_History.gs.
// url:   the web app's /exec URL
// token: the same string set as TOKEN in the script
// Leave both empty to run without any sync at all.
// ---------------------------------------------------------------------
window.KuBi.SHEETS_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfycbxj5wFwoIUKwSMJbBvmlBbgEw5nANW_KmUI6pzf-tOHpfTBxV8sb7QODiyhtT73bryb/exec',
  token: 'kb-b5mdu6-vpa25g-fkxfcf',
};

window.KuBi.historySync = (function () {
  const TIMEOUT_MS = 8000;

  function config() { return window.KuBi.SHEETS_CONFIG || { url: 'https://script.google.com/macros/s/AKfycbxj5wFwoIUKwSMJbBvmlBbgEw5nANW_KmUI6pzf-tOHpfTBxV8sb7QODiyhtT73bryb/exec', token: '' }; }

  function isConfigured() {
    const c = config();
    return !!(c.url && typeof window.fetch === 'function');
  }

  // Resolves to null on any failure â€” never rejects, never throws.
  function request(opts) {
    if (!isConfigured()) return Promise.resolve(null);
    const c = config();

    let done = false;
    return new Promise(function (resolve) {
      const finish = function (value) { if (!done) { done = true; resolve(value); } };
      // Apps Script can hang; don't let a stalled request wedge a caller.
      setTimeout(function () { finish(null); }, TIMEOUT_MS);

      let url = c.url + '?action=' + encodeURIComponent(opts.action) +
                '&token=' + encodeURIComponent(c.token || '') +
                (opts.extra || '');
      const init = { method: opts.body ? 'POST' : 'GET' };
      if (opts.body) {
        // text/plain keeps this a simple request â€” no CORS preflight.
        init.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        init.body = JSON.stringify(opts.body);
      }

      window.fetch(url, init)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          if (json && json.status === 'ok') return finish(json);
          // A conflict is the server answering clearly, not a failure to
          // reach it. Callers that can handle one ask for it.
          if (json && json.status === 'conflict' && opts.allowConflict) return finish(json);
          finish(null);
        })
        .catch(function () { finish(null); });
    });
  }

  return {
    isConfigured: isConfigured,

    // Resolves to an array of snapshots, or null if unreachable. An empty
    // array means "reached the sheet, it holds nothing" â€” a real answer,
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

    // ---- the live operating day ---------------------------------------
    // Same transport, different question: history is "what did past days
    // amount to", this is "what is happening today", so a refresh does not
    // lose the morning.

    // null means UNREACHABLE. Reaching the sheet resolves to
    // { record: <the day> } or { record: null } when nothing is stored yet.
    // The two must stay distinguishable: on the first day of use nothing is
    // stored, and collapsing that into "unreachable" would mean the app
    // never dares to write, so the day would never be saved at all.
    dayLoad: function (date) {
      return request({ action: 'dayGet', extra: '&date=' + encodeURIComponent(date) })
        .then(function (json) {
          if (!json) return null;
          return { record: json.record || null };
        });
    },

    // Resolves true only on confirmed success, so the caller knows whether
    // the day is safely stored or still only in this browser.
    // Three outcomes, and the caller must tell them apart:
    //   { ok: true, rev }        stored
    //   { conflict: true, ... }  somebody wrote first; theirs is returned
    //   { ok: false }            could not be stored at all
    //
    // A bare true/false collapsed "somebody else got there first" into
    // "failed", and a retry would then have overwritten their work.
    daySave: function (date, state, baseRev, by) {
      let payload;
      try {
        payload = JSON.stringify(state);
      } catch (e) {
        return Promise.resolve({ ok: false, reason: 'unserialisable' });
      }
      if (payload.length > window.KuBi.DAY_MAX_CHARS) {
        return Promise.resolve({ ok: false, reason: 'tooBig', chars: payload.length });
      }
      return request({ action: 'dayPut', allowConflict: true,
                       body: { date: date, state: state,
                               baseRev: baseRev === undefined ? null : baseRev,
                               by: by || null } })
        .then(function (json) {
          if (!json) return { ok: false, reason: 'unreachable' };
          if (json.status === 'conflict') {
            return { ok: false, conflict: true, rev: json.rev, record: json.record };
          }
          return { ok: true, rev: json.rev };
        });
    },

    // ---- visits, one small row per case per date ----------------------
    // null means unreachable; an empty array means the tab holds nothing.
    visitsAll: function () {
      return request({ action: 'caseVisitsAll' }).then(function (json) {
        return json && Array.isArray(json.rows) ? json.rows : null;
      });
    },

    visitPut: function (visit) {
      return request({ action: 'caseVisitPut', body: { visit: visit } })
        .then(function (json) { return !!json; });
    },

    /** What copies exist for a date, newest first. */
    dayBackups: function (date) {
      return request({ action: 'dayBackups', extra: '&date=' + encodeURIComponent(date) })
        .then(function (json) { return json ? json.backups || [] : null; });
    },

    /** One copy, by revision. */
    dayBackupGet: function (date, rev) {
      return request({ action: 'dayBackupGet',
                       extra: '&date=' + encodeURIComponent(date) + '&rev=' + encodeURIComponent(rev) })
        .then(function (json) { return json ? json.backup || null : null; });
    },
  };
})();


