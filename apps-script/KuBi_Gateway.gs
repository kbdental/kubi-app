/**
 * KuBi_Gateway.gs — KuBi reads the clinic's two other apps from here.
 *
 *   Management Suite ──┐
 *                      ├──►  this gateway  ──►  KuBi
 *   Clinical Suite  ───┘
 *
 * WHY A GATEWAY AND NOT A MERGE
 * Both apps are live and used every day. Each keeps its own data, and each
 * fact keeps ONE owner: attendance, staff, tasks and stock belong to the
 * Management Suite; appointments, cases and follow-ups to the Clinical Suite.
 * KuBi only owns the operational day. Nothing in this file writes to either
 * app — it reads, reshapes, and hands KuBi one answer.
 *
 * WHY ON THE SERVER
 * The logins for the other two apps live in Script Properties, here, and
 * never travel inside KuBi.html. So does the Management Suite's PIN list:
 * signing in is checked here and only "yes, this is Priya, a dental
 * assistant" goes back — never a PIN.
 *
 * NOTHING RAW GOES OUT
 * Every row is rebuilt field by field from a fixed list (the shape*_
 * functions below). A column added to either app later — a PIN, a salary, a phone
 * number — does not start leaking to KuBi because nobody listed it here.
 *
 * SETUP — Project Settings → Script Properties (all optional except where said):
 *   MGMT_URL            Management Suite main /exec URL   (default: the clinic's)
 *   MGMT_TOKEN          only if API_TOKEN is set on the Management backend
 *   MGMT_INV_URL        Management Suite inventory /exec   (default: the clinic's)
 *   CLINICAL_URL        Clinical Suite /exec URL           (default: the clinic's)
 *   CLINICAL_PASSWORD   the Clinical Suite staff password — needed only if
 *                       REQUIRE_AUTH is on there
 * Then Deploy → Manage deployments → ✏️ → New version. The URL stays the same.
 */

var GATEWAY_VERSION = 2;

var GATEWAY_DEFAULTS = {
  MGMT_URL: 'https://script.google.com/macros/s/AKfycbxfxWxPM4kk4Fa242Ewj2T9ktPsn3irBZjAxhWHCaEZkA0CG1ULBZED7PZWVD22cyDO/exec',
  MGMT_INV_URL: 'https://script.google.com/macros/s/AKfycbw5XgC4jJWR3W7fdyLFKYYkd3fZyIeL3xbfzfSy3f_nmuOKLhP0rYjwLq_9ttQ8tjxRrA/exec',
  CLINICAL_URL: 'https://script.google.com/macros/s/AKfycby-OX-qvGE2U9Zt3b-_rpFqc5WQxRT5WMn1A030IcQIKXEaso36cMTbJ6c5xiP5O_6Zvg/exec',
};

// How long an answer is reused before asking the other apps again. Short:
// a patient moved to the chair in the Clinical Suite should reach KuBi's
// screen within a minute, not an hour.
var GATEWAY_CACHE_SEC = 45;
var SIGNIN_MAX_TRIES = 5;
var SIGNIN_LOCK_SEC = 60;

// Management Suite designation code → KuBi role. ⚠ Needs the owner's
// sign-off: it decides who sees which screens. Codes with no entry (lab
// technicians, riders, accounts) are not KuBi users; they cannot sign in.
var KUBI_ROLE_FOR = {
  OWN: 'owner_admin', MDD: 'owner_admin',
  CLD: 'lead_dentist', CDS: 'lead_dentist', CLH: 'lead_dentist',
  ASD: 'associate_dentist', DHY: 'associate_dentist',
  LDN: 'lead_dental_assistant', DAS: 'lead_dental_assistant',
  STT: 'sterilization_technician',
  RCP: 'front_desk_receptionist', PTC: 'front_desk_receptionist',
  HSK: 'house_keeping', MNT: 'house_keeping',
  PRM: 'clinic_manager', ADH: 'clinic_manager',
  MIS: 'mis', INO: 'mis',
};

