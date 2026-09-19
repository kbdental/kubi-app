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
 * 3. TOKEN below must match SHEETS_CONFIG.token in src/sheetsSync.js.
 *    An EMPTY token means no check at all: the deployment has to be
 *    "Anyone" for a clinic PC to reach it, so with no token whoever has
 *    the URL can read and write the clinic's day, patient names included.
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

var TOKEN = 'kb-b5mdu6-vpa25g-fkxfcf';   // must match SHEETS_CONFIG.token in KuBi

// Bumped whenever this file changes in a way a deployment must pick up.
// `ping` reports it, so "is the new version actually live" is answerable
// without writing anything to the sheet.
var SCRIPT_VERSION = 5;
var SHEET_NAME = 'KuBi History';   // one row per finished day
var DAY_SHEET_NAME = 'KuBi Day';   // the day in progress, so a refresh loses nothing
var BACKUP_SHEET_NAME = 'KuBi Day Backup';   // periodic copies, so a day can be wound back
var VISIT_SHEET_NAME = 'KuBi Case Visits';   // one row per case per date, so a case outlives the day

// Column order is the contract with buildSnapshot() in src/history.js.
// Append new fields at the END so existing rows keep their meaning.
var HEADERS = [
  'date', 'closedProperly', 'booked', 'arrived', 'completed', 'noShow',
  'treatmentsFinished', 'casesClosed', 'readinessPct', 'avgWait', 'maxWait',
  'staffPresent', 'staffTotal', 'exceptions', 'docPending', 'updatedAt',
  // Appended, per the rule above. Existing rows keep their meaning and
  // simply have these blank.
  'casesOpen', 'followUpsDue', 'exceptionKinds',
];

// Held as JSON text in one cell: which kinds of exception happened and how
// often. Columns per kind would need a new column every time KuBi learns to
// notice something new.
var JSON_FIELDS = { exceptionKinds: true };

var NUMERIC = {
  casesOpen: true, followUpsDue: true,
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
  ensureHeaders_(sh, HEADERS);
  return sh;
}

/**
 * Make an EXISTING sheet's header row match HEADERS.
 *
 * The tabs are only given headers when they are created, so a sheet made by
 * an older version keeps its old, shorter header row. New columns would then
 * be written into cells whose header is blank — and rowsToObjects_ keys off
 * that header row, so the values would be read back under empty names and
 * lost. A redeploy would have looked like it worked.
 *
 * Only a header row that still matches is extended. If somebody has renamed
 * or reordered a column by hand, this leaves it alone and reports so:
 * guessing would mislabel data already in the sheet.
 */
function ensureHeaders_(sh, headers) {
  var width = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, width).getValues()[0].map(function (v) {
    return String(v == null ? '' : v).trim();
  });
  for (var i = 0; i < Math.min(have.length, headers.length); i++) {
    if (have[i] && have[i] !== headers[i]) return false;   // diverged: hands off
  }
  if (width >= headers.length) return true;
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return true;
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
      else if (JSON_FIELDS[key]) {
        try { val = val ? JSON.parse(val) : {}; } catch (e) { val = {}; }
      }
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
    if (v === undefined || v === null) return '';
    if (JSON_FIELDS[h]) return JSON.stringify(v);
    return v;
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
// `rev` makes a write checkable: a client sends the revision it last read,
// and a write built on a stale copy is REFUSED rather than silently winning.
// `prevState` keeps the version before the last write, so one bad save does
// not leave the day with no earlier copy to fall back to.
var DAY_HEADERS = ['date', 'state', 'updatedAt', 'rev', 'prevState', 'updatedBy'];

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
  ensureHeaders_(sh, DAY_HEADERS);
  return sh;
}

function dayGet_(date) {
  if (!date) return { status: 'error', message: 'date required' };
  var sh = daySheet_();
  var at = findRow_(sh, String(date));
  if (!at) return { status: 'ok', record: null };
  var row = sh.getRange(at, 1, 1, DAY_HEADERS.length).getValues()[0];
  var state;
  try {
    state = JSON.parse(row[1]);
  } catch (e) {
    // A corrupt row must not take the clinic down. Fall back to the copy
    // from before the last write rather than reporting nothing at all —
    // an older day is worth much more than no day.
    try {
      state = JSON.parse(row[4]);
      return { status: 'ok', recovered: true,
               record: { date: dateKey_(row[0]), state: state, rev: Number(row[3]) || 0 } };
    } catch (e2) {
      return { status: 'ok', record: null };
    }
  }
  return { status: 'ok',
           record: { date: dateKey_(row[0]), state: state, rev: Number(row[3]) || 0,
                     updatedAt: row[2] || null, updatedBy: row[5] || null } };
}

