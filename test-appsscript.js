// test-appsscript.js — exercises the REAL Apps Script against a fake sheet.
//
// The .gs is half of KuBi's persistence and had no tests at all: it was only
// ever verified by deploying it and poking the live endpoint, which cannot
// be done before deployment and cannot be done at all for the cases that
// matter — two terminals racing, a corrupt cell, a stale write.
//
// This runs the actual file, so it tests what will be deployed rather than a
// description of it. Google's services are stubbed with the smallest thing
// that behaves like a spreadsheet.

const fs = require('fs');

// ---- the smallest thing that behaves like a Google Sheet ---------------
function makeSheet(name) {
  const cells = [];                                  // cells[row][col], 0-based
  const at = (r, c) => (cells[r] === undefined ? '' : (cells[r][c] === undefined ? '' : cells[r][c]));
  return {
    name: name,
    _cells: cells,
    getLastRow() { return cells.length; },
    getLastColumn() {
      return cells.reduce((w, row) => Math.max(w, row ? row.length : 0), 0);
    },
    appendRow(values) { cells.push(values.slice()); },
    setFrozenRows() {},
    deleteRow(row) { cells.splice(row - 1, 1); },
    getRange(a, b, c, d) {
      // getRange('A:A') — only used for number formats, which do not matter here
      if (typeof a === 'string') return { setNumberFormat() {}, getValues() { return [[]]; } };
      const r0 = a - 1, c0 = b - 1, rows = c === undefined ? 1 : c, cols = d === undefined ? 1 : d;
      return {
        getValue() { return at(r0, c0); },
        getValues() {
          const out = [];
          for (let r = 0; r < rows; r++) {
            const line = [];
            for (let cc = 0; cc < cols; cc++) line.push(at(r0 + r, c0 + cc));
            out.push(line);
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((line, r) => {
            if (!cells[r0 + r]) cells[r0 + r] = [];
            line.forEach((v, cc) => { cells[r0 + r][c0 + cc] = v; });
          });
        },
        setNumberFormat() {},
      };
    },
  };
}

function installStubs() {
  const sheets = {};
  global.SpreadsheetApp = {
    getActiveSpreadsheet() {
      return {
        getSheetByName(n) { return sheets[n] || null; },
        insertSheet(n) { sheets[n] = makeSheet(n); return sheets[n]; },
      };
    },
    _sheets: sheets,
  };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.Utilities = {
    formatDate(d) { return new Date(d).toISOString().slice(0, 10); },
  };
  global.Session = { getScriptTimeZone: () => 'Asia/Kolkata' };
  global.ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput(text) { return { _text: text, setMimeType() { return this; } }; },
  };
  global.Logger = { log() {} };
  return sheets;
}

const sheets = installStubs();
const src = fs.readFileSync('apps-script/KuBi_History.gs', 'utf8');
(0, eval)(src);                                       // define the .gs in this scope

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (detail ? '   [' + detail + ']' : ''));
}
const out = res => JSON.parse(res._text);
// The deployed script requires the token on every action but `ping`, so the
// harness sends it by default — a test that forgot it would fail as
// "unauthorized" and look like a bug in the script.
const post = (action, body, params) =>
  out(doPost(Object.assign({ parameter: Object.assign({ action, token: TOKEN }, params || {}) },
                           { postData: { contents: JSON.stringify(body) } })));
const get = (action, params) =>
  out(doGet({ parameter: Object.assign({ action, token: TOKEN }, params || {}) }));

// ---- what it should do -------------------------------------------------
const TODAY = '2026-09-02';

check('ping answers without a token', get('ping').status === 'ok');
check('ping reports the version, so a deploy is checkable',
      get('ping').version === SCRIPT_VERSION && get('ping').headers === HEADERS.length,
      'v' + get('ping').version + ', ' + get('ping').headers + ' headers');
check('an action refuses a wrong token',
      get('historyAll', { token: 'definitely-not-the-token' }).status === 'error');

// A day that does not exist yet.
check('an unstored day reads as nothing, not as an error',
      get('dayGet', { date: TODAY }).record === null);

// First write.
const first = post('dayPut', { date: TODAY, state: { ticks: 1 }, baseRev: null, by: 'Nisha Verma' });
check('the first write is accepted and starts at revision 1',
      first.status === 'ok' && first.rev === 1, 'rev ' + first.rev);