// The same table the Management Suite uses (KBDC_DESIG_CODE), so a
// designation means the same role in both apps.
var DESIG_CODE = {
  'owner': 'OWN', 'proprietor': 'OWN', 'medical director': 'MDD', 'clinical director': 'CLD',
  'chief dental surgeon': 'CDS', 'chief clinical dentist': 'CDS', 'clinic head': 'CLH',
  'associate dentist': 'ASD', 'dentist': 'ASD', 'dental hygienist': 'DHY',
  'lead dental nurse': 'LDN', 'nurse': 'LDN', 'dental assistant': 'DAS',
  'sterilization technician': 'STT', 'steril technician': 'STT',
  'patient coordinator': 'PTC', 'receptionist': 'RCP', 'front office manager': 'RCP', 'front office': 'RCP',
  'house keeping': 'HSK', 'housekeeping staff': 'HSK', 'janitor': 'HSK', 'housekeeping': 'HSK',
  'practice manager': 'PRM', 'mis officer': 'MIS', 'mis': 'MIS', 'inventory officer': 'INO',
  'admin head': 'ADH', 'admin': 'ADH', 'accounts manager': 'ACM', 'accountant': 'ACM',
  'maintenance': 'MNT', 'rider': 'RDR',
};

// Clinical Suite appointment status → KuBi's. Cancelled appointments are
// not part of the day at all.
var STATUS_FOR = {
  'scheduled': 'booked', 'confirmed': 'booked',
  'checked in': 'waiting', 'arrived': 'waiting',
  'in chair': 'in_chair', 'engaged': 'in_chair',
  'completed': 'done', 'checked out': 'done',
  'no show': 'no_show', 'no-show': 'no_show',
};

// ── small helpers ─────────────────────────────────────────────────────
function gwProp_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  return (v && String(v).trim()) || GATEWAY_DEFAULTS[k] || '';
}