/**
 * Store the day, but only if the caller was working from the current
 * revision. Otherwise somebody else has written since they read, and
 * overwriting would throw their work away — so the current record is handed
 * back for the caller to merge and try again.
 *
 * baseRev of null means "I have not read this day", which is only allowed
 * when no row exists yet.
 */
function dayPut_(date, state, baseRev, by) {
  if (!date) return { status: 'error', message: 'date required' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { status: 'error', message: 'busy' }; }
  try {
    var sh = daySheet_();
    var at = findRow_(sh, String(date));

    if (!at) {
      sh.appendRow([String(date), JSON.stringify(state), new Date(), 1, '', by || '']);
      backupTake_(date, 1, state, by);
      return { status: 'ok', date: date, rev: 1, replaced: false };
    }

    var existing = sh.getRange(at, 1, 1, DAY_HEADERS.length).getValues()[0];
    var currentRev = Number(existing[3]) || 0;

    if (baseRev === null || baseRev === undefined || Number(baseRev) !== currentRev) {
      var theirs = null;
      try { theirs = JSON.parse(existing[1]); } catch (e) { theirs = null; }
      return { status: 'conflict', date: date, rev: currentRev,
               record: { date: date, state: theirs, rev: currentRev },
               message: 'the day has changed since you read it' };
    }

    sh.getRange(at, 1, 1, DAY_HEADERS.length).setValues([[
      String(date), JSON.stringify(state), new Date(), currentRev + 1,
      existing[1],                    // the copy this write replaces
      by || '',
    ]]);
    var tookCopy = backupTake_(date, currentRev + 1, state, by);
    return { status: 'ok', date: date, rev: currentRev + 1, replaced: true, backedUp: tookCopy };
  } finally {
    lock.releaseLock();
  }
}

// ── backups ──────────────────────────────────────────────────────────
// prevState recovers the ONE copy before the last write, which handles a
// corrupt cell. It does not let anybody wind a day back to how it stood at
// eleven o'clock. These rows do: a copy every so often, append-only, never
// overwritten.
//
// Not one per save — the app saves a couple of seconds after every tick,
// which would be hundreds of rows a day and nothing anybody could read.
var BACKUP_HEADERS = ['date', 'rev', 'savedAt', 'savedBy', 'state'];
var BACKUP_EVERY_MIN = 10;
var BACKUP_KEEP = 40;              // per date, oldest dropped beyond this

function backupSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BACKUP_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(BACKUP_SHEET_NAME);
    sh.appendRow(BACKUP_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('E:E').setNumberFormat('@');
  }
  ensureHeaders_(sh, BACKUP_HEADERS);
  return sh;
}

/** Rows for one date, oldest first, as [rowNumber, date, rev, savedAt, savedBy]. */
function backupRowsFor_(sh, date) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, BACKUP_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (dateKey_(values[i][0]) === date) out.push({ row: i + 2, v: values[i] });
  }
  return out;
}

function backupTake_(date, rev, state, by) {
  var sh = backupSheet_();
  var mine = backupRowsFor_(sh, date);

  // Only every so often. A day does not need a copy every two seconds.
  if (mine.length) {
    var lastAt = new Date(mine[mine.length - 1].v[2]).getTime();
    if (!isNaN(lastAt) && (Date.now() - lastAt) < BACKUP_EVERY_MIN * 60 * 1000) return false;
  }

  sh.appendRow([String(date), rev, new Date(), by || '', JSON.stringify(state)]);

  // Keep the most recent, drop the oldest. Deleting from the bottom up so
  // the row numbers underneath do not shift as we go.
  mine = backupRowsFor_(sh, date);
  if (mine.length > BACKUP_KEEP) {
    var excess = mine.slice(0, mine.length - BACKUP_KEEP);
    for (var k = excess.length - 1; k >= 0; k--) sh.deleteRow(excess[k].row);
  }
  return true;
}

/** What copies exist for a date — without the states, which are large. */
function dayBackups_(date) {
  if (!date) return { status: 'error', message: 'date required' };
  var rows = backupRowsFor_(backupSheet_(), String(date));
  return { status: 'ok', date: date, backups: rows.map(function (r) {
    return { rev: Number(r.v[1]) || 0, savedAt: r.v[2], savedBy: r.v[3] };
  }).reverse() };                                   // newest first
}