const readBack = get('dayGet', { date: TODAY });
check('the day reads back with its revision and who wrote it',
      readBack.record.state.ticks === 1 && readBack.record.rev === 1 &&
      readBack.record.updatedBy === 'Nisha Verma');

// Two terminals.
const termA = post('dayPut', { date: TODAY, state: { ticks: 2, who: 'surgery' }, baseRev: 1, by: 'Priya Sharma' });
check('a write built on the current revision is accepted',
      termA.status === 'ok' && termA.rev === 2);

const termB = post('dayPut', { date: TODAY, state: { ticks: 99, who: 'reception' }, baseRev: 1, by: 'Nisha Verma' });
check('a STALE write is refused rather than winning',
      termB.status === 'conflict', termB.status);
check('...and hands back what is actually stored, to merge with',
      termB.record && termB.record.state.who === 'surgery' && termB.rev === 2,
      'rev ' + termB.rev);
check('...and does not change the stored day',
      get('dayGet', { date: TODAY }).record.state.ticks === 2);

// Retrying on the revision it was given.
const retry = post('dayPut', { date: TODAY, state: { ticks: 101, who: 'merged' }, baseRev: 2, by: 'Nisha Verma' });
check('retrying on the new revision succeeds', retry.status === 'ok' && retry.rev === 3);

// A write with no revision at all must not clobber an existing day.
const blind = post('dayPut', { date: TODAY, state: { ticks: 0 }, baseRev: null, by: 'X' });
check('a write claiming no revision cannot overwrite an existing day',
      blind.status === 'conflict', blind.status);

// The previous copy is kept.
const daySheet = SpreadsheetApp._sheets['KuBi Day'];
const dayRow = daySheet._cells[1];
check('the copy from before the last write is kept',
      typeof dayRow[4] === 'string' && JSON.parse(dayRow[4]).who === 'surgery',
      'prevState holds the version it replaced');

// A corrupt cell falls back to that copy rather than reporting nothing.
daySheet._cells[1][1] = '{ this is not json';
const recovered = get('dayGet', { date: TODAY });
check('a corrupt day recovers from the previous copy',
      recovered.recovered === true && recovered.record.state.who === 'surgery',
      'an older day beats no day');

// ---- history ----
const snap = { date: '2026-09-01', closedProperly: true, booked: 9, exceptions: 3,
               casesOpen: 7, followUpsDue: 2, exceptionKinds: { roomNotReady: 2, labLate: 1 } };
check('a history row stores', post('historyPut', { snapshot: snap }).status === 'ok');
const rows = get('historyAll').rows;
check('numbers come back as numbers', rows[0].booked === 9 && rows[0].casesOpen === 7);
check('exceptionKinds comes back as an object, not text',
      rows[0].exceptionKinds && rows[0].exceptionKinds.roomNotReady === 2,
      JSON.stringify(rows[0].exceptionKinds));
check('a history row can be removed', post('historyRemove', { date: '2026-09-01' }).removed === true &&
      get('historyAll').rows.length === 0);

// ---- the migration that nearly went wrong ----
// A tab created by an older version has a shorter header row. New columns
// must be added to it, or they land under blank headers and are lost on read.
const older = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Older Tab');
older.appendRow(HEADERS.slice(0, HEADERS.length - 3));
const extended = ensureHeaders_(older, HEADERS);
check('an older, shorter header row is extended',
      extended === true && older.getRange(1, 1, 1, HEADERS.length).getValues()[0].join(',') === HEADERS.join(','),
      'all ' + HEADERS.length + ' columns present');

const renamed = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Renamed Tab');
const messed = HEADERS.slice(0, 5); messed[2] = 'somebody renamed this';
renamed.appendRow(messed);
check('a header row somebody has renamed is left alone',
      ensureHeaders_(renamed, HEADERS) === false &&
      renamed.getRange(1, 3, 1, 1).getValue() === 'somebody renamed this',
      'guessing would mislabel data already there');