/** Same rule as the Management Suite's kbdcNormName, so names match across apps. */
function gwNorm_(n) {
  return String(n == null ? '' : n).toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function gwDesigCode_(designation) {
  var d = gwNorm_(designation).replace(/\./g, '');
  return DESIG_CODE[d] || null;
}

function gwStr_(v) { return v == null ? '' : String(v).trim(); }

function gwNum_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function gwJson_(v, fallback) {
  if (v && typeof v === 'object') return v;
  if (!v) return fallback;
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

function gwDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = gwStr_(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function gwTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  var m = gwStr_(v).match(/(\d{1,2}):(\d{2})/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : '';
}

/** Fetch JSON, and say plainly what went wrong instead of throwing. */
function gwFetch_(url, opts) {
  try {
    var o = opts || {};
    o.muteHttpExceptions = true;
    o.followRedirects = true;
    var res = UrlFetchApp.fetch(url, o);
    var code = res.getResponseCode();
    if (code !== 200) return { error: 'HTTP ' + code };
    try { return { json: JSON.parse(res.getContentText()) }; }
    catch (e) { return { error: 'not JSON — is the URL right?' }; }
  } catch (err) {
    return { error: String(err && err.message || err) };
  }
}

// How long each part is reused. Stock and equipment change slowly and are
// the biggest; appointments and attendance move all morning.
var GW_TTL = { management: 60, inventory: 600, clinical: GATEWAY_CACHE_SEC, followUps: 600, lists: 3600 };

// The cache holds at most 100 KB per entry, and the stock list alone is
// bigger than that. So a value is stored in pieces, with a count.
var GW_PIECE = 30000;               // characters; up to 3 bytes each against a 100 KB limit
function gwBigGet_(key) {
  try {
    var c = CacheService.getScriptCache();
    var n = Number(c.get(key + '#n') || 0);
    if (!n) return null;
    var keys = [];
    for (var i = 0; i < n; i++) keys.push(key + '#' + i);
    var got = c.getAll(keys), s = '';
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; s += got[keys[j]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function gwBigPut_(key, obj, sec) {
  try {
    var s = JSON.stringify(obj), pieces = {}, n = 0;
    for (var i = 0; i < s.length; i += GW_PIECE) pieces[key + '#' + (n++)] = s.slice(i, i + GW_PIECE);
    var c = CacheService.getScriptCache();
    c.putAll(pieces, sec);
    c.put(key + '#n', String(n), sec);          // the count last: a half-written value is never read
  } catch (e) { /* caching is an optimisation, never a failure */ }
}
function gwBigRemove_(key) {
  try { CacheService.getScriptCache().remove(key + '#n'); } catch (e) {}
}

// ── Management Suite ──────────────────────────────────────────────────
// Read-only by construction: the only action sent is getBatch.
function mgmtRead_(url, sheets) {
  if (!url) return { error: 'not configured' };
  var body = { action: 'getBatch', sheets: sheets };
  var tok = gwProp_('MGMT_TOKEN');
  if (tok) body.token = tok;
  var r = gwFetch_(url, { method: 'post', contentType: 'text/plain;charset=utf-8',
                          payload: JSON.stringify(body) });
  if (r.error) return r;
  if (!r.json || r.json.ok !== true) return { error: (r.json && r.json.error) || 'refused' };
  return { data: r.json.data || {} };
}

// ── Clinical Suite ────────────────────────────────────────────────────
// Read-only by construction: only get* actions are ever sent, plus the
// staff login that the Clinical Suite requires before it will answer.
var CLINICAL_READS = { getAppointments: 1, getCaseState: 1, getFollowUps: 1,
                       getDoctorsList: 1, getChairsList: 1 };

function clinicalSession_(forceNew) {
  var cache = CacheService.getScriptCache();
  if (!forceNew) { var t = cache.get('gw_clinical_session'); if (t) return t; }
  var pw = PropertiesService.getScriptProperties().getProperty('CLINICAL_PASSWORD');
  if (!pw) return '';
  var r = gwFetch_(gwProp_('CLINICAL_URL'), { method: 'post', contentType: 'text/plain;charset=utf-8',
                    payload: JSON.stringify({ action: 'staffLogin', password: pw }) });
  if (r.error || !r.json || !r.json.success || !r.json.token) return '';
  // Its sessions last 12 hours; reuse ours for 6 so we never hold a dead one
  // and never mint a fresh session on every request.
  cache.put('gw_clinical_session', r.json.token, 6 * 3600);
  return r.json.token;
}

function clinicalRead_(action, params) {
  if (!CLINICAL_READS[action]) return { error: 'not a read' };
  var url = gwProp_('CLINICAL_URL');
  if (!url) return { error: 'not configured' };
  function ask(token) {
    var q = ['action=' + encodeURIComponent(action)];
    Object.keys(params || {}).forEach(function (k) {
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    });
    if (token) q.push('token=' + encodeURIComponent(token));
    return gwFetch_(url + '?' + q.join('&'), { method: 'get' });
  }
  var r = ask(clinicalSession_(false));
  if (!r.error && r.json && r.json.authRequired) {
    var fresh = clinicalSession_(true);
    if (!fresh) return { error: 'Clinical Suite needs CLINICAL_PASSWORD in Script Properties' };
    r = ask(fresh);
  }
  if (r.error) return r;
  if (!r.json || r.json.success === false) return { error: (r.json && r.json.error) || 'refused' };
  return { json: r.json };
}

// ── shaping: fixed field lists, nothing passed through raw ─────────────

function shapeStaff_(rows, roleEmp) {
  var byName = {};
  (roleEmp || []).forEach(function (e) {
    var n = gwNorm_(e.name);
    if (!n || !e.roleCode) return;
    var list = (byName[n] = byName[n] || []);
    if (list.indexOf(gwStr_(e.roleCode)) === -1) list.push(gwStr_(e.roleCode));
  });
  return (rows || []).filter(function (s) { return gwStr_(s.name); }).map(function (s) {
    var n = gwNorm_(s.name);
    var codes = (byName[n] || []).slice();
    var dc = gwDesigCode_(s.role || s.designation);
    if (dc && codes.indexOf(dc) === -1) codes.push(dc);
    var kubiRole = null;
    for (var i = 0; i < codes.length && !kubiRole; i++) kubiRole = KUBI_ROLE_FOR[codes[i]] || null;
    var status = gwStr_(s.status).toLowerCase();
    return {
      id: gwStr_(s.id) || n,
      name: gwStr_(s.name),
      designation: gwStr_(s.role || s.designation),
      roleCodes: codes,
      role: kubiRole,                      // null: not a KuBi user
      active: !(status === 'inactive' || status === 'left' || status === 'resigned' || status === 'exited'),
    };
  });
}

function shapeAttendance_(rows, date) {
  return (rows || []).filter(function (a) { return gwDate_(a.date) === date && !a.removed; }).map(function (a) {
    var lateMin = gwNum_(a.lateMin);
    return {
      staffId: gwStr_(a.staffId), staffName: gwStr_(a.staffName), date: gwDate_(a.date),
      checkIn: gwTime_(a.checkIn), checkOut: gwTime_(a.checkOut),
      lateMin: lateMin, late: !!(lateMin && lateMin > 0) || !!gwStr_(a.lateTag),
      lateTag: gwStr_(a.lateTag),
    };
  });
}

function shapeLeave_(rows, date) {
  return (rows || []).filter(function (l) {
    var st = gwStr_(l.status).toLowerCase();
    var from = gwDate_(l.from || l.fromDate || l.startDate), to = gwDate_(l.to || l.toDate || l.endDate) || from;
    return st === 'approved' && from && from <= date && date <= to;
  }).map(function (l) {
    return { staffName: gwStr_(l.staffName || l.name || l.employee), type: gwStr_(l.type || l.leaveType) };
  });
}

function shapeTasks_(completions, date) {
  return (completions || []).filter(function (r) {
    return gwDate_(r.date) === date && String(r.removed) !== 'true' && r.removed !== true;
  }).map(function (r) {
    return { roleCode: gwStr_(r.roleCode), taskCode: gwStr_(r.taskCode), task: gwStr_(r.taskEn),
             staffName: gwStr_(r.staffName), time: gwTime_(r.time), frequency: gwStr_(r.frequency) };
  });
}

function shapeInventory_(rows) {
  return (rows || []).filter(function (x) { return gwStr_(x.name); }).map(function (x) {
    var batches = gwJson_(x.batches, []);
    return {
      id: gwStr_(x.id) || (gwNorm_(x.name) + '|' + gwNorm_(x.cat)),
      name: gwStr_(x.name), category: gwStr_(x.cat || x.category),
      qty: gwNum_(x.stock != null && x.stock !== '' ? x.stock : x.qty),
      min: gwNum_(x.reorder), unit: gwStr_(x.uom),
      batches: (Array.isArray(batches) ? batches : []).map(function (b) {
        return { qty: gwNum_(b.qty), expiry: gwDate_(b.expiry) };
      }).filter(function (b) { return b.qty != null || b.expiry; }),
    };
  });
}

// Equipment only (the register also holds hand instruments). Status and
// condition are the Management Suite's: 'Under repair', 'Missing', 'Damaged'.
function shapeEquipment_(rows) {
  return (rows || []).filter(function (x) {
    return gwStr_(x.name) && gwStr_(x.kind) === 'Equipment' && gwStr_(x.status) !== 'Retired';
  }).map(function (x) {
    return { id: gwStr_(x.id), tag: gwStr_(x.tag), name: gwStr_(x.name),
             category: gwStr_(x.cat), room: gwStr_(x.room || x.location),
             status: gwStr_(x.status), condition: gwStr_(x.condition),
             nextService: gwDate_(x.nextService) };
  });
}

// Recent autoclave loads, as the Management Suite judged them: 'Released',
// 'Failed', 'BI pending', 'Test passed'. Voided loads were mistakes.
function shapeLoads_(rows, date) {
  return (rows || []).filter(function (l) {
    var d = gwDate_(l.at || l.date || l.createdAt);
    return d && d >= gwAddDays_(date, -7) && gwStr_(l.result) !== 'Void';
  }).map(function (l) {
    return { id: gwStr_(l.id), date: gwDate_(l.at || l.date || l.createdAt), time: gwTime_(l.at),
             cycle: gwStr_(l.cycle), result: gwStr_(l.result), packExpiry: gwDate_(l.packExpiry),
             items: (gwJson_(l.items, []) || []).length };
  });
}

function gwAddDays_(date, n) {
  var d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function shapeAppointments_(list) {
  return (list || []).map(function (a) {
    var st = STATUS_FOR[gwStr_(a.status).toLowerCase()];
    return { a: a, st: st };
  }).filter(function (x) {
    return gwStr_(x.a.status).toLowerCase() !== 'cancelled';
  }).map(function (x) {
    var a = x.a;
    var chair = gwStr_(a.chair).match(/\d+/);
    // When the status last changed, from the times the Clinical Suite
    // stamps — this is what lets KuBi age a waiting patient honestly.
    var at = a.checkoutTime || a.engagedTime || a.checkinTime || '';
    return {
      id: gwStr_(a.id), date: gwDate_(a.date), time: gwTime_(a.time),
      patient: gwStr_(a.patientName), uhid: gwStr_(a.uhid),
      doctor: gwStr_(a.doctor), chair: chair ? Number(chair[0]) : null,
      treatment: gwStr_(a.procedureName || a.type), procedureType: gwStr_(a.type),
      status: x.st || 'booked', statusRaw: gwStr_(a.status), statusTime: gwTime_(at),
      caseId: gwStr_(a.caseId) || null, visitCounter: gwNum_(a.visitCounter),
    };
  });
}

function shapeCase_(c) {
  return {
    caseId: gwStr_(c.caseId), procedureName: gwStr_(c.procedureName), procedureCode: gwStr_(c.procedureCode),
    caseStatus: gwStr_(c.caseStatus), visitCounter: gwNum_(c.visitCounter),
    currentStageName: gwStr_(c.currentStageName) || null, nextStageName: gwStr_(c.nextStageName) || null,
    stages: (c.stages || []).map(function (s) {
      return { seq: s.sequenceNo, name: gwStr_(s.stageName), status: gwStr_(s.status),
               completedDate: gwDate_(s.completedDate), inAppointment: gwStr_(s.completedInAppointment) };
    }),
  };
}

// ── the feed ──────────────────────────────────────────────────────────
/**
 * Everything KuBi needs for one day, from both apps, in KuBi's shapes.
 * Each source stands alone: one app being down leaves the others working,
 * and `sources` says exactly which answered and which did not — KuBi must
 * be able to say "appointments unavailable" rather than show an empty day.
 */
function gatewayFeed_(date) {
  date = gwDate_(date) || gwDate_(new Date());
  var out = { status: 'ok', date: date, gatewayVersion: GATEWAY_VERSION, sources: {} };

  // Each part is fetched, cached and reported on its own. A slow or broken
  // part never costs the others, and nothing that failed is silently
  // replaced by an empty list: `sources` names every part and whether it
  // answered.
  function part(name, key, sec, build) {
    var cached = gwBigGet_(key);
    var v = cached || build();
    if (v.error) { out.sources[name] = { ok: false, error: v.error }; return; }
    if (!cached) gwBigPut_(key, v, sec);
    out.sources[name] = { ok: true, cached: !!cached };
    Object.keys(v).forEach(function (k) { out[k] = v[k]; });
  }

  part('management', 'gw_m_' + date, GW_TTL.management, function () {
    var m = mgmtRead_(gwProp_('MGMT_URL'),
      ['Staff', 'RoleEmployees', 'Attendance', 'LeaveRequests', 'TaskCompletions']);
    if (m.error) return m;
    return { staff: shapeStaff_(m.data.Staff, m.data.RoleEmployees),
             attendance: shapeAttendance_(m.data.Attendance, date),
             leave: shapeLeave_(m.data.LeaveRequests, date),
             tasksDone: shapeTasks_(m.data.TaskCompletions, date) };
  });

  part('inventory', 'gw_i_' + date, GW_TTL.inventory, function () {
    var inv = mgmtRead_(gwProp_('MGMT_INV_URL'), ['InventoryItems', 'InstrumentRegister', 'SterilisationLoads']);
    if (inv.error) return inv;
    return { inventory: shapeInventory_(inv.data.InventoryItems),
             equipment: shapeEquipment_(inv.data.InstrumentRegister),
             sterilisation: shapeLoads_(inv.data.SterilisationLoads, date) };
  });

  part('clinical', 'gw_c_' + date, GW_TTL.clinical, function () {
    var ap = clinicalRead_('getAppointments', { fromDate: date, toDate: gwAddDays_(date, 7) });
    if (ap.error) return ap;
    var all = shapeAppointments_(ap.json.appointments);
    var v = { appointments: all.filter(function (a) { return a.date === date; }), cases: {}, casesMissing: [] };
    // The week ahead: for "is the next visit booked" and for what stock
    // the coming days will use. Status is irrelevant there.
    v.upcoming = all.filter(function (a) { return a.date > date; }).map(function (a) {
      return { date: a.date, patient: a.patient, procedureType: a.procedureType, caseId: a.caseId };
    });
    // Cases for today's patients only (one call each). A case that could
    // not be read is named rather than quietly left out.
    var seen = {};
    v.appointments.forEach(function (a) {
      if (!a.caseId || seen[a.caseId]) return;
      seen[a.caseId] = true;
      var c = clinicalRead_('getCaseState', { caseId: a.caseId });
      if (c.error) v.casesMissing.push(a.caseId);
      else v.cases[a.caseId] = shapeCase_(c.json);
    });
    return v;
  });

  // The Clinical Suite already works out who is due back. Its three lists
  // map onto KuBi's: post-treatment check-ins are follow-ups, recalls are
  // patients who have not returned, missed are no-shows to rebook. Phone
  // numbers stay in the Clinical Suite.
  part('followUps', 'gw_f_' + date, GW_TTL.followUps, function () {
    var fu = clinicalRead_('getFollowUps', {});
    if (fu.error) return fu;
    return {
      followUps: (fu.json.postTreatment || []).map(function (f) {
        return { id: 'PT|' + gwStr_(f.uhid) + '|' + gwStr_(f.dueDate), uhid: gwStr_(f.uhid),
                 patient: gwStr_(f.name), reason: gwStr_(f.procedure),
                 treatedOn: gwDate_(f.treatmentDate), due: gwDate_(f.dueDate), caseId: null };
      }),
      recall: (fu.json.recall || []).map(function (r) {
        return { uhid: gwStr_(r.uhid), patient: gwStr_(r.name), lastVisit: gwDate_(r.lastVisit),
                 daysSince: gwNum_(r.daysSince) };
      }),
      missed: (fu.json.missed || []).map(function (r) {
        return { uhid: gwStr_(r.uhid), patient: gwStr_(r.name), date: gwDate_(r.date),
                 status: gwStr_(r.status), type: gwStr_(r.type) };
      }),
    };
  });

  part('lists', 'gw_l', GW_TTL.lists, function () {
    var dr = clinicalRead_('getDoctorsList', {});
    if (dr.error) return dr;
    var ch = clinicalRead_('getChairsList', {});
    if (ch.error) return ch;
    return { doctors: (dr.json.doctors || []).map(gwStr_), chairs: (ch.json.chairs || []).map(gwStr_) };
  });

  // A part that failed still leaves its keys present and empty, so KuBi
  // never has to guard every field. `sources` is where it learns why.
  ['staff', 'attendance', 'leave', 'tasksDone', 'inventory', 'equipment', 'sterilisation',
   'appointments', 'upcoming', 'followUps', 'recall', 'missed', 'doctors', 'chairs', 'casesMissing']
    .forEach(function (k) { if (!out[k]) out[k] = []; });
  if (!out.cases) out.cases = {};
  return out;
}

/** Forget every cached part for a date, so the next feed asks the apps again. */
function gatewayForget_(date) {
  ['gw_m_', 'gw_i_', 'gw_c_', 'gw_f_'].forEach(function (p) { gwBigRemove_(p + date); });
  gwBigRemove_('gw_l');
}

// ── sign-in with the Management Suite PIN ──────────────────────────────
/**
 * The same rule as the Management Suite's kbdcRolePin: a person's own PIN
 * for a role first, then the role's PIN. A role with no PIN is locked.
 * Answers who the person is and their KuBi role — never a PIN.
 */
function gatewaySignIn_(name, pin) {
  var who = gwNorm_(name);
  pin = gwStr_(pin);
  if (!who || !/^\d{4}$/.test(pin)) return { status: 'ok', ok: false, reason: 'badInput' };

  var cache = CacheService.getScriptCache();
  var lockKey = 'gw_signin_' + who;
  var tries = Number(cache.get(lockKey) || 0);
  if (tries >= SIGNIN_MAX_TRIES) return { status: 'ok', ok: false, reason: 'locked', waitSec: SIGNIN_LOCK_SEC };

  var m = mgmtRead_(gwProp_('MGMT_URL'), ['Staff', 'RoleEmployees', 'ClinicSettings']);
  if (m.error) return { status: 'ok', ok: false, reason: 'unreachable', error: m.error };

  var person = shapeStaff_(m.data.Staff, m.data.RoleEmployees)
    .filter(function (s) { return gwNorm_(s.name) === who; })[0];
  if (!person || !person.active) return { status: 'ok', ok: false, reason: 'unknown' };

  // The newest rolePins setting wins, as in the Management Suite.
  var pins = {};
  var newest = '';
  (m.data.ClinicSettings || []).forEach(function (r) {
    if (gwStr_(r.key) !== 'rolePins') return;
    var at = gwStr_(r.updatedAt);
    if (at >= newest) { newest = at; pins = gwJson_(r.value, {}) || {}; }
  });
  function valid(p) { p = gwStr_(p); return /^\d{4}$/.test(p) ? p : ''; }

  var matched = person.roleCodes.filter(function (code) {
    var expected = valid(pins[code + '|' + who]) || valid(pins[code]);
    return expected && expected === pin;
  });

  if (!matched.length) {
    cache.put(lockKey, String(tries + 1), SIGNIN_LOCK_SEC);
    return { status: 'ok', ok: false, reason: 'wrongPin' };
  }
  cache.remove(lockKey);
  if (!person.role) return { status: 'ok', ok: false, reason: 'noKubiRole' };
  return { status: 'ok', ok: true, person: { id: person.id, name: person.name,
           designation: person.designation, role: person.role } };
}

/** Called from doGet/doPost in KuBi_History.gs. null = not a gateway action. */
function gatewayRoute_(action, p, body) {
  if (action === 'feed') return gatewayFeed_(p.date);
  // POST only. A PIN in a URL ends up in logs and browser history.
  if (action === 'signIn') return body ? gatewaySignIn_(body.name, body.pin)
                                       : { status: 'error', message: 'signIn must be a POST' };
  return null;
}

/**
 * Run this once from the editor (choose gatewayCheck in the function
 * dropdown, then ▷ Run). It contacts both apps, so Google asks for the
 * "connect to an external service" permission the gateway needs — running
 * setup() does not, because setup never leaves the spreadsheet. Afterwards
 * the Execution log shows, per app, whether it answered and how much came
 * back. Nothing is written anywhere.
 */
function gatewayCheck() {
  // Names only, never values: a property typed as MGMT_Token is a different
  // property, and this is how that shows up.
  var known = { MGMT_URL: 1, MGMT_TOKEN: 1, MGMT_INV_URL: 1, CLINICAL_URL: 1, CLINICAL_PASSWORD: 1 };
  var names = Object.keys(PropertiesService.getScriptProperties().getProperties());
  Logger.log('Script properties: ' + (names.length ? names.map(function (n) {
    return n + (known[n] ? '' : ' (not a name the gateway reads)');
  }).join(', ') : 'none'));
  gatewayForget_(gwDate_(new Date()));
  var f = gatewayFeed_(gwDate_(new Date()));
  Object.keys(f.sources).forEach(function (k) {
    var s = f.sources[k];
    Logger.log(k + ': ' + (s.ok ? 'OK' : 'NOT OK — ' + s.error));
  });
  Logger.log('staff ' + f.staff.length + ', attendance today ' + f.attendance.length +
             ', stock items ' + f.inventory.length + ', equipment ' + f.equipment.length +
             ', appointments today ' + f.appointments.length + ', follow-ups ' + f.followUps.length);
  return f.sources;
}