/** One copy, by revision. */
function dayBackupGet_(date, rev) {
  if (!date) return { status: 'error', message: 'date required' };
  var rows = backupRowsFor_(backupSheet_(), String(date));
  var want = rows.filter(function (r) { return String(r.v[1]) === String(rev); });
  var pick = want.length ? want[want.length - 1] : rows[rows.length - 1];
  if (!pick) return { status: 'ok', backup: null };
  var state;
  try { state = JSON.parse(pick.v[4]); } catch (e) { return { status: 'ok', backup: null }; }
  return { status: 'ok', backup: { date: date, rev: Number(pick.v[1]) || 0,
                                   savedAt: pick.v[2], savedBy: pick.v[3], state: state } };
}

// ── case visits ──────────────────────────────────────────────────────
// The day row is per date, so at midnight a case loses sight of what
// happened to it. These rows keep it: one per case per date, upserted as
// the day goes on, read back so Visit 1 → 2 → 3 survives the night.
//
// No patient names and no clinical detail — the case id joins back to the
// case. Only what KuBi needs to know the visit happened and how it ended.
var VISIT_HEADERS = ['key', 'caseId', 'date', 'stage', 'apptId', 'doctor', 'attended',
                     'startedAt', 'completedAt', 'documentedAt', 'documentedBy', 'updatedAt'];

function visitSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(VISIT_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(VISIT_SHEET_NAME);
    sh.appendRow(VISIT_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:C').setNumberFormat('@');
    sh.getRange('H:J').setNumberFormat('@');   // ISO times stay text, not reformatted
  }
  ensureHeaders_(sh, VISIT_HEADERS);
  return sh;
}

function visitRowOf_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) if (String(col[i][0]) === key) return i + 2;
  return 0;
}

function caseVisitsAll_() {
  var sh = visitSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { status: 'ok', rows: [] };
  var values = sh.getRange(2, 1, last - 1, VISIT_HEADERS.length).getValues();
  var rows = [];
  values.forEach(function (v) {
    if (!v[0]) return;
    var o = {};
    VISIT_HEADERS.forEach(function (h, i) {
      var val = v[i];
      if (h === 'date') val = dateKey_(val);
      else if (h === 'attended') val = (val === true || String(val).toLowerCase() === 'true');
      else if (val === '' || val === undefined) val = null;
      else if (val instanceof Date) val = val.toISOString();
      o[h] = val;
    });
    if (o.updatedAt !== undefined) delete o.updatedAt;   // the sheet's, not the visit's
    rows.push(o);
  });
  return { status: 'ok', rows: rows };
}

/** Upsert by key (caseId|date). The same visit told twice is one row. */
function caseVisitPut_(v) {
  if (!v || !v.caseId || !v.date) return { status: 'error', message: 'visit needs caseId and date' };
  var key = String(v.caseId) + '|' + String(v.date);
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { status: 'error', message: 'busy' }; }
  try {
    var sh = visitSheet_();
    var row = VISIT_HEADERS.map(function (h) {
      if (h === 'key') return key;
      if (h === 'updatedAt') return new Date();
      if (h === 'attended') return v.attended === true;
      var x = v[h];
      return (x === undefined || x === null) ? '' : String(x);
    });
    var at = visitRowOf_(sh, key);
    if (at) sh.getRange(at, 1, 1, VISIT_HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return { status: 'ok', key: key, replaced: !!at };
  } finally {
    lock.releaseLock();
  }
}

// ── entry points ─────────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'ping') return jsonOut_({ status: 'ok', app: 'KuBi History',
                                               version: SCRIPT_VERSION, headers: HEADERS.length });
    if (!authed_(p.token)) return jsonOut_({ status: 'error', message: 'unauthorized' });
    if (p.action === 'historyAll') return jsonOut_(historyAll_());
    if (p.action === 'dayGet') return jsonOut_(dayGet_(p.date));
    if (p.action === 'dayBackups') return jsonOut_(dayBackups_(p.date));
    if (p.action === 'dayBackupGet') return jsonOut_(dayBackupGet_(p.date, p.rev));
    if (p.action === 'caseVisitsAll') return jsonOut_(caseVisitsAll_());
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
    if (p.action === 'dayPut') return jsonOut_(dayPut_(body.date, body.state, body.baseRev, body.by));
    if (p.action === 'caseVisitPut') return jsonOut_(caseVisitPut_(body.visit));
    return jsonOut_({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  }
}

/** Run once from the editor to create the sheet and confirm access. */
function setup() {
  sheet_();
  daySheet_();
  backupSheet_();
  visitSheet_();
  Logger.log('Ready. Days on file: ' + historyAll_().rows.length);
}
