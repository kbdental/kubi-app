// clinicFeed.js — the clinic's real data, from the gateway.
//
// KuBi used to run on built-in demo data. Connected, it reads the
// Management Suite (staff, attendance) and the Clinical Suite
// (appointments, follow-ups, patients who have not returned) through
// apps-script/KuBi_Gateway.gs, and the demo data is gone.
//
// CONNECTED OR DEMO
// Connected means the sheet is configured (sheetsSync.isConfigured) — the
// clinic's own KuBi.html. There is no half-way: a connected KuBi never
// falls back to demo data, and never accepts the demo PINs, because the
// demo PINs would open the clinic's real sheet to anybody.
//
// WHAT IS NOT CONNECTED YET, AND IS THEREFORE EMPTY RATHER THAN INVENTED
//   stock           the clinic's items must first be linked to what each
//                   procedure uses; until then there is no stock check
//   lab work        no lab records reach KuBi yet
//   cases           the Clinical Suite's case feature is not in use
//   sterile packs, repairs, equipment faults
//                   KuBi's own records, which start empty and fill as
//                   staff use KuBi — never with demo rows
// An empty list says "nothing known". A demo row says something false.
//
// Kept in memory only — never browser storage (see the build notes).

window.KuBi = window.KuBi || {};

window.KuBi.isConnected = function () {
  return !!(window.KuBi.historySync && window.KuBi.historySync.isConfigured());
};

/** Remove every piece of demo data, so nothing invented can show or raise an alert. */
window.KuBi.clearDemoData = function () {
  const K = window.KuBi;
  K.EMPLOYEES = [];
  K.ATTENDANCE = [];
  K.ATTENDANCE_LAST_SYNCED = null;
  K.APPOINTMENTS_TODAY = [];
  K.FOLLOW_UPS = [];
  K.PATIENT_RECORDS = [];
  K.UPCOMING = [];
  K.CASES = {};
  K.LAB_CASES = {};
  K.MATERIALS = [];
  K.STER_PACKS = [];
  K.REPAIRS_SEED = [];
  K.EQUIPMENT_STATUS_SEED = {};
};

// Before any component reads its starting state: a connected KuBi opens
// empty and fills from the feed, rather than flashing demo patients.
if (window.KuBi.isConnected()) window.KuBi.clearDemoData();

