// test-gateway.js — the REAL KuBi_Gateway.gs against fake Management and
// Clinical Suite backends.
//
// The things that matter here are not "does it return data" but the
// promises the gateway makes to the other two apps and to staff:
//   · it never writes to either app
//   · a PIN never leaves it, whatever column the other app adds
//   · one app being down does not take the others with it
//   · signing in follows the Management Suite's own PIN rule exactly

const fs = require('fs');

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (detail ? '   [' + detail + ']' : ''));
}

// ---- Google's services, the smallest believable versions ---------------
const props = {};
const cache = {};
let now = Date.now();
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => (k in props ? props[k] : null),
  setProperty: (k, v) => { props[k] = v; },
}) };
global.CacheService = { getScriptCache: () => ({
  get: k => (cache[k] && cache[k].until > now ? cache[k].v : null),
  put: (k, v, sec) => { cache[k] = { v: v, until: now + (sec || 600) * 1000 }; },
  remove: k => { delete cache[k]; },
}) };
global.Utilities = {
  formatDate(d, tz, fmt) {
    const x = new Date(d);
    const p = n => String(n).padStart(2, '0');
    if (fmt === 'HH:mm') return p(x.getHours()) + ':' + p(x.getMinutes());
    return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
  },
};
global.Session = { getScriptTimeZone: () => 'Asia/Kolkata' };
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => null }) };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.ContentService = { MimeType: { JSON: 'json' },
  createTextOutput(text) { return { _text: text, setMimeType() { return this; } }; } };
global.Logger = { log() {} };

// ---- the two other apps ----------------------------------------------
const TODAY = '2026-09-19';
const MGMT = 'https://mgmt.example/exec', INV = 'https://inv.example/exec', CLIN = 'https://clin.example/exec';
props.MGMT_URL = MGMT; props.MGMT_INV_URL = INV; props.CLINICAL_URL = CLIN;