// ---- backups: winding a day back ----
const B = '2026-09-03';
post('dayPut', { date: B, state: { ticks: 1, note: 'morning' }, baseRev: null, by: 'Ramesh Yadav' });
const firstBackups = get('dayBackups', { date: B }).backups;
check('a copy is taken when a day is first written',
      firstBackups.length === 1 && firstBackups[0].savedBy === 'Ramesh Yadav',
      firstBackups.length + ' copy');

// A second write moments later must NOT take another copy: the app saves a
// couple of seconds after every tick, and one row per tick is unreadable.
post('dayPut', { date: B, state: { ticks: 2, note: 'later' }, baseRev: 1, by: 'Priya Sharma' });
check('copies are periodic, not one per save',
      get('dayBackups', { date: B }).backups.length === 1,
      'still ' + get('dayBackups', { date: B }).backups.length);

// Force the clock back so the next write is eligible.
const bSheet = SpreadsheetApp._sheets[BACKUP_SHEET_NAME];
// Age every existing copy for this date, not just the first row: the check
// looks at the LAST one, and there may be rows for other dates in between.
bSheet._cells.forEach(function (row, idx) {
  if (idx > 0 && String(row[0]) === B) row[2] = new Date(Date.now() - (BACKUP_EVERY_MIN + 1) * 60000);
});
post('dayPut', { date: B, state: { ticks: 3, note: 'much later' }, baseRev: 2, by: 'Nisha Verma' });
const twoBackups = get('dayBackups', { date: B }).backups;
check('a copy is taken once enough time has passed', twoBackups.length === 2, twoBackups.length + ' copies');
check('copies are listed newest first',
      new Date(twoBackups[0].savedAt).getTime() >= new Date(twoBackups[1].savedAt).getTime());

const oldCopy = get('dayBackupGet', { date: B, rev: 1 }).backup;
check('an earlier copy can be fetched by revision',
      oldCopy && oldCopy.state.note === 'morning', oldCopy && oldCopy.state.note);
check('fetching a copy does not change the live day',
      get('dayGet', { date: B }).record.state.note === 'much later');

check('a day with no copies answers cleanly',
      get('dayBackups', { date: '2020-01-01' }).backups.length === 0);
check('asking for a copy that is not there answers cleanly',
      get('dayBackupGet', { date: '2020-01-01', rev: 9 }).backup === null);

// ---- case visits: one row per case per date ----
const V = { caseId: 'AP0311-RCT_MOLAR-01', date: '2026-09-18', stage: 'Cleaning / medication',
            apptId: 'A1', doctor: 'Dr. Ananya Rao', attended: true,
            startedAt: '2026-09-18T04:00:00.000Z', completedAt: '2026-09-18T05:00:00.000Z',
            documentedAt: null, documentedBy: null };
check('the visits tab starts empty', get('caseVisitsAll').rows.length === 0);
const vput = post('caseVisitPut', { visit: V });
check('a visit is stored under caseId|date', vput.status === 'ok' && vput.key === V.caseId + '|' + V.date);
post('caseVisitPut', { visit: Object.assign({}, V, { documentedAt: '2026-09-18T05:30:00.000Z', documentedBy: 'Dr. Ananya Rao' }) });
const vrows = get('caseVisitsAll').rows;
check('the same visit told twice is ONE row, updated',
      vrows.length === 1 && vrows[0].documentedBy === 'Dr. Ananya Rao', vrows.length + ' row(s)');
check('a visit reads back as it was sent',
      vrows[0].caseId === V.caseId && vrows[0].date === V.date && vrows[0].stage === V.stage &&
      vrows[0].attended === true && vrows[0].completedAt === V.completedAt &&
      vrows[0].key === V.caseId + '|' + V.date && vrows[0].startedAt === V.startedAt);
post('caseVisitPut', { visit: Object.assign({}, V, { date: '2026-09-19' }) });
check('another day is another row', get('caseVisitsAll').rows.length === 2);
check('a visit with no case is refused', post('caseVisitPut', { visit: { date: '2026-09-19' } }).status === 'error');
check('the visits tab holds no patient names',
      VISIT_HEADERS.indexOf('patient') === -1 && !('patient' in get('caseVisitsAll').rows[0]));

// ---- summary ----
const failed = results.filter(r => !r.pass);
console.log('\n================================');
console.log('APPS SCRIPT: ' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach(f => console.log('  - ' + f.label));
  process.exit(1);
}
