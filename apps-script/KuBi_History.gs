/**
 * KuBi_History.gs — permanent home for KuBi's daily snapshots.
 *
 * One row per clinic day, keyed by date. KuBi writes a row when the day
 * closes (and a provisional one if a day is never formally closed); MIS
 * reads them all back to build 7-day and 30-day trends.
 *
 * ── Deploy ───────────────────────────────────────────────────────────
 * 1. Open the Google Sheet that should hold the history.
 * 2. Extensions > Apps Script, paste this file in, and save.
 * 3. Set TOKEN below to a private string of your choosing.
 * 4. Deploy > New deployment > Web app.
 *       Execute as:       Me
 *       Who has access:   Anyone
 *    "Anyone" is what lets KuBi.html reach it from a clinic computer.
 *    The TOKEN is what keeps it private, so do not leave TOKEN empty.
 * 5. Copy the /exec URL.
 * 6. In KuBi, put the URL and the token into SHEETS_CONFIG at the top of
 *    src/sheetsSync.js, then npm run build.
 *
 * Re-deploy as a NEW VERSION after any edit here, or the change will not
 * be live at the same URL.
 */

var TOKEN = '';                    // must match SHEETS_CONFIG.token in KuBi
var SHEET_NAME = 'KuBi History';   // one row per finished day
var DAY_SHEET_NAME = 'KuBi Day';   // the day in progress, so a refresh loses nothing

// Column order is the contract with buildSnapshot() in src/history.js.
// Append new fields at the END so existing rows keep their meaning.
var HEADERS = [
  'date', 'closedProperly', 'booked', 'arrived', 'completed', 'noShow',
  'treatmentsFinished', 'casesClosed', 'readinessPct', 'avgWait', 'maxWait',
  'staffPresent', 'staffTotal', 'exceptions', 'docPending', 'updatedAt',
];

var NUMERIC = {
  booked: true, arrived: true, completed: true, noShow: true,
  treatmentsFinished: true, casesClosed: true, readinessPct: true,
  avgWait: true, maxWait: true, staffPresent: true, staffTotal: true,
  exceptions: true, docPending: true,
};

// ── plumbing ─────────────────────────────────────────────────────────
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function authed_(tok) { return TOKEN === '' || String(tok || '') === TOKEN; }

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    // Dates are ids here, not calendar values — keep Sheets from
    // reformatting '2026-08-26' into something else on the way in.
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}

/** 'YYYY-MM-DD' whatever the cell hands back. */
function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').trim();
}

function rowsToObjects_(values) {
  var head = values[0] || [];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!dateKey_(row[0])) continue;
    var obj = {};
    for (var c = 0; c < head.length; c++) {
      var key = String(head[c]);
      var val = row[c];
      if (key === 'date') val = dateKey_(val);
      else if (key === 'closedProperly') val = (val === true || String(val).toLowerCase() === 'true');
      else if (NUMERIC[key]) val = (val === '' || val === null) ? null : Number(val);
      obj[key] = val;
    }
    out.push(obj);
  }
  return out;
}

function snapshotToRow_(snap) {
  return HEADERS.map(function (h) {
    if (h === 'updatedAt') return new Date();
    var v = snap[h];
    return (v === undefined || v === null) ? '' : v;
  });
}

/** Row number for a date, or 0. */
function findRow_(sh, date) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (dateKey_(col[i][0]) === date) return i + 2;
  }
  return 0;
}

// ── operations ───────────────────────────────────────────────────────
function historyAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return { status: 'ok', rows: [] };
  var values = sh.getRange(1, 1, last, HEADERS.length).getValues();
  return { status: 'ok', rows: rowsToObjects_(values) };
}

/** Upsert by date. Two staff closing at once must not double-write. */
function historyPut_(snap) {
  if (!snap || !snap.date) return { status: 'error', message: 'snapshot needs a date' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { status: 'error', message: 'busy' }; }
  try {
    var sh = sheet_();
    var row = snapshotToRow_(snap);
    var at = findRow_(sh, String(snap.date));
    if (at) sh.getRange(at, 1, 1, HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return { status: 'ok', date: snap.date, replaced: !!at };
  } finally {
    lock.releaseLock();
  }
}

function historyRemove_(date) {
  if (!date) return { status: 'error', message: 'date required' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { status: 'error', message: 'busy' }; }
  try {
    var sh = sheet_();
    var at = findRow_(sh, String(date));
    if (at) sh.deleteRow(at);
    return { status: 'ok', date: date, removed: !!at };
  } finally {
    lock.releaseLock();
  }
}

// ── the live operating day ───────────────────────────────────────────
// One row per date holding the day as JSON. History answers "what did that
// day amount to"; this answers "what is happening today", so a browser
// refresh at three in the afternoon does not lose the morning.
var DAY_HEADERS = ['date', 'state', 'updatedAt'];

function daySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DAY_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(DAY_SHEET_NAME);
    sh.appendRow(DAY_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('B:B').setNumberFormat('@');   // JSON is text, never a formula
  }
  return sh;
}

function dayGet_(date) {
  if (!date) return { status: 'error', message: 'date required' };
  var sh = daySheet_();
  var at = findRow_(sh, String(date));
  if (!at) return { status: 'ok', record: null };
  var raw = sh.getRange(at, 2).getValue();
  var state;
  try {
    state = JSON.parse(raw);
  } catch (e) {
    // A corrupt row must not take the clinic down: report nothing stored.
    return { status: 'ok', record: null };
  }
  return { status: 'ok', record: { date: dateKey_(sh.getRange(at, 1).getValue()), state: state } };
}

function dayPut_(date, state) {
  if (!date) return { status: 'error', message: 'date required' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { status: 'error', message: 'busy' }; }
  try {
    var sh = daySheet_();
    var row = [String(date), JSON.stringify(state), new Date()];
    var at = findRow_(sh, String(date));
    if (at) sh.getRange(at, 1, 1, DAY_HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return { status: 'ok', date: date, replaced: !!at };
  } finally {
    lock.releaseLock();
  }
}

// ── entry points ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'ping') return jsonOut_({ status: 'ok', app: 'KuBi History', version: 1 });
    if (!authed_(p.token)) return jsonOut_({ status: 'error', message: 'unauthorized' });
    if (p.action === 'historyAll') return jsonOut_(historyAll_());
    if (p.action === 'dayGet') return jsonOut_(dayGet_(p.date));
    return jsonOut_({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (!authed_(p.token)) return jsonOut_({ status: 'error', message: 'unauthorized' });

    // KuBi posts text/plain to avoid a CORS preflight, so the body is a
    // raw JSON string rather than a parsed form.
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);

    if (p.action === 'historyPut') return jsonOut_(historyPut_(body.snapshot));
    if (p.action === 'historyRemove') return jsonOut_(historyRemove_(body.date));
    if (p.action === 'dayPut') return jsonOut_(dayPut_(body.date, body.state));
    return jsonOut_({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

/** Run once from the editor to create the sheet and confirm access. */
function setup() {
  sheet_();
  daySheet_();
  Logger.log('Ready. Days on file: ' + historyAll_().rows.length);
}