const mgmtSheets = {
  Staff: [
    { id: 'S1', name: 'Priya Sharma', role: 'Dental Assistant', status: 'Active', salary: '25000', mobile: '9999900001' },
    { id: 'S2', name: 'Nisha Verma', role: 'Receptionist', status: 'Active' },
    { id: 'S3', name: 'Dr. Viveyk Mittel', role: 'Owner', status: 'Active' },
    { id: 'S4', name: 'Raju', role: 'Rider', status: 'Active' },
    { id: 'S5', name: 'Old Staff', role: 'Receptionist', status: 'Left' },
    { id: 'S6', name: 'Suresh Kumar', role: 'Admin', status: 'Active' },
  ],
  // RoleEmployees carries a pin column in the real sheet. It must never
  // reach KuBi.
  RoleEmployees: [
    { roleCode: 'STT', id: 'S6', name: 'Suresh Kumar', pin: '4455', branch: 'Main' },
  ],
  Attendance: [
    { id: 'a1', staffId: 'S1', staffName: 'Priya Sharma', date: TODAY, checkIn: '08:55', checkOut: null, lateMin: 0, locIn: '28.6,77.2' },
    { id: 'a2', staffId: 'S2', staffName: 'Nisha Verma', date: TODAY, checkIn: '09:22', lateMin: 22, lateTag: 'Late' },
    { id: 'a3', staffId: 'S1', staffName: 'Priya Sharma', date: '2026-09-18', checkIn: '08:50' },
  ],
  LeaveRequests: [
    { staffName: 'Kiran Bose', from: '2026-09-18', to: '2026-09-20', status: 'Approved', type: 'Casual' },
    { staffName: 'Someone', from: TODAY, to: TODAY, status: 'Pending', type: 'Casual' },
  ],
  TaskCompletions: [
    { id: 't1', roleCode: 'RCP', staffName: 'Nisha Verma', taskCode: 'RCP-01', taskEn: 'Open reception', date: TODAY, time: '09:30' },
    { id: 't2', roleCode: 'RCP', staffName: 'Nisha Verma', taskCode: 'RCP-02', taskEn: 'Undo me', date: TODAY, time: '09:31', removed: true },
  ],
  ClinicSettings: [
    { key: 'rolePins', value: JSON.stringify({ DAS: '1111', RCP: '2222', OWN: '0000', 'STT|suresh kumar': '3333', STT: '9999' }), updatedAt: '2026-09-17T10:00:00Z' },
    { key: 'rolePins', value: JSON.stringify({ DAS: '7777' }), updatedAt: '2026-09-01T10:00:00Z' },   // older, ignored
  ],
};
const invSheets = {
  InventoryItems: [
    { id: 'i1', name: 'Lignocaine 2%', cat: 'Anaesthetic', stock: '14', reorder: '10', uom: 'cartridge',
      batches: JSON.stringify([{ qty: 8, expiry: '2026-12-01' }, { qty: 6, expiry: '2026-09-01' }]), price: '45' },
    { id: '', name: 'Composite A2', cat: 'Restorative', stock: '3', reorder: '5', uom: 'syringe' },
  ],
  InstrumentRegister: [
    { id: 'e1', tag: 'KBDC/EQ/AC-01', name: 'Autoclave', kind: 'Equipment', cat: 'Sterilisation', status: 'In use', condition: 'Good' },
    { id: 'e2', tag: 'KBDC/EQ/CH-03', name: 'Chair 3', kind: 'Equipment', status: 'Under repair', condition: 'Damaged' },
    { id: 'e3', tag: 'KBDC/DE/MM-01', name: 'Mouth mirror', kind: 'Instrument', status: 'In use' },
    { id: 'e4', tag: 'KBDC/EQ/OLD', name: 'Old compressor', kind: 'Equipment', status: 'Retired' },
  ],
  SterilisationLoads: [
    { id: 'L1', at: TODAY + 'T08:10:00', cycle: '134°C', result: 'Released', packExpiry: '2026-10-19', items: JSON.stringify([{ type: 'set', id: 's1' }, { type: 'set', id: 's2' }]) },
    { id: 'L2', at: TODAY + 'T08:40:00', cycle: '134°C', result: 'Void' },
    { id: 'L3', at: '2026-08-01T08:40:00', cycle: '134°C', result: 'Released' },
  ],
};
const clinical = {
  requireAuth: false, password: 'clinic-pass',
  appointments: [
    { id: 'APT-1', date: TODAY, uhid: 'U1', patientName: 'Arjun Prasad', time: '09:30', type: 'RCT',
      doctor: 'Dr. Manika Mittel', chair: 'Chair 1', mobile: '9876500000', status: 'In Chair',
      engagedTime: '09:41', caseId: 'CASE-1', procedureName: 'Root canal', visitCounter: 2 },
    { id: 'APT-2', date: TODAY, uhid: 'U2', patientName: 'Meera Reddy', time: '10:15', type: 'Crown',
      doctor: 'Dr. Viveyk Mittel', chair: 'Chair 2', status: 'Checked In', checkinTime: '10:05' },
    { id: 'APT-3', date: TODAY, uhid: 'U3', patientName: 'Gone Away', time: '11:00', type: 'Scaling',
      status: 'Cancelled' },
    { id: 'APT-4', date: '2026-09-22', uhid: 'U1', patientName: 'Arjun Prasad', time: '09:30', type: 'RCT',
      status: 'Scheduled', caseId: 'CASE-1' },
  ],
  cases: { 'CASE-1': { success: true, caseId: 'CASE-1', procedureName: 'Root canal', caseStatus: 'Open',
    visitCounter: 2, currentStageName: 'Cleaning / medication', nextStageName: 'Obturation',
    stages: [{ sequenceNo: 1, stageName: 'Cleaning', status: 'completed', completedDate: '2026-09-12T05:00:00Z', completedInAppointment: 'APT-0' },
             { sequenceNo: 2, stageName: 'Cleaning / medication', status: 'pending' }] } },
};