function _feedNorm(n) {
  return String(n == null ? '' : n).toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Put the feed into the places the rest of KuBi already reads. Only a part
 * that answered is applied: a part that failed leaves what was there,
 * which in a connected KuBi is the last real answer or nothing.
 */
window.KuBi.applyFeed = function (feed) {
  const K = window.KuBi;
  if (!feed || !feed.sources) return;
  const src = feed.sources;

  if (src.management && src.management.ok) {
    const people = (feed.staff || []).filter(function (s) { return s.active !== false; });
    K.EMPLOYEES = people.map(function (s) {
      return { id: s.id, name: s.name, role: s.role || null, designation: s.designation || '',
               source: s.source || 'management' };
    });

    // One line per person for today: in, late, on leave, or not in yet.
    // "Absent" is only ever inferred from no check-in — the Management
    // Suite, not KuBi, owns attendance.
    const byId = {}, byName = {}, leaveBy = {};
    (feed.attendance || []).forEach(function (a) {
      if (a.staffId) byId[a.staffId] = a;
      byName[_feedNorm(a.staffName)] = a;
    });
    (feed.leave || []).forEach(function (l) { leaveBy[_feedNorm(l.staffName)] = l; });
    K.ATTENDANCE = people.map(function (s) {
      const a = byId[s.id] || byName[_feedNorm(s.name)];
      const onLeave = leaveBy[_feedNorm(s.name)];
      if (a && a.checkIn) {
        return { empId: s.id, date: feed.date, timeIn: a.checkIn, status: a.late ? 'Late' : 'Present',
                 lateReason: a.late ? (a.lateMin ? a.lateMin + ' min' : (a.lateTag || '')) : '' };
      }
      if (onLeave) return { empId: s.id, date: feed.date, timeIn: '', status: 'Leave', lateReason: onLeave.type || '' };
      return { empId: s.id, date: feed.date, timeIn: '', status: 'Absent', lateReason: '' };
    });
    K.ATTENDANCE_LAST_SYNCED = new Date();
  }

  if (src.clinical && src.clinical.ok) {
    K.UPCOMING = (feed.upcoming || []).map(function (u) {
      return { date: u.date, patient: u.patient, procedureType: u.procedureType, caseId: u.caseId || null };
    });
  }

  if (src.followUps && src.followUps.ok) {
    K.FOLLOW_UPS = (feed.followUps || []).map(function (f) {
      return { id: f.id, patient: f.patient, reason: f.reason, due: f.due, caseId: f.caseId || null };
    });
    // The Clinical Suite's recall list: patients with no visit for 180+
    // days and nothing booked. It does not know whether a plan was ever
    // started, so KuBi does not guess — `started` stays unknown.
    K.PATIENT_RECORDS = (feed.recall || []).map(function (r) {
      return { id: 'R|' + r.uhid, patient: r.patient, lastVisit: r.lastVisit, planned: '', started: null };
    });
  }

  if (src.lists && src.lists.ok && (feed.chairs || []).length) {
    const nums = feed.chairs.map(function (c) {
      const m = String(c).match(/\d+/);
      return m ? Number(m[0]) : null;
    }).filter(function (n) { return n !== null; });
    if (nums.length) K.CHAIRS = nums;
  }
};

/**
 * Today's appointments: the Clinical Suite's list and status, with what
 * only KuBi knows laid on top.
 *
 * Front desk moves patients in the Clinical Suite (checked in → in chair →
 * completed), so that status wins — except for the two things KuBi itself
 * records: a procedure started and not finished is "in treatment", and a
 * visit KuBi has written up is "done".
 *
 * Pure, so it is tested directly.
 */
window.KuBi.mergeFeedAppointments = function (feedAppts, prev, procedureState, closedCases) {
  const today = window.KuBi.operatingDate();
  const before = {};
  (prev || []).forEach(function (a) { before[a.id] = a; });
  return (feedAppts || []).map(function (fa) {
    const local = before[fa.id];
    const proc = (procedureState || {})[fa.id];
    let status = fa.status;
    if ((closedCases || {})[fa.id]) status = 'done';
    else if (proc && proc.startedAt && !proc.completedAt && status !== 'done' && status !== 'no_show') {
      status = 'in_treatment';
    }

    // When the status last changed. The Clinical Suite stamps check-in,
    // in-chair and checkout times; that is the truth about how long
    // somebody has waited. Without one, a status that has not changed
    // keeps the time KuBi already had.
    let statusAt = null;
    if (fa.statusTime && status === fa.status) statusAt = new Date(today + 'T' + fa.statusTime + ':00');
    else if (local && local.status === status && local.statusAt) statusAt = local.statusAt;
    else if (status !== 'booked') statusAt = new Date();

    return {
      id: fa.id, source: 'clinical', uhid: fa.uhid || null,
      patient: fa.patient, isNew: false, time: fa.time, chair: fa.chair, doctor: fa.doctor,
      treatment: fa.treatment, procedureType: fa.procedureType,
      status: status, statusAt: statusAt, caseId: fa.caseId || null,
    };
  });
};

// ---- the store --------------------------------------------------------
window.KuBi.clinicFeed = (function () {
  let data = null;
  let status = 'off';            // off | loading | ok | partial | down
  let at = null;                 // when the last answer arrived
  let listeners = [];
  let inFlight = false;
  let timer = null;

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } });
  }

  function load() {
    if (!window.KuBi.isConnected() || inFlight) return Promise.resolve(false);
    inFlight = true;
    if (!data) { status = 'loading'; notify(); }
    return window.KuBi.historySync.feed(window.KuBi.operatingDate()).then(function (json) {
      inFlight = false;
      if (!json) {
        // Unreachable. What was already shown stays, and says how old it is.
        status = 'down';
        notify();
        return false;
      }
      data = json;
      at = new Date();
      const s = json.sources || {};
      status = Object.keys(s).every(function (k) { return s[k].ok; }) ? 'ok' : 'partial';
      window.KuBi.applyFeed(json);
      notify();
      return true;
    });
  }

  return {
    load: load,
    start: function (everyMs) {
      if (!window.KuBi.isConnected() || timer) return;
      load();
      timer = setInterval(load, everyMs || 60000);
    },
    stop: function () { if (timer) clearInterval(timer); timer = null; },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    },
    data: function () { return data; },
    state: function () { return { status: status, at: at, sources: data ? data.sources : {} }; },
    // Test seam.
    reset: function () { data = null; status = 'off'; at = null; listeners = []; inFlight = false; this.stop(); },
    _set: function (json) { data = json; at = new Date(); status = 'ok'; window.KuBi.applyFeed(json); notify(); },
  };
})();

/** Sign in through the gateway. Resolves to { ok, person } or { ok: false, reason }. */
window.KuBi.signInConnected = function (name, pin) {
  return window.KuBi.historySync.signIn(name, pin).then(function (res) {
    if (!res) return { ok: false, reason: 'unreachable' };
    return res;
  });
};