const sent = [];           // every request the gateway makes, for the read-only proof
let mgmtDown = false;
function reply(obj, code) {
  return { getResponseCode: () => code || 200, getContentText: () => JSON.stringify(obj) };
}
global.UrlFetchApp = { fetch(url, o) {
  const base = url.split('?')[0];
  const q = {};
  (url.split('?')[1] || '').split('&').filter(Boolean).forEach(kv => {
    const [k, v] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  const body = o && o.payload ? JSON.parse(o.payload) : null;
  sent.push({ base, method: (o && o.method) || 'get', q, body });

  if (base === MGMT || base === INV) {
    if (base === MGMT && mgmtDown) return reply({}, 500);
    if (!body || body.action !== 'getBatch') return reply({ ok: false, error: 'unexpected ' + (body && body.action) });
    const src = base === MGMT ? mgmtSheets : invSheets;
    const data = {};
    body.sheets.forEach(s => { data[s] = src[s] || []; });
    return reply({ ok: true, data });
  }
  if (base === CLIN) {
    const p = body || q;
    if (p.action === 'staffLogin') {
      return reply(p.password === clinical.password ? { success: true, token: 'sess-1' } : { success: false, error: 'Incorrect password' });
    }
    if (clinical.requireAuth && q.token !== 'sess-1') return reply({ success: false, error: 'AUTH_REQUIRED', authRequired: true });
    if (p.action === 'getAppointments') {
      return reply({ success: true, appointments: clinical.appointments.filter(a => a.date >= p.fromDate && a.date <= p.toDate) });
    }
    if (p.action === 'getCaseState') return reply(clinical.cases[p.caseId] || { success: false, error: 'Case not found' });
    if (p.action === 'getFollowUps') return reply({ success: true,
      postTreatment: [{ uhid: 'U9', name: 'Sanjay Bhatt', mobile: '9811100000', procedure: 'Extraction review', treatmentDate: '2026-09-12', dueDate: '2026-09-19', overdueDays: 0 }],
      recall: [{ uhid: 'U8', name: 'Leela Menon', mobile: '9811100001', lastVisit: '2026-01-02', daysSince: 260 }],
      missed: [{ uhid: 'U7', name: 'Rohan Gupta', mobile: '9811100002', date: '2026-09-17', status: 'No Show', type: 'Consultation' }] });
    if (p.action === 'getDoctorsList') return reply({ success: true, doctors: ['Dr. Viveyk Mittel', 'Dr. Manika Mittel'] });
    if (p.action === 'getChairsList') return reply({ success: true, chairs: ['Chair 1', 'Chair 2', 'Chair 3', 'Chair 4'] });
    return reply({ success: false, error: 'unknown action' });
  }
  throw new Error('unexpected host ' + base);
} };

// ---- load the real scripts, both of them, as one Apps Script project --
(0, eval)(fs.readFileSync('apps-script/KuBi_History.gs', 'utf8'));
(0, eval)(fs.readFileSync('apps-script/KuBi_Gateway.gs', 'utf8'));

const out = res => JSON.parse(res._text);
const get = (action, params) => out(doGet({ parameter: Object.assign({ action, token: TOKEN }, params || {}) }));
const post = (action, body) => out(doPost({ parameter: { action, token: TOKEN },
                                            postData: { contents: JSON.stringify(body) } }));

// ---- ping --------------------------------------------------------------
check('ping says the gateway is in the project', get('ping').gateway === GATEWAY_VERSION, 'gateway ' + get('ping').gateway);
check('the gateway refuses a wrong token',
      out(doGet({ parameter: { action: 'feed', token: 'nope' } })).status === 'error');

// ---- the feed ----------------------------------------------------------
const feed = get('feed', { date: TODAY });
check('the feed answers', feed.status === 'ok' && feed.date === TODAY);
check('every source reports whether it answered',
      feed.sources.management.ok && feed.sources.inventory.ok && feed.sources.clinical.ok);

// Staff
const priya = feed.staff.find(s => s.name === 'Priya Sharma');
check('a designation becomes a KuBi role', priya && priya.role === 'lead_dental_assistant', priya && priya.role);
const suresh = feed.staff.find(s => s.name === 'Suresh Kumar');
check('a role assignment counts as well as the designation',
      suresh && suresh.roleCodes.indexOf('STT') !== -1 && suresh.role === 'sterilization_technician',
      suresh && suresh.roleCodes.join(','));
check('staff who are not KuBi users have no KuBi role',
      feed.staff.find(s => s.name === 'Raju').role === null);
check('people who have left are marked inactive',
      feed.staff.find(s => s.name === 'Old Staff').active === false);

// Nothing sensitive leaves
const wire = JSON.stringify(feed);
check('no PIN appears anywhere in the feed',
      !/"pin"/i.test(wire) && ['4455', '3333', '1111', '2222', '9999'].every(p => wire.indexOf(p) === -1));
check('a column KuBi never asked for does not leak (salary, staff mobile)',
      wire.indexOf('25000') === -1 && wire.indexOf('9999900001') === -1);
check('patient phone numbers stay in the Clinical Suite',
      ['9876500000', '9811100000', '9811100001', '9811100002'].every(p => wire.indexOf(p) === -1));
check('check-in location stays in the Management Suite', wire.indexOf('28.6,77.2') === -1);

// Attendance, leave, tasks
check('attendance is today only', feed.attendance.length === 2 && feed.attendance.every(a => a.date === TODAY));
check('late is carried with its minutes',
      feed.attendance.find(a => a.staffName === 'Nisha Verma').late === true &&
      feed.attendance.find(a => a.staffName === 'Nisha Verma').lateMin === 22);
check('approved leave covering today counts; pending does not',
      feed.leave.length === 1 && feed.leave[0].staffName === 'Kiran Bose');
check('ticks done today come across, un-ticks do not',
      feed.tasksDone.length === 1 && feed.tasksDone[0].taskCode === 'RCP-01');

// Stock, equipment, sterilisation
const lig = feed.inventory.find(i => i.name === 'Lignocaine 2%');
check('stock carries quantity, minimum, unit and batches',
      lig && lig.qty === 14 && lig.min === 10 && lig.unit === 'cartridge' && lig.batches.length === 2 &&
      lig.batches[1].expiry === '2026-09-01');
check('an item with no id still gets a stable one', !!feed.inventory.find(i => i.name === 'Composite A2').id);
check('prices stay in the Management Suite', !('price' in lig));
check('equipment is equipment only, and nothing retired',
      feed.equipment.length === 2 && feed.equipment.every(e => e.name !== 'Mouth mirror' && e.name !== 'Old compressor'));
check('a chair under repair says so',
      feed.equipment.find(e => e.name === 'Chair 3').status === 'Under repair');
check('recent sterilisation loads, voided ones excluded',
      feed.sterilisation.length === 1 && feed.sterilisation[0].result === 'Released' && feed.sterilisation[0].items === 2);

// Appointments
const ap1 = feed.appointments.find(a => a.id === 'APT-1');
check('today\'s appointments, cancelled ones left out',
      feed.appointments.length === 2 && !feed.appointments.some(a => a.id === 'APT-3'));
check('Clinical Suite status becomes KuBi status',
      ap1.status === 'in_chair' && feed.appointments.find(a => a.id === 'APT-2').status === 'waiting');
check('the chair is a number KuBi can use', ap1.chair === 1);
check('the time the status changed comes across, so waits age honestly',
      feed.appointments.find(a => a.id === 'APT-2').statusTime === '10:05');
check('the week ahead comes separately, for "is the next visit booked"',
      feed.upcoming.length === 1 && feed.upcoming[0].caseId === 'CASE-1' && feed.upcoming[0].date === '2026-09-22');
check('the case for today\'s patient comes with its stages',
      feed.cases['CASE-1'] && feed.cases['CASE-1'].stages.length === 2 &&
      feed.cases['CASE-1'].stages[0].status === 'completed' && feed.cases['CASE-1'].nextStageName === 'Obturation');

// Follow-ups
check('post-treatment check-ins become follow-ups',
      feed.followUps.length === 1 && feed.followUps[0].patient === 'Sanjay Bhatt' && feed.followUps[0].due === '2026-09-19');
check('recalls and missed appointments come across too',
      feed.recall.length === 1 && feed.missed.length === 1);
check('doctors and chairs come from the Clinical Suite', feed.doctors.length === 2 && feed.chairs.length === 4);

// ---- read-only, proven from what was actually sent --------------------
const mgmtActions = sent.filter(s => s.base === MGMT || s.base === INV).map(s => s.body && s.body.action);
const clinActions = sent.filter(s => s.base === CLIN).map(s => (s.body || s.q).action);
check('the Management Suite is only ever READ',
      mgmtActions.length > 0 && mgmtActions.every(a => a === 'getBatch'), [...new Set(mgmtActions)].join(','));
check('the Clinical Suite is only ever READ',
      clinActions.length > 0 && clinActions.every(a => /^get/.test(a) || a === 'staffLogin'),
      [...new Set(clinActions)].join(','));

// ---- cache ---------------------------------------------------------------
const before = sent.length;
const again = get('feed', { date: TODAY });
check('a second look within the minute does not ask the other apps again',
      again.cached === true && sent.length === before);
now += (GATEWAY_CACHE_SEC + 1) * 1000;
get('feed', { date: TODAY });
check('...but after it, it does', sent.length > before);

// ---- one app down --------------------------------------------------------
Object.keys(cache).forEach(k => delete cache[k]);
mgmtDown = true;
const partial = get('feed', { date: TODAY });
check('Management Suite down: the feed says so, plainly',
      partial.sources.management.ok === false && /500/.test(partial.sources.management.error));
check('...and appointments still come through',
      partial.sources.clinical.ok === true && partial.appointments.length === 2);
check('...and KuBi is not handed an empty staff list as though it were real',
      partial.staff.length === 0 && partial.sources.management.ok === false);
mgmtDown = false;

// ---- Clinical Suite with its login switched on -------------------------
Object.keys(cache).forEach(k => delete cache[k]);
clinical.requireAuth = true;
const noPw = get('feed', { date: TODAY });
check('Clinical login on and no password set: it says what is missing',
      noPw.sources.clinical.ok === false && /CLINICAL_PASSWORD/.test(noPw.sources.clinical.error),
      noPw.sources.clinical.error);
Object.keys(cache).forEach(k => delete cache[k]);
props.CLINICAL_PASSWORD = 'clinic-pass';
const withPw = get('feed', { date: TODAY });
check('with the password, it signs in and reads', withPw.sources.clinical.ok === true && withPw.appointments.length === 2);
const logins = sent.filter(s => s.base === CLIN && s.body && s.body.action === 'staffLogin').length;
Object.keys(cache).forEach(k => { if (k.indexOf('gw_feed_') === 0) delete cache[k]; });
get('feed', { date: TODAY });
check('the session is reused, not a new login every time',
      sent.filter(s => s.base === CLIN && s.body && s.body.action === 'staffLogin').length === logins);
check('the Clinical password is never in a URL',
      sent.every(s => (JSON.stringify(s.q) || '').indexOf('clinic-pass') === -1));
clinical.requireAuth = false;

// ---- sign-in with the Management Suite PIN ------------------------------
Object.keys(cache).forEach(k => delete cache[k]);
const si = (name, pin) => post('signIn', { name, pin });
const okPriya = si('Priya Sharma', '1111');
check('the role PIN signs a person in', okPriya.ok === true && okPriya.person.role === 'lead_dental_assistant',
      JSON.stringify(okPriya));
check('...and the answer carries no PIN', JSON.stringify(okPriya).indexOf('1111') === -1);
check('the newest PIN list wins, an older one does not', si('Priya Sharma', '7777').ok === false);
check('a person\'s own PIN works', si('Suresh Kumar', '3333').ok === true);
check('...and once someone has their own PIN, the role PIN no longer works for them',
      si('Suresh Kumar', '9999').ok === false);
check('names match however they are typed', si('  priya   SHARMA ', '1111').ok === true);
check('a wrong PIN is refused', si('Nisha Verma', '1234').reason === 'wrongPin');
check('someone who has left cannot sign in', si('Old Staff', '2222').reason === 'unknown');
check('someone with no KuBi role cannot sign in', si('Raju', '0000').ok === false);
check('a PIN sent in a URL is refused',
      out(doGet({ parameter: { action: 'signIn', token: TOKEN, name: 'Priya Sharma', pin: '1111' } })).status === 'error');
for (let i = 0; i < SIGNIN_MAX_TRIES; i++) si('Nisha Verma', '0001');
check('five wrong tries lock the name for a minute, even for the right PIN',
      si('Nisha Verma', '2222').reason === 'locked');
now += (SIGNIN_LOCK_SEC + 1) * 1000;
check('...and it unlocks after', si('Nisha Verma', '2222').ok === true);

// ---- the editor check the owner runs once ------------------------------
Object.keys(cache).forEach(k => delete cache[k]);
const logged = [];
global.Logger = { log: m => logged.push(String(m)) };
const chk = gatewayCheck();
check('gatewayCheck contacts all three sources and logs each',
      chk.management.ok && chk.inventory.ok && chk.clinical.ok &&
      logged.some(l => /^management: OK/.test(l)) && logged.some(l => /appointments today 2/.test(l)),
      logged.join(' | '));
check('...and logs no names, PINs or phone numbers',
      !logged.some(l => /Priya|Arjun|1111|98765/.test(l)));

// ---- summary --------------------------------------------------------------
const failed = results.filter(r => !r.pass);
console.log('\n================================');
console.log('GATEWAY: ' + (results.length - failed.length) + '/' + results.length + ' passed');
if (failed.length) {
  console.log('\nFAILURES:');
  failed.forEach(f => console.log('  - ' + f.label));
  process.exit(1);
}
